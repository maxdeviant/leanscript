// A Vite plugin that compiles imported `.lean` files with LeanScript, for the browser.
//
// Each `.lean` module is compiled on its own, so it may only import modules that have already been
// built, such as the `Js` library. A compile error fails the import, which the dev server shows in
// its error overlay.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** The compiler that `lake build` builds in this repository. */
const defaultCompiler = fileURLToPath(new URL("../../.lake/build/bin/leanscript", import.meta.url));

/**
 * Returns the plugin. `compiler` is the path of the `leanscript` executable, which defaults to the
 * one built in this repository.
 */
export default function leanscript({ compiler = defaultCompiler } = {}) {
  return {
    name: "leanscript",

    async load(id) {
      if (!id.endsWith(".lean")) {
        return null;
      }
      // The compiler writes only to files, and concurrent loads must not share one.
      const dir = await mkdtemp(join(tmpdir(), "leanscript-"));
      try {
        const output = join(dir, "out.mjs");
        try {
          await execFileAsync(compiler, ["compile", id, "-o", output, "--target", "browser"]);
        } catch (e) {
          this.error(e.stderr || e.message);
        }
        return { code: await readFile(output, "utf8"), map: null };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
