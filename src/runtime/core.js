// Objects, reference counting, closures, and other core runtime support.
//
// Heap objects (`Ctor`s, closures, arrays, and strings) carry a reference count in their `rc`
// field, with the same meaning and ownership discipline as `m_rc` in the C runtime:
//
// - `rc > 0`: the number of references. An object with `rc === 1` is exclusive and may be updated
//   in place.
// - `rc === 0`: persistent. Never freed and never exclusive.
// - `rc === FREED`: freed. Touching it again is a reference counting bug, so we throw.
//
// Objects without an `rc` field, such as values from foreign JS code, are treated as persistent.
// Numbers and `BigInt`s are never reference counted.
//
// Freeing an object only decrements its children; the memory itself is left to the JS garbage
// collector. The counts exist so that we know when an object is exclusive.

import { writeStderr } from "./platform.js";

const FREED = -1;

export class Ctor {
  /**
   * @param {number} tag
   * @param {unknown[]} f The object fields.
   * @param {Record<number, unknown> | null} s The scalar fields, keyed by byte offset.
   */
  constructor(tag, f, s) {
    this.rc = 1;
    this.tag = tag;
    this.f = f;
    this.s = s;
  }
}

export class Closure {
  constructor(fn, arity, args) {
    this.rc = 1;
    this.fn = fn;
    this.arity = arity;
    this.args = args;
  }
}

function useAfterFree(op, x) {
  throw new Error(`LeanScript: ${op} of freed object ${x?.constructor?.name}`);
}

/** Returns the reference counted children of `x`, which must be an object. */
function children(x) {
  if (x instanceof Ctor) {
    return x.f;
  }
  if (x instanceof Closure) {
    return x.args;
  }
  if (Array.isArray(x)) {
    return x;
  }
  return undefined;
}

export function inc(x) {
  if (typeof x !== "object") {
    return;
  }
  const rc = x.rc;
  if (rc > 0) {
    x.rc = rc + 1;
  } else if (rc === FREED) {
    useAfterFree("inc", x);
  }
}

export function incN(x, n) {
  if (typeof x !== "object") {
    return;
  }
  const rc = x.rc;
  if (rc > 0) {
    x.rc = rc + n;
  } else if (rc === FREED) {
    useAfterFree("inc", x);
  }
}

export function dec(x) {
  if (typeof x !== "object") {
    return;
  }
  const rc = x.rc;
  if (rc > 1) {
    x.rc = rc - 1;
  } else if (rc === 1) {
    free(x);
  } else if (rc === FREED) {
    useAfterFree("dec", x);
  }
}

/** Frees `x` and decrements its children, using a worklist so that long lists cannot overflow. */
function free(x) {
  const todo = [x];
  while (todo.length > 0) {
    const o = todo.pop();
    o.rc = FREED;
    const cs = children(o);
    if (cs === undefined) {
      continue;
    }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (typeof c !== "object") {
        continue;
      }
      const rc = c.rc;
      if (rc > 1) {
        c.rc = rc - 1;
      } else if (rc === 1) {
        todo.push(c);
      } else if (rc === FREED) {
        useAfterFree("dec", c);
      }
    }
  }
}

/**
 * Frees `x` without decrementing its children, whose references have been moved elsewhere. Like
 * `lean_del_object`, does nothing if `x` is a scalar.
 */
export function del(x) {
  if (typeof x === "object") {
    x.rc = FREED;
  }
}

export function isExclusive(x) {
  return x.rc === 1;
}

export function isShared(x) {
  return x.rc === 1 ? 0 : 1;
}

/**
 * The `reset` instruction: if `x` is exclusive, releases its first `n` fields and returns it for
 * reuse. Otherwise, gives up our reference to `x` and returns `0`.
 */
export function reset(x, n) {
  if (x.rc === 1) {
    for (let i = 0; i < n; i++) {
      dec(x.f[i]);
    }
    return x;
  }
  dec(x);
  return 0;
}

/** Marks `x` and everything reachable from it as persistent, like `lean_mark_persistent`. */
export function markPersistent(x) {
  const todo = [x];
  while (todo.length > 0) {
    const o = todo.pop();
    if (typeof o !== "object" || !(o.rc > 0)) {
      continue;
    }
    o.rc = 0;
    const cs = children(o);
    if (cs === undefined) {
      continue;
    }
    for (let i = 0; i < cs.length; i++) {
      todo.push(cs[i]);
    }
  }
  return x;
}

/** Returns the constructor index of `x`, which is either a `Ctor` or a boxed scalar. */
export function tag(x) {
  return typeof x === "number" ? x : x.tag;
}

export function unreachable() {
  throw new Error("LeanScript: unreachable code reached");
}

/** Reports the panic message `msg` and returns `defaultValue`, as `lean_panic_fn` does. */
export function panic(defaultValue, msg) {
  writeStderr(`${msg}\n`);
  return defaultValue;
}

/**
 * Returns a function that computes `init()` on first call and returns the cached value after.
 *
 * The value is marked persistent, as the C runtime does for the values of global constants.
 */
export function lazy(init) {
  let state = 0;
  let value;
  return () => {
    if (state === 2) {
      return value;
    }
    if (state === 1) {
      throw new Error("LeanScript: cyclic constant initialization");
    }
    state = 1;
    value = markPersistent(init());
    state = 2;
    return value;
  };
}

/** Partially applies `fn`, which takes `arity` owned arguments, to the owned arguments `args`. */
export function pap(fn, arity, args) {
  return new Closure(fn, arity, args);
}

/**
 * Takes ownership of the closure `f` and returns its fixed arguments, each of which the caller then
 * owns.
 */
function takeArgs(f) {
  if (f.rc === 1) {
    del(f);
    return f.args;
  }
  for (const arg of f.args) {
    inc(arg);
  }
  dec(f);
  return f.args;
}

/**
 * Applies the closure `f` to `args`, which may be fewer or more than it still expects.
 *
 * Like `lean_apply_n`, this consumes `f` and every argument.
 */
export function apply(f, args) {
  const remaining = f.arity - f.args.length;
  if (args.length < remaining) {
    return new Closure(f.fn, f.arity, takeArgs(f).concat(args));
  }
  if (args.length === remaining) {
    return f.fn(...takeArgs(f), ...args);
  }
  const result = f.fn(...takeArgs(f), ...args.slice(0, remaining));
  return apply(result, args.slice(remaining));
}

/**
 * Converts a JS array to a Lean `List`, moving the elements into it.
 */
export function arrayToList(xs) {
  let list = 0;
  for (let i = xs.length - 1; i >= 0; i--) {
    list = new Ctor(1, [xs[i], list], null);
  }
  return list;
}

/**
 * Returns the elements of the Lean `List` `list` as a JS array, without affecting any reference
 * counts.
 */
export function listToArray(list) {
  const xs = [];
  while (list !== 0) {
    xs.push(list.f[0]);
    list = list.f[1];
  }
  return xs;
}

/**
 * Returns a function that reads the value of an `[init]` declaration, which must first be set with
 * its `set` method. The value is marked persistent.
 */
export function initCell() {
  let initialized = false;
  let value;
  const get = () => {
    if (!initialized) {
      throw new Error("LeanScript: `[init]` declaration read before initialization");
    }
    return value;
  };
  get.set = (v) => {
    value = markPersistent(v);
    initialized = true;
  };
  return get;
}
