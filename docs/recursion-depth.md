# Recursion depth

JS stack frames are much larger than native ones, and JS engines don't eliminate tail calls, so a
Lean program compiled to JS runs out of stack far sooner than the same program compiled natively.
This document records how much sooner, why the Node runtime runs programs on a worker with a large
stack, what that costs, and how other languages that compile to JS deal with the same problem.

## How deep programs can recurse

This program recurses once per element of the list, and not in tail position:

```lean
def sum : List Nat → Nat
  | [] => 0
  | x :: xs => x + sum xs

def main : IO Unit := IO.println (sum (List.range n))
```

The largest `n` that it handles, measured on macOS with Node 24.21 and Lean 4.35:

| Where it runs                  | Works      | Overflows                               |
| ------------------------------ | ---------- | --------------------------------------- |
| Node's main thread, by default | 5,000      | 10,000                                  |
| A worker with a 1GB stack      | 1,000,000  | 10,000,000                              |
| Native Lean                    | 10,000,000 | 100,000,000 ("Stack overflow detected") |

Native Lean runs `main` on a thread with a 1GB stack too, on 64-bit platforms, which
`LEAN_STACK_SIZE_KB` overrides, so the last two rows have the same stack, and the difference between
them is the size of a frame. Native Lean has a limit, so Lean programmers already avoid deep
recursion on huge inputs. But nobody writing native Lean expects to run out of stack on a list of
10,000 elements, which is where Node's default stack gives out.

## Where deep recursion comes from

- **Structural recursion on lists.** Pattern matching on `x :: xs` is idiomatic, and lists of
  thousands of elements are common, such as the lines of a file or a `List.range`. The core
  library's own list functions, such as `List.map`, `List.append`, and `List.filter`, are replaced
  with tail-recursive versions by `@[csimp]` lemmas, so they're safe, but user code usually isn't.
- **Structural recursion on data.** Derived instances, such as `Repr` and `BEq`, recurse once per
  level of a recursive type, which for a list-like type is once per element.
- **Mutual tail calls**, as in state machines. Lean's compiler turns only a function's tail calls
  to itself into loops, so each mutual call takes a frame, natively as well. The C compiler doesn't
  turn them into jumps either, even at `-O3`, as a borrowed argument is often decremented after
  the call, which then isn't in tail position.
- **Monadic loops in a user-defined monad, or in code that isn't specialized.** A loop in `IO`, in
  `StateT`, `ReaderT`, or `ExceptT` over `IO`, in a stack of all three, or in `StateM`, whether a
  recursive `partial def` or a `for` or `while` loop, is specialized to a tail call of the function
  to itself, and so becomes a loop, which runs a million iterations on Node's default stack. But in
  a monad that the user defines as a function, such as a parser's, or in a function that is
  polymorphic in its monad and not specialized, each iteration calls the next through a closure,
  and takes a frame, natively as well.
- **Lean's own frontend**, if it is ever compiled to JS, which traverses expressions deeply.

## Why programs run on a worker

On Node, the runtime runs Lean code on a worker with a 1GB stack, which raises the limit from
thousands to about a million. This is what native Lean does, with a thread of the same size.
Untouched stack pages cost nothing, so the size can be generous.

The alternatives are worse:

- **`node --stack-size`** only changes the limit V8 enforces, not the size of the thread's stack,
  which for the main thread is set by the OS, typically at 8MB. Raising it past the real size makes
  deep recursion crash the process instead of throwing a `RangeError`.
- **Running Node again under a larger `ulimit -s`** would raise the real size, but costs a second
  process, and depends on the shell and the OS.
- **Making the compiled code stack-safe** would need every call to go through a trampoline or keep
  its own stack on the heap, which slows down every program to fix a problem that few hit at the
  depths a worker allows.

## What the worker costs

Running on a worker is invisible to most programs, but not at the JS boundary:

