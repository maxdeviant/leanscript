def main : IO Unit := do
  IO.println "before"
  throw (IO.userError "boom")
