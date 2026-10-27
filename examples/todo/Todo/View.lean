import Js
import Todo.Model

open Js.Dom

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

/-- Finds the page's elements in `doc`. -/
def Elements.find (doc : Document) : IO Elements := do
  return {
    doc
    form := ← getElement doc "new-todo" HtmlElement
    input := ← getElement doc "new-todo-text" HtmlInputElement
    list := ← getElement doc "todos" HtmlElement
    count := ← getElement doc "count" HtmlElement
    clearCompleted := ← getElement doc "clear-completed" HtmlElement
  }

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
  let left := state.itemsLeft
  els.count.setTextContent s!"{left} {if left == 1 then "item" else "items"} left"
  els.clearCompleted.setHidden (state.todos.all (!·.done))

/-- Returns the ID of the item whose list item contains `target`, if any. -/
def todoIdOf (target : Element) : IO (Option Nat) := do
  let some parent ← target.parentNode | return none
  let some id ← (← parent.cast Element).getAttribute "data-id" | return none
  return id.toNat?
