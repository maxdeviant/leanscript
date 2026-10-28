// A JS extern module with a side effect when it is evaluated, which must happen once, on the thread
// that runs the program.

import { writeSync } from "node:fs";

writeSync(1, "module evaluated\n");

export const succ = (n) => n + 1;
