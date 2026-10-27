import Js

/--
Returns a new JS object with a property named `rc`, which reference counting must leave alone. Each
object has its own identity, so this is `BaseIO`: a pure function could share one object between
calls.
-/
@[extern js "./JsValues.js#makePoint"]
opaque makePoint : Float → Float → BaseIO JsValue

/--
Returns `v` as JSON. This reads `v`, which may be a mutable object, so it is `BaseIO`: a pure
function would return the same result after `v` changed.
-/
@[extern js "./JsValues.js#describe"]
opaque describe : @& JsValue → BaseIO String

def showOpt [ToString α] : Option α → String
  | some a => s!"some {a}"
  | none => "none"

def main : IO Unit := do
  -- Primitives.
  IO.println (showOpt (JsValue.ofString "héllo").toString?)
  IO.println (showOpt (JsValue.ofFloat 2.5).toFloat?)
  IO.println (showOpt (JsValue.ofBool true).toBool?)
  IO.println (showOpt (JsValue.ofFloat 2.5).toString?)
  let values := [JsValue.undefined, .null, .ofString "", .ofFloat 0, .ofBool false, .globalThis]
  IO.println (values.map (·.typeOf))
  IO.println (JsValue.null.isNull, JsValue.null.isUndefined, JsValue.undefined.isUndefined)
  IO.println ((JsValue.ofString "a").strictEq (.ofString "a"), JsValue.null.strictEq .undefined)

  -- Objects from JS externs, which may hold any JS value.
  let p ← makePoint 1 2
  let ps := #[p, p, ← makePoint 3 4]
  IO.println (← describe p)
  IO.println (← ps.mapM (describe ·))
  IO.println (showOpt (← p.get "x").toFloat?)
  p.set "x" (.ofFloat 10)
  p.set "label" .null
  IO.println (← describe p)

  -- Arrays.
  let arr ← JsValue.ofArray #[.ofFloat 1, .ofString "two", .null]
  IO.println (← describe arr)
  match ← arr.toArray? with
  | some xs => IO.println (xs.map (·.typeOf))
  | none => IO.println "not an array"
  IO.println ((← p.toArray?).isSome)

  -- Objects, methods, and constructors.
  let obj ← JsValue.newObject
  obj.set "greeting" (.ofString "hi")
  IO.println (← describe obj)
  let math ← JsValue.getGlobal "Math"
  let max ← math.callMethod "max" #[.ofFloat 3, .ofFloat 7, .ofFloat 5]
  IO.println (showOpt max.toFloat?)
  let json ← JsValue.getGlobal "JSON"
  let stringify ← json.get "stringify"
  IO.println (showOpt (← stringify.call json #[arr]).toString?)
  let date ← JsValue.new (← JsValue.getGlobal "Date") #[.ofFloat 0]
  IO.println (showOpt (← date.callMethod "toISOString" #[]).toString?)

  -- JS exceptions become `IO` errors.
  try
    discard <| JsValue.null.get "x"
  catch e =>
    IO.println s!"caught: {e}"
  try
    discard <| (← JsValue.getGlobal "JSON").callMethod "parse" #[.ofString "{"]
  catch e =>
    IO.println s!"caught: {e}"
