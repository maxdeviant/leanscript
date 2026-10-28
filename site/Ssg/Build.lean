import Ssg.Highlight

namespace Ssg

open System

/-- A page of a site. -/
structure Page where
  /-- The path of the page's file, relative to the output directory, such as `docs/index.html`. -/
  path : FilePath
  html : Html

/-- A file of a site other than a page, such as a stylesheet or an image. -/
structure File where
  /-- The path of the file, relative to the output directory. -/
  path : FilePath
  content : String

/-- Copies the files in `src`, recursively, into `dest`. -/
def copyDir (src dest : FilePath) : IO Unit := do
  for file in ← src.walkDir do
    if ← file.isDir then
      continue
    -- `walkDir` returns paths that start with `src`.
    let relative := file.toString.drop (src.toString.length + 1)
    let target := dest / relative.toString
    if let some parent := target.parent then
      IO.FS.createDirAll parent
    IO.FS.writeBinFile target (← IO.FS.readBinFile file)

/-- Writes `content` to the file at `path`, creating its parent directories as needed. -/
def writeFileAll (path : FilePath) (content : String) : IO Unit := do
  if let some parent := path.parent then
    IO.FS.createDirAll parent
  IO.FS.writeFile path content

/-- Highlights the blocks from `Html.sourceCode` in `pages` with `highlighter`, in one call to it. -/
def highlightPages (highlighter : Highlighter) (pages : List Page) : IO (List Page) := do
  let highlighted ← highlighter (pages.foldl (· ++ ·.html.codeBlocks) #[])
  let replace := pages.mapM fun page => return { page with html := ← page.html.replaceCodeBlocks highlighted }
  return replace.run' 0

/--
Builds a site into `outDir`. Writes each of `pages` and `files`, and copies the files in `staticDir`,
if it exists. If `clean` is true, removes the contents of `outDir` first; otherwise, leaves the files
that the site doesn't overwrite. If there's a `highlighter`, the pages' blocks from
`Html.sourceCode` are highlighted with it.
-/
def build (outDir : FilePath) (pages : List Page) (files : List File := [])
    (staticDir : FilePath := "static") (clean := true) (highlighter : Option Highlighter := none) :
    IO Unit := do
  let pages ← match highlighter with
    | some highlighter => highlightPages highlighter pages
    | none => pure pages
  if clean && (← outDir.pathExists) then
    IO.FS.removeDirAll outDir
  IO.FS.createDirAll outDir
  if ← staticDir.isDir then
    copyDir staticDir outDir
  for page in pages do
    writeFileAll (outDir / page.path) page.html.renderDocument
  for file in files do
    writeFileAll (outDir / file.path) file.content
  IO.println s!"Wrote {pages.length} {if pages.length == 1 then "page" else "pages"} to {outDir}"

end Ssg
