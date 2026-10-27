/-- Takes a small `Nat`, whose double is also small. -/
@[extern js "./JsExterns.js#double"]
opaque double : Nat → Nat

/-- Consumes its argument, as it is owned. -/
@[extern js "./JsExterns.js#shout"]
opaque shout : String → String

/-- Erased type arguments are not passed. -/
@[extern js "./JsExterns.js#typeOf"]
opaque typeOf {α : Type} (x : @& α) : String

/-- The world token is not passed, and the result is an `EST.Out`. -/
@[extern js "./JsExterns.js#tick"]
opaque tick : IO Nat

@[extern js inline "Math.max(#1, #2)"]
opaque fmax : Float → Float → Float

@[extern js inline "#2.toString().length"]
opaque utf16Length {α : Type} (n : Nat) (s : @& String) : Nat

def main : IO Unit := do
  IO.println (double 21)
  IO.println ([1, 2, 3].map double)
  IO.println (shout "hello")
  IO.println (typeOf "s")
  IO.println (typeOf (1.5 : Float))
  IO.println (← tick)
  IO.println (← tick)
  IO.println (fmax 1.5 2.5)
  IO.println (utf16Length (α := Unit) 0 "𝔸b")
