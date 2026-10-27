def fib : Nat → Nat
  | 0 => 0
  | 1 => 1
  | n + 2 => fib n + fib (n + 1)

/-- A task in a global constant, whose value is persistent. -/
def greeting : Task String := Task.spawn fun _ => "hello from a " ++ "constant task"

def sumAll (tasks : List (Task Nat)) : Nat :=
  tasks.foldl (fun acc t => acc + t.get) 0

def main : IO Unit := do
  -- Pure tasks.
  let t := Task.spawn fun _ => fib 20
  IO.println t.get
  let doubled := t.map (· * 2)
  IO.println doubled.get
  -- `t` is still used below, so `Task.map` and `Task.get` see a shared task.
  let chained := t.bind fun n => Task.spawn fun _ => s!"fib 20 = {n}"
  IO.println chained.get
  IO.println (Task.pure [1, 2, 3]).get
  IO.println (sumAll ((List.range 10).map fun i => Task.spawn fun _ => fib i))
  IO.println greeting.get
  IO.println (greeting.map String.length).get

  -- `BaseIO` tasks.
  let ref ← IO.mkRef 0
  let io ← BaseIO.asTask (do ref.modify (· + 41); return "ran")
  IO.println (← IO.wait io)
  IO.println (← ref.get)
  let mapped ← BaseIO.mapTask (fun s => do ref.modify (· + 1); return s.length) io
  IO.println (← IO.wait mapped)
  let bound ← BaseIO.bindTask mapped fun n => return Task.pure (n + 100)
  IO.println (← IO.wait bound)
  IO.println (← ref.get)
  IO.println (← IO.waitAny [Task.spawn fun _ => "any", Task.pure "other"])

  -- `IO` tasks, whose results are `Except`s.
  let ok ← IO.asTask (return 7)
  IO.println (match ← IO.wait ok with | .ok n => s!"ok {n}" | .error e => s!"error {e}")
  let failed ← IO.asTask (throw (IO.userError "task failed") : IO Nat)
  IO.println (match ← IO.wait failed with | .ok n => s!"ok {n}" | .error e => s!"error {e}")
  let all ← IO.mapTasks (fun xs => return xs.foldl (· + ·) 0) [Task.pure 1, Task.pure 2, Task.pure 3]
  IO.println (match ← IO.wait all with | .ok n => s!"ok {n}" | .error e => s!"error {e}")

  -- Task state and cancellation.
  IO.println (← IO.hasFinished t)
  IO.println (← IO.getTaskState t)
  IO.cancel t
  IO.println (← IO.checkCanceled)
  IO.println t.get
