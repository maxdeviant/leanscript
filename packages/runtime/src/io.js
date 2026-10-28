// `IO` results and errors, and `IO` actions that don't involve files.

import { Ctor, inc, isInitializing } from "./core.js";
import { LeanByteArray } from "./bytearray.js";
import { normalize } from "./nat.js";
import { getEnv, monotonicNanos, systemError } from "#platform/host.js";
import { mkString } from "./string.js";

/** Returns a successful `EST.Out`. Its `Void σ` field is erased, so it has a single field. */
export function ioOk(a) {
  return new Ctor(0, [a], null);
}

/** Returns a failed `EST.Out`. */
export function ioError(e) {
  return new Ctor(1, [e], null);
}

/** Returns an `IO.userError` with the JS string `msg`. */
export function userError(msg) {
  // `userError` is the last constructor of `IO.Error`, after `unexpectedEof`.
  return new Ctor(18, [mkString(msg)], null);
}

/**
 * The `IO.Error` constructor that `lean_decode_io_error` uses for each error name, other than
 * `otherError`.
 */
const errorKinds = {
  alreadyExists: ["EEXIST", "EINPROGRESS", "EISCONN"],
  resourceBusy: ["EADDRINUSE", "EBUSY", "EDEADLK", "ETXTBSY"],
  resourceVanished: ["ECONNRESET", "EIDRM", "ENETDOWN", "ENETRESET", "ENOLINK", "EPIPE"],
  unsupportedOperation: [
    "EADDRNOTAVAIL",
    "EAFNOSUPPORT",
    "ENODEV",
    "ENOPROTOOPT",
    "ENOSYS",
    "ENOTSUP",
    "EOPNOTSUPP",
    "ERANGE",
    "ESPIPE",
    "EXDEV",
  ],
  hardwareFault: ["EIO"],
  unsatisfiedConstraints: ["ENOTEMPTY"],
  illegalOperation: ["ENOTTY"],
  protocolError: ["EBADMSG", "EPROTO", "EPROTONOSUPPORT", "EPROTOTYPE"],
  timeExpired: ["ETIME", "ETIMEDOUT"],
  interrupted: ["EINTR"],
  noFileOrDirectory: ["ENOENT"],
  invalidArgument: [
    "EBADF",
    "EDESTADDRREQ",
    "EDOM",
    "EILSEQ",
    "EINVAL",
    "ELOOP",
    "ENAMETOOLONG",
    "ENOEXEC",
    "ENOSTR",
    "ENOTCONN",
    "ENOTSOCK",
  ],
  permissionDenied: ["EACCES", "ECONNABORTED", "EFBIG", "EPERM", "EROFS"],
  resourceExhausted: [
    "E2BIG",
    "EAGAIN",
    "EMFILE",
    "EMLINK",
    "EMSGSIZE",
    "ENFILE",
    "ENOBUFS",
    "ENOLCK",
    "ENOMEM",
    "ENOSPC",
    "ENOSR",
    "EWOULDBLOCK",
  ],
  inappropriateType: ["EISDIR", "ENOTDIR"],
  noSuchThing: [
    "ECHILD",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENODATA",
    "ENOMSG",
    "ENXIO",
    "ESRCH",
  ],
};

const errorKindOf = new Map(
  Object.entries(errorKinds).flatMap(([kind, names]) => names.map((name) => [name, kind])),
);

/**
 * Error messages for the errors whose message in the C runtime differs from the one the host
 * reports, because the C runtime translates them to a related error first.
 */
const errorMessages = {
  EBADMSG: "protocol error",
  ECHILD: "no such process",
  EDEADLK: "resource busy or locked",
  EDOM: "invalid argument",
  EIDRM: "broken pipe",
  EINPROGRESS: "socket is already connected",
  ENETRESET: "connection reset by peer",
  ENOEXEC: "Unknown system error -8",
  ENOLCK: "resource temporarily unavailable",
  ENOLINK: "connection reset by peer",
  ENOMSG: "no data available",
  ENOSR: "no buffer space available",
  ENOSTR: "invalid argument",
  ETIME: "connection timed out",
};

/** The constructor index of each `IO.Error` constructor. */
const errorTags = {
  alreadyExists: 0,
  otherError: 1,
  resourceBusy: 2,
  resourceVanished: 3,
  unsupportedOperation: 4,
  hardwareFault: 5,
  unsatisfiedConstraints: 6,
  illegalOperation: 7,
  protocolError: 8,
  timeExpired: 9,
  interrupted: 10,
  noFileOrDirectory: 11,
  invalidArgument: 12,
  permissionDenied: 13,
  resourceExhausted: 14,
  inappropriateType: 15,
  noSuchThing: 16,
};

