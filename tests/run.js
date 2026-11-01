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
// A program with an adjacent `.browser-unavailable` file is instead compiled for the browser target
// with `--allow-unavailable`, and must throw because it called an unavailable extern. The first line
// of the file names the extern, and the rest is the stdout from before the call. `--bless` leaves
// this file alone.
//
// With `--bless`, instead regenerates the `.expected` and `.exitcode` files by compiling each
// program with native Lean and running it (`lean --run` is not used because it skips the main
// module's initializers), and the `.browser-error` files by compiling each program for the browser
// target.
//
// A program with an adjacent `.compile-error` file must instead fail to compile, with exactly the
// contents of that file on stderr. It is compiled from the fixtures directory, so that its messages
// name it by a relative path. `--bless` regenerates the file.
//
// A library, which has no `main` function, is run by the adjacent `.run.js` driver instead, which is
// given the path of the compiled library.
//
// An adjacent `.setup.js` module is imported before the program, in each thread it runs on, to set
// up its environment, such as the globals of a web page.
//
// A program with an adjacent `.js` file, which implements externs in JS, or `.setup.js` file, or a
// library cannot run natively. Neither can a program with an adjacent `.no-native` file, which
// explains why, such as that it keeps running after `main` returns, where a native program exits.
// Its `.expected` and `.exitcode` files are written by hand, and `--bless` leaves them alone.
//
// Usage: node tests/run.js [--bless] [name...]

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const fixtures = join(root, "tests", "fixtures");
// Compiled output must live inside this package so that `@leanscript/runtime` resolves.
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
  const browserUnavailableFile = join(fixtures, `${name}.browser-unavailable`);
  const browserOutput = join(outDir, `${name}.browser.mjs`);
  const driverFile = join(fixtures, `${name}.run.js`);
  const compileErrorFile = join(fixtures, `${name}.compile-error`);
  const driver = existsSync(driverFile) ? [driverFile] : [];
  const setupFile = join(fixtures, `${name}.setup.js`);
  const setup = existsSync(setupFile) ? [`--import=${pathToFileURL(setupFile)}`] : [];
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

  if (existsSync(compileErrorFile)) {
    if (!checkCompileError(name, output, compileErrorFile)) {
      failures++;
    }
    continue;
  }

  if (bless) {
    if (
      existsSync(join(fixtures, `${name}.js`)) ||
      existsSync(join(fixtures, `${name}.no-native`)) ||
      driver.length > 0 ||
      setup.length > 0
    ) {
      console.log(`skipping native run of ${name}, which cannot run natively`);
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
    if (existsSync(browserUnavailableFile)) {
      continue;
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
  const run = spawnSync(process.execPath, [...setup, ...driver, output, ...programArgs], {
    ...runOptions,
    env: { ...process.env, LEANSCRIPT_DEBUG_RC: "1" },
  });
  if (!checkRun(name, run, expected, expectedStatus)) {
    failures++;
    continue;
  }

  const browserLabel = `${name} (browser)`;
  if (existsSync(browserUnavailableFile)) {
    if (!checkUnavailable(browserLabel, input, browserOutput, browserUnavailableFile, runOptions)) {
      failures++;
    }
    continue;
  }
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
      ...setup,
      ...driver,
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
 * Compiles the fixture `name` to `output`, which must fail with the error in `errorFile`, and
 * reports whether it did. With `--bless`, instead writes the error to `errorFile`.
 */
function checkCompileError(name, output, errorFile) {
  const result = spawnSync(compiler, ["compile", `${name}.lean`, "-o", output], {
    cwd: fixtures,
    encoding: "utf8",
  });
  if (result.status === 0) {
    console.log(`FAIL ${name} (compiled, but a compile error was expected)`);
    return false;
  }
  if (bless) {
    writeFileSync(errorFile, result.stderr);
    console.log(`blessed ${name} (compile error)`);
    return true;
  }
  const expected = readFileSync(errorFile, "utf8");
  if (result.stderr !== expected) {
    console.log(`FAIL ${name} (compile error)`);
    console.log(`--- expected\n${expected}--- actual\n${result.stderr}`);
    return false;
  }
  console.log(`ok   ${name}, which fails to compile`);
  return true;
}

/**
 * Compiles `input` to `output` for the browser target, allowing unavailable externs, and reports
 * whether running it throws for the extern named in `file`, after printing the rest of `file`.
 */
function checkUnavailable(label, input, output, file, runOptions) {
  const compile = spawnSync(
    compiler,
    ["compile", input, "-o", output, "--target", "browser", "--allow-unavailable"],
    { encoding: "utf8" },
  );
  if (compile.status !== 0) {
    console.log(`FAIL ${label} (compile)\n${compile.stderr}`);
    return false;
  }
  const [extern, ...lines] = readFileSync(file, "utf8").split("\n");
  const expected = lines.join("\n");
  const message = `LeanScript: ${extern} is not available on this platform`;
  const run = spawnSync(process.execPath, ["--conditions=browser", output], runOptions);
  if (run.status === 0 || run.stdout !== expected || !run.stderr.includes(message)) {
    console.log(`FAIL ${label} (exit ${run.status}, expected a failure with "${message}")`);
    console.log(`--- expected\n${expected}--- actual\n${run.stdout}--- stderr\n${run.stderr}`);
    return false;
  }
  console.log(`ok   ${label}, which throws when it calls ${extern}`);
  return true;
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
