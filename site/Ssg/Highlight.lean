import Ssg.Html

namespace Ssg

/-- A block of source code, in the language that a highlighter knows as `language`. -/
structure CodeBlock where
  language : String
  source : String

/-- Highlights code blocks, returning the HTML of each one, in order. -/
abbrev Highlighter := Array CodeBlock → IO (Array String)

/--
A highlighter that runs `cmd` with `args` once for all of the blocks. It writes each block to the
command's stdin as its language and then its source, each followed by a NUL, and expects the HTML of
each block on its stdout, each followed by a NUL.
-/
def highlightWith (cmd : String) (args : Array String := #[]) : Highlighter := fun blocks => do
  if blocks.isEmpty then
    return #[]
  if blocks.any (·.source.contains '\x00') then
    throw <| IO.userError "can't highlight a code block that contains a NUL"
  let child ← IO.Process.spawn { cmd, args, stdin := .piped, stdout := .piped }
  let (stdin, child) ← child.takeStdin
  for block in blocks do
    stdin.putStr s!"{block.language}\x00{block.source}\x00"
  stdin.flush
  -- The command reads until stdin closes, which happens when the handle is dropped here.
  let output ← child.stdout.readToEnd
  let exitCode ← child.wait
  if exitCode != 0 then
    throw <| IO.userError s!"{cmd} exited with code {exitCode}"
  let highlighted := (output.splitOn "\x00").dropLast.toArray
  if highlighted.size != blocks.size then
    throw <| IO.userError
      s!"{cmd} returned {highlighted.size} highlighted blocks, rather than {blocks.size}"
  return highlighted

namespace Html

/--
A block of `source` in `language`, as a `code` element. A site built with a highlighter has it
highlighted; otherwise, it's plain text.
-/
def sourceCode (language : String) (source : String) (attrs : List Attr := []) : Html :=
  .element "code" (("data-language", language) :: attrs) [.text source]

/-- The language and source of `html`, if it's a block from `sourceCode`. -/
def toCodeBlock? : Html → Option CodeBlock
  | .element "code" attrs [.text source] => (attrs.lookup "data-language").map ({ language := ·, source })
  | _ => none

/-- The blocks from `sourceCode` in `html`, in document order. -/
partial def codeBlocks (html : Html) : Array CodeBlock :=
  match html.toCodeBlock?, html with
  | some block, _ => #[block]
  | none, .element _ _ children | none, .fragment children =>
    children.foldl (· ++ codeBlocks ·) #[]
  | none, _ => #[]

/--
Replaces the contents of the blocks from `sourceCode` in `html` with `highlighted`, in document
order, starting from the index in the state.
-/
partial def replaceCodeBlocks (highlighted : Array String) (html : Html) : StateM Nat Html := do
  match html.toCodeBlock?, html with
  | some _, .element tag attrs _ =>
    let index ← modifyGet fun index => (index, index + 1)
    return .element tag attrs [.raw highlighted[index]!]
  | _, .element tag attrs children =>
    return .element tag attrs (← children.mapM (replaceCodeBlocks highlighted))
  | _, .fragment children => return .fragment (← children.mapM (replaceCodeBlocks highlighted))
  | _, _ => return html

end Html

end Ssg
