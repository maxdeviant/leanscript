def twice (f : α → α) (x : α) : α := f (f x)

def adder (n : Nat) : Nat → Nat := fun x => x + n

def compose (fs : List (Nat → Nat)) : Nat → Nat :=
  fs.foldr (· ∘ ·) id

def main : IO Unit := do
  IO.println (twice (· * 3) 7)
  IO.println ([1, 2, 3].map (adder 10))
  IO.println (compose [adder 1, (· * 2), adder 3] 5)
  let add3 : Nat → Nat → Nat → Nat := fun a b c => a + b + c
  let partial1 := add3 1
  let partial2 := partial1 2
  IO.println (partial2 3)
  IO.println ([1, 2, 3, 4, 5].filter (· % 2 == 1) |>.foldl (· + ·) 0)
