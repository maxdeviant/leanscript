// `IO` actions and streams.

import { Ctor, dec, inc, markPersistent, pap } from "./core.js";
import { isStdoutTty, writeBytes } from "./platform.js";

/** Returns a successful `EST.Out`. Its `Void σ` field is erased, so it has a single field. */
export function ioOk(a) {
  return new Ctor(0, [a], null);
}

/** Returns a failed `EST.Out`. */
export function ioError(e) {
  return new Ctor(1, [e], null);
}

function unsupported(name) {
  return () => {
    throw new Error(`LeanScript: IO.FS.Stream.${name} is not supported on this stream`);
  };
}

/**
 * Constructs an `IO.FS.Stream` that writes to the file descriptor `fd`.
 *
 * Each field is a closure, which takes ownership of its arguments.
 */
function mkOutputStream(fd) {
  const stream = new Ctor(
    0,
    [
      // flush : IO Unit
      pap((_w) => ioOk(0), 1, []),
      // read : USize → IO ByteArray
      pap(unsupported("read"), 2, []),
      // write : ByteArray → IO Unit
      pap(
        (b, _w) => {
          writeBytes(fd, b);
          dec(b);
          return ioOk(0);
        },
        2,
        [],
      ),
      // getLine : IO String
      pap(unsupported("getLine"), 1, []),
      // putStr : String → IO Unit
      pap(
        (s, _w) => {
          writeBytes(fd, s.bytes.subarray(0, s.size));
          dec(s);
          return ioOk(0);
        },
        2,
        [],
      ),
      // isTty : BaseIO Bool. `BaseIO` results are not wrapped in `EST.Out`.
      pap((_w) => (fd === 1 && isStdoutTty() ? 1 : 0), 1, []),
    ],
    null,
  );
  return markPersistent(stream);
}

let stdout = mkOutputStream(1);
let stderr = mkOutputStream(2);

// These are `BaseIO` actions, so their results are not wrapped in `EST.Out`.
export const externs = {
  "IO.getStdout": (_w) => {
    inc(stdout);
    return stdout;
  },
  "IO.getStderr": (_w) => {
    inc(stderr);
    return stderr;
  },
  // The old stream's reference moves from the global to the caller.
  "IO.setStdout": (s, _w) => {
    const old = stdout;
    stdout = s;
    return old;
  },
  "IO.setStderr": (s, _w) => {
    const old = stderr;
    stderr = s;
    return old;
  },
};
