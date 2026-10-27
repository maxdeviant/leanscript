/-- A global ref, which can hold a promise. Native Lean cannot create promises in initializers. -/
initialize globalRef : IO.Ref (Option (IO.Promise String)) ← IO.mkRef none

def showOpt (o : Option Nat) : String :=
  match o with
  | some n => s!"some {n}"
  | none => "none"

/-- Returns the result task of a promise that is dropped without being resolved. -/
def droppedResult : BaseIO (Task (Option Nat)) := do
  let p ← IO.Promise.new
  return p.result?

def main : IO Unit := do
  -- Continuations wait for the promise to be resolved.
  let p ← IO.Promise.new (α := Nat)
  let doubled := p.result?.map fun o => o.map (· * 2)
  let bang := p.result!.map (· + 1)
  let dflt := p.resultD 0
  IO.println (← p.isResolved)
  IO.println (← IO.getTaskState p.result?)
  IO.println (← IO.getTaskState doubled)
  p.resolve 21
  IO.println (← p.isResolved)
  IO.println (showOpt (← IO.wait doubled))
  IO.println (← IO.wait bang)
  IO.println (← IO.wait dflt)
  -- Only the first call to `resolve` has an effect.
  p.resolve 99
  IO.println (showOpt p.result?.get)
  -- Continuations on a resolved promise run right away.
  IO.println (showOpt (p.result?.map id).get)

  -- `bind`, where the second promise is resolved first.
  let a ← IO.Promise.new (α := String)
  let b ← IO.Promise.new (α := String)
  let both := a.result!.bind fun x => b.result!.map fun y => x ++ " " ++ y
  b.resolve "world"
  a.resolve "hello"
  IO.println (← IO.wait both)

  -- `BaseIO` continuations run their effects when the promise is resolved.
  let ref ← IO.mkRef 0
  let c ← IO.Promise.new (α := Nat)
  let effect ← BaseIO.mapTask (fun n => do ref.modify (· + n); return n * 10) c.result!
  let chained ← BaseIO.bindTask effect fun n => do ref.modify (· + 1); return Task.pure (n + 1)
  IO.println (← ref.get)
  c.resolve 5
  IO.println (← IO.wait chained)
  IO.println (← ref.get)

  -- `waitAny` returns the value of a finished task.
  let d ← IO.Promise.new (α := Nat)
  IO.println (← IO.waitAny [d.result!, Task.pure 7])
  d.resolve 8
  IO.println (← IO.wait d.result!)

  -- A promise that is dropped resolves to `none`.
  IO.println (showOpt (← IO.wait (← droppedResult)))

  -- A promise reachable from a global.
  globalRef.set (some (← IO.Promise.new))
  let some g ← globalRef.get | return
  g.resolve "resolved global"
  IO.println (← IO.wait g.result!)
