inductive Expr where
  | num (n : Int)
  | var (name : String)
  | binop (op : Char) (lhs rhs : Expr)
  | call (fn : String) (args : List Expr)
  deriving Repr, BEq, Inhabited

structure Input where
  s : String
  pos : String.Pos.Raw

abbrev Parser := StateT Input (Except String)

def peek : Parser (Option Char) := do
  let { s, pos } ← get
  return if String.Pos.Raw.atEnd s pos then none else some (String.Pos.Raw.get s pos)

def advance : Parser Unit := modify fun { s, pos } => { s, pos := String.Pos.Raw.next s pos }

partial def skipWs : Parser Unit := do
  if let some c ← peek then
    if c.isWhitespace then advance; skipWs

def expect (c : Char) : Parser Unit := do
  skipWs
  if (← peek) == some c then advance else throw s!"expected '{c}' at {(← get).pos.byteIdx}"

partial def takeWhile (p : Char → Bool) (acc : String := "") : Parser String := do
  match ← peek with
  | some c => if p c then advance; takeWhile p (acc.push c) else return acc
  | none => return acc

mutual
  partial def atom : Parser Expr := do
    skipWs
    match ← peek with
    | some '(' => advance; let e ← expr; expect ')'; return e
    | some '-' => advance; return .binop '-' (.num 0) (← atom)
    | some c =>
      if c.isDigit then
        let digits ← takeWhile Char.isDigit
        return .num digits.toNat!
      else if c.isAlpha then
        let name ← takeWhile Char.isAlphanum
        skipWs
        if (← peek) == some '(' then
          advance
          let args ← argList
          return .call name args
        return .var name
      else throw s!"unexpected '{c}'"
    | none => throw "unexpected end of input"

  partial def argList : Parser (List Expr) := do
    skipWs
    if (← peek) == some ')' then advance; return []
    let first ← expr
    let mut args := #[first]
    repeat
      skipWs
      match ← peek with
      | some ',' => advance; args := args.push (← expr)
      | some ')' => advance; break
      | _ => throw "expected ',' or ')'"
    return args.toList

  partial def binary (ops : List Char) (next : Parser Expr) : Parser Expr := do
    let mut lhs ← next
    repeat
      skipWs
      match ← peek with
      | some c => if ops.contains c then advance; lhs := .binop c lhs (← next) else break
      | none => break
    return lhs

  partial def term : Parser Expr := binary ['*', '/', '%'] atom

  partial def expr : Parser Expr := binary ['+', '-'] term
end

def parse (s : String) : Except String Expr := do
  let (e, { pos, .. }) ← (do let e ← expr; skipWs; return e).run { s, pos := 0 }
  if !String.Pos.Raw.atEnd s pos then throw s!"trailing input at {pos.byteIdx}"
  return e

def eval (env : String → Option Int) : Expr → Except String Int
  | .num n => pure n
  | .var x => match env x with
    | some v => pure v
    | none => throw s!"unbound variable {x}"
  | .binop op a b => do
    let a ← eval env a
    let b ← eval env b
    match op with
    | '+' => pure (a + b)
    | '-' => pure (a - b)
    | '*' => pure (a * b)
    | '/' => if b == 0 then throw "division by zero" else pure (a / b)
    | '%' => pure (a % b)
    | _ => throw s!"unknown operator {op}"
  | .call f args => do
    let vs ← args.mapM (eval env)
    match f, vs with
    | "max", v :: vs => pure (vs.foldl max v)
    | "min", v :: vs => pure (vs.foldl min v)
    | "abs", [v] => pure v.natAbs
    | "pow", [b, e] => pure (b ^ e.toNat)
    | _, _ => throw s!"bad call {f}/{vs.length}"

def pretty : Expr → String
  | .num n => toString n
  | .var x => x
  | .binop op a b => s!"({pretty a} {op} {pretty b})"
  | .call f args => s!"{f}({", ".intercalate (args.map pretty)})"

def env : String → Option Int
  | "x" => some 6
  | "y" => some (-4)
  | "big" => some 123456789012345
  | _ => none

def main : IO Unit := do
  let inputs := [
    "1 + 2 * 3",
    "(1 + 2) * 3",
    "x * y - -7 % 3",
    "max(x, y, 10, abs(y * 5)) / 2",
    "pow(big, 3) + min(1)",
    "pow(2, 100) / pow(2, 98)",
    "1 / (x - 6)",
    "z + 1",
    "foo(1, 2",
    "3 +",
    "4 $ 5",
    "  12   ",
  ]
  for s in inputs do
    match parse s with
    | .ok e => IO.println s!"{pretty e} = {match eval env e with | .ok v => toString v | .error err => s!"error: {err}"}"
    | .error err => IO.println s!"parse error: {err}"
  IO.println (repr (parse "f(a, 1) - 2"))
  IO.println ((parse "1+2*x").toOption == (parse " 1 + (2 * x) ").toOption)
  -- Deep nesting exercises non-tail recursion in both the parser and the evaluator.
  let depth := 1000
  let deep := String.join (List.replicate depth "(1 + ") ++ "0" ++ String.join (List.replicate depth ")")
  IO.println (match parse deep >>= eval env with | .ok v => toString v | .error e => e)
  let wide := " + ".intercalate ((List.range 2000).map toString)
  IO.println (match parse wide >>= eval env with | .ok v => toString v | .error e => e)
