import Js

open Js.Dom

/-- An item on the list. -/
structure Todo where
  id : Nat
  text : String
  done : Bool := false

/-- The state of the app. -/
structure State where
  todos : Array Todo := #[]
  nextId : Nat := 0

/-- The page's elements that the app reads or updates. -/
structure Elements where
  doc : Document
  form : HtmlElement
  input : HtmlInputElement
  list : HtmlElement
  count : HtmlElement
  clearCompleted : HtmlElement

/-- Returns the element with the ID `id` as a `β`, throwing an error if there is no such element. -/
def getElement (doc : Document) (id : String) (β : Type) [FromJs β] : IO β := do
  let some e ← doc.getElementById id | throw (.userError s!"no element with ID {id}")
  e.cast β

/-- Creates the list item for `todo`. -/
def renderTodo (doc : Document) (todo : Todo) : IO Node := do
  let li ← doc.createElement "li"
  if todo.done then
    li.classList.add "done"
  -- The list's listener finds the item by its ID.
  li.setAttribute "data-id" (toString todo.id)
  let checkbox ← (← doc.createElement "input").cast HtmlInputElement
  checkbox.setAttribute "type" "checkbox"
  checkbox.classList.add "toggle"
  checkbox.setChecked todo.done
  let text ← doc.createElement "span"
  text.setTextContent todo.text
  let remove ← doc.createElement "button"
  remove.classList.add "remove"
  remove.setAttribute "aria-label" "Remove"
  remove.setTextContent "×"
  li.append #[checkbox, text, remove]
  return li

/-- Updates the page to show `state`. -/
def render (els : Elements) (state : State) : IO Unit := do
  els.list.replaceChildren (← state.todos.mapM (renderTodo els.doc))
  let left := (state.todos.filter (!·.done)).size
  els.count.setTextContent s!"{left} {if left == 1 then "item" else "items"} left"
  els.clearCompleted.setHidden (state.todos.all (!·.done))

/-- Returns the ID of the todo whose list item contains `target`, if any. -/
def todoIdOf (target : Element) : IO (Option Nat) := do
  let some parent ← target.parentNode | return none
  let some id ← (← parent.cast Element).getAttribute "data-id" | return none
  return id.toNat?

def main : IO Unit := do
  let doc ← document
  let els : Elements := {
    doc
    form := ← getElement doc "new-todo" HtmlElement
    input := ← getElement doc "new-todo-text" HtmlInputElement
    list := ← getElement doc "todos" HtmlElement
    count := ← getElement doc "count" HtmlElement
    clearCompleted := ← getElement doc "clear-completed" HtmlElement
  }
  let state ← IO.mkRef ({} : State)
  let update (f : State → State) : IO Unit := do
    state.modify f
    render els (← state.get)

  els.form.addEventListener "submit" fun (e : Event) => do
    e.preventDefault
    let text := (← els.input.value).trimAscii.copy
    unless text.isEmpty do
      update fun s => { todos := s.todos.push { id := s.nextId, text }, nextId := s.nextId + 1 }
      els.input.setValue ""

  -- One listener handles the controls of every item, which are replaced on each render.
  els.list.addEventListener "click" fun (e : Event) => do
    let some target ← e.target | return
    let target ← target.cast Element
    let some id ← todoIdOf target | return
    if ← target.classList.contains "toggle" then
      update fun s => { s with
        todos := s.todos.map fun t => if t.id == id then { t with done := !t.done } else t }
    else if ← target.classList.contains "remove" then
      update fun s => { s with todos := s.todos.filter (·.id != id) }

  els.clearCompleted.addEventListener "click" fun (_ : Event) =>
    update fun s => { s with todos := s.todos.filter (!·.done) }

  render els (← state.get)
  els.input.focus
