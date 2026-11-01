// The implementations of `@[extern]` declarations, each exported under its exact Lean name.
//
// Every export of this module must be an extern, as its exports are what the compiler considers to
// be implemented, so the modules here export nothing else. Each export is separate so that bundlers
// can remove the externs that a program doesn't import.
//
// Every extern implementation receives every IR parameter of the declaration it implements, in
// order, including erased type arguments and the `void` world token.

export * from "./array.js";
export * from "./bytearray.js";
export * from "./fixed.js";
export * from "./float.js";
export * from "./floatarray.js";
export * from "./hash.js";
export * from "./io.js";
export * from "./misc.js";
export * from "./nat.js";
export * from "./net.js";
export * from "./ref.js";
export * from "./string.js";
export * from "./system.js";
export * from "./task.js";
export * from "./timer.js";
export * from "#platform/externs.js";
