// Events that the main thread posts to the thread that runs Lean code, which answer its requests
// later, or tell it that something happened, such as a signal. Each event has a `kind`, and the `id`
// that the thread gave to what it is about.

/** @type {import("node:worker_threads").MessagePort | undefined} */
let port;

/** Sets the port that events are posted to. */
export function setEventPort(eventPort) {
  port = eventPort;
}

/** Posts `event`, transferring the buffers in `transfer`. */
export const postEvent = (event, transfer) => port.postMessage(event, transfer);
