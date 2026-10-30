// Host services, implemented with Node's APIs.

import { randomBytes } from "node:crypto";
import * as dns from "node:dns";
import * as fs from "node:fs";
import { isIP } from "node:net";
import * as os from "node:os";
import { join } from "node:path";
import { isatty } from "node:tty";
import { getSystemErrorMessage, getSystemErrorName } from "node:util";
import {
  isMainThread,
  MessageChannel,
  receiveMessageOnPort,
  Worker,
  workerData,
} from "node:worker_threads";
import * as children from "./children.js";
import { setEventPort } from "./events.js";
import * as signals from "./signals.js";
import * as sockets from "./sockets.js";

/**
 * The stack size of the thread that runs Lean code. JS frames are much larger than native ones, so
 * Node's default stack of about 1MB overflows at a recursion depth of several thousand, where
 * native Lean manages millions. Untouched stack pages cost nothing, so this can be generous.
 */
const STACK_SIZE_MB = 1024;

/** Returns whether `runWithLargeStack` calls its function on the current thread. */
export const runsProgram = () => !isMainThread;

/**
 * Calls `run` on a thread with a large stack. The process exits once the thread has nothing left to
 * do, with the exit code that `run` set.
 *
 * `moduleUrl` must be the URL of the calling module: on the main thread, this starts a worker that
 * imports it again, which must then call this function again.
 */
