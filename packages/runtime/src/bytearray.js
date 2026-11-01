// `ByteArray`, stored in the first `size` bytes of a buffer that may have spare capacity.
//
// Each extern follows the ownership conventions of its C counterpart: an exclusive byte array is
// updated in place, and a shared one is copied first.

import { dec, RC, track } from "./core.js";

export class LeanByteArray {
  /**
   * @param {Uint8Array} bytes
   * @param {number} size
   */
  constructor(bytes, size) {
    this[RC] = 1;
    this.bytes = bytes;
    this.size = size;
    track(this);
  }

  describe() {
    return `byte array of size ${this.size}`;
  }
}

/** Returns a new byte array containing a copy of the first `size` bytes of `bytes`. */
export function mkByteArray(bytes, size) {
  return new LeanByteArray(bytes.slice(0, size), size);
}

/**
 * Takes ownership of `a` and returns an exclusive byte array with its contents and room for at
 * least `capacity` bytes, copying it if it is shared.
 */
export function reserve(a, capacity) {
  if (a[RC] === 1) {
    if (a.bytes.length < capacity) {
      const bytes = new Uint8Array(Math.max(16, 2 * capacity));
      bytes.set(a.bytes.subarray(0, a.size));
      a.bytes = bytes;
    }
    return a;
  }
  const bytes = new Uint8Array(Math.max(a.bytes.length, capacity));
  bytes.set(a.bytes.subarray(0, a.size));
  const r = new LeanByteArray(bytes, a.size);
  dec(a);
  return r;
}

export function uset(a, i, v) {
  const r = reserve(a, a.size);
  r.bytes[i] = v;
  return r;
}

/** Whether `a[aStart, aEnd)` and `b[bStart, bEnd)` contain the same bytes. */
export function rangesEq(a, aStart, aEnd, b, bStart, bEnd) {
  if (aEnd - aStart !== bEnd - bStart) {
    return false;
  }
  for (let i = 0; i < aEnd - aStart; i++) {
    if (a[aStart + i] !== b[bStart + i]) {
      return false;
    }
  }
  return true;
}

export const bytesEq = (a, b) => rangesEq(a.bytes, 0, a.size, b.bytes, 0, b.size);

/** Reads a `Nat` as an index or length, treating a `BigInt` as larger than any byte array. */
export const index = (n) => (typeof n === "bigint" ? Infinity : n);

export const strictDecoder = new TextDecoder("utf-8", { fatal: true });

export const bool = (b) => (b ? 1 : 0);
