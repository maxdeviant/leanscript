initialize IO.println "before the promise"

initialize promise : IO.Promise Nat ← IO.Promise.new

def main : IO Unit := do
  IO.println "main"
  promise.resolve 1
