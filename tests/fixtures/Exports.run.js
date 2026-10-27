// Calls the exports of the compiled `Exports.lean`, whose path is the first argument.

import { pathToFileURL } from "node:url";
import { writeBytes } from "#platform/host.js";
import { checkLeaks, dec, mkString } from "leanscript/runtime";

const lib = await import(pathToFileURL(process.argv[2]).href);

const encoder = new TextEncoder();
/** Prints `s` the same way as the program, so that the two are in order. */
const print = (s) => writeBytes(1, encoder.encode(`${s}\n`));

/** Prints the Lean string `s`, and releases it. */
function printString(s) {
  print(s.toString());
  dec(s);
}

print("imported");
const name = mkString("world");
printString(lib.greet(name));
print(lib.add(2, 3));
print(lib.increment());
print(lib.increment());
print(lib.counterValue());
try {
  lib.fail(mkString("oops"));
} catch (e) {
  print(`caught: ${e.message}`);
}
printString(lib.kind([1, 2]));
printString(lib.kind("s"));
lib.printLine(mkString("printed by Lean"));
print(lib.answer());
print(await lib.greetLater(Promise.resolve("async")));
try {
  await lib.failLater(new Promise((resolve) => setTimeout(() => resolve("too late"), 5)));
} catch (e) {
  print(`caught: ${e.message}`);
}
checkLeaks();
