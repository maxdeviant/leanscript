def greet (name : String) : String :=
  s!"Hello, {name}!"

def sumTo : Nat → Nat
  | 0 => 0
  | n + 1 => (n + 1) + sumTo n

def main : IO Unit := do
  IO.println (greet "world")
  IO.println (toString (sumTo 10))
