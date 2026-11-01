// File handles.

import { RC, track } from "../../core.js";
import { LeanByteArray } from "../../bytearray.js";
import { closeFile, isTty, readInto, truncateFile, writeBytes } from "./host.js";

const EMPTY = new Uint8Array(0);

/** The number of bytes `getLine` reads at a time. */
const LINE_CHUNK_SIZE = 4096;

/**
 * An open file, `IO.FS.Handle`. Writes are unbuffered, so flushing does nothing, but `getLine` may
 * read past the end of the line, so reads first consume the bytes it left over.
 *
 * The file is closed when the handle is freed.
 */
export class Handle {
  /**
   * @param {number} fd
   * @param {boolean} seekable Whether the file supports positioned reads and writes, in which case
   *   the handle tracks its own position so that it can be rewound.
   */
  constructor(fd, seekable) {
    this[RC] = 1;
    this.fd = fd;
    /** The file offset of the next read or write, or `null` to use the current file offset. */
    this.pos = seekable ? 0 : null;
    /** Bytes read past the logical position of the handle, which the next read returns first. */
    this.pending = EMPTY;
    track(this);
  }

  describe() {
    return `handle for file descriptor ${this.fd}`;
  }

  finalize() {
    closeFile(this.fd);
  }

  isTty() {
    return isTty(this.fd);
  }

  /** Does nothing, as writes are unbuffered. */
  flush() {}

  /** Reads from the file into `buffer` at `offset`, returning the number of bytes read. */
  readFile(buffer, offset, length) {
    const n = readInto(this.fd, buffer, offset, length, this.pos);
    if (this.pos !== null) {
      this.pos += n;
    }
    return n;
  }

  /** Reads `n` bytes, or fewer at the end of the file. */
  read(n) {
    let bytes = new Uint8Array(Math.min(n, Math.max(this.pending.length, LINE_CHUNK_SIZE)));
    let size = Math.min(n, this.pending.length);
    bytes.set(this.pending.subarray(0, size));
    this.pending = this.pending.subarray(size);
    while (size < n) {
      if (size === bytes.length) {
        const grown = new Uint8Array(Math.min(n, 2 * bytes.length));
        grown.set(bytes);
        bytes = grown;
      }
      const read = this.readFile(bytes, size, bytes.length - size);
      if (read === 0) {
        break;
      }
      size += read;
    }
    return new LeanByteArray(bytes, size);
  }

  /** Reads up to and including the next newline, or to the end of the file. */
  getLine() {
    let searchFrom = 0;
    for (;;) {
      const end = this.pending.indexOf(10, searchFrom);
      if (end !== -1) {
        const line = this.pending.subarray(0, end + 1);
        this.pending = this.pending.subarray(end + 1);
        return line;
      }
      searchFrom = this.pending.length;
      const buffer = new Uint8Array(this.pending.length + LINE_CHUNK_SIZE);
      buffer.set(this.pending);
      const read = this.readFile(buffer, this.pending.length, LINE_CHUNK_SIZE);
      if (read === 0) {
        const line = this.pending;
        this.pending = EMPTY;
        return line;
      }
      this.pending = buffer.subarray(0, this.pending.length + read);
    }
  }

  /** Discards any bytes read ahead, so that the file position is the logical one. */
  discardPending() {
    if (this.pos !== null) {
      this.pos -= this.pending.length;
    }
    this.pending = EMPTY;
  }

  /** Writes all of `bytes` to the file. */
  writeFile(bytes) {
    writeBytes(this.fd, bytes, this.pos);
  }

  write(bytes) {
    this.discardPending();
    this.writeFile(bytes);
    if (this.pos !== null) {
      this.pos += bytes.length;
    }
  }

  rewind() {
    if (this.pos !== null) {
      this.pos = 0;
      this.pending = EMPTY;
    }
  }

  /** Truncates the file at the current position. */
  truncate() {
    this.discardPending();
    this.truncateFile(this.pos ?? 0);
  }

  truncateFile(length) {
    truncateFile(this.fd, length);
  }
}
