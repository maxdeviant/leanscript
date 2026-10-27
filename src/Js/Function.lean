import Js.Promise

/-!
Lean functions as JS functions, which JS can call, such as event listeners and other callbacks.

A JS function may be called for as long as it exists, which only JS's garbage collector knows, so
the Lean function it calls is never freed by reference counting, and neither is anything it
captures. Values it captures are still correct to use, but can no longer be updated in place.
-/

open Std.Async

namespace JsValue

@[extern js inline "$rt.jsFunction(#1)"]
private opaque ofStringFunction (f : Array JsValue → BaseIO (Except String JsValue)) :
    BaseIO JsValue

/--
Returns a JS function that calls `f` with an array of its arguments, and returns its result, or
throws an `Error` with the message of its error.
-/
def ofFunction (f : Array JsValue → IO JsValue) : BaseIO JsValue :=
  ofStringFunction fun args => do
    return (← (f args).toBaseIO).mapError toString

end JsValue

/--
Lean functions that JS can call: functions whose arguments convert from JS values, and whose result
is an action that returns a value that converts to a JS value.
-/
class ToJsFunction (α : Type) where
  /-- Calls `f` with the elements of `args` from index `i` on as its arguments. -/
  callJs (f : α) (args : Array JsValue) (i : Nat) : IO JsValue

export ToJsFunction (callJs)

/-- Returns the result of the action. -/
instance [ToJs β] : ToJsFunction (IO β) where
  callJs x _ _ := do toJs (← x)

/-- Returns a JS promise of the result of the action, as a JS `async` function does. -/
instance [ToJs β] : ToJsFunction (Async β) where
  callJs x _ _ := JsValue.ofAsync x

/--
Takes the argument from JS. A missing argument is `undefined`, as in JS, and extra arguments are
ignored.
-/
instance [FromJs α] [ToJsFunction β] : ToJsFunction (α → β) where
  callJs f args i := do
    callJs (f (← fromJs (args[i]?.getD .undefined))) args (i + 1)

/-- Converts to a JS function. -/
instance [FromJs α] [ToJsFunction β] : ToJs (α → β) where
  toJs f := JsValue.ofFunction (callJs f · 0)

/-- Converts to a JS function with no parameters, which runs the action each time it is called. -/
instance [ToJs β] : ToJs (IO β) where
  toJs x := JsValue.ofFunction (callJs x · 0)

/--
Converts to a JS `async` function with no parameters, which runs the action each time it is called.
-/
instance [ToJs β] : ToJs (Async β) where
  toJs x := JsValue.ofFunction (callJs x · 0)
