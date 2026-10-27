import LeanScript

open Lean LeanScript

def usage : String :=
  "usage: leanscript dump-ir <file.lean>"

def dumpIr (path : System.FilePath) : IO UInt32 := do
  let moduleName := (path.fileStem.getD "Main").toName
  let env ← elabFile path moduleName
  let doc ← runCoreM env dumpImpureDecls
  IO.println doc.pretty
  return 0

def main (args : List String) : IO UInt32 := do
  match args with
  | ["dump-ir", path] => dumpIr path
  | _ =>
    IO.eprintln usage
    return 1
