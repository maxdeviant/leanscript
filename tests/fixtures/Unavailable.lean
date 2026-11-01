/-! A program that uses an extern that isn't available in browsers, which throws when it is called
rather than when the program loads. -/

def main : IO Unit := do
  IO.println "before"
  let dir ← IO.currentDir
  IO.println (!dir.toString.isEmpty)
