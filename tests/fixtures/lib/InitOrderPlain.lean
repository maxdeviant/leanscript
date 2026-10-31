/-!
A file outside the module system whose initializers depend on running in declaration order, across
`initialize` and `builtin_initialize`.
-/

initialize log : IO.Ref (Array String) ← IO.mkRef #["first"]
builtin_initialize log.modify (·.push "second")
initialize log.modify (·.push "third")
builtin_initialize log.modify (·.push "fourth")
initialize log.modify (·.push "fifth")
