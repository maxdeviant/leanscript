// The externs of `misc.js`.

import { apply, dec, inc, isExclusive, markPersistent, mkCtor, panic, Thunk } from "../core.js";
import { mkString } from "../string.js";
import { sleep, writeStderr } from "#platform/host.js";
import { address, bigBool, leanVersion, nameEq, shallowEq, shallowHash } from "../misc.js";

const panicCore = (_α, defaultValue, msg) => {
  const text = msg.toString();
  dec(msg);
  // The default value is borrowed, but we return it as an owned reference.
  inc(defaultValue);
  return panic(defaultValue, text);
};
export { panicCore };

const Bool_toUInt8 = (b) => b;
export { Bool_toUInt8 as "Bool.toUInt8" };

const Bool_toUInt16 = (b) => b;
export { Bool_toUInt16 as "Bool.toUInt16" };

const Bool_toUInt32 = (b) => b;
export { Bool_toUInt32 as "Bool.toUInt32" };

export { bigBool as "Bool.toUInt64" };

const Bool_toUSize = (b) => b;
export { Bool_toUSize as "Bool.toUSize" };

const Bool_toInt8 = (b) => b;
export { Bool_toInt8 as "Bool.toInt8" };

const Bool_toInt16 = (b) => b;
export { Bool_toInt16 as "Bool.toInt16" };

const Bool_toInt32 = (b) => b;
export { Bool_toInt32 as "Bool.toInt32" };

export { bigBool as "Bool.toInt64" };

const Bool_toISize = (b) => b;
export { Bool_toISize as "Bool.toISize" };

// Evaluating both arguments is the point of these, which the caller has already done.
const strictAnd = (a, b) => a & b;
export { strictAnd };

const strictOr = (a, b) => a | b;
export { strictOr };

const Lean_Name_beq = (a, b) => (nameEq(a, b) ? 1 : 0);
export { Lean_Name_beq as "Lean.Name.beq" };

const _private_Init_Meta_Defs_0_Lean_version_getMajor = (_unit) => leanVersion.major;
export { _private_Init_Meta_Defs_0_Lean_version_getMajor as "_private.Init.Meta.Defs.0.Lean.version.getMajor" };

const _private_Init_Meta_Defs_0_Lean_version_getMinor = (_unit) => leanVersion.minor;
export { _private_Init_Meta_Defs_0_Lean_version_getMinor as "_private.Init.Meta.Defs.0.Lean.version.getMinor" };

const _private_Init_Meta_Defs_0_Lean_version_getPatch = (_unit) => leanVersion.patch;
export { _private_Init_Meta_Defs_0_Lean_version_getPatch as "_private.Init.Meta.Defs.0.Lean.version.getPatch" };

const Lean_version_getIsRelease = (_unit) => (leanVersion.isRelease ? 1 : 0);
export { Lean_version_getIsRelease as "Lean.version.getIsRelease" };

const Lean_version_getSpecialDesc = (_unit) => mkString(leanVersion.specialDesc);
export { Lean_version_getSpecialDesc as "Lean.version.getSpecialDesc" };

const Lean_getGithash = (_unit) => mkString(leanVersion.githash);
export { Lean_getGithash as "Lean.getGithash" };

const Lean_Internal_isStage0 = (_unit) => 0;
export { Lean_Internal_isStage0 as "Lean.Internal.isStage0" };

const Lean_Internal_hasLLVMBackend = (_unit) => 0;
export { Lean_Internal_hasLLVMBackend as "Lean.Internal.hasLLVMBackend" };

const Thunk_mk = (_α, fn) => new Thunk(fn, undefined);
export { Thunk_mk as "Thunk.mk" };

const Thunk_pure = (_α, a) => new Thunk(null, a);
export { Thunk_pure as "Thunk.pure" };

const Thunk_get = (_α, t) => {
  if (t.fn !== null) {
    const fn = t.fn;
    t.fn = null;
    t.value = apply(fn, [0]);
  }
  inc(t.value);
  return t.value;
};
export { Thunk_get as "Thunk.get" };

const dbgTrace = (_α, msg, fn) => {
  writeStderr(`${msg}\n`);
  dec(msg);
  return apply(fn, [0]);
};
export { dbgTrace };

const dbgTraceIfShared = (_α, msg, a) => {
  if (typeof a === "object" && !isExclusive(a)) {
    writeStderr(`shared RC ${msg}\n`);
  }
  return a;
};
export { dbgTraceIfShared };

const dbgStackTrace = (_α, fn) => apply(fn, [0]);
export { dbgStackTrace };

const dbgSleep = (_α, ms, fn) => {
  sleep(ms);
  return apply(fn, [0]);
};
export { dbgSleep };

const timeit = (_α, msg, fn, _w) => {
  const start = performance.now();
  const r = apply(fn, [0]);
  writeStderr(`${msg} ${((performance.now() - start) / 1000).toPrecision(3)}s\n`);
  return r;
};
export { timeit };

const allocprof = (_α, _msg, fn, _w) => apply(fn, [0]);
export { allocprof };

const isExclusiveUnsafe = (_α, a) => (typeof a === "object" && isExclusive(a) ? 1 : 0);
export { isExclusiveUnsafe };

const isScalarObj = (_α, a) => {
  const r = typeof a !== "object" ? 1 : 0;
  dec(a);
  return r;
};
export { isScalarObj };

const ptrAddrUnsafe = (_α, a) => address(a);
export { ptrAddrUnsafe };

// Reference counts are never updated concurrently, so nothing needs marking.
const Runtime_markMultiThreaded = (_α, a, _w) => a;
export { Runtime_markMultiThreaded as "Runtime.markMultiThreaded" };

const Runtime_markPersistent = (_α, a, _w) => markPersistent(a);
export { Runtime_markPersistent as "Runtime.markPersistent" };

// The C runtime leaks `a`, to skip the work of freeing it. Here the garbage collector reclaims it
// either way, so freeing it costs little, and keeps the leak checks meaningful.
const Runtime_forget = (_α, a, _w) => {
  dec(a);
  return 0;
};
export { Runtime_forget as "Runtime.forget" };

const Runtime_hold = (_α, _a, _w) => 0;
export { Runtime_hold as "Runtime.hold" };

// Sharing subterms changes no value, so returning values unchanged is a valid implementation.
const ShareCommon_shareCommonPrime = (_α, a) => {
  inc(a);
  return a;
};
export { ShareCommon_shareCommonPrime as "ShareCommon.shareCommon'" };

const ShareCommon_State_shareCommon = (_α, _σ, s, a) => mkCtor(0, [a, s], null);
export { ShareCommon_State_shareCommon as "ShareCommon.State.shareCommon" };

const ShareCommon_Object_eq = (a, b) => (shallowEq(a, b) ? 1 : 0);
export { ShareCommon_Object_eq as "ShareCommon.Object.eq" };

const ShareCommon_Object_hash = (a) => shallowHash(a);
export { ShareCommon_Object_hash as "ShareCommon.Object.hash" };

const sorryAx = (_α, _synthetic) => {
  throw new Error("LeanScript: executed 'sorry'");
};
export { sorryAx };
