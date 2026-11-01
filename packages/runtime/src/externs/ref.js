// `ST.Ref`, a mutable reference cell (see `Ref` in `core.js`).
//
// Each extern follows the ownership conventions of its C counterpart: the ref itself is borrowed,
// and a value stored in it is owned by the ref.

import { dec, inc, Ref } from "../core.js";

const ST_Prim_mkRef = (_σ, _α, a, _w) => new Ref(a);
export { ST_Prim_mkRef as "ST.Prim.mkRef" };

const ST_Prim_Ref_get = (_σ, _α, r, _w) => {
  inc(r.value);
  return r.value;
};
export { ST_Prim_Ref_get as "ST.Prim.Ref.get" };

const ST_Prim_Ref_put = (_σ, _α, r, a, _w) => {
  const old = r.value;
  r.value = a;
  dec(old);
  return 0;
};
export { ST_Prim_Ref_put as "ST.Prim.Ref.put" };

// Leaves `()` behind, so that the value taken out may be exclusive.
const ST_Prim_Ref_take = (_σ, _α, r, _w) => {
  const v = r.value;
  r.value = 0;
  return v;
};
export { ST_Prim_Ref_take as "ST.Prim.Ref.take" };

const ST_Prim_Ref_swap = (_σ, _α, r, a, _w) => {
  const old = r.value;
  r.value = a;
  return old;
};
export { ST_Prim_Ref_swap as "ST.Prim.Ref.swap" };

const ST_Prim_Ref_ptrEq = (_σ, _α, r1, r2, _w) => (r1 === r2 ? 1 : 0);
export { ST_Prim_Ref_ptrEq as "ST.Prim.Ref.ptrEq" };

const Void_mk = (_σ, a) => {
  dec(a);
  return 0;
};
export { Void_mk as "Void.mk" };
