// Compiles each `tests/fixtures/*.lean` program to JS, runs it with Node, and compares its stdout
// and exit code against the adjacent `.expected` and `.exitcode` files. A missing `.exitcode` file
// means the exit code must be 0. Programs run with reference counting debug checks enabled, and a
// leak or other runtime error reported on stderr fails the test.
//
// Each program runs in its own empty working directory, with the arguments in the adjacent `.args`
// file (one per line) and the contents of the adjacent `.stdin` file as standard input, if those
// files exist.
//
// Each program is also compiled for the browser target and run on the browser runtime, by running
// it under the `browser` export condition, where only its stdout is compared, as browsers have no
// exit codes. A program that uses externs that are unavailable in browsers must instead fail to
// compile for the browser target, with the error in the adjacent `.browser-error` file.
//
// With `--bless`, instead regenerates the `.expected` and `.exitcode` files by compiling each
// program with native Lean and running it (`lean --run` is not used because it skips the main
// module's initializers), and the `.browser-error` files by compiling each program for the browser
// target.
//
// A program with an adjacent `.js` file implements externs in JS, so it cannot run natively. Its
// `.expected` and `.exitcode` files are written by hand, and `--bless` leaves them alone.
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
const workDir = join(outDir, "work");
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
  const argsFile = join(fixtures, `${name}.args`);
  const stdinFile = join(fixtures, `${name}.stdin`);
  const browserErrorFile = join(fixtures, `${name}.browser-error`);
  const browserOutput = join(outDir, `${name}.browser.mjs`);
  const compileBrowser = () =>
    spawnSync(compiler, ["compile", input, "-o", browserOutput, "--target", "browser"], {
      encoding: "utf8",
    });
  const programArgs = existsSync(argsFile)
    ? readFileSync(argsFile, "utf8").split("\n").slice(0, -1)
    : [];
  const cwd = join(workDir, name);
  rmSync(cwd, { recursive: true, force: true });
  mkdirSync(cwd, { recursive: true });
  const runOptions = {
    cwd,
    encoding: "utf8",
    input: existsSync(stdinFile) ? readFileSync(stdinFile) : "",
  };

  if (bless) {
    if (existsSync(join(fixtures, `${name}.js`))) {
      console.log(`skipping native run of ${name}, which has JS externs`);
    } else {
      const nativeExe = join(nativeDir, name);
      execFileSync("lean", ["-c", `${nativeExe}.c`, input], { stdio: "inherit" });
      execFileSync("leanc", ["-o", nativeExe, `${nativeExe}.c`], { stdio: "inherit" });
      const native = spawnSync(nativeExe, programArgs, runOptions);
      writeFileSync(expectedFile, native.stdout);
      if (native.status === 0) {
        rmSync(exitCodeFile, { force: true });
      } else {
        writeFileSync(exitCodeFile, `${native.status}\n`);
      }
      console.log(`blessed ${name} (exit ${native.status})`);
    }
    const browser = compileBrowser();
    if (browser.status === 0) {
      rmSync(browserErrorFile, { force: true });
    } else {
      writeFileSync(browserErrorFile, browser.stderr);
    }
    continue;
  }

  try {
    execFileSync(compiler, ["compile", input, "-o", output], { stdio: "pipe" });
  } catch (err) {
    failures++;
    console.log(`FAIL ${name} (compile)\n${err.stderr}`);
    continue;
  }

  const expected = existsSync(expectedFile) ? readFileSync(expectedFile, "utf8") : "";
  const expectedStatus = existsSync(exitCodeFile) ? Number(readFileSync(exitCodeFile, "utf8")) : 0;
  const run = spawnSync(process.execPath, [output, ...programArgs], {
    ...runOptions,
    env: { ...process.env, LEANSCRIPT_DEBUG_RC: "1" },
  });
  if (!checkRun(name, run, expected, expectedStatus)) {
    failures++;
    continue;
  }

  const browserLabel = `${name} (browser)`;
  const browser = compileBrowser();
  const expectedBrowserError = existsSync(browserErrorFile)
    ? readFileSync(browserErrorFile, "utf8")
    : undefined;
  if (browser.status !== 0 || expectedBrowserError !== undefined) {
    if (browser.status !== 0 && browser.stderr === expectedBrowserError) {
      console.log(`ok   ${browserLabel}, which fails to compile`);
    } else {
      failures++;
      console.log(`FAIL ${browserLabel} (compile)`);
      console.log(`--- expected\n${expectedBrowserError ?? ""}--- actual\n${browser.stderr}`);
    }
    continue;
  }
  rmSync(cwd, { recursive: true, force: true });
  mkdirSync(cwd, { recursive: true });
  const browserRun = spawnSync(
    process.execPath,
    [
      // Browsers don't give programs a large stack as Node does, so deeply recursive programs
      // overflow theirs. Until the browser runtime handles that, approximate a large stack with
      // the largest that fits in the main thread's typical 8MB.
      "--stack-size=4000",
      "--conditions=browser",
      "--import=data:text/javascript,globalThis.LEANSCRIPT_DEBUG_RC=true",
      browserOutput,
      ...programArgs,
    ],
    runOptions,
  );
  if (!checkRun(browserLabel, browserRun, expected, undefined)) {
    failures++;
  }
}

/**
 * Reports whether the program run `run` printed `expected` and exited with `expectedStatus`, if it
 * is defined, without reporting a runtime error, and returns whether it did.
 */
function checkRun(label, run, expected, expectedStatus) {
  if (
    (expectedStatus !== undefined && run.status !== expectedStatus) ||
    run.stdout !== expected ||
    run.stderr.includes("LeanScript: ")
  ) {
    const expectedExit = expectedStatus === undefined ? "" : `, expected ${expectedStatus}`;
    console.log(`FAIL ${label} (exit ${run.status}${expectedExit})`);
    console.log(`--- expected\n${expected}--- actual\n${run.stdout}--- stderr\n${run.stderr}`);
    return false;
  }
  console.log(`ok   ${label}`);
  return true;
}

if (!bless) {
  console.log(`\n${names.length - failures}/${names.length} passed`);
}
process.exitCode = failures === 0 ? 0 : 1;
