// The externs of `task.js`.

import { apply, dec, del, inc, internalPanic, isInitializing, panic, RC, Task } from "../core.js";
import {
  BLOCKED,
  FINISHED,
  IoPromise,
  RUNNING,
  WAITING,
  blockedForever,
  promiseTasks,
  resolvePromise,
  take,
  thenTask,
} from "../task.js";

const Task_pure = (_α, a) => new Task(a);
export { Task_pure as "Task.pure" };

const Task_get = (_α, t) => take(t);
export { Task_get as "Task.get" };

const Task_spawn = (_α, fn, prio) => {
  dec(prio);
  return new Task(apply(fn, [0]));
};
export { Task_spawn as "Task.spawn" };

const Task_map = (_α, _β, f, t, prio, _sync) => {
  dec(prio);
  return thenTask(t, f, false, false);
};
export { Task_map as "Task.map" };

const Task_bind = (_α, _β, t, f, prio, _sync) => {
  dec(prio);
  return thenTask(t, f, false, true);
};
export { Task_bind as "Task.bind" };

const BaseIO_asTask = (_α, act, prio, _w) => {
  dec(prio);
  return new Task(apply(act, [0]));
};
export { BaseIO_asTask as "BaseIO.asTask" };

const BaseIO_mapTask = (_α, _β, f, t, prio, _sync, _w) => {
  dec(prio);
  return thenTask(t, f, true, false);
};
export { BaseIO_mapTask as "BaseIO.mapTask" };

const BaseIO_bindTask = (_α, _β, t, f, prio, _sync, _w) => {
  dec(prio);
  return thenTask(t, f, true, true);
};
export { BaseIO_bindTask as "BaseIO.bindTask" };

const IO_wait = (_α, t, _w) => take(t);
export { IO_wait as "IO.wait" };

const IO_waitAny = (_α, tasks, _h, _w) => {
  for (let l = tasks; l !== 0; l = l.f1) {
    const t = l.f0;
    if (t.waiters === null) {
      inc(t.value);
      return t.value;
    }
  }
  throw blockedForever();
};
export { IO_waitAny as "IO.waitAny" };

const IO_cancel = (_α, _t, _w) => 0;
export { IO_cancel as "IO.cancel" };

const IO_checkCanceled = (_w) => 0;
export { IO_checkCanceled as "IO.checkCanceled" };

const IO_getTaskState = (_α, t, _w) => {
  if (t.waiters === null) {
    return FINISHED;
  }
  return promiseTasks.has(t) ? RUNNING : WAITING;
};
export { IO_getTaskState as "IO.getTaskState" };

// The C runtime's task manager only starts after the initializers have run.
const IO_Promise_new = (_α, _inst, _w) => {
  if (isInitializing()) {
    internalPanic(
      "`IO.Promise.new` called before the task manager is running; this typically happens when called (directly or transitively, e.g. via `IO.CancelToken.new`) from an `initialize` block. Construct lazily on first use instead.",
    );
  }
  return new IoPromise();
};
export { IO_Promise_new as "IO.Promise.new" };

// Only the first call has an effect.
const IO_Promise_resolve = (_α, value, promise, _w) => {
  resolvePromise(promise, value);
  return 0;
};
export { IO_Promise_resolve as "IO.Promise.resolve" };

const IO_Promise_resultOpt = (_α, promise) => {
  inc(promise.task);
  return promise.task;
};
export { IO_Promise_resultOpt as "IO.Promise.result?" };

const _private_Init_System_Promise_0_IO_Option_getOrBlockBang = (_α, _inst, o) => {
  if (o === 0) {
    panic(0, "LeanScript: `Promise.result!` of a promise that was dropped without being resolved");
    throw BLOCKED;
  }
  const value = o.f0;
  if (o[RC] === 1) {
    del(o);
  } else {
    inc(value);
    dec(o);
  }
  return value;
};
export { _private_Init_System_Promise_0_IO_Option_getOrBlockBang as "_private.Init.System.Promise.0.IO.Option.getOrBlock!" };
