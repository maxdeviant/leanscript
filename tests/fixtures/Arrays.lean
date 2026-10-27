def main : IO Unit := do
  let mut xs : Array Nat := #[]
  for i in [0:10] do
    xs := xs.push (i * i)
  IO.println xs
  IO.println xs.size
  IO.println (xs.foldl (· + ·) 0)
  IO.println (xs.map (· + 1) |>.toList)
  let ys := xs.set! 0 100
  IO.println (xs[0]!, ys[0]!)
  IO.println (xs.reverse)
  IO.println (#[3, 1, 2].qsort (· < ·))
  IO.println (xs.contains 49)
