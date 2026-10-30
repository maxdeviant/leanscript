// Signal handlers, which the main thread installs on behalf of the thread that runs Lean code, as
// Node only delivers signals to the main thread. Each signal received is answered with a `signal`
// event, as `events.js` describes, whose `id` is the handler's.
//
// Handlers never keep the process running: the thread that runs Lean code does that while it waits
// for a signal.

import { postEvent } from "./events.js";

/** The installed handlers, by ID, as `{ name, listener }`. */
const handlers = new Map();

/**
 * Installs the handler `id` for the signal `name`, such as `SIGINT`, which handles it once, and is
 * then removed, if `once` is set.
 */
export function signalListen(id, name, once) {
  const listener = () => {
    if (once) {
      signalUnlisten(id);
    }
    postEvent({ id, kind: "signal" });
  };
  process.on(name, listener);
  handlers.set(id, { name, listener });
}

/**
 * Removes the handler `id`, if it is installed. Like libuv, Node restores the signal's default
 * action once it has no handlers left.
 */
export function signalUnlisten(id) {
  const handler = handlers.get(id);
  if (handler !== undefined) {
    process.off(handler.name, handler.listener);
    handlers.delete(id);
  }
}
