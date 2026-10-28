// Child processes, which the main thread runs on behalf of the thread that runs Lean code.
//
// That thread blocks while it waits for a child, so only the main thread's event loop can run the
// child's streams. The main thread reads the child's output as soon as it is written, so a child
// never blocks on a full pipe because the program is reading its other output stream first.
//
// Each function returns its result, or a promise of it, for the thread that asked for it, and
// follows the C runtime's `process.cpp` on POSIX, including the errors it reports.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";

/** The modes of `child_process.spawn` for each `IO.Process.Stdio`. */
const stdioModes = ["pipe", "inherit", "ignore"];

/**
 * The exit code of a child that could not change to its working directory or execute its command,
 * which the C runtime reports from the child itself, after the fork, as `_exit(-1)`.
 */
const FAILED_EXIT_CODE = 255;

/**
 * The errors that the C runtime reports from `spawn` itself, as they happen before the fork. Any
 * other error is the child failing to change directory or execute its command.
 */
const spawnErrors = new Set(["EAGAIN", "EMFILE", "ENFILE", "ENOMEM"]);

const systemError = (code) => Object.assign(new Error(code), { code });

/** The output of a child on one of its streams, buffered until it is read. */
class Output {
  /** @param {import("node:stream").Readable | null} stream */
  constructor(stream) {
    this.stream = stream;
    this.chunks = [];
    this.ended = stream === null;
    /** The function to call once there is more output, or `null` if nothing is waiting for any. */
    this.waiter = null;
    stream?.on("data", (chunk) => {
      this.chunks.push(chunk);
      this.wake();
    });
    // An error, such as one reading from the pipe, ends the output, as it does for `fread`.
    stream?.on("error", () => this.end());
    stream?.on("end", () => this.end());
  }

  end() {
    this.ended = true;
    this.wake();
  }

  wake() {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }

  /**
   * Returns up to `length` bytes, waiting until there is at least one, or none at the end of the
   * output.
   */
  read(length) {
    if (this.chunks.length === 0) {
      if (this.ended) {
        return new Uint8Array(0);
      }
      return new Promise((resolve) => {
        this.waiter = () => resolve(this.read(length));
      });
    }
    const bytes = new Uint8Array(
      Math.min(
        length,
        this.chunks.reduce((n, c) => n + c.length, 0),
      ),
    );
    let size = 0;
    while (size < bytes.length) {
      const chunk = this.chunks[0];
      const n = Math.min(chunk.length, bytes.length - size);
      bytes.set(chunk.subarray(0, n), size);
      size += n;
      if (n === chunk.length) {
        this.chunks.shift();
      } else {
        this.chunks[0] = chunk.subarray(n);
      }
    }
    return bytes;
  }

  /** Stops reading the output, as when the program closes its end of the pipe. */
  close() {
    this.stream?.destroy();
    this.chunks = [];
    this.end();
  }
}

/** A child process that has not both been waited for and had all of its pipes closed. */
class Child {
  /**
   * @param {import("node:child_process").ChildProcess | null} proc `null` for a child that
   *   failed to start, which has already exited.
   */
  constructor(proc, stdout, stderr) {
    this.proc = proc;
    this.stdin = proc?.stdin ?? null;
    this.stdout = stdout;
    this.stderr = stderr;
    /** Which of `stdin`, `stdout`, and `stderr` are pipes that the program has not closed. */
    this.open = [this.stdin !== null, stdout.stream !== null, stderr.stream !== null];
    /** The exit code, once the child has exited. */
    this.exitCode = proc === null ? FAILED_EXIT_CODE : undefined;
    /** Whether the program has waited for the child, which only the C runtime's `waitpid` can do once. */
    this.reaped = false;
    /** The functions to call once the child exits. */
    this.waiters = [];
    proc?.on("exit", (code, signal) => {
      // Like the C runtime, a child that was killed by a signal reports bash's exit code for it.
      this.exitCode = code ?? 128 + os.constants.signals[signal];
      for (const waiter of this.waiters.splice(0)) {
        waiter();
      }
    });
  }
}

/** The children, by the ID they were registered with. */
const children = new Map();

let nextId = 1;

/** Registers `child`, and returns its ID and process ID. */
function register(child) {
  const id = nextId++;
  children.set(id, child);
  return { id, pid: child.proc?.pid ?? 0 };
}

/** Forgets the child `id` once nothing can ask for anything more about it than that it was reaped. */
function maybeForget(id) {
  const child = children.get(id);
  if (child.reaped && !child.open.includes(true)) {
    children.delete(id);
  }
}

