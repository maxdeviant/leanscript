import Std.Async.Timer

open Std.Async
open Std.Internal.UV

/-- Prints whether at least `ms` milliseconds have passed since `start`, from `IO.monoMsNow`. -/
def elapsed (label : String) (start ms : Nat) : IO Unit := do
  IO.println s!"{label}: at least {ms}ms: {decide ((← IO.monoMsNow) - start ≥ ms)}"

def sleeps : Async Unit := do
  let start ← IO.monoMsNow
  sleep 20
  elapsed "sleep" start 20
  -- Both run at once, so the shorter one finishes first.
  let start ← IO.monoMsNow
  let _ ← Async.concurrently (do sleep 30; IO.println "slow") (do sleep 10; IO.println "fast")
  elapsed "concurrently" start 30
  IO.println s!"race: {← Async.race (do sleep 40; return "slow") (do sleep 10; return "fast")}"

def resets : Async Unit := do
  let start ← IO.monoMsNow
  let s ← Sleep.mk 30
  sleep 15
  -- Resetting restarts the 30ms from now.
  s.reset
  s.wait
  elapsed "reset sleep" start 45
  let start ← IO.monoMsNow
  let i ← Interval.mk 10
  -- The first tick is right away, and the rest are 10ms apart.
  for _ in [0:4] do
    i.tick
  elapsed "interval" start 30
  i.stop

def showResult (o : Option Unit) : String :=
  if o.isSome then "resolved" else "dropped"

def timers : Async Unit := do
  -- Stopping a timer drops its promise, which then resolves to `none` once nothing else holds it.
  let stopped ← Timer.mk 10 false
  let r := (← stopped.next).result?
  stopped.stop
  IO.println s!"stopped: {showResult (← await r)}"
  -- Canceling a timer that doesn't repeat makes it initial again, so `next` restarts it.
  let canceled ← Timer.mk 10 false
  let r := (← canceled.next).result?
  canceled.cancel
  IO.println s!"canceled: {showResult (← await r)}"
  IO.println s!"restarted: {showResult (← await (← canceled.next).result?)}"
  -- Once it has finished, `next` returns the same resolved promise.
  let p ← canceled.next
  IO.println s!"finished: {← p.isResolved}"
  -- A repeating timer resolves its first promise right away, then one per period after that.
  let repeating ← Timer.mk 10 true
  let first ← repeating.next
  IO.println s!"first tick: {showResult (← await first.result?)}"
  let start ← IO.monoMsNow
  let second ← repeating.next
  IO.println s!"second is new: {!(← second.isResolved)}"
  IO.println s!"second tick: {showResult (← await second.result?)}"
  elapsed "second tick" start 5
  repeating.stop
  -- A stopped timer has no promise, so `next` returns one that it never resolves.
  IO.println s!"after stop: {showResult (← await (← repeating.next).result?)}"

def selectors : Async Unit := do
  -- The winner cancels the other timers as soon as it fires, while it is still finishing.
  let short ← Selector.sleep 10
  let long ← Selector.sleep 1000
  let winner ← Selectable.one #[
    .case long fun _ => return "long",
    .case short fun _ => return "short"]
  IO.println s!"first sleep to finish: {winner}"

def program : Async Unit := do
  sleeps
  resets
  timers
  selectors
  IO.println "done"

def main : IO Unit := do
  IO.println "starting"
  discard <| EAsync.toBaseIO program
  -- The program continues once the first timer fires, after `main` returns.
  IO.println "main returned"
