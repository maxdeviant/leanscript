// Sets up a page made with jsdom for `Dom.lean`, by making the globals it uses those of the page.

import { JSDOM, VirtualConsole } from "jsdom";
import { writeBytes } from "#platform/host.js";

const encoder = new TextEncoder();

// Errors thrown by event listeners, which browsers report rather than throw from `dispatchEvent`.
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => {
  writeBytes(1, encoder.encode(`reported: ${e.cause?.message ?? e.message}\n`));
});

const { window } = new JSDOM(
  `<body><div id="app">Hello, <b>world</b>!<ul><li>one</li><li>two</li></ul></div></body>`,
  { virtualConsole },
);
for (const name of [
  "document",
  "DOMTokenList",
  "Document",
  "Element",
  "Event",
  "EventTarget",
  "HTMLElement",
  "HTMLInputElement",
  "KeyboardEvent",
  "Node",
  "Text",
]) {
  globalThis[name] = window[name];
}
