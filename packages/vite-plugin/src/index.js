// A Vite plugin that compiles imported `.lean` files with LeanScript, for the browser.
//
// A `.lean` file in a Lake workspace may import the workspace's other modules, which the compiler
// builds with Lake. A compile error fails the import, which the dev server shows in its error
// overlay.
//
// Compiled files import `@leanscript/runtime` and `@leanscript/runtime/externs`, which resolve to the
// plugin's own dependency, so that apps only need to depend on the plugin.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const runtimeSpecifiers = new Set(["@leanscript/runtime", "@leanscript/runtime/externs"]);

/** Returns the nearest directory containing `dir` that has a Lake configuration file, if any. */
function findWorkspace(dir) {
  for (;;) {
    if (existsSync(join(dir, "lakefile.toml")) || existsSync(join(dir, "lakefile.lean"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Returns the plugin. `compiler` is the path of the `leanscript` executable. By default, each
 * `.lean` file is compiled by the `leanscript` executable of the Lake workspace that contains it,
 * with `lake exe`, which first builds the executable if needed.
 */
export default function leanscript({ compiler } = {}) {
  return {
    name: "leanscript",

    resolveId(source, _importer, options) {
      if (!runtimeSpecifiers.has(source)) {
        return null;
      }
      return this.resolve(source, fileURLToPath(import.meta.url), { ...options, skipSelf: true });
    },

    async load(id) {
      if (!id.endsWith(".lean")) {
        return null;
      }
      // The compiler writes only to files, and concurrent loads must not share one.
      const dir = await mkdtemp(join(tmpdir(), "leanscript-"));
      try {
        const output = join(dir, "out.mjs");
        const args = ["compile", id, "-o", output, "--target", "browser"];
        try {
          if (compiler !== undefined) {
            await execFileAsync(compiler, args);
          } else {
            const cwd = findWorkspace(dirname(id));
            if (cwd === undefined) {
              this.error(
                `${id} is not in a Lake workspace, which provides the LeanScript compiler; set the plugin's \`compiler\` option to its path instead`,
              );
            }
            await execFileAsync("lake", ["exe", "leanscript", ...args], { cwd });
          }
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
