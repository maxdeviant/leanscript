import Lean
import LeanScript.Collect

/-!
Emits a JavaScript module from Lean IR.

Value representation (see `src/runtime/index.js` for the runtime side):

- Scalars (`u8`, `u16`, `u32`, `usize`, `float`, `float32`) are JS numbers; `u64` is a `BigInt`.
- Boxing and unboxing are the identity.
- Constructors without fields are their tag as a JS number, mirroring `lean_box(cidx)` in C.
  All other constructors are `$Ctor` instances.
- Strings are `LeanString`s, constructed from literals with `$rt.mkString`.
- Nullary declarations become lazily initialized constants that are read by calling them. Their
  values are persistent.

Heap objects are reference counted exactly as in the C runtime, which lets the IR update unshared
objects in place.
-/

namespace LeanScript

open Lean IR

/-- The largest integer a JS number represents exactly, `Number.MAX_SAFE_INTEGER`. -/
def maxSafeInteger : Nat := 2 ^ 53 - 1

structure EmitContext where
  env : Environment
  decls : Std.HashMap Name Decl
  currFn : Name := .anonymous
  currParams : Array Param := #[]
  /-- Whether the current function body is wrapped in a `_start` loop for self tail calls. -/
  hasLoop : Bool := false

structure EmitState where
  out : String := ""
  indent : Nat := 0
  jpParams : Std.HashMap JoinPointId (Array Param) := {}

abbrev EmitM := ReaderT EmitContext (StateT EmitState (Except String))

def emitLn (s : String) : EmitM Unit :=
  modify fun st => { st with out := st.out ++ "".pushn ' ' (2 * st.indent) ++ s ++ "\n" }

def withIndent (x : EmitM α) : EmitM α := do
  modify fun st => { st with indent := st.indent + 1 }
  let a ← x
  modify fun st => { st with indent := st.indent - 1 }
  return a

def toJsName (n : Name) : String :=
  n.mangle "l_"

def varName (x : VarId) : String :=
  s!"x_{x.idx}"

def jpName (j : JoinPointId) : String :=
  s!"block_{j.idx}"

def argToJs : Arg → String
  | .var x => varName x
  | .erased => "0"

def argsToJs (ys : Array Arg) : String :=
  ", ".intercalate (ys.map argToJs).toList

/-- Quotes `s` as a JS string literal. -/
def quoteJs (s : String) : String := Id.run do
  let mut r := "\""
  for c in s.toList do
    r := r ++ match c with
      | '"' => "\\\""
      | '\\' => "\\\\"
      | '\n' => "\\n"
      | '\r' => "\\r"
      | '\t' => "\\t"
      | c =>
        -- U+2028 and U+2029 are legal in JS string literals since ES2019, but we escape them
        -- anyway for the benefit of tooling that predates it.
        if c.toNat < 0x20 || c.toNat == 0x7f || c.toNat == 0x2028 || c.toNat == 0x2029 then
          "\\u{" ++ String.ofList (Nat.toDigits 16 c.toNat) ++ "}"
        else
          c.toString
  return r ++ "\""

def natLitToJs (v : Nat) (ty : IRType) : String :=
  match ty with
  | .uint64 => s!"{v}n"
  -- We target a 32-bit platform so that `USize` fits in a JS number.
  | .usize => s!"{v % 2 ^ 32}"
  | .uint8 | .uint16 | .uint32 | .float | .float32 => s!"{v}"
  | _ => if v ≤ maxSafeInteger then s!"{v}" else s!"{v}n"

/-- The key under which a scalar field at byte offset `sizeof(void*)*i + offset` is stored. -/
def scalarKey (i : Nat) (offset : Nat) : Nat :=
  8 * i + offset

def getDecl (name : Name) : EmitM Decl := do
  let some decl := (← read).decls[name]? | throw s!"unknown declaration '{name}'"
  return decl

def ctorToJs (info : CtorInfo) (ys : Array Arg) : String :=
  if ys.isEmpty && info.isScalar then
    s!"{info.cidx}"
  else
    let scalars := if info.usize > 0 || info.ssize > 0 then "{}" else "null"
    s!"new $Ctor({info.cidx}, [{argsToJs ys}], {scalars})"

