-- Constructors with more object fields than the runtime has classes for, so that the compiled
-- program defines its own, mixed with scalar fields of every width.

structure Wide where
  a : String
  b : Nat
  c : List Nat
  d : String
  e : Nat
  f : Array String
  g : String
  h : Nat
  i : Option Nat
  j : String
  flag : Bool
  byte : UInt8
  word : UInt64
  half : UInt32
  x : Float
  deriving Repr, BEq, Inhabited

inductive Shape where
  | point
  | box (w h : Nat) (inside : Bool)
  | wide (w : Wide) (n1 n2 n3 n4 n5 n6 n7 n8 n9 : Nat) (tag : UInt16)
  deriving Repr, BEq

def mkWide (n : Nat) : Wide where
  a := s!"a{n}"
  b := n
  c := List.range n
  d := "d"
  e := n * 2
  f := #["x", toString n]
  g := "g"
  h := n + 7
  i := if n % 2 == 0 then some n else none
  j := "j"
  flag := n % 3 == 0
  byte := n.toUInt8
  word := n.toUInt64 * 0x100000001
  half := n.toUInt32 + 1
  x := n.toFloat / 4

def Shape.size : Shape → Nat
  | .point => 0
  | .box w h _ => w * h
  | .wide w n1 n2 n3 n4 n5 n6 n7 n8 n9 tag =>
    w.b + n1 + n2 + n3 + n4 + n5 + n6 + n7 + n8 + n9 + tag.toNat

/-- Updates every field of `w`, in place when `w` is not shared. -/
def bump (w : Wide) : Wide :=
  { w with
    b := w.b + 1
    j := w.j ++ "!"
    flag := !w.flag
    byte := w.byte + 1
    word := w.word + 1
    half := w.half * 2
    x := w.x + 0.5 }

def main : IO Unit := do
  let w := mkWide 6
  IO.println (repr w)
  let shared := w
  let bumped := (List.range 3).foldl (fun w _ => bump w) w
  IO.println (repr bumped)
  -- `w` is still shared with `shared`, so `bump` must not have changed it.
  IO.println (repr shared)
  IO.println (w == shared, w == bumped)
  let shapes := [Shape.point, .box 3 4 true, .wide (mkWide 3) 1 2 3 4 5 6 7 8 9 10]
  IO.println (shapes.map Shape.size)
  IO.println (repr shapes)
  IO.println (shapes == shapes.reverse.reverse)
  let ws := (List.range 5).toArray.map mkWide
  IO.println (ws.foldl (fun acc w => acc + w.h + w.word.toNat) 0)
