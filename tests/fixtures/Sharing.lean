/-! Updates to shared values must not be visible through other references. -/

structure State where
  items : Array Nat
  log : String
  count : Nat

def State.step (s : State) (i : Nat) : State :=
  { s with items := s.items.push i, log := s.log ++ toString i, count := s.count + 1 }

def main : IO Unit := do
  let xs := #[1, 2, 3]
  let ys := xs.set! 0 100
  let zs := xs.push 4
  IO.println s!"{xs} {ys} {zs}"

  let s := "abc"
  let t := s.push 'd'
  let u := s ++ "xyz"
  IO.println s!"{s} {t} {u}"

  let st0 : State := { items := #[], log := "", count := 0 }
  let st1 := st0.step 1
  let st2 := st1.step 2
  let st2' := st1.step 20
  IO.println s!"{st0.items} {st1.items} {st2.items} {st2'.items}"
  IO.println s!"{st1.log} {st2.log} {st2'.log} {st2'.count}"

  let nested := #[#[1], #[2]]
  let nested' := nested.modify 0 (·.push 10)
  IO.println s!"{nested} {nested'}"

  let fs := [1, 2, 3].map fun n => fun (arr : Array Nat) => arr.push n
  let base := #[0]
  IO.println (fs.map (· base))
  IO.println base
