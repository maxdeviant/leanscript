/-!
Loops that are only linear if exclusive values are updated in place. Without reference counting
they are quadratic and far too slow for the test timeout.
-/

def buildArray (n : Nat) : Array Nat := Id.run do
  let mut xs := #[]
  for i in [0:n] do
    xs := xs.push i
  return xs

def bumpAll (xs : Array Nat) : Array Nat := Id.run do
  let mut xs := xs
  for i in [0:xs.size] do
    xs := xs.set! i (xs[i]! * 2)
  return xs

def buildString (n : Nat) : String := Id.run do
  let mut s := ""
  for i in [0:n] do
    s := s.push (Char.ofNat (97 + i % 26))
  return s

def main : IO Unit := do
  let n := 300000
  let xs := buildArray n
  IO.println xs.size
  let ys := bumpAll xs
  IO.println (ys[n - 1]!, xs[n - 1]!)
  IO.println ((ys.foldl (· + ·) 0) == 2 * (xs.foldl (· + ·) 0))
  let s := buildString n
  IO.println (s.length, s.take 30)
  let sorted := (Array.range 50000).reverse.qsort (· < ·)
  IO.println (sorted[0]!, sorted[49999]!)
