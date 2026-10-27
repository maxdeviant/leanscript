initialize counter : IO.Ref Nat ← IO.mkRef 100

def bump : IO Nat := counter.modifyGet fun n => (n, n + 1)

inductive Instr where
  | push (n : Int)
  | add
  | mul
  | neg
  | pop
  deriving Repr

abbrev VM := StateT (List Int) (ExceptT String Id)

def pop : VM Int := do
  match ← get with
  | x :: xs => set xs; return x
  | [] => throw "stack underflow"

def exec : Instr → VM Unit
  | .push n => modify (n :: ·)
  | .add => do let b ← pop; let a ← pop; modify ((a + b) :: ·)
  | .mul => do let b ← pop; let a ← pop; modify ((a * b) :: ·)
  | .neg => do let a ← pop; modify ((-a) :: ·)
  | .pop => discard pop

def run (prog : List Instr) : Except String (List Int) :=
  (prog.forM exec).run [] |>.run |>.map (·.2)

def sumST (n : Nat) : Nat := runST fun σ => do
  let r : ST.Ref σ Nat ← ST.mkRef 0
  for i in [1:n+1] do
    r.modify (· + i)
  r.get

def main : IO Unit := do
  IO.println (run [.push 2, .push 3, .add, .push 4, .mul])
  IO.println (run [.push 7, .neg, .push 5, .add])
  IO.println (run [.push 1, .add])
  -- With `StateT` over `ExceptT`, the handler sees the state from before the `try`.
  let r : Except String (Int × List Int) :=
    (tryCatch (do exec (.push 1); exec .add; exec .add; return 0) (fun _ => return -1)).run [10]
      |>.run
  IO.println r

  IO.println s!"{← bump} {← bump} {← bump} {← counter.get}"
  let ref ← IO.mkRef (#[] : Array String)
  for w in ["a", "b", "c"] do
    ref.modify (·.push w)
  let old ← ref.swap #["z"]
  IO.println s!"{old} {← ref.get}"
  IO.println (sumST 10)
  try
    let r ← IO.mkRef 0
    r.set 5
    throw (IO.userError s!"failed with {← r.get}")
  catch e =>
    IO.println s!"caught: {e}"
