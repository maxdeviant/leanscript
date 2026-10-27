// The JS implementations of the externs in `JsValues.lean`.

import { mkString } from "leanscript/runtime";

export const makePoint = (x, y) => ({ x, y, rc: 1 });

export const describe = (v) => mkString(JSON.stringify(v));
