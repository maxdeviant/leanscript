// Objects, reference counting, closures, and other core runtime support.
//
// Heap objects (`Ctor`s, closures, arrays, and strings) carry a reference count under the `RC`
// symbol, with the same meaning and ownership discipline as `m_rc` in the C runtime:
//
// - `rc > 0`: the number of references. An object with `rc === 1` is exclusive and may be updated
//   in place.
// - `rc === 0`: persistent. Never freed and never exclusive.
// - `rc === FREED`: freed. Touching it again is a reference counting bug, so we throw.
//
// Values from foreign JS code have no reference count, and are never reference counted. Neither
// are numbers and `BigInt`s. The count is keyed by a symbol so that no foreign object can have one.
//
// Freeing an object only decrements its children; the memory itself is left to the JS garbage
// collector. The counts exist so that we know when an object is exclusive.
//
// Setting the `LEANSCRIPT_DEBUG_RC` debug option enables extra checks: every allocated object is
// registered so that `checkLeaks` can report the ones never freed, freed objects are poisoned so
// that any later use of one fails.

import { debugOption, writeStderr } from "#platform/host.js";

// Compiled programs inline the common cases of `inc` and `dec`, which rely on this being negative.
const FREED = -1;

/** The key of an object's reference count. */
export const RC = Symbol("rc");

/** The objects allocated and not yet freed, if debug checks are enabled. */
const live = debugOption("LEANSCRIPT_DEBUG_RC") ? new Set() : undefined;

/** Registers the newly allocated object `x` for leak checking, and returns it. */
export function track(x) {
  live?.add(x);
  return x;
}

/**
 * A constructor object, such as `Option.some x` or a structure.
 *
 * Its object fields are stored in properties, as `f0`, `f1`, and so on, rather than in an array,
 * which would be a second allocation for every object. There is a subclass for each number of
 * object fields, `Ctor0` to `Ctor8`, so that V8 gives every object with the same number of fields
 * the same shape, and compiled programs define their own for more. Each subclass implements
 * `pushFields(xs)`, which pushes the object fields onto the array `xs`, in order.
 *
 * Scalar fields are stored as `s<offset>`, where `offset` is the field's byte offset in the C
 * runtime's layout, and are set after the object is constructed.
 */
export class Ctor {
  /** @param {number} tag */
  constructor(tag) {
    this[RC] = 1;
    this.tag = tag;
    live?.add(this);
  }
}

export class Ctor0 extends Ctor {
  pushFields(_xs) {}
}

export class Ctor1 extends Ctor {
  constructor(tag, f0) {
    super(tag);
    this.f0 = f0;
  }

  pushFields(xs) {
    xs.push(this.f0);
  }
}

export class Ctor2 extends Ctor {
  constructor(tag, f0, f1) {
    super(tag);
    this.f0 = f0;
    this.f1 = f1;
  }

  pushFields(xs) {
    xs.push(this.f0, this.f1);
  }
}

export class Ctor3 extends Ctor {
  constructor(tag, f0, f1, f2) {
    super(tag);
    this.f0 = f0;
    this.f1 = f1;
    this.f2 = f2;
  }

  pushFields(xs) {
    xs.push(this.f0, this.f1, this.f2);
  }
}

export class Ctor4 extends Ctor {
  constructor(tag, f0, f1, f2, f3) {
    super(tag);
    this.f0 = f0;
    this.f1 = f1;
    this.f2 = f2;
    this.f3 = f3;
  }

  pushFields(xs) {
    xs.push(this.f0, this.f1, this.f2, this.f3);
  }
}

export class Ctor5 extends Ctor {
  constructor(tag, f0, f1, f2, f3, f4) {
    super(tag);
    this.f0 = f0;
    this.f1 = f1;
    this.f2 = f2;
    this.f3 = f3;
    this.f4 = f4;
  }

