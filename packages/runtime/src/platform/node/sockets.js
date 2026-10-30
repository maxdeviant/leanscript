// TCP and UDP sockets, which the main thread runs on behalf of the thread that runs Lean code.
//
// Binding, connecting a UDP socket, and listening must report their errors and the address they got
// before they return, which only a thread that can wait for Node to finish can do, so the sockets
// live here rather than with the Lean code. Requests that complete later, such as connecting a TCP
// socket and reading, are answered with events on the event port, each of which has the `id` of its
// socket and a `kind`:
//
// - `connect`, with an `error` code or the socket's `local` and `remote` addresses.
// - `data`, with `bytes`, `eof`, or `error`, with a code, each answering one `tcpRead`.
// - `sent` and `shutdown`, with an `error` code if they failed, answering `tcpSend` and
//   `tcpShutdown` in order.
// - `accept`, with the accepted `client`, as `tcpTryAccept` returns it, answering `tcpAccept`.
// - `datagram`, with `bytes` and the `from` address, or with an `error` code, answering one
//   `udpRead`.
// - `udpSent`, with an `error` code if it failed, answering `udpSend` in order.
//
// Sockets are unreferenced, so they never keep the process running: the thread that runs Lean code
// does that while it waits for an event.

import * as dgram from "node:dgram";
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

/** A bound UDP socket. */
class Datagrams {
  /** @param {dgram.Socket} socket */
  constructor(id, socket) {
    this.id = id;
    this.socket = socket;
    /**
     * The datagrams received and not read yet, as `datagram` events. Node reads every datagram as
     * soon as it arrives, so they wait here rather than in the system's buffer.
     */
    this.queue = [];
    /** Whether a read is waiting for a datagram. */
    this.reading = false;
    socket.unref();
    socket.on("message", (msg, rinfo) => {
      // `msg` may be a view of memory shared with other buffers, so copy it before transferring.
      const bytes = new Uint8Array(msg);
      this.receive({ id, kind: "datagram", bytes, from: address(rinfo.address, rinfo.port) }, [
        bytes.buffer,
      ]);
    });
    socket.on("error", (err) => this.receive({ id, kind: "datagram", error: err.code }));
  }

  /** Answers the waiting read with the `datagram` event `event`, or queues it if there is none. */
  receive(event, transfer = []) {
    if (this.reading) {
      this.reading = false;
      post(event, transfer);
    } else {
      this.queue.push({ event, transfer });
    }
  }

  local() {
    const { address: host, port } = this.socket.address();
    return address(host, port);
  }

  close() {
    this.socket.close();
  }
}

/**
 * Opens the UDP socket `id`, for IPv4 if `family` is `udp4` and IPv6 if it is `udp6`, binds it to
 * `local`, or to an unused port of every address if it is `null`, and returns the address it is
 * bound to.
 */
export function udpBind(id, family, local) {
  const socket = dgram.createSocket({ type: family, reuseAddr: true });
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      socket.close();
      reject(err);
    };
    socket.once("error", onError);
    socket.bind(
      { address: local?.address ?? (family === "udp4" ? "0.0.0.0" : "::"), port: local?.port ?? 0 },
      () => {
        socket.off("error", onError);
        const datagrams = new Datagrams(id, socket);
        sockets.set(id, datagrams);
        resolve(datagrams.local());
      },
    );
  });
}

/**
 * Connects the bound UDP socket `id` to `remote`, and returns its `local` and `remote` addresses,
 * as the system may pick a local address to send to `remote` from.
 */
export function udpConnect(id, remote) {
  const datagrams = sockets.get(id);
  return new Promise((resolve, reject) => {
    datagrams.socket.connect(remote.port, remote.address, (err) => {
      if (err) {
        reject(err);
      } else {
        const peer = datagrams.socket.remoteAddress();
        resolve({ local: datagrams.local(), remote: address(peer.address, peer.port) });
      }
    });
  });
}

/**
 * Sends `bytes` as a datagram from the UDP socket `id` to `remote`, or to the address it is
 * connected to if `remote` is `null`, and answers with a `udpSent` event.
 */
export function udpSend(id, bytes, remote) {
  const { socket } = sockets.get(id);
  const callback = (err) => post({ id, kind: "udpSent", error: err?.code });
  if (remote === null) {
    socket.send(bytes, callback);
  } else {
    socket.send(bytes, remote.port, remote.address, callback);
  }
}

/** Answers with a `datagram` event once the UDP socket `id` has received a datagram or failed. */
export function udpRead(id) {
  const datagrams = sockets.get(id);
  const next = datagrams.queue.shift();
  if (next === undefined) {
    datagrams.reading = true;
  } else {
    post(next.event, next.transfer);
  }
}

/** Cancels the waiting read of the UDP socket `id`, if any. */
export function udpCancelRead(id) {
  sockets.get(id).reading = false;
}

/**
 * Calls the method `name` of the UDP socket `id`, such as `setTTL`, with the arguments `args`,
 * throwing the error it reports.
 */
export function udpSetOption(id, name, args) {
  sockets.get(id).socket[name](...args);
}

/** Closes the UDP socket `id`. */
export function udpClose(id) {
  sockets.get(id)?.close();
  sockets.delete(id);
}
