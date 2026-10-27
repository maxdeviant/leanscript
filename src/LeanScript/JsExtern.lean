import Lean

/-!
Externs implemented in JS, declared with the `js` backend of `@[extern]`:

- `@[extern js "<module>#<export>"]` calls the named export of a JS module. The module specifier is
  everything before the last `#`. A relative specifier is resolved against the directory of the
  Lean file that declares the extern.
- `@[extern js inline "<expression>"]` evaluates a JS expression, in which `#1`, `#2`, and so on
  stand for the arguments.

Either way, the arguments are those of the declaration's IR parameters that are neither erased
types nor the `IO` world token, and values use LeanScript's representation and ownership
conventions, as for C externs in native Lean.
-/

namespace LeanScript

open Lean IR

/-- The JS implementation of an extern. -/
inductive JsExtern where
  /-- The export `name` of the JS module `specifier`. -/
  | «import» (specifier name : String)
  /-- A JS expression, with `#i` standing for the `i`th argument. -/
  | inline (pattern : String)

/-- Returns the JS implementation of the extern `n`, if it has one. -/
def jsExtern? (env : Environment) (n : Name) : Except String (Option JsExtern) := do
  let some data := getExternAttrData? env n | return none
  for entry in data.entries do
    match entry with
    | .standard `js s =>
      let parts := s.splitOn "#"
      let specifier := "#".intercalate parts.dropLast
      let name := parts.getLast!
      if specifier.isEmpty || name.isEmpty then
        throw s!"invalid JS extern \"{s}\" for '{n}': expected \"<module>#<export>\""
      return some (.import specifier name)
    | .inline `js pattern => return some (.inline pattern)
    | _ => pure ()
  return none

/-- Returns whether the extern `n` has a JS implementation. -/
def hasJsExtern (env : Environment) (n : Name) : Bool :=
  match jsExtern? env n with
  | .ok (some _) | .error _ => true
  | .ok none => false

/-- Whether the parameter `p` is passed to a JS extern. -/
def isJsArg (p : Param) : Bool :=
  !p.ty.isErased && !p.ty.isVoid

/--
Replaces each `#i` in `pattern` with the `i`th element of `args`, counting from 1. An error
describes the problem as a predicate, such as "refers to argument #3, but it only has 2".
-/
def expandJsPattern (pattern : String) (args : Array String) : Except String String := do
  let cs := pattern.toList.toArray
  let mut acc := ""
  let mut i := 0
  while h : i < cs.size do
    let c := cs[i]
    i := i + 1
    let digits := cs.extract i cs.size |>.toList.takeWhile Char.isDigit
    if c != '#' || digits.isEmpty then
      acc := acc.push c
    else
      let n := (String.ofList digits).toNat!
      if n == 0 then
        throw "refers to argument #0, but arguments count from 1"
      let some arg := args[n - 1]?
        | throw s!"refers to argument #{n}, but it only has {args.size}"
      acc := acc ++ arg
      i := i + digits.length
  return acc

/--
Removes empty and `.` components from `components`, and `..` components that follow a directory.
-/
def normalizeComponents (components : List String) : List String :=
  components.foldl (init := []) (fun acc c =>
    match c, acc with
    | "", _ | ".", _ => acc
    | "..", d :: rest => if d == ".." then ".." :: acc else rest
    | _, _ => c :: acc)
  |>.reverse

/-- Returns whether `specifier` is a relative JS module specifier. -/
def isRelativeSpecifier (specifier : String) : Bool :=
  specifier.startsWith "./" || specifier.startsWith "../"

/--
Resolves the relative module specifier `specifier` against `dir`, a relative path written with `/`,
returning a relative specifier.
-/
def resolveSpecifier (dir specifier : String) : String :=
  let path := normalizeComponents (dir.splitOn "/" ++ specifier.splitOn "/")
  match path with
  | ".." :: _ => "/".intercalate path
  | _ => "./" ++ "/".intercalate path

end LeanScript
