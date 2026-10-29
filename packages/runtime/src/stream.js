// `IO.FS.Stream`s, and the standard streams.

import { dec, inc, markPersistent, mkCtor, pap } from "./core.js";
import { attempt } from "./io.js";
import { mkString } from "./string.js";

const decoder = new TextDecoder();

/** Decodes the UTF-8 in `bytes`, replacing invalid sequences with U+FFFD. */
export const decodeLossy = (bytes) => mkString(decoder.decode(bytes));

/**
 * Returns a persistent `IO.FS.Stream` backed by `h`, like `IO.FS.Stream.ofHandle`.
 *
 * `h` must have the methods `flush()`, `read(n)`, which returns a `LeanByteArray`, `write(bytes)`,
 * `getLine()`, which returns the bytes of the line, and `isTty()`. Each field of the stream is a
 * closure, which takes ownership of its arguments.
 */
export function mkStream(h) {
  const stream = mkCtor(
    0,
    [
      // flush : IO Unit
      pap((_w) => attempt(undefined, () => h.flush()), 1, []),
      // read : USize → IO ByteArray
      pap((n, _w) => attempt(undefined, () => h.read(n)), 2, []),
      // write : ByteArray → IO Unit
      pap(
        (b, _w) => {
          const r = attempt(undefined, () => h.write(b.bytes.subarray(0, b.size)));
          dec(b);
          return r;
        },
        2,
        [],
      ),
      // getLine : IO String
      pap((_w) => attempt(undefined, () => decodeLossy(h.getLine())), 1, []),
      // putStr : String → IO Unit
      pap(
        (s, _w) => {
          const r = attempt(undefined, () => h.write(s.bytes.subarray(0, s.size)));
          dec(s);
          return r;
        },
        2,
        [],
      ),
      // isTty : BaseIO Bool. `BaseIO` results are not wrapped in `EST.Out`.
      pap((_w) => (h.isTty() ? 1 : 0), 1, []),
    ],
    null,
  );
  return markPersistent(stream);
}

/**
 * Returns the externs `IO.get<name>` and `IO.set<name>`, which get and set a standard stream that
 * is initially `stream`.
 */
export function stdStreamExterns(name, stream) {
  return {
    // These are `BaseIO` actions, so their results are not wrapped in `EST.Out`.
    [`IO.get${name}`]: (_w) => {
      inc(stream);
      return stream;
    },
    // The old stream's reference moves from the global to the caller.
    [`IO.set${name}`]: (s, _w) => {
      const old = stream;
      stream = s;
      return old;
    },
  };
}
