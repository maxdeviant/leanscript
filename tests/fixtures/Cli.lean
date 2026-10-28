/-! A small command-line tool that reads scores from standard input, writes a report to a file, reads
it back, and exits with a status code reporting whether every input line was valid. -/

structure Options where
  minScore : Nat := 0
  outDir : System.FilePath := "out"
  verbose : Bool := false
  deriving Repr

def parseArgs : List String → Options → Except String Options
  | [], opts => .ok opts
  | "--min" :: n :: rest, opts =>
    match n.toNat? with
    | some n => parseArgs rest { opts with minScore := n }
    | none => .error s!"invalid --min value: {n}"
  | "--out" :: dir :: rest, opts => parseArgs rest { opts with outDir := dir }
  | "--verbose" :: rest, opts => parseArgs rest { opts with verbose := true }
  | arg :: _, _ => .error s!"unknown argument: {arg}"

structure Entry where
  name : String
  score : Nat

def parseEntry (line : String) : Except String Entry :=
  match line.splitOn " " |>.filter (!·.isEmpty) with
  | [name, score] =>
    match score.toNat? with
    | some score => .ok { name, score }
    | none => .error s!"invalid score {score.quote}"
  | _ => .error s!"expected a name and a score, got {line.quote}"

/-- Reads the lines of `stream` until the end of input, without their line terminators. -/
partial def readLines (stream : IO.FS.Stream) (acc : Array String := #[]) : IO (Array String) := do
  let line ← stream.getLine
  if line.isEmpty then
    return acc
  readLines stream (acc.push (line.trimAsciiEnd).toString)

def report (entries : Array Entry) (opts : Options) : String := Id.run do
  let passing := entries.filter (·.score ≥ opts.minScore)
  let sorted := passing.qsort fun a b => a.score > b.score || (a.score == b.score && a.name < b.name)
  let mut out := s!"# {sorted.size} of {entries.size} at or above {opts.minScore}\n"
  for e in sorted do
    out := out ++ s!"{e.name}\t{e.score}\n"
  return out

def fileOps (opts : Options) (contents : String) : IO Unit := do
  let dir := opts.outDir
  IO.FS.createDirAll (dir / "nested")
  let path := dir / "report.txt"
  IO.FS.writeFile path contents
  IO.FS.withFile path .append fun h => h.putStrLn "# end"
  let lines ← IO.FS.lines path
  IO.println s!"report has {lines.size} lines, last: {lines.back!.quote}"
  let bytes ← IO.FS.readBinFile path
  IO.println s!"report has {bytes.size} bytes, starting with {bytes[0]!}"
  IO.println s!"exists: {← path.pathExists}, is dir: {← path.isDir}, dir is dir: {← dir.isDir}"
  -- Reading in small chunks exercises partial reads and the end-of-file check.
  let h ← IO.FS.Handle.mk path .read
  let mut chunks := 0
  let mut total := 0
  repeat
    let chunk ← h.read 7
    if chunk.isEmpty then
      break
    chunks := chunks + 1
    total := total + chunk.size
  IO.println s!"read {total} bytes in {chunks} chunks"
  IO.FS.writeBinFile (dir / "nested" / "data.bin") (ByteArray.mk #[0, 1, 2, 255])
  let entries ← (dir / "nested").readDir
  IO.println s!"nested entries: {entries.map (·.fileName)}"
  IO.FS.removeFile path
  IO.println s!"exists after removal: {← path.pathExists}"
  IO.FS.removeDirAll dir
  IO.println s!"dir exists after removal: {← dir.pathExists}"

def errors : IO Unit := do
  try
    let _ ← IO.FS.readFile "missing.txt"
  catch e =>
    IO.println s!"error: {e}"
  try
    IO.FS.createDir "."
  catch e =>
    IO.println s!"error: {e}"
  try
    IO.FS.removeFile "missing.txt"
  catch e =>
    IO.println s!"error: {e}"

def directories : IO Unit := do
  let start ← IO.Process.getCurrentDir
  IO.FS.createDirAll "work/inner"
  IO.Process.setCurrentDir "work/inner"
  let cwd ← IO.currentDir
  IO.println s!"in {cwd.fileName}, under {start.fileName}: {cwd == start / "work" / "inner"}"
  IO.FS.writeFile "note.txt" "relative"
  IO.Process.setCurrentDir "../.."
  IO.println s!"back: {(← IO.Process.getCurrentDir) == start}"
  IO.println s!"note: {← IO.FS.readFile ("work" / "inner" / "note.txt")}"
  IO.FS.removeDirAll "work"
  try
    IO.Process.setCurrentDir "missing"
  catch e =>
    IO.println s!"error: {e}"
  IO.println s!"unchanged: {(← IO.Process.getCurrentDir) == start}"

/-- Returns whether `x` throws, without printing the error, whose message names a random path. -/
def throws (x : IO Unit) : IO Bool :=
  try x; return false catch _ => return true

def temporaries : IO Unit := do
  let tempPath ← IO.FS.withTempFile fun h path => do
    h.putStr "temporary"
    h.rewind
    IO.println s!"temp file: {← h.readToEnd}, named tmp.*: {path.fileName.any (·.startsWith "tmp.")}"
    let readOnly : IO.FileRight := { user := { read := true } }
    IO.setAccessRights path readOnly
    IO.println s!"read-only write fails: {← throws (IO.FS.writeFile path "x")}"
    IO.setAccessRights path { user := { read := true, write := true } }
    IO.FS.writeFile path "rewritten"
    IO.println s!"after restoring: {← IO.FS.readFile path}"
    return path
  IO.println s!"temp file exists after use: {← tempPath.pathExists}"
  let tempDir ← IO.FS.withTempDir fun dir => do
    IO.FS.writeFile (dir / "inside.txt") "inside"
    IO.println s!"temp dir is dir: {← dir.isDir}, entries: {(← dir.readDir).map (·.fileName)}"
    return dir
  IO.println s!"temp dir exists after use: {← tempDir.pathExists}"
  let (h₁, p₁) ← IO.FS.createTempFile
  let (h₂, p₂) ← IO.FS.createTempFile
  h₁.putStr "one"
  h₂.putStr "two"
  IO.println s!"distinct temp files: {p₁ != p₂}, {← IO.FS.readFile p₁} {← IO.FS.readFile p₂}"
  IO.FS.removeFile p₁
  IO.FS.removeFile p₂
  IO.println s!"missing file: {← throws (IO.setAccessRights "missing.txt" {})}"

def timing : IO Unit := do
  let ms ← IO.monoMsNow
  let ns ← IO.monoNanosNow
  IO.sleep 20
  let ms' ← IO.monoMsNow
  let ns' ← IO.monoNanosNow
  IO.println s!"slept at least 20ms: {ms' - ms ≥ 20 && ns' - ns ≥ 20000000}"

def main (args : List String) : IO UInt32 := do
  IO.println s!"args: {args}"
  IO.println s!"HOME is set: {(← IO.getEnv "HOME").isSome}, UNSET_VAR: {← IO.getEnv "LEANSCRIPT_UNSET_VAR"}"
  let opts ← match parseArgs args {} with
    | .ok opts => pure opts
    | .error msg =>
      IO.eprintln msg
      IO.Process.exit 2
  IO.println s!"options: {repr opts}"
  let lines ← readLines (← IO.getStdin)
  let mut entries := #[]
  let mut invalid := 0
  for line in lines, i in [1:lines.size + 1] do
    match parseEntry line with
    | .ok e => entries := entries.push e
    | .error msg =>
      invalid := invalid + 1
      IO.println s!"line {i}: {msg}"
  let contents := report entries opts
  IO.print contents
  fileOps opts contents
  errors
  directories
  temporaries
  timing
  let stdout ← IO.getStdout
  stdout.flush
  if invalid > 0 then
    IO.Process.exit 3
  return 0
