/-- An item on the list. -/
structure Todo where
  id : Nat
  text : String
  done : Bool := false

/-- The state of the app. -/
structure State where
  todos : Array Todo := #[]
  nextId : Nat := 0

namespace State

/-- Adds an item with the text `text`, unless it is blank. -/
def add (s : State) (text : String) : State :=
  let text := text.trimAscii.copy
  if text.isEmpty then
    s
  else
    { todos := s.todos.push { id := s.nextId, text }, nextId := s.nextId + 1 }

/-- Checks off the item `id`, or unchecks it if it is checked off. -/
def toggle (s : State) (id : Nat) : State :=
  { s with todos := s.todos.map fun t => if t.id == id then { t with done := !t.done } else t }

/-- Removes the item `id`. -/
def remove (s : State) (id : Nat) : State :=
  { s with todos := s.todos.filter (·.id != id) }

/-- Removes the items that are checked off. -/
def clearCompleted (s : State) : State :=
  { s with todos := s.todos.filter (!·.done) }

/-- Returns the number of items that are not checked off. -/
def itemsLeft (s : State) : Nat :=
  (s.todos.filter (!·.done)).size

end State
