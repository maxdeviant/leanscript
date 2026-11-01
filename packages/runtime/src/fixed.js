// Fixed-width integers: `UInt8`, `UInt16`, `UInt32`, `UInt64`, `USize`, and their signed
// counterparts `Int8`, `Int16`, `Int32`, `Int64`, and `ISize`.
//
// As in the C runtime, a signed integer is stored as the unsigned integer with the same bits, so
// both share a representation: a JS number in `[0, 2^w)` for widths up to 32, and a `BigInt` for
// width 64. We target a 32-bit platform, so `USize` and `ISize` are 32 bits wide.

// A `BigInt` stored in `words` can be read back as its 32-bit halves from `halves`, and the other
// way around. V8 does this without allocating, unlike `>>` and `Number` on a `BigInt`.
const words = new BigUint64Array(1);
const halves = new Uint32Array(words.buffer);
const LO = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 0 : 1;
const HI = 1 - LO;

/** Returns the low 32 bits of the `BigInt` `a`. */
export function low32(a) {
  words[0] = a;
  return halves[LO];
}

/** Shifts the unsigned 64-bit `a` right by `s`, which is less than 64. */
export function shiftRight64(a, s) {
  if (s === 0) {
    return a;
  }
  words[0] = a;
  const h = halves[HI];
  const l = halves[LO];
  if (s < 32) {
    halves[LO] = (l >>> s) | (h << (32 - s));
    halves[HI] = h >>> s;
  } else {
    halves[LO] = h >>> (s - 32);
    halves[HI] = 0;
  }
  return words[0];
}
