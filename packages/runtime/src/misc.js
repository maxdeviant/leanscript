// `Bool` conversions, `Thunk`, `Name` equality, maximal sharing, the Lean version, and debugging and
// unsafe primitives.

import {
  apply,
  Ctor,
  ctorFields,
  dec,
  inc,
  isExclusive,
  markPersistent,
  mkCtor,
  scalarFields,
  Thunk,
} from "./core.js";
import { hashBytes, mixHash } from "./hash.js";
import { LeanString, mkString, stringEq } from "./string.js";
import { sleep, writeStderr } from "#platform/host.js";

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

function address(x) {
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

const bigBool = (b) => BigInt(b);

/** Returns whether the borrowed names `a` and `b` are equal, like `lean_name_eq`. */
function nameEq(a, b) {
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
function shallowEq(a, b) {
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
function shallowHash(a) {
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

export const externs = {
  "Bool.toUInt8": (b) => b,
  "Bool.toUInt16": (b) => b,
  "Bool.toUInt32": (b) => b,
  "Bool.toUInt64": bigBool,
  "Bool.toUSize": (b) => b,
  "Bool.toInt8": (b) => b,
  "Bool.toInt16": (b) => b,
  "Bool.toInt32": (b) => b,
  "Bool.toInt64": bigBool,
  "Bool.toISize": (b) => b,

  // Evaluating both arguments is the point of these, which the caller has already done.
  strictAnd: (a, b) => a & b,
  strictOr: (a, b) => a | b,

  "Lean.Name.beq": (a, b) => (nameEq(a, b) ? 1 : 0),

  "_private.Init.Meta.Defs.0.Lean.version.getMajor": (_unit) => leanVersion.major,
  "_private.Init.Meta.Defs.0.Lean.version.getMinor": (_unit) => leanVersion.minor,
  "_private.Init.Meta.Defs.0.Lean.version.getPatch": (_unit) => leanVersion.patch,
  "Lean.version.getIsRelease": (_unit) => (leanVersion.isRelease ? 1 : 0),
  "Lean.version.getSpecialDesc": (_unit) => mkString(leanVersion.specialDesc),
  "Lean.getGithash": (_unit) => mkString(leanVersion.githash),
  "Lean.Internal.isStage0": (_unit) => 0,
  "Lean.Internal.hasLLVMBackend": (_unit) => 0,

  "Thunk.mk": (_α, fn) => new Thunk(fn, undefined),
  "Thunk.pure": (_α, a) => new Thunk(null, a),
  "Thunk.get": (_α, t) => {
    if (t.fn !== null) {
      const fn = t.fn;
      t.fn = null;
      t.value = apply(fn, [0]);
    }
    inc(t.value);
    return t.value;
  },

  dbgTrace: (_α, msg, fn) => {
    writeStderr(`${msg}\n`);
    dec(msg);
    return apply(fn, [0]);
  },
  dbgTraceIfShared: (_α, msg, a) => {
    if (typeof a === "object" && !isExclusive(a)) {
      writeStderr(`shared RC ${msg}\n`);
    }
    return a;
  },
  dbgStackTrace: (_α, fn) => apply(fn, [0]),
  dbgSleep: (_α, ms, fn) => {
    sleep(ms);
    return apply(fn, [0]);
  },
  timeit: (_α, msg, fn, _w) => {
    const start = performance.now();
    const r = apply(fn, [0]);
    writeStderr(`${msg} ${((performance.now() - start) / 1000).toPrecision(3)}s\n`);
    return r;
  },
  allocprof: (_α, _msg, fn, _w) => apply(fn, [0]),

  isExclusiveUnsafe: (_α, a) => (typeof a === "object" && isExclusive(a) ? 1 : 0),
  isScalarObj: (_α, a) => {
    const r = typeof a !== "object" ? 1 : 0;
    dec(a);
    return r;
  },
  ptrAddrUnsafe: (_α, a) => address(a),

  // Reference counts are never updated concurrently, so nothing needs marking.
  "Runtime.markMultiThreaded": (_α, a, _w) => a,
  "Runtime.markPersistent": (_α, a, _w) => markPersistent(a),
  // The C runtime leaks `a`, to skip the work of freeing it. Here the garbage collector reclaims it
  // either way, so freeing it costs little, and keeps the leak checks meaningful.
  "Runtime.forget": (_α, a, _w) => {
    dec(a);
    return 0;
  },
  "Runtime.hold": (_α, _a, _w) => 0,

  // Sharing subterms changes no value, so returning values unchanged is a valid implementation.
  "ShareCommon.shareCommon'": (_α, a) => {
    inc(a);
    return a;
  },
  "ShareCommon.State.shareCommon": (_α, _σ, s, a) => mkCtor(0, [a, s], null),
  "ShareCommon.Object.eq": (a, b) => (shallowEq(a, b) ? 1 : 0),
  "ShareCommon.Object.hash": (a) => shallowHash(a),
  sorryAx: (_α, _synthetic) => {
    throw new Error("LeanScript: executed 'sorry'");
  },
};
