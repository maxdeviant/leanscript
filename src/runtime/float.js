// `Float` and `Float32`, which are both JS numbers.

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
  if (twiceRem > den || (twiceRem === den && (q & 1n) === 1n)) {
    q += 1n;
  }
  const digits = q.toString().padStart(7, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

function floatToString(x) {
  if (Number.isNaN(x)) {
    return "NaN";
  }
  if (x === Infinity) {
    return "inf";
  }
  if (x === -Infinity) {
    return "-inf";
  }
  return formatFixed6(x);
}

const bool = (b) => (b ? 1 : 0);

export const externs = {
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
};
