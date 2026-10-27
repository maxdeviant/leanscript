import Site

def usage : String :=
  "usage: site [--no-clean]"

def main (args : List String) : IO UInt32 := do
  match args with
  | [] => Ssg.build "dist" Site.pages
  | ["--no-clean"] => Ssg.build "dist" Site.pages (clean := false)
  | _ =>
    IO.eprintln usage
    return 1
  return 0
