import Js

open Std.Async

/-- Returns a JS promise that is fulfilled with `value` after `ms` milliseconds. -/
@[extern js "./JsPromises.js#delay"]
opaque delay (ms : Float) (value : @& JsValue) : BaseIO JsValue

/-- Returns a JS promise that is rejected with an `Error` with the message `msg` after `ms`. -/
@[extern js "./JsPromises.js#failAfter"]
opaque failAfter (ms : Float) (msg : @& String) : BaseIO JsValue

def str (v : JsValue) : String :=
  v.toString?.getD "?"

def program : Async Unit := do
  let a ← JsValue.await (← delay 20 (.ofString "first"))
  IO.println s!"awaited {str a}"
  IO.println s!"awaited {str (← JsValue.await (.ofString "a value that is not a promise"))}"

  -- Both promises are pending at once, and the second settles first.
  let slow ← delay 30 (.ofString "slow")
  let fast ← delay 5 (.ofString "fast")
  IO.println s!"awaited {str (← JsValue.await slow)}, then {str (← JsValue.await fast)}"

  try
    discard <| JsValue.await (← failAfter 5 "rejected")
  catch e =>
    IO.println s!"caught: {e}"

  -- A Lean computation as a JS promise, and back.
  let p ← JsValue.ofAsync do
    let v ← JsValue.await (← delay 5 (.ofString "inner"))
    return s!"{str v}, round trip"
  IO.println s!"awaited {str (← JsValue.await p)}"
  let q ← JsValue.ofAsync (α := Unit) (throw (IO.userError "failed in Lean"))
  try
    discard <| JsValue.await q
  catch e =>
    IO.println s!"caught: {e}"
  IO.println "done"

def main : IO Unit := do
  IO.println "starting"
  discard <| EAsync.toBaseIO program
  -- The program continues once the first promise settles, after `main` returns.
  IO.println "main returned"
