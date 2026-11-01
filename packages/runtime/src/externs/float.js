// `Float` and `Float32`, which are both JS numbers.

import { mkCtor } from "../core.js";
import { mkString } from "../string.js";

const bits = new DataView(new ArrayBuffer(8));

function floatOfBits(b) {
  bits.setBigUint64(0, b);
  return bits.getFloat64(0);
}

function floatToBits(x) {
  bits.setFloat64(0, x);
  return bits.getBigUint64(0);
}

function float32OfBits(b) {
  bits.setUint32(0, b);
  return bits.getFloat32(0);
}

function float32ToBits(x) {
  bits.setFloat32(0, x);
  return bits.getUint32(0);
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

/** `x * 2^n` with a single rounding, like C's `scalbn` (this is musl's algorithm). */
function scalbn(x, n) {
  if (n > 1023) {
    x *= 2 ** 1023;
    n -= 1023;
    if (n > 1023) {
      x *= 2 ** 1023;
      n -= 1023;
      n = Math.min(n, 1023);
    }
  } else if (n < -1022) {
    // Scaling by 2^-1022 * 2^53 keeps intermediate results normal, so only the last step rounds.
    x *= 2 ** -1022 * 2 ** 53;
    n += 1022 - 53;
    if (n < -1022) {
      x *= 2 ** -1022 * 2 ** 53;
      n += 1022 - 53;
      n = Math.max(n, -1022);
    }
  }
  return x * 2 ** n;
}

/** Converts the `Int` `n` to an exponent for `scalbn`, saturating where the result is 0 or ±inf. */
function clampExponent(n) {
  if (typeof n === "bigint") {
    return n < 0n ? -10000 : 10000;
  }
  return Math.max(-10000, Math.min(10000, n));
}

/** Splits `x` into a mantissa in `[0.5, 1)` and an exponent, like C's `frexp`. */
function frexp(x) {
  if (x === 0 || !Number.isFinite(x)) {
    return [x, 0];
  }
  let e = 0;
  if (Math.abs(x) < 2 ** -1022) {
    x *= 2 ** 54;
    e -= 54;
  }
  const biased = Number((floatToBits(x) >> 52n) & 0x7ffn);
  e += biased - 1022;
  return [x * 2 ** -(biased - 1022), e];
}

/** Returns `[m, e]` with `x = m * 2^e` exactly, for finite `x`. */
function decompose(x) {
  const b = floatToBits(x);
  const biased = Number((b >> 52n) & 0x7ffn);
  let m = b & ((1n << 52n) - 1n);
  if (biased !== 0) {
    m |= 1n << 52n;
  }
  return [x < 0 ? -m : m, Math.max(biased, 1) - 1075];
}

/** `a * b + c` with a single rounding, like C's `fma`. */
function fma(a, b, c) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a * b === 0) {
    return a * b + c;
  }
  const [ma, ea] = decompose(a);
  const [mb, eb] = decompose(b);
  const [mc, ec] = decompose(c);
  const e = Math.min(ea + eb, ec);
  const m = ((ma * mb) << BigInt(ea + eb - e)) + (mc << BigInt(ec - e));
  if (m === 0n) {
    // An exact zero sum is +0 in round-to-nearest, unless both addends are -0.
    return a * b + c;
  }
  return roundScaled(m, e);
}

/** Rounds `m * 2^e` to the nearest double, with ties to even. */
function roundScaled(m, e) {
  const negative = m < 0n;
  let mag = negative ? -m : m;
  // Keep 54 significant bits plus a sticky bit, so that `Number` rounds exactly once, then scale.
  const excess = mag.toString(2).length - 55;
  if (excess > 0) {
    const sticky = (mag & ((1n << BigInt(excess)) - 1n)) !== 0n ? 1n : 0n;
    mag = (mag >> BigInt(excess)) | sticky;
    e += excess;
  }
  // `scalbn` rounds again only if the result is subnormal, where precision is already reduced.
  const r = scalbn(Number(mag), e);
  return negative ? -r : r;
}

/** C's `round`: rounds to the nearest integer, with ties away from zero. */
function roundHalfAway(x) {
  const t = Math.trunc(x);
  return Math.abs(x - t) >= 0.5 ? t + Math.sign(x) : t;
}

/** Converts to an unsigned integer type with maximum `max`, saturating and mapping NaN to 0. */
const toUnsigned = (max) => (a) => (0 <= a ? (a < max + 1 ? Math.trunc(a) : max) : 0);

