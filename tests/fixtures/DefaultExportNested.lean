/-! Properties of the default export can't be nested. -/

@[export default.math.double]
def double (n : Nat) : Nat :=
  2 * n
