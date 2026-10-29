// Support for `JsValue`, which is any JS value, in the `Js` Lean library. Its externs are inline
// JS that calls these functions.

import { apply, Ctor1, dec, del, markPersistent } from "./core.js";
import { mkArray } from "./array.js";
import { ioError, ioOk, userError } from "./io.js";
import { mkString } from "./string.js";

/** Returns `some value`, or `none` if `value` is `undefined`. */
function option(value) {
  return value === undefined ? 0 : new Ctor1(1, value);
}

/** Returns the JS string `v` as a Lean `Option String`. */
export const jsToString = (v) => option(typeof v === "string" ? mkString(v) : undefined);

/** Returns the JS number `v` as a Lean `Option Float`. */
export const jsToFloat = (v) => option(typeof v === "number" ? v : undefined);

/** Returns the JS boolean `v` as a Lean `Option Bool`. */
export const jsToBool = (v) => option(typeof v === "boolean" ? Number(v) : undefined);

/** Returns the JS number `v` as a Lean `Option Int`, if it is a safe integer. */
export const jsToInt = (v) => option(Number.isSafeInteger(v) ? normalizeZero(v) : undefined);

/** Returns the JS number `v` as a Lean `Option Nat`, if it is a nonnegative safe integer. */
export const jsToNat = (v) =>
  option(Number.isSafeInteger(v) && v >= 0 ? normalizeZero(v) : undefined);

/** Returns `n`, with `-0` replaced by `0`, which is how `Nat` and `Int` represent zero. */
const normalizeZero = (n) => (n === 0 ? 0 : n);

/** Returns a copy of the JS array `v` as a Lean `Option (Array JsValue)`. */
export const jsToArray = (v) => option(Array.isArray(v) ? mkArray([...v]) : undefined);

/** Returns a JS object with the properties in `entries`, a Lean `Array (String × JsValue)`. */
export const jsObject = (entries) =>
  Object.fromEntries(Array.from(entries, (p) => [p.f0.toString(), p.f1]));

/**
 * Calls `f` and returns its result as an `EST.Out`, converting anything it throws to an
 * `IO.userError`. A result of `undefined` is returned as is, as a `JsValue`.
 */
export function jsAttempt(f) {
  try {
    return ioOk(f());
  } catch (e) {
    return ioError(userError(String(e)));
  }
}

/**
 * Returns a JS function that calls the Lean closure `f`, of type
 * `Array JsValue → BaseIO (Except String JsValue)`, with an array of its arguments, and returns the
 * result, or throws an `Error` with the message of the error.
 *
 * The JS function may be called for as long as it exists, which only the garbage collector knows,
 * so `f` becomes persistent: reference counting never frees it, or anything it captures.
 */
export function jsFunction(f) {
  markPersistent(f);
  return (...args) => {
    const result = apply(f, [mkArray(args), 0]);
    const value = result.f0;
    if (result.tag === 0) {
      const msg = value.toString();
      dec(result);
      throw new Error(msg);
    }
    del(result);
    return value;
  };
}
