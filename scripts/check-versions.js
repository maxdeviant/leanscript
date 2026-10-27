// Fails unless every part of LeanScript has the same version: the compiler, the Lake package, the
// runtime, and the npm packages. The runtime only runs programs compiled by the same version.
//
// Usage: node scripts/check-versions.js

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { version as runtimeVersion } from "@leanscript/runtime";

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
