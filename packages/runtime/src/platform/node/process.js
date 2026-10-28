// Child processes, `IO.Process.spawn` and `IO.Process.Child`.
//
// Each extern follows the C runtime's `process.cpp` on POSIX, including the errors it reports. The
// main thread runs the children, as `children.js` describes.

import { Ctor, dec, inc } from "../../core.js";
import { attempt } from "../../io.js";
import { Handle } from "./fs.js";
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
    const name = cString(change.f[0]);
    // The child calls `setenv` or `unsetenv` for each change, ignoring any that fail.
    if (isInvalidEnvName(name)) {
      continue;
    }
    const value = change.f[1];
    if (value === 0) {
      delete env[name];
    } else {
      env[name] = cString(value.f[0]);
    }
  }
  return env;
}

/** Returns the `IO.Process.Child` with the given pipes and the child's process information. */
const mkChild = (stdin, stdout, stderr, scalars) => new Ctor(0, [stdin, stdout, stderr], scalars);

/**
 * The scalar fields of an `IO.Process.Child` hold its process ID and whether it was started in a
 * new session, as in the C runtime, and its ID in `children.js`.
 */
const PID = 24;
const SETSID = 28;
const ID = 32;

export const externs = {
  "IO.Process.spawn": (args, _w) => {
    const [stdioConfig, cmd, argv, cwd, env] = args.f;
    const stdio = [0, 1, 2].map((i) => stdioConfig.s[i]);
    const setsid = args.s[41] === 1;
    const result = attempt(undefined, () => {
      const { id, pid } = startChild(
        cString(cmd),
        argv.map(cString),
        cwd === 0 ? undefined : cString(cwd.f[0]),
        childEnv(args.s[40] === 1, env),
        stdio,
        setsid,
      );
      const pipes = stdio.map((mode, fd) => (mode === PIPED ? new ChildPipe(id, fd) : 0));
      return mkChild(...pipes, { [PID]: pid, [SETSID]: setsid ? 1 : 0, [ID]: id });
    });
    dec(args);
    return result;
  },
  "IO.Process.Child.wait": (_cfg, child, _w) => attempt(undefined, () => awaitChild(child.s[ID])),
  "IO.Process.Child.tryWait": (_cfg, child, _w) =>
    attempt(undefined, () => {
      const exitCode = pollChild(child.s[ID]);
      return exitCode === null ? 0 : new Ctor(1, [exitCode], null);
    }),
  "IO.Process.Child.kill": (_cfg, child, _w) =>
    attempt(undefined, () => terminateChild(child.s[ID], child.s[PID], child.s[SETSID] === 1)),
  "IO.Process.Child.takeStdin": (_cfg, child, _w) => {
    const [stdin, stdout, stderr] = child.f;
    inc(stdin);
    inc(stdout);
    inc(stderr);
    const rest = mkChild(0, stdout, stderr, { ...child.s });
    dec(child);
    return attempt(undefined, () => new Ctor(0, [stdin, rest], null));
  },
  "IO.Process.Child.pid": (_cfg, child) => {
    const pid = child.s[PID];
    dec(child);
    return pid;
  },
};
