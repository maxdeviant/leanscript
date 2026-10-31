module

import Js

/-!
A program whose root is a module that imports `Js` privately, so its conversions and everything that
uses them must stay out of its public interface.
-/

structure Point where
  x : Nat
  y : Nat
  deriving ToJs, FromJs

inductive Color where
  | red
  | green
  deriving ToJs, FromJs

def run : IO Unit := do
  let point ← toJs ({ x := 1, y := 2 } : Point)
  let { x, y } : Point ← fromJs point
  IO.println (x + y)
  let color ← (fromJs (← toJs Color.green) : IO Color)
  IO.println (← (fromJs (← toJs color) : IO String))
  IO.println (JsValue.undefined.typeOf)

public def main : IO Unit :=
  run
