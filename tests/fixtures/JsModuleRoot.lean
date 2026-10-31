module

public import Js

/-!
A program whose root is itself a module, which `import`s `Js` and derives conversions.
-/

public structure Point where
  x : Nat
  y? : Option Nat := none
  deriving ToJs, FromJs

public inductive Color where
  | red
  | green
  deriving ToJs, FromJs

public inductive Shape where
  | circle (center : Point) (radius : Nat)
  | square (side : Nat)
  deriving ToJs, FromJs

/-- A type that isn't part of the module's public interface. -/
structure Hidden where
  name : String
  deriving ToJs, FromJs

initialize counter : IO.Ref Nat ← IO.mkRef 1

private def json (v : JsValue) : IO String := do
  let json ← JsValue.getGlobal "JSON"
  let s ← json.callMethod "stringify" #[v]
  fromJs s

private def roundTrip (α : Type) [ToJs α] [FromJs α] (a : α) : IO String := do
  let v ← toJs a
  let (_ : α) ← fromJs v
  json v

public def main : IO Unit := do
  IO.println (← roundTrip Point { x := 1, y? := some 2 })
  IO.println (← roundTrip Color .green)
  IO.println (← roundTrip Shape (.circle { x := 3 } 4))
  IO.println (← roundTrip Hidden { name := "hidden" })
  counter.modify (· + 1)
  IO.println (← counter.get)
  let add ← toJs fun (a b : Nat) => (pure (a + b) : IO Nat)
  IO.println (← json (← add.call .undefined #[.ofNat 2, .ofNat 3]))
