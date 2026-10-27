def main : IO Unit := do
  let xs := #[1, 2, 3]
  IO.println (xs[5]! + 1)
  IO.println "still running"
