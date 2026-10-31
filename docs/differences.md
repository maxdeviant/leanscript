# Differences from native Lean

LeanScript aims to run Lean programs exactly as native Lean does. This is the list of known
differences, so that each one is either accepted as a limitation or tracked as something to fix.

Each entry gives its status:

- **Accepted**: inherent to JS or the platform, or not worth the cost of fixing.
- **Open**: could be fixed, with an idea of how where there is one.

Externs that are not implemented yet are not listed here; the coverage page on the site, generated
from `site/data/runtime-coverage.tsv`, tracks those.

## Execution model

### There is only one thread

**Status:** Accepted.

Every task runs to completion when it is created, which is a valid schedule for the C runtime's
thread pool. Task priorities and the `sync` flag are ignored, and `IO.cancel` has no effect, as a
task can only be canceled after it has finished. `IO.getTID` always returns 1.

### Waiting for an unfinished task throws

**Status:** Open.

A task that depends on an `IO.Promise`, a timer, or a JS promise cannot finish until something
resolves it, and nothing else can run while the program waits. So `IO.wait`, `Task.get`,
`IO.waitAny`, and `.block` throw on an unfinished task instead of blocking forever. Programs must use
`Async` or task continuations (`BaseIO.bindTask` and friends) instead.

The mutexes and condition variables are unimplemented for the same reason, and so is anything in
`Std.Sync` that is built on them.

Possible fix: run Lean code on a worker that blocks with `Atomics.wait`, while another thread runs
the event loop that resolves promises. That would need the timers, I/O, and JS interop to work
across threads.

### Programs keep running after `main` returns

**Status:** Accepted.

A native program exits when `main` returns, even with tasks still pending. A LeanScript program
keeps running until the JS event loop is empty, as JS may still call it back, or settle a promise
that one of its tasks waits for. This is what lets an `Async` program started from `main` finish,
but it also means that a repeating timer that is never stopped keeps the program running forever.

Fixtures that rely on this can't run natively, and are marked with a `.no-native` file.

### Initializers can't create promises

**Status:** Accepted.

Like the C runtime, whose task manager only starts after the initializers have run, `IO.Promise.new`
panics in an `initialize` block. This matches native Lean, but is easy to run into.

### Compiling a module runs the initializers it imports

**Status:** Accepted.

When the file being compiled is a module, native Lean only runs the `meta` initializers of what it
imports. LeanScript also runs the non-`meta` ones, as it needs the IR of those modules, and the
import level that loads it also runs them. So their side effects happen at compile time as well as
at run time, and one that calls a JS extern fails the compilation, as both already do for a file
that isn't a module.

## Values

### `USize` and `ISize` are 32 bits wide

**Status:** Accepted.

The runtime targets a 32-bit platform, so that `USize` fits in a JS number, and
`System.Platform.numBits` is 32. Native Lean on a 64-bit machine has 64-bit `USize`, so programs that
depend on its width, or on overflow of it, behave differently. Array sizes and indices are bounded
accordingly.

### Object addresses are made up

**Status:** Accepted.

`ptrAddrUnsafe` returns a stable, distinct number for each object, in allocation order rather than
memory order. Code that only compares addresses for identity works; code that orders by them may
not.

### Maximal sharing doesn't share

**Status:** Accepted.

`ShareCommon.shareCommon'` returns its argument unchanged, which is a valid implementation, as
sharing changes no value. Memory use is higher than native for programs that rely on it.

## Runtime and debugging

### `Runtime.forget` frees its argument

**Status:** Accepted.

The C runtime leaks the value to skip freeing it. LeanScript frees it, which costs little, and keeps
the leak checks in tests meaningful.

### Profiling and stack traces do nothing

**Status:** Open.

`allocprof` and `dbgStackTrace` run their function without reporting anything.

Possible fix: `dbgStackTrace` could print `new Error().stack`.

### Recursion depth is lower

**Status:** Accepted on Node, open in browsers.

JS stack frames are much larger than native ones. On Node, Lean code runs on a worker with a 1GB
stack, which is enough for most programs. In browsers the stack size is up to the browser, so
deeply recursive programs overflow at a depth of thousands, where native Lean manages millions.

Possible fix for browsers: none yet that doesn't change how every function is compiled.

See [recursion depth](recursion-depth.md) for measurements, and the costs of running on a worker.

## Platform

### The platform is neither Windows, macOS, nor Linux

**Status:** Accepted.

`System.Platform.isWindows`, `isOSX`, and `isLinux` are all false, and `System.Platform.target` is
empty, as the compiled program is the same on every platform. Native programs report the platform
they were compiled for.

### The executable and the process title are Node's

**Status:** Accepted.

`IO.appPath` and `Std.Internal.UV.System.exePath` return the Node executable that runs the program,
not the compiled program, and the process title starts out as Node's.

### Environment changes stay inside the program

**Status:** Accepted.

