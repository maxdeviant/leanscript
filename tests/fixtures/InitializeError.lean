initialize IO.println "before failure"

initialize throw (IO.userError "initializer failed")

initialize IO.println "after failure"

def main : IO Unit :=
  IO.println "main"