  pushFields(xs) {
    xs.push(this.f0, this.f1, this.f2, this.f3, this.f4);
  }
}

export class Ctor6 extends Ctor {
  constructor(tag, f0, f1, f2, f3, f4, f5) {
    super(tag);
    this.f0 = f0;
    this.f1 = f1;
    this.f2 = f2;
    this.f3 = f3;
    this.f4 = f4;
    this.f5 = f5;
  }

  pushFields(xs) {
    xs.push(this.f0, this.f1, this.f2, this.f3, this.f4, this.f5);
  }
}

export class Ctor7 extends Ctor {
  constructor(tag, f0, f1, f2, f3, f4, f5, f6) {
    super(tag);
    this.f0 = f0;
    this.f1 = f1;
    this.f2 = f2;
    this.f3 = f3;
    this.f4 = f4;
    this.f5 = f5;
    this.f6 = f6;
  }

  pushFields(xs) {
    xs.push(this.f0, this.f1, this.f2, this.f3, this.f4, this.f5, this.f6);
  }
}

export class Ctor8 extends Ctor {
  constructor(tag, f0, f1, f2, f3, f4, f5, f6, f7) {
    super(tag);
    this.f0 = f0;
    this.f1 = f1;
    this.f2 = f2;
    this.f3 = f3;
    this.f4 = f4;
    this.f5 = f5;
    this.f6 = f6;
    this.f7 = f7;
  }

  pushFields(xs) {
    xs.push(this.f0, this.f1, this.f2, this.f3, this.f4, this.f5, this.f6, this.f7);
  }
}

const ctorClasses = [Ctor0, Ctor1, Ctor2, Ctor3, Ctor4, Ctor5, Ctor6, Ctor7, Ctor8];

/**
 * Returns a new constructor object with the tag `tag`, the object fields `fields`, of which there
 * may be at most 8, and the scalar fields `scalars`, keyed by byte offset. It owns the fields.
 */
export function mkCtor(tag, fields, scalars = null) {
  const x = new ctorClasses[fields.length](tag, ...fields);
  if (scalars !== null) {
    for (const [offset, value] of Object.entries(scalars)) {
      x[`s${offset}`] = value;
    }
  }
  return x;
}

/** Returns the object fields of the constructor object `x`, in order. */
export function ctorFields(x) {
  const xs = [];
  x.pushFields(xs);
  return xs;
}

/** Returns the scalar fields of the constructor object `x`, as `[offset, value]` pairs by offset. */
export function scalarFields(x) {
  return Object.keys(x)
    .filter((key) => /^s\d+$/.test(key))
    .map((key) => [Number(key.slice(1)), x[key]])
    .sort(([i], [j]) => i - j);
}

export class Closure {
  constructor(fn, arity, args) {
    this[RC] = 1;
    this.fn = fn;
    this.arity = arity;
    this.args = args;
    live?.add(this);
  }
}

/** A mutable reference cell, `ST.Ref`, which owns its value. */
export class Ref {
  constructor(value) {
    this[RC] = 1;
    this.value = value;
    live?.add(this);
  }
}

/** A lazily computed value, `Thunk`. Until it is forced, `fn` holds the closure that computes it. */
export class Thunk {
  constructor(fn, value) {
    this[RC] = 1;
    this.fn = fn;
    this.value = value;
    live?.add(this);
  }
}

/**
 * A `Task`. A finished task owns its `value`, and has `waiters === null`. An unfinished task is
 * waiting for a promise to be resolved, and `waiters` holds the continuations to run when it
 * finishes, each of which owns its function `f` (or `0` if it has none) and the task `target` that
 * it finishes. A continuation may instead be a JS function `js`, with `f` and `target` both `0`.
 */
export class Task {
  constructor(value, waiters = null) {
    this[RC] = 1;
    this.value = value;
    this.waiters = waiters;
    live?.add(this);
  }
}