On Node, Lean code runs on a worker, whose `process.env` is a copy of the process's environment.
Lean code, Node's JS APIs, and child processes see the changes that `osSetenv` and `osUnsetenv`
make, but native code in the process doesn't. `osHomedir` reads `$HOME` itself so that it sees
them, as native Lean does.

### Child processes, sockets, and signals need a worker

**Status:** Accepted.

Waiting for a child process, or for its output, blocks, which only a worker can do while the main
thread's event loop runs the child. So a program's `main` can spawn processes, but a library whose
functions are called on the main thread can't: `IO.Process.spawn` throws there.

TCP and UDP sockets live on the main thread for the same reason, as binding and listening must wait
for Node to finish before they return. So `TCP.Socket.new` and `UDP.Socket.new` throw on the main
thread.

Node only delivers signals to the main thread, so signal handlers are installed there, and
`Signal.Waiter.wait` throws on the main thread.

### Child output is read eagerly

**Status:** Accepted.

The main thread reads a child's output as soon as the child writes it, and holds it until the
program reads it. So a child never blocks on a full pipe, where a native one blocks until the
program reads from it. This is what keeps `IO.Process.output` working, as it reads the child's
standard output to the end before its standard error, where native Lean reads both at once.

### Child processes that fail to start have no process ID

**Status:** Accepted.

Natively, a child that can't change to its working directory or execute its command is a real
process, which reports the failure on its standard error and exits with code 255. LeanScript reports
the same, but the child's `pid` is 0, and it has already exited by the time `spawn` returns.

Two native bugs are not reproduced: such a child also writes out a copy of the program's buffered
standard output, and on macOS, a child spawned with `inheritEnv := false` may crash.

### DNS lookups return each address once

**Status:** Accepted.

Native Lean asks `getaddrinfo` for addresses of any socket type, so `DNS.getAddrInfo` returns each
address once per socket type: twice on macOS, and three times on Linux. Node's resolver only asks
for stream sockets, so LeanScript returns each address once, in the same order.

### DNS lookups don't check the service

**Status:** Open.

Native Lean passes the service of `DNS.getAddrInfo` to `getaddrinfo`, which fails with "unknown node
or service" if it's not a port number or a known service name. Node's resolver takes no service, so
LeanScript ignores it.

Possible fix: look up service names in `/etc/services`, as `getaddrinfo` does.

### TCP sockets are only bound when they listen or connect

**Status:** Accepted.

Node can't bind a socket without listening or connecting, so `TCP.Socket.bind` only checks that the
socket is not bound yet, and the socket is bound when it listens or connects. Errors from binding,
such as an address that is not local, are reported there instead. Until then, `getSockName`
returns the address that was given, with port 0 if no port was, where native Lean returns the port
the system picked.

A connecting socket likewise has no address of its own until it has connected, unless it was bound,
so `getSockName` fails with "bad file descriptor" until then.

### Listening TCP sockets take connections right away

**Status:** Accepted.

Node accepts each connection as soon as it arrives, and LeanScript holds it until the program accepts
it. So the backlog given to `TCP.Socket.listen` doesn't limit the connections waiting to be
accepted, where natively the system refuses connections beyond it.

### UDP datagrams are read eagerly

**Status:** Accepted.

Node reads each datagram as soon as it arrives, and LeanScript holds it until the program receives
it. So datagrams are never dropped because the system's receive buffer is full, where natively they
are once the program falls behind, and the datagrams waiting to be received take up memory instead.

### Signal selectors finish right away

**Status:** Open.

`Signal.Waiter.selector` checks whether a signal has been received by starting a task that waits for
it, and checking whether that task has finished. That task finishes as soon as it has started
waiting, not when the signal arrives, so the check is wrong whenever the task finishes in time.
Natively, it runs on another thread and rarely has. In LeanScript, tasks run to completion when they
are created, so it always has, and the selector finishes right away, as if the signal had been
received. Waiting for a signal with `Signal.Waiter.wait` works.

Possible fix: check whether the signal's own task has finished in Lean's `Std.Async.Signal`.

## Browsers

The browser target refuses to compile a program that uses externs that are unavailable there,
unless it is compiled with `--allow-unavailable`, in which case they throw when called. Beyond that:

### There is no file system, environment, or command line

**Status:** Accepted.

`IO.getEnv` returns `none` for every variable, and `main` receives no arguments.

### Standard input is empty, and output goes to the console

**Status:** Accepted.

Standard output and error are logged with `console.log` and `console.error`, a line at a time, so
output without a trailing newline only appears when it is flushed. Reading standard input returns
nothing, and no stream is a terminal.

### There are no exit codes

**Status:** Accepted.

The value that `main` returns, and its uncaught errors, only affect what is written to the console.

### Sleeping only works off the main thread

**Status:** Accepted.

`IO.sleep` and `dbgSleep` block with `Atomics.wait`, which browsers only allow on workers in
cross-origin isolated pages. Programs on the main thread should use `Async` timers instead.
