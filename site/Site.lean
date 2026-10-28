import Site.Layout
import Site.Logo
import Site.Home
import Site.Coverage

namespace Site

open Ssg

/-- The pages of the site. -/
def pages (ctx : Context) (coverage : Coverage) : List Page := [
  { path := "index.html", html := home ctx },
  { path := "coverage/index.html", html := coveragePage ctx coverage }
]

/-- The cards of the pages, as images. -/
def images (coverage : Coverage) : List Image := [homeCard.image, (coverageCard coverage).image]

/-- The files of the site other than its pages and images. -/
def files : List File := [
  { path := "favicon.svg", content := (mark).render ++ "\n" }
]

end Site