/**
 * Converts the host error `err` to an `IO.Error`, like `lean_decode_io_error`, rethrowing it if it
 * is not a system error. `fname` is the borrowed name of the file involved, or `undefined`.
 */
export function decodeIoError(err, fname) {
  const sys = systemError(err);
  if (sys === undefined) {
    throw err;
  }
  return mkIoError(sys, fname);
}

/**
 * Returns the `IO.Error` for the system error `sys`, which has the `name`, `errno`, and `message`
 * that `systemError` returns. `fname` is the borrowed name of the file involved, or `undefined`.
 */
export function mkIoError(sys, fname) {
  const kind = errorKindOf.get(sys.name) ?? "otherError";
  const tag = errorTags[kind];
  const details = mkString(errorMessages[sys.name] ?? sys.message);
  switch (kind) {
    case "interrupted":
    case "noFileOrDirectory":
      return new Ctor(tag, [fname === undefined ? mkString("") : fname, details], {
        16: sys.errno,
      });
    case "alreadyExists":
    case "invalidArgument":
    case "permissionDenied":
    case "resourceExhausted":
    case "inappropriateType":
    case "noSuchThing":
      return new Ctor(tag, [fname === undefined ? 0 : new Ctor(1, [fname], null), details], {
        16: sys.errno,
      });
    default:
      return new Ctor(tag, [details], { 8: sys.errno });
  }
}

/**
 * Calls `f` and returns its result as an `EST.Out`, converting a host error to an `IO.Error`.
 * `fname` is the borrowed name of the file involved, if any. A result of `undefined` is returned as
 * `Unit`.
 */
export function attempt(fname, f) {
  let result;
  try {
    result = f();
  } catch (err) {
    const error = decodeIoError(err, fname);
    inc(fname);
    return ioError(error);
  }
  return ioOk(result ?? 0);
}

/** The largest number of bytes `crypto.getRandomValues` fills in one call. */
const MAX_RANDOM_BYTES = 65536;

/** Returns a `ByteArray` of `n` cryptographically secure random bytes. */
export function randomByteArray(n) {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i += MAX_RANDOM_BYTES) {
    crypto.getRandomValues(bytes.subarray(i, i + MAX_RANDOM_BYTES));
  }
  return new LeanByteArray(bytes, n);
}

/** The heartbeat counter of `IO.getNumHeartbeats`, which nothing increments. */
let heartbeats = 0;

// `BaseIO` results are not wrapped in `EST.Out`.
export const externs = {
  "IO.initializing": (_w) => (isInitializing() ? 1 : 0),
  "IO.getEnv": (name, _w) => {
    const value = getEnv(name.toString());
    return value === undefined ? 0 : new Ctor(1, [mkString(value)], null);
  },
  "IO.monoMsNow": (_w) => normalize(monotonicNanos() / 1000000n),
  "IO.monoNanosNow": (_w) => normalize(monotonicNanos()),
  "IO.getRandomBytes": (n, _w) => ioOk(randomByteArray(n)),
  "IO.getNumHeartbeats": (_w) => heartbeats,
  "IO.setNumHeartbeats": (count, _w) => {
    heartbeats = count;
    return 0;
  },
  // All Lean code runs on a single thread.
  "IO.getTID": (_w) => 1n,
  "Std.Time.Timestamp.now": (_w) => {
    const ms = Date.now();
    const seconds = Math.floor(ms / 1000);
    // A `Timestamp` is its `Duration` since the epoch, in whole seconds and nanoseconds.
    return ioOk(new Ctor(0, [seconds, (ms - seconds * 1000) * 1000000], null));
  },
  "System.Platform.getIsWindows": (_unit) => 0,
  "System.Platform.getIsOSX": (_unit) => 0,
  "System.Platform.getIsLinux": (_unit) => 0,
  "System.Platform.getIsEmscripten": (_unit) => 0,
  // There is no target triple for JS, and Lean reports a missing one as empty.
  "System.Platform.getTarget": (_unit) => mkString(""),
  "System.Platform.Internal.getHardwareConcurrency": (_unit) =>
    globalThis.navigator?.hardwareConcurrency ?? 0,
};
