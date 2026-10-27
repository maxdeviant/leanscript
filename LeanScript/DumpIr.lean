import Lean

namespace LeanScript

open Lean Compiler LCNF

/-- Returns the module's impure-phase declarations in the order the C backend would emit them. -/
def getLocalImpureDeclsInOrder : CoreM (Array (Decl .impure)) := do
  let names ← getLocalImpureDecls
  let indices := getImpureDeclIndices (← getEnv) names
  let names := names.qsort fun l r => indices[l]?.getD 0 < indices[r]?.getD 0
  names.filterMapM getLocalImpureDecl?

/-- Pretty-prints every impure-phase declaration in the current module. -/
def dumpImpureDecls : CoreM Format := do
  let decls ← getLocalImpureDeclsInOrder
  let docs ← decls.mapM (ppDecl' · .impure)
  return Format.joinSep docs.toList (Format.line ++ Format.line)

end LeanScript
