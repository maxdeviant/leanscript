// The externs whose implementation depends on the platform, implemented with the web APIs that
// browsers provide.

import { LeanByteArray } from "../../bytearray.js";
import { mkStream, stdStreamExterns } from "../../stream.js";
import { flushOutput, writeBytes } from "./host.js";

/** A standard stream that writes to the console, and is empty when read. */
class ConsoleStream {
  constructor(fd) {
    this.fd = fd;
  }

  flush() {
    flushOutput(this.fd);
  }

  read(_n) {
    return new LeanByteArray(new Uint8Array(0), 0);
  }

  write(bytes) {
    writeBytes(this.fd, bytes);
  }

  getLine() {
    return new Uint8Array(0);
  }

  isTty() {
    return false;
  }
}

export const externs = {
  ...stdStreamExterns("Stdout", mkStream(new ConsoleStream(1))),
  ...stdStreamExterns("Stderr", mkStream(new ConsoleStream(2))),
};
