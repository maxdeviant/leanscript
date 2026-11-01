// The `Std.Internal.UV.System` operations that every platform supports.

import { mkCtor } from "../core.js";
import { ioOk, randomByteArray } from "../io.js";
import { IoPromise, resolvePromise } from "../task.js";
import { monotonicNanos } from "#platform/host.js";

const Std_Internal_UV_System_hrtime = (_w) => ioOk(BigInt.asUintN(64, monotonicNanos()));
export { Std_Internal_UV_System_hrtime as "Std.Internal.UV.System.hrtime" };

// The C runtime fills the bytes on libuv's thread pool, so the promise may resolve at any time
// after it is returned, including right away.
const Std_Internal_UV_System_random = (size, _w) => {
  const promise = new IoPromise();
  resolvePromise(promise, mkCtor(1, [randomByteArray(Number(size))], null));
  return ioOk(promise);
};
export { Std_Internal_UV_System_random as "Std.Internal.UV.System.random" };
