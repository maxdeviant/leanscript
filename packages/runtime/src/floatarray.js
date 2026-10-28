// `FloatArray`, stored in the first `size` elements of a buffer that may have spare capacity.
//
// Each extern follows the ownership conventions of its C counterpart: an exclusive float array is
// updated in place, and a shared one is copied first.

import { dec, RC, track } from "./core.js";
import { mkArray } from "./array.js";

export class LeanFloatArray {
  /**
   * @param {Float64Array} floats
   * @param {number} size
   */
  constructor(floats, size) {
    this[RC] = 1;
    this.floats = floats;
    this.size = size;
    track(this);
  }

  describe() {
    return `float array of size ${this.size}`;
  }
}

/**
 * Takes ownership of `a` and returns an exclusive float array with its contents and room for at
 * least `capacity` floats, copying it if it is shared.
 */
function reserve(a, capacity) {
  if (a[RC] === 1) {
    if (a.floats.length < capacity) {
      const floats = new Float64Array(Math.max(16, 2 * capacity));
      floats.set(a.floats.subarray(0, a.size));
      a.floats = floats;
    }
    return a;
  }
  const floats = new Float64Array(Math.max(a.floats.length, capacity));
  floats.set(a.floats.subarray(0, a.size));
  const r = new LeanFloatArray(floats, a.size);
  dec(a);
  return r;
}

function uset(a, i, v) {
  const r = reserve(a, a.size);
  r.floats[i] = v;
  return r;
}

/** Reads a `Nat` as an index or length, treating a `BigInt` as larger than any float array. */
const index = (n) => (typeof n === "bigint" ? Infinity : n);

export const externs = {
  "FloatArray.mk": (data) => {
    const r = new LeanFloatArray(Float64Array.from(data), data.length);
    dec(data);
    return r;
  },
  "FloatArray.data": (a) => {
    const r = mkArray(Array.from(a.floats.subarray(0, a.size)));
    dec(a);
    return r;
  },
  "FloatArray.emptyWithCapacity": (capacity) =>
    new LeanFloatArray(new Float64Array(Math.min(index(capacity), 1 << 17)), 0),
  "FloatArray.size": (a) => a.size,
  "FloatArray.usize": (a) => a.size,
  "FloatArray.get": (a, i, _h) => a.floats[i],
  // Like `lean_float_array_get`, this returns 0 out of bounds without panicking.
  "FloatArray.get!": (a, i) => (index(i) < a.size ? a.floats[i] : 0),
  "FloatArray.uget": (a, i, _h) => a.floats[i],
  "FloatArray.set": (a, i, v, _h) => uset(a, i, v),
  "FloatArray.set!": (a, i, v) => (index(i) < a.size ? uset(a, i, v) : a),
  "FloatArray.uset": (a, i, v, _h) => uset(a, i, v),
  "FloatArray.push": (a, v) => {
    const r = reserve(a, a.size + 1);
    r.floats[r.size++] = v;
    return r;
  },
  // Float arrays are never marked linear, so there is no mark to set or propagate.
  "FloatArray.markLinear": (a) => a,
  "FloatArray.propagateMark": (_a, b) => b,
};