/**
 * The key of a method that an object of a class not defined here may define to return its reference
 * counted children.
 */
export const CHILDREN = Symbol("children");

/**
 * The persistent refs and tasks, if debug checks are enabled. Values stored in them after they were
 * made persistent, such as the value a task finishes with, are reference counted but never freed,
 * so they are not leaks.
 */
const persistentCells = live === undefined ? undefined : [];

function useAfterFree(op, x) {
  throw new Error(`LeanScript: ${op} of freed object ${x?.constructor?.name}`);
}

/** Marks `x` as freed. Its children must already have been decremented or moved elsewhere. */
function release(x) {
  x[RC] = FREED;
  if (live !== undefined) {
    live.delete(x);
    if (Array.isArray(x)) {
      x.length = 0;
    } else {
      for (const key of Object.keys(x)) {
        x[key] = null;
      }
    }
  }
}

function describe(x) {
  if (x instanceof Ctor) {
    return `constructor ${x.tag} with ${ctorFields(x).length} fields`;
  }
  if (x instanceof Closure) {
    return `closure of ${x.fn.name} with ${x.args.length}/${x.arity} arguments`;
  }
  if (Array.isArray(x)) {
    return `array of size ${x.length}`;
  }
  if (x instanceof Ref) {
    return "ref";
  }
  if (x instanceof Thunk) {
    return x.fn === null ? "evaluated thunk" : "unevaluated thunk";
  }
  if (x instanceof Task) {
    return x.waiters === null ? "finished task" : "unfinished task";
  }
  return typeof x.describe === "function" ? x.describe() : String(x?.constructor?.name);
}

/**
 * Reports every allocated object that has not been freed or made persistent, if debug checks are
 * enabled. Returns whether there were any.
 */
export function checkLeaks() {
  if (live === undefined) {
    return false;
  }
  const reachable = new Set();
  const todo = persistentCells.flatMap((c) => children(c));
  while (todo.length > 0) {
    const x = todo.pop();
    if (typeof x !== "object" || x === null || reachable.has(x)) {
      continue;
    }
    reachable.add(x);
    for (const c of children(x) ?? []) {
      todo.push(c);
    }
  }
  const leaked = [...live].filter((x) => x[RC] > 0 && !reachable.has(x));
  if (leaked.length === 0) {
    return false;
  }
  const shown = leaked.slice(0, 10).map((x) => `  ${describe(x)} (rc ${x[RC]})\n`);
  const more =
    leaked.length > shown.length ? `  ...and ${leaked.length - shown.length} more\n` : "";
  writeStderr(`LeanScript: ${leaked.length} objects leaked:\n${shown.join("")}${more}`);
  return true;
}

/** Returns the reference counted children of `x`, which must be an object. */
function children(x) {
  if (x instanceof Ctor) {
    return ctorFields(x);
  }
  if (x instanceof Closure) {
    return x.args;
  }
  if (Array.isArray(x)) {
    return x;
  }
  if (x instanceof Ref) {
    return [x.value];
  }
  if (x instanceof Thunk) {
    return [x.fn ?? x.value];
  }
  if (x instanceof Task) {
    return x.waiters === null ? [x.value] : x.waiters.flatMap((w) => [w.f, w.target]);
  }
  return x[CHILDREN]?.();
}

export function inc(x) {
  if (typeof x !== "object" || x === null) {
    return;
  }
  const rc = x[RC];
  if (rc > 0) {
    x[RC] = rc + 1;
  } else if (rc === FREED) {
    useAfterFree("inc", x);
  }
}

export function incN(x, n) {
  if (typeof x !== "object" || x === null) {
    return;
  }
  const rc = x[RC];
  if (rc > 0) {
    x[RC] = rc + n;
  } else if (rc === FREED) {
    useAfterFree("inc", x);
  }
}

