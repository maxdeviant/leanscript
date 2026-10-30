// TCP sockets, which the main thread runs on behalf of the thread that runs Lean code.
//
// Listening must report its errors and the address it got before it returns, which only a thread
// that can wait for Node to finish listening can do, so the sockets live here rather than with the
// Lean code. Requests that complete later, such as connecting and reading, are answered with events
// on the event port, each of which has the `id` of its socket and a `kind`:
//
// - `connect`, with an `error` code or the socket's `local` and `remote` addresses.
// - `data`, with `bytes`, `eof`, or `error`, with a code, each answering one `tcpRead`.
// - `sent` and `shutdown`, with an `error` code if they failed, answering `tcpSend` and
//   `tcpShutdown` in order.
// - `accept`, with the accepted `client`, as `tcpTryAccept` returns it, answering `tcpAccept`.
//
// Sockets are unreferenced, so they never keep the process running: the thread that runs Lean code
// does that while it waits for an event.

import * as net from "node:net";

/** @type {import("node:worker_threads").MessagePort | undefined} */
let events;

/** Sets the port that events are posted to. */
export function setSocketEventPort(port) {
  events = port;
}

/**
 * The sockets and servers, by ID. The thread that runs Lean code picks the IDs of the sockets it
 * creates, which are positive, and accepted sockets get negative ones, so that they never clash.
 */
const sockets = new Map();

let lastAcceptedId = 0;

const post = (msg, transfer) => events.postMessage(msg, transfer);

const address = (address, port) => ({ address, port });

/** An open connection. */
class Connection {
  /** @param {net.Socket} socket */
  constructor(id, socket) {
    this.id = id;
    this.socket = socket;
    /** Whether a read is waiting for data. */
    this.reading = false;
    /** The code of the error that ended the connection, reported to every read from then on. */
    this.error = null;
    socket.pause();
    socket.unref();
    socket.on("data", (chunk) => {
      socket.pause();
      this.reading = false;
      // `chunk` may be a view of a pool shared with other buffers, so copy it before transferring.
      const bytes = new Uint8Array(chunk);
      post({ id, kind: "data", bytes }, [bytes.buffer]);
    });
    socket.on("end", () => this.respond({ eof: true }));
    socket.on("error", (err) => {
      this.error = err.code;
      this.respond({ error: this.error });
    });
  }

  /** Answers the waiting read, if any, with `result`. */
  respond(result) {
    if (this.reading) {
      this.reading = false;
      post({ id: this.id, kind: "data", ...result });
    }
  }

  addresses() {
    const { socket } = this;
    return {
      id: this.id,
      local: address(socket.localAddress, socket.localPort),
      remote: address(socket.remoteAddress, socket.remotePort),
    };
  }

  close() {
    this.socket.destroy();
  }
}

/** A listening socket. */
class Listener {
  /** @param {net.Server} server */
  constructor(server, noDelay, keepAlive) {
    this.server = server;
    this.noDelay = noDelay;
    this.keepAlive = keepAlive;
    /** The connections that have not been accepted yet. */
    this.queue = [];
    /** The ID of the socket, if an accept is waiting for a connection. */
    this.waiting = null;
  }

  /** Returns the next connection, as `tcpTryAccept` does, or `null` if there is none. */
  next() {
    const socket = this.queue.shift();
    if (socket === undefined) {
      return null;
    }
    const id = --lastAcceptedId;
    const conn = new Connection(id, socket);
    sockets.set(id, conn);
    return conn.addresses();
  }

  onConnection(socket) {
    if (this.noDelay) {
      socket.setNoDelay(true);
    }
    if (this.keepAlive !== null) {
      socket.setKeepAlive(this.keepAlive.enable, this.keepAlive.delay * 1000);
    }
    // An error before the connection is accepted ends it, which a read then reports as the end of
    // the data.
    socket.on("error", () => {});
    this.queue.push(socket);
    if (this.waiting !== null) {
      const id = this.waiting;
      this.waiting = null;
      post({ id, kind: "accept", client: this.next() });
    }
  }

  close() {
    this.server.close();
    for (const socket of this.queue) {
      socket.destroy();
    }
  }
}

