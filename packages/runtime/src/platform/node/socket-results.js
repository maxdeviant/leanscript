// The results of the socket externs, which report errors as libuv does.

import { mkCtor } from "../../core.js";
import { ioError, mkIoError } from "../../io.js";
import { formatSocketAddress, socketAddressPort } from "../../net.js";
import { systemError } from "./host.js";

/** Returns the `IO.Error` for the system error `code`, with the message `message` if it is given. */
function error(code, message) {
  // An error that is not a system error, such as writing to a destroyed stream, is what libuv
  // reports for requests that are canceled when the socket closes.
  const sys = systemError({ code }) ?? systemError({ code: "ECANCELED" });
  return mkIoError(message === undefined ? sys : { ...sys, message }, undefined);
}

/** Returns a failed `IO` result with the system error `code`. */
export const fail = (code, message) => ioError(error(code, message));

/** Returns `Except.ok x`. */
export const ok = (x) => mkCtor(1, [x], null);

/** Returns `Except.error` with the system error `code`. */
export const failed = (code) => mkCtor(0, [error(code)], null);

/** Returns `{ address, port }` for the borrowed `Std.Net.SocketAddress` `addr`. */
export const fromSocketAddress = (addr) => ({
  address: formatSocketAddress(addr),
  port: socketAddressPort(addr),
});

/** Calls `f`, returning its result, or the `IO.Error` for the system error it throws. */
export function attemptRequest(f) {
  try {
    return f();
  } catch (err) {
    return fail(err.code);
  }
}
