import Std.Data.HashMap
import Std.Data.HashSet

open Std

def text : String :=
  "the quick brown fox jumps over the lazy dog the fox barks and the dog sleeps
   a quick brown dog and a lazy fox"

def countWords (s : String) : HashMap String Nat := Id.run do
  let mut counts : HashMap String Nat := {}
  for word in s.split (fun c => c.isWhitespace) do
    if !word.isEmpty then
      counts := counts.insert word.toString (counts.getD word.toString 0 + 1)
  return counts

def main : IO Unit := do
  let counts := countWords text
  IO.println s!"distinct words: {counts.size}"
  let sorted := counts.toArray.qsort fun (w₁, n₁) (w₂, n₂) =>
    n₁ > n₂ || (n₁ == n₂ && w₁ < w₂)
  for (word, n) in sorted do
    IO.println s!"{word}: {n}"
  let letters : HashSet Char := text.foldl (fun acc c => if c.isAlpha then acc.insert c else acc) {}
  IO.println s!"distinct letters: {letters.size}"
  IO.println s!"contains 'z': {letters.contains 'z'}, contains 'q': {letters.contains 'q'}"
  let lengths : HashMap Nat (Array String) :=
    counts.fold (fun acc w _ => acc.alter w.length fun
      | some ws => some (ws.push w)
      | none => some #[w]) {}
  for len in [3, 4, 5] do
    IO.println s!"{len}: {(lengths.getD len #[]).qsort (· < ·)}"
