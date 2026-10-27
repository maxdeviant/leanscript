// `Task`, `IO.Promise`, and the `BaseIO` operations on tasks (see `Task` in `core.js`).
//
// There is only one thread, so every task runs to completion when it is created, which is a valid
// schedule for the C runtime's thread pool. Priorities and the `sync` flag only affect scheduling,
// so they are ignored. A task can only be canceled after it has finished, so cancellation has no
// effect.
//
// The exception is a task that depends on a promise, which cannot finish until the promise is
// resolved. Its continuations wait on the promise's task instead, and run when it is resolved, or
// when it is dropped and resolves to `none`. Waiting for an unfinished task would block forever, as
// nothing else can run to resolve the promise, so it throws instead.
//
// A task can also wait for a JS promise, and run its continuations when the promise settles. A JS
// promise can likewise wait for a task.
//
// Each extern follows the ownership conventions of its C counterpart.

import {
  apply,
  CHILDREN,
  Ctor,
  dec,
  del,
  inc,
  internalPanic,
  isInitializing,
  panic,
  RC,
  Task,
  track,
} from "./core.js";
import { userError } from "./io.js";

/** The `IO.TaskState.waiting` constructor. */
const WAITING = 0;
/** The `IO.TaskState.running` constructor. */
const RUNNING = 1;
/** The `IO.TaskState.finished` constructor. */
const FINISHED = 2;

/** Thrown by a continuation that blocks forever, which leaves its task unfinished. */
const BLOCKED = Symbol("blocked");

/**
 * The result tasks of promises. Like the C runtime, we consider these to be running until they are
 * resolved, rather than waiting for another task.
 */
const promiseTasks = new WeakSet();

/** An `IO.Promise`, which owns its result task, and resolves it to `none` if it is dropped. */
class IOPromise {
  constructor() {
    this[RC] = 1;
    this.task = new Task(0, []);
    promiseTasks.add(this.task);
    track(this);
  }

  [CHILDREN]() {
    return [this.task];
  }

  finalize() {
    if (this.task.waiters !== null) {
      finish(this.task, 0);
    }
  }

  describe() {
    return this.task.waiters === null ? "resolved promise" : "unresolved promise";
  }
}

function blockedForever() {
  return new Error(
    "LeanScript: waited for a task that has not finished, which would block forever, as nothing else can run to finish it",
  );
}

/** Takes ownership of the finished task `t` and returns its value, which the caller then owns. */
function take(t) {
  if (t.waiters !== null) {
    throw blockedForever();
  }
  const value = t.value;
  if (t[RC] === 1) {
    del(t);
  } else {
    inc(value);
    dec(t);
  }
  return value;
}

/** Finishes the unfinished task `t` with the owned `value`, and runs its continuations. */
function finish(t, value) {
  const waiters = t.waiters;
  t.waiters = null;
  t.value = value;
  for (const w of waiters) {
    inc(value);
    run(w, value);
  }
}

/**
 * Runs the continuation `w` on the owned `value`, and finishes its target with the result. A
 * continuation without a function passes `value` on unchanged.
 */
function run({ f, target, io, bind, js }, value) {
  if (js !== undefined) {
    js(value);
    return;
  }
  let result;
  try {
    result = f === 0 ? value : apply(f, io ? [value, 0] : [value]);
  } catch (e) {
    if (e !== BLOCKED) {
      throw e;
    }
    dec(target);
    return;
  }
  if (!bind) {
    finish(target, result);
    dec(target);
  } else if (result.waiters === null) {
    finish(target, take(result));
    dec(target);
  } else {
    result.waiters.push({ f: 0, target, io: false, bind: false });
    dec(result);
  }
}

/**
 * Returns a task that runs the owned function `f` on the value of the owned task `t` once it has
 * finished. If `io`, `f` is a `BaseIO` function. If `bind`, `f` returns a task, which the returned
 * task then finishes with.
 */
function then(t, f, io, bind) {
  const target = new Task(0, []);
  inc(target);
  const w = { f, target, io, bind };
  if (t.waiters === null) {
    run(w, take(t));
  } else {
    t.waiters.push(w);
    dec(t);
  }
  return target;
}

