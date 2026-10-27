/-! A library whose default export is a function. -/

@[export default]
def greet (name : String) : String :=
  s!"Hello, {name}!"

@[export twice]
def twice (s : String) : String :=
  s ++ s
