import Lean

namespace LeanScript

open Lean

/--
Elaborates the Lean source file at `path` as module `moduleName` and returns the resulting
environment.

Code generation runs during elaboration, so the returned environment contains IR for every
definition in the file, as well as for everything it imports.

Besides the standard library, the file may import the libraries built alongside the compiler, such
as `Js`.
-/
def elabFile (path : System.FilePath) (moduleName : Name) (opts : Options := {}) :
    IO Environment := do
  let input ← IO.FS.readFile path
  initSearchPath (← findSysroot) [(← IO.appDir) / ".." / "lib" / "lean"]
  unsafe enableInitializersExecution
  let some env ← Elab.runFrontend input opts path.toString moduleName
    | throw <| .userError s!"failed to elaborate '{path}'"
  return env

end LeanScript
