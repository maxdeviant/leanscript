import Js

/-! Types that `ToJs` and `FromJs` can't be derived for. -/

inductive Unnamed where
  | pair : Nat → Nat → Unnamed
  deriving ToJs

inductive Token where
  | word (kind : String)
  | space
  deriving ToJs

inductive Flag where
  | flag (kind? : Bool)
  deriving FromJs

inductive Vec (α : Type) : Nat → Type where
  | nil : Vec α 0
  | cons (head : α) (tail : Vec α n) : Vec α (n + 1)
  deriving ToJs

/-- A structure has no discriminator, so a field named `kind` is fine. -/
structure Labeled where
  kind : String
  deriving ToJs, FromJs

def main : IO Unit :=
  pure ()
