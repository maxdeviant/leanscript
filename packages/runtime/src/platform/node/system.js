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

const Std_Internal_UV_System_getProcessTitle = (_w) => ioOk(mkString(processTitle()));
export { Std_Internal_UV_System_getProcessTitle as "Std.Internal.UV.System.getProcessTitle" };

const Std_Internal_UV_System_setProcessTitle = (title, _w) =>
  nulError(title) ?? attempt(undefined, () => setProcessTitle(title.toString()));
export { Std_Internal_UV_System_setProcessTitle as "Std.Internal.UV.System.setProcessTitle" };

const Std_Internal_UV_System_uptime = (_w) => attempt(undefined, () => uint64(systemUptime()));
export { Std_Internal_UV_System_uptime as "Std.Internal.UV.System.uptime" };

const Std_Internal_UV_System_osGetPid = (_w) => ioOk(BigInt(processId()));
export { Std_Internal_UV_System_osGetPid as "Std.Internal.UV.System.osGetPid" };

const Std_Internal_UV_System_osGetPpid = (_w) => ioOk(BigInt(parentProcessId()));
export { Std_Internal_UV_System_osGetPpid as "Std.Internal.UV.System.osGetPpid" };

const Std_Internal_UV_System_cpuInfo = (_w) =>
  attempt(undefined, () => mkArray(cpuInfo().map(cpu)));
export { Std_Internal_UV_System_cpuInfo as "Std.Internal.UV.System.cpuInfo" };

const Std_Internal_UV_System_cwd = (_w) => attempt(undefined, () => mkString(currentDir()));
export { Std_Internal_UV_System_cwd as "Std.Internal.UV.System.cwd" };

const Std_Internal_UV_System_chdir = (path, _w) =>
  nulError(path) ?? attempt(path, () => changeDir(path.toString()));
export { Std_Internal_UV_System_chdir as "Std.Internal.UV.System.chdir" };

const Std_Internal_UV_System_osHomedir = (_w) => attempt(undefined, () => mkString(homeDir()));
export { Std_Internal_UV_System_osHomedir as "Std.Internal.UV.System.osHomedir" };

const Std_Internal_UV_System_osTmpdir = (_w) => attempt(undefined, () => mkString(tempDir()));
export { Std_Internal_UV_System_osTmpdir as "Std.Internal.UV.System.osTmpdir" };

const Std_Internal_UV_System_osGetPasswd = (_w) => attempt(undefined, () => passwd(userInfo()));
export { Std_Internal_UV_System_osGetPasswd as "Std.Internal.UV.System.osGetPasswd" };

const Std_Internal_UV_System_osEnviron = (_w) =>
  ioOk(
    mkArray(
      environment().map(([name, value]) => mkCtor(0, [mkString(name), mkString(value)], null)),
    ),
  );
export { Std_Internal_UV_System_osEnviron as "Std.Internal.UV.System.osEnviron" };

const Std_Internal_UV_System_osGetenv = (name, _w) => {
  const s = name.toString();
  // A name with a NUL character can't be set, so it is reported as unset.
  const value = s.includes("\0") ? undefined : getEnv(s);
  return ioOk(value === undefined ? 0 : some(mkString(value)));
};
export { Std_Internal_UV_System_osGetenv as "Std.Internal.UV.System.osGetenv" };

const Std_Internal_UV_System_osSetenv = (name, value, _w) => {
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
};
export { Std_Internal_UV_System_osSetenv as "Std.Internal.UV.System.osSetenv" };

const Std_Internal_UV_System_osUnsetenv = (name, _w) => {
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
};
export { Std_Internal_UV_System_osUnsetenv as "Std.Internal.UV.System.osUnsetenv" };

const Std_Internal_UV_System_osGetHostname = (_w) => attempt(undefined, () => mkString(hostname()));
export { Std_Internal_UV_System_osGetHostname as "Std.Internal.UV.System.osGetHostname" };

const Std_Internal_UV_System_osGetPriority = (pid, _w) =>
  attempt(undefined, () => BigInt.asUintN(64, BigInt(processPriority(toPid(pid)))));
export { Std_Internal_UV_System_osGetPriority as "Std.Internal.UV.System.osGetPriority" };

const Std_Internal_UV_System_osSetPriority = (pid, priority, _w) => {
  // The C runtime passes the priority as an `int`, which libuv checks is in range.
  const p = Number(BigInt.asIntN(32, priority));
  if (p < -20 || p > 19) {
    return invalidArgument(undefined);
  }
  return attempt(undefined, () => setProcessPriority(toPid(pid), p));
};
export { Std_Internal_UV_System_osSetPriority as "Std.Internal.UV.System.osSetPriority" };

const Std_Internal_UV_System_osUname = (_w) =>
  attempt(undefined, () => {
    const { sysname, release, version, machine } = systemName();
    return mkCtor(0, [sysname, release, version, machine].map(mkString), null);
  });
export { Std_Internal_UV_System_osUname as "Std.Internal.UV.System.osUname" };

const Std_Internal_UV_System_getrusage = (_w) => attempt(undefined, () => rusage(resourceUsage()));
export { Std_Internal_UV_System_getrusage as "Std.Internal.UV.System.getrusage" };

const Std_Internal_UV_System_exePath = (_w) => ioOk(mkString(executablePath()));
export { Std_Internal_UV_System_exePath as "Std.Internal.UV.System.exePath" };

const Std_Internal_UV_System_freeMemory = (_w) => ioOk(uint64(freeMemory()));
export { Std_Internal_UV_System_freeMemory as "Std.Internal.UV.System.freeMemory" };

const Std_Internal_UV_System_totalMemory = (_w) => ioOk(uint64(totalMemory()));
export { Std_Internal_UV_System_totalMemory as "Std.Internal.UV.System.totalMemory" };

const Std_Internal_UV_System_constrainedMemory = (_w) => ioOk(uint64(constrainedMemory()));
export { Std_Internal_UV_System_constrainedMemory as "Std.Internal.UV.System.constrainedMemory" };

const Std_Internal_UV_System_availableMemory = (_w) => ioOk(uint64(availableMemory()));
export { Std_Internal_UV_System_availableMemory as "Std.Internal.UV.System.availableMemory" };
