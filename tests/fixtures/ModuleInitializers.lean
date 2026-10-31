module

/-!
A program whose root is a module, which uses `IO.stdGenRef`, a non-`meta` initializer of a module it
imports. A module's environment doesn't normally see these, but they must still run.
-/

public def main : IO Unit := do
  IO.println (← IO.rand 5 5)
