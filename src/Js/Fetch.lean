import Js.Promise
import Js.Deriving

/-!
Bindings for the Fetch API's `Headers`, `Request`, and `Response`, which browsers, Node, and
Cloudflare Workers provide as globals.

Each type wraps the JS object. A structure with a single `JsValue` field is represented by that
field, so these types also cross JS externs and exports as the JS object itself.

The bindings are in the `Js.Fetch` namespace, as names such as `Request` and `Response` are common.
-/

open Std.Async

namespace Js.Fetch

/-- A Fetch API `Headers` object. -/
structure Headers where
  val : JsValue
  deriving Inhabited

/-- A Fetch API `Request`. -/
structure Request where
  val : JsValue
  deriving Inhabited

/-- A Fetch API `Response`. -/
structure Response where
  val : JsValue
  deriving Inhabited

instance : ToJs Headers := ⟨(pure ·.val)⟩
instance : FromJs Headers := ⟨JsValue.wrapInstance "Headers" .mk⟩
instance : ToJs Request := ⟨(pure ·.val)⟩
instance : FromJs Request := ⟨JsValue.wrapInstance "Request" .mk⟩
instance : ToJs Response := ⟨(pure ·.val)⟩
instance : FromJs Response := ⟨JsValue.wrapInstance "Response" .mk⟩

namespace Headers

/-- Creates headers with the name-value pairs `entries`. -/
def new (entries : Array (String × String) := #[]) : IO Headers := do
  return ⟨← JsValue.new (← JsValue.getGlobal "Headers") #[← toJs entries]⟩

/--
Returns the value of the header `name`, which is case-insensitive, or `none` if there is no such
header. The values of a header that appears more than once are joined with `, `.
-/
def get (h : Headers) (name : String) : IO (Option String) := do
  fromJs (← h.val.callMethod "get" #[.ofString name])

/-- Returns whether there is a header `name`, which is case-insensitive. -/
def has (h : Headers) (name : String) : IO Bool := do
  fromJs (← h.val.callMethod "has" #[.ofString name])

/-- Sets the header `name` to `value`, replacing any values it has. -/
def set (h : Headers) (name value : String) : IO Unit := do
  fromJs (← h.val.callMethod "set" #[.ofString name, .ofString value])

/-- Adds `value` to the values of the header `name`. -/
def append (h : Headers) (name value : String) : IO Unit := do
  fromJs (← h.val.callMethod "append" #[.ofString name, .ofString value])

/-- Removes the header `name`. -/
def delete (h : Headers) (name : String) : IO Unit := do
  fromJs (← h.val.callMethod "delete" #[.ofString name])

/-- Returns the headers as name-value pairs, sorted by name, with names in lowercase. -/
def toArray (h : Headers) : IO (Array (String × String)) := do
  fromJs (← (← JsValue.getGlobal "Array").callMethod "from" #[h.val])

end Headers

/-- The options for creating a `Request`. -/
structure RequestInit where
  method : String := "GET"
  headers : Array (String × String) := #[]
  body : Option String := none
  deriving ToJs

namespace Request

/-- Creates a request for `url`. -/
def new (url : String) (init : RequestInit := {}) : IO Request := do
  return ⟨← JsValue.new (← JsValue.getGlobal "Request") #[.ofString url, ← toJs init]⟩

/-- The request's method, such as `GET`. A request's method never changes. -/
@[extern js inline "$rt.mkString(#1.method)"]
opaque method (r : @& Request) : String

/-- The request's URL. A request's URL never changes. -/
@[extern js inline "$rt.mkString(#1.url)"]
opaque url (r : @& Request) : String

/-- The request's headers, which are always the same object. -/
@[extern js inline "#1.headers"]
opaque headers (r : @& Request) : Headers

/-- Reads the request's body as text. A body can only be read once. -/
def text (r : Request) : Async String := do
  fromJs (← JsValue.await (← r.val.callMethod "text" #[]))

/-- Reads the request's body as JSON. A body can only be read once. -/
def json (r : Request) : Async JsValue := do
  JsValue.await (← r.val.callMethod "json" #[])

end Request

/-- The options for creating a `Response`. -/
structure ResponseInit where
  status : Nat := 200
  statusText : String := ""
  headers : Array (String × String) := #[]
  deriving ToJs

namespace Response

/-- Creates a response with the body `body`. -/
def new (body : String) (init : ResponseInit := {}) : IO Response := do
  return ⟨← JsValue.new (← JsValue.getGlobal "Response") #[.ofString body, ← toJs init]⟩

/-- The response's status code. A response's status never changes. -/
@[extern js inline "#1.status"]
opaque status (r : @& Response) : Nat

/-- Whether the response's status is successful, from 200 to 299. -/
@[extern js inline "#1.ok ? 1 : 0"]
opaque ok (r : @& Response) : Bool

/-- The response's headers, which are always the same object. -/
@[extern js inline "#1.headers"]
opaque headers (r : @& Response) : Headers

/-- Reads the response's body as text. A body can only be read once. -/
def text (r : Response) : Async String := do
  fromJs (← JsValue.await (← r.val.callMethod "text" #[]))

/-- Reads the response's body as JSON. A body can only be read once. -/
def json (r : Response) : Async JsValue := do
  JsValue.await (← r.val.callMethod "json" #[])

end Response

/--
Sends a request for `url`, and returns the response once its headers arrive. Throws an error if the
request fails, such as on a network error, but not if the response has an error status.
-/
def fetch (url : String) (init : RequestInit := {}) : Async Response := do
  let promise ← (← JsValue.getGlobal "fetch").call .undefined #[.ofString url, ← toJs init]
  fromJs (← JsValue.await promise)

end Js.Fetch
