import Std.Internal.UV.System

open IO.Process

/-- Prints the error of `act`, or `ok` if it succeeds. -/
def attempt (label : String) (act : IO Unit) : IO Unit := do
  try
    act
    IO.println s!"{label}: ok"
  catch e =>
    IO.println s!"{label}: {e}"

def sh (script : String) : SpawnArgs := { cmd := "sh", args := #["-c", script] }

def printOutput (label : String) (out : Output) : IO Unit :=
  IO.println s!"{label}: exit {out.exitCode}, stdout {out.stdout.quote}, stderr {out.stderr.quote}"

def running : IO Unit := do
  printOutput "output" (← output (sh "echo out; echo err >&2; exit 3"))
  printOutput "input" (← output { cmd := "cat" } (some "piped input\n"))
  IO.println s!"run: {(← run { cmd := "echo", args := #["a b", "c\"d"] }).quote}"
  attempt "run failing" (discard <| run { cmd := "false" })
  -- Natively, a child that fails to start flushes the parent's buffered output into its own.
  (← IO.getStdout).flush
  printOutput "missing command" (← output { cmd := "leanscript-missing-command" })
  (← IO.getStdout).flush
  printOutput "missing cwd" (← output { cmd := "pwd", cwd := some "missing" })
  IO.FS.createDir "sub"
  let out ← output { cmd := "pwd", cwd := some "sub" }
  IO.println s!"cwd: {out.stdout.endsWith "/sub\n"}"
  -- Both streams fill the pipes, so reading one to the end must not stop the other.
  let out ← output (sh "head -c 200000 /dev/zero; head -c 300000 /dev/zero >&2")
  IO.println s!"large output: {out.stdout.length} {out.stderr.length}"

def environment : IO Unit := do
  let env := #[("A", some "1"), ("B", some "2"), ("B", none), ("HOME", none)]
  printOutput "env" (← output { sh "echo \"$A|${B-unset}|${HOME-unset}|${PATH:+path}\"" with env })
  Std.Internal.UV.System.osSetenv "LEANSCRIPT_PROCESS_TEST" "set"
  printOutput "changed env" (← output (sh "echo $LEANSCRIPT_PROCESS_TEST"))

def stdio : IO Unit := do
  (← IO.getStdout).flush
  let child ← spawn { cmd := "echo", args := #["inherited"] }
  IO.println s!"inherited: exit {← child.wait}"
  let child ← spawn { cmd := "echo", args := #["discarded"], stdout := .null }
  IO.println s!"null: exit {← child.wait}"
  let child ← spawn { sh "while read line; do echo \"got $line\"; done" with stdin := .piped, stdout := .piped }
  child.stdin.putStrLn "one"
  child.stdin.flush
  IO.println s!"first: {(← child.stdout.getLine).quote}"
  child.stdin.putStrLn "two"
  child.stdin.flush
  IO.println s!"second: {(← child.stdout.getLine).quote}"
  let (stdin, child) ← child.takeStdin
  stdin.putStrLn "three"
  stdin.flush
  -- Dropping the last reference to `stdin` closes it, which ends the loop.
  let _ := stdin
  IO.println s!"rest: {(← child.stdout.readToEnd).quote}"
  IO.println s!"exit: {← child.wait}"
  let child ← spawn { sh "echo $$" with stdout := .piped }
  let pid ← child.stdout.getLine
  IO.println s!"pid matches: {pid.trimAscii.toNat? == some child.pid.toNat}"
  discard child.wait

def lifecycle : IO Unit := do
  let child ← spawn { cmd := "sleep", args := #["10"] }
  IO.println s!"running: {← child.tryWait}"
  child.kill
  IO.println s!"killed: {← child.wait}"
  attempt "wait again" (discard child.wait)
  attempt "try wait again" (discard child.tryWait)
  attempt "kill again" child.kill
  let child ← spawn (sh "kill -TERM $$")
  IO.println s!"terminated: {← child.wait}"
  let child ← spawn (sh "exit 7")
  let mut status ← child.tryWait
  while status.isNone do
    IO.sleep 10
    status ← child.tryWait
  IO.println s!"polled: {status}"
  attempt "kill exited" child.kill
  let child ← spawn { sh "echo started; sleep 10 & wait" with setsid := true, stdout := .piped }
  -- The child is only in its own process group once it runs.
  discard child.stdout.getLine
  child.kill
  IO.println s!"killed group: {← child.wait}"

def main : IO Unit := do
  running
  environment
  stdio
  lifecycle
