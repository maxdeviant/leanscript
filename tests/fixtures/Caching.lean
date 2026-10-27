import Std.Data.HashMap

open Std

initialize fibCache : IO.Ref (HashMap Nat Nat) ← IO.mkRef {}

partial def fibMemo (n : Nat) : IO Nat := do
  if n < 2 then return n
  if let some v := (← fibCache.get)[n]? then return v
  let v := (← fibMemo (n - 1)) + (← fibMemo (n - 2))
  fibCache.modify (·.insert n v)
  return v

/-- Memoization in pure code, threading the cache through `StateM`. -/
partial def collatzLen (n : Nat) : StateM (HashMap Nat Nat) Nat := do
  if n ≤ 1 then return 1
  if let some v := (← get)[n]? then return v
  let next := if n % 2 == 0 then n / 2 else 3 * n + 1
  let v := (← collatzLen next) + 1
  modify (·.insert n v)
  return v

def expensive (label : String) (n : Nat) : Thunk Nat :=
  Thunk.mk fun _ => dbgTrace s!"computing {label}" fun _ => (List.range n).foldl (· + ·) 0

def main : IO Unit := do
  IO.println s!"{← fibMemo 90} {← fibMemo 200}"
  IO.println s!"cache size: {(← fibCache.get).size}"

  let (lens, cache) := ((List.range 3000).mapM fun n => collatzLen (n + 1)).run {}
  IO.println s!"max collatz length: {lens.foldl max 0}, cached: {cache.size}"

  let t := expensive "sum" 1000
  IO.println s!"{t.get} {t.get}"
  let ts := (List.range 5).map fun i => expensive s!"t{i}" (i * 10)
  IO.println s!"{(ts.filter fun t => t.get % 2 == 0).length}"

  -- Sharing affects whether updates happen in place, but never what a program computes.
  let arr := Array.range 5
  let shared := arr
  let updated := arr.set! 0 100
  IO.println s!"{shared} {updated}"
  let mut acc := #[]
  for i in [0:5] do
    acc := acc.push (dbgTraceIfShared "acc" i)
  IO.println acc
  let r ← IO.mkRef (Array.range 3)
  r.modify (·.push 3)
  let snapshot ← r.get
  r.modify (·.push 4)
  IO.println s!"{snapshot} {← r.get}"
