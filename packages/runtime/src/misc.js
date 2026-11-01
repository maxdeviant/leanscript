// `Bool` conversions, `Thunk`, `Name` equality, maximal sharing, the Lean version, and debugging and
// unsafe primitives.

import { Ctor, ctorFields, scalarFields } from "./core.js";
import { hashBytes, mixHash } from "./hash.js";
import { LeanString, stringEq } from "./string.js";

/**
 * The version of Lean that compiles programs for the runtime, which `Lean.version` and
 * `Lean.githash` report, as they do in native programs compiled by it.
 */
export const leanVersion = {
  major: 4,
  minor: 35,
  patch: 0,
  isRelease: true,
  specialDesc: "",
  githash: "eb6cafb7290e8bd5f2937522d8d804f58f02bafc",
};

/** Returns stable, distinct numbers standing in for object addresses. */
const addresses = new WeakMap();
let nextAddress = 1;

export function address(x) {
  if (typeof x !== "object") {
    return 0;
  }
  let a = addresses.get(x);
  if (a === undefined) {
    a = nextAddress++;
    addresses.set(x, a);
  }
  return a;
}

export const bigBool = (b) => BigInt(b);

/** Returns whether the borrowed names `a` and `b` are equal, like `lean_name_eq`. */
export function nameEq(a, b) {
  while (a !== b) {
    // `str` and `num` cache their hash at offset 16, which rejects most unequal names at once.
    if (typeof a !== "object" || typeof b !== "object" || a.tag !== b.tag || a.s16 !== b.s16) {
      return false;
    }
    if (a.tag === 1 ? !stringEq(a.f1, b.f1) : a.f1 !== b.f1) {
      return false;
    }
    a = a.f0;
    b = b.f0;
  }
  return true;
}

/**
 * Returns whether `a` and `b` have the same contents without looking inside their fields, like
 * `lean_sharecommon_eq`: they are constructors with the same tag and identical fields, or equal
 * strings. Other objects are only equal to themselves.
 */
export function shallowEq(a, b) {
  if (a === b) {
    return true;
  }
  if (a instanceof LeanString && b instanceof LeanString) {
    return stringEq(a, b);
  }
  if (!(a instanceof Ctor && b instanceof Ctor) || a.tag !== b.tag) {
    return false;
  }
  const [af, bf] = [ctorFields(a), ctorFields(b)];
  const [as, bs] = [scalarFields(a), scalarFields(b)];
  return (
    af.length === bf.length &&
    af.every((x, i) => x === bf[i]) &&
    as.length === bs.length &&
    as.every(([offset, x], i) => offset === bs[i][0] && Object.is(x, bs[i][1]))
  );
}

/** Returns a hash of `a` that is the same for any objects that `shallowEq` considers equal. */
export function shallowHash(a) {
  if (a instanceof LeanString) {
    return hashBytes(a.bytes, a.size, 11n);
  }
  if (!(a instanceof Ctor)) {
    return BigInt(address(a));
  }
  const fieldHash = (x) =>
    typeof x === "object"
      ? BigInt(address(x))
      : typeof x === "bigint"
        ? x
        : BigInt(Number.isInteger(x) ? x : 0);
  return [...ctorFields(a), ...scalarFields(a).map(([, x]) => x)].reduce(
    (h, x) => mixHash(h, fieldHash(x)),
    BigInt(a.tag),
  );
}
