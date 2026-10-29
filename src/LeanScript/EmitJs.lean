import Lean
import LeanScript.Collect
import LeanScript.JsExtern
import LeanScript.Target
import LeanScript.Version

/-!
Emits a JavaScript module from Lean IR.

Value representation (see `packages/runtime/src/index.js` for the runtime side):

- Scalars (`u8`, `u16`, `u32`, `usize`, `float`, `float32`) are JS numbers; `u64` is a `BigInt`.
- Boxing and unboxing are the identity.
- Constructors without fields are their tag as a JS number, mirroring `lean_box(cidx)` in C.
  All other constructors are instances of a subclass of `$rt.Ctor` for their number of object
  fields, `$CtorN`, which store their object fields as `f0`, `f1`, and so on, and their scalar
  fields as `s<offset>`, by byte offset. The runtime has classes for up to `maxRuntimeCtorSize`
  fields, and the module defines those for more.
- Strings are `LeanString`s, constructed from literals with `$rt.mkString`.
- Nullary declarations become lazily initialized constants that are read by calling them. Their
  values are persistent.
- `[init]` declarations are also read by calling them, but are initialized eagerly at startup
  along with the `IO Unit` initializers, as in native Lean.

Heap objects are reference counted exactly as in the C runtime, which lets the IR update unshared
objects in place.

The common cases of `inc` and `dec`, which only change a count, are inlined rather than calling
`$rt.inc` and `$rt.dec`. V8 records the shapes of the objects that a property access sees per
function, not per call site, so in the runtime's functions the access to the count would see every
class of object in the program, and be slow. Inline, each one sees only the few classes of the
objects at that site. The runtime's functions handle the rest: freeing objects, and catching uses of
freed ones, whose count is negative. The count is read into the function's one `$r` variable, as V8
gives each block-scoped variable its own stack slot, which would make deeply recursive programs
overflow sooner.
-/

namespace LeanScript

open Lean IR

/-- The largest integer a JS number represents exactly, `Number.MAX_SAFE_INTEGER`. -/
def maxSafeInteger : Nat := 2 ^ 53 - 1

structure EmitContext where
  env : Environment
  decls : Std.HashMap Name Decl
  /-- The JS implementations of the program's externs that have one. -/
  jsExterns : Std.HashMap Name JsExtern := {}
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

/-- The property that stores object field `i` of a constructor. -/
def fieldName (i : Nat) : String :=
  s!"f{i}"

/-- The property that stores the scalar field at byte offset `sizeof(void*)*i + offset`. -/
def scalarName (i : Nat) (offset : Nat) : String :=
  s!"s{8 * i + offset}"

/-- The most object fields that a constructor class of the runtime has. -/
def maxRuntimeCtorSize : Nat := 8

/-- The name of the class of constructors with `n` object fields. -/
def ctorClassName (n : Nat) : String :=
  s!"$Ctor{n}"

def getDecl (name : Name) : EmitM Decl := do
  let some decl := (← read).decls[name]? | throw s!"unknown declaration '{name}'"
  return decl

def ctorToJs (info : CtorInfo) (ys : Array Arg) : String :=
  if ys.isEmpty && info.isScalar then
    s!"{info.cidx}"
  else
    let args := if ys.isEmpty then "" else s!", {argsToJs ys}"
    s!"new {ctorClassName ys.size}({info.cidx}{args})"

/-- Adds the number of object fields of each constructor object that `b` constructs to `sizes`. -/
partial def ctorSizes (b : FnBody) (sizes : Std.HashSet Nat) : Std.HashSet Nat :=
  match b with
  | .vdecl _ _ e b =>
    let sizes := match e with
      | .ctor info ys | .reuse _ info _ ys =>
        if ys.isEmpty && info.isScalar then sizes else sizes.insert ys.size
      | _ => sizes
    ctorSizes b sizes
  | .jdecl _ _ v b => ctorSizes b (ctorSizes v sizes)
  | .case _ _ _ alts => alts.foldl (fun sizes alt => ctorSizes alt.body sizes) sizes
  | .ret _ | .jmp .. | .unreachable => sizes
  | b => ctorSizes b.body sizes