/**
 * Connects the socket `id` to `remote`, from `local` if it is not `null`, and answers with a
 * `connect` event. `noDelay` and `keepAlive` are the options set before connecting.
 */
export function tcpConnect(id, remote, local, noDelay, keepAlive) {
  const socket = new net.Socket({ allowHalfOpen: true });
  socket.setNoDelay(noDelay);
  if (keepAlive !== null) {
    socket.setKeepAlive(keepAlive.enable, keepAlive.delay * 1000);
  }
  // Data can be sent and read while connecting, so the connection exists from the start.
  const conn = new Connection(id, socket);
  sockets.set(id, conn);
  const onError = (err) => post({ id, kind: "connect", error: err.code });
  socket.once("error", onError);
  socket.connect(
    {
      host: remote.address,
      port: remote.port,
      localAddress: local?.address,
      localPort: local?.port || undefined,
    },
    () => {
      socket.off("error", onError);
      post({ kind: "connect", ...conn.addresses() });
    },
  );
}

/**
 * Makes the socket `id` listen on `local`, or on an unused port of every IPv4 address if it is
 * `null`, and returns the address it listens on.
 */
export function tcpListen(id, local, backlog, noDelay, keepAlive) {
  const server = net.createServer({ allowHalfOpen: true, pauseOnConnect: true });
  const listener = new Listener(server, noDelay, keepAlive);
  server.on("connection", (socket) => listener.onConnection(socket));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      { host: local?.address ?? "0.0.0.0", port: local?.port ?? 0, backlog, ipv6Only: false },
      () => {
        server.off("error", reject);
        server.on("error", () => {});
        server.unref();
        sockets.set(id, listener);
        const { address: host, port } = server.address();
        resolve(address(host, port));
      },
    );
  });
}

/** Answers with an `accept` event once the listening socket `id` has a connection. */
export function tcpAccept(id) {
  const listener = sockets.get(id);
  const client = listener.next();
  if (client === null) {
    listener.waiting = id;
  } else {
    post({ id, kind: "accept", client });
  }
}

/**
 * Returns the next connection of the listening socket `id`, as its ID and its `local` and `remote`
 * addresses, or `null` if there is none.
 */
export const tcpTryAccept = (id) => sockets.get(id).next();

/** Cancels the waiting accept of the listening socket `id`, if any. */
export function tcpCancelAccept(id) {
  sockets.get(id).waiting = null;
}

/** Answers with a `data` event once the socket `id` has data, has reached its end, or has failed. */
export function tcpRead(id) {
  const conn = sockets.get(id);
  conn.reading = true;
  if (conn.error !== null) {
    conn.respond({ error: conn.error });
  } else if (conn.socket.readableEnded) {
    conn.respond({ eof: true });
  } else {
    conn.socket.resume();
  }
}

/** Cancels the waiting read of the socket `id`, if any. */
export function tcpCancelRead(id) {
  const conn = sockets.get(id);
  conn.reading = false;
  conn.socket.pause();
}

/** Writes `bytes` to the socket `id`, and answers with a `sent` event once they are written. */
export function tcpSend(id, bytes) {
  sockets.get(id).socket.write(bytes, (err) => post({ id, kind: "sent", error: err?.code }));
}

/** Shuts down the sending side of the socket `id`, and answers with a `shutdown` event. */
export function tcpShutdown(id) {
  sockets.get(id).socket.end((err) => post({ id, kind: "shutdown", error: err?.code }));
}

export function tcpSetNoDelay(id) {
  const s = sockets.get(id);
  if (s instanceof Listener) {
    s.noDelay = true;
  } else {
    s.socket.setNoDelay(true);
  }
}

export function tcpSetKeepAlive(id, keepAlive) {
  const s = sockets.get(id);
  if (s instanceof Listener) {
    s.keepAlive = keepAlive;
  } else {
    s.socket.setKeepAlive(keepAlive.enable, keepAlive.delay * 1000);
  }
}

/** Closes the socket `id`, and the connections it has not accepted, if it is listening. */
export function tcpClose(id) {
  sockets.get(id)?.close();
  sockets.delete(id);
}
