// `String`, represented as UTF-8 so that byte positions are exact.
//
// `String.Pos` and `String.Pos.Raw` are single-field structures over `Nat`, so a position is just
// its byte offset. A position may be a `BigInt` if it is huge, in which case it is past the end.
//
// Each extern follows the ownership conventions of its C counterpart: an exclusive string is
// updated in place, and a shared one is copied first.

import { arrayToList, Ctor1, dec, RC, track } from "./core.js";
import { natAdd, natSub } from "./nat.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A UTF-8 string, stored in the first `size` bytes of a buffer that may have spare capacity. */
export class LeanString {
  /**
   * @param {Uint8Array} bytes
   * @param {number} size The size in bytes.
   * @param {number} length The length in Unicode scalar values.
   */
  constructor(bytes, size, length) {
    this[RC] = 1;
    this.bytes = bytes;
    this.size = size;
    this.length = length;
    /** @type {string | undefined} The contents as a JS string, if known. */
    this.js = undefined;
    track(this);
  }

  toString() {
    return (this.js ??= decoder.decode(this.bytes.subarray(0, this.size)));
  }

  describe() {
    return `string ${JSON.stringify(this.toString())}`;
  }
}

function countScalars(s) {
  let length = 0;
  for (const _ of s) {
    length++;
  }
  return length;
}

/** The length up to which `mkString` tries to encode an ASCII string itself. */
const SHORT_STRING_LENGTH = 64;

/** Converts a JS string to a Lean `String`. */
export function mkString(s) {
  // `TextEncoder` costs a lot per call, which dominates for short strings, such as numbers.
  if (s.length <= SHORT_STRING_LENGTH) {
    const bytes = new Uint8Array(s.length);
    let i = 0;
    for (; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0x80) {
        break;
      }
      bytes[i] = c;
    }
    if (i === s.length) {
      const str = new LeanString(bytes, s.length, s.length);
      str.js = s;
      return str;
    }
  }
  const bytes = encoder.encode(s);
  const str = new LeanString(bytes, bytes.length, countScalars(s));
  str.js = s;
  return str;
}

/** Returns a string of the `size` bytes of `bytes` starting at `start`, containing `length` chars. */
function stringOfBytes(bytes, start, size, length) {
  return new LeanString(bytes.slice(start, start + size), size, length);
}

/**
 * Takes ownership of `s` and returns an exclusive string with its contents and room for `extra`
 * more bytes, copying it if it is shared.
 */
function reserve(s, extra) {
  const newSize = s.size + extra;
  if (s[RC] === 1) {
    if (s.bytes.length < newSize) {
      const bytes = new Uint8Array(Math.max(16, 2 * newSize));
      bytes.set(s.bytes.subarray(0, s.size));
      s.bytes = bytes;
    }
    s.js = undefined;
    return s;
  }
  const bytes = new Uint8Array(Math.max(16, 2 * newSize));
  bytes.set(s.bytes.subarray(0, s.size));
  const r = new LeanString(bytes, s.size, s.length);
  dec(s);
  return r;
}

/** Appends `length` chars, encoded as the first `size` bytes of `bytes`, to the owned `s`. */
function appendBytes(s, bytes, size, length) {
  const r = reserve(s, size);
  r.bytes.set(bytes.subarray(0, size), r.size);
  r.size += size;
  r.length += length;
  return r;
}

function utf8Size(c) {
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
}

/** Returns the size of the UTF-8 sequence that starts with the byte `b`. */
export function sequenceSize(b) {
  return b < 0x80 ? 1 : (b & 0xe0) === 0xc0 ? 2 : (b & 0xf0) === 0xe0 ? 3 : 4;
}

const charBytes = new Uint8Array(4);

function encodeChar(c) {
  if (c < 0x80) {
    charBytes[0] = c;
  } else if (c < 0x800) {
    charBytes[0] = 0xc0 | (c >> 6);
    charBytes[1] = 0x80 | (c & 0x3f);
  } else if (c < 0x10000) {
    charBytes[0] = 0xe0 | (c >> 12);
    charBytes[1] = 0x80 | ((c >> 6) & 0x3f);
    charBytes[2] = 0x80 | (c & 0x3f);
  } else {
    charBytes[0] = 0xf0 | (c >> 18);
    charBytes[1] = 0x80 | ((c >> 12) & 0x3f);
    charBytes[2] = 0x80 | ((c >> 6) & 0x3f);
    charBytes[3] = 0x80 | (c & 0x3f);
  }
  return charBytes;
}

