import Js.Value

/-!
Conversions between Lean values and JS values.

`ToJs` converts in `BaseIO`, since converting to a JS object or array creates one, with its own
identity. `FromJs` converts in `IO`, since it may read a mutable object, and it throws an
`IO.userError` when a value has the wrong type.
-/

/-- Types whose values convert to JS values. -/
class ToJs (α : Type) where
  /-- Converts `a` to a JS value. -/
  toJs (a : α) : BaseIO JsValue

/-- Types whose values convert from JS values. -/
class FromJs (α : Type) where
  /-- Converts the JS value `v`, throwing an `IO.userError` if it doesn't represent an `α`. -/
  fromJs (v : JsValue) : IO α

export ToJs (toJs)
export FromJs (fromJs)

namespace JsValue

/-- Throws an error saying that `v` is not `expected`, a description such as "a string". -/
def throwMismatch (expected : String) (v : JsValue) : IO α :=
  let actual := if v.isNull then "null" else v.typeOf
  throw <| .userError s!"expected {expected}, got {actual}"

/-- Returns the value in `a?`, or if there is none, throws an error saying `v` is not `expected`. -/
private def orMismatch (expected : String) (v : JsValue) (a? : Option α) : IO α :=
  match a? with
  | some a => pure a
  | none => v.throwMismatch expected

end JsValue

instance : ToJs JsValue := ⟨pure⟩
instance : FromJs JsValue := ⟨pure⟩

/-- Converts `()` to `undefined`, which is what a JS function without a result returns. -/
instance : ToJs Unit := ⟨fun _ => pure .undefined⟩

/-- Converts any JS value to `()`, ignoring it. -/
instance : FromJs Unit := ⟨fun _ => pure ()⟩

instance : ToJs Bool := ⟨(pure <| .ofBool ·)⟩
instance : FromJs Bool := ⟨fun v => v.orMismatch "a boolean" v.toBool?⟩

instance : ToJs String := ⟨(pure <| .ofString ·)⟩
instance : FromJs String := ⟨fun v => v.orMismatch "a string" v.toString?⟩

instance : ToJs Float := ⟨(pure <| .ofFloat ·)⟩
instance : FromJs Float := ⟨fun v => v.orMismatch "a number" v.toFloat?⟩

/-- Converts to a JS number, which is rounded if it is not a safe integer. -/
instance : ToJs Nat := ⟨(pure <| .ofNat ·)⟩

/-- Converts from a JS number that is a nonnegative safe integer. -/
instance : FromJs Nat := ⟨fun v => v.orMismatch "a nonnegative integer" v.toNat?⟩

/-- Converts to a JS number, which is rounded if it is not a safe integer. -/
instance : ToJs Int := ⟨(pure <| .ofInt ·)⟩

/-- Converts from a JS number that is a safe integer. -/
instance : FromJs Int := ⟨fun v => v.orMismatch "an integer" v.toInt?⟩

/-- Converts `none` to `null`. -/
instance [ToJs α] : ToJs (Option α) where
  toJs
    | some a => toJs a
    | none => pure .null

/-- Converts `null` and `undefined` to `none`. -/
instance [FromJs α] : FromJs (Option α) where
  fromJs v := if v.isNull || v.isUndefined then pure none else some <$> fromJs v

/-- Converts to a new JS array. -/
instance [ToJs α] : ToJs (Array α) where
  toJs xs := do JsValue.ofArray (← xs.mapM toJs)

/-- Converts from a JS array. -/
instance [FromJs α] : FromJs (Array α) where
  fromJs v := do
    let xs ← v.orMismatch "an array" (← v.toArray?)
    xs.mapM fromJs

/-- Converts to a new JS array. -/
instance [ToJs α] : ToJs (List α) where
  toJs xs := toJs xs.toArray

/-- Converts from a JS array. -/
instance [FromJs α] : FromJs (List α) where
  fromJs v := Array.toList <$> fromJs v

/-- Converts to a two-element JS array, which is how `Object.entries` represents a pair. -/
instance [ToJs α] [ToJs β] : ToJs (α × β) where
  toJs | (a, b) => do JsValue.ofArray #[← toJs a, ← toJs b]

/-- Converts from a two-element JS array. -/
instance [FromJs α] [FromJs β] : FromJs (α × β) where
  fromJs v := do
    let some #[a, b] ← v.toArray? | v.throwMismatch "a two-element array"
    return (← fromJs a, ← fromJs b)
