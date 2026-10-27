import Js

initialize counter : IO.Ref Nat ← IO.mkRef 0

/-- Runs when the first export is called, rather than when the library is imported. -/
initialize
  IO.println "initializing"

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

/-- A constant is exported as a function that returns its value. -/
@[export answer]
def answer : Nat := 42

/-- An `async` function, which returns a JS promise. -/
@[export greetLater]
def greetLater (name : JsValue) : BaseIO JsValue :=
  JsValue.ofAsync do
    let name ← JsValue.await name
    return s!"Hello later, {name.toString?.getD "?"}!"

/-- An `async` function whose promise is rejected. -/
@[export failLater]
def failLater (msg : JsValue) : BaseIO JsValue :=
  JsValue.ofAsync (α := Unit) do
    let msg ← JsValue.await msg
    throw (IO.userError (msg.toString?.getD "?"))
