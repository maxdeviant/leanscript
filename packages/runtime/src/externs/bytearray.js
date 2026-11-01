// The externs of `bytearray.js`.

import { dec } from "../core.js";
import { mkArray } from "../array.js";
import { hashBytes } from "../hash.js";
import {
  LeanByteArray,
  bool,
  bytesEq,
  index,
  rangesEq,
  reserve,
  strictDecoder,
  uset,
} from "../bytearray.js";

const ByteArray_mk = (data) => {
  const r = new LeanByteArray(Uint8Array.from(data), data.length);
  dec(data);
  return r;
};
export { ByteArray_mk as "ByteArray.mk" };

const ByteArray_data = (a) => {
  const r = mkArray(Array.from(a.bytes.subarray(0, a.size)));
  dec(a);
  return r;
};
export { ByteArray_data as "ByteArray.data" };

const ByteArray_emptyWithCapacity = (capacity) =>
  new LeanByteArray(new Uint8Array(Math.min(index(capacity), 1 << 20)), 0);
export { ByteArray_emptyWithCapacity as "ByteArray.emptyWithCapacity" };

const ByteArray_size = (a) => a.size;
export { ByteArray_size as "ByteArray.size" };

const ByteArray_usize = (a) => a.size;
export { ByteArray_usize as "ByteArray.usize" };

const ByteArray_get = (a, i, _h) => a.bytes[i];
export { ByteArray_get as "ByteArray.get" };

// Like `lean_byte_array_get`, this returns 0 out of bounds without panicking.
const ByteArray_getBang = (a, i) => (index(i) < a.size ? a.bytes[i] : 0);
export { ByteArray_getBang as "ByteArray.get!" };

const ByteArray_uget = (a, i, _h) => a.bytes[i];
export { ByteArray_uget as "ByteArray.uget" };

const ByteArray_set = (a, i, v, _h) => uset(a, i, v);
export { ByteArray_set as "ByteArray.set" };

const ByteArray_setBang = (a, i, v) => (index(i) < a.size ? uset(a, i, v) : a);
export { ByteArray_setBang as "ByteArray.set!" };

const ByteArray_uset = (a, i, v, _h) => uset(a, i, v);
export { ByteArray_uset as "ByteArray.uset" };

const ByteArray_push = (a, v) => {
  const r = reserve(a, a.size + 1);
  r.bytes[r.size++] = v;
  return r;
};
export { ByteArray_push as "ByteArray.push" };

// Copies `src[srcOff, srcOff + len)` over `dest` starting at `destOff`, growing `dest` as needed.
// Offsets past the end are clamped, as in the reference implementation.
const ByteArray_copySlice = (src, srcOff, dest, destOff, len, _exact) => {
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
};
export { ByteArray_copySlice as "ByteArray.copySlice" };

const ByteArray_beq = (a, b) => bool(bytesEq(a, b));
export { ByteArray_beq as "ByteArray.beq" };

const ByteArray_decEq = (a, b) => bool(bytesEq(a, b));
export { ByteArray_decEq as "ByteArray.decEq" };

const ByteArray_hash = (a) => hashBytes(a.bytes, a.size, 11n);
export { ByteArray_hash as "ByteArray.hash" };

// A `ByteSlice` holds its byte array, start, and stop, where the proofs guarantee that the
// range is in bounds.
const ByteSlice_beq = (a, b) => bool(rangesEq(a.f0.bytes, a.f1, a.f2, b.f0.bytes, b.f1, b.f2));
export { ByteSlice_beq as "ByteSlice.beq" };

// Byte arrays are never marked linear, so there is no mark to set or propagate.
const ByteArray_markLinear = (a) => a;
export { ByteArray_markLinear as "ByteArray.markLinear" };

const ByteArray_propagateMark = (_a, b) => b;
export { ByteArray_propagateMark as "ByteArray.propagateMark" };

const ByteArray_validateUTF8 = (a) => {
  try {
    strictDecoder.decode(a.bytes.subarray(0, a.size));
    return 1;
  } catch {
    return 0;
  }
};
export { ByteArray_validateUTF8 as "ByteArray.validateUTF8" };
