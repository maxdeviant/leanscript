// `Bool` conversions, `Thunk`, and debugging and unsafe primitives.

import { apply, dec, inc, isExclusive, Thunk } from "./core.js";
import { writeStderr } from "./platform.js";

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
  dbgSleep: (_α, _ms, fn) => apply(fn, [0]),
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
  sorryAx: (_α, _synthetic) => {
    throw new Error("LeanScript: executed 'sorry'");
  },
};
