// Host platform services. This is the only runtime module that depends on Node.

import { writeSync } from "node:fs";

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
  return !!process.stdout.isTTY;
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
