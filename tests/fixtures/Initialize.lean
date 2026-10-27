initialize IO.println "first initializer"

initialize greeting : String ← do
  IO.println "computing greeting"
  return "hello"

builtin_initialize IO.println "builtin initializer"

initialize answer : Nat ← do
  IO.println s!"computing answer after {greeting}"
  return 42

def main : IO Unit := do
  IO.println "main"
  IO.println s!"{greeting}, {answer}"
