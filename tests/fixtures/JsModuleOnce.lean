@[extern js "./JsModuleOnce.js#succ"]
opaque succ : Nat → Nat

def main : IO Unit :=
  IO.println (succ 41)
