import Std.Async.Signal
import Std.Async.Timer

open Std.Async

/-- Sends the signal `name` to this process. -/
def send (name : String) : IO Unit := do
  let out ← IO.Process.output { cmd := "kill", args := #[s!"-{name}", toString (← IO.Process.getPID)] }
  if out.exitCode != 0 then
    throw <| .userError s!"kill failed: {out.stderr}"

/-- Sends the signal `name` to this process after `ms` milliseconds, without waiting. -/
def sendLater (name : String) (ms : Nat) : IO Unit := do
  let pid ← IO.Process.getPID
  let seconds := s!"{ms / 1000}.{toString (ms % 1000 + 1000) |>.drop 1}"
  discard <| IO.Process.spawn {
    cmd := "sh"
    args := #["-c", s!"sleep {seconds}; kill -{name} {pid}"]
  }

/-- Returns whether `task` is still waiting after 50 milliseconds. -/
def stillWaiting (task : AsyncTask Int) : Async Bool := do
  let sleep ← Sleep.mk 50
  sleep.wait
  return !(← IO.hasFinished task)

def oneShot : Async Unit := do
  let waiter ← Signal.Waiter.mk .sighup false
  let task ← waiter.wait
  IO.println s!"waiting with no signal: {← stillWaiting task}"
  send "HUP"
  IO.println s!"received signal {← await task}"
  IO.println s!"waiting again returns the same signal: {← await (← waiter.wait)}"

def repeating : Async Unit := do
  let waiter ← Signal.Waiter.mk .sigint true
  let first ← waiter.wait
  send "INT"
  IO.println s!"received signal {← await first}"
  let second ← waiter.wait
  send "INT"
  IO.println s!"received signal {← await second}"
  -- A signal that arrives when nothing waits for it is dropped.
  send "INT"
  let sleep ← Sleep.mk 50
  sleep.wait
  let third ← waiter.wait
  IO.println s!"waiting after a dropped signal: {← stillWaiting third}"
  sendLater "INT" 100
  IO.println s!"received signal {← await third}"
  waiter.stop
  waiter.stop

def canceling : Async Unit := do
  let signal ← Std.Internal.UV.Signal.mk 15 false
  discard <| signal.next
  signal.cancel
  signal.cancel
  -- Canceling a signal that is not repeating starts it over.
  let promise ← signal.next
  sendLater "TERM" 100
  IO.println s!"received signal {← await (AsyncTask.ofPurePromise promise)} after canceling"
  let repeated ← Std.Internal.UV.Signal.mk 15 true
  discard <| repeated.next
  repeated.cancel
  -- Canceling a repeating signal keeps it running, so the next promise is a new one.
  let promise ← repeated.next
  sendLater "TERM" 100
  IO.println s!"received signal {← await (AsyncTask.ofPurePromise promise)} after canceling a repeating signal"
  repeated.stop

def errors : IO Unit := do
  let unknown ← Std.Internal.UV.Signal.mk 9 false
  try
    discard <| unknown.next
    IO.println "waiting for an unknown signal: ok"
  catch e =>
    IO.println s!"waiting for an unknown signal: {e}"
  unknown.stop
  unknown.cancel
  let stopped ← Std.Internal.UV.Signal.mk 1 false
  stopped.stop
  stopped.cancel
  IO.println "stopping and canceling a signal that never started: ok"

def program : Async Unit := do
  oneShot
  repeating
  canceling
  errors
  IO.println "done"

def main : IO Unit := do
  discard <| EAsync.toBaseIO do
    try program catch e => IO.eprintln s!"error: {e}"