/** Converts to a signed integer type of width `w`, saturating and mapping NaN to 0. */
const toSigned = (w) => (a) => {
  const min = -(2 ** (w - 1));
  const r = Number.isNaN(a) ? 0 : min - 1 < a ? (a < -min ? Math.trunc(a) : -min - 1) : min;
  return w === 32 ? r >>> 0 : r & (2 ** w - 1);
};

const toUInt64 = (a) => (0 <= a ? (a < 2 ** 64 ? BigInt(Math.trunc(a)) : 0xffffffffffffffffn) : 0n);

const toInt64 = (a) => {
  const r = Number.isNaN(a)
    ? 0n
    : -(2 ** 63) <= a
      ? a < 2 ** 63
        ? BigInt(Math.trunc(a))
        : (1n << 63n) - 1n
      : -(1n << 63n);
  return BigInt.asUintN(64, r);
};

/**
 * Returns the externs of `Float` or `Float32`, where `round` rounds an exact or double-precision
 * result to the type's precision.
 */
function floatExterns(name, round, ofBits, toBits) {
  const unary = (f) => (a) => round(f(a));
  const ext = {
    ofBits,
    // The bit-level model of an IEEE 754 float is its bit pattern.
    ofModel: ofBits,
    toBits,
    toModel: toBits,
    add: (a, b) => round(a + b),
    sub: (a, b) => round(a - b),
    mul: (a, b) => round(a * b),
    div: (a, b) => round(a / b),
    neg: (a) => -a,
    abs: Math.abs,
    decLt: (a, b) => bool(a < b),
    decLe: (a, b) => bool(a <= b),
    lt: (a, b) => bool(a < b),
    le: (a, b) => bool(a <= b),
    beq: (a, b) => bool(a === b),
    isNaN: (a) => bool(Number.isNaN(a)),
    isFinite: (a) => bool(Number.isFinite(a)),
    isInf: (a) => bool(a === Infinity || a === -Infinity),
    toString: (x) => mkString(floatToString(x)),
    sin: unary(Math.sin),
    cos: unary(Math.cos),
    tan: unary(Math.tan),
    asin: unary(Math.asin),
    acos: unary(Math.acos),
    atan: unary(Math.atan),
    atan2: (a, b) => round(Math.atan2(a, b)),
    sinh: unary(Math.sinh),
    cosh: unary(Math.cosh),
    tanh: unary(Math.tanh),
    asinh: unary(Math.asinh),
    acosh: unary(Math.acosh),
    atanh: unary(Math.atanh),
    exp: unary(Math.exp),
    exp2: unary((a) => 2 ** a),
    log: unary(Math.log),
    log2: unary(Math.log2),
    log10: unary(Math.log10),
    pow: (a, b) => round(a ** b),
    sqrt: unary(Math.sqrt),
    cbrt: unary(Math.cbrt),
    ceil: Math.ceil,
    floor: Math.floor,
    round: roundHalfAway,
    fma: (a, b, c) => round(fma(a, b, c)),
    scaleB: (a, n) => round(scalbn(a, clampExponent(n))),
    frExp: (a) => mkCtor(0, frexp(a), null),
    toUInt8: toUnsigned(0xff),
    toUInt16: toUnsigned(0xffff),
    toUInt32: toUnsigned(0xffffffff),
    toUInt64,
    toUSize: toUnsigned(0xffffffff),
    toInt8: toSigned(8),
    toInt16: toSigned(16),
    toInt32: toSigned(32),
    toInt64,
    toISize: toSigned(32),
  };
  return Object.fromEntries(Object.entries(ext).map(([op, fn]) => [`${name}.${op}`, fn]));
}

