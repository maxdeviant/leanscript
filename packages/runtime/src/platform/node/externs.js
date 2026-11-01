// The externs whose implementation depends on the platform, implemented with Node's APIs.

import { markPersistent, mkCtor } from "../../core.js";
import { mkArray } from "../../array.js";
import { attempt, ioOk } from "../../io.js";
import { mkIpAddr } from "../../net.js";
import { mkStream, stdStreamExterns } from "../../stream.js";
import { mkString } from "../../string.js";
import { Handle } from "./handle.js";
import { executablePath, exitProcess, interfaceAddresses, processId } from "./host.js";

export * from "./dns.js";
export * from "./fs.js";
export * from "./process.js";
export * from "./signal.js";
export * from "./system.js";
export * from "./tcp.js";
export * from "./udp.js";

const stdStream = (fd) => mkStream(markPersistent(new Handle(fd, false)));

/** Returns a `Std.Net.InterfaceAddress` for an address of the interface `name`. */
const interfaceAddress = (name, a) =>
  mkCtor(
    0,
    [
      mkString(name),
      mkArray(a.mac.split(":").map((octet) => parseInt(octet, 16))),
      mkIpAddr(a.address),
      mkIpAddr(a.netmask),
    ],
    { 32: a.internal ? 1 : 0 },
  );

const { get: IO_getStdin, set: IO_setStdin } = stdStreamExterns(stdStream(0));
export { IO_getStdin as "IO.getStdin", IO_setStdin as "IO.setStdin" };

const { get: IO_getStdout, set: IO_setStdout } = stdStreamExterns(stdStream(1));
export { IO_getStdout as "IO.getStdout", IO_setStdout as "IO.setStdout" };

const { get: IO_getStderr, set: IO_setStderr } = stdStreamExterns(stdStream(2));
export { IO_getStderr as "IO.getStderr", IO_setStderr as "IO.setStderr" };

const IO_appPath = (_w) => ioOk(mkString(executablePath()));
export { IO_appPath as "IO.appPath" };

const Std_Net_interfaceAddresses = (_w) =>
  attempt(undefined, () =>
    mkArray(interfaceAddresses().map(([name, a]) => interfaceAddress(name, a))),
  );
export { Std_Net_interfaceAddresses as "Std.Net.interfaceAddresses" };

const IO_Process_getPID = (_w) => processId();
export { IO_Process_getPID as "IO.Process.getPID" };

const IO_Process_exit = (_α, code, _w) => exitProcess(code);
export { IO_Process_exit as "IO.Process.exit" };

const IO_Process_forceExit = (_α, code, _w) => exitProcess(code);
export { IO_Process_forceExit as "IO.Process.forceExit" };
