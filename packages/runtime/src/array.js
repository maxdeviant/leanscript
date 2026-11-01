// `Array`, represented as a JS array with a reference count (see `core.js`).
//
// Each extern follows the ownership conventions of its C counterpart: an exclusive array is updated
// in place, and a shared one is copied first.

import { dec, inc, isExclusive, panic, RC, track } from "./core.js";

export const OUT_OF_BOUNDS = "Error: index out of bounds";

/** Makes the JS array `xs` into a Lean `Array` owning its elements. */
export function mkArray(xs) {
  xs[RC] = 1;
  return track(xs);
}

/**
 * Takes ownership of `a` and returns an exclusive array with the same elements, copying it if it
 * is shared.
 */
export function ensureExclusive(a) {
  if (isExclusive(a)) {
    return a;
  }
  const r = mkArray(a.slice());
  for (const x of r) {
    inc(x);
  }
  dec(a);
  return r;
}

/** Returns the element at `i` as an owned reference. */
export function getOwned(a, i) {
  const x = a[i];
  inc(x);
  return x;
}

export function set(a, i, v) {
  const r = ensureExclusive(a);
  dec(r[i]);
  r[i] = v;
  return r;
}

export function getOrPanic(d, a, i) {
  return i < a.length ? a[i] : panic(d, OUT_OF_BOUNDS);
}
