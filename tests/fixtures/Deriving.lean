inductive Suit where
  | hearts | diamonds | clubs | spades
  deriving Repr, BEq, Hashable, Ord, DecidableEq, Inhabited

structure Card where
  rank : Nat
  suit : Suit
  deriving Repr, BEq, Hashable, Ord, DecidableEq, Inhabited

structure Config where
  name : String := "default"
  verbose : Bool := false
  level : Int := -1
  ratio : Float := 0.5
  tags : List String := []
  limits : Array (String × Nat) := #[("cpu", 4), ("mem", 1024)]
  parent : Option Config := none
  deriving Repr, BEq

inductive Tree (α : Type) where
  | leaf
  | node (left : Tree α) (value : α) (right : Tree α)
  deriving Repr, BEq, Hashable, Ord

def Tree.insert [Ord α] : Tree α → α → Tree α
  | .leaf, x => .node .leaf x .leaf
  | .node l v r, x =>
    match compare x v with
    | .lt => .node (l.insert x) v r
    | .gt => .node l v (r.insert x)
    | .eq => .node l v r

def Tree.toList : Tree α → List α
  | .leaf => []
  | .node l v r => l.toList ++ [v] ++ r.toList

inductive Json where
  | null
  | bool (b : Bool)
  | num (n : Int)
  | str (s : String)
  | arr (xs : List Json)
  | obj (kvs : List (String × Json))
  deriving Repr, BEq, Inhabited

partial def Json.render : Json → String
  | .null => "null"
  | .bool b => toString b
  | .num n => toString n
  | .str s => s.quote
  | .arr xs => "[" ++ ",".intercalate (xs.map render) ++ "]"
  | .obj kvs => "{" ++ ",".intercalate (kvs.map fun (k, v) => k.quote ++ ":" ++ v.render) ++ "}"

class Shape (α : Type) where
  name : String
  area : α → Float
  perimeter : α → Float

structure Circle where
  r : Float

structure Rect where
  w : Float
  h : Float

instance : Shape Circle := ⟨"circle", fun c => 3.14159 * c.r * c.r, fun c => 2 * 3.14159 * c.r⟩
instance : Shape Rect := ⟨"rect", fun r => r.w * r.h, fun r => 2 * (r.w + r.h)⟩

def describe [Shape α] (x : α) : String :=
  s!"{Shape.name α}: area {Shape.area x}, perimeter {Shape.perimeter x}"

def main : IO Unit := do
  let cards := [Card.mk 10 .spades, ⟨2, .hearts⟩, ⟨10, .hearts⟩, ⟨14, .clubs⟩, ⟨2, .hearts⟩]
  IO.println (repr cards)
  IO.println (repr (cards.toArray.qsort (compare · · == .lt)))
  IO.println s!"{cards[1]! == cards[4]!} {cards[0]! == cards[2]!} {decide (cards[1]! = cards[4]!)} {hash cards[1]! == hash cards[4]!}"
  IO.println s!"{repr (compare cards[0]! cards[2]!)} {repr (compare Suit.hearts Suit.spades)} {repr (default : Suit)}"

  let cfg : Config := { name := "child", tags := ["a", "b"], parent := some {} }
  IO.println (repr cfg)
  IO.println (repr { cfg with level := 42, ratio := 1e-3, limits := #[] })
  IO.println s!"{cfg == cfg} {cfg == { cfg with verbose := true }}"
  IO.println ((repr cfg).pretty 40)

  let t := [5, 3, 8, 1, 4, 7, 9, 2, 6].foldl Tree.insert Tree.leaf
  IO.println (repr t)
  IO.println s!"{t.toList} {t == t} {hash t == hash ([5, 3, 8, 1, 4, 7, 9, 2, 6].foldl Tree.insert .leaf)} {repr (compare t .leaf)}"

  let j := Json.obj [("name", .str "leanscript"), ("tags", .arr [.str "lean", .str "js"]),
    ("version", .num 1), ("nested", .obj [("ok", .bool true), ("none", .null)])]
  IO.println j.render
  IO.println (repr j)
  IO.println (toString (repr j) |>.length)

  IO.println (describe (Circle.mk 2))
  IO.println (describe (Rect.mk 3 4))
  IO.println (repr (some (1, "x", [2.5, -1.0], #[some 'c', none])))
  IO.println (repr (Except.error "bad" : Except String Nat))
  IO.println s!"{(1, 2)} {[some 1, none]} {(#[1, 2] : Array Nat)} {(3 : Fin 5)} {(-7 : Int)} {'x'} {()} {"s"}"
  IO.println (Std.Format.joinSep [Std.Format.text "a", .text "b", .text "c"] ("," ++ .line) |>.pretty 3)
