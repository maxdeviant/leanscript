// Compiles each `bench/programs/*.lean` program natively, for Node, and for the browser, and times it
// on each target, reporting the median of several runs and how much slower each JS target is than
// native.
//
// The compiler is built with `lake build` first, so that the JS it emits matches the runtime.
//
// Each program runs with the arguments in the adjacent `.args` file (one per line), from the programs
// directory. Before it is timed on a target, each program is run once untimed, as a warmup, and its
// output is checked against the native program's, so that a benchmark can't get faster by being
// wrong. A program whose output differs, or that fails, fails the run.
//
// The times measure different things on each target:
//
// - native and node: the wall time of the whole process, which on Node includes starting Node and
//   the worker that runs the program. `hello` measures this overhead.
// - chrome: the time from importing the compiled program in a page until its `main` returns, in a
//   fresh browser context for each run. Browsers give `main` no arguments, so the page supplies them
//   by replacing the runtime's `commandLineArgs`.
//
// A program with an adjacent `.no-browser` file, which explains why, isn't run in the browser.
//
// Chrome is found on the `PATH`, or at `$CHROME_PATH`.
//
// Usage: node bench/run.js [--runs <n>] [--targets <target,...>] [--json <file>]
//                          [--compare <file>] [name...]
//
// - `--runs` sets how many timed runs each target gets (default 3).
// - `--targets` picks which of `native`, `node`, and `chrome` to time (default all).
// - `--json` writes every time measured to `file`.
// - `--compare` shows how each median changed from those in `file`, written by `--json`.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { delimiter, extname, join } from "node:path";

const root = join(import.meta.dirname, "..");
const programs = join(import.meta.dirname, "programs");
// Compiled output must live inside this package so that `@leanscript/runtime` resolves.
const outDir = join(root, ".lake", "build", "bench");
const nativeDir = join(outDir, "native");
const compiler = join(root, ".lake", "build", "bin", "leanscript");
const allTargets = ["native", "node", "chrome"];

const options = parseArgs(process.argv.slice(2));
const names = readdirSync(programs)
  .filter((file) => file.endsWith(".lean"))
  .map((file) => file.slice(0, -".lean".length))
  .filter((name) => options.names.length === 0 || options.names.includes(name))
  .sort();
const baseline = options.compare && JSON.parse(readFileSync(options.compare, "utf8"));

// Benchmarks must not pay for debug checks.
const env = { ...process.env };
delete env.LEANSCRIPT_DEBUG_RC;

build("lake", ["build"]);
mkdirSync(nativeDir, { recursive: true });

const browser = options.targets.includes("chrome") ? await startBrowser() : undefined;
const results = {};
let failures = 0;

printRow("", options.targets);
for (const name of names) {
  const result = await benchmark(name);
  results[name] = result;
  printRow(
    name,
    options.targets.map((target) => describe(name, result, target)),
  );
}

await browser?.close();

if (options.json) {
  writeFileSync(
    options.json,
    `${JSON.stringify(
      {
        date: new Date().toISOString(),
        toolchain: readFileSync(join(root, "lean-toolchain"), "utf8").trim(),
        node: process.version,
        chrome: browser?.version,
        runs: options.runs,
        results,
      },
      null,
      2,
    )}\n`,
  );
}

if (failures > 0) {
  console.log(`\n${failures} benchmarks failed`);
}
process.exitCode = failures === 0 ? 0 : 1;

function parseArgs(args) {
  const options = { runs: 3, targets: allTargets, names: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--runs") {
      options.runs = Number(args[++i]);
    } else if (arg === "--targets") {
      options.targets = args[++i].split(",");
      const unknown = options.targets.filter((target) => !allTargets.includes(target));
      if (unknown.length > 0) {
        throw new Error(`unknown targets: ${unknown.join(", ")}`);
      }
    } else if (arg === "--json") {
      options.json = args[++i];
    } else if (arg === "--compare") {
      options.compare = args[++i];
    } else {
      options.names.push(arg);
    }
  }
  return options;
}

/**
 * Builds the program `name` for every target and times it on each one that `options.targets`
 * includes. Returns, for each target, the times of its runs in milliseconds, or why it has none.
 */
