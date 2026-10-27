import Lean
import LeanScript.JsExtern

namespace LeanScript

open Lean IR

/-- Appends every function referenced by a full or partial application in `e` to `acc`. -/
def collectExprFns (e : IR.Expr) (acc : Array Name) : Array Name :=
  match e with
  | .fap c _ | .pap c _ => acc.push c
  | _ => acc

/-- Appends every function referenced anywhere in `b` to `acc`. -/
partial def collectBodyFns (b : FnBody) (acc : Array Name) : Array Name :=
  match b with
  | .vdecl _ _ e b => collectBodyFns b (collectExprFns e acc)
  | .jdecl _ _ v b => collectBodyFns b (collectBodyFns v acc)
  | .case _ _ _ alts => alts.foldl (fun acc alt => collectBodyFns alt.body acc) acc
  | .ret _ | .jmp .. | .unreachable => acc
  | b => collectBodyFns b.body acc

/-- Maps each C symbol named by an `@[export]` attribute to the declaration it exports. -/
def exportedDecls (env : Environment) : Std.HashMap String Name :=
  env.constants.fold (init := {}) fun acc n _ =>
    match getExportNameFor? env n with
    | some e => acc.insert e.toString n
    | none => acc

/-- The declarations that make up a whole program. -/
structure Program where
  decls : Array Decl
  /--
  Pairs of an extern and the Lean declaration that implements it, by exporting the extern's C
  symbol. The implementation is in `decls`, but the extern is not.
  -/
  aliases : Array (Name × Name) := #[]

/--
Returns the IR declarations transitively reachable from `roots`, including the initializer
functions of any reachable `[init]` declarations.

An extern whose C symbol is exported by a Lean declaration is replaced by that declaration, as the
native linker would do, unless it has a JS implementation.

Fails if a reachable declaration has no IR, e.g. because it is `noncomputable`.
-/
def collectReachable (env : Environment) (roots : Array Name) : Except String Program := do
  let exports := exportedDecls env
  let mut seen : NameSet := {}
  let mut stack := roots
  let mut result : Program := { decls := #[] }
  while h : stack.size > 0 do
    let name := stack[stack.size - 1]
    stack := stack.pop
    if seen.contains name then
      continue
    seen := seen.insert name
    let some decl := findEnvDecl env name
      | throw s!"no IR found for '{name}'"
    if let .extern .. := decl then
      if hasJsExtern env name then
        result := { result with decls := result.decls.push decl }
        continue
      if let some impl := (getExternNameFor env `c name).bind exports.get? then
        let some implDecl := findEnvDecl env impl
          | throw s!"no IR found for '{impl}', which implements '{name}'"
        if decl.params.map (·.borrow) != implDecl.params.map (·.borrow) then
          throw s!"'{impl}' cannot implement '{name}' because their parameter ownership differs"
        result := { result with aliases := result.aliases.push (name, impl) }
        stack := stack.push impl
        continue
    result := { result with decls := result.decls.push decl }
    if let some initFn := getInitFnNameFor? env name then
      stack := stack.push initFn
    if let .fdecl (body := body) .. := decl then
      stack := collectBodyFns body stack
  return result

/--
Returns a shortest chain of calls in `program` from one of `roots` to `target`, starting with the
root and ending with `target`, or `none` if `target` is not reachable. Initializing an `[init]`
declaration counts as a call to its initializer function.
-/
def Program.callPath (env : Environment) (program : Program) (roots : Array Name) (target : Name) :
    Option (Array Name) := Id.run do
  let decls : Std.HashMap Name Decl := program.decls.foldl (fun m d => m.insert d.name d) {}
  let aliases : Std.HashMap Name Name := program.aliases.foldl (fun m (e, i) => m.insert e i) {}
  -- The caller through which each declaration was first reached, or `none` for a root.
  let mut callers : Std.HashMap Name (Option Name) := roots.foldl (fun m r => m.insert r none) {}
  let mut queue := roots
  let mut i := 0
  while h : i < queue.size do
    let name := queue[i]
    i := i + 1
    if name == target then
      let mut path := #[name]
      while true do
        let some (some caller) := callers[path.back!]? | break
        path := path.push caller
      return some path.reverse
    let mut callees := match aliases[name]?, decls[name]? with
      | some impl, _ => #[impl]
      | none, some (.fdecl (body := body) ..) => collectBodyFns body #[]
      | _, _ => #[]
    if let some initFn := getInitFnNameFor? env name then
      callees := callees.push initFn
    for callee in callees do
      unless callers.contains callee do
        callers := callers.insert callee (some name)
        queue := queue.push callee
  return none

/--
Returns the modules that the current module imports for run time, which are those it imports
transitively except through `meta` imports.
-/
partial def runtimeModules (env : Environment) : NameSet :=
  go (env.imports.filter (!·.isMeta) |>.map (·.module) |>.toList) {}
where
  go : List Name → NameSet → NameSet
    | [], acc => acc
    | m :: rest, acc =>
      if acc.contains m then
        go rest acc
      else
        let imports := match env.getModuleIdx? m with
          | some idx => env.header.moduleData[idx.toNat]!.imports.filter (!Import.isMeta ·)
          | none => #[]
        go ((imports.map Import.module).toList ++ rest) (acc.insert m)

/--
Returns the declarations that native Lean initializes at startup, in the order it initializes them:
the `IO Unit` initializers and the `[init]` declarations of every imported module in import order,
followed by those of the current module, each in declaration order.

Only the run-time initializers are included, as for a native executable whose main module is in the
module system: those of modules imported through `meta` imports and `meta` declarations only run
at compile time.
-/
def initDecls (env : Environment) : Array Name := Id.run do
  let isInit (isModule : Bool) (n : Name) :=
    (isIOUnitInitFn env n || isIOUnitBuiltinInitFn env n || (getInitFnNameFor? env n).isSome) &&
      !(isModule && isMarkedMeta env n)
  let runtime := runtimeModules env
  let mut result := #[]
  for name in env.header.moduleNames, md in env.header.moduleData do
    if runtime.contains name then
      result := result ++ md.constNames.filter (isInit md.isModule)
  return result ++ ((getDecls env).reverse.map (·.name)).filter (isInit env.header.isModule)

end LeanScript
