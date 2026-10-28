import Site.Logo

namespace Site

open Ssg Html

/--
The image that represents a page when it's shared, such as on social media, which `rasterize.mjs`
draws with IBM Plex Sans and IBM Plex Mono.
-/
structure Card where
  /-- The name of the card's file, without its fingerprint or extension. -/
  name : String
  /-- A description of the card, for people who can't see it. -/
  alt : String
  svg : Html

namespace Card

def width : Nat := 1200
def height : Nat := 630

/--
The card as an image of the site, under a name with its fingerprint. The fingerprint is of the SVG,
so a change to the fonts alone doesn't change it.
-/
def image (card : Card) : Image :=
  { path := s!"cards/{card.name}.{fingerprint card.svg.render}.png", svg := card.svg }

end Card

/-- The colors of the site's dark theme, which the cards use. -/
def paper : String := "#15130f"
def ink : String := "#ece5d8"
def muted : String := "#a1968a"
def highlight : String := "#f5a524"
def onHighlight : String := "#1d1a16"

def svgText (x y : Nat) (attrs : List Attr) (content : String) (anchor := "start") : Html :=
  .element "text" ([("x", toString x), ("y", toString y), ("text-anchor", anchor)] ++ attrs) [.text content]

/-- Text in IBM Plex Mono. -/
def monoText (x y : Nat) (size : Nat) (weight : Nat) (fill : String) (content : String)
    (anchor := "start") : Html :=
  svgText x y [("font-family", "IBM Plex Mono"), ("font-size", toString size),
    ("font-weight", toString weight), ("fill", fill)] content (anchor := anchor)

/-- Lines of text in IBM Plex Sans, which SVG doesn't wrap. -/
def sansLines (x y : Nat) (size : Nat) (lineHeight : Nat) (fill : String) (lines : List String) : Html :=
  .fragment <| lines.mapIdx fun i line =>
    svgText x (y + i * lineHeight) [("font-family", "IBM Plex Sans"), ("font-size", toString size),
      ("fill", fill)] line

def svgRect (x y w h : Nat) (fill : String) (attrs : List Attr := []) : Html :=
  .element "rect" ([("x", toString x), ("y", toString y), ("width", toString w),
    ("height", toString h), ("fill", fill)] ++ attrs) []

/--
A card with the site's name and caution tape, like the site's header, above `content`, and `footer`
in its bottom corners.
-/
def cardFrame (content : List Html) (footerStart : String) (footerEnd : String := "") : Html :=
  .element "svg" [("xmlns", "http://www.w3.org/2000/svg"), ("width", toString Card.width),
      ("height", toString Card.height), ("viewBox", s!"0 0 {Card.width} {Card.height}")] ([
    .element "defs" [] [
      .element "pattern" [("id", "caution-stripes"), ("width", "28"), ("height", "28"),
          ("patternUnits", "userSpaceOnUse"), ("patternTransform", "rotate(45)")] [
        svgRect 0 0 28 28 onHighlight,
        svgRect 0 0 14 28 highlight
      ]
    ],
    svgRect 0 0 Card.width Card.height paper,
    svgRect 0 0 Card.width 20 "url(#caution-stripes)",
    mark [("x", "80"), ("y", "72"), ("width", "64"), ("height", "64")],
    monoText 164 116 36 700 ink "LeanScript",
    monoText 80 566 24 400 muted footerStart,
    monoText (Card.width - 80) 566 24 400 muted footerEnd (anchor := "end")
  ] ++ content)

end Site
