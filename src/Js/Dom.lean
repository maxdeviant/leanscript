module

public import Js.Function
import Js.Deriving

/-!
Bindings for the DOM, which browsers provide as globals.

Each type wraps the JS object, and extends the type of the JS class it inherits from, so a structure
with a single field represents each of them, and they cross JS externs and exports as the JS object
itself. Dot notation finds the methods of the classes a value inherits from, as in JS, and each type
coerces to the types it extends. `EventTarget.cast` converts to a more specific type.

The bindings are in the `Js.Dom` namespace, as DOM names such as `Event` and `Node` are common.
-/

public section

namespace Js.Dom

/-- A DOM `EventTarget`, which can receive events and have listeners for them. -/
structure EventTarget where
  val : JsValue
  deriving Inhabited

/-- A DOM `Node`. -/
structure Node extends EventTarget
  deriving Inhabited

/-- A DOM `Element`. -/
structure Element extends Node
  deriving Inhabited

/-- A DOM `HTMLElement`. -/
structure HtmlElement extends Element
  deriving Inhabited

/-- A DOM `HTMLInputElement`. -/
structure HtmlInputElement extends HtmlElement
  deriving Inhabited

/-- A DOM `Text` node. -/
structure Text extends Node
  deriving Inhabited

/-- A DOM `Document`. -/
structure Document extends Node
  deriving Inhabited

/-- A DOM `DOMTokenList`, a set of tokens such as an element's classes. -/
structure DomTokenList where
  val : JsValue
  deriving Inhabited

/-- A DOM `Event`. -/
structure Event where
  val : JsValue
  deriving Inhabited

/-- A DOM `KeyboardEvent`. -/
structure KeyboardEvent extends Event
  deriving Inhabited

instance : Coe Node EventTarget := ⟨Node.toEventTarget⟩
instance : Coe Element Node := ⟨Element.toNode⟩
instance : Coe HtmlElement Element := ⟨HtmlElement.toElement⟩
instance : Coe HtmlInputElement HtmlElement := ⟨HtmlInputElement.toHtmlElement⟩
instance : Coe Text Node := ⟨Text.toNode⟩
instance : Coe Document Node := ⟨Document.toNode⟩
instance : Coe KeyboardEvent Event := ⟨KeyboardEvent.toEvent⟩

instance : ToJs EventTarget := ⟨(pure ·.val)⟩
instance : FromJs EventTarget := ⟨JsValue.wrapInstance "EventTarget" fun val => { val }⟩
instance : ToJs Node := ⟨(pure ·.val)⟩
instance : FromJs Node := ⟨JsValue.wrapInstance "Node" fun val => { val }⟩
instance : ToJs Element := ⟨(pure ·.val)⟩
instance : FromJs Element := ⟨JsValue.wrapInstance "Element" fun val => { val }⟩
instance : ToJs HtmlElement := ⟨(pure ·.val)⟩
instance : FromJs HtmlElement := ⟨JsValue.wrapInstance "HTMLElement" fun val => { val }⟩
instance : ToJs HtmlInputElement := ⟨(pure ·.val)⟩
instance : FromJs HtmlInputElement := ⟨JsValue.wrapInstance "HTMLInputElement" fun val => { val }⟩
instance : ToJs Text := ⟨(pure ·.val)⟩
instance : FromJs Text := ⟨JsValue.wrapInstance "Text" fun val => { val }⟩
instance : ToJs Document := ⟨(pure ·.val)⟩
instance : FromJs Document := ⟨JsValue.wrapInstance "Document" fun val => { val }⟩
instance : ToJs DomTokenList := ⟨(pure ·.val)⟩
instance : FromJs DomTokenList := ⟨JsValue.wrapInstance "DOMTokenList" fun val => { val }⟩
instance : ToJs Event := ⟨(pure ·.val)⟩
instance : FromJs Event := ⟨JsValue.wrapInstance "Event" fun val => { val }⟩
instance : ToJs KeyboardEvent := ⟨(pure ·.val)⟩
instance : FromJs KeyboardEvent := ⟨JsValue.wrapInstance "KeyboardEvent" fun val => { val }⟩

