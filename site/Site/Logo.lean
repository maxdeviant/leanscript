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
    .element "g" [("fill", "none"), ("stroke", "#1d1a16"), ("stroke-width", "3.5")] [
      .element "path" [("d", "M11.5 7L7.5 24.25H14.75")] [],
      -- The S runs along the baseline from the gap, and then is two arcs of radius 3.875 that meet
      -- at its middle.
      .element "path" [("d", "M17.75 24.25H21.5A3.875 3.875 0 0 0 21.5 16.5A3.875 3.875 0 1 1 24.86 10.69")] []
    ],
    -- The gap between the foot of the L and the S leans like the stem of the L, which moves 4 to the
    -- right for each 17.25 up. The strokes end square, so these fill in their slanted ends. They
    -- overlap the strokes slightly, so that no seam shows between them.
    .element "g" [("fill", "#1d1a16")] [
      .element "path" [("d", "M14.65 22.5H15.65L14.85 26H14.65Z")] [],
      .element "path" [("d", "M17.65 22.5H17.85V26H16.85Z")] []
    ]
  ]

end Site