export function dec(x) {
  if (typeof x !== "object" || x === null) {
    return;
  }
  const rc = x[RC];
  if (rc > 1) {
    x[RC] = rc - 1;
  } else if (rc === 1) {
    free(x);
  } else if (rc === FREED) {
    useAfterFree("dec", x);
  }
}

// The references that freeing has given up and not yet decremented, which may be to scalars. It is
// shared by every call to `free`, so that freeing allocates nothing, and each call only pops what it
// pushed, in case a finalizer frees something.
const refs = [];

/**
 * Frees `x` and decrements its children, using a worklist so that long lists cannot overflow. Freed
 * objects other than constructors that have a `finalize` method, such as file handles, are finalized
 * before their children are decremented.
 */
function free(x) {
  const base = refs.length;
  let o = x;
  while (o !== undefined) {
    if (o instanceof Ctor) {
      o.pushFields(refs);
    } else {
      o.finalize?.();
      const cs = children(o);
      if (cs !== undefined) {
        // Only children that may be freed go on the worklist, which for a large array is few.
        for (let i = 0; i < cs.length; i++) {
          const c = cs[i];
          if (typeof c !== "object" || c === null) {
            continue;
          }
          const rc = c[RC];
          if (rc > 1) {
            c[RC] = rc - 1;
          } else {
            refs.push(c);
          }
        }
      }
    }
    release(o);
    o = undefined;
    while (o === undefined && refs.length > base) {
      const c = refs.pop();
      if (typeof c !== "object" || c === null) {
        continue;
      }
      const rc = c[RC];
      if (rc > 1) {
        c[RC] = rc - 1;
      } else if (rc === 1) {
        o = c;
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
  if (typeof x === "object" && x !== null) {
    release(x);
  }
}

export function isExclusive(x) {
  return x[RC] === 1;
}

export function isShared(x) {
  return x[RC] === 1 ? 0 : 1;
}

/**
 * The `reset` instruction: if `x` is exclusive, releases its first `n` fields and returns it for
 * reuse. Otherwise, gives up our reference to `x` and returns `0`.
 */
export function reset(x, n) {
  if (x[RC] === 1) {
    const fields = ctorFields(x);
    for (let i = 0; i < n; i++) {
      dec(fields[i]);
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
    if (typeof o !== "object" || o === null || !(o[RC] > 0)) {
      continue;
    }
    o[RC] = 0;
    if (o instanceof Ref || o instanceof Task) {
      persistentCells?.push(o);
    }
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

/** Thrown by `internalPanic` to stop the program. */
export class InternalPanic extends Error {}

/**
 * Stops the program with the message `msg`, like `lean_internal_panic`. Like the C runtime, which
 * exits immediately, nothing is freed on the way out.
 */
export function internalPanic(msg) {
  throw new InternalPanic(msg);
}

let initializing = false;

/** Returns whether the program is running its initializers, before `main`. */
export const isInitializing = () => initializing;

export function setInitializing(value) {
  initializing = value;
}

/** Reports the panic message `msg` and returns `defaultValue`, as `lean_panic_fn` does. */
export function panic(defaultValue, msg) {
  writeStderr(`${msg}\n`);
  return defaultValue;
}

// The constants being initialized, to catch a constant that depends on itself.
const initializingConsts = new Set();

/**
 * Computes the value of the constant `c` with `init`, and marks it persistent, as the C runtime does
 * for the values of global constants.
 */
export function initConst(c, init) {
  if (initializingConsts.has(c)) {
    throw new Error("LeanScript: cyclic constant initialization");
  }
  initializingConsts.add(c);
  try {
    return markPersistent(init());
  } finally {
    initializingConsts.delete(c);
  }
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
  const args = f.args;
  if (f[RC] === 1) {
    del(f);
    return args;
  }
  for (const arg of args) {
    inc(arg);
  }
  dec(f);
  return args;
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
    list = new Ctor2(1, xs[i], list);
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
    xs.push(list.f0);
    list = list.f1;
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
