import Ssg.Html

namespace Ssg

open System

/-- An image of a site, which is drawn as an SVG and written as a PNG. -/
structure Image where
  /-- The path of the PNG, relative to the output directory. -/
  path : FilePath
  /-- The image, as an `svg` element. -/
  svg : Html

/-- Writes each SVG as a PNG, to the path that's paired with it. -/
abbrev Rasterizer := Array (FilePath × String) → IO Unit

/--
A rasterizer that runs `cmd` with `args` once for all of the images. It writes each image to the
command's stdin as the path of its PNG and then its SVG, each followed by a NUL, and expects the
command to write the PNGs.
-/
def rasterizeWith (cmd : String) (args : Array String := #[]) : Rasterizer := fun images => do
  if images.isEmpty then
    return
  if images.any fun (path, svg) => path.toString.contains '\x00' || svg.contains '\x00' then
    throw <| IO.userError "can't rasterize an image whose path or SVG contains a NUL"
  let child ← IO.Process.spawn { cmd, args, stdin := .piped }
  let (stdin, child) ← child.takeStdin
  for (path, svg) in images do
    stdin.putStr s!"{path}\x00{svg}\x00"
  stdin.flush
  -- The command reads until stdin closes, which happens when the handle is dropped here.
  let exitCode ← child.wait
  if exitCode != 0 then
    throw <| IO.userError s!"{cmd} exited with code {exitCode}"

end Ssg
