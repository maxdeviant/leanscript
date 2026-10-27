// The LeanScript runtime.
//
// See `src/LeanScript/EmitJs.lean` for how Lean values are represented, and the individual modules for
// the representation of each builtin type.
//
// The externs that depend on the platform, and the host services that the rest of the runtime
// uses, are implemented once for each platform in `platform/<platform>/`. The `#platform/*` import
// resolves to the browser implementation under the `browser` export condition, to the Node one under
// `node`, and to the browser one elsewhere.
//
// Every extern implementation receives every IR parameter of the declaration it implements, in
// order, including erased type arguments and the `void` world token.

import {
  arrayToList,
  checkLeaks,
  dec,
  del,
  inc,
  InternalPanic,
  panic,
  setInitializing,
} from "./core.js";
import { externs as arrayExterns } from "./array.js";
import { externs as byteArrayExterns } from "./bytearray.js";
import { externs as fixedExterns } from "./fixed.js";
import { externs as floatExterns } from "./float.js";
import { externs as hashExterns } from "./hash.js";
import { externs as ioExterns } from "./io.js";
import { externs as miscExterns } from "./misc.js";
import { externs as natExterns } from "./nat.js";
import { externs as refExterns } from "./ref.js";
import { externs as stringExterns, mkString } from "./string.js";
import { externs as taskExterns } from "./task.js";
import { externs as platformExterns } from "#platform/externs.js";
import {
  commandLineArgs,
  flushOutput,
  runWithLargeStack,
  setExitCode,
  writeStderr,
} from "#platform/host.js";

export {
  apply,
  Ctor,
  dec,
  del,
  inc,
  incN,
  initCell,
  isShared,
  lazy,
  pap,
  reset,
  tag,
  unreachable,
} from "./core.js";
export { ioError, ioOk } from "./io.js";
export { mkString } from "./string.js";

/** Implementations of `@[extern]` declarations, keyed by the Lean declaration name. */
export const externs = {
  ...natExterns,
  ...fixedExterns,
  ...floatExterns,
  ...stringExterns,
  ...arrayExterns,
  ...byteArrayExterns,
  ...miscExterns,
  ...hashExterns,
  ...ioExterns,
  ...platformExterns,
  ...refExterns,
  ...taskExterns,
  panicCore: (_α, defaultValue, msg) => {
    const text = msg.toString();
    dec(msg);
    // The default value is borrowed, but we return it as an owned reference.
    inc(defaultValue);
    return panic(defaultValue, text);
  },
};

/**
 * Returns the implementations of the externs named `names`.
 *
 * An extern in `unavailable` that this platform does not implement is replaced by a function that
 * throws when called. Throws if any other extern is missing, so that a program fails when it loads
 * instead of partway through running.
 */
export function resolveExterns(names, unavailable = []) {
  const missing = names.filter(
    (name) => !Object.hasOwn(externs, name) && !unavailable.includes(name),
  );
  if (missing.length > 0) {
    throw new Error(`LeanScript: missing implementations for externs:\n  ${missing.join("\n  ")}`);
  }
  const stubs = unavailable
    .filter((name) => !Object.hasOwn(externs, name))
    .map((name) => [
      name,
      () => {
        throw new Error(`LeanScript: ${name} is not available on this platform`);
      },
    ]);
  return { ...externs, ...Object.fromEntries(stubs) };
}

/**
 * Runs the program, on a thread with a large stack. `moduleUrl` must be the URL of the calling
 * module, which may be imported again to run the program on that thread; see `runProgram` for the
 * other arguments.
 */
export function runMain(moduleUrl, inits, main, arity, errorToString) {
  runWithLargeStack(moduleUrl, () => runProgram(inits, main, arity, errorToString));
}

/**
 * Runs the initializers in `inits`, then the Lean `main` function, which takes `arity` arguments:
 * either just the world token, or the command line arguments followed by the world token.
 *
 * Each initializer is an `IO` action, paired with the getter of the `[init]` declaration it
 * initializes, if any. Sets the exit code from the result, reporting an uncaught error from an
 * initializer or `main` with `errorToString`. Finally reports any leaked objects, if reference
 * counting debug checks are enabled, and flushes standard output and error.
 *
 * An internal panic stops the program with exit code 1, without checking for leaks.
 */
function runProgram(inits, main, arity, errorToString) {
  try {
    if (runInits(inits, errorToString)) {
      const r = arity === 2 ? main(arrayToList(commandLineArgs().map(mkString)), 0) : main(0);
      if (r.tag === 0) {
        const value = r.f[0];
        // `IO Unit` returns `()`, which is boxed as 0, and `IO UInt32` returns the exit code.
        setExitCode(typeof value === "number" ? value : 0);
        dec(r);
      } else {
        reportError(r, errorToString);
      }
    }
    checkLeaks();
  } catch (e) {
    if (!(e instanceof InternalPanic)) {
      throw e;
    }
    writeStderr(`INTERNAL PANIC: ${e.message}\n`);
    setExitCode(1);
  }
  flushOutput(1);
  flushOutput(2);
}

/** Runs `inits`, returning whether they all succeeded. */
function runInits(inits, errorToString) {
  setInitializing(true);
  try {
    for (const [init, cell] of inits) {
      const r = init(0);
      if (r.tag !== 0) {
        reportError(r, errorToString);
        return false;
      }
      if (cell === undefined) {
        dec(r);
      } else {
        cell.set(r.f[0]);
        del(r);
      }
    }
    return true;
  } finally {
    setInitializing(false);
  }
}

/** Reports the error in the failed `IO` result `r`, consuming it. */
function reportError(r, errorToString) {
  const error = r.f[0];
  del(r);
  const msg = errorToString(error);
  writeStderr(`uncaught exception: ${msg}\n`);
  dec(msg);
  setExitCode(1);
}