def exprToJs (ty : IRType) : IR.Expr → EmitM String
  | .ctor info ys => return ctorToJs info ys
  | .reset n x => return s!"$rt.reset({varName x}, {n})"
  | .reuse .. => throw "`reuse` must be emitted with `emitReuse`"
  | .proj i x => return s!"{varName x}.f[{i}]"
  | .uproj i x => return s!"{varName x}.s[{scalarKey i 0}]"
  | .sproj n offset x => return s!"{varName x}.s[{scalarKey n offset}]"
  | .fap c ys => do
    if (← getDecl c).params.isEmpty then
      return s!"{toJsName c}()"
    else
      return s!"{toJsName c}({argsToJs ys})"
  | .pap c ys => do
    let arity := (← getDecl c).params.size
    return s!"$rt.pap({toJsName c}, {arity}, [{argsToJs ys}])"
  | .ap x ys => return s!"$rt.apply({varName x}, [{argsToJs ys}])"
  | .box _ x | .unbox x => return varName x
  | .lit (.num v) => return natLitToJs v ty
  | .lit (.str s) => return s!"$rt.mkString({quoteJs s})"
  | .isShared x => return s!"$rt.isShared({varName x})"

def isSelfTailCall (x : VarId) (e : IR.Expr) (b : FnBody) : EmitM Bool := do
  let ctx ← read
  match e, b with
  | .fap c _, .ret (.var y) => return ctx.hasLoop && c == ctx.currFn && x == y
  | _, _ => return false

partial def hasSelfTailCall (f : Name) : FnBody → Bool
  | .vdecl x _ (.fap c _) (.ret (.var y)) => c == f && x == y
  | .vdecl _ _ _ b => hasSelfTailCall f b
  | .jdecl _ _ v b => hasSelfTailCall f v || hasSelfTailCall f b
  | .case _ _ _ alts => alts.any (hasSelfTailCall f ·.body)
  | .ret _ | .jmp .. | .unreachable => false
  | b => hasSelfTailCall f b.body

def emitSelfTailCall (ys : Array Arg) : EmitM Unit := do
  let ps := (← read).currParams
  let updates := (ps.zip ys).filter fun (p, y) =>
    match y with
    | .var x => x != p.x
    | .erased => true
  -- Evaluate every argument before assigning any parameter, as arguments may refer to parameters.
  emitLn "{"
  withIndent do
    for (_, y) in updates, i in [0:updates.size] do
      emitLn s!"const _t{i} = {argToJs y};"
    for (p, _) in updates, i in [0:updates.size] do
      emitLn s!"{varName p.x} = _t{i};"
    emitLn "continue _start;"
  emitLn "}"

/--
Emits `let x := reuse y in ctor_i ys`, where `y` is the result of a `reset`: either an exclusive
object whose fields have been released, or `0` if it was shared.
-/
def emitReuse (x y : VarId) (info : CtorInfo) (updtHeader : Bool) (ys : Array Arg) : EmitM Unit := do
  emitLn s!"let {varName x};"
  emitLn s!"if ({varName y} === 0) \{"
  withIndent (emitLn s!"{varName x} = {ctorToJs info ys};")
  emitLn "} else {"
  withIndent do
    emitLn s!"{varName x} = {varName y};"
    for y in ys, i in [0:ys.size] do
      emitLn s!"{varName x}.f[{i}] = {argToJs y};"
    if updtHeader then
      emitLn s!"{varName x}.tag = {info.cidx};"
    if info.usize > 0 || info.ssize > 0 then
      emitLn s!"{varName x}.s ??= \{};"
  emitLn "}"

mutual

partial def emitBlock (b : FnBody) : EmitM Unit := do
  emitLn "{"
  withIndent (emitFnBody b)
  emitLn "}"

partial def emitCase (x : VarId) (xType : IRType) (alts : Array Alt) : EmitM Unit := do
  let discr := if xType.isScalar then varName x else s!"$rt.tag({varName x})"
  if h : alts.size = 2 then
    if let .ctor info b := alts[0] then
      emitLn s!"if ({discr} === {info.cidx}) \{"
      withIndent (emitFnBody b)
      emitLn "} else {"
      withIndent (emitFnBody alts[1].body)
      emitLn "}"
      return
  emitLn s!"switch ({discr}) \{"
  withIndent do
    for alt in alts do
      match alt with
      | .ctor info b => emitLn s!"case {info.cidx}:"; withIndent (emitBlock b)
      | .default b => emitLn "default:"; withIndent (emitBlock b)
    unless alts.any (· matches .default _) do
      emitLn "default:"
      withIndent (emitLn "return $rt.unreachable();")
  emitLn "}"

