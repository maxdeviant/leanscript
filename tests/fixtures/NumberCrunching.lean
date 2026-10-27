def sieve (n : Nat) : Array Bool := Id.run do
  let mut isPrime := Array.replicate (n + 1) true
  isPrime := isPrime.set! 0 false
  isPrime := isPrime.set! 1 false
  for i in [2:n+1] do
    if isPrime[i]! && i * i ≤ n then
      let mut j := i * i
      while j ≤ n do
        isPrime := isPrime.set! j false
        j := j + i
  return isPrime

/-- A sieve over a `ByteArray`, marking composites with 1. -/
def sieveBytes (n : Nat) : ByteArray := Id.run do
  let mut composite := ByteArray.mk (Array.replicate (n + 1) 0)
  for i in [2:n+1] do
    if composite[i]! == 0 then
      let mut j := i * i
      while j ≤ n do
        composite := composite.set! j 1
        j := j + i
  return composite

def factorial : Nat → Nat
  | 0 => 1
  | n + 1 => (n + 1) * factorial n

def fib (n : Nat) : Nat := Id.run do
  let mut (a, b) := (0, 1)
  for _ in [0:n] do
    (a, b) := (b, a + b)
  return a

def fnv1a (s : String) : UInt64 :=
  s.toUTF8.foldl (fun h b => (h ^^^ b.toUInt64) * 0x100000001b3) 0xcbf29ce484222325

def collatz (n : Nat) : Nat := Id.run do
  let mut n := n
  let mut steps := 0
  while n != 1 do
    n := if n % 2 == 0 then n / 2 else 3 * n + 1
    steps := steps + 1
  return steps

def main : IO Unit := do
  let primes := (sieve 100000).toList.zipIdx.filterMap fun (p, i) => if p then some i else none
  IO.println s!"primes below 100000: {primes.length}, last: {primes.getLast!}"
  IO.println s!"first primes: {primes.take 15}"
  let bytes := sieveBytes 1000
  let count := (List.range 999).countP fun i => i ≥ 2 && bytes[i]! == 0
  IO.println s!"primes below 999 from the byte sieve: {count}, size {bytes.size}"
  IO.println s!"bytes: {(sieveBytes 30).toList}"

  for n in [10, 20, 21, 25, 50] do
    IO.println s!"{n}! = {factorial n}"
  IO.println s!"fib 90 = {fib 90}, fib 200 = {fib 200}"
  IO.println s!"2^64 - 1 = {2 ^ 64 - 1}, 2^53 + 1 = {2 ^ 53 + 1}"
  IO.println s!"digits of 100!: {(toString (factorial 100)).length}"
  IO.println s!"gcd {Nat.gcd (factorial 30) (fib 100)}, lcm {Nat.lcm 12345678 87654321}"

  for s in ["", "a", "hello", "the quick brown fox"] do
    IO.println s!"fnv1a {repr s} = {fnv1a s}"
  IO.println s!"longest collatz below 10000: {(List.range 10000).drop 1 |>.foldl (fun (best : Nat × Nat) n => let s := collatz n; if s > best.2 then (n, s) else best) (1, 0)}"

  let xs : List Float := [0, 1, -1, 0.1, 1 / 3, 2.5, -2.5, 1e10, 1.5e-7, 123456789.125, 1e300 * 1e10, 0 / 0]
  for x in xs do
    IO.println s!"{x} floor={x.floor} ceil={x.ceil} round={x.round} sqrt={x.abs.sqrt} toUInt64={x.toUInt64}"
  let pi := 4 * (List.range 100000).foldl (fun acc k => acc + (if k % 2 == 0 then 1 else -1) / (2 * k.toFloat + 1)) 0
  IO.println s!"pi ≈ {pi}"
  IO.println s!"exp 1 = {Float.exp 1}, log 10 = {Float.log 10}, sin 1 = {Float.sin 1}, pow = {Float.pow 2 0.5}"
  IO.println s!"{(2 : Float) ^ (64 : Float)} {Float.ofNat (2 ^ 70)} {Float.ofScientific 15 true 1} {(3.7 : Float).toString}"
  IO.println s!"{(1e20 : Float).toUInt64} {(-5 : Float).toUInt8} {(300.7 : Float).toUInt8} {decide ((2.5 : Float) < 3)} {(0/0 : Float) == 0/0}"