const {
  "Float.ofBits": Float_ofBits,
  "Float.ofModel": Float_ofModel,
  "Float.toBits": Float_toBits,
  "Float.toModel": Float_toModel,
  "Float.add": Float_add,
  "Float.sub": Float_sub,
  "Float.mul": Float_mul,
  "Float.div": Float_div,
  "Float.neg": Float_neg,
  "Float.abs": Float_abs,
  "Float.decLt": Float_decLt,
  "Float.decLe": Float_decLe,
  "Float.lt": Float_lt,
  "Float.le": Float_le,
  "Float.beq": Float_beq,
  "Float.isNaN": Float_isNaN,
  "Float.isFinite": Float_isFinite,
  "Float.isInf": Float_isInf,
  "Float.toString": Float_toString,
  "Float.sin": Float_sin,
  "Float.cos": Float_cos,
  "Float.tan": Float_tan,
  "Float.asin": Float_asin,
  "Float.acos": Float_acos,
  "Float.atan": Float_atan,
  "Float.atan2": Float_atan2,
  "Float.sinh": Float_sinh,
  "Float.cosh": Float_cosh,
  "Float.tanh": Float_tanh,
  "Float.asinh": Float_asinh,
  "Float.acosh": Float_acosh,
  "Float.atanh": Float_atanh,
  "Float.exp": Float_exp,
  "Float.exp2": Float_exp2,
  "Float.log": Float_log,
  "Float.log2": Float_log2,
  "Float.log10": Float_log10,
  "Float.pow": Float_pow,
  "Float.sqrt": Float_sqrt,
  "Float.cbrt": Float_cbrt,
  "Float.ceil": Float_ceil,
  "Float.floor": Float_floor,
  "Float.round": Float_round,
  "Float.fma": Float_fma,
  "Float.scaleB": Float_scaleB,
  "Float.frExp": Float_frExp,
  "Float.toUInt8": Float_toUInt8,
  "Float.toUInt16": Float_toUInt16,
  "Float.toUInt32": Float_toUInt32,
  "Float.toUInt64": Float_toUInt64,
  "Float.toUSize": Float_toUSize,
  "Float.toInt8": Float_toInt8,
  "Float.toInt16": Float_toInt16,
  "Float.toInt32": Float_toInt32,
  "Float.toInt64": Float_toInt64,
  "Float.toISize": Float_toISize,
} = floatExterns("Float", (a) => a, floatOfBits, floatToBits);
export {
  Float_ofBits as "Float.ofBits",
  Float_ofModel as "Float.ofModel",
  Float_toBits as "Float.toBits",
  Float_toModel as "Float.toModel",
  Float_add as "Float.add",
  Float_sub as "Float.sub",
  Float_mul as "Float.mul",
  Float_div as "Float.div",
  Float_neg as "Float.neg",
  Float_abs as "Float.abs",
  Float_decLt as "Float.decLt",
  Float_decLe as "Float.decLe",
  Float_lt as "Float.lt",
  Float_le as "Float.le",
  Float_beq as "Float.beq",
  Float_isNaN as "Float.isNaN",
  Float_isFinite as "Float.isFinite",
  Float_isInf as "Float.isInf",
  Float_toString as "Float.toString",
  Float_sin as "Float.sin",
  Float_cos as "Float.cos",
  Float_tan as "Float.tan",
  Float_asin as "Float.asin",
  Float_acos as "Float.acos",
  Float_atan as "Float.atan",
  Float_atan2 as "Float.atan2",
  Float_sinh as "Float.sinh",
  Float_cosh as "Float.cosh",
  Float_tanh as "Float.tanh",
  Float_asinh as "Float.asinh",
  Float_acosh as "Float.acosh",
  Float_atanh as "Float.atanh",
  Float_exp as "Float.exp",
  Float_exp2 as "Float.exp2",
  Float_log as "Float.log",
  Float_log2 as "Float.log2",
  Float_log10 as "Float.log10",
  Float_pow as "Float.pow",
  Float_sqrt as "Float.sqrt",
  Float_cbrt as "Float.cbrt",
  Float_ceil as "Float.ceil",
  Float_floor as "Float.floor",
  Float_round as "Float.round",
  Float_fma as "Float.fma",
  Float_scaleB as "Float.scaleB",
  Float_frExp as "Float.frExp",
  Float_toUInt8 as "Float.toUInt8",
  Float_toUInt16 as "Float.toUInt16",
  Float_toUInt32 as "Float.toUInt32",
  Float_toUInt64 as "Float.toUInt64",
  Float_toUSize as "Float.toUSize",
  Float_toInt8 as "Float.toInt8",
  Float_toInt16 as "Float.toInt16",
  Float_toInt32 as "Float.toInt32",
  Float_toInt64 as "Float.toInt64",
  Float_toISize as "Float.toISize",
};

