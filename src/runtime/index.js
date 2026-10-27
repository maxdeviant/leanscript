// The LeanScript runtime.
//
// See `src/LeanScript/EmitJs.lean` for how Lean values are represented, and the individual modules for
// the representation of each builtin type.
//
// Every extern implementation receives every IR parameter of the declaration it implements, in
// order, including erased type arguments and the `void` world token.

import { arrayToList, checkLeaks, dec, del, inc, panic } from "./core.js";
import { externs as arrayExterns } from "./array.js";
import { externs as fixedExterns } from "./fixed.js";
import { externs as floatExterns } from "./float.js";
import { externs as hashExterns } from "./hash.js";
import { externs as ioExterns } from "./io.js";
import { externs as natExterns } from "./nat.js";
import { externs as refExterns } from "./ref.js";
import { commandLineArgs, setExitCode, writeStderr } from "./platform.js";
import { externs as stringExterns, mkString } from "./string.js";

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
export { mkString } from "./string.js";

/** Implementations of `@[extern]` declarations, keyed by the Lean declaration name. */
export const externs = {
  ...natExterns,
  ...fixedExterns,
  ...floatExterns,
  ...stringExterns,
  ...arrayExterns,
  ...hashExterns,
  ...ioExterns,
  ...refExterns,
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
 * Throws if any of them are missing, so that a program fails when it loads instead of partway
 * through running.
 */
export function resolveExterns(names) {
  const missing = names.filter((name) => !Object.hasOwn(externs, name));
  if (missing.length > 0) {
    throw new Error(`LeanScript: missing implementations for externs:\n  ${missing.join("\n  ")}`);
  }
  return externs;
}

/**
 * Runs the initializers in `inits`, then the Lean `main` function, which takes `arity` arguments:
 * either just the world token, or the command line arguments followed by the world token.
 *
 * Each initializer is an `IO` action, paired with the getter of the `[init]` declaration it
 * initializes, if any. Sets the exit code from the result, reporting an uncaught error from an
 * initializer or `main` with `errorToString`. Finally reports any leaked objects, if reference
 * counting debug checks are enabled.
 */
export function runMain(inits, main, arity, errorToString) {
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
}

/** Runs `inits`, returning whether they all succeeded. */
function runInits(inits, errorToString) {
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
