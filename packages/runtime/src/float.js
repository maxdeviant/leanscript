// `Float` and `Float32`, which are both JS numbers.

const bits = new DataView(new ArrayBuffer(8));

export function floatOfBits(b) {
  bits.setBigUint64(0, b);
  return bits.getFloat64(0);
}

export function floatToBits(x) {
  bits.setFloat64(0, x);
  return bits.getBigUint64(0);
}

export function float32OfBits(b) {
  bits.setUint32(0, b);
  return bits.getFloat32(0);
}

export function float32ToBits(x) {
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

export function floatToString(x) {
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

/** `x * 2^n` with a single rounding, like C's `scalbn` (this is musl's algorithm). */
export function scalbn(x, n) {
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
export function clampExponent(n) {
  if (typeof n === "bigint") {
    return n < 0n ? -10000 : 10000;
  }
  return Math.max(-10000, Math.min(10000, n));
}

/** Splits `x` into a mantissa in `[0.5, 1)` and an exponent, like C's `frexp`. */
export function frexp(x) {
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
export function fma(a, b, c) {
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
export function roundHalfAway(x) {
  const t = Math.trunc(x);
  return Math.abs(x - t) >= 0.5 ? t + Math.sign(x) : t;
}

/** Converts to an unsigned integer type with maximum `max`, saturating and mapping NaN to 0. */
export const toUnsigned = (a, max) => (0 <= a ? (a < max + 1 ? Math.trunc(a) : max) : 0);

/** Converts to a signed integer type of width `w`, saturating and mapping NaN to 0. */
export const toSigned = (a, w) => {
  const min = -(2 ** (w - 1));
  const r = Number.isNaN(a) ? 0 : min - 1 < a ? (a < -min ? Math.trunc(a) : -min - 1) : min;
  return w === 32 ? r >>> 0 : r & (2 ** w - 1);
};

export const toUInt64 = (a) =>
  0 <= a ? (a < 2 ** 64 ? BigInt(Math.trunc(a)) : 0xffffffffffffffffn) : 0n;

export const toInt64 = (a) => {
  const r = Number.isNaN(a)
    ? 0n
    : -(2 ** 63) <= a
      ? a < 2 ** 63
        ? BigInt(Math.trunc(a))
        : (1n << 63n) - 1n
      : -(1n << 63n);
  return BigInt.asUintN(64, r);
};