/--
Emits the class of constructors with `n` object fields, which is the runtime's if it has one. Each
class implements the `pushFields` method that the runtime's do.
-/
def emitCtorClass (n : Nat) : EmitM Unit := do
  let name := ctorClassName n
  if n ≤ maxRuntimeCtorSize then
    emitLn s!"const {name} = $rt.Ctor{n};"
    return
  let fields := (List.range n).map fieldName
  emitLn s!"class {name} extends $rt.Ctor \{"
  withIndent do
    emitLn s!"constructor(tag, {", ".intercalate fields}) \{"
    withIndent do
      emitLn "super(tag);"
      for f in fields do
        emitLn s!"this.{f} = {f};"
    emitLn "}"
    emitLn ""
    emitLn "pushFields(xs) {"
    withIndent (emitLn s!"xs.push({", ".intercalate (fields.map (s!"this.{·}"))});")
    emitLn "}"
  emitLn "}"

def exprToJs (ty : IRType) : IR.Expr → EmitM String
  | .ctor info ys => return ctorToJs info ys
  | .reset n x => return s!"$rt.reset({varName x}, {n})"
  | .reuse .. => throw "`reuse` must be emitted with `emitReuse`"
  | .proj i x => return s!"{varName x}.{fieldName i}"
  | .uproj i x => return s!"{varName x}.{scalarName i 0}"
  | .sproj n offset x => return s!"{varName x}.{scalarName n offset}"
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

/-- Returns whether `b` increments or decrements a reference count, and so uses `$r`. -/
partial def usesRc : FnBody → Bool
  | .inc _ _ _ persistent b | .dec _ _ _ persistent b => !persistent || usesRc b
  | .vdecl _ _ _ b => usesRc b
  | .jdecl _ _ v b => usesRc v || usesRc b
  | .case _ _ _ alts => alts.any (usesRc ·.body)
  | .ret _ | .jmp .. | .unreachable => false
  | b => usesRc b.body

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
      emitLn s!"{varName x}.{fieldName i} = {argToJs y};"
    if updtHeader then
      emitLn s!"{varName x}.tag = {info.cidx};"
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
    emitLn s!"{varName x}.{fieldName i} = {argToJs y};"
    emitFnBody b
  | .setTag x cidx b => do
    emitLn s!"{varName x}.tag = {cidx};"
    emitFnBody b
  | .uset x i y b => do
    emitLn s!"{varName x}.{scalarName i 0} = {varName y};"
    emitFnBody b
  | .sset x i offset y _ b => do
    emitLn s!"{varName x}.{scalarName i offset} = {varName y};"
    emitFnBody b
  | .inc x n _ persistent b => do
    unless persistent do
      let x := varName x
      let slow := if n == 1 then s!"$rt.inc({x})" else s!"$rt.incN({x}, {n})"
      emitLn s!"if (($r = {x}?.[$RC]) > 0) {x}[$RC] = $r + {n}; else if ($r < 0) {slow};"
    emitFnBody b
  | .dec x _ _ persistent b => do
    unless persistent do
      let x := varName x
      emitLn s!"if (($r = {x}?.[$RC]) > 1) {x}[$RC] = $r - 1; else if ($r === 1 || $r < 0) $rt.dec({x});"
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

/-- The name under which the JS extern `n` is imported. -/
def jsImportName (n : Name) : String :=
  "$js_" ++ toJsName n

/-- Emits a function that calls the JS implementation `ext` of the extern `decl`. -/
def emitJsExtern (decl : Decl) (ext : JsExtern) : EmitM Unit := do
  let args := decl.params.filter isJsArg |>.map (varName ·.x)
  let call ← match ext with
    | .import .. => pure s!"{jsImportName decl.name}({", ".intercalate args.toList})"
    | .inline pattern => match expandJsPattern pattern args with
      | .ok e => pure s!"({e})"
      | .error err => throw s!"the inline JS extern '{decl.name}' {err}"
  emitLn s!"function {toJsName decl.name}({", ".intercalate (decl.params.map (varName ·.x)).toList}) \{"
  withIndent (emitLn s!"return {call};")
  emitLn "}"

