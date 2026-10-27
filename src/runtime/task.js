// `Task`, and the `BaseIO` operations on tasks (see `Task` in `core.js`).
//
// There is only one thread, so every task runs to completion when it is created, which is a valid
// schedule for the C runtime's thread pool. Priorities and the `sync` flag only affect scheduling,
// so they are ignored. A task can only be canceled after it has finished, so cancellation has no
// effect.
//
// Each extern follows the ownership conventions of its C counterpart.

import { apply, dec, del, inc, Task } from "./core.js";

/** The `IO.TaskState.finished` constructor. */
const FINISHED = 2;

/** Takes ownership of the task `t` and returns its value, which the caller then owns. */
function take(t) {
  const value = t.value;
  if (t.rc === 1) {
    del(t);
  } else {
    inc(value);
    dec(t);
  }
  return value;
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
    return new Task(apply(f, [take(t)]));
  },
  "Task.bind": (_α, _β, t, f, prio, _sync) => {
    dec(prio);
    return apply(f, [take(t)]);
  },
  "BaseIO.asTask": (_α, act, prio, _w) => {
    dec(prio);
    return new Task(apply(act, [0]));
  },
  "BaseIO.mapTask": (_α, _β, f, t, prio, _sync, _w) => {
    dec(prio);
    return new Task(apply(f, [take(t), 0]));
  },
  "BaseIO.bindTask": (_α, _β, t, f, prio, _sync, _w) => {
    dec(prio);
    return apply(f, [take(t), 0]);
  },
  "IO.wait": (_α, t, _w) => take(t),
  // Every task has finished, so the first one is as good as any.
  "IO.waitAny": (_α, tasks, _h, _w) => {
    const value = tasks.f[0].value;
    inc(value);
    return value;
  },
  "IO.cancel": (_α, _t, _w) => 0,
  "IO.checkCanceled": (_w) => 0,
  "IO.getTaskState": (_α, _t, _w) => FINISHED,
};
