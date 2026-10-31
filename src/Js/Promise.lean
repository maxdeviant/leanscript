module

public import Std.Async.Basic
public import Js.Convert

/-!
JS promises and Lean tasks convert to each other. Code that waits for a JS promise cannot block, so
it must run as a continuation of the promise's task, which the `Async` monad from `Std.Async`
takes care of: see `JsValue.await` and `JsValue.ofAsync`.
-/

public section

open Std.Async

namespace JsValue

/--
Returns a task that finishes with the value of the JS promise `p` once it is fulfilled, or with an
`IO.userError` once it is rejected. A value that is not a promise is treated as a fulfilled promise,
as `await` does in JS.

The task cannot finish until control returns to the JS event loop, so waiting for it with
`IO.wait` or `Task.get` throws instead of blocking forever.
-/
@[extern js inline "$rt.taskOfJsPromise(#1)"]
opaque toTask (p : @& JsValue) : BaseIO (AsyncTask JsValue)

/-- Waits for the JS promise `p` to settle, as `await p` does in JS. -/
def await (p : JsValue) : Async JsValue := do
  MonadAwait.await (← toTask p)

@[extern js inline "$rt.jsPromiseOfTask(#1)"]
private opaque ofStringTask (t : Task (Except String JsValue)) : BaseIO JsValue

/--
Returns a JS promise that is fulfilled with the value of the task `t` once it finishes, or rejected
with an `Error` if it finishes with an error.
-/
def ofTask (t : AsyncTask JsValue) : BaseIO JsValue :=
  let t : Task (Except IO.Error JsValue) := t
  ofStringTask (t.map (Except.mapError toString) (sync := true))

/--
Runs `x`, returning a JS promise of its result converted to a JS value, as calling a JS `async`
function does.
-/
def ofAsync [ToJs α] (x : Async α) : BaseIO JsValue := do
  ofTask (← EAsync.toBaseIO do toJs (← x))

end JsValue
