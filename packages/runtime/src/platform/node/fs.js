// File system operations.

import { dec, inc, mkCtor } from "../../core.js";
import { mkArray } from "../../array.js";
import { attempt } from "../../io.js";
import { normalize } from "../../nat.js";
import { decodeLossy } from "../../stream.js";
import { mkString } from "../../string.js";
import { Handle } from "./handle.js";
import {
  changeDir,
  currentDir,
  fileMetadata,
  hardLink,
  isRegularFile,
  makeDir,
  makeTempDir,
  makeTempFile,
  openFile,
  readDirNames,
  realPath,
  removeDir,
  removeFile,
  renamePath,
  setMode,
} from "./host.js";

/** The `fopen` mode of each `IO.FS.Mode`. */
const openFlags = ["r", "w", "wx", "r+", "a"];

/** The `IO.FS.FileType` of each file type reported by the platform. */
const fileTypes = { dir: 0, file: 1, symlink: 2, other: 3 };

const NANOS_PER_SECOND = 1000000000n;

/** Returns an `IO.FS.SystemTime` for a time given in nanoseconds since the epoch. */
function systemTime(ns) {
  let sec = ns / NANOS_PER_SECOND;
  let nsec = ns % NANOS_PER_SECOND;
  if (nsec < 0n) {
    sec -= 1n;
    nsec += NANOS_PER_SECOND;
  }
  return mkCtor(0, [normalize(sec)], { 8: Number(nsec) });
}

/** Returns an `IO.FS.Metadata` for the file at the borrowed path `p`, as an `EST.Out`. */
function metadata(p, follow) {
  return attempt(p, () => {
    const m = fileMetadata(p.toString(), follow);
    return mkCtor(0, [systemTime(m.accessedNs), systemTime(m.modifiedNs)], {
      16: m.size,
      24: m.numLinks,
      32: fileTypes[m.type],
    });
  });
}

const IO_FS_Handle_mk = (path, mode, _w) =>
  attempt(path, () => {
    const fd = openFile(path.toString(), openFlags[mode]);
    // Appends ignore the position, so there is no need to track it.
    return new Handle(fd, mode !== 4 && isRegularFile(fd));
  });
export { IO_FS_Handle_mk as "IO.FS.Handle.mk" };

const IO_FS_Handle_isTty = (h, _w) => (h.isTty() ? 1 : 0);
export { IO_FS_Handle_isTty as "IO.FS.Handle.isTty" };

const IO_FS_Handle_flush = (h, _w) => attempt(undefined, () => h.flush());
export { IO_FS_Handle_flush as "IO.FS.Handle.flush" };

const IO_FS_Handle_rewind = (h, _w) => attempt(undefined, () => h.rewind());
export { IO_FS_Handle_rewind as "IO.FS.Handle.rewind" };

const IO_FS_Handle_truncate = (h, _w) => attempt(undefined, () => h.truncate());
export { IO_FS_Handle_truncate as "IO.FS.Handle.truncate" };

const IO_FS_Handle_read = (h, n, _w) => attempt(undefined, () => h.read(n));
export { IO_FS_Handle_read as "IO.FS.Handle.read" };

const IO_FS_Handle_write = (h, b, _w) =>
  attempt(undefined, () => h.write(b.bytes.subarray(0, b.size)));
export { IO_FS_Handle_write as "IO.FS.Handle.write" };

const IO_FS_Handle_getLine = (h, _w) => attempt(undefined, () => decodeLossy(h.getLine()));
export { IO_FS_Handle_getLine as "IO.FS.Handle.getLine" };

const IO_FS_Handle_putStr = (h, s, _w) =>
  attempt(undefined, () => h.write(s.bytes.subarray(0, s.size)));
export { IO_FS_Handle_putStr as "IO.FS.Handle.putStr" };

const IO_FS_createDir = (p, _w) => attempt(p, () => makeDir(p.toString()));
export { IO_FS_createDir as "IO.FS.createDir" };

const IO_FS_removeFile = (p, _w) => attempt(p, () => removeFile(p.toString()));
export { IO_FS_removeFile as "IO.FS.removeFile" };

const IO_FS_removeDir = (p, _w) => attempt(p, () => removeDir(p.toString()));
export { IO_FS_removeDir as "IO.FS.removeDir" };

const IO_FS_rename = (from, to, _w) =>
  attempt(from, () => renamePath(from.toString(), to.toString()));
export { IO_FS_rename as "IO.FS.rename" };

const IO_FS_hardLink = (target, link, _w) =>
  attempt(target, () => hardLink(target.toString(), link.toString()));
export { IO_FS_hardLink as "IO.FS.hardLink" };

const IO_FS_realPath = (p, _w) => {
  const r = attempt(p, () => mkString(realPath(p.toString())));
  dec(p);
  return r;
};
export { IO_FS_realPath as "IO.FS.realPath" };

const IO_FS_createTempFile = (_w) =>
  attempt(undefined, () => {
    const { fd, path } = makeTempFile();
    return mkCtor(0, [new Handle(fd, true), mkString(path)], null);
  });
export { IO_FS_createTempFile as "IO.FS.createTempFile" };

const IO_FS_createTempDir = (_w) => attempt(undefined, () => mkString(makeTempDir()));
export { IO_FS_createTempDir as "IO.FS.createTempDir" };

const IO_Prim_setAccessRights = (p, mode, _w) => attempt(p, () => setMode(p.toString(), mode));
export { IO_Prim_setAccessRights as "IO.Prim.setAccessRights" };

const IO_currentDir = (_w) => attempt(undefined, () => mkString(currentDir()));
export { IO_currentDir as "IO.currentDir" };

const IO_Process_getCurrentDir = (_w) => attempt(undefined, () => mkString(currentDir()));
export { IO_Process_getCurrentDir as "IO.Process.getCurrentDir" };

const IO_Process_setCurrentDir = (p, _w) => attempt(p, () => changeDir(p.toString()));
export { IO_Process_setCurrentDir as "IO.Process.setCurrentDir" };

const System_FilePath_readDir = (p, _w) =>
  attempt(p, () =>
    mkArray(
      readDirNames(p.toString()).map((name) => {
        inc(p);
        return mkCtor(0, [p, decodeLossy(name)], null);
      }),
    ),
  );
export { System_FilePath_readDir as "System.FilePath.readDir" };

const System_FilePath_metadata = (p, _w) => metadata(p, true);
export { System_FilePath_metadata as "System.FilePath.metadata" };

const System_FilePath_symlinkMetadata = (p, _w) => metadata(p, false);
export { System_FilePath_symlinkMetadata as "System.FilePath.symlinkMetadata" };
