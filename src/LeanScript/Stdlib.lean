import Lean
import LeanScript.Collect

namespace LeanScript

open Lean IR

/-- The modules whose externs make up the standard library. -/
def stdlibModules : Array Name := #[`Init, `Std, `Lean]

/--
Returns every extern in the standard library that the runtime must implement for a program to call
it, paired with the module that declares it, sorted by name.

An extern whose C symbol is exported by a Lean declaration is excluded, as programs call that
declaration instead.
-/
def stdlibExterns : IO (Array (Name × Name)) := do
  initSearchPath (← findSysroot)
  unsafe enableInitializersExecution
  let env ← importModules (stdlibModules.map ({ module := · })) {} (loadExts := true)
  let exports := exportedDecls env
  let mut result := #[]
  for (name, _) in env.constants.toList do
    let some (.extern ..) := findEnvDecl env name | continue
    if (getExternNameFor env `c name).any exports.contains then
      continue
    let some idx := env.getModuleIdxFor? name | continue
    result := result.push (name, env.header.moduleNames[idx.toNat]!)
  return result.qsort (·.1.toString < ·.1.toString)

end LeanScript
