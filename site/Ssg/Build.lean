import Ssg.Html

namespace Ssg

open System

/-- A page of a site. -/
structure Page where
  /-- The path of the page's file, relative to the output directory, such as `docs/index.html`. -/
  path : FilePath
  html : Html

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

/--
Builds a site into `outDir`. Writes each of `pages`, and copies the files in `staticDir`, if it
exists. If `clean` is true, removes the contents of `outDir` first; otherwise, leaves the files that
the site doesn't overwrite.
-/
def build (outDir : FilePath) (pages : List Page) (staticDir : FilePath := "static")
    (clean := true) : IO Unit := do
  if clean && (← outDir.pathExists) then
    IO.FS.removeDirAll outDir
  IO.FS.createDirAll outDir
  if ← staticDir.isDir then
    copyDir staticDir outDir
  for page in pages do
    let target := outDir / page.path
    if let some parent := target.parent then
      IO.FS.createDirAll parent
    IO.FS.writeFile target page.html.renderDocument
  IO.println s!"Wrote {pages.length} {if pages.length == 1 then "page" else "pages"} to {outDir}"

end Ssg
