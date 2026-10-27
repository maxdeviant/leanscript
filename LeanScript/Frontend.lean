import Lean

namespace LeanScript

open Lean

/--
Elaborates the Lean source file at `path` as module `moduleName` and returns the resulting
environment.

Code generation runs during elaboration, so the returned environment contains the impure-phase
LCNF declarations for every definition in the file. Those declarations are not persisted to
`.olean` files, which is why the JS backend must run in the same process as elaboration.
-/
def elabFile (path : System.FilePath) (moduleName : Name) (opts : Options := {}) :
    IO Environment := do
  let input ← IO.FS.readFile path
  initSearchPath (← findSysroot)
  unsafe enableInitializersExecution
  let some env ← Elab.runFrontend input opts path.toString moduleName
    | throw <| .userError s!"failed to elaborate '{path}'"
  return env

/-- Runs `x` against `env`, rethrowing any `CoreM` error as an `IO` error. -/
def runCoreM (env : Environment) (x : CoreM α) (opts : Options := {}) : IO α := do
  let ctx : Core.Context := { fileName := "<leanscript>", fileMap := default, options := opts }
  let (a, _) ← x.toIO ctx { env }
  return a

end LeanScript
