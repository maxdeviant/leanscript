import Site.Layout
import Site.Logo
import Site.Home

namespace Site

open Ssg

/-- The pages of the site. -/
def pages : List Page := [
  { path := "index.html", html := home }
]

/-- The files of the site other than its pages. -/
def files : List File := [
  { path := "favicon.svg", content := (mark).render ++ "\n" }
]

end Site
