/-! A library can't have both a default export and properties of one. -/

@[export default]
def greet (name : String) : String :=
  s!"Hello, {name}!"

@[export default.twice]
def twice (s : String) : String :=
  s ++ s
