import Site

def usage : String :=
  "usage: site [--no-clean]"

def highlighter : Ssg.Highlighter :=
  Ssg.highlightWith "node" #["highlight.mjs"]

def main (args : List String) : IO UInt32 := do
  match args with
  | [] => Ssg.build "dist" Site.pages Site.files (highlighter := highlighter)
  | ["--no-clean"] => Ssg.build "dist" Site.pages Site.files (clean := false) (highlighter := highlighter)
  | _ =>
    IO.eprintln usage
    return 1
  return 0
