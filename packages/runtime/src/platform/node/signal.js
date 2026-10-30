// `Std.Internal.UV.Signal`, which resolves promises when the process receives a signal.
//
// The states and the transitions between them follow the C runtime's `signal.cpp`. The main thread
// installs the handlers, as `signals.js` describes.

import { constants } from "node:os";
import { CHILDREN, dec, inc, RC, track } from "../../core.js";
import { ioOk } from "../../io.js";
import { IoPromise, isResolved, resolvePromise } from "../../task.js";
import { awaitMainEvent, mainEventArrived, newMainId, onMainEvent, postMain } from "./host.js";
import { fail } from "./results.js";

const INITIAL = 0;
const RUNNING = 1;
const FINISHED = 2;

/**
 * The names of the signals that `Signal.mk` takes, by the numbers that Linux gives them, which
 * `Std.Async.Signal` uses on every platform.
 */
const NAMES = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  5: "SIGTRAP",
  6: "SIGABRT",
  10: "SIGUSR1",
  12: "SIGUSR2",
  14: "SIGALRM",
  15: "SIGTERM",
  17: "SIGCHLD",
  18: "SIGCONT",
  20: "SIGTSTP",
  21: "SIGTTIN",
  22: "SIGTTOU",
  23: "SIGURG",
  24: "SIGXCPU",
  25: "SIGXFSZ",
  26: "SIGVTALRM",
  27: "SIGPROF",
  28: "SIGWINCH",
  29: "SIGIO",
  31: "SIGSYS",
};

/** The running signals, by the ID of their installed handler, to route events to. */
const handlers = new Map();

let listening = false;

function handleEvent(event) {
  if (event.kind === "signal") {
    handlers.get(event.id)?.receive();
  }
}

/**
 * A `Signal`. It owns its current promise, if any, which `next` returns. While it is running, its
 * installed handler owns a reference to it, so that it stays alive until it finishes.
 */
class Signal {
  /**
   * @param {number} signum The signal's number on Linux.
   * @param {boolean} repeating
   */
  constructor(signum, repeating) {
    this[RC] = 1;
    /** The signal's name, or `null` if it is not one that can be handled. */
    this.name = NAMES[signum] ?? null;
    this.repeating = repeating;
    this.state = INITIAL;
    /** @type {IoPromise | null} */
    this.promise = null;
    /** The ID of the installed handler, or `null`. */
    this.handlerId = null;
    /** Whether the program keeps running for the current promise. */
    this.waiting = false;
    track(this);
  }

  [CHILDREN]() {
    return this.promise === null ? [] : [this.promise];
  }

  describe() {
    return `${this.name ?? "unknown"} signal handler`;
  }

  /** Like `uv_signal_start`, installs the handler. */
  listen() {
    if (!listening) {
      onMainEvent("signals", handleEvent);
      listening = true;
    }
    this.handlerId = newMainId();
    handlers.set(this.handlerId, this);
    postMain("signalListen", [this.handlerId, this.name, !this.repeating]);
  }

  /** Like `uv_signal_stop`, removes the handler, if it is installed. */
  unlisten() {
    if (this.handlerId !== null) {
      handlers.delete(this.handlerId);
      postMain("signalUnlisten", [this.handlerId]);
      this.handlerId = null;
    }
  }

  /**
   * Keeps the program running while the signal is running and its promise is unresolved, as only
   * then can something be waiting for the signal.
   */
  updateWaiting() {
    const waiting = this.state === RUNNING && this.promise !== null && !isResolved(this.promise);
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      if (waiting) {
        awaitMainEvent();
      } else {
        mainEventArrived();
      }
    }
  }

  /** Like `handle_signal_event`. */
  receive() {
    // The promise's continuations run as soon as it is resolved, and may stop or cancel the signal,
    // and drop every other reference to it.
    inc(this);
    const signum = constants.signals[this.name];
    if (this.repeating) {
      if (this.promise !== null && !isResolved(this.promise)) {
        resolvePromise(this.promise, signum);
      }
    } else {
      // A signal that is not repeating must have finished by the time its continuations run.
      this.unlisten();
      this.state = FINISHED;
      if (this.promise !== null) {
        resolvePromise(this.promise, signum);
      }
      // The installed handler no longer needs to keep the signal alive.
      dec(this);
    }
    this.updateWaiting();
    dec(this);
  }

  /** Drops the signal's promise, if any. */
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

/** Starts the signal, which is initial, and returns its first promise. */
function start(signal) {
  // libuv only checks the signal number when it starts.
  if (signal.name === null) {
    return fail("EINVAL");
  }
  signal.promise = new IoPromise();
  signal.state = RUNNING;
  // The installed handler keeps the signal alive while it is running.
  inc(signal);
  signal.listen();
  signal.updateWaiting();
  return ioOk(share(signal.promise));
}

export const externs = {
  "Std.Internal.UV.Signal.mk": (signum, repeating, _w) => ioOk(new Signal(signum, repeating === 1)),
  "Std.Internal.UV.Signal.next": (signal, _w) => {
    if (signal.state === INITIAL) {
      return start(signal);
    }
    if (signal.repeating && signal.state === RUNNING) {
      if (signal.promise === null || isResolved(signal.promise)) {
        signal.dropPromise();
        signal.promise = new IoPromise();
        signal.updateWaiting();
      }
      return ioOk(share(signal.promise));
    }
    // Like the C runtime, a signal without a promise returns a new one that it never resolves, so
    // that it resolves to `none` once it is dropped.
    return ioOk(signal.promise === null ? new IoPromise() : share(signal.promise));
  },
  "Std.Internal.UV.Signal.stop": (signal, _w) => {
    if (signal.state === RUNNING) {
      signal.unlisten();
      signal.dropPromise();
      signal.state = FINISHED;
      signal.updateWaiting();
      dec(signal);
    }
    return ioOk(0);
  },
  "Std.Internal.UV.Signal.cancel": (signal, _w) => {
    if (signal.state === RUNNING && signal.promise !== null) {
      signal.dropPromise();
      if (signal.repeating) {
        // A repeating signal keeps its handler, but resolves nothing until `next` is called again.
        signal.updateWaiting();
      } else {
        signal.unlisten();
        signal.state = INITIAL;
        signal.updateWaiting();
        dec(signal);
      }
    }
    return ioOk(0);
  },
};