/** Returns whether the process could change its working directory to `path`. */
function isUsableDir(path) {
  try {
    fs.accessSync(path, fs.constants.X_OK);
    return fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Registers a child that failed to change to its working directory or execute its command, which
 * in the C runtime reports the failure on its standard error before it exits.
 */
function failed(cmd, cwd, stdio) {
  const message =
    cwd !== undefined && !isUsableDir(cwd)
      ? `could not change directory to ${cwd}\n`
      : `could not execute external process '${cmd}'\n`;
  const stderr = new Output(null);
  if (stdio[2] === 1) {
    fs.writeSync(2, message);
  } else if (stdio[2] === 0) {
    stderr.chunks.push(Buffer.from(message));
  }
  const child = new Child(null, new Output(null), stderr);
  // The pipes of a child that has exited are closed, but the program still has its end of them.
  child.open = stdio.map((mode) => mode === 0);
  return register(child);
}

/**
 * Starts the command `cmd` with the arguments `args`, in the working directory `cwd`, or the
 * current one if it is `undefined`, with the environment `env`. `stdio` holds the
 * `IO.Process.Stdio` of each standard stream, and `setsid` whether to start the child in a new
 * session. Returns the child's ID and process ID, which is 0 if it failed to start.
 */
export function spawnChild(cmd, args, cwd, env, stdio, setsid) {
  // `child_process.spawn` rejects an empty command, which `execvp` fails to find.
  if (cmd === "") {
    return failed(cmd, cwd, stdio);
  }
  return new Promise((resolve, reject) => {
    const fail = (err) =>
      spawnErrors.has(err.code) ? reject(err) : resolve(failed(cmd, cwd, stdio));
    let proc;
    try {
      proc = spawn(cmd, args, {
        cwd,
        env,
        stdio: stdio.map((m) => stdioModes[m]),
        detached: setsid,
      });
    } catch (err) {
      fail(err);
      return;
    }
    proc.once("error", fail);
    proc.once("spawn", () => {
      proc.off("error", fail);
      // Like a native child, which outlives the program, this one doesn't keep it running.
      proc.unref();
      for (const stream of [proc.stdin, proc.stdout, proc.stderr]) {
        stream?.unref?.();
      }
      // Errors writing to the child's input are reported to the writer.
      proc.stdin?.on("error", () => {});
      proc.on("error", () => {});
      resolve(register(new Child(proc, new Output(proc.stdout), new Output(proc.stderr))));
    });
  });
}

/** Returns the exit code of the child `id`, once it has exited. */
export function waitChild(id) {
  const child = children.get(id);
  if (child === undefined || child.reaped) {
    throw systemError("ECHILD");
  }
  const reap = () => {
    child.reaped = true;
    maybeForget(id);
    return child.exitCode;
  };
  if (child.exitCode !== undefined) {
    return reap();
  }
  return new Promise((resolve) => child.waiters.push(() => resolve(reap())));
}

/** Returns the exit code of the child `id` if it has exited, or `null` if it is still running. */
export function tryWaitChild(id) {
  const child = children.get(id);
  if (child === undefined || child.reaped) {
    throw systemError("ECHILD");
  }
  if (child.exitCode === undefined) {
    return null;
  }
  child.reaped = true;
  maybeForget(id);
  return child.exitCode;
}

/**
 * Kills the child `id`, whose process ID is `pid`, with `SIGKILL`, or its whole process group if it
 * was started in a new session.
 */
export function killChild(id, pid, setsid) {
  const child = children.get(id);
  // Node reaps a child as soon as it exits, but natively it remains until it is waited for, and
  // killing it in the meantime succeeds.
  const isZombie = child !== undefined && !child.reaped && child.exitCode !== undefined;
  if (setsid) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (err) {
      if (!(isZombie && err.code === "ESRCH")) {
        throw err;
      }
    }
    return;
  }
  if (child === undefined || child.reaped) {
    throw systemError("ESRCH");
  }
  if (!isZombie) {
    process.kill(pid, "SIGKILL");
  }
}

/** Returns up to `length` bytes of the output of the child `id` on the stream `fd` (1 or 2). */
export function readChild(id, fd, length) {
  const child = children.get(id);
  return (fd === 1 ? child.stdout : child.stderr).read(length);
}

/** Writes `bytes` to the standard input of the child `id`, once the pipe has taken them. */
export function writeChild(id, bytes) {
  const { stdin } = children.get(id);
  // Node destroys the pipe once the child closes its end, or if it failed to start.
  if (stdin === null || stdin.destroyed) {
    throw systemError("EPIPE");
  }
  return new Promise((resolve, reject) => {
    stdin.write(bytes, (err) => {
      if (err?.code === "ERR_STREAM_DESTROYED") {
        reject(systemError("EPIPE"));
      } else if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/** Closes the program's end of the pipe to the stream `fd` of the child `id`. */
export function closeChildPipe(id, fd) {
  const child = children.get(id);
  if (fd === 0) {
    child.stdin?.end();
  } else {
    (fd === 1 ? child.stdout : child.stderr).close();
  }
  child.open[fd] = false;
  maybeForget(id);
}
