// `Std.Internal.UV.Timer`, which resolves promises after some time.
//
// The states and the transitions between them follow the C runtime's `timer.cpp`, and the
// scheduling follows libuv's `uv_timer_start`, which it uses.

import { CHILDREN, dec, inc, RC, track } from "../core.js";
import { ioOk } from "../io.js";
import { IoPromise, isResolved, resolvePromise } from "../task.js";

const INITIAL = 0;
const RUNNING = 1;
const FINISHED = 2;

/** The longest delay, in milliseconds, that `setTimeout` waits for without firing at once. */
const MAX_DELAY = 2 ** 31 - 1;

/**
 * A `Timer`. It owns its current promise, if any, which `next` returns. While it is running, its
 * scheduled callback owns a reference to it, so that it stays alive until it finishes.
 */
class Timer {
  /**
   * @param {number} timeout In milliseconds.
   * @param {boolean} repeating
   */
  constructor(timeout, repeating) {
    this[RC] = 1;
    this.timeout = timeout;
    this.repeating = repeating;
    this.state = INITIAL;
    /** @type {IoPromise | null} */
    this.promise = null;
    /** The handle of the scheduled `setTimeout`, or `null`. */
    this.handle = null;
    track(this);
  }

  [CHILDREN]() {
    return this.promise === null ? [] : [this.promise];
  }

  describe() {
    return `timer of ${this.timeout}ms`;
  }

  /**
   * Like `uv_timer_start`, schedules `tick` after `delay` milliseconds and then every `repeat`
   * milliseconds, unless `repeat` is 0, replacing what was scheduled before.
   */
  start(delay, repeat) {
    this.stop();
    const fire = () => {
      // libuv schedules the next repetition before calling the callback, which can stop it.
      this.schedule(repeat > 0 ? repeat : null, fire);
      this.tick();
    };
    this.schedule(delay, fire);
  }

  /** Schedules `fire` after `delay` milliseconds, or unschedules it if `delay` is `null`. */
  schedule(delay, fire) {
    if (delay === null) {
      this.handle = null;
    } else if (delay > MAX_DELAY) {
      this.handle = setTimeout(() => this.schedule(delay - MAX_DELAY, fire), MAX_DELAY);
    } else {
      this.handle = setTimeout(fire, delay);
    }
  }

  /** Like `uv_timer_stop`. */
  stop() {
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }

  /** Like `handle_timer_event`. */
  tick() {
    if (this.repeating) {
      if (this.promise !== null && !isResolved(this.promise)) {
        resolvePromise(this.promise, 0);
      }
    } else {
      // The promise's continuations run as soon as it is resolved, and may cancel the timer, so it
      // must have finished by then. In the C runtime, they wait for the event loop's lock instead.
      this.stop();
      this.state = FINISHED;
      if (this.promise !== null) {
        resolvePromise(this.promise, 0);
      }
      // The scheduled callback no longer needs to keep the timer alive.
      dec(this);
    }
  }

  /** Drops the timer's promise, if any. */
  dropPromise() {
    if (this.promise !== null) {
      dec(this.promise);
      this.promise = null;
    }
  }
}

/** Returns the borrowed `promise`, which the caller then also owns. */
function share(promise) {
  inc(promise);
  return promise;
}

const Std_Internal_UV_Timer_mk = (timeout, repeating, _w) =>
  ioOk(new Timer(Number(timeout), repeating === 1));
export { Std_Internal_UV_Timer_mk as "Std.Internal.UV.Timer.mk" };

const Std_Internal_UV_Timer_next = (timer, _w) => {
  if (timer.state === INITIAL) {
    timer.promise = new IoPromise();
    timer.state = RUNNING;
    // The scheduled callback keeps the timer alive while it is running.
    inc(timer);
    // A repeating timer resolves its first promise right away, for the 0th multiple of the
    // timeout.
    timer.start(timer.repeating ? 0 : timer.timeout, timer.repeating ? timer.timeout : 0);
    return ioOk(share(timer.promise));
  }
  if (timer.repeating && timer.state === RUNNING) {
    if (timer.promise === null || isResolved(timer.promise)) {
      timer.dropPromise();
      timer.promise = new IoPromise();
    }
    return ioOk(share(timer.promise));
  }
  // Like the C runtime, a timer without a promise returns a new one that it never resolves, so
  // that it resolves to `none` once it is dropped.
  return ioOk(timer.promise === null ? new IoPromise() : share(timer.promise));
};
export { Std_Internal_UV_Timer_next as "Std.Internal.UV.Timer.next" };

const Std_Internal_UV_Timer_reset = (timer, _w) => {
  if (timer.state === RUNNING) {
    timer.start(timer.timeout, timer.repeating ? timer.timeout : 0);
  }
  return ioOk(0);
};
export { Std_Internal_UV_Timer_reset as "Std.Internal.UV.Timer.reset" };

const Std_Internal_UV_Timer_stop = (timer, _w) => {
  timer.dropPromise();
  if (timer.state === RUNNING) {
    timer.stop();
    timer.state = FINISHED;
    dec(timer);
  }
  return ioOk(0);
};
export { Std_Internal_UV_Timer_stop as "Std.Internal.UV.Timer.stop" };

const Std_Internal_UV_Timer_cancel = (timer, _w) => {
  if (timer.state === RUNNING && timer.promise !== null) {
    timer.dropPromise();
    // A repeating timer keeps ticking, but resolves nothing until `next` is called again.
    if (!timer.repeating) {
      timer.stop();
      timer.state = INITIAL;
      dec(timer);
    }
  }
  return ioOk(0);
};
export { Std_Internal_UV_Timer_cancel as "Std.Internal.UV.Timer.cancel" };
