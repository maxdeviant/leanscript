import Ssg

namespace Site

open Ssg Html

/--
The site's mark: the letters "LS" on a yellow square, with the stem of the L leaning toward the S. The
letters are strokes on a 32×32 grid, rather than text, so that they look the same everywhere.
-/
def mark (attrs : List Attr := []) : Html :=
  .element "svg" ([("xmlns", "http://www.w3.org/2000/svg"), ("viewBox", "0 0 32 32")] ++ attrs) [
    .element "rect" [("width", "32"), ("height", "32"), ("rx", "4"), ("fill", "#f7df1e")] [],
    -- Cuts the gap between the foot of the L and the S, which leans like the stem of the L: 4 to the
    -- right for each 17.25 up. The mask covers the whole square, since by default it only covers
    -- the path's outline without its stroke, which would clip the corner of the L.
    .element "mask" [("id", "mark-gap"), ("maskUnits", "userSpaceOnUse"), ("x", "0"), ("y", "0"),
        ("width", "32"), ("height", "32")] [
      .element "rect" [("width", "32"), ("height", "32"), ("fill", "#fff")] [],
      .element "path" [("d", "M15.77 22H17.77L16.73 26.5H14.73Z"), ("fill", "#000")] []
    ],
    -- One stroke for both letters: the L, whose foot runs along the baseline into the S, then the S,
    -- as two arcs of radius 3.875 that meet at its middle.
    .element "path" [("d", "M11.5 7L7.5 24.25H21.5A3.875 3.875 0 0 0 21.5 16.5A3.875 3.875 0 1 1 24.86 10.69"),
      ("fill", "none"), ("stroke", "#1d1a16"), ("stroke-width", "3.5"), ("mask", "url(#mark-gap)")] []
  ]

end Site
