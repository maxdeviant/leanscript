// Host services, implemented with Node's APIs.

import * as fs from "node:fs";
import { constants as osConstants } from "node:os";
import { isatty } from "node:tty";
import { getSystemErrorMessage } from "node:util";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

/**
 * The stack size of the thread that runs Lean code. JS frames are much larger than native ones, so
 * Node's default stack of about 1MB overflows at a recursion depth of several thousand, where
 * native Lean manages millions. Untouched stack pages cost nothing, so this can be generous.
 */
const STACK_SIZE_MB = 1024;

/**
 * Calls `run` on a thread with a large stack. The process exits once the thread has nothing left to
 * do, with the exit code that `run` set.
 *
 * `moduleUrl` must be the URL of the calling module: on the main thread, this starts a worker that
 * imports it again, which must then call this function again.
 */
export function runWithLargeStack(moduleUrl, run) {
  if (isMainThread) {
    const reply = new Int32Array(new SharedArrayBuffer(8));
    const worker = new Worker(new URL(moduleUrl), {
      argv: process.argv.slice(2),
      resourceLimits: { stackSizeMb: STACK_SIZE_MB },
      workerData: { reply },
    });
    worker.on("message", (msg) => {
      if (msg.type === "chdir") {
        let errno = 0;
        try {
          process.chdir(msg.path);
        } catch (err) {
          // The path is a string, so the only other error is a path containing a null byte.
          errno = osConstants.errno[err.code] ?? osConstants.errno.EINVAL;
        }
        Atomics.store(reply, 1, errno);
        Atomics.store(reply, 0, 1);
        Atomics.notify(reply, 0);
      }
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
}

/**
 * Calls `f` once the program has nothing left to do, when the event loop is empty, but not when it
 * exits early with `exitProcess`.
 */
export function whenFinished(f) {
  process.once("beforeExit", f);
}

/**
 * Writes all of `bytes` to the file descriptor `fd`, at the file offset `position` if it is given and
 * at the current file offset otherwise.
 */
export function writeBytes(fd, bytes, position = null) {
  let offset = 0;
  while (offset < bytes.length) {
    const n = fs.writeSync(fd, bytes, offset, bytes.length - offset, position);
    offset += n;
    if (position !== null) {
      position += n;
    }
  }
}

/** Writes any output held back for the file descriptor `fd`. Writes are unbuffered, so there is none. */
export function flushOutput(_fd) {}

const encoder = new TextEncoder();

/** Writes the JS string `s` to standard error. */
export function writeStderr(s) {
  writeBytes(2, encoder.encode(s));
}

// `process.stdout` and friends in a worker are pipes to the main thread, so we always work with
// file descriptors directly.
export const isTty = (fd) => isatty(fd);

/** Returns the value of the environment variable `name`, or `undefined` if it is not set. */
export function getEnv(name) {
  return process.env[name];
}

/** Returns whether the debug option `name` is set, as a nonempty environment variable. */
export const debugOption = (name) => Boolean(process.env[name]);

export function commandLineArgs() {
  return process.argv.slice(2);
}

export function setExitCode(code) {
  process.exitCode = code;
}

export function exitProcess(code) {
  process.exit(code);
}

export const processId = () => process.pid;

/** Returns the absolute path of the Node executable that runs the program. */
export const executablePath = () => process.execPath;

const sleepCell = new Int32Array(new SharedArrayBuffer(4));

/** Blocks the thread for `ms` milliseconds. */
export function sleep(ms) {
  Atomics.wait(sleepCell, 0, 0, ms);
}

/** Returns the time in nanoseconds since an arbitrary point, as a `BigInt`. */
export const monotonicNanos = () => process.hrtime.bigint();

/**
 * Returns the name (such as `ENOENT`), number, and message of the system error `err` thrown by one
 * of the functions below, or `undefined` if it is some other kind of error.
 */
export function systemError(err) {
  const errno = osConstants.errno[err?.code];
  if (errno === undefined) {
    return undefined;
  }
  return { name: err.code, errno, message: getSystemErrorMessage(-errno) };
}

/** Opens the file at `path` with the `fopen`-style `flags`, and returns its file descriptor. */
export const openFile = (path, flags) => fs.openSync(path, flags);

export const closeFile = (fd) => fs.closeSync(fd);

/** Returns whether the file descriptor `fd` refers to a regular file, which supports seeking. */
export const isRegularFile = (fd) => fs.fstatSync(fd).isFile();

/**
 * Reads up to `length` bytes from `fd` into `buffer` at `offset`, from the file offset `position`
 * if it is not `null` and from the current file offset otherwise. Returns the number of bytes read,
 * which is 0 only at the end of the file.
 */
export function readInto(fd, buffer, offset, length, position) {
  for (;;) {
    try {
      return fs.readSync(fd, buffer, offset, length, position);
    } catch (err) {
      // A descriptor shared with a parent process may be in non-blocking mode, so block ourselves.
      if (err.code !== "EAGAIN") {
        throw err;
      }
      sleep(1);
    }
  }
}

export const truncateFile = (fd, length) => fs.ftruncateSync(fd, length);

export const makeDir = (path) => fs.mkdirSync(path);

export const removeFile = (path) => fs.unlinkSync(path);

export const removeDir = (path) => fs.rmdirSync(path);

export const renamePath = (from, to) => fs.renameSync(from, to);

export const hardLink = (target, path) => fs.linkSync(target, path);

export const realPath = (path) => fs.realpathSync.native(path);

export const currentDir = () => process.cwd();

/**
 * The shared reply cell for requests from the worker to the main thread: a flag set when the reply
 * is ready, and an errno, which is 0 on success.
 */
const reply = isMainThread ? undefined : workerData?.reply;

const errnoNames = Object.fromEntries(
  Object.entries(osConstants.errno).map(([name, errno]) => [errno, name]),
);

/** Changes the current directory of the process. */
export function changeDir(path) {
  if (reply === undefined) {
    process.chdir(path);
    return;
  }
  // Workers can't change the current directory, so ask the main thread to, and block until it has.
  // The directory belongs to the whole process, so the change is visible here too.
  Atomics.store(reply, 0, 0);
  parentPort.postMessage({ type: "chdir", path });
  Atomics.wait(reply, 0, 0);
  const errno = reply[1];
  if (errno !== 0) {
    const name = errnoNames[errno];
    throw Object.assign(new Error(`${name}: chdir '${path}'`), { code: name });
  }
}

/** Returns the names of the entries of the directory at `path` as UTF-8, in directory order. */
export function readDirNames(path) {
  const dir = fs.opendirSync(path, { encoding: "buffer" });
  const names = [];
  try {
    for (let entry; (entry = dir.readSync()) !== null;) {
      names.push(new Uint8Array(entry.name));
    }
  } finally {
    dir.closeSync();
  }
  return names;
}

/**
 * Returns the metadata of the file at `path`, following a final symbolic link if `follow` is true.
 * Times are in nanoseconds since the epoch, and sizes are `BigInt`s.
 */
export function fileMetadata(path, follow) {
  const stats = (follow ? fs.statSync : fs.lstatSync)(path, { bigint: true });
  let type = "other";
  if (stats.isDirectory()) {
    type = "dir";
  } else if (stats.isFile()) {
    type = "file";
  } else if (stats.isSymbolicLink()) {
    type = "symlink";
  }
  return {
    accessedNs: stats.atimeNs,
    modifiedNs: stats.mtimeNs,
    size: stats.size,
    numLinks: stats.nlink,
    type,
  };
}
