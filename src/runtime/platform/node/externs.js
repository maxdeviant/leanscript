// The externs whose implementation depends on the platform, implemented with Node's APIs.

import { markPersistent } from "../../core.js";
import { mkStream, stdStreamExterns } from "../../stream.js";
import { externs as fsExterns, Handle } from "./fs.js";
import { exitProcess, processId } from "./host.js";

const stdStream = (fd) => mkStream(markPersistent(new Handle(fd, false)));

export const externs = {
  ...fsExterns,
  ...stdStreamExterns("Stdin", stdStream(0)),
  ...stdStreamExterns("Stdout", stdStream(1)),
  ...stdStreamExterns("Stderr", stdStream(2)),
  "IO.Process.getPID": (_w) => processId(),
  "IO.Process.exit": (_α, code, _w) => exitProcess(code),
  "IO.Process.forceExit": (_α, code, _w) => exitProcess(code),
};
