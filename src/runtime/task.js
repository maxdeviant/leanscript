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
// Each extern follows the ownership conventions of its C counterpart.

import { apply, CHILDREN, Ctor, dec, del, inc, panic, Task, track } from "./core.js";

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
    this.rc = 1;
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
  if (t.rc === 1) {
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
function run({ f, target, io, bind }, value) {
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

  "IO.Promise.new": (_α, _inst, _w) => new IOPromise(),
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
    if (o.rc === 1) {
      del(o);
    } else {
      inc(value);
      dec(o);
    }
    return value;
  },
};