def emitDecl (decl : Decl) : EmitM Unit := do
  let ctx ← read
  let env := ctx.env
  let name := toJsName decl.name
  match decl with
  | .extern .. =>
    match ctx.jsExterns[decl.name]? with
    | some ext => emitJsExtern decl ext
    | none => emitLn s!"const {name} = $ext[{quoteJs decl.name.toString}];"
  | .fdecl f xs _ body _ =>
    if xs.isEmpty then
      if (getInitFnNameFor? env f).isSome then
        emitLn s!"const {name} = $rt.initCell();"
      else
        emitLn s!"const {name} = $rt.lazy(() => \{"
        withIndent do
          if usesRc body then
            emitLn "let $r;"
          emitFnBody body
        emitLn "});"
    else
      let hasLoop := hasSelfTailCall f body
      emitLn s!"function {name}({", ".intercalate (xs.map (varName ·.x)).toList}) \{"
      withIndent do
        withReader ({ · with currFn := f, currParams := xs, hasLoop }) do
          if usesRc body then
            emitLn "let $r;"
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
  runtime : String := "@leanscript/runtime"
  /-- The platform that the program runs on. -/
  target : Target := .node
  /--
  The directory of the program's Lean source file, relative to the directory of the JS output and
  written with `/`. Relative module specifiers of JS externs are resolved against it.
  -/
  sourceDir : String := "."

/--
Resolves a relative module specifier in the JS implementation `ext` of the extern `n` against the
program's source directory. Only the main module may use relative specifiers, as the source
directories of imported modules are unknown.
-/
def resolveJsExtern (env : Environment) (opts : EmitOptions) (n : Name) (ext : JsExtern) :
    Except String JsExtern :=
  match ext with
  | .import specifier name =>
    if !isRelativeSpecifier specifier then
      pure ext
    else if (env.getModuleIdxFor? n).isSome then
      throw s!"the JS extern '{n}' has the relative module specifier \"{specifier}\", but it is declared in an imported module"
    else
      pure (.import (resolveSpecifier opts.sourceDir specifier) name)
  | .inline _ => pure ext

/--
Returns whether the function `n` returns an `EST.Out`, as `IO` and `EIO` actions do, rather than
its value directly, as pure functions and `BaseIO` and `ST` actions do.
-/
def returnsEstOut (env : Environment) (n : Name) : Bool := Id.run do
  let some info := env.find? n | return false
  let mut ty := info.type.getForallBody
  -- Unfold definitions such as `IO` until we reach `EST` or `ST`, bounding the number of steps in
  -- case of a definition that unfolds forever.
  for _ in [0:64] do
    let .const c us := ty.getAppFn | return false
    if c == ``EST then
      return true
    if c == ``ST then
      return false
    let some (.defnInfo d) := env.find? c | return false
    ty := (d.value.instantiateLevelParams d.levelParams us).beta ty.getAppArgs
  return false

/-- Where a declaration is exported to in JS. -/
inductive JsExport where
  /-- The named export `name`, from `@[export name]`. -/
  | named (name : String)
  /-- The default export, from `@[export default]`. -/
  | default
  /-- The property `name` of the default export, an object, from `@[export default.name]`. -/
  | defaultProperty (name : String)

