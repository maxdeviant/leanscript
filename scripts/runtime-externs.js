// Lists the externs that the runtime implements on each target.

import { execFileSync } from "node:child_process";

const runtimeUrl = new URL("../src/runtime/index.js", import.meta.url).href;

/**
 * Returns the sorted names of the externs that the runtime implements when it is loaded under the
 * export `conditions`, as a program on that target would load it.
 */
export function runtimeExterns(conditions) {
  const script = `const { externs } = await import(${JSON.stringify(runtimeUrl)});
console.log(Object.keys(externs).sort().join("\\n"));`;
  const stdout = execFileSync(
    process.execPath,
    [...conditions.map((c) => `--conditions=${c}`), "--input-type=module", "--eval", script],
    { encoding: "utf8" },
  );
  return stdout.trimEnd().split("\n");
}
