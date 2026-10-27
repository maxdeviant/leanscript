/-- Hides `x` from the compiler, so that operations on it are not constant folded. -/
def hide (x : α) : IO α := do
  (← IO.mkRef x).get

def arith [ToString α] [Add α] [Sub α] [Mul α] [Div α] [Mod α] [AndOp α] [OrOp α] [XorOp α]
    [Complement α] [ShiftLeft α] [ShiftRight α] [Neg α] [LT α] [LE α] [BEq α]
    [DecidableRel (α := α) (· < ·)] [DecidableRel (α := α) (· ≤ ·)]
    (name : String) (vals : List α) : IO Unit := do
  IO.println s!"== {name}"
  for a in vals do
    let a ← hide a
    IO.println s!"{a}: ~{~~~a} -{-a}"
    for b in vals do
      let b ← hide b
      IO.println s!"  {b}: {a + b} {a - b} {a * b} {a / b} {a % b} {a &&& b} {a ||| b} {a ^^^ b} {a <<< b} {a >>> b} {decide (a < b)} {decide (a ≤ b)} {a == b}"

/--
Like `arith`, but only performs operations whose results do not depend on the width of `α`, which
for `USize` and `ISize` differs between platforms.
-/
def arithPortable [ToString α] [Add α] [Mul α] [Div α] [Mod α] [AndOp α] [OrOp α] [XorOp α]
    [ShiftLeft α] [ShiftRight α] [OfNat α 3] [LT α] [LE α] [BEq α]
    [DecidableRel (α := α) (· < ·)] [DecidableRel (α := α) (· ≤ ·)]
    (name : String) (vals : List α) : IO Unit := do
  IO.println s!"== {name}"
  for a in vals do
    let a ← hide a
    IO.println s!"{a}: {a <<< 3} {a >>> 3}"
    for b in vals do
      let b ← hide b
      IO.println s!"  {b}: {a + b} {a * b} {a / b} {a % b} {a &&& b} {a ||| b} {a ^^^ b} {decide (a < b)} {decide (a ≤ b)} {a == b}"

def main : IO Unit := do
  arith "UInt8" [(0 : UInt8), 1, 7, 8, 127, 128, 200, 255]
  arith "UInt16" [(0 : UInt16), 1, 15, 16, 255, 32768, 50000, 65535]
  arith "UInt32" [(0 : UInt32), 1, 31, 32, 65536, 2147483648, 3000000000, 4294967295]
  arith "UInt64" [(0 : UInt64), 1, 63, 64, 4294967296, 9223372036854775808, 12345678901234567890, 18446744073709551615]
  arithPortable "USize" [(0 : USize), 1, 7, 1000, 65535]
  arith "Int8" [(0 : Int8), 1, -1, 7, 8, -8, 127, -128]
  arith "Int16" [(0 : Int16), 1, -1, 15, 16, -300, 32767, -32768]
  arith "Int32" [(0 : Int32), 1, -1, 31, 32, -100000, 2147483647, -2147483648]
  arith "Int64" [(0 : Int64), 1, -1, 63, 64, -5000000000, 9223372036854775807, -9223372036854775808]
  arithPortable "ISize" [(0 : ISize), 1, -1, 7, -8, 1000, -4096]
  for a in [(0 : ISize), 1, -1, 1000, -4096] do
    let a ← hide a
    IO.println s!"ISize {a}: {-a} {~~~a} {a - 7} {a.toInt} {a.toInt8} {a.toInt64} {a.abs}"
  for a in [(0 : UInt64), 1, 255, 256, 65535, 4294967295, 4294967296, 18446744073709551615] do
    let a ← hide a
    IO.println s!"UInt64 {a}: {a.toUInt8} {a.toUInt16} {a.toUInt32} {a.toNat} {a.log2} {a.toFloat} {a.toInt64}"
  for a in [(0 : Int64), 1, -1, 127, 128, -129, 2147483648, -9223372036854775808] do
    let a ← hide a
    IO.println s!"Int64 {a}: {a.toInt8} {a.toInt16} {a.toInt32} {a.toInt} {a.toNatClampNeg} {a.abs} {a.toFloat} {a.toUInt64}"
  for a in [(0 : Int8), 1, -1, 127, -128] do
    let a ← hide a
    IO.println s!"Int8 {a}: {a.toInt16} {a.toInt32} {a.toInt64} {a.toInt} {a.toUInt8} {a.abs} {a.toFloat}"
  for n in [(0 : Int), 1, -1, 255, -256, 4294967296, -18446744073709551617] do
    let n ← hide n
    IO.println s!"Int {n}: {Int8.ofInt n} {UInt8.ofInt n} {Int64.ofInt n} {UInt64.ofInt n} {n.toInt32}"
  for n in [(0 : Nat), 255, 256, 4294967296, 18446744073709551616, 340282366920938463463374607431768211457] do
    let n ← hide n
    IO.println s!"Nat {n}: {n.toUInt8} {n.toUInt16} {n.toUInt32} {n.toUInt64} {n.toInt8} {n.toInt64}"
  for (a, b) in [((7 : Int), (2 : Int)), (-7, 2), (7, -2), (-7, -2), (5, 0), (-5, 0), (123456789012345678901234567890, -987654321)] do
    let a ← hide a
    IO.println s!"Int {a} {b}: {a * b} {a / b} {a % b} {a.tdiv b} {a.tmod b} {a.fdiv b} {a.fmod b}"
  for (a, b) in [((12 : Nat), (18 : Nat)), (0, 5), (2 ^ 70, 2 ^ 40 * 3)] do
    let a ← hide a
    IO.println s!"Nat {a} {b}: {a.gcd b} {a.pred} {Nat.powMod a b 1000000007} {Nat.powMod 3 (b % 100) 0}"
