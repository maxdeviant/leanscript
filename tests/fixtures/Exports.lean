import Js

initialize counter : IO.Ref Nat ← IO.mkRef 0

@[export greet]
def greet (name : String) : String :=
  s!"Hello, {name}!"

@[export add]
def add (a b : Nat) : Nat :=
  a + b

/-- An `IO` action returns its value, and its effects persist between calls. -/
@[export increment]
def increment : IO Nat := do
  counter.modify (· + 1)
  counter.get

/-- An `IO` action throws its error. -/
@[export fail]
def fail (msg : String) : IO Unit :=
  throw (IO.userError msg)

/-- A `BaseIO` action returns its value directly. -/
@[export counterValue]
def counterValue : BaseIO Nat :=
  counter.get

/-- Erased type arguments are not passed. -/
@[export kind]
def kind (_α : Type) (v : JsValue) : String :=
  v.typeOf

@[export printLine]
def printLine (s : String) : IO Unit :=
  IO.println s

/-- A constant is exported as its value. -/
@[export answer]
def answer : Nat := 42
