// The Worker's entry point. Workers expect a default export of an object with handler methods,
// which LeanScript cannot export yet, so we wrap the handlers that the Lean module exports.

import { fetch } from "./build/Worker.mjs";

export default { fetch };
