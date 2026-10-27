import Js

open Std.Async

/-- Calls the JS function `f` with `args`, converting the result to an `α`. -/
def callAs (α : Type) [FromJs α] (f : JsValue) (args : Array JsValue) : IO α := do
  fromJs (← f.call .undefined args)

def program : Async Unit := do
  -- Arguments and results convert, missing arguments are `undefined`, and extra ones are ignored.
  let add ← toJs fun (a b : Nat) => (pure (a + b) : IO Nat)
  IO.println (← callAs Nat add #[.ofNat 2, .ofNat 3])
  IO.println (← callAs Nat add #[.ofNat 2, .ofNat 3, .ofString "extra"])
  let greet ← toJs fun (name : Option String) => (pure s!"Hello, {name.getD "nobody"}!" : IO String)
  IO.println (← callAs String greet #[])
  IO.println (← callAs String greet #[.ofString "world"])

  -- JS APIs call Lean functions.
  let xs ← toJs #[(1 : Nat), 2, 3]
  let doubled ← xs.callMethod "map" #[← toJs fun (x : Nat) => (pure (2 * x) : IO Nat)]
  IO.println (← (fromJs doubled : IO (Array Nat)))

  -- An action converts to a function with no parameters, which runs it each time.
  let counter ← IO.mkRef 0
  let tick ← toJs (do counter.modify (· + 1); counter.get : IO Nat)
  for _ in [0:3] do
    discard <| tick.call .undefined #[]
  IO.println s!"ticked {← counter.get} times"

  -- A captured array is copied, rather than updated in place, as other references may remain.
  let arr := #[1, 2, 3]
  let push ← toJs fun (x : Nat) => (pure (arr.push x).size : IO Nat)
  IO.println (← callAs Nat push #[.ofNat 4], arr.size)

  -- Errors are thrown as JS errors, and argument conversion errors are thrown.
  let fail ← toJs (throw (IO.userError "boom") : IO Unit)
  try
    discard <| fail.call .undefined #[]
  catch e =>
    IO.println s!"caught: {e}"
  try
    discard <| add.call .undefined #[.ofString "two"]
  catch e =>
    IO.println s!"caught: {e}"

  -- A callback from the event loop.
  let done ← IO.Promise.new
  let callback ← toJs (do IO.println "timer fired"; done.resolve () : IO Unit)
  discard <| (← JsValue.getGlobal "setTimeout").call .undefined #[callback, .ofFloat 5]
  MonadAwait.await (IO.Promise.result! done)

  -- An `async` function returns a promise.
  let later ← toJs fun (x : Nat) => (do
    let v ← JsValue.await (← JsValue.ofAsync (pure (x + 1) : Async Nat))
    return s!"later: {← (fromJs v : IO Nat)}" : Async String)
  IO.println (← fromJs (← JsValue.await (← later.call .undefined #[.ofNat 41])) : String)
  IO.println "done"

def main : IO Unit := do
  discard <| EAsync.toBaseIO program