- **The program module is evaluated twice.** The compiled program calls `runMain` with its own URL,
  so the main thread imports the whole program, including the JS files it imports for its externs,
  only to start a worker that imports it all again. Top-level side effects in those JS files, such
  as logging or opening a connection, happen on both threads.
- **JS externs run on a worker.** There, `process.env` is a copy of the process's environment,
  `process.chdir` throws, and `process.stdout` is an asynchronous pipe through the main thread.
  Some npm packages, notably native addons that aren't safe to load in workers, don't work at all.
  The runtime works around these for its own externs, but JS externs see a plain worker.
- **Anything that only the main thread can do needs a request to it.** The worker blocks until the
  main thread replies, which is how it changes the current directory and runs child processes.
  Signals are only delivered to the main thread, so `Std.Internal.UV.Signal` will need the same.
- **Debugging and profiling are less direct.** `--inspect` needs a debugger that attaches to the
  worker, and `--cpu-prof` writes a profile for each thread, of which the worker's has the Lean
  code.
- **Starting up takes longer**, as the worker is a second V8 isolate, which costs tens of
  milliseconds and some memory.

Browsers have no way to set a worker's stack size, so there programs run with whatever stack the
browser gives them, as described in [the list of differences](differences.md#recursion-depth-is-lower).

## How other languages that compile to JS deal with it

None of these languages enlarge the stack. Most turn a function's tail calls to itself into loops,
and make their standard libraries avoid deep recursion:

- **PureScript** compiles tail calls of a function to itself into loops, and leaves everything else
  on the JS stack. Stack safety is up to libraries: `MonadRec` and `tailRecM`, from Phil Freeman's
  paper "Stack Safety for Free", `Trampoline` for pure code, `Aff`, which runs on its own
  trampolined interpreter, and `Data.List`, whose functions avoid deep recursion. Recursion through
  `Effect`'s bind isn't stack-safe, as `bindE` runs the rest of the computation inside the call
  that runs the first action, so each bind takes a frame, and a loop of 10,000 overflows. Long loops
  are expected to use `tailRecM` or `forever`, which `Effect`'s `MonadRec` instance runs as a
  `while` loop.
- **Elm** turns tail calls of a function to itself into loops. Its `List.foldr` recurses normally
  up to a fixed depth, and then switches to reversing the list and folding from the left.
- **Scala.js** and **Kotlin/JS** turn tail calls of a function to itself into loops. Scala's
  `@tailrec` makes the compiler check that a call is one. cats-effect's `IO` is trampolined.
- **ClojureScript** makes recursion explicit, with `recur` for loops and `trampoline` for mutual
  recursion.
- **js_of_ocaml** goes further, and runs mutually tail-recursive functions on a trampoline, so that
  mutual tail calls don't grow the stack either. Other recursion uses the JS stack, which caused
  stack overflows when OCaml's `List.map` was not yet tail-recursive.
- **GHCJS** and GHC's JS backend are the exception. Haskell code runs on GHC's own abstract machine,
  whose stack is on the heap, driven by a trampoline, so recursion is only limited by memory, but
  every call pays for that, which is much of why its output is slow.

Unlike these languages' programs, Lean programs are written against the native stack, without
anything like `MonadRec`, so LeanScript can't make up for a small stack in its libraries the way
PureScript and Elm do.

## What we could do

- **Stop evaluating the program module twice.** The compiler could emit a small entry module that
  only starts the worker, and a separate one with the program, which only the worker imports.
- **Run mutual tail calls on a trampoline**, as js_of_ocaml does. Only groups of mutually recursive
  functions would pay for it. Native Lean doesn't eliminate these calls either, so it would go
  beyond native rather than catch up with it, but it would help in browsers, where the stack is
  small. Calls through closures, as in user-defined monads, and recursion on lists would still take
  frames.
- **Allow running on the main thread**, with a compiler option, for programs that are mostly JS
  interop and don't recurse deeply, which would give up blocking requests such as child processes.

Making all compiled code stack-safe, as GHCJS does, would cost too much in every program to be worth
it.
