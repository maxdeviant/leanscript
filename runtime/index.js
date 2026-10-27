// The LeanScript runtime.
//
// See `LeanScript/EmitJs.lean` for how Lean values are represented, and the individual modules for
// the representation of each builtin type.
//
// Every extern implementation receives every IR parameter of the declaration it implements, in
// order, including erased type arguments and the `void` world token.

import { arrayToList, dec, inc, panic } from "./core.js";
import { externs as arrayExterns } from "./array.js";
import { externs as ioExterns } from "./io.js";
import { externs as natExterns } from "./nat.js";
import { commandLineArgs, setExitCode, writeStderr } from "./platform.js";
import { externs as stringExterns, mkString } from "./string.js";
import { externs as uintExterns } from "./uint.js";

export {
  apply,
  Ctor,
  dec,
  del,
  inc,
  incN,
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
  ...uintExterns,
  ...stringExterns,
  ...arrayExterns,
  ...ioExterns,
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

/** Runs the `IO` action `init` and returns its result, throwing if it fails. */
export function runInit(init) {
  const r = init(0);
  if (r.tag !== 0) {
    throw new Error("LeanScript: initialization failed");
  }
  return r.f[0];
}

/**
 * Runs the Lean `main` function, which takes `arity` arguments: either just the world token, or the
 * command line arguments followed by the world token.
 *
 * Sets the exit code from the result, reporting an uncaught error with `errorToString`.
 */
export function runMain(main, arity, errorToString) {
  const r = arity === 2 ? main(arrayToList(commandLineArgs().map(mkString)), 0) : main(0);
  if (r.tag === 0) {
    const value = r.f[0];
    // `IO Unit` returns `()`, which is boxed as 0, and `IO UInt32` returns the exit code.
    setExitCode(typeof value === "number" ? value : 0);
  } else {
    writeStderr(`uncaught exception: ${errorToString(r.f[0])}\n`);
    setExitCode(1);
  }
}
