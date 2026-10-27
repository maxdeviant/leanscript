import LeanScript

open Lean LeanScript

def usage : String :=
  "usage:
  leanscript compile <file.lean> [-o <out.mjs>] [--runtime <specifier>]
  leanscript dump-ir <file.lean>
  leanscript list-externs <file.lean>"

def moduleNameFor (path : System.FilePath) : Name :=
  (path.fileStem.getD "Main").toName

def dumpIr (path : System.FilePath) : IO UInt32 := do
  let env ← elabFile path (moduleNameFor path)
  IO.println (dumpIrDecls env).pretty
  return 0

def listExterns (path : System.FilePath) : IO UInt32 := do
  let env ← elabFile path (moduleNameFor path)
  match collectReachable env #[`main, `IO.Error.toString] with
  | .error err =>
    IO.eprintln s!"error: {err}"
    return 1
  | .ok program =>
    for decl in program.decls do
      if decl.isExtern then
        IO.println (format decl).pretty
    return 0

structure CompileArgs where
  input : System.FilePath
  output? : Option System.FilePath := none
  emitOpts : EmitOptions := {}

def parseCompileArgs (input : System.FilePath) : List String → CompileArgs → Except String CompileArgs
  | [], acc => .ok acc
  | "-o" :: out :: rest, acc => parseCompileArgs input rest { acc with output? := some out }
  | "--runtime" :: spec :: rest, acc =>
    parseCompileArgs input rest { acc with emitOpts.runtime := spec }
  | arg :: _, _ => .error s!"unexpected argument '{arg}'"

def compile (args : CompileArgs) : IO UInt32 := do
  let env ← elabFile args.input (moduleNameFor args.input)
  match emitProgram env args.emitOpts with
  | .error err =>
    IO.eprintln s!"error: {err}"
    return 1
  | .ok js =>
    let output := args.output?.getD (args.input.withExtension "mjs")
    if let some dir := output.parent then
      IO.FS.createDirAll dir
    IO.FS.writeFile output js
    return 0

def main (args : List String) : IO UInt32 := do
  match args with
  | ["dump-ir", path] => dumpIr path
  | ["list-externs", path] => listExterns path
  | "compile" :: input :: rest =>
    match parseCompileArgs input rest { input } with
    | .ok args => compile args
    | .error err =>
      IO.eprintln s!"error: {err}\n\n{usage}"
      return 1
  | _ =>
    IO.eprintln usage
    return 1
