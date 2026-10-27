import Js

structure Point where
  x : Float
  y : Float
  deriving ToJs, FromJs, Repr

structure Labeled (α : Type) where
  label : String
  value : α
  note? : Option String := none
  deriving ToJs, FromJs, Repr

structure Point3 extends Point where
  z : Float
  deriving ToJs, FromJs, Repr

inductive Color where
  | red | green | blue
  deriving ToJs, FromJs, Repr

inductive Shape where
  | circle (center : Point) (radius : Float)
  | rect (corner : Point) (width height : Float)
  | empty
  deriving ToJs, FromJs, Repr

inductive Tree (α : Type) where
  | leaf
  | node (left : Tree α) (value : α) (right : Tree α)
  deriving ToJs, FromJs, Repr

/-- Returns `v` as JSON. -/
def json (v : JsValue) : IO String := do
  let stringify ← (← JsValue.getGlobal "JSON").get "stringify"
  fromJs (← stringify.call .undefined #[v])

/-- Converts `a` to JSON and back, printing both. -/
def roundTrip [ToJs α] [FromJs α] [Repr α] (a : α) : IO Unit := do
  let v ← toJs a
  IO.println (← json v)
  IO.println (repr (← (fromJs v : IO α)))

/-- Parses `s` as JSON and converts the result to an `α`, printing any error. -/
def parse (α : Type) [FromJs α] [Repr α] (s : String) : IO Unit := do
  let v ← (← JsValue.getGlobal "JSON").callMethod "parse" #[.ofString s]
  try
    IO.println (repr (← (fromJs v : IO α)))
  catch e =>
    IO.println s!"error: {e}"

def main : IO Unit := do
  roundTrip ({ x := 1, y := 2 } : Point)
  roundTrip ({ label := "n", value := (3 : Nat), note? := some "hi" } : Labeled Nat)
  roundTrip ({ x := 1, y := 2, z := 3 } : Point3)
  roundTrip #[Color.red, .green, .blue]
  roundTrip #[Shape.circle { x := 0, y := 0 } 1, .rect { x := 1, y := 1 } 2 3, .empty]
  roundTrip (Tree.node .leaf "a" (.node .leaf "b" .leaf))

  parse Point "{\"x\": 1, \"y\": 2, \"extra\": true}"
  parse Point "{\"x\": 1}"
  parse Point "[1, 2]"
  parse Point "null"
  parse (Labeled Nat) "{\"label\": \"n\", \"value\": 1}"
  parse (Labeled Point) "{\"label\": \"p\", \"value\": {\"x\": 1, \"y\": \"2\"}}"
  parse Color "\"purple\""
  parse Color "0"
  parse Shape "{\"kind\": \"triangle\"}"
  parse Shape "{\"kind\": \"rect\", \"corner\": {\"x\": 0, \"y\": 0}, \"width\": 1}"
  parse Shape "\"empty\""