async function benchmark(name) {
  const source = join(programs, `${name}.lean`);
  const argsFile = join(programs, `${name}.args`);
  const args = existsSync(argsFile) ? readFileSync(argsFile, "utf8").split("\n").slice(0, -1) : [];
  const noBrowserFile = join(programs, `${name}.no-browser`);
  const result = {};

  const native = buildNative(name, source);
  const node = join(outDir, `${name}.mjs`);
  const browserProgram = join(outDir, `${name}.browser.mjs`);
  build(compiler, ["compile", source, "-o", node]);

  // The native program's output is the reference, so it is always run, even when it isn't timed.
  const reference = runProcess(native, args);
  if (reference.error) {
    failures++;
    return { native: { error: `native run failed\n${reference.error}` } };
  }

  for (const target of options.targets) {
    if (target === "native") {
      result.native = await timeRuns(() => runProcess(native, args), reference);
    } else if (target === "node") {
      result.node = await timeRuns(() => runProcess(process.execPath, [node, ...args]), reference);
    } else if (existsSync(noBrowserFile)) {
      result.chrome = { skipped: readFileSync(noBrowserFile, "utf8").trim() };
    } else {
      build(compiler, ["compile", source, "-o", browserProgram, "--target", "browser"]);
      result.chrome = await timeRuns(() => browser.run(browserProgram, args), reference);
    }
  }
  return result;
}

/**
 * Compiles `source` natively, as Lean's own benchmarks are, unless an executable newer than both it
 * and the toolchain is already built, and returns the executable's path.
 */
function buildNative(name, source) {
  const exe = join(nativeDir, name);
  const toolchain = join(root, "lean-toolchain");
  if (
    existsSync(exe) &&
    statSync(exe).mtimeMs > statSync(source).mtimeMs &&
    statSync(exe).mtimeMs > statSync(toolchain).mtimeMs
  ) {
    return exe;
  }
  build("lean", ["-c", `${exe}.c`, source]);
  build("leanc", ["-O3", "-DNDEBUG", "-o", exe, `${exe}.c`]);
  return exe;
}

