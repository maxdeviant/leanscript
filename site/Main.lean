import Site

def usage : String :=
  "usage: site [--no-clean]"

def highlighter : Ssg.Highlighter :=
  Ssg.highlightWith "node" #["highlight.mjs"]

def rasterizer : Ssg.Rasterizer :=
  Ssg.rasterizeWith "node" #["rasterize.mjs"]

/-- The stylesheet that Tailwind builds, which the site serves under a name with its fingerprint. -/
def stylesheetSource : System.FilePath := "build/style.css"

/-- The coverage data, which `scripts/runtime-coverage.js` writes. -/
def coverageSource : System.FilePath := "data/runtime-coverage.tsv"

def build (clean : Bool) : IO Unit := do
  unless ← stylesheetSource.pathExists do
    throw <| IO.userError s!"{stylesheetSource} doesn't exist, so build it with Tailwind first"
  let css ← IO.FS.readFile stylesheetSource
  let stylesheet := s!"style.{Ssg.fingerprint css}.css"
  let ctx : Site.Context := { stylesheet := s!"/{stylesheet}" }
  let coverage ← Site.Coverage.load coverageSource
  Ssg.build "dist" (Site.pages ctx coverage) ({ path := stylesheet, content := css } :: Site.files)
    (clean := clean) (highlighter := highlighter) (images := Site.images coverage) (rasterizer := rasterizer)

def main (args : List String) : IO UInt32 := do
  match args with
  | [] => build (clean := true)
  | ["--no-clean"] => build (clean := false)
  | _ =>
    IO.eprintln usage
    return 1
  return 0
