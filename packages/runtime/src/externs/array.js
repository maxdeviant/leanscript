// The externs of `array.js`.

import { arrayToList, dec, inc, incN, listToArray, panic } from "../core.js";
import { OUT_OF_BOUNDS, ensureExclusive, getOrPanic, getOwned, mkArray, set } from "../array.js";

const Array_mk = (_α, list) => {
  const xs = listToArray(list);
  for (const x of xs) {
    inc(x);
  }
  dec(list);
  return mkArray(xs);
};
export { Array_mk as "Array.mk" };

const Array_mkEmpty = (_α, _capacity) => mkArray([]);
export { Array_mkEmpty as "Array.mkEmpty" };

const Array_emptyWithCapacity = (_α, _capacity) => mkArray([]);
export { Array_emptyWithCapacity as "Array.emptyWithCapacity" };

const Array_toList = (_α, a) => {
  for (const x of a) {
    inc(x);
  }
  const list = arrayToList(a);
  dec(a);
  return list;
};
export { Array_toList as "Array.toList" };

const Array_replicate = (_α, n, v) => {
  if (typeof n !== "number" || n > 0xffffffff) {
    throw new Error("LeanScript: out of memory");
  }
  if (n === 0) {
    dec(v);
  } else {
    incN(v, n - 1);
  }
  // `Array.from({ length: n }, …)` is many times slower for large arrays, such as a hash map's
  // buckets.
  // oxlint-disable-next-line unicorn/no-new-array
  return mkArray(new Array(n).fill(v));
};
export { Array_replicate as "Array.replicate" };

// Arrays are never marked linear, so there is no mark to set or propagate.
const Array_markLinear = (_α, a) => a;
export { Array_markLinear as "Array.markLinear" };

const Array_propagateMark = (_α, _β, _xs, ys) => ys;
export { Array_propagateMark as "Array.propagateMark" };

const Array_swapIfInBounds = (_α, a, i, j) => {
  if (!(i < a.length && j < a.length)) {
    return a;
  }
  const r = ensureExclusive(a);
  [r[i], r[j]] = [r[j], r[i]];
  return r;
};
export { Array_swapIfInBounds as "Array.swapIfInBounds" };

const Array_size = (_α, a) => a.length;
export { Array_size as "Array.size" };

const Array_usize = (_α, a) => a.length;
export { Array_usize as "Array.usize" };

const Array_getInternal = (_α, a, i, _h) => getOwned(a, i);
export { Array_getInternal as "Array.getInternal" };

const Array_getInternalBorrowed = (_α, a, i, _h) => a[i];
export { Array_getInternalBorrowed as "Array.getInternalBorrowed" };

const Array_getBangInternal = (_α, d, a, i) => {
  const x = getOrPanic(d, a, i);
  inc(x);
  return x;
};
export { Array_getBangInternal as "Array.get!Internal" };

const Array_getBangInternalBorrowed = (_α, d, a, i) => getOrPanic(d, a, i);
export { Array_getBangInternalBorrowed as "Array.get!InternalBorrowed" };

const Array_uget = (_α, a, i, _h) => getOwned(a, i);
export { Array_uget as "Array.uget" };

const Array_ugetBorrowed = (_α, a, i, _h) => a[i];
export { Array_ugetBorrowed as "Array.ugetBorrowed" };

const Array_push = (_α, a, v) => {
  const r = ensureExclusive(a);
  r.push(v);
  return r;
};
export { Array_push as "Array.push" };

const Array_pop = (_α, a) => {
  if (a.length === 0) {
    return a;
  }
  const r = ensureExclusive(a);
  dec(r.pop());
  return r;
};
export { Array_pop as "Array.pop" };

const Array_set = (_α, a, i, v, _h) => set(a, i, v);
export { Array_set as "Array.set" };

const Array_uset = (_α, a, i, v, _h) => set(a, i, v);
export { Array_uset as "Array.uset" };

const Array_setBang = (_α, a, i, v) => {
  if (i < a.length) {
    return set(a, i, v);
  }
  dec(v);
  return panic(a, OUT_OF_BOUNDS);
};
export { Array_setBang as "Array.set!" };

const Array_swap = (_α, a, i, j, _hi, _hj) => {
  const r = ensureExclusive(a);
  const x = r[i];
  r[i] = r[j];
  r[j] = x;
  return r;
};
export { Array_swap as "Array.swap" };