/-- Returns where the export name `n` exports a declaration to, or `none` if `n` is invalid. -/
def JsExport.ofName? (n : Name) : Option JsExport :=
  match n with
  | .str .anonymous "default" => some .default
  | .str (.str .anonymous "default") name => some (.defaultProperty name)
  | n => if n.getRoot == `default then none else some (.named n.toString)

/--
The declarations of the main module that are exported to JS with `@[export]`, with where they are
exported to, in declaration order.
-/
def jsExports (env : Environment) : Except String (Array (Name × JsExport)) := do
  let mut result := #[]
  let mut seen : Std.HashMap Name Name := {}
  let mut default? : Option Name := none
  let mut defaultProperty? : Option (Name × Name) := none
  for decl in (getDecls env).reverse do
    let some exportName := getExportNameFor? env decl.name | continue
    let some target := JsExport.ofName? exportName
      | throw s!"'{decl.name}' is exported as '{exportName}', but only 'default' and \
          'default.<name>' may start with 'default'"
    if let some other := seen[exportName]? then
      throw s!"'{other}' and '{decl.name}' are both exported as '{exportName}'"
    seen := seen.insert exportName decl.name
    match target with
    | .default => default? := some decl.name
    | .defaultProperty _ => defaultProperty? := defaultProperty? <|> some (decl.name, exportName)
    | .named _ => pure ()
    result := result.push (decl.name, target)
  if let (some d, some (p, pName)) := (default?, defaultProperty?) then
    throw s!"'{d}' is exported as 'default', so '{p}' cannot be exported as '{pName}'"
  return result

/--
Emits a function that exports the main module's declaration `decl` to JS, and returns its name. The
function first initializes the module, if it has not been initialized yet.

The function takes the arguments of a JS extern with the same signature. Lean does not allow
exported functions to borrow their parameters, so it takes ownership of them. An `IO` or `EIO`
action returns its value or throws its error. A constant is exported as a function with no
parameters that returns its value.
-/
def emitJsExport (decl : Decl) : EmitM String := do
  let env := (← read).env
  let name := s!"$export_{toJsName decl.name}"
  let jsParams := decl.params.filter isJsArg
  let args := decl.params.map fun p => if isJsArg p then varName p.x else "0"
  emitLn s!"function {name}({", ".intercalate (jsParams.map (varName ·.x)).toList}) \{"
  withIndent do
    emitLn "$init();"
    let call := s!"{toJsName decl.name}({", ".intercalate args.toList})"
    if returnsEstOut env decl.name then
      emitLn s!"return $rt.takeIoResult({call}, {toJsName `IO.Error.toString});"
    else
      emitLn s!"return {call};"
  emitLn "}"
  return name

/-- The roots of a program: its entry points, and the declarations that the runtime uses. -/
structure Roots where
  /-- The `main` function, if the program is not a library. -/
  main? : Option Decl
  /-- The declarations exported to JS and where they are exported to, if the program is a library. -/
  exports : Array (Name × JsExport)
  /-- The declarations that are initialized at startup, in order. -/
  inits : Array Name

/--
Returns the roots of the program in `env`. A program either has a `main` function, which runs when
it is loaded, or is a library that exports declarations of its main module to JS with `@[export]`.
-/
def programRoots (env : Environment) : Except String Roots := do
  let main? := findEnvDecl env `main
  let exports ← jsExports env
  if main?.isSome && !exports.isEmpty then
    throw "a program with a `main` function cannot export declarations to JS"
  if main?.isNone && exports.isEmpty then
    throw "no `main` function or `@[export]` declarations found"
  return { main?, exports, inits := initDecls env }

/--
The names of the declarations that `roots` makes reachable directly. The runtime uses
`IO.Error.toString` to report uncaught errors.
-/
def Roots.names (roots : Roots) : Array Name :=
  -- As in native Lean, every initializer runs, even for an `[init]` declaration that is never read,
  -- as it may have side effects or fail.
  (if roots.main?.isSome then #[`main] else roots.exports.map (·.1)) ++ #[`IO.Error.toString] ++
    roots.inits

/-- A JS program. -/
structure EmitOutput where
  js : String
  /--
  For each extern that the program uses but the runtime does not implement on its target, a chain
  of calls from where the program starts to the extern. The program replaces these externs with
  functions that throw when called.
  -/
  unavailable : Array (Array Name)

/--
Emits a JS module for the program in `env`, containing every declaration reachable from its roots
(see `programRoots`). The module runs `main` when it is loaded, or, for a library, exports the
library's declarations.

