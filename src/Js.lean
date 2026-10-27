import Std.Async.Basic

/-!
Interoperation with JavaScript, for programs compiled with LeanScript.

`JsValue` is any JS value, which JS externs receive and return as is. Primitive JS values are
immutable, so converting them is pure. Objects are mutable, so reading or writing them is `IO`, as
is creating one, since each new object has its own identity. JS exceptions become `IO.userError`s.

JS promises and Lean tasks convert to each other. Code that waits for a JS promise cannot block, so
it must run as a continuation of the promise's task, which the `Async` monad from `Std.Async`
takes care of: see `JsValue.await` and `JsValue.ofAsync`.

The externs here are inline JS, which may use `$rt`, the LeanScript runtime module.
-/

/-- The representation of `JsValue`. -/
opaque JsValue.Pointed : NonemptyType

/-- A JavaScript value. -/
def JsValue : Type := JsValue.Pointed.type

instance : Nonempty JsValue := JsValue.Pointed.property

namespace JsValue

@[extern js inline "undefined"]
private opaque mkUndefined : Unit → JsValue

@[extern js inline "null"]
private opaque mkNull : Unit → JsValue

@[extern js inline "globalThis"]
private opaque mkGlobalThis : Unit → JsValue

/-- JS `undefined`. -/
def undefined : JsValue := mkUndefined ()

/-- JS `null`. -/
def null : JsValue := mkNull ()

/-- The JS global object, `globalThis`. -/
def globalThis : JsValue := mkGlobalThis ()

instance : Inhabited JsValue := ⟨undefined⟩

/-- Converts a string to a JS string. -/
@[extern js inline "#1.toString()"]
opaque ofString (s : @& String) : JsValue

/-- Converts a float to a JS number. -/
@[extern js inline "#1"]
opaque ofFloat (x : Float) : JsValue

/-- Converts a `Bool` to a JS boolean. -/
@[extern js inline "#1 !== 0"]
opaque ofBool (b : Bool) : JsValue

/-- Returns the JS string `v`, or `none` if `v` is not a string. -/
@[extern js inline "$rt.jsToString(#1)"]
opaque toString? (v : @& JsValue) : Option String

/-- Returns the JS number `v`, or `none` if `v` is not a number. -/
@[extern js inline "$rt.jsToFloat(#1)"]
opaque toFloat? (v : @& JsValue) : Option Float

/-- Returns the JS boolean `v`, or `none` if `v` is not a boolean. -/
@[extern js inline "$rt.jsToBool(#1)"]
opaque toBool? (v : @& JsValue) : Option Bool

/-- Returns the result of the JS `typeof` operator on `v`. -/
@[extern js inline "$rt.mkString(typeof #1)"]
opaque typeOf (v : @& JsValue) : String

/-- Returns whether `v` is `undefined`. -/
@[extern js inline "#1 === undefined ? 1 : 0"]
opaque isUndefined (v : @& JsValue) : Bool

/-- Returns whether `v` is `null`. -/
@[extern js inline "#1 === null ? 1 : 0"]
opaque isNull (v : @& JsValue) : Bool

/-- Returns whether `a` and `b` are the same JS value, by JS `===`. -/
@[extern js inline "#1 === #2 ? 1 : 0"]
opaque strictEq (a b : @& JsValue) : Bool

/-- Creates a JS array of `xs`. -/
@[extern js inline "[...#1]"]
opaque ofArray (xs : @& Array JsValue) : BaseIO JsValue

/-- Returns the elements of the JS array `v`, or `none` if `v` is not an array. -/
@[extern js inline "$rt.jsToArray(#1)"]
opaque toArray? (v : @& JsValue) : BaseIO (Option (Array JsValue))

/-- Creates an empty JS object. -/
@[extern js inline "({})"]
opaque newObject : BaseIO JsValue

/-- Returns the property `key` of `obj`, as `obj[key]` does. -/
@[extern js inline "$rt.jsAttempt(() => #1[#2.toString()])"]
opaque get (obj : @& JsValue) (key : @& String) : IO JsValue

/-- Sets the property `key` of `obj` to `value`, as `obj[key] = value` does. -/
@[extern js inline "$rt.jsAttempt(() => { #1[#2.toString()] = #3; return 0; })"]
opaque set (obj : @& JsValue) (key : @& String) (value : @& JsValue) : IO Unit

/-- Calls the JS function `f` with `this` bound to `self`, as `Reflect.apply` does. -/
@[extern js inline "$rt.jsAttempt(() => Reflect.apply(#1, #2, #3))"]
opaque call (f : @& JsValue) (self : @& JsValue) (args : @& Array JsValue) : IO JsValue

/-- Calls the method `name` of `obj`, as `obj[name](...args)` does. -/
@[extern js inline "$rt.jsAttempt(() => #1[#2.toString()](...#3))"]
opaque callMethod (obj : @& JsValue) (name : @& String) (args : @& Array JsValue) : IO JsValue

/-- Constructs a new object with the JS constructor `ctor`, as `new ctor(...args)` does. -/
@[extern js inline "$rt.jsAttempt(() => Reflect.construct(#1, #2))"]
opaque new (ctor : @& JsValue) (args : @& Array JsValue) : IO JsValue

/-- Returns the global variable `name`. -/
def getGlobal (name : String) : IO JsValue :=
  globalThis.get name

open Std.Async

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

/-- Runs `x`, returning a JS promise of its result, as calling a JS `async` function does. -/
def ofAsync (x : Async JsValue) : BaseIO JsValue := do
  ofTask (← EAsync.toBaseIO x)

end JsValue
