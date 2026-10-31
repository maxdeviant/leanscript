import Lean

namespace LeanScript

open Lean

/-- Returns the nearest directory containing `path` that has a Lake configuration file, if any. -/
partial def findWorkspace (path : System.FilePath) : IO (Option System.FilePath) := do
  let rec go (dir : System.FilePath) : IO (Option System.FilePath) := do
    if (← (dir / "lakefile.toml").pathExists) || (← (dir / "lakefile.lean").pathExists) then
      return some dir
    match dir.parent with
    | some parent => if parent == dir then return none else go parent
    | none => return none
  go ((← IO.FS.realPath path).parent.getD ".")

/--
Builds the imports of the Lean source file at `path` with Lake, in the workspace `workspace`, and
returns how to elaborate it, as the Lean language server does. Lake's messages, such as build
errors, are printed to stderr.
-/
def setupFile (workspace path : System.FilePath) : IO ModuleSetup := do
  let out ← IO.Process.output {
    cmd := "lake"
    args := #["setup-file", (← IO.FS.realPath path).toString]
    cwd := workspace
  }
  IO.eprint out.stderr
  unless out.exitCode == 0 do
    IO.eprint out.stdout
    throw <| .userError s!"failed to build the imports of '{path}' with Lake"
  match Json.parse out.stdout >>= fromJson? with
  | .ok setup => return setup
  | .error err => throw <| .userError s!"unexpected output from `lake setup-file`: {err}"

/--
Elaborates the Lean source file at `path` as module `moduleName` and returns the resulting
environment.

Code generation runs during elaboration, so the returned environment contains IR for every
definition in the file, as well as for everything it imports.

Messages from elaboration, such as errors, are printed to stderr.

If the file is in a Lake workspace, Lake first builds the modules it imports, which may be any
module of the workspace or its dependencies, and the workspace's Lean options apply. Otherwise,
besides the standard library, the file may import the libraries built alongside the compiler, such
as `Js`.
-/
def elabFile (path : System.FilePath) (moduleName : Name) (opts : Options := {}) :
    IO Environment := do
  let input ← IO.FS.readFile path
  let setup? ← (← findWorkspace path).mapM (setupFile · path)
  -- In a workspace, Lake resolves every import outside the standard library, so the workspace
  -- decides which version of each library a program uses.
  let bundledLibs := (← IO.appDir) / ".." / "lib" / "lean"
  initSearchPath (← findSysroot) (if setup?.isSome then [] else [bundledLibs])
  unsafe enableInitializersExecution
  let setup? := setup?.map ({ · with name := moduleName })
  let (header, _, _) ← Parser.parseHeader (Parser.mkInputContext input path.toString)
  -- A module normally only loads the signatures of what it imports, as native code gets the rest
  -- from linking, but a whole program compiled to JS needs the IR of every function it reaches. The
  -- language server's import level is the one that loads that IR for a module.
  let opts := if Elab.HeaderSyntax.isModule header || setup?.any (·.isModule) then
    Elab.inServer.set opts true
  else
    opts
  let some env ← IO.withStdout (← IO.getStderr) do
      Elab.runFrontend input opts path.toString moduleName (setup? := setup?)
    | throw <| .userError s!"failed to elaborate '{path}'"
  return env

end LeanScript
