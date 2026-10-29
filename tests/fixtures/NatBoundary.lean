-- Arithmetic on `Nat`s around 2^53, where values stop being safe integers in JS, and so where the
-- compiled code switches between its fast path for small `Nat`s and the runtime's general one.

/-- Hides `x` from the compiler, so that operations on it are not constant folded. -/
def hide (x : α) : IO α := do
  (← IO.mkRef x).get

def vals : List Nat := [
  0, 1, 2, 3,
  -- The largest `Nat` whose square is a safe integer, and the next one.
  94906265, 94906266,
  2 ^ 32, 2 ^ 52,
  -- The largest safe integer, and the first values past it.
  2 ^ 53 - 2, 2 ^ 53 - 1, 2 ^ 53, 2 ^ 53 + 1,
  2 ^ 64, 2 ^ 64 + 1
]

def main : IO Unit := do
  for a in vals do
    let a ← hide a
    IO.println s!"{a}: {a.pred} {a.succ}"
    for b in vals do
      let b ← hide b
      IO.println s!"  {b}: {a + b} {a - b} {a * b} {a / b} {a % b} {decide (a = b)} {decide (a < b)} {decide (a ≤ b)} {a == b} {Nat.ble a b}"
