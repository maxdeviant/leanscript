// The JS implementations of the externs in `JsExterns.lean`.

import { dec, ioOk, mkString } from "leanscript/runtime";

export const double = (n) => n * 2;

export function shout(s) {
  const result = mkString(`${s.toString().toUpperCase()}!`);
  dec(s);
  return result;
}

export const typeOf = (x) => mkString(typeof x);

let counter = 0;

export const tick = () => ioOk(++counter);
