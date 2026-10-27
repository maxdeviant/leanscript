// `String`, represented as UTF-8 so that byte positions are exact.
//
// `String.Pos` and `String.Pos.Raw` are single-field structures over `Nat`, so a position is just
// its byte offset. A position may be a `BigInt` if it is huge, in which case it is past the end.
//
// Each extern follows the ownership conventions of its C counterpart: an exclusive string is
// updated in place, and a shared one is copied first.

import { apply, arrayToList, dec, inc, track } from "./core.js";
import { natAdd } from "./nat.js";

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
    this.rc = 1;
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
}

function countScalars(s) {
  let length = 0;
  for (const _ of s) {
    length++;
  }
  return length;
}

/** Converts a JS string to a Lean `String`. */
export function mkString(s) {
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
  if (s.rc === 1) {
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
function sequenceSize(b) {
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
function decodeCharAt(bytes, i) {
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

function stringGet(s, i) {
  return isCharBoundary(s, i) ? decodeCharAt(s.bytes, i) : DEFAULT_CHAR;
}

function stringSet(s, i, c) {
  if (!isCharBoundary(s, i)) {
    return s;
  }
  const oldSize = sequenceSize(s.bytes[i]);
  if (s.rc === 1 && oldSize === utf8Size(c)) {
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
function stringNext(s, i) {
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
function extractValid(s, b, e) {
  return stringOfBytes(s.bytes, b, e - b, countChars(s.bytes, b, e));
}

/**
 * `String.Pos.Raw.extract`. Matching `lean_string_utf8_extract`, the result is empty if `b` is not
 * a valid position, and runs to the end of the string if `e` is not.
 */
function stringExtract(s, b, e) {
  if (b >= e || b >= s.size || !isCharBoundary(s, b)) {
    return mkString("");
  }
  if (e > s.size || (e < s.size && !isCharBoundary(s, e))) {
    e = s.size;
  }
  return extractValid(s, b, e);
}

function stringEq(s, t) {
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
function stringLt(s, t) {
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

function isPrefixOf(p, s) {
  if (p.size > s.size) {
    return false;
  }
  for (let i = 0; i < p.size; i++) {
    if (p.bytes[i] !== s.bytes[i]) {
      return false;
    }
  }
  return true;
}

function toChars(s) {
  const chars = [];
  for (let i = 0; i < s.size; i += sequenceSize(s.bytes[i])) {
    chars.push(decodeCharAt(s.bytes, i));
  }
  return chars;
}

const bool = (b) => (b ? 1 : 0);

export const externs = {
  "String.ofList": (list) => {
    let s = mkString("");
    for (let l = list; l !== 0; l = l.f[1]) {
      s = stringPush(s, l.f[0]);
    }
    dec(list);
    return s;
  },
  "String.toList": (s) => {
    const list = arrayToList(toChars(s));
    dec(s);
    return list;
  },
  "String.length": (s) => s.length,
  "String.utf8ByteSize": (s) => s.size,
  "String.append": stringAppend,
  "String.push": stringPush,
  "String.decEq": (s, t) => bool(stringEq(s, t)),
  "String.decidableLT": (s, t) => bool(stringLt(s, t)),
  "String.getUTF8Byte": (s, i, _h) => s.bytes[i],
  "String.decodeChar": (s, i, _h) => decodeCharAt(s.bytes, i),
  "String.extract": (s, b, e) => (b < e ? extractValid(s, b, e) : mkString("")),

  "String.Pos.next": (s, i, _h) => i + sequenceSize(s.bytes[i]),
  "String.Pos.set": (s, i, c, _h) => stringSet(s, i, c),
  "String.Pos.Raw.get": stringGet,
  "String.Pos.Raw.set": stringSet,
  "String.Pos.Raw.next": stringNext,
  "String.Pos.Raw.atEnd": (s, i) => bool(i >= s.size),
  "String.Pos.Raw.extract": stringExtract,

  "String.Internal.append": stringAppend,
  "String.Internal.length": (s) => s.length,
  "String.Internal.next": stringNext,
  "String.Internal.extract": stringExtract,
  "String.Internal.isPrefixOf": (p, s) => {
    const r = bool(isPrefixOf(p, s));
    dec(p);
    dec(s);
    return r;
  },
  "String.Internal.any": (s, p) => {
    let r = 0;
    for (let i = 0; i < s.size; i += sequenceSize(s.bytes[i])) {
      // `apply` consumes the closure, but we need it for the next char.
      inc(p);
      if (apply(p, [decodeCharAt(s.bytes, i)]) === 1) {
        r = 1;
        break;
      }
    }
    dec(p);
    dec(s);
    return r;
  },
  "String.Internal.posOf": (s, c) => {
    let pos = s.size;
    for (let i = 0; i < s.size; i += sequenceSize(s.bytes[i])) {
      if (decodeCharAt(s.bytes, i) === c) {
        pos = i;
        break;
      }
    }
    dec(s);
    return pos;
  },
  "String.Internal.offsetOfPos": (s, pos) => {
    let offset = 0;
    for (let i = 0; i < pos && i < s.size; i += sequenceSize(s.bytes[i])) {
      offset++;
    }
    dec(s);
    return offset;
  },
  "String.Internal.pushn": (s, c, n) => {
    for (let i = 0; i < n; i++) {
      s = stringPush(s, c);
    }
    return s;
  },
};
