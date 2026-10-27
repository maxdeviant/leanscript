inductive Shape where
  | circle (r : Nat)
  | rect (w h : Nat)
  | triangle (a b c : Nat)
  | point

def Shape.describe : Shape → String
  | .circle r => s!"circle r={r}"
  | .rect w h => s!"rect {w}x{h}"
  | .triangle a b c => s!"triangle {a} {b} {c}"
  | .point => "point"

inductive Color where
  | red | green | blue
  deriving Repr, BEq

structure Pixel where
  x : UInt8
  y : UInt16
  visible : Bool
  color : Color
  weight : Float
  name : String

def Pixel.show (p : Pixel) : String :=
  s!"{p.name}@({p.x}, {p.y}) visible={p.visible} color={repr p.color} weight={p.weight}"

def lookup (xs : List (String × Nat)) (k : String) : Option Nat :=
  match xs.find? (·.1 == k) with
  | some (_, v) => some v
  | none => none

def main : IO Unit := do
  for s in [Shape.circle 2, .rect 3 4, .triangle 3 4 5, .point] do
    IO.println s.describe
  let p : Pixel := { x := 200, y := 60000, visible := true, color := .blue, weight := 1.5, name := "p" }
  IO.println p.show
  IO.println { p with visible := false, color := .red }.show
  let table := [("a", 1), ("b", 2)]
  IO.println (lookup table "b")
  IO.println (lookup table "z")
  IO.println (Color.green == Color.green)