const {
  "Float32.ofBits": Float32_ofBits,
  "Float32.ofModel": Float32_ofModel,
  "Float32.toBits": Float32_toBits,
  "Float32.toModel": Float32_toModel,
  "Float32.add": Float32_add,
  "Float32.sub": Float32_sub,
  "Float32.mul": Float32_mul,
  "Float32.div": Float32_div,
  "Float32.neg": Float32_neg,
  "Float32.abs": Float32_abs,
  "Float32.decLt": Float32_decLt,
  "Float32.decLe": Float32_decLe,
  "Float32.lt": Float32_lt,
  "Float32.le": Float32_le,
  "Float32.beq": Float32_beq,
  "Float32.isNaN": Float32_isNaN,
  "Float32.isFinite": Float32_isFinite,
  "Float32.isInf": Float32_isInf,
  "Float32.toString": Float32_toString,
  "Float32.sin": Float32_sin,
  "Float32.cos": Float32_cos,
  "Float32.tan": Float32_tan,
  "Float32.asin": Float32_asin,
  "Float32.acos": Float32_acos,
  "Float32.atan": Float32_atan,
  "Float32.atan2": Float32_atan2,
  "Float32.sinh": Float32_sinh,
  "Float32.cosh": Float32_cosh,
  "Float32.tanh": Float32_tanh,
  "Float32.asinh": Float32_asinh,
  "Float32.acosh": Float32_acosh,
  "Float32.atanh": Float32_atanh,
  "Float32.exp": Float32_exp,
  "Float32.exp2": Float32_exp2,
  "Float32.log": Float32_log,
  "Float32.log2": Float32_log2,
  "Float32.log10": Float32_log10,
  "Float32.pow": Float32_pow,
  "Float32.sqrt": Float32_sqrt,
  "Float32.cbrt": Float32_cbrt,
  "Float32.ceil": Float32_ceil,
  "Float32.floor": Float32_floor,
  "Float32.round": Float32_round,
  "Float32.fma": Float32_fma,
  "Float32.scaleB": Float32_scaleB,
  "Float32.frExp": Float32_frExp,
  "Float32.toUInt8": Float32_toUInt8,
  "Float32.toUInt16": Float32_toUInt16,
  "Float32.toUInt32": Float32_toUInt32,
  "Float32.toUInt64": Float32_toUInt64,
  "Float32.toUSize": Float32_toUSize,
  "Float32.toInt8": Float32_toInt8,
  "Float32.toInt16": Float32_toInt16,
  "Float32.toInt32": Float32_toInt32,
  "Float32.toInt64": Float32_toInt64,
  "Float32.toISize": Float32_toISize,
} = floatExterns("Float32", Math.fround, float32OfBits, float32ToBits);
export {
  Float32_ofBits as "Float32.ofBits",
  Float32_ofModel as "Float32.ofModel",
  Float32_toBits as "Float32.toBits",
  Float32_toModel as "Float32.toModel",
  Float32_add as "Float32.add",
  Float32_sub as "Float32.sub",
  Float32_mul as "Float32.mul",
  Float32_div as "Float32.div",
  Float32_neg as "Float32.neg",
  Float32_abs as "Float32.abs",
  Float32_decLt as "Float32.decLt",
  Float32_decLe as "Float32.decLe",
  Float32_lt as "Float32.lt",
  Float32_le as "Float32.le",
  Float32_beq as "Float32.beq",
  Float32_isNaN as "Float32.isNaN",
  Float32_isFinite as "Float32.isFinite",
  Float32_isInf as "Float32.isInf",
  Float32_toString as "Float32.toString",
  Float32_sin as "Float32.sin",
  Float32_cos as "Float32.cos",
  Float32_tan as "Float32.tan",
  Float32_asin as "Float32.asin",
  Float32_acos as "Float32.acos",
  Float32_atan as "Float32.atan",
  Float32_atan2 as "Float32.atan2",
  Float32_sinh as "Float32.sinh",
  Float32_cosh as "Float32.cosh",
  Float32_tanh as "Float32.tanh",
  Float32_asinh as "Float32.asinh",
  Float32_acosh as "Float32.acosh",
  Float32_atanh as "Float32.atanh",
  Float32_exp as "Float32.exp",
  Float32_exp2 as "Float32.exp2",
  Float32_log as "Float32.log",
  Float32_log2 as "Float32.log2",
  Float32_log10 as "Float32.log10",
  Float32_pow as "Float32.pow",
  Float32_sqrt as "Float32.sqrt",
  Float32_cbrt as "Float32.cbrt",
  Float32_ceil as "Float32.ceil",
  Float32_floor as "Float32.floor",
  Float32_round as "Float32.round",
  Float32_fma as "Float32.fma",
  Float32_scaleB as "Float32.scaleB",
  Float32_frExp as "Float32.frExp",
  Float32_toUInt8 as "Float32.toUInt8",
  Float32_toUInt16 as "Float32.toUInt16",
  Float32_toUInt32 as "Float32.toUInt32",
  Float32_toUInt64 as "Float32.toUInt64",
  Float32_toUSize as "Float32.toUSize",
  Float32_toInt8 as "Float32.toInt8",
  Float32_toInt16 as "Float32.toInt16",
  Float32_toInt32 as "Float32.toInt32",
  Float32_toInt64 as "Float32.toInt64",
  Float32_toISize as "Float32.toISize",
};

const Float_toFloat32 = Math.fround;
export { Float_toFloat32 as "Float.toFloat32" };

const Float32_toFloat = (a) => a;
export { Float32_toFloat as "Float32.toFloat" };
