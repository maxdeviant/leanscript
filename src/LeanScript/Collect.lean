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

/--
Returns the IR declarations transitively reachable from `roots`, including the initializer
functions of any reachable `[init]` declarations.

Fails if a reachable declaration has no IR, e.g. because it is `noncomputable`.
-/
def collectReachable (env : Environment) (roots : Array Name) : Except String (Array Decl) := do
  let mut seen : NameSet := {}
  let mut stack := roots
  let mut result := #[]
  while h : stack.size > 0 do
    let name := stack[stack.size - 1]
    stack := stack.pop
    if seen.contains name then
      continue
    seen := seen.insert name
    let some decl := findEnvDecl env name
      | throw s!"no IR found for '{name}'"
    result := result.push decl
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
