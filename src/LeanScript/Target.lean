import Std.Data.HashSet
import LeanScript.TargetExterns

namespace LeanScript

/-- A platform that a program can be compiled to run on. -/
inductive Target where
  | node
  | browser
  deriving Inhabited, BEq, Repr

namespace Target

def all : List Target := [node, browser]

def name : Target → String
  | node => "node"
  | browser => "browser"

def ofName? (name : String) : Option Target :=
  all.find? (·.name == name)

/-- The names of the externs that the runtime implements on `target`. -/
def externs (target : Target) : Std.HashSet String :=
  let names := match target with
    | node => nodeExterns
    | browser => browserExterns
  Std.HashSet.ofList (names.splitOn "\n")

end Target
