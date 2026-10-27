initialize IO.println "before the promise"

-- Never read, but its initializer still runs.
initialize promise : IO.Promise Nat ← IO.Promise.new

def main : IO Unit :=
  IO.println "main"
