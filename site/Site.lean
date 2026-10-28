import Site.Layout
import Site.Logo
import Site.Home
import Site.Coverage

namespace Site

open Ssg

/-- The pages of the site. -/
def pages (ctx : Context) : List Page := [
  { path := "index.html", html := home ctx },
  { path := "coverage/index.html", html := coveragePage ctx }
]

/-- The files of the site other than its pages. -/
def files : List File := [
  { path := "favicon.svg", content := (mark).render ++ "\n" }
]

end Site
