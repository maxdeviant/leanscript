// Host services, implemented with the web APIs that browsers provide.
//
// Browsers have no file descriptors, so standard output and error, numbered 1 and 2 as on other
// platforms, are written to the console.

/** The console output of each file descriptor: the function that logs a line, and the line so far. */
const consoleOutputs = {
  1: { log: (line) => console.log("%s", line), decoder: new TextDecoder(), line: "" },
  2: { log: (line) => console.error("%s", line), decoder: new TextDecoder(), line: "" },
};

/**
 * Writes `bytes` to the file descriptor `fd`, which must be 1 or 2. The console only logs whole
 * lines, so the end of the output is held back until its line ends or it is flushed.
 */
export function writeBytes(fd, bytes) {
  const out = consoleOutputs[fd];
  const lines = (out.line + out.decoder.decode(bytes, { stream: true })).split("\n");
  out.line = lines.pop();
  for (const line of lines) {
    out.log(line);
  }
}

/** Writes any output held back for the file descriptor `fd`. */
export function flushOutput(fd) {
  const out = consoleOutputs[fd];
  if (out.line !== "") {
    out.log(out.line);
    out.line = "";
  }
}

const encoder = new TextEncoder();

/** Writes the JS string `s` to standard error. */
export function writeStderr(s) {
  writeBytes(2, encoder.encode(s));
}

/** Returns `undefined`, as browsers have no environment variables. */
export const getEnv = (_name) => undefined;

/** Returns whether the debug option `name` is set, as a truthy global variable. */
export const debugOption = (name) => Boolean(globalThis[name]);

export const commandLineArgs = () => [];

/** Does nothing, as browsers have no exit codes. */
export function setExitCode(_code) {}

/** Returns whether `runWithLargeStack` calls its function on the current thread, which it always does. */
export const runsProgram = () => true;

/** Calls `run` on the current thread, whose stack size is up to the browser. */
export function runWithLargeStack(_moduleUrl, run) {
  run();
}

/**
 * Calls `f` once the program has nothing left to do. A page never finishes, so this only calls `f`
 * when the browser runtime runs under Node, as it does in tests.
 */
export function whenFinished(f) {
  globalThis.process?.once?.("beforeExit", f);
}

let sleepCell;

/**
 * Blocks the thread for `ms` milliseconds. Browsers only allow this off the main thread, in
 * cross-origin isolated pages.
 */
export function sleep(ms) {
  // Without cross-origin isolation there is no `SharedArrayBuffer`, so only create one when needed.
  sleepCell ??= new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sleepCell, 0, 0, ms);
}

/** Returns the time in nanoseconds since an arbitrary point, as a `BigInt`. */
export const monotonicNanos = () => BigInt(Math.round(performance.now() * 1e6));

/** Returns `undefined`, as browsers report no system errors. */
export const systemError = (_err) => undefined;
