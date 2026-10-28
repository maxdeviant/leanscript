/-- Hides `x` from the compiler, so that operations on it are not constant folded. -/
def hide (x : α) : IO α := do
  (← IO.mkRef x).get

def strings : IO Unit := do
  let s ← hide "  Héllo, wörld! ∀x 🎉  "
  IO.println s!"[{s.trimAscii}] [{s.toUpper}] [{s.toLower}] {s.length} {s.utf8ByteSize}"
  let t ← hide "hello world foo bar"
  IO.println s!"{t.capitalize} {t.decapitalize} {(t.drop 6).toString} {(t.dropEnd 4).toString} {(t.take 5).toString} {(t.takeEnd 3).toString}"
  IO.println s!"{t.front} {t.back} {t.contains 'w'} {t.contains 'z'} {t.startsWith "hello"} {t.endsWith "bar"} {t.startsWith "world"}"
  IO.println s!"{t.splitOn " "} {t.splitOn "o"} {"a,b,,c".splitOn ","} {(t.find ' ').offset.byteIdx}"
  IO.println s!"{" | ".intercalate ["x", "y", "z"]} {t.foldl (fun n c => if c == 'o' then n + 1 else n) 0} {t.any (· == 'f')} {t.all Char.isLower}"
  IO.println s!"{t.replace "o" "0"} {"abc".pushn '!' 3} {"abc" ++ "def"} {String.singleton 'q'} {"abc".toList} {String.ofList ['x', 'y']}"
  IO.println s!"{repr (compare "abc" "abd")} {repr (compare "b" "abc")} {repr (compare "abc" "abc")} {decide ("ab" < "abc")} {"abc" == "abc"} {decide ("é" < "z")}"
  for p in [0, 1, 2, 3, 4, 100] do
    let p : String.Pos.Raw := ⟨p⟩
    IO.println s!"pos {p.byteIdx}: {String.Pos.Raw.get? "aé∀" p} {(String.Pos.Raw.prev "aé∀" p).byteIdx} {(String.Pos.Raw.next "aé∀" p).byteIdx} {String.Pos.Raw.isValid "aé∀" p} {String.Pos.Raw.get "aé∀" p}"
  let ss := t.toRawSubstring.drop 6 |>.takeWhile (· != ' ')
  IO.println s!"{ss} {ss.bsize} {ss.toString.length} {ss.front} {(t.toRawSubstring.extract ⟨2⟩ ⟨8⟩)} {ss == "world".toRawSubstring} {ss.all Char.isAlpha} {ss.isEmpty}"
  IO.println s!"{"42".toNat?} {"-17".toInt?} {"x1".toNat?} {"123456789012345678901234567890".toNat!} {"3".isNat} {"Hello".map Char.toUpper}"
  IO.println s!"{"a-b_c d".split (fun c => c == '-' || c == '_' || c == ' ') |>.toList |>.map (·.toString)}"
  IO.println s!"{hash "abc"} {hash ("abc".toSlice)} {"tab\there".quote} {repr "q\"uote"}"

def byteArrays : IO Unit := do
  let mut b ← hide (ByteArray.empty)
  for i in [0:20] do
    b := b.push (i * 13).toUInt8
  let b' := b.set! 3 255 |>.set! 100 1
  IO.println s!"{b.toList} {b'.toList} {b.size} {b[5]!} {b.get! 50}"
  IO.println s!"{(b.extract 2 6).toList} {(b.extract 18 30).toList} {(b ++ b.extract 0 3).toList} {b == b} {b == b'}"
  IO.println s!"{(b.copySlice 1 (ByteArray.mk #[9, 9, 9]) 1 2).toList} {(b.copySlice 5 (ByteArray.mk #[1]) 4 3).toList} {hash b} {hash ByteArray.empty}"
  let u := "héllo ∀ 🎉".toUTF8
  IO.println s!"{u.toList} {String.fromUTF8? u} {String.fromUTF8? (u.set! 1 0xff)} {(String.fromUTF8? (ByteArray.mk #[0xc0, 0x80]))}"
  IO.println s!"{u.data.size} {(ByteArray.mk #[1, 2, 3]).data} {(u.toUInt64LE!)} {ByteArray.empty.isEmpty}"

def floatArrays : IO Unit := do
  let mut a ← hide (FloatArray.emptyWithCapacity 4)
  for i in [0:20] do
    a := a.push (i.toFloat / 4)
  let shared := a
  let a' := a.set! 3 (-1.5) |>.set! 100 7
  IO.println s!"{a.toList} {a'.toList} {shared.toList == a.toList} {a.size} {a[5]!} {a.get! 50} {a.get? 2} {a.usize}"
  let mut b := a'
  for i in [0:b.size] do
    b := b.set! i (b[i]! * 2)
  IO.println s!"{b.toList} {a == a} {a == a'} {(FloatArray.mk #[1.5, 0/0, 1/0]).data} {FloatArray.empty.isEmpty}"
  IO.println s!"{b.foldl (· + ·) 0} {[1.0, 2.0].toFloatArray.toList}"
  if h : 1 < a'.size then
    IO.println s!"{a'[1]'h} {(a'.set 1 9 h).toList} {(a'.uset 1 8 (by simpa using h)).toList} {a'.toList}"

def thunks : IO Unit := do
  let t := Thunk.mk fun _ => dbgTraceIfShared "thunk" ((List.range 10).foldl (· + ·) 0)
  IO.println s!"{t.get} {t.get} {(Thunk.pure 5).get} {(t.map (· * 2)).get}"

def misc : IO Unit := do
  for b in [true, false] do
    let b ← hide b
    IO.println s!"{b.toUInt8} {b.toUInt64} {b.toInt8} {b.toNat} {strictAnd b true} {strictOr b false}"
  let xs ← hide #[1, 2, 3, 4]
  IO.println s!"{xs.swapIfInBounds 0 3} {xs.swapIfInBounds 1 9}"
  let f : Float32 ← hide 1.1
  IO.println s!"{f} {f * 3} {f.toFloat} {f.sqrt} {(f / 0)} {f.toUInt8} {Float32.ofScientific 123 true 2} {f.toBits}"
  let x : Float ← hide 0.1
  IO.println s!"{x.toBits} {Float.ofBits 4614253070214989087} {x.frExp} {(x * 1e300).frExp} {Float.ofScientific 1 true 400} {x.scaleB 3} {(5e-324 : Float).scaleB 1}"
  IO.println s!"{x.toInt8} {(-1e10 : Float).toInt32} {(1e30 : Float).toInt64} {(0/0 : Float).toInt16} {(-0.0 : Float)} {Float.ofInt (-3)}"

def main : IO Unit := do
  strings
  byteArrays
  floatArrays
  thunks
  misc
