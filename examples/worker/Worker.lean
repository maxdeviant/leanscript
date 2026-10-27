import Js

open Std.Async

/-- Responds to `req` with a greeting, echoing the body of a `POST` request. -/
def handle (req : Request) : Async Response := do
  let body ←
    if req.method == "POST" then
      pure s!"Hello from Lean! You sent: {← req.text}\n"
    else
      pure s!"Hello from Lean! You requested {req.url}\n"
  Response.new body { headers := #[("Content-Type", "text/plain; charset=utf-8")] }

/-- The Worker's `fetch` handler. -/
@[export default.fetch]
def fetch (req : Request) (_env _ctx : JsValue) : BaseIO JsValue :=
  JsValue.ofAsync (handle req)
