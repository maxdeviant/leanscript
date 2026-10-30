// The `Std.Internal.UV.System` operations that every platform supports.

import { mkCtor } from "./core.js";
import { ioOk, randomByteArray } from "./io.js";
import { IoPromise, resolvePromise } from "./task.js";
import { monotonicNanos } from "#platform/host.js";

export const externs = {
  "Std.Internal.UV.System.hrtime": (_w) => ioOk(BigInt.asUintN(64, monotonicNanos())),
  // The C runtime fills the bytes on libuv's thread pool, so the promise may resolve at any time
  // after it is returned, including right away.
  "Std.Internal.UV.System.random": (size, _w) => {
    const promise = new IoPromise();
    resolvePromise(promise, mkCtor(1, [randomByteArray(Number(size))], null));
    return ioOk(promise);
  },
};
