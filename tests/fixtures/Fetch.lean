import Js

open Std.Async

def handle (req : Request) : Async Response := do
  let body ← if req.method == "POST" then req.text else pure ""
  let agent := (← req.headers.get "User-Agent").getD "unknown"
  Response.new s!"{req.method} {req.url} from {agent}: {body}"
    { status := 201, headers := #[("Content-Type", "text/plain"), ("X-Lean", "yes")] }

def program : Async Unit := do
  let get ← Request.new "https://example.com/a?b=c" { headers := #[("user-agent", "test")] }
  let post ← Request.new "https://example.com/" { method := "POST", body := some "hi" }
  for req in [get, post] do
    let res ← handle req
    IO.println s!"{res.status} {← res.text}"
    IO.println (← res.headers.toArray)

  let h ← Headers.new #[("a", "1")]
  h.append "A" "2"
  h.set "b" "3"
  IO.println (← h.get "a", ← h.has "b", ← h.get "c")
  h.delete "b"
  IO.println (← h.toArray)

  -- A JS value converts to a wrapper only if it is an instance of the wrapped class.
  IO.println (← (fromJs (← toJs post) : IO Request)).url
  try
    discard <| (fromJs (← toJs h) : IO Request)
  catch e =>
    IO.println s!"error: {e}"
  try
    discard <| Response.new "" { status := 99 }
  catch e =>
    IO.println s!"error: {e}"

def main : IO Unit := do
  discard <| EAsync.toBaseIO program
