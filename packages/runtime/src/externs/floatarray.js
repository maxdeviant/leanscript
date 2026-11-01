// The externs of `floatarray.js`.

import { dec } from "../core.js";
import { mkArray } from "../array.js";
import { LeanFloatArray, index, reserve, uset } from "../floatarray.js";

const FloatArray_mk = (data) => {
  const r = new LeanFloatArray(Float64Array.from(data), data.length);
  dec(data);
  return r;
};
export { FloatArray_mk as "FloatArray.mk" };

const FloatArray_data = (a) => {
  const r = mkArray(Array.from(a.floats.subarray(0, a.size)));
  dec(a);
  return r;
};
export { FloatArray_data as "FloatArray.data" };

const FloatArray_emptyWithCapacity = (capacity) =>
  new LeanFloatArray(new Float64Array(Math.min(index(capacity), 1 << 17)), 0);
export { FloatArray_emptyWithCapacity as "FloatArray.emptyWithCapacity" };

const FloatArray_size = (a) => a.size;
export { FloatArray_size as "FloatArray.size" };

const FloatArray_usize = (a) => a.size;
export { FloatArray_usize as "FloatArray.usize" };

const FloatArray_get = (a, i, _h) => a.floats[i];
export { FloatArray_get as "FloatArray.get" };

// Like `lean_float_array_get`, this returns 0 out of bounds without panicking.
const FloatArray_getBang = (a, i) => (index(i) < a.size ? a.floats[i] : 0);
export { FloatArray_getBang as "FloatArray.get!" };

const FloatArray_uget = (a, i, _h) => a.floats[i];
export { FloatArray_uget as "FloatArray.uget" };

const FloatArray_set = (a, i, v, _h) => uset(a, i, v);
export { FloatArray_set as "FloatArray.set" };

const FloatArray_setBang = (a, i, v) => (index(i) < a.size ? uset(a, i, v) : a);
export { FloatArray_setBang as "FloatArray.set!" };

const FloatArray_uset = (a, i, v, _h) => uset(a, i, v);
export { FloatArray_uset as "FloatArray.uset" };

const FloatArray_push = (a, v) => {
  const r = reserve(a, a.size + 1);
  r.floats[r.size++] = v;
  return r;
};
export { FloatArray_push as "FloatArray.push" };

// Float arrays are never marked linear, so there is no mark to set or propagate.
const FloatArray_markLinear = (a) => a;
export { FloatArray_markLinear as "FloatArray.markLinear" };

const FloatArray_propagateMark = (_a, b) => b;
export { FloatArray_propagateMark as "FloatArray.propagateMark" };
