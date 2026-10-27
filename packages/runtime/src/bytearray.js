// `ByteArray`, stored in the first `size` bytes of a buffer that may have spare capacity.
//
// Each extern follows the ownership conventions of its C counterpart: an exclusive byte array is
// updated in place, and a shared one is copied first.

import { dec, RC, track } from "./core.js";
import { mkArray } from "./array.js";
import { hashBytes } from "./hash.js";

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
function reserve(a, capacity) {
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

function uset(a, i, v) {
  const r = reserve(a, a.size);
  r.bytes[i] = v;
  return r;
}

function bytesEq(a, b) {
  if (a.size !== b.size) {
    return false;
  }
  for (let i = 0; i < a.size; i++) {
    if (a.bytes[i] !== b.bytes[i]) {
      return false;
    }
  }
  return true;
}

/** Reads a `Nat` as an index or length, treating a `BigInt` as larger than any byte array. */
const index = (n) => (typeof n === "bigint" ? Infinity : n);

const strictDecoder = new TextDecoder("utf-8", { fatal: true });

const bool = (b) => (b ? 1 : 0);

export const externs = {
  "ByteArray.mk": (data) => {
    const r = new LeanByteArray(Uint8Array.from(data), data.length);
    dec(data);
    return r;
  },
  "ByteArray.data": (a) => {
    const r = mkArray(Array.from(a.bytes.subarray(0, a.size)));
    dec(a);
    return r;
  },
  "ByteArray.emptyWithCapacity": (capacity) =>
    new LeanByteArray(new Uint8Array(Math.min(index(capacity), 1 << 20)), 0),
  "ByteArray.size": (a) => a.size,
  "ByteArray.usize": (a) => a.size,
  "ByteArray.get": (a, i, _h) => a.bytes[i],
  // Like `lean_byte_array_get`, this returns 0 out of bounds without panicking.
  "ByteArray.get!": (a, i) => (index(i) < a.size ? a.bytes[i] : 0),
  "ByteArray.uget": (a, i, _h) => a.bytes[i],
  "ByteArray.set": (a, i, v, _h) => uset(a, i, v),
  "ByteArray.set!": (a, i, v) => (index(i) < a.size ? uset(a, i, v) : a),
  "ByteArray.uset": (a, i, v, _h) => uset(a, i, v),
  "ByteArray.push": (a, v) => {
    const r = reserve(a, a.size + 1);
    r.bytes[r.size++] = v;
    return r;
  },
  // Copies `src[srcOff, srcOff + len)` over `dest` starting at `destOff`, growing `dest` as needed.
  // Offsets past the end are clamped, as in the reference implementation.
  "ByteArray.copySlice": (src, srcOff, dest, destOff, len, _exact) => {
    const start = Math.min(index(srcOff), src.size);
    const n = Math.min(index(len), src.size - start);
    const at = Math.min(index(destOff), dest.size);
    const suffix = Math.min(index(destOff) + n, dest.size);
    const size = at + n + (dest.size - suffix);
    const bytes = new Uint8Array(size);
    bytes.set(dest.bytes.subarray(0, at));
    bytes.set(src.bytes.subarray(start, start + n), at);
    bytes.set(dest.bytes.subarray(suffix, dest.size), at + n);
    dec(dest);
    return new LeanByteArray(bytes, size);
  },
  "ByteArray.beq": (a, b) => bool(bytesEq(a, b)),
  "ByteArray.decEq": (a, b) => bool(bytesEq(a, b)),
  "ByteArray.hash": (a) => hashBytes(a.bytes, a.size, 11n),
  // Byte arrays are never marked linear, so there is no mark to set or propagate.
  "ByteArray.markLinear": (a) => a,
  "ByteArray.propagateMark": (_a, b) => b,
  "ByteArray.validateUTF8": (a) => {
    try {
      strictDecoder.decode(a.bytes.subarray(0, a.size));
      return 1;
    } catch {
      return 0;
    }
  },
};
