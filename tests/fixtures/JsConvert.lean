import Js

/-- Returns `v` as JSON. -/
def json (v : JsValue) : IO String := do
  let stringify ← (← JsValue.getGlobal "JSON").get "stringify"
  fromJs (← stringify.call .undefined #[v])

/-- Converts `a` to a JS value and prints it as JSON. -/
def printJs [ToJs α] (a : α) : IO Unit := do
  IO.println (← json (← toJs a))

/-- Converts `a` to a JS value and back. -/
def roundTrip [ToJs α] [FromJs α] (a : α) : IO α := do
  fromJs (← toJs a)

/-- Parses `s` as JSON and converts the result to an `α`, printing any error. -/
def parse (α : Type) [FromJs α] [ToString α] (s : String) : IO Unit := do
  let v ← (← JsValue.getGlobal "JSON").callMethod "parse" #[.ofString s]
  try
    IO.println (← (fromJs v : IO α))
  catch e =>
    IO.println s!"error: {e}"

def main : IO Unit := do
  printJs "héllo"
  printJs (42 : Nat)
  printJs (-7 : Int)
  printJs (2.5 : Float)
  printJs true
  printJs (some "x", (none : Option Nat))
  printJs #[(1 : Nat), 2, 3]
  printJs [("a", (1 : Nat)), ("b", 2)]
  printJs (2 ^ 60 : Nat)
  IO.println (← toJs ()).typeOf

  IO.println (← roundTrip "héllo")
  IO.println (← roundTrip (2 ^ 53 - 1 : Nat))
  IO.println (← roundTrip (-(2 ^ 53 - 1) : Int))
  IO.println (← roundTrip #[some "a", none])
  IO.println (← roundTrip [(true, 1.5), (false, -0.5)])

  parse Nat "3"
  parse Nat "-0"
  parse Nat "-3"
  parse Nat "1.5"
  parse Nat "9007199254740992"
  parse Int "-3"
  parse String "3"
  parse (Option String) "null"
  parse (Option String) "\"x\""
  parse (Array Nat) "[1, 2, 3]"
  parse (Array Nat) "[1, \"2\"]"
  parse (Array Nat) "{}"
  parse (List (String × Bool)) "[[\"a\", true], [\"b\", false]]"
  parse (String × Bool) "[\"a\", true, 1]"
  parse Unit "{}"
  parse Bool "null"