/**
 * Returns a task, of type `Task (Except IO.Error JsValue)`, that finishes when the JS value `p`
 * settles, if it is a promise, or right after the current turn of the event loop otherwise. A
 * rejection becomes an `IO.userError` with the rejection reason as its message.
 */
export function taskOfJsPromise(p) {
  const t = new Task(0, []);
  promiseTasks.add(t);
  // The reference that the callbacks below hold until `p` settles.
  inc(t);
  const settle = (result) => {
    finish(t, result);
    dec(t);
  };
  Promise.resolve(p).then(
    (v) => settle(new Ctor(1, [v], null)),
    (e) => settle(new Ctor(0, [userError(String(e))], null)),
  );
  return t;
}

/**
 * Takes ownership of the task `t`, of type `Task (Except String JsValue)`, and returns a JS promise
 * that settles when it finishes: it fulfills with the value, or rejects with an `Error` with the
 * error message.
 */
export function jsPromiseOfTask(t) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const settle = (result) => {
    const value = result.f[0];
    if (result.tag === 1) {
      resolve(value);
    } else {
      reject(new Error(value.toString()));
    }
    dec(result);
  };
  if (t.waiters === null) {
    settle(take(t));
  } else {
    t.waiters.push({ f: 0, target: 0, io: false, bind: false, js: settle });
    dec(t);
  }
  return promise;
}

export const externs = {
  "Task.pure": (_α, a) => new Task(a),
  "Task.get": (_α, t) => take(t),
  "Task.spawn": (_α, fn, prio) => {
    dec(prio);
    return new Task(apply(fn, [0]));
  },
  "Task.map": (_α, _β, f, t, prio, _sync) => {
    dec(prio);
    return then(t, f, false, false);
  },
  "Task.bind": (_α, _β, t, f, prio, _sync) => {
    dec(prio);
    return then(t, f, false, true);
  },
  "BaseIO.asTask": (_α, act, prio, _w) => {
    dec(prio);
    return new Task(apply(act, [0]));
  },
  "BaseIO.mapTask": (_α, _β, f, t, prio, _sync, _w) => {
    dec(prio);
    return then(t, f, true, false);
  },
  "BaseIO.bindTask": (_α, _β, t, f, prio, _sync, _w) => {
    dec(prio);
    return then(t, f, true, true);
  },
  "IO.wait": (_α, t, _w) => take(t),
  "IO.waitAny": (_α, tasks, _h, _w) => {
    for (let l = tasks; l !== 0; l = l.f[1]) {
      const t = l.f[0];
      if (t.waiters === null) {
        inc(t.value);
        return t.value;
      }
    }
    throw blockedForever();
  },
  "IO.cancel": (_α, _t, _w) => 0,
  "IO.checkCanceled": (_w) => 0,
  "IO.getTaskState": (_α, t, _w) => {
    if (t.waiters === null) {
      return FINISHED;
    }
    return promiseTasks.has(t) ? RUNNING : WAITING;
  },

  // The C runtime's task manager only starts after the initializers have run.
  "IO.Promise.new": (_α, _inst, _w) => {
    if (isInitializing()) {
      internalPanic(
        "`IO.Promise.new` called before the task manager is running; this typically happens when called (directly or transitively, e.g. via `IO.CancelToken.new`) from an `initialize` block. Construct lazily on first use instead.",
      );
    }
    return new IOPromise();
  },
  // Only the first call has an effect.
  "IO.Promise.resolve": (_α, value, promise, _w) => {
    if (promise.task.waiters === null) {
      dec(value);
    } else {
      finish(promise.task, new Ctor(1, [value], null));
    }
    return 0;
  },
  "IO.Promise.result?": (_α, promise) => {
    inc(promise.task);
    return promise.task;
  },
  "_private.Init.System.Promise.0.IO.Option.getOrBlock!": (_α, _inst, o) => {
    if (o === 0) {
      panic(
        0,
        "LeanScript: `Promise.result!` of a promise that was dropped without being resolved",
      );
      throw BLOCKED;
    }
    const value = o.f[0];
    if (o[RC] === 1) {
      del(o);
    } else {
      inc(value);
      dec(o);
    }
    return value;
  },
};
