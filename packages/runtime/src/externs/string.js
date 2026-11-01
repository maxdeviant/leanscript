// The externs of `string.js`.

import { dec } from "../core.js";
import { mkByteArray } from "../bytearray.js";
import { hashBytes } from "../hash.js";
import {
  bool,
  compareBytes,
  decodeCharAt,
  extractValid,
  mkString,
  ofList,
  sequenceSize,
  stringAppend,
  stringEq,
  stringExtract,
  stringGet,
  stringGetOpt,
  stringIsValidPos,
  stringLt,
  stringNext,
  stringOfUtf8,
  stringPrev,
  stringPush,
  stringSet,
  toList,
} from "../string.js";

// The proof argument guarantees that `n` is a valid scalar value.
const Char_ofNatAux = (n, _h) => n;
export { Char_ofNatAux as "Char.ofNatAux" };

export { ofList as "String.mk" };

export { ofList as "String.ofList" };

export { toList as "String.data" };

export { toList as "String.toList" };

const String_ofByteArray = (a, _h) => {
  const r = stringOfUtf8(a.bytes, a.size);
  dec(a);
  return r;
};
export { String_ofByteArray as "String.ofByteArray" };

const String_toByteArray = (s) => {
  const r = mkByteArray(s.bytes, s.size);
  dec(s);
  return r;
};
export { String_toByteArray as "String.toByteArray" };

const String_toUTF8 = (s) => mkByteArray(s.bytes, s.size);
export { String_toUTF8 as "String.toUTF8" };

const String_markLinear = (s) => s;
export { String_markLinear as "String.markLinear" };

const String_propagateMark = (_s, t) => t;
export { String_propagateMark as "String.propagateMark" };

// `Ordering` is `lt`, `eq`, or `gt`, with tags 0, 1, and 2.
const String_compare = (s, t) => compareBytes(s.bytes, 0, s.size, t.bytes, 0, t.size) + 1;
export { String_compare as "String.compare" };

const String_getUtf8Byte = (s, i, _h) => {
  const b = s.bytes[i];
  dec(s);
  return b;
};
export { String_getUtf8Byte as "String.getUtf8Byte" };

export { stringGet as "String.get" };

export { stringGet as "String.get!" };

const String_getPrime = (s, i, _h) => decodeCharAt(s.bytes, i);
export { String_getPrime as "String.get'" };

export { stringGetOpt as "String.get?" };

export { stringSet as "String.set" };

export { stringNext as "String.next" };

const String_nextPrime = (s, i, _h) => i + sequenceSize(s.bytes[i]);
export { String_nextPrime as "String.next'" };

export { stringPrev as "String.prev" };

const String_atEnd = (s, i) => bool(i >= s.size);
export { String_atEnd as "String.atEnd" };

const String_Slice_hash = (slice) => {
  const { f0: s, f1: start, f2: end } = slice;
  return hashBytes(s.bytes.subarray(start, end), end - start, 11n);
};
export { String_Slice_hash as "String.Slice.hash" };

const String_Slice_instDecidableLt = (x, y) => {
  const { f0: s, f1: sStart, f2: sEnd } = x;
  const { f0: t, f1: tStart, f2: tEnd } = y;
  return bool(compareBytes(s.bytes, sStart, sEnd, t.bytes, tStart, tEnd) < 0);
};
export { String_Slice_instDecidableLt as "String.Slice.instDecidableLt" };

const String_hash = (s) => hashBytes(s.bytes, s.size, 11n);
export { String_hash as "String.hash" };

const String_length = (s) => s.length;
export { String_length as "String.length" };

const String_utf8ByteSize = (s) => s.size;
export { String_utf8ByteSize as "String.utf8ByteSize" };

export { stringAppend as "String.append" };

export { stringPush as "String.push" };

const String_decEq = (s, t) => bool(stringEq(s, t));
export { String_decEq as "String.decEq" };

const String_decidableLT = (s, t) => bool(stringLt(s, t));
export { String_decidableLT as "String.decidableLT" };

const String_getUTF8Byte = (s, i, _h) => s.bytes[i];
export { String_getUTF8Byte as "String.getUTF8Byte" };

const String_decodeChar = (s, i, _h) => decodeCharAt(s.bytes, i);
export { String_decodeChar as "String.decodeChar" };

const String_extract = (s, b, e) => (b < e ? extractValid(s, b, e) : mkString(""));
export { String_extract as "String.extract" };

const String_Pos_next = (s, i, _h) => i + sequenceSize(s.bytes[i]);
export { String_Pos_next as "String.Pos.next" };

const String_Pos_set = (s, i, c, _h) => stringSet(s, i, c);
export { String_Pos_set as "String.Pos.set" };

export { stringGet as "String.Pos.Raw.get" };

export { stringGet as "String.Pos.Raw.get!" };

const String_Pos_Raw_getPrime = (s, i, _h) => decodeCharAt(s.bytes, i);
export { String_Pos_Raw_getPrime as "String.Pos.Raw.get'" };

export { stringGetOpt as "String.Pos.Raw.get?" };

const String_Pos_Raw_isValid = (s, i) => bool(stringIsValidPos(s, i));
export { String_Pos_Raw_isValid as "String.Pos.Raw.isValid" };

const String_Pos_Raw_nextPrime = (s, i, _h) => i + sequenceSize(s.bytes[i]);
export { String_Pos_Raw_nextPrime as "String.Pos.Raw.next'" };

export { stringPrev as "String.Pos.Raw.prev" };

export { stringSet as "String.Pos.Raw.set" };

export { stringNext as "String.Pos.Raw.next" };

const String_Pos_Raw_atEnd = (s, i) => bool(i >= s.size);
export { String_Pos_Raw_atEnd as "String.Pos.Raw.atEnd" };

export { stringExtract as "String.Pos.Raw.extract" };

// Whether `len` bytes of `l` and `r`, starting at `ls` and `rs`, are equal. The proofs guarantee
// that both ranges are in bounds.
const String_Slice_Pattern_Internal_memcmpStr = (l, r, ls, rs, len, _h1, _h2) =>
  bool(compareBytes(l.bytes, ls, ls + len, r.bytes, rs, rs + len) === 0);
export { String_Slice_Pattern_Internal_memcmpStr as "String.Slice.Pattern.Internal.memcmpStr" };

export { stringAppend as "String.Internal.append" };

const String_Internal_length = (s) => s.length;
export { String_Internal_length as "String.Internal.length" };

export { stringNext as "String.Internal.next" };

export { stringExtract as "String.Internal.extract" };

const String_Internal_atEnd = (s, i) => bool(i >= s.size);
export { String_Internal_atEnd as "String.Internal.atEnd" };

export { stringGet as "String.Internal.get" };

const String_Internal_getUTF8Byte = (s, i, _h) => s.bytes[i];
export { String_Internal_getUTF8Byte as "String.Internal.getUTF8Byte" };

const String_Internal_ugetUTF8Byte = (s, i, _h) => s.bytes[i];
export { String_Internal_ugetUTF8Byte as "String.Internal.ugetUTF8Byte" };
