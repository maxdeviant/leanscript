// File handles and file system operations.

import { Ctor, dec, inc, RC, track } from "../../core.js";
import { mkArray } from "../../array.js";
import { LeanByteArray } from "../../bytearray.js";
import { attempt } from "../../io.js";
import { normalize } from "../../nat.js";
import { decodeLossy } from "../../stream.js";
import { mkString } from "../../string.js";
import {
  changeDir,
  closeFile,
  currentDir,
  fileMetadata,
  hardLink,
  isRegularFile,
  isTty,
  makeDir,
  openFile,
  readDirNames,
  readInto,
  realPath,
  removeDir,
  removeFile,
  renamePath,
  truncateFile,
  writeBytes,
} from "./host.js";

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

  write(bytes) {
    this.discardPending();
    writeBytes(this.fd, bytes, this.pos);
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
    truncateFile(this.fd, this.pos ?? 0);
  }
}

/** The `fopen` mode of each `IO.FS.Mode`. */
const openFlags = ["r", "w", "wx", "r+", "a"];

/** The `IO.FS.FileType` of each file type reported by the platform. */
const fileTypes = { dir: 0, file: 1, symlink: 2, other: 3 };

const NANOS_PER_SECOND = 1000000000n;

/** Returns an `IO.FS.SystemTime` for a time given in nanoseconds since the epoch. */
function systemTime(ns) {
  let sec = ns / NANOS_PER_SECOND;
  let nsec = ns % NANOS_PER_SECOND;
  if (nsec < 0n) {
    sec -= 1n;
    nsec += NANOS_PER_SECOND;
  }
  return new Ctor(0, [normalize(sec)], { 8: Number(nsec) });
}

/** Returns an `IO.FS.Metadata` for the file at the borrowed path `p`, as an `EST.Out`. */
function metadata(p, follow) {
  return attempt(p, () => {
    const m = fileMetadata(p.toString(), follow);
    return new Ctor(0, [systemTime(m.accessedNs), systemTime(m.modifiedNs)], {
      16: m.size,
      24: m.numLinks,
      32: fileTypes[m.type],
    });
  });
}

export const externs = {
  "IO.FS.Handle.mk": (path, mode, _w) =>
    attempt(path, () => {
      const fd = openFile(path.toString(), openFlags[mode]);
      // Appends ignore the position, so there is no need to track it.
      return new Handle(fd, mode !== 4 && isRegularFile(fd));
    }),
  "IO.FS.Handle.isTty": (h, _w) => (h.isTty() ? 1 : 0),
  "IO.FS.Handle.flush": (h, _w) => attempt(undefined, () => h.flush()),
  "IO.FS.Handle.rewind": (h, _w) => attempt(undefined, () => h.rewind()),
  "IO.FS.Handle.truncate": (h, _w) => attempt(undefined, () => h.truncate()),
  "IO.FS.Handle.read": (h, n, _w) => attempt(undefined, () => h.read(n)),
  "IO.FS.Handle.write": (h, b, _w) =>
    attempt(undefined, () => h.write(b.bytes.subarray(0, b.size))),
  "IO.FS.Handle.getLine": (h, _w) => attempt(undefined, () => decodeLossy(h.getLine())),
  "IO.FS.Handle.putStr": (h, s, _w) =>
    attempt(undefined, () => h.write(s.bytes.subarray(0, s.size))),

  "IO.FS.createDir": (p, _w) => attempt(p, () => makeDir(p.toString())),
  "IO.FS.removeFile": (p, _w) => attempt(p, () => removeFile(p.toString())),
  "IO.FS.removeDir": (p, _w) => attempt(p, () => removeDir(p.toString())),
  "IO.FS.rename": (from, to, _w) => attempt(from, () => renamePath(from.toString(), to.toString())),
  "IO.FS.hardLink": (target, link, _w) =>
    attempt(target, () => hardLink(target.toString(), link.toString())),
  "IO.FS.realPath": (p, _w) => {
    const r = attempt(p, () => mkString(realPath(p.toString())));
    dec(p);
    return r;
  },
  "IO.currentDir": (_w) => attempt(undefined, () => mkString(currentDir())),
  "IO.Process.getCurrentDir": (_w) => attempt(undefined, () => mkString(currentDir())),
  "IO.Process.setCurrentDir": (p, _w) => attempt(p, () => changeDir(p.toString())),
  "System.FilePath.readDir": (p, _w) =>
    attempt(p, () =>
      mkArray(
        readDirNames(p.toString()).map((name) => {
          inc(p);
          return new Ctor(0, [p, decodeLossy(name)], null);
        }),
      ),
    ),
  "System.FilePath.metadata": (p, _w) => metadata(p, true),
  "System.FilePath.symlinkMetadata": (p, _w) => metadata(p, false),
};
