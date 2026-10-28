// Highlights code with Arborium, for `Ssg.highlightWith`.
//
// Reads blocks from stdin, each as its language and its source, each followed by a NUL. Writes the
// HTML of each block to stdout, each followed by a NUL. NUL separates them because it can't appear
// in either.

import { highlight } from "@arborium/arborium";
import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";

const readPackageFile = (specifier) => readFile(new URL(import.meta.resolve(specifier)));

// Arborium loads its host and grammars from a CDN by default, which Node can't import from.
const config = {
  logger: { debug() {}, warn: console.warn, error: console.error },
  resolveHostJs: () => import("@arborium/arborium/arborium_host.js"),
  resolveHostWasm: () => readPackageFile("@arborium/arborium/arborium_host_bg.wasm"),
  resolveJs: ({ language }) => import(`@arborium/${language}`),
  resolveWasm: ({ language }) => readPackageFile(`@arborium/${language}/grammar_bg.wasm`),
};

const fields = (await text(process.stdin)).split("\0");
fields.pop();
if (fields.length % 2 !== 0) {
  throw new Error("Expected a language and a source for each block.");
}

let output = "";
for (let i = 0; i < fields.length; i += 2) {
  output += (await highlight(fields[i], fields[i + 1], config)) + "\0";
}
process.stdout.write(output);
