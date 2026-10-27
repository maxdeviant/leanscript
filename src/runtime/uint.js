// Fixed-width integers and floats.
//
// `UInt8`, `UInt16`, `UInt32`, and `USize` are JS numbers; `UInt64` is a `BigInt`. We target a
// 32-bit platform, so `USize` is 32 bits wide.

import { mkString } from "./string.js";

const bits = new DataView(new ArrayBuffer(8));

function floatOfBits(b) {
  bits.setBigUint64(0, b);
  return bits.getFloat64(0);
}

function floatToBits(x) {
  bits.setFloat64(0, x);
  return bits.getBigUint64(0);
}

/**
 * Formats a finite float with six digits after the decimal point, exactly like C's `%f`.
 *
 * `Number.prototype.toFixed` rounds ties away from zero, whereas `%f` rounds the exact binary value
 * to nearest with ties to even.
 */
function formatFixed6(x) {
  const negative = x < 0 || Object.is(x, -0);
  const b = floatToBits(Math.abs(x));
  let exponent = Number(b >> 52n);
  let mantissa = b & ((1n << 52n) - 1n);
  if (exponent === 0) {
    exponent = 1;
  } else {
    mantissa |= 1n << 52n;
  }
  // |x| = mantissa * 2^(exponent - 1075), so |x| * 10^6 = num / den.
  let num = mantissa * 10n ** 6n;
  let den = 1n;
  if (exponent >= 1075) {
    num <<= BigInt(exponent - 1075);
  } else {
    den <<= BigInt(1075 - exponent);
  }
  let q = num / den;
  const twiceRem = 2n * (num % den);
  if (twiceRem > den || (twiceRem === den && (q & 1n) === 1n)) q += 1n;
  const digits = q.toString().padStart(7, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

function floatToString(x) {
  if (Number.isNaN(x)) return "NaN";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  return formatFixed6(x);
}

const u8 = (n) => n & 0xff;
const u16 = (n) => n & 0xffff;
const u32 = (n) => n >>> 0;
const u64 = (n) => BigInt.asUintN(64, n);
const ofNat32 = (n) => Number(BigInt.asUintN(32, BigInt(n)));
const bool = (b) => (b ? 1 : 0);

export const externs = {
  "UInt8.toNat": (a) => a,
  "UInt8.ofNat": (n) => Number(BigInt.asUintN(8, BigInt(n))),
  "UInt8.add": (a, b) => u8(a + b),
  "UInt8.sub": (a, b) => u8(a - b),
  "UInt8.land": (a, b) => a & b,
  "UInt8.lor": (a, b) => a | b,
  "UInt8.decEq": (a, b) => bool(a === b),
  "UInt8.decLt": (a, b) => bool(a < b),
  "UInt8.decLe": (a, b) => bool(a <= b),

  "UInt16.toNat": (a) => a,
  "UInt16.ofNat": (n) => Number(BigInt.asUintN(16, BigInt(n))),
  "UInt16.add": (a, b) => u16(a + b),
  "UInt16.decEq": (a, b) => bool(a === b),
  "UInt16.decLt": (a, b) => bool(a < b),
  "UInt16.decLe": (a, b) => bool(a <= b),

  "UInt32.toNat": (a) => a,
  "UInt32.ofNat": ofNat32,
  "UInt32.ofBitVec": ofNat32,
  "UInt32.add": (a, b) => u32(a + b),
  "UInt32.sub": (a, b) => u32(a - b),
  "UInt32.mul": (a, b) => Math.imul(a, b) >>> 0,
  "UInt32.decEq": (a, b) => bool(a === b),
  "UInt32.decLt": (a, b) => bool(a < b),
  "UInt32.decLe": (a, b) => bool(a <= b),

  "UInt64.toNat": (a) => (a <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(a) : a),
  "UInt64.ofNat": (n) => u64(BigInt(n)),
  "UInt64.ofBitVec": (n) => u64(BigInt(n)),
  "UInt64.add": (a, b) => u64(a + b),
  "UInt64.sub": (a, b) => u64(a - b),
  "UInt64.mul": (a, b) => u64(a * b),
  "UInt64.decEq": (a, b) => bool(a === b),
  "UInt64.decLt": (a, b) => bool(a < b),
  "UInt64.decLe": (a, b) => bool(a <= b),
  "UInt64.toFloat": (a) => Number(a),

  "USize.ofNat": ofNat32,
  "USize.ofNatLT": (n, _h) => n,
  "USize.toNat": (a) => a,
  "USize.add": (a, b) => u32(a + b),
  "USize.sub": (a, b) => u32(a - b),
  "USize.mul": (a, b) => Math.imul(a, b) >>> 0,
  "USize.decEq": (a, b) => bool(a === b),
  "USize.decLt": (a, b) => bool(a < b),
  "USize.decLe": (a, b) => bool(a <= b),
  "USize.repr": (n) => mkString(String(n)),

  "Float.ofBits": floatOfBits,
  // `Float.ofModel` converts from the bit-level model of IEEE 754 doubles, which is the bit pattern.
  "Float.ofModel": floatOfBits,
  "Float.toBits": floatToBits,
  "Float.add": (a, b) => a + b,
  "Float.sub": (a, b) => a - b,
  "Float.mul": (a, b) => a * b,
  "Float.div": (a, b) => a / b,
  "Float.neg": (a) => -a,
  "Float.decLt": (a, b) => bool(a < b),
  "Float.decLe": (a, b) => bool(a <= b),
  "Float.beq": (a, b) => bool(a === b),
  "Float.toString": (x) => mkString(floatToString(x)),

  // The proof argument guarantees that `n` is a valid scalar value.
  "Char.ofNatAux": (n, _h) => n,

  "System.Platform.getNumBits": (_unit) => 32,
};