/-- Returns the elements of the JS iterable `v`, such as a `NodeList`, converted to `α`s. -/
private def iterableToArray [FromJs α] (v : JsValue) : IO (Array α) := do
  fromJs (← (← JsValue.getGlobal "Array").callMethod "from" #[v])

namespace EventTarget

/--
Converts `t` to a `β`, such as a more specific type of node, throwing an error if the JS object is
not one.
-/
def cast (β : Type) [FromJs β] (t : EventTarget) : IO β :=
  fromJs t.val

/--
Calls `listener` with each event of type `type` that `t` receives. Converting an event to an `ε`
that it is not throws an error from the listener.
-/
def addEventListener [FromJs ε] (t : EventTarget) (type : String) (listener : ε → IO Unit) :
    IO Unit := do
  discard <| t.val.callMethod "addEventListener" #[.ofString type, ← toJs listener]

/--
Dispatches `e` to `t`, calling its listeners before returning. Returns `false` if a listener
canceled `e`, and `true` otherwise.
-/
def dispatchEvent (t : EventTarget) (e : Event) : IO Bool := do
  fromJs (← t.val.callMethod "dispatchEvent" #[e.val])

end EventTarget

namespace Node

/-- Returns the text of `n` and its descendants, which is empty for a document. -/
def textContent (n : Node) : IO String := do
  return (← (fromJs (← n.val.get "textContent") : IO (Option String))).getD ""

/-- Replaces the children of `n` with the text `s`, or sets the text of a text node. -/
def setTextContent (n : Node) (s : String) : IO Unit :=
  n.val.set "textContent" (.ofString s)

/-- Returns the parent of `n`, or `none` if it has none. -/
def parentNode (n : Node) : IO (Option Node) := do
  fromJs (← n.val.get "parentNode")

/-- Returns the children of `n`. -/
def childNodes (n : Node) : IO (Array Node) := do
  iterableToArray (← n.val.get "childNodes")

/-- Adds `child` as the last child of `parent`, moving it from its current parent, if any. -/
def appendChild (parent child : Node) : IO Unit := do
  discard <| parent.val.callMethod "appendChild" #[child.val]

/--
Inserts `child` into `parent` before its child `ref`, or as its last child if `ref` is `none`,
moving it from its current parent, if any.
-/
def insertBefore (parent child : Node) (ref : Option Node) : IO Unit := do
  discard <| parent.val.callMethod "insertBefore" #[child.val, ← toJs ref]

/-- Removes the child `child` from `parent`, throwing an error if it is not a child of `parent`. -/
def removeChild (parent child : Node) : IO Unit := do
  discard <| parent.val.callMethod "removeChild" #[child.val]

end Node

namespace Element

/-- The element's tag name, in uppercase for HTML elements. An element's tag name never changes. -/
@[extern js inline "$rt.mkString(#1.tagName)"]
opaque tagName (e : @& Element) : String

/-- Returns the element's ID, which is empty if it has none. -/
def id (e : Element) : IO String := do
  fromJs (← e.val.get "id")

/-- Sets the element's ID. -/
def setId (e : Element) (id : String) : IO Unit :=
  e.val.set "id" (.ofString id)

/-- Returns the value of the attribute `name`, or `none` if the element doesn't have it. -/
def getAttribute (e : Element) (name : String) : IO (Option String) := do
  fromJs (← e.val.callMethod "getAttribute" #[.ofString name])

/-- Returns whether the element has the attribute `name`. -/
def hasAttribute (e : Element) (name : String) : IO Bool := do
  fromJs (← e.val.callMethod "hasAttribute" #[.ofString name])

/-- Sets the attribute `name` to `value`. -/
def setAttribute (e : Element) (name value : String) : IO Unit := do
  discard <| e.val.callMethod "setAttribute" #[.ofString name, .ofString value]

/-- Removes the attribute `name`, if the element has it. -/
def removeAttribute (e : Element) (name : String) : IO Unit := do
  discard <| e.val.callMethod "removeAttribute" #[.ofString name]

/-- The element's classes, which are always the same object. -/
@[extern js inline "#1.classList"]
opaque classList (e : @& Element) : DomTokenList

/-- Returns the first descendant of `e` that matches the CSS selector `selector`, if any. -/
def querySelector (e : Element) (selector : String) : IO (Option Element) := do
  fromJs (← e.val.callMethod "querySelector" #[.ofString selector])

/-- Returns the descendants of `e` that match the CSS selector `selector`, in document order. -/
def querySelectorAll (e : Element) (selector : String) : IO (Array Element) := do
  iterableToArray (← e.val.callMethod "querySelectorAll" #[.ofString selector])

/-- Adds `children` after the last child of `e`, moving each from its current parent, if any. -/
def append (e : Element) (children : Array Node) : IO Unit := do
  discard <| e.val.callMethod "append" (children.map (·.val))

/-- Replaces the children of `e` with `children`, moving each from its current parent, if any. -/
def replaceChildren (e : Element) (children : Array Node) : IO Unit := do
  discard <| e.val.callMethod "replaceChildren" (children.map (·.val))

/-- Removes `e` from its parent, if it has one. -/
def remove (e : Element) : IO Unit := do
  discard <| e.val.callMethod "remove" #[]

end Element

namespace DomTokenList

/-- Returns whether the list contains `token`. -/
def contains (l : DomTokenList) (token : String) : IO Bool := do
  fromJs (← l.val.callMethod "contains" #[.ofString token])

/-- Adds `token` to the list, if it is not already in it. -/
def add (l : DomTokenList) (token : String) : IO Unit := do
  discard <| l.val.callMethod "add" #[.ofString token]

/-- Removes `token` from the list, if it is in it. -/
def remove (l : DomTokenList) (token : String) : IO Unit := do
  discard <| l.val.callMethod "remove" #[.ofString token]

/--
Adds `token` to the list if `force` is `some true`, removes it if `force` is `some false`, and
otherwise adds it if it is not in the list and removes it if it is. Returns whether the list then
contains `token`.
-/
def toggle (l : DomTokenList) (token : String) (force : Option Bool := none) : IO Bool := do
  let force ← match force with
    | some b => pure #[.ofBool b]
    | none => pure #[]
  fromJs (← l.val.callMethod "toggle" (#[.ofString token] ++ force))

end DomTokenList

namespace HtmlElement

/-- Returns whether the element is hidden, by its `hidden` attribute. -/
def hidden (e : HtmlElement) : IO Bool := do
  fromJs (← e.val.get "hidden")

/-- Hides or shows the element, by setting or removing its `hidden` attribute. -/
def setHidden (e : HtmlElement) (hidden : Bool) : IO Unit :=
  e.val.set "hidden" (.ofBool hidden)

/-- Focuses the element, if it can be focused. -/
def focus (e : HtmlElement) : IO Unit := do
  discard <| e.val.callMethod "focus" #[]

/-- Simulates a click on the element, dispatching a `click` event to it. -/
def click (e : HtmlElement) : IO Unit := do
  discard <| e.val.callMethod "click" #[]

end HtmlElement

namespace HtmlInputElement

/-- Returns the input's value. -/
def value (e : HtmlInputElement) : IO String := do
  fromJs (← e.val.get "value")

/-- Sets the input's value. -/
def setValue (e : HtmlInputElement) (value : String) : IO Unit :=
  e.val.set "value" (.ofString value)

/-- Returns whether the input, such as a checkbox, is checked. -/
def checked (e : HtmlInputElement) : IO Bool := do
  fromJs (← e.val.get "checked")

/-- Checks or unchecks the input, such as a checkbox. -/
def setChecked (e : HtmlInputElement) (checked : Bool) : IO Unit :=
  e.val.set "checked" (.ofBool checked)

end HtmlInputElement

/-- Returns the global `document`, throwing an error if there is none, as outside a browser. -/
def document : IO Document := do
  fromJs (← JsValue.getGlobal "document")

namespace Document

/-- Returns the document's `body` element, or `none` if it has none. -/
def body (d : Document) : IO (Option HtmlElement) := do
  fromJs (← d.val.get "body")

/-- Creates an HTML element with the tag name `tag`. -/
def createElement (d : Document) (tag : String) : IO HtmlElement := do
  fromJs (← d.val.callMethod "createElement" #[.ofString tag])

/-- Creates a text node with the text `s`. -/
def createTextNode (d : Document) (s : String) : IO Text := do
  fromJs (← d.val.callMethod "createTextNode" #[.ofString s])

/-- Returns the element with the ID `id`, or `none` if there is none. -/
def getElementById (d : Document) (id : String) : IO (Option Element) := do
  fromJs (← d.val.callMethod "getElementById" #[.ofString id])

/-- Returns the first element that matches the CSS selector `selector`, if any. -/
def querySelector (d : Document) (selector : String) : IO (Option Element) := do
  fromJs (← d.val.callMethod "querySelector" #[.ofString selector])

/-- Returns the elements that match the CSS selector `selector`, in document order. -/
def querySelectorAll (d : Document) (selector : String) : IO (Array Element) := do
  iterableToArray (← d.val.callMethod "querySelectorAll" #[.ofString selector])

end Document

/-- The options for creating an `Event`. -/
structure EventInit where
  bubbles : Bool := false
  cancelable : Bool := false
  deriving ToJs

namespace Event

/-- Creates an event of type `type`. -/
def new (type : String) (init : EventInit := {}) : IO Event := do
  return ⟨← JsValue.new (← JsValue.getGlobal "Event") #[.ofString type, ← toJs init]⟩

/-- Returns the event's type, such as `click`. -/
def type (e : Event) : IO String := do
  fromJs (← e.val.get "type")

/-- Returns the target that the event was dispatched to, or `none` if it has not been dispatched. -/
def target (e : Event) : IO (Option EventTarget) := do
  fromJs (← e.val.get "target")

/--
Returns the target whose listener is being called, which differs from `target` for an event that
bubbled up from a descendant, or `none` outside of a listener.
-/
def currentTarget (e : Event) : IO (Option EventTarget) := do
  fromJs (← e.val.get "currentTarget")

/-- Cancels the event's default action, such as submitting a form, if it is cancelable. -/
def preventDefault (e : Event) : IO Unit := do
  discard <| e.val.callMethod "preventDefault" #[]

/-- Returns whether the event's default action was canceled. -/
def defaultPrevented (e : Event) : IO Bool := do
  fromJs (← e.val.get "defaultPrevented")

/-- Stops the event from reaching any further targets once the current target's listeners return. -/
def stopPropagation (e : Event) : IO Unit := do
  discard <| e.val.callMethod "stopPropagation" #[]

end Event

/-- The options for creating a `KeyboardEvent`. -/
structure KeyboardEventInit where
  bubbles : Bool := false
  cancelable : Bool := false
  key : String := ""
  deriving ToJs

namespace KeyboardEvent

/-- Creates a keyboard event of type `type`, such as `keydown`. -/
def new (type : String) (init : KeyboardEventInit := {}) : IO KeyboardEvent := do
  return ⟨⟨← JsValue.new (← JsValue.getGlobal "KeyboardEvent") #[.ofString type, ← toJs init]⟩⟩

/-- Returns the key's value, such as `a` or `Enter`. -/
def key (e : KeyboardEvent) : IO String := do
  fromJs (← e.val.get "key")

end KeyboardEvent

end Js.Dom