/** Runs the build step `command` with `args`, showing its output only if it fails. */
function build(command, args) {
  const run = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (run.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${run.stdout}${run.stderr}`);
  }
}

/**
 * Runs `command` with `args` from the programs directory, and returns its output and wall time, or
 * an error if it fails.
 */
function runProcess(command, args) {
  const start = performance.now();
  const run = spawnSync(command, args, { cwd: programs, env, encoding: "utf8" });
  const ms = performance.now() - start;
  if (run.status !== 0 || run.stderr.includes("LeanScript: ")) {
    return { error: `exit ${run.status ?? run.signal}\n${run.stderr}` };
  }
  return { ms, stdout: run.stdout };
}

/**
 * Runs `run`, which may return a promise, once as a warmup, checking its output against
 * `reference`'s, then `options.runs` more times, and returns their times, or the first error.
 */
async function timeRuns(run, reference) {
  const warmup = await run();
  const error = checkOutput(warmup, reference);
  if (error) {
    failures++;
    return { error };
  }
  const times = [];
  for (let i = 0; i < options.runs; i++) {
    const r = await run();
    if (r.error) {
      failures++;
      return { error: r.error };
    }
    times.push(r.ms);
  }
  return { times };
}

/** Returns why the run `r` failed or printed something other than `reference` did, if it did. */
function checkOutput(r, reference) {
  if (r.error) {
    return r.error;
  }
  const actual = maskTimings(r.stdout);
  const expected = maskTimings(reference.stdout);
  if (actual !== expected) {
    return `wrong output\n--- expected\n${expected}--- actual\n${actual}`;
  }
  return undefined;
}

/** Removes the times that the map benchmarks print, which differ from run to run. */
function maskTimings(stdout) {
  return stdout.replace(/^(measurement: \S+) .*$/gm, "$1");
}

/**
 * Launches Chrome, with a server for the pages that run programs in it. Returns an object whose
 * `run` method runs a program compiled for the browser, as `runProcess` runs a native one.
 */
async function startBrowser() {
  const { chromium } = await import("playwright-core");
  const chrome = await chromium.launch({ executablePath: findChrome() });
  const server = await serve();
  return {
    version: chrome.version(),
    async run(program, args) {
      const context = await chrome.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (err) => errors.push(err.stack ?? String(err)));
      await page.goto(server.url);
      const url = `/out/${program.slice(outDir.length + 1)}`;
      const result = await page.evaluate(
        async ({ url, args }) => {
          globalThis.benchArgs = args;
          // The runtime logs each line of output as `console.log("%s", line)`. Collecting the
          // lines in the page keeps the cost of sending them out of the measurement.
          const output = { log: [], error: [] };
          for (const level of ["log", "error"]) {
            console[level] = (format, ...rest) =>
              output[level].push(rest.length > 0 ? rest[0] : format);
          }
          const start = performance.now();
          let error;
          try {
            await import(url);
          } catch (e) {
            error = e?.stack ?? String(e);
          }
          return { ms: performance.now() - start, error, output };
        },
        { url, args },
      );
      await context.close();
      const stderr = result.output.error.join("\n");
      if (result.error || stderr.includes("LeanScript: ") || errors.length > 0) {
        return { error: [result.error, stderr, ...errors].filter(Boolean).join("\n") };
      }
      return { ms: result.ms, stdout: result.output.log.map((line) => `${line}\n`).join("") };
    },
    async close() {
      await chrome.close();
      server.close();
    },
  };
}

/** Returns the path of a Chrome or Chromium executable. */
function findChrome() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  const candidates = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    for (const candidate of candidates) {
      if (existsSync(join(dir, candidate))) {
        return join(dir, candidate);
      }
    }
  }
  throw new Error("Chrome not found; set CHROME_PATH, or pass `--targets native,node`");
}

/**
 * Starts a server for the page that programs run in, the runtime, and the compiled programs. Returns
 * an object with the page's `url` and a `close` method.
 */
function serve() {
  // The import map resolves the runtime's package imports as the `browser` export condition does,
  // except for the host, which is replaced so that `main` gets the arguments in `benchArgs`.
  const page = `<!doctype html>
<script type="importmap">
  {
    "imports": {
      "@leanscript/runtime": "/runtime/index.js",
      "@leanscript/runtime/externs": "/runtime/externs/index.js",
      "#platform/host.js": "/host.js",
      "#platform/": "/runtime/platform/browser/"
    }
  }
</script>
`;
  const host = `export * from "/runtime/platform/browser/host.js";
export const commandLineArgs = () => globalThis.benchArgs;
`;
  const dirs = { runtime: join(root, "packages", "runtime", "src"), out: outDir };
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const [, dir, ...rest] = path.split("/");
    let body;
    if (path === "/") {
      body = page;
    } else if (path === "/host.js") {
      body = host;
    } else if (Object.hasOwn(dirs, dir) && !rest.includes("..")) {
      const file = join(dirs[dir], ...rest);
      body = existsSync(file) ? readFileSync(file) : undefined;
    }
    if (body === undefined) {
      res.writeHead(404).end();
      return;
    }
    const type =
      path === "/"
        ? "text/html"
        : extname(path) === ".map"
          ? "application/json"
          : "text/javascript";
    res.writeHead(200, { "content-type": type }).end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() });
    });
  });
}

function median(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Describes the result of the program `name` on `target`: its median time, how much slower than
 * native that is, and how much it changed from the baseline, if there is one.
 */
function describe(name, result, target) {
  const r = result[target];
  if (r === undefined) {
    return "";
  }
  if (r.skipped) {
    return "skipped";
  }
  if (r.error) {
    console.log(`\n${name} (${target}): ${r.error.trimEnd()}\n`);
    return "FAILED";
  }
  const ms = median(r.times);
  let s = `${ms.toFixed(0)} ms`;
  const native = result.native?.times;
  if (target !== "native" && native) {
    s += ` ${(ms / median(native)).toFixed(1)}×`;
  }
  const before = baseline?.results[name]?.[target]?.times;
  if (before) {
    const change = (ms / median(before) - 1) * 100;
    s += ` (${change >= 0 ? "+" : ""}${change.toFixed(0)}%)`;
  }
  return s;
}

function printRow(name, cells) {
  console.log(name.padEnd(18) + cells.map((cell) => cell.padStart(24)).join(""));
}
