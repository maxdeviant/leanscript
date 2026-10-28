import Lean.Util.ShareCommon
import Std.Time

/-- Hides `x` from the compiler, so that operations on it are not constant folded. -/
def hide (x : α) : IO α := do
  (← IO.mkRef x).get

def version : IO Unit := do
  IO.println s!"{Lean.versionString} {Lean.version.isRelease} {repr Lean.version.specialDesc} {Lean.githash.length}"
  IO.println s!"{Lean.Internal.isStage0 ()} {Lean.Internal.hasLLVMBackend ()}"

def names : IO Unit := do
  let a ← hide `Foo.bar
  let b ← hide (Lean.Name.mkStr (.mkStr .anonymous "Foo") "bar")
  let c ← hide `Foo.baz
  let d ← hide (Lean.Name.mkNum `Foo 3)
  let e ← hide (Lean.Name.mkNum `Foo 3)
  let f ← hide (Lean.Name.mkNum `Bar 3)
  IO.println s!"{a == b} {a == c} {a == d} {d == e} {d == f} {Lean.Name.anonymous == a} {(← hide Lean.Name.anonymous) == .anonymous}"

unsafe def runtimeHints : IO Unit := do
  let xs ← hide #[1, 2, 3]
  let xs ← Runtime.markMultiThreaded xs
  let ys ← Runtime.markPersistent (xs.push 4)
  Runtime.hold ys
  Runtime.forget (xs.push 5)
  IO.println s!"{xs} {ys}"

unsafe def sharing : IO Unit := do
  let xs ← hide [[1, 2], [1, 2], [3]]
  IO.println s!"{Lean.ShareCommon.shareCommon xs} {ShareCommon.shareCommon' xs}"
  let p ← hide ((1 : Nat), "a")
  let s ← hide "a"
  let eq {α β} (a : α) (b : β) := ShareCommon.Object.eq (unsafeCast a) (unsafeCast b)
  let h {α} (a : α) := ShareCommon.Object.hash (unsafeCast a)
  IO.println s!"{eq p p} {eq s (← hide "a")} {eq s (← hide "b")} {h s == h (← hide "a")}"

def system : IO Unit := do
  IO.setNumHeartbeats 5
  IO.println s!"{decide ((← IO.getNumHeartbeats) ≥ 5)} {(← IO.getTID) == (← IO.getTID)}"
  IO.println s!"{decide (System.Platform.numBits ≥ 32)} {decide (System.Platform.Internal.getHardwareConcurrency () > 0)}"
  let now ← Std.Time.Timestamp.now
  let later ← Std.Time.Timestamp.now
  IO.println s!"{decide (now.toSecondsSinceUnixEpoch.val > 1700000000)} {decide (now.val ≤ later.val)} {decide (0 ≤ now.val.nano.val ∧ now.val.nano.val < 1000000000)}"
  -- With only millisecond precision, every sample would be a whole number of milliseconds.
  let samples ← (List.range 5).mapM fun _ => Std.Time.Timestamp.now
  IO.println s!"sub-millisecond: {samples.any (·.val.nano.val % 1000000 != 0)}"

unsafe def main : IO Unit := do
  version
  names
  runtimeHints
  sharing
  system
