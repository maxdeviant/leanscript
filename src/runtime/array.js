// `Array`, represented as a JS array with an `rc` property (see `core.js`).
//
// Each extern follows the ownership conventions of its C counterpart: an exclusive array is updated
// in place, and a shared one is copied first.

import { arrayToList, dec, inc, isExclusive, listToArray, panic, track } from "./core.js";

const OUT_OF_BOUNDS = "Error: index out of bounds";

/** Makes the JS array `xs` into a Lean `Array` owning its elements. */
export function mkArray(xs) {
  xs.rc = 1;
  return track(xs);
}

/**
 * Takes ownership of `a` and returns an exclusive array with the same elements, copying it if it
 * is shared.
 */
function ensureExclusive(a) {
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
function getOwned(a, i) {
  const x = a[i];
  inc(x);
  return x;
}

function set(a, i, v) {
  const r = ensureExclusive(a);
  dec(r[i]);
  r[i] = v;
  return r;
}

function getOrPanic(d, a, i) {
  return i < a.length ? a[i] : panic(d, OUT_OF_BOUNDS);
}

export const externs = {
  "Array.mk": (_α, list) => {
    const xs = listToArray(list);
    for (const x of xs) {
      inc(x);
    }
    dec(list);
    return mkArray(xs);
  },
  "Array.mkEmpty": (_α, _capacity) => mkArray([]),
  "Array.emptyWithCapacity": (_α, _capacity) => mkArray([]),
  "Array.toList": (_α, a) => {
    for (const x of a) {
      inc(x);
    }
    const list = arrayToList(a);
    dec(a);
    return list;
  },
  "Array.size": (_α, a) => a.length,
  "Array.usize": (_α, a) => a.length,
  "Array.getInternal": (_α, a, i, _h) => getOwned(a, i),
  "Array.getInternalBorrowed": (_α, a, i, _h) => a[i],
  "Array.get!Internal": (_α, d, a, i) => {
    const x = getOrPanic(d, a, i);
    inc(x);
    return x;
  },
  "Array.get!InternalBorrowed": (_α, d, a, i) => getOrPanic(d, a, i),
  "Array.uget": (_α, a, i, _h) => getOwned(a, i),
  "Array.ugetBorrowed": (_α, a, i, _h) => a[i],
  "Array.push": (_α, a, v) => {
    const r = ensureExclusive(a);
    r.push(v);
    return r;
  },
  "Array.pop": (_α, a) => {
    if (a.length === 0) {
      return a;
    }
    const r = ensureExclusive(a);
    dec(r.pop());
    return r;
  },
  "Array.set": (_α, a, i, v, _h) => set(a, i, v),
  "Array.uset": (_α, a, i, v, _h) => set(a, i, v),
  "Array.set!": (_α, a, i, v) => {
    if (i < a.length) {
      return set(a, i, v);
    }
    dec(v);
    return panic(a, OUT_OF_BOUNDS);
  },
  "Array.swap": (_α, a, i, j, _hi, _hj) => {
    const r = ensureExclusive(a);
    const x = r[i];
    r[i] = r[j];
    r[j] = x;
    return r;
  },
};
