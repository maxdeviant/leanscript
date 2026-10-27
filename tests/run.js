// Compiles each `tests/fixtures/*.lean` program to JS, runs it with Node, and compares its stdout
// and exit code against the adjacent `.expected` and `.exitcode` files. A missing `.exitcode` file
// means the exit code must be 0. Programs run with reference counting debug checks enabled, and a
// leak or other runtime error reported on stderr fails the test.
//
// With `--bless`, instead regenerates those files by compiling each program with native Lean and
// running it. (`lean --run` is not used because it skips the main module's initializers.)
//
// Usage: node tests/run.js [--bless] [name...]

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const fixtures = join(root, "tests", "fixtures");
// Compiled output must live inside this package so that `leanscript/runtime` resolves.
const outDir = join(root, ".lake", "build", "tests");
const nativeDir = join(outDir, "native");
const compiler = join(root, ".lake", "build", "bin", "leanscript");

const args = process.argv.slice(2);
const bless = args.includes("--bless");
const only = args.filter((arg) => arg !== "--bless");
const names = readdirSync(fixtures)
  .filter((file) => file.endsWith(".lean"))
  .map((file) => file.slice(0, -".lean".length))
  .filter((name) => only.length === 0 || only.includes(name))
  .sort();

if (bless) {
  mkdirSync(nativeDir, { recursive: true });
}

let failures = 0;
for (const name of names) {
  const input = join(fixtures, `${name}.lean`);
  const output = join(outDir, `${name}.mjs`);
  const expectedFile = join(fixtures, `${name}.expected`);
  const exitCodeFile = join(fixtures, `${name}.exitcode`);

  if (bless) {
    const nativeExe = join(nativeDir, name);
    execFileSync("lean", ["-c", `${nativeExe}.c`, input], { stdio: "inherit" });
    execFileSync("leanc", ["-o", nativeExe, `${nativeExe}.c`], { stdio: "inherit" });
    const native = spawnSync(nativeExe, { encoding: "utf8" });
    writeFileSync(expectedFile, native.stdout);
    if (native.status === 0) {
      rmSync(exitCodeFile, { force: true });
    } else {
      writeFileSync(exitCodeFile, `${native.status}\n`);
    }
    console.log(`blessed ${name} (exit ${native.status})`);
    continue;
  }

  try {
    execFileSync(compiler, ["compile", input, "-o", output], { stdio: "pipe" });
  } catch (err) {
    failures++;
    console.log(`FAIL ${name} (compile)\n${err.stderr}`);
    continue;
  }

  const run = spawnSync(process.execPath, [output], {
    encoding: "utf8",
    env: { ...process.env, LEANSCRIPT_DEBUG_RC: "1" },
  });
  const expected = existsSync(expectedFile) ? readFileSync(expectedFile, "utf8") : "";
  const expectedStatus = existsSync(exitCodeFile) ? Number(readFileSync(exitCodeFile, "utf8")) : 0;
  if (
    run.status !== expectedStatus ||
    run.stdout !== expected ||
    run.stderr.includes("LeanScript: ")
  ) {
    failures++;
    console.log(`FAIL ${name} (exit ${run.status}, expected ${expectedStatus})`);
    console.log(`--- expected\n${expected}--- actual\n${run.stdout}--- stderr\n${run.stderr}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

if (!bless) {
  console.log(`\n${names.length - failures}/${names.length} passed`);
}
process.exitCode = failures === 0 ? 0 : 1;
