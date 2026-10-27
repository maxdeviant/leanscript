// Host platform services. This is the only runtime module that depends on Node.

import { writeSync } from "node:fs";
import { isatty } from "node:tty";
import { isMainThread, Worker } from "node:worker_threads";

/**
 * The stack size of the thread that runs Lean code. JS frames are much larger than native ones, so
 * Node's default stack of about 1MB overflows at a recursion depth of several thousand, where
 * native Lean manages millions. Untouched stack pages cost nothing, so this can be generous.
 */
const STACK_SIZE_MB = 1024;

/**
 * Calls `run` on a thread with a large stack, then exits with the exit code it set.
 *
 * `moduleUrl` must be the URL of the calling module: on the main thread, this starts a worker that
 * imports it again, which must then call this function again.
 */
export function runWithLargeStack(moduleUrl, run) {
  if (isMainThread) {
    const worker = new Worker(new URL(moduleUrl), {
      argv: process.argv.slice(2),
      resourceLimits: { stackSizeMb: STACK_SIZE_MB },
    });
    worker.on("error", (err) => {
      throw err;
    });
    worker.on("exit", (code) => {
      process.exitCode ||= code;
    });
    return;
  }
  run();
  process.exit(process.exitCode ?? 0);
}

/** Writes all of `bytes` to the file descriptor `fd`. */
export function writeBytes(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(fd, bytes, offset, bytes.length - offset);
  }
}

const encoder = new TextEncoder();

/** Writes the JS string `s` to standard error. */
export function writeStderr(s) {
  writeBytes(2, encoder.encode(s));
}

export function isStdoutTty() {
  // `process.stdout` in a worker is a pipe to the main thread, so ask about the descriptor itself.
  return isatty(1);
}

/** Returns the value of the environment variable `name`, or `undefined` if it is not set. */
export function getEnv(name) {
  return process.env[name];
}

export function commandLineArgs() {
  return process.argv.slice(2);
}

export function setExitCode(code) {
  process.exitCode = code;
}