export function runWithLargeStack(moduleUrl, run) {
  if (isMainThread) {
    const ready = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    // Events, as `events.js` describes, separate from the replies that the worker blocks on.
    const events = new MessageChannel();
    setEventPort(events.port1);
    const worker = new Worker(new URL(moduleUrl), {
      argv: process.argv.slice(2),
      resourceLimits: { stackSizeMb: STACK_SIZE_MB },
      workerData: { channel: { ready, port: port2, events: events.port2 } },
      transferList: [port2, events.port2],
    });
    port1.on("message", (msg) => serve(port1, ready, msg));
    // The worker keeps the program running, and requests only arrive while it does.
    port1.unref();
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

/** The requests that the worker makes of the main thread, which only the main thread can serve. */
const requestHandlers = {
  chdir: (path) => process.chdir(path),
  ...children,
  ...signals,
  ...sockets,
};

/**
 * Serves the request `msg` from the worker, which waits for the reply on `port`, signaled by
 * `ready`, unless the request has `noReply` set.
 */
async function serve(port, ready, { type, args, noReply }) {
  let reply;
  try {
    reply = { value: await requestHandlers[type](...args) };
  } catch (err) {
    reply = { error: { code: err.code, message: err.message } };
  }
  if (noReply) {
    return;
  }
  port.postMessage(reply);
  Atomics.store(ready, 0, 1);
  Atomics.notify(ready, 0);
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

/**
 * Returns the addresses of the network interfaces, as `[name, address]` pairs in the form of
 * `os.networkInterfaces()`.
 */
export const interfaceAddresses = () =>
  Object.entries(os.networkInterfaces()).flatMap(([name, addrs]) => addrs.map((a) => [name, a]));

/** Returns the system error, in the form that `systemError` returns, for the libuv error `code`. */
const uvError = (code) => ({
  name: getSystemErrorName(code),
  errno: -code,
  message: getSystemErrorMessage(code),
});

const UV_EAI_ADDRFAMILY = -3000;
const UV_EAI_NONAME = -3008;

/**
 * Returns the libuv error that `getaddrinfo` reports for an IP address of the version `version`
 * when asked only for the other version, or `undefined` where it instead returns the IPv4-mapped
 * IPv6 address. glibc reports `EAI_ADDRFAMILY` for both versions, while macOS maps an IPv4 address
 * and reports `EAI_NONAME` for an IPv6 one.
 */
function familyMismatch(version) {
  if (process.platform !== "darwin") {
    return UV_EAI_ADDRFAMILY;
  }
  return version === 6 ? UV_EAI_NONAME : undefined;
}

/**
 * Resolves `host` like `getaddrinfo`, to addresses of the IP version `family` (4 or 6), or of either
 * if it is 0. Calls `callback` with a system error, in the form that `systemError` returns, or with
 * `undefined` and the addresses, in the resolver's order.
 */
export function lookupHost(host, family, callback) {
  // Node returns an IP address as it is, without calling `getaddrinfo`, even if it is of the other
  // version, so do what `getaddrinfo` would.
  const version = isIP(host);
  if (version !== 0 && family !== 0 && version !== family) {
    const code = familyMismatch(version);
    queueMicrotask(() =>
      code === undefined ? callback(undefined, [`::ffff:${host}`]) : callback(uvError(code)),
    );
    return;
  }
  dns.lookup(host, { family, all: true, order: "verbatim" }, (err, addresses) => {
    if (err) {
      callback(uvError(err.errno));
    } else {
      const ips = addresses.map((a) => a.address);
      callback(undefined, ips);
    }
  });
}

/**
 * Looks up the host name and service name of the IP address `address` and `port`, like
 * `getnameinfo` without flags, which falls back to the numeric address when the address has no
 * name. Calls `callback` with the host name and the service name.
 */
export function lookupService(address, port, callback) {
  dns.lookupService(address, port, (err, host, service) => {
    if (!err) {
      callback(host, service);
      return;
    }
    // Node requires a name for the address (`NI_NAMEREQD`), so it fails where `getnameinfo`
    // without flags falls back. The service name doesn't depend on the address, so look it up
    // with the loopback address, which has a name.
    dns.lookupService("127.0.0.1", port, (loopbackErr, _host, loopbackService) =>
      callback(address, loopbackErr ? String(port) : loopbackService),
    );
  });
}

export const parentProcessId = () => process.ppid;

export const processTitle = () => process.title;

export function setProcessTitle(title) {
  process.title = title;
}

/** Returns the scheduling priority of the process `pid`, from -20 (highest) to 19 (lowest). */
export const processPriority = (pid) => os.getPriority(pid);

export const setProcessPriority = (pid, priority) => os.setPriority(pid, priority);

/**
 * Returns the resource usage of the process, in the form of `process.resourceUsage()`: times are
 * in microseconds, and the maximum resident set size is in kilobytes.
 */
export const resourceUsage = () => process.resourceUsage();

/** Returns the environment variables, as `[name, value]` pairs. */
export const environment = () => Object.entries(process.env);

export function setEnv(name, value) {
  process.env[name] = value;
}

export function unsetEnv(name) {
  delete process.env[name];
}

/**
 * Returns the current user's home directory: `$HOME` if it is set, as in libuv, and otherwise the
 * one in the user database. `$HOME` is read from `process.env`, as `os.homedir` reads the process's
 * real environment, which a worker's `process.env` is only a copy of.
 */
export const homeDir = () => process.env.HOME ?? os.homedir();

export const tempDir = () => os.tmpdir();

/** Returns the current user, in the form of `os.userInfo()`. */
export const userInfo = () => os.userInfo();

export const hostname = () => os.hostname();

/** Returns the time since the system booted, in seconds. */
export const systemUptime = () => os.uptime();

/** Returns the operating system's name, release, version, and machine type, as `uname` does. */
export const systemName = () => ({
  sysname: os.type(),
  release: os.release(),
  version: os.version(),
  machine: os.machine(),
});

/** Returns the CPUs, in the form of `os.cpus()`. */
export const cpuInfo = () => os.cpus();

/** Returns the amount of free memory, in bytes. */
export const freeMemory = () => os.freemem();

/** Returns the total amount of memory, in bytes. */
export const totalMemory = () => os.totalmem();

/** Returns the memory limit imposed on the process by the operating system, in bytes, or 0. */
export const constrainedMemory = () => process.constrainedMemory();

/** Returns the amount of memory that the process can still allocate, in bytes. */
export const availableMemory = () => process.availableMemory();

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
  // Some APIs, such as those in `node:os`, wrap the system error in an `ERR_SYSTEM_ERROR`.
  const name = err?.code === "ERR_SYSTEM_ERROR" ? err.info?.code : err?.code;
  const errno = os.constants.errno[name];
  if (errno === undefined) {
    return undefined;
  }
  return { name, errno, message: getSystemErrorMessage(-errno) };
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

export const setMode = (path, mode) => fs.chmodSync(path, mode);

/** The prefix of the names of temporary files and directories, as in the C runtime. */
const TEMP_PREFIX = "tmp.";

const TEMP_NAME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Creates a new file in the temporary directory that only the current user can read and write, and
 * returns its file descriptor, open for reading and writing, and its path.
 */
export function makeTempFile() {
  for (;;) {
    const name = Array.from(randomBytes(6), (b) => TEMP_NAME_CHARS[b % TEMP_NAME_CHARS.length]);
    const path = join(os.tmpdir(), TEMP_PREFIX + name.join(""));
    try {
      // Like `mkstemp`, creating the file exclusively means that no other file can be opened in
      // its place, and a name that is already taken is retried.
      return { fd: fs.openSync(path, "wx+", 0o600), path };
    } catch (err) {
      if (err.code !== "EEXIST") {
        throw err;
      }
    }
  }
}

/** Creates a new directory in the temporary directory that only the current user can access. */
export const makeTempDir = () => fs.mkdtempSync(join(os.tmpdir(), TEMP_PREFIX));

export const currentDir = () => process.cwd();

/**
 * The channel for requests to the main thread, if this is the worker that runs Lean code: the port
 * that requests are posted to and replies arrive on, and a flag set when a reply is ready.
 */
const channel = isMainThread ? undefined : workerData?.channel;

/**
 * Makes the request `type` of the main thread, with the arguments `args`, and blocks until it
 * replies. Returns the reply, or throws the error it reports, as a system error if it is one.
 */
function request(type, ...args) {
  if (channel === undefined) {
    throw new Error(`LeanScript: ${type} is only supported when Lean code runs on a worker`);
  }
  Atomics.store(channel.ready, 0, 0);
  channel.port.postMessage({ type, args });
  Atomics.wait(channel.ready, 0, 0);
  const { value, error } = receiveMessageOnPort(channel.port).message;
  if (error !== undefined) {
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  return value;
}

/** Makes the request `type` of the main thread, with the arguments `args`, without waiting. */
function post(type, ...args) {
  channel.port.postMessage({ type, args, noReply: true });
}

let lastMainId = 0;

/**
 * Returns a new ID for something that the main thread will have on our behalf, such as a socket,
 * unique among all of them, so that events about it can be routed by ID.
 */
export const newMainId = () => ++lastMainId;

/** The number of events from the main thread that are awaited, which keep the program running. */
let awaitedMainEvents = 0;

/**
 * Starts receiving the events that the main thread posts, as `events.js` describes, calling
 * `handler` with each one. Throws unless Lean code runs on a worker, as `feature`, such as
 * "sockets", needs the main thread.
 */
export function onMainEvent(feature, handler) {
  if (channel === undefined) {
    throw new Error(`LeanScript: ${feature} are only supported when Lean code runs on a worker`);
  }
  channel.events.on("message", handler);
  channel.events.unref();
}

/**
 * Makes the request `type` of the main thread, with the arguments `args`, and blocks until it
 * replies. Returns the reply, or throws the error it reports.
 */
export const requestMain = (type, ...args) => request(type, ...args);

/**
 * Makes the request `type` of the main thread, with the arguments `args`, without waiting,
 * transferring the buffers in `transfer`. If `awaitsEvent`, notes that an event that answers it is
 * awaited, as `awaitMainEvent` does.
 */
export function postMain(type, args, { awaitsEvent = false, transfer = [] } = {}) {
  channel.port.postMessage({ type, args, noReply: true }, transfer);
  if (awaitsEvent) {
    awaitMainEvent();
  }
}

/**
 * Notes that an event from the main thread is awaited, so that the program keeps running until
 * `mainEventArrived` is called for it.
 */
export function awaitMainEvent() {
  if (awaitedMainEvents++ === 0) {
    channel.events.ref();
  }
}

/** Notes that an awaited event from the main thread has arrived, or will no longer be awaited. */
export function mainEventArrived() {
  if (--awaitedMainEvents === 0) {
    channel.events.unref();
  }
}

/** Changes the current directory of the process. */
export function changeDir(path) {
  if (channel === undefined) {
    process.chdir(path);
    return;
  }
  // Workers can't change the current directory, so ask the main thread to, and block until it has.
  // The directory belongs to the whole process, so the change is visible here too.
  request("chdir", path);
}

/**
 * Starts a child process, as `spawnChild` in `children.js` describes, and returns its ID, which
 * identifies it to the functions below, and its process ID.
 */
export const startChild = (cmd, args, cwd, env, stdio, setsid) =>
  request("spawnChild", cmd, args, cwd, env, stdio, setsid);

/** Blocks until the child `id` exits, and returns its exit code. */
export const awaitChild = (id) => request("waitChild", id);

/** Returns the exit code of the child `id`, or `null` if it is still running. */
export const pollChild = (id) => request("tryWaitChild", id);

/** Kills the child `id`, whose process ID is `pid`, or its process group if `setsid` is true. */
export const terminateChild = (id, pid, setsid) => request("killChild", id, pid, setsid);

/**
 * Reads up to `length` bytes of the output of the child `id` on the stream `fd` (1 or 2), blocking
 * until there is at least one. Returns them as a `Uint8Array`, which is empty at the end of the
 * output.
 */
export const readFromChild = (id, fd, length) => request("readChild", id, fd, length);

/** Writes `bytes` to the standard input of the child `id`, blocking until the pipe takes them. */
export const writeToChild = (id, bytes) => request("writeChild", id, bytes);

/** Closes the program's end of the pipe to the stream `fd` of the child `id`. */
export const closeChildPipe = (id, fd) => post("closeChildPipe", id, fd);

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
