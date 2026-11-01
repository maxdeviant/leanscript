import LeanScript

open Lean LeanScript

def usage : String :=
  "usage:
  leanscript compile <file.lean> [-o <out.mjs>] [--runtime <specifier>]
                     [--target node|browser] [--allow-unavailable]
  leanscript dump-ir <file.lean>
  leanscript list-externs <file.lean>
  leanscript stdlib-externs
  leanscript --version

`--runtime` sets the module specifier of the runtime, from which the program also imports
`<specifier>/externs`, so it must be a package rather than a file."

def moduleNameFor (path : System.FilePath) : Name :=
  (path.fileStem.getD "Main").toName

def dumpIr (path : System.FilePath) : IO UInt32 := do
  let env ← elabFile path (moduleNameFor path)
  IO.println (dumpIrDecls env).pretty
  return 0

def listExterns (path : System.FilePath) : IO UInt32 := do
  let env ← elabFile path (moduleNameFor path)
  match programRoots env >>= (collectReachable env ·.names) with
  | .error err =>
    IO.eprintln s!"error: {err}"
    return 1
  | .ok program =>
    for decl in program.decls do
      if decl.isExtern then
        IO.println (format decl).pretty
    return 0

/--
Prints every standard library extern that the runtime must implement, one per line, followed by a
tab and the module that declares it.
-/
def listStdlibExterns : IO UInt32 := do
  for (name, mod) in ← stdlibExterns do
    IO.println s!"{name}\t{mod}"
  return 0

structure CompileArgs where
  input : System.FilePath
  output? : Option System.FilePath := none
  emitOpts : EmitOptions := {}
  /--
  Whether to compile a program that uses externs that its target doesn't implement, which then
  throw when called.
  -/
  allowUnavailable : Bool := false

def parseCompileArgs (input : System.FilePath) : List String → CompileArgs → Except String CompileArgs
  | [], acc => .ok acc
  | "-o" :: out :: rest, acc => parseCompileArgs input rest { acc with output? := some out }
  | "--runtime" :: spec :: rest, acc =>
    parseCompileArgs input rest { acc with emitOpts.runtime := spec }
  | "--target" :: name :: rest, acc =>
    match Target.ofName? name with
    | some target => parseCompileArgs input rest { acc with emitOpts.target := target }
    | none => .error s!"unknown target '{name}'"
  | "--allow-unavailable" :: rest, acc =>
    parseCompileArgs input rest { acc with allowUnavailable := true }
  | arg :: _, _ => .error s!"unexpected argument '{arg}'"

/--
Describes the externs that a program uses but its target doesn't implement, given a chain of calls
to each.
-/
def describeUnavailable (target : Target) (paths : Array (Array Name)) : String :=
  let showName (n : Name) := (privateToUserName? n).getD n |>.toString
  let lines := paths.map fun path => "  " ++ " → ".intercalate (path.map showName).toList
  s!"the program uses externs that are not available on target '{target.name}':\n" ++
    "\n".intercalate lines.toList

/-- Returns the absolute path `path` as a list of components, without `.` or `..` components. -/
def absoluteComponents (path : System.FilePath) : IO (List String) := do
  let cwd ← IO.currentDir
  let path := if path.isAbsolute then path else cwd / path
  return normalizeComponents path.components

/-- Returns the path to the directory `to` relative to the directory `dir`, written with `/`. -/
def relativeDir (dir to : System.FilePath) : IO String := do
  let rec go : List String → List String → List String
    | d :: ds, t :: ts => if d == t then go ds ts else (d :: ds).map (fun _ => "..") ++ t :: ts
    | ds, ts => ds.map (fun _ => "..") ++ ts
  let path := go (← absoluteComponents dir) (← absoluteComponents to)
  return if path.isEmpty then "." else "/".intercalate path

def compile (args : CompileArgs) : IO UInt32 := do
  let env ← elabFile args.input (moduleNameFor args.input)
  let output := args.output?.getD (args.input.withExtension "mjs")
  let parentDir (path : System.FilePath) := path.parent.getD "."
  let sourceDir ← relativeDir (parentDir output) (parentDir args.input)
  match emitProgram env { args.emitOpts with sourceDir } with
  | .error err =>
    IO.eprintln s!"error: {err}"
    return 1
  | .ok { js, unavailable } =>
    unless unavailable.isEmpty do
      let msg := describeUnavailable args.emitOpts.target unavailable
      if args.allowUnavailable then
        IO.eprintln s!"warning: {msg}\nThese externs throw when called."
      else
        IO.eprintln s!"error: {msg}\nCompile with `--allow-unavailable` to make them throw when called instead."
        return 1
    if let some dir := output.parent then
      IO.FS.createDirAll dir
    IO.FS.writeFile output js
    return 0

def run (args : List String) : IO UInt32 := do
  match args with
  | ["--version"] =>
    IO.println s!"leanscript {version}"
    return 0
  | ["dump-ir", path] => dumpIr path
  | ["list-externs", path] => listExterns path
  | ["stdlib-externs"] => listStdlibExterns
  | "compile" :: input :: rest =>
    match parseCompileArgs input rest { input } with
    | .ok args => compile args
    | .error err =>
      IO.eprintln s!"error: {err}\n\n{usage}"
      return 1
  | _ =>
    IO.eprintln usage
    return 1

def main (args : List String) : IO UInt32 := do
  try
    run args
  catch e =>
    IO.eprintln s!"error: {e}"
    return 1
