// `Std.Internal.UV.System`, which reports on and changes the process and the system.
//
// Each extern follows the C runtime's `uv/system.cpp`, including the errors it reports.

import { inc, mkCtor } from "../../core.js";
import { mkArray } from "../../array.js";
import { attempt, ioError, ioOk, mkIoError } from "../../io.js";
import { mkString } from "../../string.js";
import {
  availableMemory,
  changeDir,
  constrainedMemory,
  cpuInfo,
  currentDir,
  environment,
  getEnv,
  executablePath,
  freeMemory,
  homeDir,
  hostname,
  parentProcessId,
  processId,
  processPriority,
  processTitle,
  resourceUsage,
  setEnv,
  setProcessPriority,
  setProcessTitle,
  systemError,
  systemName,
  systemUptime,
  tempDir,
  totalMemory,
  unsetEnv,
  userInfo,
} from "./host.js";

const some = (x) => mkCtor(1, [x], null);

/** Returns a `UInt64` of the nonnegative JS number `n`, rounded down. */
const uint64 = (n) => BigInt(Math.floor(n));

/** Returns a failed `EST.Out` with an `EINVAL` error, for the borrowed file name `fname`, if any. */
function invalidArgument(fname, message) {
  const einval = systemError({ code: "EINVAL" });
  inc(fname);
  return ioError(mkIoError(message === undefined ? einval : { ...einval, message }, fname));
}

/**
 * Returns a failed `EST.Out`, like `mk_embedded_nul_error`, if the borrowed string `s` contains a NUL
 * character, which C strings can't, or `undefined` otherwise.
 */
const nulError = (s) =>
  s.toString().includes("\0") ? invalidArgument(s, "string contains NUL bytes") : undefined;

/** Returns whether `setenv` and `unsetenv` reject the environment variable name `name`. */
const isInvalidEnvName = (name) => name === "" || name.includes("=");

/** Returns a `Std.Internal.UV.System.CPUInfo` for a CPU in the form of `os.cpus()`. */
function cpu({ model, speed, times }) {
  const { user, nice, sys, idle, irq } = times;
  const t = mkCtor(0, [], {
    0: uint64(user),
    8: uint64(nice),
    16: uint64(sys),
    24: uint64(idle),
    32: uint64(irq),
  });
  return mkCtor(0, [mkString(model), t], { 16: uint64(speed) });
}

/** Returns a `Std.Internal.UV.System.RUsage` for usage in the form of `process.resourceUsage()`. */
function rusage(u) {
  const fields = [
    u.userCPUTime / 1000,
    u.systemCPUTime / 1000,
    u.maxRSS,
    u.sharedMemorySize,
    u.unsharedDataSize,
    u.unsharedStackSize,
    u.minorPageFault,
    u.majorPageFault,
    u.swappedOut,
    u.fsRead,
    u.fsWrite,
    u.ipcSent,
    u.ipcReceived,
    u.signalsCount,
    u.voluntaryContextSwitches,
    u.involuntaryContextSwitches,
  ];
  return mkCtor(0, [], Object.fromEntries(fields.map((n, i) => [i * 8, uint64(n)])));
}

/** Returns a `Std.Internal.UV.System.PasswdInfo` for a user in the form of `os.userInfo()`. */
function passwd({ username, uid, gid, shell, homedir }) {
  // Like the C runtime, which checks `uid` for both, both IDs are missing if `uid` is, on Windows.
  const hasIds = uid !== -1;
  return mkCtor(
    0,
    [
      mkString(username),
      hasIds ? some(BigInt(uid)) : 0,
      hasIds ? some(BigInt(gid)) : 0,
      shell === null ? 0 : some(mkString(shell)),
      homedir === null ? 0 : some(mkString(homedir)),
    ],
    null,
  );
}

/** Returns the `uv_pid_t` that the C runtime passes for the `UInt64` `pid`. */
const toPid = (pid) => Number(BigInt.asIntN(32, pid));

