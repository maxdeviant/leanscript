namespace Ssg

/-- An HTML attribute, as a name and a value. -/
abbrev Attr := String × String

/-- An HTML document fragment. -/
inductive Html where
  /-- Text, which is escaped when rendered. -/
  | text (content : String)
  /-- Markup, which is rendered as is. -/
  | raw (content : String)
  | element (tag : String) (attrs : List Attr) (children : List Html)
  | fragment (children : List Html)
  deriving Inhabited

instance : Coe String Html := ⟨.text⟩

namespace Html

/-- Escapes `s` for use in text content. -/
def escapeText (s : String) : String :=
  s.foldl (init := "") fun acc c =>
    match c with
    | '&' => acc ++ "&amp;"
    | '<' => acc ++ "&lt;"
    | '>' => acc ++ "&gt;"
    | c => acc.push c

/-- Escapes `s` for use in a double-quoted attribute value. -/
def escapeAttr (s : String) : String :=
  (escapeText s).replace "\"" "&quot;"

/-- The elements that have no content and no closing tag. -/
def voidElements : List String :=
  ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track",
    "wbr"]

/-- Renders `html` as markup. -/
partial def render : Html → String
  | .text content => escapeText content
  | .raw content => content
  | .element tag attrs children =>
    let attrs := attrs.foldl (init := "") fun acc (name, value) =>
      acc ++ s!" {name}=\"{escapeAttr value}\""
    if voidElements.contains tag then
      s!"<{tag}{attrs}>"
    else
      s!"<{tag}{attrs}>{String.join (children.map render)}</{tag}>"
  | .fragment children => String.join (children.map render)

/-- Renders `html` as a complete document, with a doctype. -/
def renderDocument (html : Html) : String :=
  "<!DOCTYPE html>" ++ render html ++ "\n"

def cls (value : String) : Attr := ("class", value)
def href (value : String) : Attr := ("href", value)

def html (attrs : List Attr := []) (children : List Html := []) : Html := .element "html" attrs children
def head (attrs : List Attr := []) (children : List Html := []) : Html := .element "head" attrs children
def body (attrs : List Attr := []) (children : List Html := []) : Html := .element "body" attrs children
def title (attrs : List Attr := []) (children : List Html := []) : Html := .element "title" attrs children
def «meta» (attrs : List Attr := []) : Html := .element "meta" attrs []
def link (attrs : List Attr := []) : Html := .element "link" attrs []
def script (attrs : List Attr := []) (children : List Html := []) : Html := .element "script" attrs children

def header (attrs : List Attr := []) (children : List Html := []) : Html := .element "header" attrs children
def main (attrs : List Attr := []) (children : List Html := []) : Html := .element "main" attrs children
def footer (attrs : List Attr := []) (children : List Html := []) : Html := .element "footer" attrs children
def nav (attrs : List Attr := []) (children : List Html := []) : Html := .element "nav" attrs children
def «section» (attrs : List Attr := []) (children : List Html := []) : Html := .element "section" attrs children
def div (attrs : List Attr := []) (children : List Html := []) : Html := .element "div" attrs children
def span (attrs : List Attr := []) (children : List Html := []) : Html := .element "span" attrs children

def h1 (attrs : List Attr := []) (children : List Html := []) : Html := .element "h1" attrs children
def h2 (attrs : List Attr := []) (children : List Html := []) : Html := .element "h2" attrs children
def h3 (attrs : List Attr := []) (children : List Html := []) : Html := .element "h3" attrs children
def p (attrs : List Attr := []) (children : List Html := []) : Html := .element "p" attrs children
def a (attrs : List Attr := []) (children : List Html := []) : Html := .element "a" attrs children
def ul (attrs : List Attr := []) (children : List Html := []) : Html := .element "ul" attrs children
def li (attrs : List Attr := []) (children : List Html := []) : Html := .element "li" attrs children
def pre (attrs : List Attr := []) (children : List Html := []) : Html := .element "pre" attrs children
def code (attrs : List Attr := []) (children : List Html := []) : Html := .element "code" attrs children
def strong (attrs : List Attr := []) (children : List Html := []) : Html := .element "strong" attrs children
def em (attrs : List Attr := []) (children : List Html := []) : Html := .element "em" attrs children
def img (attrs : List Attr := []) : Html := .element "img" attrs []

end Html

end Ssg
