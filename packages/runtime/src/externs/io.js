// The externs of `io.js`. `BaseIO` results are not wrapped in `EST.Out`.

import { isInitializing, mkCtor } from "../core.js";
import { normalize } from "../nat.js";
import { getEnv, monotonicNanos } from "#platform/host.js";
import { mkString } from "../string.js";
import { ioOk, randomByteArray, wallClockNanos } from "../io.js";

/** The heartbeat counter of `IO.getNumHeartbeats`, which nothing increments. */
let heartbeats = 0;

const IO_initializing = (_w) => (isInitializing() ? 1 : 0);
export { IO_initializing as "IO.initializing" };

const IO_getEnv = (name, _w) => {
  const value = getEnv(name.toString());
  return value === undefined ? 0 : mkCtor(1, [mkString(value)], null);
};
export { IO_getEnv as "IO.getEnv" };

const IO_monoMsNow = (_w) => normalize(monotonicNanos() / 1000000n);
export { IO_monoMsNow as "IO.monoMsNow" };

const IO_monoNanosNow = (_w) => normalize(monotonicNanos());
export { IO_monoNanosNow as "IO.monoNanosNow" };

const IO_getRandomBytes = (n, _w) => ioOk(randomByteArray(n));
export { IO_getRandomBytes as "IO.getRandomBytes" };

const IO_getNumHeartbeats = (_w) => heartbeats;
export { IO_getNumHeartbeats as "IO.getNumHeartbeats" };

const IO_setNumHeartbeats = (count, _w) => {
  heartbeats = count;
  return 0;
};
export { IO_setNumHeartbeats as "IO.setNumHeartbeats" };

// All Lean code runs on a single thread.
const IO_getTID = (_w) => 1n;
export { IO_getTID as "IO.getTID" };

const Std_Time_Timestamp_now = (_w) => {
  const ns = wallClockNanos();
  // A `Timestamp` is its `Duration` since the epoch, in whole seconds and nanoseconds, which the C
  // runtime computes with truncating division.
  return ioOk(mkCtor(0, [normalize(ns / 1000000000n), normalize(ns % 1000000000n)], null));
};
export { Std_Time_Timestamp_now as "Std.Time.Timestamp.now" };

const System_Platform_getIsWindows = (_unit) => 0;
export { System_Platform_getIsWindows as "System.Platform.getIsWindows" };

const System_Platform_getIsOSX = (_unit) => 0;
export { System_Platform_getIsOSX as "System.Platform.getIsOSX" };

const System_Platform_getIsLinux = (_unit) => 0;
export { System_Platform_getIsLinux as "System.Platform.getIsLinux" };

const System_Platform_getIsEmscripten = (_unit) => 0;
export { System_Platform_getIsEmscripten as "System.Platform.getIsEmscripten" };

// There is no target triple for JS, and Lean reports a missing one as empty.
const System_Platform_getTarget = (_unit) => mkString("");
export { System_Platform_getTarget as "System.Platform.getTarget" };

const System_Platform_Internal_getHardwareConcurrency = (_unit) =>
  globalThis.navigator?.hardwareConcurrency ?? 0;
export { System_Platform_Internal_getHardwareConcurrency as "System.Platform.Internal.getHardwareConcurrency" };