export const externs = {
  "Std.Internal.UV.System.getProcessTitle": (_w) => ioOk(mkString(processTitle())),
  "Std.Internal.UV.System.setProcessTitle": (title, _w) =>
    nulError(title) ?? attempt(undefined, () => setProcessTitle(title.toString())),
  "Std.Internal.UV.System.uptime": (_w) => attempt(undefined, () => uint64(systemUptime())),
  "Std.Internal.UV.System.osGetPid": (_w) => ioOk(BigInt(processId())),
  "Std.Internal.UV.System.osGetPpid": (_w) => ioOk(BigInt(parentProcessId())),
  "Std.Internal.UV.System.cpuInfo": (_w) => attempt(undefined, () => mkArray(cpuInfo().map(cpu))),
  "Std.Internal.UV.System.cwd": (_w) => attempt(undefined, () => mkString(currentDir())),
  "Std.Internal.UV.System.chdir": (path, _w) =>
    nulError(path) ?? attempt(path, () => changeDir(path.toString())),
  "Std.Internal.UV.System.osHomedir": (_w) => attempt(undefined, () => mkString(homeDir())),
  "Std.Internal.UV.System.osTmpdir": (_w) => attempt(undefined, () => mkString(tempDir())),
  "Std.Internal.UV.System.osGetPasswd": (_w) => attempt(undefined, () => passwd(userInfo())),
  "Std.Internal.UV.System.osEnviron": (_w) =>
    ioOk(
      mkArray(
        environment().map(([name, value]) => mkCtor(0, [mkString(name), mkString(value)], null)),
      ),
    ),
  "Std.Internal.UV.System.osGetenv": (name, _w) => {
    const s = name.toString();
    // A name with a NUL character can't be set, so it is reported as unset.
    const value = s.includes("\0") ? undefined : getEnv(s);
    return ioOk(value === undefined ? 0 : some(mkString(value)));
  },
  "Std.Internal.UV.System.osSetenv": (name, value, _w) => {
    const error = nulError(name) ?? nulError(value);
    if (error !== undefined) {
      return error;
    }
    const n = name.toString();
    if (isInvalidEnvName(n)) {
      return invalidArgument(undefined);
    }
    setEnv(n, value.toString());
    return ioOk(0);
  },
  "Std.Internal.UV.System.osUnsetenv": (name, _w) => {
    const error = nulError(name);
    if (error !== undefined) {
      return error;
    }
    const n = name.toString();
    if (isInvalidEnvName(n)) {
      return invalidArgument(undefined);
    }
    unsetEnv(n);
    return ioOk(0);
  },
  "Std.Internal.UV.System.osGetHostname": (_w) => attempt(undefined, () => mkString(hostname())),
  "Std.Internal.UV.System.osGetPriority": (pid, _w) =>
    attempt(undefined, () => BigInt.asUintN(64, BigInt(processPriority(toPid(pid))))),
  "Std.Internal.UV.System.osSetPriority": (pid, priority, _w) => {
    // The C runtime passes the priority as an `int`, which libuv checks is in range.
    const p = Number(BigInt.asIntN(32, priority));
    if (p < -20 || p > 19) {
      return invalidArgument(undefined);
    }
    return attempt(undefined, () => setProcessPriority(toPid(pid), p));
  },
  "Std.Internal.UV.System.osUname": (_w) =>
    attempt(undefined, () => {
      const { sysname, release, version, machine } = systemName();
      return mkCtor(0, [sysname, release, version, machine].map(mkString), null);
    }),
  "Std.Internal.UV.System.getrusage": (_w) => attempt(undefined, () => rusage(resourceUsage())),
  "Std.Internal.UV.System.exePath": (_w) => ioOk(mkString(executablePath())),
  "Std.Internal.UV.System.freeMemory": (_w) => ioOk(uint64(freeMemory())),
  "Std.Internal.UV.System.totalMemory": (_w) => ioOk(uint64(totalMemory())),
  "Std.Internal.UV.System.constrainedMemory": (_w) => ioOk(uint64(constrainedMemory())),
  "Std.Internal.UV.System.availableMemory": (_w) => ioOk(uint64(availableMemory())),
};