`env` must contain IR for the roots and everything they depend on.
-/
def emitProgram (env : Environment) (opts : EmitOptions := {}) : Except String EmitOutput := do
  let programRoots ← programRoots env
  let inits := programRoots.inits
  let roots := programRoots.names
  let program ← collectReachable env roots
  let { decls, aliases } := program
  let mut jsExterns : Std.HashMap Name JsExtern := {}
  for d in decls do
    if d.isExtern then
      if let some ext ← jsExtern? env d.name then
        jsExterns := jsExterns.insert d.name (← resolveJsExtern env opts d.name ext)
  let externs := decls.filterMap fun d =>
    if d.isExtern && !jsExterns.contains d.name then some d.name else none
  let available := opts.target.externs
  let unavailable := externs.filter (!available.contains ·.toString)
    |>.qsort (·.toString < ·.toString)
  let ctx : EmitContext := {
    env
    decls := decls.foldl (fun m d => m.insert d.name d) {}
    jsExterns
  }
  -- An aliased extern is called like its implementation.
  let ctx := { ctx with
    decls := aliases.foldl (fun m (ext, impl) => m.insert ext m[impl]!) ctx.decls }
  let go : EmitM Unit := do
    emitLn "// Generated by LeanScript."
    emitLn s!"import * as $rt from {quoteJs opts.runtime};"
    let jsImports := decls.filterMap fun d => match jsExterns[d.name]? with
      | some (JsExtern.import specifier name) => some (specifier, name, jsImportName d.name)
      | _ => none
    if opts.target == .node && programRoots.main?.isSome then
      -- The main thread loads this module only to start the worker that runs the program, which
      -- loads it again. Only the worker imports the JS externs, so their modules are evaluated once.
      let specifiers := jsImports.foldl (init := #[]) fun ss (s, _) =>
        if ss.contains s then ss else ss.push s
      for specifier in specifiers do
        let imports := jsImports.filter (·.1 == specifier)
        let locals := ", ".intercalate (imports.map (·.2.2)).toList
        let names := ", ".intercalate (imports.map (quoteJs ·.2.1)).toList
        emitLn s!"const [{locals}] = await $rt.importForProgram(() => import({quoteJs specifier}), {quoteJs specifier}, [{names}]);"
    else
      for (specifier, name, importName) in jsImports do
        emitLn s!"import \{ {quoteJs name} as {importName} } from {quoteJs specifier};"
    emitLn ""
    emitLn s!"$rt.checkVersion({quoteJs version});"
    emitLn "const $RC = $rt.RC;"
    let sizes : Std.HashSet Nat := decls.foldl (init := {}) fun sizes d => match d with
      | .fdecl _ _ _ body _ => ctorSizes body sizes
      | .extern .. => sizes
    for n in sizes.toArray.qsort (· < ·) do
      emitCtorClass n
    let quoteNames (ns : Array Name) := ", ".intercalate (ns.map (quoteJs ·.toString)).toList
    if unavailable.isEmpty then
      emitLn s!"const $ext = $rt.resolveExterns([{quoteNames externs}]);"
    else
      emitLn s!"const $ext = $rt.resolveExterns([{quoteNames externs}], [{quoteNames unavailable}]);"
    emitLn ""
    for decl in decls do
      -- Join point ids are only unique within a declaration.
      modify ({ · with jpParams := {} })
      emitDecl decl
    -- Aliases come last, since an implementation may be a constant that is not hoisted.
    for (ext, impl) in aliases do
      emitLn s!"const {toJsName ext} = {toJsName impl};"
    unless aliases.isEmpty do
      emitLn ""
    emitLn "const $inits = ["
    withIndent do
      for n in inits do
        match getInitFnNameFor? env n with
        | some initFn => emitLn s!"[{toJsName initFn}, {toJsName n}],"
        | none => emitLn s!"[{toJsName n}],"
    emitLn "];"
    let errorToString := toJsName `IO.Error.toString
    match programRoots.main? with
    | some mainDecl =>
      emitLn s!"$rt.runMain(import.meta.url, $inits, {toJsName `main}, {mainDecl.params.size}, {errorToString});"
    | none =>
      -- Initializing when the module is loaded would run the initializers in the global scope,
      -- where some hosts, such as Cloudflare Workers, disallow I/O.
      emitLn s!"const $init = $rt.initModuleOnce($inits, {errorToString});"
      let mut defaultProperties := #[]
      for (n, target) in programRoots.exports do
        emitLn ""
        let name ← emitJsExport (← getDecl n)
        match target with
        | .named exportName => emitLn s!"export \{ {name} as {quoteJs exportName} };"
        | .default => emitLn s!"export default {name};"
        | .defaultProperty prop => defaultProperties := defaultProperties.push (prop, name)
      unless defaultProperties.isEmpty do
        emitLn ""
        emitLn "export default {"
        withIndent do
          for (prop, name) in defaultProperties do
            emitLn s!"{quoteJs prop}: {name},"
        emitLn "};"
  let ((), st) ← go.run ctx |>.run {}
  return {
    js := st.out
    unavailable := unavailable.map fun ext => (program.callPath env roots ext).getD #[ext]
  }

end LeanScript
