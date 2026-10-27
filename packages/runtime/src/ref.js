// `ST.Ref`, a mutable reference cell (see `Ref` in `core.js`).
//
// Each extern follows the ownership conventions of its C counterpart: the ref itself is borrowed,
// and a value stored in it is owned by the ref.

import { dec, inc, Ref } from "./core.js";

export const externs = {
  "ST.Prim.mkRef": (_σ, _α, a, _w) => new Ref(a),
  "ST.Prim.Ref.get": (_σ, _α, r, _w) => {
    inc(r.value);
    return r.value;
  },
  "ST.Prim.Ref.put": (_σ, _α, r, a, _w) => {
    const old = r.value;
    r.value = a;
    dec(old);
    return 0;
  },
  // Leaves `()` behind, so that the value taken out may be exclusive.
  "ST.Prim.Ref.take": (_σ, _α, r, _w) => {
    const v = r.value;
    r.value = 0;
    return v;
  },
  "ST.Prim.Ref.swap": (_σ, _α, r, a, _w) => {
    const old = r.value;
    r.value = a;
    return old;
  },
  "ST.Prim.Ref.ptrEq": (_σ, _α, r1, r2, _w) => (r1 === r2 ? 1 : 0),
  "Void.mk": (_σ, a) => {
    dec(a);
    return 0;
  },
};
