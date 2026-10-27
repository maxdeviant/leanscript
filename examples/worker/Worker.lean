import Js

open Std.Async

/-- Responds to `req` with a greeting, echoing the body of a `POST` request. -/
def handle (req : JsValue) : Async JsValue := do
  let url := (← req.get "url").toString?.getD "?"
  let method := (← req.get "method").toString?.getD "?"
  let body ←
    if method == "POST" then
      let text ← JsValue.await (← req.callMethod "text" #[])
      pure s!"Hello from Lean! You sent: {text.toString?.getD "?"}\n"
    else
      pure s!"Hello from Lean! You requested {url}\n"
  JsValue.new (← JsValue.getGlobal "Response") #[.ofString body]

/-- The Worker's `fetch` handler. -/
@[export fetch]
def fetch (req _env _ctx : JsValue) : BaseIO JsValue :=
  JsValue.ofAsync (handle req)
