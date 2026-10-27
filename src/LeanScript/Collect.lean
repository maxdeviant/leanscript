import Lean

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
native linker would do.

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
Returns the declarations that native Lean initializes at startup, in the order it initializes them:
the `IO Unit` initializers and the `[init]` declarations of every imported module in import order,
followed by those of the current module, each in declaration order.
-/
def initDecls (env : Environment) : Array Name := Id.run do
  let isInit (n : Name) :=
    isIOUnitInitFn env n || isIOUnitBuiltinInitFn env n || (getInitFnNameFor? env n).isSome
  let mut result := #[]
  for md in env.header.moduleData do
    result := result ++ md.constNames.filter isInit
  return result ++ ((getDecls env).reverse.map (·.name)).filter isInit

end LeanScript
