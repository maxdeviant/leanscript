// The externs of `nat.js`.

import {
  intAdd,
  intEdiv,
  intEmod,
  intMul,
  intNeg,
  intSub,
  intTdiv,
  intTmod,
  natAdd,
  natDiv,
  natGcd,
  natLand,
  natLog2,
  natLor,
  natMod,
  natMul,
  natPow,
  natPowMod,
  natShiftLeft,
  natShiftRight,
  natSub,
  natXor,
} from "../nat.js";

export { natAdd as "Nat.add" };

export { natSub as "Nat.sub" };

export { natMul as "Nat.mul" };

export { natDiv as "Nat.div" };

export { natMod as "Nat.mod" };

export { natPow as "Nat.pow" };

export { natLog2 as "Nat.log2" };

export { natShiftLeft as "Nat.shiftLeft" };

export { natShiftRight as "Nat.shiftRight" };

export { natLor as "Nat.lor" };

export { natLand as "Nat.land" };

export { natXor as "Nat.xor" };

const Nat_decEq = (a, b) => (a === b ? 1 : 0);
export { Nat_decEq as "Nat.decEq" };

const Nat_decLt = (a, b) => (a < b ? 1 : 0);
export { Nat_decLt as "Nat.decLt" };

const Nat_decLe = (a, b) => (a <= b ? 1 : 0);
export { Nat_decLe as "Nat.decLe" };

const Nat_beq = (a, b) => (a === b ? 1 : 0);
export { Nat_beq as "Nat.beq" };

const Nat_ble = (a, b) => (a <= b ? 1 : 0);
export { Nat_ble as "Nat.ble" };

const Nat_pred = (a) => natSub(a, 1);
export { Nat_pred as "Nat.pred" };

const Nat_divExact = (a, b, _h) => natDiv(a, b);
export { Nat_divExact as "Nat.divExact" };

export { natGcd as "Nat.gcd" };

export { natPowMod as "Nat.powMod" };

const Int_ofNat = (n) => n;
export { Int_ofNat as "Int.ofNat" };

const Int_negSucc = (n) => intNeg(natAdd(n, 1));
export { Int_negSucc as "Int.negSucc" };

export { intNeg as "Int.neg" };

export { intAdd as "Int.add" };

export { intSub as "Int.sub" };

export { intMul as "Int.mul" };

export { intTdiv as "Int.tdiv" };

export { intTmod as "Int.tmod" };

export { intEdiv as "Int.ediv" };

export { intEmod as "Int.emod" };

const Int_divExact = (a, b, _h) => intTdiv(a, b);
export { Int_divExact as "Int.divExact" };

const Int_decNonneg = (a) => (a >= 0 ? 1 : 0);
export { Int_decNonneg as "Int.decNonneg" };

const Int_natAbs = (a) => (a < 0 ? intNeg(a) : a);
export { Int_natAbs as "Int.natAbs" };

const Int_decEq = (a, b) => (a === b ? 1 : 0);
export { Int_decEq as "Int.decEq" };

const Int_decLt = (a, b) => (a < b ? 1 : 0);
export { Int_decLt as "Int.decLt" };

const Int_decLe = (a, b) => (a <= b ? 1 : 0);
export { Int_decLe as "Int.decLe" };
