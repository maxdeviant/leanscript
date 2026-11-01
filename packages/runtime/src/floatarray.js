// `FloatArray`, stored in the first `size` elements of a buffer that may have spare capacity.
//
// Each extern follows the ownership conventions of its C counterpart: an exclusive float array is
// updated in place, and a shared one is copied first.

import { dec, RC, track } from "./core.js";

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
export function reserve(a, capacity) {
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

export function uset(a, i, v) {
  const r = reserve(a, a.size);
  r.floats[i] = v;
  return r;
}

/** Reads a `Nat` as an index or length, treating a `BigInt` as larger than any float array. */
export const index = (n) => (typeof n === "bigint" ? Infinity : n);
