module

/-!
A module whose initializers depend on running in declaration order, across `initialize` and
`builtin_initialize`, and public and private declarations.
-/

public initialize log : IO.Ref (Array String) ← IO.mkRef #["first"]
public builtin_initialize log.modify (·.push "second")
private initialize log.modify (·.push "third")
private builtin_initialize log.modify (·.push "fourth")
public initialize log.modify (·.push "fifth")