/** Decodes the UTF-8 sequence starting at byte `i`, which must be the start of a sequence. */
export function decodeCharAt(bytes, i) {
  const c = bytes[i];
  if (c < 0x80) {
    return c;
  }
  if ((c & 0xe0) === 0xc0) {
    return ((c & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
  }
  if ((c & 0xf0) === 0xe0) {
    return ((c & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
  }
  return (
    ((c & 0x07) << 18) |
    ((bytes[i + 1] & 0x3f) << 12) |
    ((bytes[i + 2] & 0x3f) << 6) |
    (bytes[i + 3] & 0x3f)
  );
}

function isCharBoundary(s, i) {
  return i < s.size && (s.bytes[i] & 0xc0) !== 0x80;
}

/** `Char.default`, which `String.Pos.Raw.get` returns for an invalid position. */
const DEFAULT_CHAR = 65;

export function stringAppend(s, t) {
  if (t.size === 0) {
    return s;
  }
  return appendBytes(s, t.bytes, t.size, t.length);
}

export function stringPush(s, c) {
  return appendBytes(s, encodeChar(c), utf8Size(c), 1);
}

export function stringGet(s, i) {
  return isCharBoundary(s, i) ? decodeCharAt(s.bytes, i) : DEFAULT_CHAR;
}

export function stringSet(s, i, c) {
  if (!isCharBoundary(s, i)) {
    return s;
  }
  const oldSize = sequenceSize(s.bytes[i]);
  if (s[RC] === 1 && oldSize === utf8Size(c)) {
    s.bytes.set(encodeChar(c).subarray(0, oldSize), i);
    s.js = undefined;
    return s;
  }
  const end = i + oldSize;
  let r = stringOfBytes(s.bytes, 0, i, 0);
  r = stringPush(r, c);
  r = appendBytes(r, s.bytes.subarray(end, s.size), s.size - end, 0);
  r.length = s.length;
  dec(s);
  return r;
}

/** `String.Pos.Raw.next`, which steps one byte past an invalid position. */
export function stringNext(s, i) {
  return isCharBoundary(s, i) ? i + sequenceSize(s.bytes[i]) : natAdd(i, 1);
}

function countChars(bytes, start, end) {
  let length = 0;
  for (let i = start; i < end; i++) {
    if ((bytes[i] & 0xc0) !== 0x80) {
      length++;
    }
  }
  return length;
}

/** Returns the string between two positions known to be valid, with `b ≤ e`. */
export function extractValid(s, b, e) {
  return stringOfBytes(s.bytes, b, e - b, countChars(s.bytes, b, e));
}

/**
 * `String.Pos.Raw.extract`. Matching `lean_string_utf8_extract`, the result is empty if `b` is not
 * a valid position, and runs to the end of the string if `e` is not.
 */
export function stringExtract(s, b, e) {
  if (b >= e || b >= s.size || !isCharBoundary(s, b)) {
    return mkString("");
  }
  if (e > s.size || (e < s.size && !isCharBoundary(s, e))) {
    e = s.size;
  }
  return extractValid(s, b, e);
}

export function stringEq(s, t) {
  if (s.size !== t.size) {
    return false;
  }
  const a = s.bytes;
  const b = t.bytes;
  for (let i = 0; i < s.size; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** Lexicographic order on bytes, which coincides with lexicographic order on scalar values. */
export function stringLt(s, t) {
  const a = s.bytes;
  const b = t.bytes;
  const n = Math.min(s.size, t.size);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return s.size < t.size;
}

/** `String.Pos.Raw.prev`: the start of the char before position `i`, or 0 if there is none. */
export function stringPrev(s, i) {
  if (i === 0) {
    return 0;
  }
  if (typeof i === "bigint" || i > s.size) {
    return natSub(i, 1);
  }
  let j = i - 1;
  while (j > 0 && (s.bytes[j] & 0xc0) === 0x80) {
    j--;
  }
  return j;
}

export function stringIsValidPos(s, i) {
  return i < s.size ? isCharBoundary(s, i) : i === s.size;
}

/** Returns `Option Char`: the char at `i` if it is a valid position before the end. */
export function stringGetOpt(s, i) {
  return isCharBoundary(s, i) ? new Ctor1(1, decodeCharAt(s.bytes, i)) : 0;
}

/** Compares the byte ranges `a[aStart, aEnd)` and `b[bStart, bEnd)` lexicographically. */
export function compareBytes(a, aStart, aEnd, b, bStart, bEnd) {
  const n = Math.min(aEnd - aStart, bEnd - bStart);
  for (let i = 0; i < n; i++) {
    if (a[aStart + i] !== b[bStart + i]) {
      return a[aStart + i] < b[bStart + i] ? -1 : 1;
    }
  }
  return Math.sign(aEnd - aStart - (bEnd - bStart));
}

/** Decodes the valid UTF-8 in `bytes[0, size)`. */
export function stringOfUtf8(bytes, size) {
  return new LeanString(bytes.slice(0, size), size, countChars(bytes, 0, size));
}

function toChars(s) {
  const chars = [];
  for (let i = 0; i < s.size; i += sequenceSize(s.bytes[i])) {
    chars.push(decodeCharAt(s.bytes, i));
  }
  return chars;
}

export const bool = (b) => (b ? 1 : 0);

export function ofList(list) {
  let s = mkString("");
  for (let l = list; l !== 0; l = l.f1) {
    s = stringPush(s, l.f0);
  }
  dec(list);
  return s;
}

export function toList(s) {
  const list = arrayToList(toChars(s));
  dec(s);
  return list;
}
