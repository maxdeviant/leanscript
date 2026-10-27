import Js
import Todo.Model
import Todo.View

open Js.Dom

def main : IO Unit := do
  let els ← Elements.find (← document)
  let state ← IO.mkRef ({} : State)
  let update (f : State → State) : IO Unit := do
    state.modify f
    render els (← state.get)

  els.form.addEventListener "submit" fun (e : Event) => do
    e.preventDefault
    let text ← els.input.value
    update (·.add text)
    els.input.setValue ""

  -- One listener handles the controls of every item, which are replaced on each render.
  els.list.addEventListener "click" fun (e : Event) => do
    let some target ← e.target | return
    let target ← target.cast Element
    let some id ← todoIdOf target | return
    if ← target.classList.contains "toggle" then
      update (·.toggle id)
    else if ← target.classList.contains "remove" then
      update (·.remove id)

  els.clearCompleted.addEventListener "click" fun (_ : Event) =>
    update (·.clearCompleted)

  render els (← state.get)
  els.input.focus
