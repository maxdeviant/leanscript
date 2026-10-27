// Objects, closures, and other core runtime support.

import { writeStderr } from "./platform.js";

export class Ctor {
  /**
   * @param {number} tag
   * @param {unknown[]} f The object fields.
   * @param {Record<number, unknown> | null} s The scalar fields, keyed by byte offset.
   */
  constructor(tag, f, s) {
    this.tag = tag;
    this.f = f;
    this.s = s;
  }
}

/** Returns the constructor index of `x`, which is either a `Ctor` or a boxed scalar. */
export function tag(x) {
  return typeof x === "number" ? x : x.tag;
}

export function unreachable() {
  throw new Error("LeanScript: unreachable code reached");
}

/** Reports the panic message `msg` and returns `defaultValue`, as `lean_panic_fn` does. */
export function panic(defaultValue, msg) {
  writeStderr(`${msg}\n`);
  return defaultValue;
}

/** Returns a function that computes `init()` on first call and returns the cached value after. */
export function lazy(init) {
  let state = 0;
  let value;
  return () => {
    if (state === 2) return value;
    if (state === 1) throw new Error("LeanScript: cyclic constant initialization");
    state = 1;
    value = init();
    state = 2;
    return value;
  };
}

class Closure {
  constructor(fn, arity, args) {
    this.fn = fn;
    this.arity = arity;
    this.args = args;
  }
}

/** Partially applies `fn`, which takes `arity` arguments, to `args`. */
export function pap(fn, arity, args) {
  return new Closure(fn, arity, args);
}

/** Applies the closure `f` to `args`, which may be fewer or more than it still expects. */
export function apply(f, args) {
  const remaining = f.arity - f.args.length;
  if (args.length < remaining) {
    return new Closure(f.fn, f.arity, f.args.concat(args));
  }
  if (args.length === remaining) {
    return f.fn(...f.args, ...args);
  }
  const result = f.fn(...f.args, ...args.slice(0, remaining));
  return apply(result, args.slice(remaining));
}

/** Converts a JS array to a Lean `List`. */
export function arrayToList(xs) {
  let list = 0;
  for (let i = xs.length - 1; i >= 0; i--) {
    list = new Ctor(1, [xs[i], list], null);
  }
  return list;
}

/** Converts a Lean `List` to a JS array. */
export function listToArray(list) {
  const xs = [];
  while (list !== 0) {
    xs.push(list.f[0]);
    list = list.f[1];
  }
  return xs;
}
