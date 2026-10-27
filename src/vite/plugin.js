// A Vite plugin that compiles imported `.lean` files with LeanScript, for the browser.
//
// A `.lean` file in a Lake workspace may import the workspace's other modules, which the compiler
// builds with Lake. A compile error fails the import, which the dev server shows in its error
// overlay.

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

    // The Lean modules that a `.lean` file imports are not in Vite's module graph, so a change to
    // any of them may affect any compiled file, which then cannot be updated in place.
    hotUpdate({ file }) {
      if (!file.endsWith(".lean")) {
        return;
      }
      const graph = this.environment.moduleGraph;
      for (const mod of graph.idToModuleMap.values()) {
        if (mod.id.endsWith(".lean")) {
          graph.invalidateModule(mod);
        }
      }
      this.environment.hot.send({ type: "full-reload" });
      return [];
    },
  };
}
