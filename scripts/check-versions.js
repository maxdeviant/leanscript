// Fails unless every part of LeanScript has the same version: the compiler, the Lake package, the
// runtime, and the npm packages. The runtime only runs programs compiled by the same version.
//
// Also fails unless the version of Lean that the runtime reports is the toolchain's.
//
// Usage: node scripts/check-versions.js

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { version as runtimeVersion } from "@leanscript/runtime";
import { leanVersion } from "../packages/runtime/src/misc.js";

const root = join(import.meta.dirname, "..");
const read = (...path) => readFileSync(join(root, ...path), "utf8");

/** Returns the first group of `pattern` in the file at `path`, or throws if it doesn't match. */
function match(pattern, ...path) {
  const m = read(...path).match(pattern);
  if (m === null) {
    throw new Error(`no version in ${join(...path)}`);
  }
  return m[1];
}

const versions = {
  "src/LeanScript/Version.lean": match(
    /def version : String := "(.*)"/,
    "src",
    "LeanScript",
    "Version.lean",
  ),
  "lakefile.toml": match(/^version = "(.*)"$/m, "lakefile.toml"),
  "packages/runtime/src/index.js": runtimeVersion,
};
for (const pkg of ["runtime", "vite-plugin"]) {
  const path = join("packages", pkg, "package.json");
  versions[path] = JSON.parse(read(path)).version;
}

const distinct = new Set(Object.values(versions));
if (distinct.size !== 1) {
  console.error("The versions of LeanScript's parts differ:");
  for (const [path, version] of Object.entries(versions)) {
    console.error(`  ${path}: ${version}`);
  }
  process.exitCode = 1;
}

const toolchain = read("lean-toolchain").trim();
const { major, minor, patch, isRelease, specialDesc, githash } = leanVersion;
const reported = `leanprover/lean4:v${major}.${minor}.${patch}${isRelease ? "" : `-${specialDesc}`}`;
const toolchainGithash = execFileSync("lean", ["--githash"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (reported !== toolchain || githash !== toolchainGithash) {
  console.error(
    `The runtime reports Lean ${reported} (${githash}), but the toolchain is ${toolchain} (${toolchainGithash}); update \`leanVersion\` in packages/runtime/src/misc.js`,
  );
  process.exitCode = 1;
}
