// `Array`, represented as a JS array.
//
// Without reference counts we cannot tell whether an array is shared, so every update copies.

import { arrayToList, listToArray, panic } from "./core.js";

const OUT_OF_BOUNDS = "Error: index out of bounds";

function withSet(a, i, v) {
  const r = a.slice();
  r[i] = v;
  return r;
}

export const externs = {
  "Array.mk": (_α, list) => listToArray(list),
  "Array.mkEmpty": (_α, _capacity) => [],
  "Array.toList": (_α, a) => arrayToList(a),
  "Array.size": (_α, a) => a.length,
  "Array.usize": (_α, a) => a.length,
  "Array.getInternal": (_α, a, i, _h) => a[i],
  "Array.getInternalBorrowed": (_α, a, i, _h) => a[i],
  "Array.get!Internal": (_α, d, a, i) => (i < a.length ? a[i] : panic(d, OUT_OF_BOUNDS)),
  "Array.get!InternalBorrowed": (_α, d, a, i) => (i < a.length ? a[i] : panic(d, OUT_OF_BOUNDS)),
  "Array.uget": (_α, a, i, _h) => a[i],
  "Array.ugetBorrowed": (_α, a, i, _h) => a[i],
  "Array.push": (_α, a, v) => {
    const r = a.slice();
    r.push(v);
    return r;
  },
  "Array.pop": (_α, a) => a.slice(0, -1),
  "Array.set": (_α, a, i, v, _h) => withSet(a, i, v),
  "Array.uset": (_α, a, i, v, _h) => withSet(a, i, v),
  "Array.set!": (_α, a, i, v) => (i < a.length ? withSet(a, i, v) : panic(a, OUT_OF_BOUNDS)),
  "Array.swap": (_α, a, i, j, _hi, _hj) => {
    const r = a.slice();
    r[i] = a[j];
    r[j] = a[i];
    return r;
  },
};
