// Child processes, `IO.Process.spawn` and `IO.Process.Child`.
//
// Each extern follows the C runtime's `process.cpp` on POSIX, including the errors it reports. The
// main thread runs the children, as `children.js` describes.

import { Ctor1, Ctor2, Ctor3, dec, inc } from "../../core.js";
import { attempt } from "../../io.js";
import { Handle } from "./handle.js";
import {
  awaitChild,
  closeChildPipe,
  pollChild,
  readFromChild,
  startChild,
  terminateChild,
  writeToChild,
} from "./host.js";

const STREAM_NAMES = ["input", "output", "error"];

/** The `IO.Process.Stdio` that makes a stream a pipe. */
const PIPED = 0;

const systemError = (code) => Object.assign(new Error(code), { code });

/**
 * The program's end of a pipe to the standard stream `fd` of a child process, as an
 * `IO.FS.Handle`. Closing the handle closes the pipe.
 */
class ChildPipe extends Handle {
  constructor(id, fd) {
    super(undefined, false);
    this.id = id;
    this.childFd = fd;
  }

  describe() {
    return `pipe to the standard ${STREAM_NAMES[this.childFd]} of child process ${this.id}`;
  }

  finalize() {
    closeChildPipe(this.id, this.childFd);
  }

  isTty() {
    return false;
  }

  readFile(buffer, offset, length) {
    // Like reading from the write end of a pipe.
    if (this.childFd === 0) {
      throw systemError("EBADF");
    }
    const bytes = readFromChild(this.id, this.childFd, length);
    buffer.set(bytes, offset);
    return bytes.length;
  }

  writeFile(bytes) {
    // Like writing to the read end of a pipe.
    if (this.childFd !== 0) {
      throw systemError("EBADF");
    }
    writeToChild(this.id, bytes);
  }

  truncateFile(_length) {
    // Like `ftruncate` on a pipe.
    throw systemError("EINVAL");
  }
}

/**
 * Returns the JS string of the borrowed Lean string `s` as a C string sees it, up to its first NUL
 * character.
 */
const cString = (s) => s.toString().split("\0")[0];

/** Returns whether `setenv` and `unsetenv` reject the environment variable name `name`. */
const isInvalidEnvName = (name) => name === "" || name.includes("=");

/**
 * Returns the environment of a child, which is the program's own if `inherit` is true, and
 * otherwise empty, as changed by the borrowed `Array (String × Option String)` `changes`.
 */
function childEnv(inherit, changes) {
  const env = inherit ? { ...process.env } : {};
  for (const change of changes) {
    const name = cString(change.f0);
    // The child calls `setenv` or `unsetenv` for each change, ignoring any that fail.
    if (isInvalidEnvName(name)) {
      continue;
    }
    const value = change.f1;
    if (value === 0) {
      delete env[name];
    } else {
      env[name] = cString(value.f0);
    }
  }
  return env;
}

/** Returns the `IO.Process.Child` with the given pipes and the child's process information. */
const mkChild = (stdin, stdout, stderr, pid, setsid, id) => {
  const child = new Ctor3(0, stdin, stdout, stderr);
  child[PID] = pid;
  child[SETSID] = setsid;
  child[ID] = id;
  return child;
};

/**
 * The scalar fields of an `IO.Process.Child` hold its process ID and whether it was started in a
 * new session, as in the C runtime, and its ID in `children.js`.
 */
const PID = "s24";
const SETSID = "s28";
const ID = "s32";

const IO_Process_spawn = (args, _w) => {
  const { f0: stdioConfig, f1: cmd, f2: argv, f3: cwd, f4: env } = args;
  const stdio = [stdioConfig.s0, stdioConfig.s1, stdioConfig.s2];
  const setsid = args.s41 === 1;
  const result = attempt(undefined, () => {
    const { id, pid } = startChild(
      cString(cmd),
      argv.map(cString),
      cwd === 0 ? undefined : cString(cwd.f0),
      childEnv(args.s40 === 1, env),
      stdio,
      setsid,
    );
    const pipes = stdio.map((mode, fd) => (mode === PIPED ? new ChildPipe(id, fd) : 0));
    return mkChild(...pipes, pid, setsid ? 1 : 0, id);
  });
  dec(args);
  return result;
};
export { IO_Process_spawn as "IO.Process.spawn" };

const IO_Process_Child_wait = (_cfg, child, _w) => attempt(undefined, () => awaitChild(child[ID]));
export { IO_Process_Child_wait as "IO.Process.Child.wait" };

const IO_Process_Child_tryWait = (_cfg, child, _w) =>
  attempt(undefined, () => {
    const exitCode = pollChild(child[ID]);
    return exitCode === null ? 0 : new Ctor1(1, exitCode);
  });
export { IO_Process_Child_tryWait as "IO.Process.Child.tryWait" };

const IO_Process_Child_kill = (_cfg, child, _w) =>
  attempt(undefined, () => terminateChild(child[ID], child[PID], child[SETSID] === 1));
export { IO_Process_Child_kill as "IO.Process.Child.kill" };

const IO_Process_Child_takeStdin = (_cfg, child, _w) => {
  const { f0: stdin, f1: stdout, f2: stderr } = child;
  inc(stdin);
  inc(stdout);
  inc(stderr);
  const rest = mkChild(0, stdout, stderr, child[PID], child[SETSID], child[ID]);
  dec(child);
  return attempt(undefined, () => new Ctor2(0, stdin, rest));
};
export { IO_Process_Child_takeStdin as "IO.Process.Child.takeStdin" };

const IO_Process_Child_pid = (_cfg, child) => {
  const pid = child[PID];
  dec(child);
  return pid;
};
export { IO_Process_Child_pid as "IO.Process.Child.pid" };
