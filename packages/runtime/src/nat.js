// `Nat` and `Int`.
//
// Both are JS numbers when they are safe integers and `BigInt`s otherwise. Every value the runtime
// produces is normalized this way, so `===` is equality, and the relational operators work across
// the two representations.

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

export function normalize(n) {
  return n >= MIN_SAFE && n <= MAX_SAFE ? Number(n) : n;
}

function isSmall(a, b) {
  return typeof a === "number" && typeof b === "number";
}

export function natAdd(a, b) {
  if (isSmall(a, b)) {
    const r = a + b;
    if (r <= Number.MAX_SAFE_INTEGER) {
      return r;
    }
  }
  return normalize(BigInt(a) + BigInt(b));
}

export function natSub(a, b) {
  if (isSmall(a, b)) {
    return a < b ? 0 : a - b;
  }
  const r = BigInt(a) - BigInt(b);
  return r < 0n ? 0 : normalize(r);
}

export function natMul(a, b) {
  if (isSmall(a, b)) {
    const r = a * b;
    if (r <= Number.MAX_SAFE_INTEGER) {
      return r;
    }
  }
  return normalize(BigInt(a) * BigInt(b));
}

export function natDiv(a, b) {
  if (b === 0) {
    return 0;
  }
  // Unlike `Math.floor(a / b)`, this is exact for every safe integer.
  if (isSmall(a, b)) {
    return (a - (a % b)) / b;
  }
  return normalize(BigInt(a) / BigInt(b));
}

export function natMod(a, b) {
  if (b === 0) {
    return a;
  }
  if (isSmall(a, b)) {
    return a % b;
  }
  return normalize(BigInt(a) % BigInt(b));
}

export function natPow(a, b) {
  return normalize(BigInt(a) ** BigInt(b));
}

export function natLog2(a) {
  if (typeof a === "number") {
    if (a === 0) {
      return 0;
    }
    if (a <= 0xffffffff) {
      return 31 - Math.clz32(a);
    }
    return 63 - Math.clz32(Math.floor(a / 2 ** 32));
  }
  return a.toString(2).length - 1;
}

export function natShiftLeft(a, b) {
  return normalize(BigInt(a) << BigInt(b));
}

export function natShiftRight(a, b) {
  return normalize(BigInt(a) >> BigInt(b));
}

export function natLor(a, b) {
  return normalize(BigInt(a) | BigInt(b));
}

export function natLand(a, b) {
  return normalize(BigInt(a) & BigInt(b));
}

export function natXor(a, b) {
  return normalize(BigInt(a) ^ BigInt(b));
}

export function intNeg(a) {
  if (typeof a === "number") {
    return a === 0 ? 0 : -a;
  }
  return normalize(-a);
}

export function intAdd(a, b) {
  if (isSmall(a, b)) {
    const r = a + b;
    if (Number.isSafeInteger(r)) {
      return r;
    }
  }
  return normalize(BigInt(a) + BigInt(b));
}

export function intSub(a, b) {
  if (isSmall(a, b)) {
    const r = a - b;
    if (Number.isSafeInteger(r)) {
      return r;
    }
  }
  return normalize(BigInt(a) - BigInt(b));
}

export function intMul(a, b) {
  if (isSmall(a, b)) {
    const r = a * b;
    if (Number.isSafeInteger(r)) {
      // Avoid `-0`, which would break `===` equality.
      return r + 0;
    }
  }
  return normalize(BigInt(a) * BigInt(b));
}

/** Division rounding toward zero, where division by zero is zero. */
export function intTdiv(a, b) {
  if (b === 0) {
    return 0;
  }
  // Unlike `Math.trunc(a / b)`, this is exact for every safe integer.
  if (isSmall(a, b)) {
    return (a - (a % b)) / b + 0;
  }
  return normalize(BigInt(a) / BigInt(b));
}

/** The remainder of `intTdiv`, which has the sign of `a`. The remainder of division by zero is `a`. */
export function intTmod(a, b) {
  if (b === 0) {
    return a;
  }
  if (isSmall(a, b)) {
    return (a % b) + 0;
  }
  return normalize(BigInt(a) % BigInt(b));
}

/** The remainder of `intEdiv`, which is never negative. The remainder of division by zero is `a`. */
export function intEmod(a, b) {
  const r = intTmod(a, b);
  return r < 0 ? intAdd(r, b < 0 ? intNeg(b) : b) : r;
}

/** Euclidean division, where division by zero is zero. */
export function intEdiv(a, b) {
  if (b === 0) {
    return 0;
  }
  const q = intTdiv(a, b);
  if (intTmod(a, b) >= 0) {
    return q;
  }
  return b > 0 ? intSub(q, 1) : intAdd(q, 1);
}

export function natGcd(a, b) {
  if (isSmall(a, b)) {
    while (b !== 0) {
      [a, b] = [b, a % b];
    }
    return a;
  }
  let x = BigInt(a);
  let y = BigInt(b);
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return normalize(x);
}

export function natPowMod(a, b, m) {
  if (m === 0) {
    return natPow(a, b);
  }
  const mod = BigInt(m);
  let base = BigInt(a) % mod;
  let exp = BigInt(b);
  let r = 1n % mod;
  while (exp > 0n) {
    if (exp & 1n) {
      r = (r * base) % mod;
    }
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return normalize(r);
}
