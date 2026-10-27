def main (args : List String) : IO UInt32 := do
  IO.println s!"args: {args}"
  try
    throw (IO.userError "boom")
  catch e =>
    IO.println s!"caught: {e}"
  return 3
