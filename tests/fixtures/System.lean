import Std.Internal.UV.System

open Std.Internal.UV.System

/-- Prints the error of `act`, or `ok` if it succeeds. -/
def attempt (label : String) (act : IO Unit) : IO Unit := do
  try
    act
    IO.println s!"{label}: ok"
  catch e =>
    -- Error messages name the offending string, so show its NUL characters.
    IO.println s!"{label}: {(toString e).replace "\x00" "\\0"}"

def process : IO Unit := do
  IO.println s!"pid matches: {(← osGetPid) == (← IO.Process.getPID).toUInt64}"
  IO.println s!"has parent: {decide ((← osGetPpid) > 0)}"
  IO.println s!"has executable: {!(← exePath).isEmpty}"
  IO.println s!"has title: {!(← getProcessTitle).isEmpty}"
  setProcessTitle "lean-system-test"
  IO.println s!"title after set: {(← getProcessTitle).quote}"
  attempt "title with NUL" (setProcessTitle "a\x00b")
  let priority ← osGetPriority 0
  IO.println s!"priority matches own: {priority == (← osGetPriority (← osGetPid))}"
  attempt "set priority" (osSetPriority 0 priority)
  attempt "set priority out of range" (osSetPriority 0 100)
  attempt "priority of missing process" (discard <| osGetPriority 0x7fffffff)
  let usage ← getrusage
  IO.println s!"has max RSS: {decide (usage.maxRSS > 0)}"

def environment : IO Unit := do
  IO.println s!"unset: {← osGetenv "LEANSCRIPT_SYSTEM_TEST"}"
  osSetenv "LEANSCRIPT_SYSTEM_TEST" "hello"
  IO.println s!"set: {← osGetenv "LEANSCRIPT_SYSTEM_TEST"}"
  IO.println s!"IO.getEnv agrees: {← IO.getEnv "LEANSCRIPT_SYSTEM_TEST"}"
  let env ← osEnviron
  IO.println s!"in environ: {env.contains ("LEANSCRIPT_SYSTEM_TEST", "hello")}"
  osUnsetenv "LEANSCRIPT_SYSTEM_TEST"
  IO.println s!"unset again: {← osGetenv "LEANSCRIPT_SYSTEM_TEST"}"
  attempt "unset missing" (osUnsetenv "LEANSCRIPT_SYSTEM_TEST")
  IO.println s!"get with NUL: {← osGetenv "PATH\x00"}"
  attempt "set empty name" (osSetenv "" "x")
  attempt "set name with =" (osSetenv "a=b" "x")
  attempt "set name with NUL" (osSetenv "a\x00b" "x")
  attempt "set value with NUL" (osSetenv "a" "x\x00y")
  attempt "unset empty name" (osUnsetenv "")
  attempt "unset name with NUL" (osUnsetenv "a\x00b")
  let home ← osHomedir
  osSetenv "HOME" "/nowhere"
  IO.println s!"home follows HOME: {(← osHomedir) == "/nowhere"}"
  osSetenv "HOME" home

def directories : IO Unit := do
  let cwd ← cwd
  IO.println s!"cwd matches: {cwd == (← IO.currentDir).toString}"
  IO.FS.createDir "sub"
  chdir "sub"
  IO.println s!"after chdir: {(← Std.Internal.UV.System.cwd) == cwd ++ "/sub"}"
  chdir ".."
  attempt "chdir to missing" (chdir "missing")
  attempt "chdir with NUL" (chdir "a\x00b")
  IO.println s!"has home: {!(← osHomedir).isEmpty}"
  IO.println s!"has tmpdir: {!(← osTmpdir).isEmpty}"
  IO.println s!"tmpdir has no trailing slash: {!(← osTmpdir).endsWith "/"}"

def machine : IO Unit := do
  IO.println s!"has hostname: {!(← osGetHostname).isEmpty}"
  IO.println s!"has uptime: {decide ((← uptime) > 0)}"
  let uname ← osUname
  IO.println s!"has uname: {!uname.sysname.isEmpty && !uname.release.isEmpty && !uname.machine.isEmpty}"
  let user ← osGetPasswd
  IO.println s!"has user: {!user.username.isEmpty && user.uid.isSome && user.gid.isSome}"
  let cpus ← cpuInfo
  IO.println s!"has CPUs: {cpus.size > 0 && cpus.all (!·.model.isEmpty)}"
  let total ← totalMemory
  IO.println s!"memory: {total > 0 && (← freeMemory) ≤ total && (← availableMemory) > 0}"
  discard constrainedMemory

def time : IO Unit := do
  let a ← hrtime
  let b ← hrtime
  IO.println s!"hrtime is monotonic: {decide (a ≤ b)}"
  for n in [0, 16, 100000] do
    let some r ← IO.wait (← random n.toUInt64).result? | IO.println "random: dropped"
    match r with
    | .ok bytes => IO.println s!"random {n}: {bytes.size} bytes"
    | .error e => IO.println s!"random {n}: {e}"

def main : IO Unit := do
  process
  environment
  directories
  machine
  time
