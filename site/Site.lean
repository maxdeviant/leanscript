import Site.Layout
import Site.Home

namespace Site

open Ssg

/-- The pages of the site. -/
def pages : List Page := [
  { path := "index.html", html := home }
]

end Site
