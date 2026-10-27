initialize duringInit : Bool ← IO.initializing

initialize do
  IO.println s!"in an initializer: {← IO.initializing}"

def main : IO Unit := do
  IO.println s!"stored during initialization: {duringInit}"
  IO.println s!"in main: {← IO.initializing}"
