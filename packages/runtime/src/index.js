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
import { externs as floatArrayExterns } from "./floatarray.js";
import { externs as hashExterns } from "./hash.js";
import { externs as ioExterns } from "./io.js";
import { externs as miscExterns } from "./misc.js";
import { externs as natExterns } from "./nat.js";
import { externs as netExterns } from "./net.js";
import { externs as refExterns } from "./ref.js";
import { externs as stringExterns, mkString } from "./string.js";
import { externs as systemExterns } from "./system.js";
import { externs as taskExterns } from "./task.js";
import { externs as timerExterns } from "./timer.js";
import { externs as platformExterns } from "#platform/externs.js";
import {
  commandLineArgs,
  flushOutput,
  runsProgram,
  runWithLargeStack,
  setExitCode,
  whenFinished,
  writeStderr,
} from "#platform/host.js";

export {
  apply,
  checkLeaks,
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
export {
  jsAttempt,
  jsFunction,
  jsObject,
  jsToArray,
  jsToBool,
  jsToFloat,
  jsToInt,
  jsToNat,
  jsToString,
} from "./jsvalue.js";
export { mkString } from "./string.js";
export { jsPromiseOfTask, taskOfJsPromise } from "./task.js";

/** The version of the runtime, which must be the version of the compiler that compiled a program. */
export const version = "0.1.0";

/**
 * Throws if `compilerVersion`, the version of the compiler that compiled the calling program, is not
 * the version of the runtime, as the program may then use the runtime in ways it doesn't support.
 */
export function checkVersion(compilerVersion) {
  if (compilerVersion !== version) {
    throw new Error(
      `LeanScript: this program was compiled by LeanScript ${compilerVersion}, but @leanscript/runtime is version ${version}; use the same version of both`,
    );
  }
}

/**
 * Imports the module `specifier` with `load`, and returns its exports `names`, in order, if the
 * program runs on the current thread. On any other thread, which only starts the one the program
 * runs on, doesn't import the module, and returns `undefined` for each.
 *
 * Throws if the module lacks one of the exports, as a static import would.
 */
export async function importForProgram(load, specifier, names) {
  if (!runsProgram()) {
    return names.map(() => undefined);
  }
  const module = await load();
  return names.map((name) => {
    if (!(name in module)) {
      throw new SyntaxError(
        `The requested module '${specifier}' does not provide an export named '${name}'`,
      );
    }
    return module[name];
  });
}

/** Implementations of `@[extern]` declarations, keyed by the Lean declaration name. */
export const externs = {
  ...natExterns,
  ...fixedExterns,
  ...floatExterns,
  ...stringExterns,
  ...arrayExterns,
  ...byteArrayExterns,
  ...floatArrayExterns,
  ...miscExterns,
  ...hashExterns,
  ...ioExterns,
  ...netExterns,
  ...platformExterns,
  ...refExterns,
  ...systemExterns,
  ...taskExterns,
  ...timerExterns,
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
 * Runs the program, on a thread with a large stack, until it finishes. `moduleUrl` must be the URL of the calling
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
 * initializer or `main` with `errorToString`.
 *
 * The program finishes once it has nothing left to do, as JS may still call it back, or continue
 * one of its tasks when a JS promise settles. Then reports any leaked objects, if reference counting
 * debug checks are enabled, and flushes standard output and error.
 *
 * An internal panic stops the program with exit code 1, without checking for leaks.
 */
function runProgram(inits, main, arity, errorToString) {
  try {
    const failure = runInits(inits);
    if (failure !== undefined) {
      reportError(failure, errorToString);
    } else {
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
  } catch (e) {
    if (!(e instanceof InternalPanic)) {
      throw e;
    }
    writeStderr(`INTERNAL PANIC: ${e.message}\n`);
    setExitCode(1);
    flushAll();
    return;
  }
  whenFinished(() => {
    checkLeaks();
    flushAll();
  });
}

function flushAll() {
  flushOutput(1);
  flushOutput(2);
}

/**
 * Returns a function that runs the initializers of a library module the first time it is called, as
 * `runProgram` does. If an initializer fails, it and every later call throw the same JS `Error`,
 * with the message from `errorToString`.
 */
export function initModuleOnce(inits, errorToString) {
  let state = "uninitialized";
  let error;
  return () => {
    if (state === "initialized") {
      return;
    }
    if (state === "failed") {
      throw error;
    }
    try {
      const failure = runInits(inits);
      if (failure !== undefined) {
        takeIoResult(failure, errorToString);
      }
      state = "initialized";
    } catch (e) {
      state = "failed";
      error = e;
      throw e;
    }
  };
}

/**
 * Takes ownership of the `IO` result `r`, and returns its value, or throws its error as a JS
 * `Error`, with the message from `errorToString`.
 */
export function takeIoResult(r, errorToString) {
  const { tag } = r;
  const value = r.f[0];
  del(r);
  if (tag === 0) {
    return value;
  }
  const msg = errorToString(value);
  const text = msg.toString();
  dec(msg);
  throw new Error(text);
}

/** Runs `inits`, stopping at and returning the first failed `IO` result, if any. */
function runInits(inits) {
  setInitializing(true);
  try {
    for (const [init, cell] of inits) {
      const r = init(0);
      if (r.tag !== 0) {
        return r;
      }
      if (cell === undefined) {
        dec(r);
      } else {
        cell.set(r.f[0]);
        del(r);
      }
    }
    return undefined;
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
