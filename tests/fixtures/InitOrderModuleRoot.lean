module

import InitOrderModule

public def main : IO Unit := do
  IO.println (← log.get)
