// The externs whose implementation depends on the platform, implemented with Node's APIs.

import { Ctor, markPersistent } from "../../core.js";
import { mkArray } from "../../array.js";
import { attempt, ioOk } from "../../io.js";
import { parseIPv4, parseIPv6 } from "../../net.js";
import { mkStream, stdStreamExterns } from "../../stream.js";
import { mkString } from "../../string.js";
import { externs as fsExterns, Handle } from "./fs.js";
import { externs as processExterns } from "./process.js";
import { externs as systemExterns } from "./system.js";
import { executablePath, exitProcess, interfaceAddresses, processId } from "./host.js";

const stdStream = (fd) => mkStream(markPersistent(new Handle(fd, false)));

/** Returns a `Std.Net.IPAddr` for the address `s` of the family `"IPv4"` or `"IPv6"`. */
const ipAddr = (family, s) =>
  family === "IPv4"
    ? new Ctor(0, [mkArray(parseIPv4(s))], null)
    : new Ctor(1, [mkArray(parseIPv6(s))], null);

/** Returns a `Std.Net.InterfaceAddress` for an address of the interface `name`. */
const interfaceAddress = (name, a) =>
  new Ctor(
    0,
    [
      mkString(name),
      mkArray(a.mac.split(":").map((octet) => parseInt(octet, 16))),
      ipAddr(a.family, a.address),
      ipAddr(a.family, a.netmask),
    ],
    { 32: a.internal ? 1 : 0 },
  );

export const externs = {
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