partial def emitFnBody : FnBody → EmitM Unit
  | .vdecl x ty e b => do
    if ← isSelfTailCall x e b then
      let .fap _ ys := e | unreachable!
      emitSelfTailCall ys
    else if let .reuse y info updtHeader ys := e then
      emitReuse x y info updtHeader ys
      emitFnBody b
    else
      emitLn s!"let {varName x} = {← exprToJs ty e};"
      emitFnBody b
  | .jdecl j xs v b => do
    modify fun st => { st with jpParams := st.jpParams.insert j xs }
    unless xs.isEmpty do
      emitLn s!"let {", ".intercalate (xs.map (varName ·.x)).toList};"
    -- Every path through `b` ends in a `ret`, `jmp`, or `unreachable`, so control only leaves the
    -- labeled block through a `jmp` to `j`, which breaks out of it into the join point's body.
    emitLn s!"{jpName j}: \{"
    withIndent (emitFnBody b)
    emitLn "}"
    emitFnBody v
  | .set x i y b => do
    emitLn s!"{varName x}.f[{i}] = {argToJs y};"
    emitFnBody b
  | .setTag x cidx b => do
    emitLn s!"{varName x}.tag = {cidx};"
    emitFnBody b
  | .uset x i y b => do
    emitLn s!"{varName x}.s[{scalarKey i 0}] = {varName y};"
    emitFnBody b
  | .sset x i offset y _ b => do
    emitLn s!"{varName x}.s[{scalarKey i offset}] = {varName y};"
    emitFnBody b
  | .inc x n _ persistent b => do
    unless persistent do
      emitLn (if n == 1 then s!"$rt.inc({varName x});" else s!"$rt.incN({varName x}, {n});")
    emitFnBody b
  | .dec x _ _ persistent b => do
    unless persistent do
      emitLn s!"$rt.dec({varName x});"
    emitFnBody b
  | .del x b => do
    emitLn s!"$rt.del({varName x});"
    emitFnBody b
  | .case _ x xType alts => emitCase x xType alts
  | .ret y => emitLn s!"return {argToJs y};"
  | .jmp j ys => do
    let some xs := (← get).jpParams[j]? | throw s!"unknown join point {jpName j}"
    for x in xs, y in ys do
      emitLn s!"{varName x.x} = {argToJs y};"
    emitLn s!"break {jpName j};"
  | .unreachable => emitLn "return $rt.unreachable();"

end

def emitDecl (decl : Decl) : EmitM Unit := do
  let env := (← read).env
  let name := toJsName decl.name
  match decl with
  | .extern .. => emitLn s!"const {name} = $ext[{quoteJs decl.name.toString}];"
  | .fdecl f xs _ body _ =>
    if xs.isEmpty then
      if let some initFn := getInitFnNameFor? env f then
        emitLn s!"const {name} = $rt.lazy(() => $rt.runInit({toJsName initFn}));"
      else
        emitLn s!"const {name} = $rt.lazy(() => \{"
        withIndent (emitFnBody body)
        emitLn "});"
    else
      let hasLoop := hasSelfTailCall f body
      emitLn s!"function {name}({", ".intercalate (xs.map (varName ·.x)).toList}) \{"
      withIndent do
        withReader ({ · with currFn := f, currParams := xs, hasLoop }) do
          if hasLoop then
            emitLn "_start: while (true) {"
            withIndent (emitFnBody body)
            emitLn "}"
          else
            emitFnBody body
      emitLn "}"
  emitLn ""

/-- Options controlling JS output. -/
structure EmitOptions where
  /-- The module specifier used to import the LeanScript runtime. -/
  runtime : String := "leanscript/runtime"

/--
Emits a JS program that runs `main`, containing every declaration reachable from it.

`env` must contain IR for `main` and everything it depends on.
-/
def emitProgram (env : Environment) (opts : EmitOptions := {}) : Except String String := do
  let some mainDecl := findEnvDecl env `main | throw "no `main` function found"
  -- The runtime uses `IO.Error.toString` to report an uncaught error from `main`.
  let decls ← collectReachable env #[`main, `IO.Error.toString]
  let externs := decls.filterMap fun d => if d.isExtern then some d.name else none
  let ctx : EmitContext := {
    env
    decls := decls.foldl (fun m d => m.insert d.name d) {}
  }
  let go : EmitM Unit := do
    emitLn "// Generated by LeanScript."
    emitLn s!"import * as $rt from {quoteJs opts.runtime};"
    emitLn ""
    emitLn "const $Ctor = $rt.Ctor;"
    emitLn s!"const $ext = $rt.resolveExterns([{", ".intercalate (externs.map (quoteJs ·.toString)).toList}]);"
    emitLn ""
    for decl in decls do
      -- Join point ids are only unique within a declaration.
      modify ({ · with jpParams := {} })
      emitDecl decl
    emitLn s!"$rt.runMain({toJsName `main}, {mainDecl.params.size}, {toJsName `IO.Error.toString});"
  let ((), st) ← go.run ctx |>.run {}
  return st.out

end LeanScript
