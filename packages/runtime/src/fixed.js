// Fixed-width integers: `UInt8`, `UInt16`, `UInt32`, `UInt64`, `USize`, and their signed
// counterparts `Int8`, `Int16`, `Int32`, `Int64`, and `ISize`.
//
// As in the C runtime, a signed integer is stored as the unsigned integer with the same bits, so
// both share a representation: a JS number in `[0, 2^w)` for widths up to 32, and a `BigInt` for
// width 64. We target a 32-bit platform, so `USize` and `ISize` are 32 bits wide.

import { normalize } from "./nat.js";
import { mkString } from "./string.js";

const bool = (b) => (b ? 1 : 0);

/**
 * Describes a fixed-width integer type in terms of a few primitives on its representation, from
 * which `fixedWidthExterns` derives the rest.
 */
function smallType(name, width, signed) {
  const mask = width === 32 ? 0xffffffff : (1 << width) - 1;
  const shift = 32 - width;
  const wrap = width === 32 ? (n) => n >>> 0 : (n) => n & mask;
  const toSigned = width === 32 ? (a) => a | 0 : (a) => (a << shift) >> shift;
  return {
    name,
    signed,
    wrap,
    /** Wraps the `Nat` or `Int` `n`, which may be a `BigInt`. */
    ofInteger: (n) =>
      typeof n === "number" && n >= -0x80000000 && n <= 0xffffffff
        ? wrap(n >>> 0)
        : Number(BigInt.asUintN(width, BigInt(n))),
    /** Returns the value of `a` as a JS number, signed if the type is. */
    value: signed ? toSigned : (a) => a,
    /** Returns the value of `a` as a normalized `Nat` or `Int`. */
    toInteger: signed ? toSigned : (a) => a,
    zero: 0,
    add: (a, b) => wrap(a + b),
    sub: (a, b) => wrap(a - b),
    mul: width === 32 ? (a, b) => Math.imul(a, b) >>> 0 : (a, b) => wrap(a * b),
    div: (x, y) => wrap(Math.trunc(x / y)),
    rem: (x, y) => wrap(x % y),
    land: (a, b) => wrap(a & b),
    lor: (a, b) => wrap(a | b),
    xor: (a, b) => wrap(a ^ b),
    complement: (a) => wrap(~a),
    shiftLeft: (a, s) => wrap(a << s),
    shiftRight: signed ? (a, s) => wrap(toSigned(a) >> s) : (a, s) => a >>> s,
    log2: (a) => (a === 0 ? 0 : 31 - Math.clz32(a)),
    abs: (a) => wrap(Math.abs(toSigned(a))),
    // The width is a power of two, so the low bits of `b` are its remainder modulo the width whether
    // `b` is read as unsigned or as signed (as `BitVec.smod` does for the signed types).
    shiftAmount: (b) => b & (width - 1),
  };
}

function bigType(name, signed) {
  const wrap = (n) => BigInt.asUintN(64, n);
  const toSigned = (a) => BigInt.asIntN(64, a);
  return {
    name,
    signed,
    wrap,
    ofInteger: (n) => wrap(BigInt(n)),
    value: signed ? toSigned : (a) => a,
    toInteger: signed ? (a) => normalize(toSigned(a)) : normalize,
    zero: 0n,
    add: (a, b) => wrap(a + b),
    sub: (a, b) => wrap(a - b),
    mul: (a, b) => wrap(a * b),
    div: (x, y) => wrap(x / y),
    rem: (x, y) => wrap(x % y),
    land: (a, b) => a & b,
    lor: (a, b) => a | b,
    xor: (a, b) => a ^ b,
    complement: (a) => wrap(~a),
    shiftLeft: (a, s) => wrap(a << BigInt(s)),
    shiftRight: signed ? (a, s) => wrap(toSigned(a) >> BigInt(s)) : (a, s) => a >> BigInt(s),
    log2: (a) => (a === 0n ? 0n : BigInt(a.toString(2).length - 1)),
    abs: (a) => wrap(toSigned(a) < 0n ? -toSigned(a) : a),
    shiftAmount: (b) => Number(b & 63n),
  };
}

const types = [
  smallType("UInt8", 8, false),
  smallType("UInt16", 16, false),
  smallType("UInt32", 32, false),
  bigType("UInt64", false),
  smallType("USize", 32, false),
  smallType("Int8", 8, true),
  smallType("Int16", 16, true),
  smallType("Int32", 32, true),
  bigType("Int64", true),
  smallType("ISize", 32, true),
];

/** Returns the externs of the type `t`, with the semantics of the corresponding `BitVec` ops. */
function fixedWidthExterns(t) {
  const { name, signed, value } = t;
  const ext = {
    add: t.add,
    sub: t.sub,
    mul: t.mul,
    // Division by zero is zero, and the remainder of division by zero is the dividend.
    div: (a, b) => (b === t.zero ? t.zero : t.div(value(a), value(b))),
    mod: (a, b) => (b === t.zero ? a : t.rem(value(a), value(b))),
    land: t.land,
    lor: t.lor,
    xor: t.xor,
    complement: t.complement,
    neg: (a) => t.sub(t.zero, a),
    shiftLeft: (a, b) => t.shiftLeft(a, t.shiftAmount(b)),
    shiftRight: (a, b) => t.shiftRight(a, t.shiftAmount(b)),
    decEq: (a, b) => bool(a === b),
    decLt: (a, b) => bool(value(a) < value(b)),
    decLe: (a, b) => bool(value(a) <= value(b)),
    ofNat: t.ofInteger,
    ofNatLT: (n, _h) => t.ofInteger(n),
    ofBitVec: t.ofInteger,
    toBitVec: (a) => normalize(BigInt(a)),
    toFloat: (a) => Number(value(a)),
    toFloat32: (a) => Math.fround(Number(value(a))),
  };
  if (signed) {
    Object.assign(ext, { ofInt: t.ofInteger, toInt: t.toInteger, abs: t.abs });
  } else {
    Object.assign(ext, { toNat: t.toInteger, log2: t.log2 });
  }
  // Conversions between widths sign-extend from a signed type and zero-extend from an unsigned one.
  for (const target of types) {
    if (target !== t) {
      ext[`to${target.name}`] = (a) => target.ofInteger(t.toInteger(a));
    }
  }
  return Object.fromEntries(Object.entries(ext).map(([op, fn]) => [`${name}.${op}`, fn]));
}

export const externs = {
  ...Object.assign({}, ...types.map(fixedWidthExterns)),
  "USize.ofNat32": (n, _h) => n,
  "USize.repr": (n) => mkString(String(n)),
  "System.Platform.getNumBits": (_unit) => 32,
};
