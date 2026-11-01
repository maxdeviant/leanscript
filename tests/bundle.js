// Bundles programs with the Vite plugin, as a browser app would, and fails if the runtime's externs
// stop being removed from the bundle, or if the bundle doesn't work.
//
// Requires the compiler to be built with `lake build`.
//
// Usage: node tests/bundle.js

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import leanscript from "../packages/vite-plugin/src/index.js";

const root = join(import.meta.dirname, "..");
const compiler = join(root, ".lake", "build", "bin", "leanscript");
const outDir = join(root, ".lake", "build", "tests", "bundle");

/**
 * The most bytes that the gzipped bundle of a program that does nothing may take. Raise this only for
 * an increase that is worth paying for in every program.
 */
const maxEmptyProgramSize = 7200;

/** Runtime modules that a program that does nothing has no use for. */
const unusedModules = ["net.js", "externs/net.js", "float.js", "externs/float.js", "timer.js"];

/**
 * Returns the code of the bundle of the Lean program `source`, and its modules that kept code.
 *
 * The program is outside of this repository, where only the plugin can resolve the runtime, as in an
 * app that only depends on the plugin.
 */
async function bundle(source) {
  const dir = mkdtempSync(join(tmpdir(), "leanscript-bundle-"));
  try {
    const input = join(dir, "Main.lean");
    writeFileSync(input, source);
    const { output } = await build({
      root: dir,
      configFile: false,
      logLevel: "silent",
      plugins: [leanscript({ compiler })],
      build: { write: false, rollupOptions: { input } },
    });
    const chunk = output.find((file) => file.type === "chunk" && file.isEntry);
    const modules = Object.entries(chunk.modules)
      .filter(([, { renderedLength }]) => renderedLength > 0)
      .map(([id]) => id);
    return { code: chunk.code, modules };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const empty = await bundle("def main : IO Unit := pure ()\n");
const emptySize = gzipSync(empty.code, { level: 9 }).length;
const kept = unusedModules.filter((file) =>
  empty.modules.some((id) => id.endsWith(`/packages/runtime/src/${file}`)),
);
if (emptySize > maxEmptyProgramSize) {
  console.log(`FAIL empty program is ${emptySize} B gzipped, over ${maxEmptyProgramSize} B`);
  process.exitCode = 1;
} else {
  console.log(`ok   empty program is ${emptySize} B gzipped, within ${maxEmptyProgramSize} B`);
}
if (kept.length > 0) {
  console.log(`FAIL empty program keeps code from ${kept.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("ok   empty program keeps no code from unused runtime modules");
}

// Removing modules could also remove something that a program needs without its size showing that.
const hello = await bundle('def main : IO Unit := IO.println "Hello, world!"\n');
mkdirSync(outDir, { recursive: true });
const helloFile = join(outDir, "hello.mjs");
writeFileSync(helloFile, hello.code);
const run = spawnSync(process.execPath, [helloFile], { encoding: "utf8" });
if (run.status !== 0 || run.stdout !== "Hello, world!\n") {
  console.log(`FAIL bundled program (exit ${run.status})\n${run.stdout}${run.stderr}`);
  process.exitCode = 1;
} else {
  console.log("ok   bundled program runs");
}
