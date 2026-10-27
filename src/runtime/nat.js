// `Nat` and `Int`.
//
// Both are JS numbers when they are safe integers and `BigInt`s otherwise. Every value the runtime
// produces is normalized this way, so `===` is equality, and the relational operators work across
// the two representations.

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

function normalize(n) {
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

export const externs = {
  "Nat.add": natAdd,
  "Nat.sub": natSub,
  "Nat.mul": natMul,
  "Nat.div": natDiv,
  "Nat.mod": natMod,
  "Nat.pow": natPow,
  "Nat.log2": natLog2,
  "Nat.shiftLeft": natShiftLeft,
  "Nat.shiftRight": natShiftRight,
  "Nat.lor": natLor,
  "Nat.land": natLand,
  "Nat.xor": natXor,
  "Nat.decEq": (a, b) => (a === b ? 1 : 0),
  "Nat.decLt": (a, b) => (a < b ? 1 : 0),
  "Nat.decLe": (a, b) => (a <= b ? 1 : 0),
  "Nat.beq": (a, b) => (a === b ? 1 : 0),
  "Nat.blt": (a, b) => (a < b ? 1 : 0),
  "Nat.ble": (a, b) => (a <= b ? 1 : 0),

  "Int.ofNat": (n) => n,
  "Int.negSucc": (n) => intNeg(natAdd(n, 1)),
  "Int.neg": intNeg,
  "Int.add": intAdd,
  "Int.sub": intSub,
  "Int.natAbs": (a) => (a < 0 ? intNeg(a) : a),
  "Int.decEq": (a, b) => (a === b ? 1 : 0),
  "Int.decLt": (a, b) => (a < b ? 1 : 0),
  "Int.decLe": (a, b) => (a <= b ? 1 : 0),
};
