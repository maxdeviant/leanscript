// Calls the exports of the compiled `DefaultExport.lean`, whose path is the first argument.

import { pathToFileURL } from "node:url";
import { writeBytes } from "#platform/host.js";
import { checkLeaks, dec, mkString } from "leanscript/runtime";

const { default: greet, twice } = await import(pathToFileURL(process.argv[2]).href);

const encoder = new TextEncoder();

/**
 * Prints the Lean string `s` the same way as the program, so that the two are in order, and
 * releases it.
 */
function printString(s) {
  writeBytes(1, encoder.encode(`${s.toString()}\n`));
  dec(s);
}

printString(greet(mkString("world")));
printString(twice(mkString("ha")));
checkLeaks();
