import Lean

namespace LeanScript

open Lean IR

/-- Pretty-prints the IR of every declaration in the main module of `env`, in declaration order. -/
def dumpIrDecls (env : Environment) : Format :=
  let decls := (getDecls env).reverse
  Format.joinSep (decls.map format) (Format.line ++ Format.line)

end LeanScript
