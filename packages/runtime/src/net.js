// IP addresses, `Std.Net.IPv4Addr` and `Std.Net.IPv6Addr`, which are arrays of their octets and
// 16-bit segments.
//
// Addresses are parsed and printed exactly as libuv's `uv_inet_pton` and `uv_inet_ntop` do, as the C
// runtime uses them.

import { mkCtor } from "./core.js";
import { mkArray } from "./array.js";
import { mkString } from "./string.js";

/** Returns the value of the decimal digit `ch`, or -1 if it is not one. */
const decimalDigit = (ch) => "0123456789".indexOf(ch);

/** Returns the value of the hexadecimal digit `ch`, in either case, or -1 if it is not one. */
function hexDigit(ch) {
  const i = "0123456789abcdefABCDEF".indexOf(ch);
  return i < 16 ? i : i - 6;
}

/** Returns the octets of the IPv4 address `s` in dotted decimal, or `null` if it is not one. */
export function parseIPv4(s) {
  const octets = [0];
  let sawDigit = false;
  for (const ch of s) {
    const digit = decimalDigit(ch);
    if (digit !== -1) {
      const last = octets.length - 1;
      // Each octet is at most 255, with no leading zeros.
      if (sawDigit && octets[last] === 0) {
        return null;
      }
      const n = octets[last] * 10 + digit;
      if (n > 255) {
        return null;
      }
      octets[last] = n;
      sawDigit = true;
    } else if (ch === "." && sawDigit) {
      if (octets.length === 4) {
        return null;
      }
      octets.push(0);
      sawDigit = false;
    } else {
      return null;
    }
  }
  return octets.length === 4 && sawDigit ? octets : null;
}

/**
 * Returns the segments of the IPv6 address `s`, or `null` if it is not one. A zone after a `%` is
 * ignored. The last 32 bits may be written as an IPv4 address.
 */
export function parseIPv6(s) {
  const zone = s.indexOf("%");
  if (zone !== -1) {
    s = s.slice(0, zone);
  }
  const bytes = new Uint8Array(16);
  let tp = 0;
  // Where `::` stands for a run of zeros, as an offset into `bytes`, or -1.
  let colonp = -1;
  let i = 0;
  if (s[0] === ":") {
    if (s[1] !== ":") {
      return null;
    }
    i = 1;
  }
  let curtok = i;
  let seenDigits = 0;
  let val = 0;
  while (i < s.length) {
    const ch = s[i++];
    const digit = hexDigit(ch);
    if (digit !== -1) {
      val = (val << 4) | digit;
      if (++seenDigits > 4) {
        return null;
      }
      continue;
    }
    if (ch === ":") {
      curtok = i;
      if (seenDigits === 0) {
        if (colonp !== -1) {
          return null;
        }
        colonp = tp;
        continue;
      }
      if (i === s.length || tp + 2 > 16) {
        return null;
      }
      bytes[tp++] = val >> 8;
      bytes[tp++] = val & 0xff;
      seenDigits = 0;
      val = 0;
      continue;
    }
    if (ch === "." && tp + 4 <= 16) {
      const octets = parseIPv4(s.slice(curtok));
      if (octets !== null) {
        bytes.set(octets, tp);
        tp += 4;
        seenDigits = 0;
        break;
      }
    }
    return null;
  }
  if (seenDigits > 0) {
    if (tp + 2 > 16) {
      return null;
    }
    bytes[tp++] = val >> 8;
    bytes[tp++] = val & 0xff;
  }
  if (colonp !== -1) {
    if (tp === 16) {
      return null;
    }
    // Moves the segments after `::` to the end, leaving zeros in their place.
    const n = tp - colonp;
    for (let k = 1; k <= n; k++) {
      bytes[16 - k] = bytes[colonp + n - k];
      bytes[colonp + n - k] = 0;
    }
    tp = 16;
  }
  if (tp !== 16) {
    return null;
  }
  return Array.from({ length: 8 }, (_, k) => (bytes[2 * k] << 8) | bytes[2 * k + 1]);
}

const formatIPv4 = (octets) => octets.join(".");

/**
 * Formats the IPv6 address with the 16-bit `segments`, writing the longest run of two or more zero
 * segments, the first of the longest, as `::`. An IPv4-compatible or IPv4-mapped address ends in
 * its IPv4 address.
 */
export function formatIPv6(segments) {
  let best = { base: -1, len: 0 };
  let cur = { base: -1, len: 0 };
  for (let i = 0; i <= 8; i++) {
    if (i < 8 && segments[i] === 0) {
      if (cur.base === -1) {
        cur = { base: i, len: 1 };
      } else {
        cur.len++;
      }
    } else if (cur.base !== -1) {
      if (best.base === -1 || cur.len > best.len) {
        best = cur;
      }
      cur = { base: -1, len: 0 };
    }
  }
  if (best.len < 2) {
    best = { base: -1, len: 0 };
  }
  let s = "";
  for (let i = 0; i < 8; i++) {
    if (best.base !== -1 && i >= best.base && i < best.base + best.len) {
      if (i === best.base) {
        s += ":";
      }
      continue;
    }
    if (i !== 0) {
      s += ":";
    }
    if (
      i === 6 &&
      best.base === 0 &&
      (best.len === 6 ||
        (best.len === 7 && segments[7] !== 1) ||
        (best.len === 5 && segments[5] === 0xffff))
    ) {
      s += formatIPv4([segments[6] >> 8, segments[6] & 0xff, segments[7] >> 8, segments[7] & 0xff]);
      break;
    }
    s += segments[i].toString(16);
  }
  if (best.base !== -1 && best.base + best.len === 8) {
    s += ":";
  }
  return s;
}

const option = (x) => (x === null ? 0 : mkCtor(1, [mkArray(x)], null));

export const externs = {
  "Std.Net.IPv4Addr.ofString": (s) => option(parseIPv4(s.toString())),
  "Std.Net.IPv4Addr.toString": (addr) => mkString(formatIPv4(addr)),
  "Std.Net.IPv6Addr.ofString": (s) => option(parseIPv6(s.toString())),
  "Std.Net.IPv6Addr.toString": (addr) => mkString(formatIPv6(addr)),
};
