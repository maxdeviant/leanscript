/-- Tail recursive, so it must not grow the JS stack. -/
def countDown (n acc : Nat) : Nat :=
  match n with
  | 0 => acc
  | n + 1 => countDown n (acc + 1)

def factorial : Nat → Nat
  | 0 => 1
  | n + 1 => (n + 1) * factorial n

def main : IO Unit := do
  IO.println (countDown 1000000 0)
  IO.println (factorial 30)
  IO.println (2 ^ 100 - 2 ^ 99)
  IO.println ((10 ^ 20) / 7 % 1000)
  let mut total := 0
  for i in [0:100] do
    total := total + i
  IO.println total
