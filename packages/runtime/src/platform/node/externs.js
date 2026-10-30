// The externs whose implementation depends on the platform, implemented with Node's APIs.

import { markPersistent, mkCtor } from "../../core.js";
import { mkArray } from "../../array.js";
import { attempt, ioOk } from "../../io.js";
import { mkIpAddr } from "../../net.js";
import { mkStream, stdStreamExterns } from "../../stream.js";
import { mkString } from "../../string.js";
import { externs as dnsExterns } from "./dns.js";
import { externs as fsExterns, Handle } from "./fs.js";
import { externs as processExterns } from "./process.js";
import { externs as systemExterns } from "./system.js";
import { executablePath, exitProcess, interfaceAddresses, processId } from "./host.js";

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

export const externs = {
  ...dnsExterns,
  ...fsExterns,
  ...processExterns,
  ...systemExterns,
  ...stdStreamExterns("Stdin", stdStream(0)),
  ...stdStreamExterns("Stdout", stdStream(1)),
  ...stdStreamExterns("Stderr", stdStream(2)),
  "IO.appPath": (_w) => ioOk(mkString(executablePath())),
  "Std.Net.interfaceAddresses": (_w) =>
    attempt(undefined, () =>
      mkArray(interfaceAddresses().map(([name, a]) => interfaceAddress(name, a))),
    ),
  "IO.Process.getPID": (_w) => processId(),
  "IO.Process.exit": (_α, code, _w) => exitProcess(code),
  "IO.Process.forceExit": (_α, code, _w) => exitProcess(code),
};
