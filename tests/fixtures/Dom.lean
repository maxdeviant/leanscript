import Js

open Js.Dom

def outerHtml (e : Element) : IO String := do
  fromJs (← e.val.get "outerHTML")

def main : IO Unit := do
  let doc ← document
  let some body ← doc.body | throw (.userError "no body")

  -- Finding elements in the page.
  let some app ← doc.getElementById "app" | throw (.userError "no #app")
  IO.println s!"{app.tagName} {← app.id}: {← app.textContent}"
  for li in ← app.querySelectorAll "li" do
    IO.println (← li.textContent)
  IO.println (← (← doc.querySelector "b").mapM (·.textContent))
  IO.println ((← doc.getElementById "missing").isSome, (← app.querySelector "p").isSome)

  -- Building elements.
  let list ← doc.createElement "ul"
  list.setId "items"
  list.classList.add "todo"
  for item in ["milk", "eggs"] do
    let li ← doc.createElement "li"
    li.setTextContent item
    list.appendChild li
  app.replaceChildren #[list, ← doc.createTextNode "!"]
  IO.println (← outerHtml app)
  let first ← doc.createElement "li"
  first.setTextContent "bread"
  list.insertBefore first (← list.childNodes)[0]?
  list.removeChild (← list.childNodes)[2]!
  IO.println (← outerHtml list)
  IO.println ((← (← first.parentNode).mapM (·.cast Element)).map (·.tagName))

  -- Attributes and classes.
  list.setAttribute "data-count" "2"
  IO.println (← list.getAttribute "data-count", ← list.hasAttribute "title")
  list.removeAttribute "data-count"
  IO.println (← list.getAttribute "data-count")
  IO.println (← list.classList.toggle "done", ← list.classList.toggle "done" (some true))
  IO.println (← list.classList.contains "todo", ← list.classList.contains "done")
  list.classList.remove "todo"
  list.setHidden true
  IO.println (← outerHtml list, ← list.hidden)
  list.remove
  IO.println (← outerHtml app)

  -- Listeners, which receive events that bubble up from descendants.
  let button ← doc.createElement "button"
  button.setTextContent "Add"
  app.appendChild button
  let clicks ← IO.mkRef 0
  button.addEventListener "click" fun (e : Event) => do
    clicks.modify (· + 1)
    let some target ← e.target | throw (.userError "no target")
    IO.println s!"{← e.type} on {(← target.cast Element).tagName}"
  app.addEventListener "click" fun (e : Event) => do
    let some target ← e.currentTarget | throw (.userError "no current target")
    IO.println s!"bubbled to {← (← target.cast Element).id}"
  button.click
  button.click
  IO.println s!"{← clicks.get} clicks"

  -- Keyboard events and inputs.
  let input ← (← doc.createElement "input").cast HtmlInputElement
  input.addEventListener "keydown" fun (e : KeyboardEvent) => do
    if (← e.key) == "Enter" then
      IO.println s!"submitted {← input.value}"
      input.setValue ""
  input.setValue "milk"
  discard <| input.dispatchEvent (← KeyboardEvent.new "keydown" { key := "a" })
  discard <| input.dispatchEvent (← KeyboardEvent.new "keydown" { key := "Enter" })
  IO.println (← input.value).isEmpty
  let checkbox ← (← doc.createElement "input").cast HtmlInputElement
  checkbox.setAttribute "type" "checkbox"
  checkbox.click
  IO.println (← checkbox.checked)
  checkbox.setChecked false
  IO.println (← checkbox.checked)

  -- Canceling events.
  let form ← doc.createElement "form"
  form.addEventListener "submit" fun (e : Event) => e.preventDefault
  let submit ← Event.new "submit" { cancelable := true }
  IO.println (← form.dispatchEvent submit, ← submit.defaultPrevented)
  IO.println (← form.dispatchEvent (← Event.new "submit"))

  -- Errors converting events are reported, as other errors thrown by listeners are.
  body.addEventListener "ping" fun (_ : KeyboardEvent) => IO.println "unreachable"
  IO.println (← body.dispatchEvent (← Event.new "ping"))

  -- Casting to a type that a value is not is an error.
  try
    discard <| app.cast HtmlInputElement
  catch e =>
    IO.println s!"error: {e}"
