// `Std.Internal.UV.TCP`, TCP sockets, which the main thread runs as `sockets.js` describes.
//
// Each extern reports the results and errors that the C runtime's `tcp.cpp` does, which come from
// libuv, except where `docs/differences.md` says otherwise. The socket tracks the state that libuv
// checks before it makes a system call, so that those errors are reported without asking the main
// thread.

import { CHILDREN, dec, inc, RC, track } from "../../core.js";
import { LeanByteArray } from "../../bytearray.js";
import { ioOk } from "../../io.js";
import { mkSocketAddress } from "../../net.js";
import { IoPromise, resolvePromise } from "../../task.js";
import { mainEventArrived, newMainId, onMainEvent, postMain, requestMain } from "./host.js";
import { attemptRequest, fail, failed, fromSocketAddress, ok } from "./results.js";

/** Created, without a socket yet, which libuv only opens when it is first needed. */
const NEW = 0;
/** Bound to `local`, which is only bound once it connects or listens. */
const BOUND = 1;
/** Connecting or connected. */
const CONNECTED = 2;
const LISTENING = 3;

/** The sockets that the main thread has, by ID, to route its events to. */
const sockets = new Map();

let listening = false;

function handleEvent(event) {
  const socket = sockets.get(event.id);
  if (socket === undefined) {
    // The socket was freed while the request was outstanding, so the accepted connection is not
    // wanted.
    if (event.kind === "accept") {
      postMain("tcpClose", [event.client.id]);
    }
    return;
  }
  socket.handleEvent(event);
}

/** A `Socket`. Its pending requests each own a reference to it, so that it stays alive. */
class TcpSocket {
  constructor() {
    if (!listening) {
      onMainEvent("sockets", handleEvent);
      listening = true;
    }
    this[RC] = 1;
    this.id = newMainId();
    this.state = NEW;
    /** The address the socket is bound to, or `null`, as `{ address, port }`. */
    this.local = null;
    /** The address of the peer, once connected. */
    this.remote = null;
    this.noDelay = false;
    /** The keep-alive option, as `{ enable, delay }`, with the delay in seconds, or `null`. */
    this.keepAlive = null;
    /** Whether the main thread has the socket, and must be told to close it. */
    this.opened = false;

    /** The data received and not read yet. */
    this.chunks = [];
    this.eof = false;
    /** The code of the error that ended the data, if any. */
    this.readError = null;
    /** Whether the main thread has been asked for more data. */
    this.reading = false;
    /** The promise of the pending `recv?` or `waitReadable`, if any. */
    this.readPromise = null;
    /** The size of the pending `recv?`, or `null` for `waitReadable`. */
    this.readSize = null;

    this.connectPromise = null;
    /** The promises of the pending sends, in order. */
    this.sendPromises = [];
    this.shutdownPromise = null;
    this.shutdownRequested = false;

    /** The connections that the main thread accepted, which no accept has taken yet. */
    this.accepted = [];
    /** The promise of the pending `accept`, if any. */
    this.acceptPromise = null;
    track(this);
  }

  [CHILDREN]() {
    return [
      this.readPromise,
      this.connectPromise,
      ...this.sendPromises,
      this.shutdownPromise,
      this.acceptPromise,
    ].filter((p) => p !== null);
  }

  describe() {
    return `TCP socket ${this.id}`;
  }

  finalize() {
    sockets.delete(this.id);
    if (this.opened) {
      postMain("tcpClose", [this.id]);
    }
    for (const client of this.accepted) {
      postMain("tcpClose", [client.id]);
    }
  }

  /** Notes that the main thread now has the socket, connected to `remote` from `local`. */
  open(state, local, remote) {
    this.state = state;
    this.local = local;
    this.remote = remote;
    this.opened = true;
    sockets.set(this.id, this);
  }

  /** Makes the request `type` of the main thread, which answers it with an event. */
  post(type, args = [], transfer = []) {
    postMain(type, [this.id, ...args], { awaitsEvent: true, transfer });
  }

  /** Returns a new promise for a request, which the socket also owns until the request finishes. */
  startRequest() {
    const promise = new IoPromise();
    inc(promise);
    inc(this);
    return promise;
  }

  /** Resolves the promise of a finished request with `value`, and gives up the request's references. */
  finishRequest(promise, value) {
    resolvePromise(promise, value);
    dec(promise);
    dec(this);
  }

  handleEvent(event) {
    switch (event.kind) {
      case "connect": {
        mainEventArrived();
        const promise = this.connectPromise;
        this.connectPromise = null;
        if (event.error === undefined) {
          this.local = event.local;
          this.remote = event.remote;
          this.finishRequest(promise, ok(0));
        } else {
          this.finishRequest(promise, failed(event.error));
        }
        break;
      }
      case "data":
        // Data can arrive after its read was canceled, and is then kept for the next one.
        if (this.reading) {
          this.reading = false;
          mainEventArrived();
        }
        if (event.bytes !== undefined) {
          this.chunks.push(event.bytes);
        } else if (event.eof) {
          this.eof = true;
        } else {
          this.readError = event.error;
        }
        this.serveRead();
        break;
      case "sent":
        mainEventArrived();
        this.finishRequest(
          this.sendPromises.shift(),
          event.error === undefined ? ok(0) : failed(event.error),
        );
        break;
      case "shutdown": {
        mainEventArrived();
        const promise = this.shutdownPromise;
        this.shutdownPromise = null;
        this.finishRequest(promise, event.error === undefined ? ok(0) : failed(event.error));
        break;
      }
      case "accept":
        // A connection can be accepted after its accept was canceled, and is then kept for the
        // next one.
        if (this.acceptPromise === null) {
          this.accepted.push(event.client);
        } else {
          mainEventArrived();
          const promise = this.acceptPromise;
          this.acceptPromise = null;
          this.finishRequest(promise, ok(acceptedSocket(event.client)));
        }
        break;
    }
  }

  /** Starts a `recv?` of up to `size` bytes, or a `waitReadable` if `size` is `null`. */
  startRead(size) {
    if (this.readPromise !== null) {
      return fail("EALREADY");
    }
    if (this.state !== CONNECTED) {
      return fail("ENOTCONN");
    }
    const promise = this.startRequest();
    this.readPromise = promise;
    this.readSize = size;
    this.serveRead();
    if (this.readPromise !== null && !this.reading) {
      this.reading = true;
      this.post("tcpRead");
    }
    return ioOk(promise);
  }

  /** Finishes the pending read, if any, if there is data, the data has ended, or it failed. */
  serveRead() {
    const promise = this.readPromise;
    if (promise === null || (this.chunks.length === 0 && !this.eof && this.readError === null)) {
      return;
    }
    this.readPromise = null;
    const hasData = this.chunks.length > 0;
    let result;
    if (!hasData && this.readError !== null) {
      result = failed(this.readError);
    } else if (this.readSize === 0) {
      // libuv reads into a buffer of the requested size, and fails without reading if it is
      // empty.
      result = failed("ENOBUFS");
    } else if (this.readSize === null) {
      result = ok(hasData ? 1 : 0);
    } else {
      result = ok(hasData ? ok(this.takeBytes(this.readSize)) : 0);
    }
    this.finishRequest(promise, result);
  }

  /** Takes up to `size` bytes of the received data, which must not be empty, as a `ByteArray`. */
  takeBytes(size) {
    const chunk = this.chunks[0];
    if (chunk.length <= size) {
      this.chunks.shift();
      return new LeanByteArray(chunk, chunk.length);
    }
    this.chunks[0] = chunk.subarray(size);
    return new LeanByteArray(chunk.slice(0, size), size);
  }
}

/** Returns a new `Socket` for the connection `client` that the main thread accepted. */
function acceptedSocket(client) {
  const socket = new TcpSocket();
  // The main thread picked the ID, which never clashes with ours.
  socket.id = client.id;
  socket.open(CONNECTED, client.local, client.remote);
  return socket;
}

const Std_Internal_UV_TCP_Socket_new = (_w) => ioOk(new TcpSocket());
export { Std_Internal_UV_TCP_Socket_new as "Std.Internal.UV.TCP.Socket.new" };

const Std_Internal_UV_TCP_Socket_connect = (socket, addr, _w) => {
  if (socket.connectPromise !== null) {
    return fail("EALREADY");
  }
  if (socket.state === CONNECTED) {
    return fail("EISCONN");
  }
  if (socket.state === LISTENING) {
    return fail("EINVAL");
  }
  const remote = fromSocketAddress(addr);
  const promise = socket.startRequest();
  socket.connectPromise = promise;
  socket.post("tcpConnect", [remote, socket.local, socket.noDelay, socket.keepAlive]);
  socket.open(CONNECTED, socket.local, null);
  return ioOk(promise);
};
export { Std_Internal_UV_TCP_Socket_connect as "Std.Internal.UV.TCP.Socket.connect" };

const Std_Internal_UV_TCP_Socket_send = (socket, data, _w) => {
  const size = data.reduce((n, a) => n + a.size, 0);
  if (data.length === 0) {
    dec(data);
    const promise = new IoPromise();
    resolvePromise(promise, ok(0));
    return ioOk(promise);
  }
  if (socket.state === NEW) {
    dec(data);
    return fail("EBADF");
  }
  if (socket.state !== CONNECTED || socket.shutdownRequested) {
    dec(data);
    return fail("EPIPE");
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const a of data) {
    bytes.set(a.bytes.subarray(0, a.size), offset);
    offset += a.size;
  }
  dec(data);
  const promise = socket.startRequest();
  socket.sendPromises.push(promise);
  socket.post("tcpSend", [bytes], [bytes.buffer]);
  return ioOk(promise);
};
export { Std_Internal_UV_TCP_Socket_send as "Std.Internal.UV.TCP.Socket.send" };

const Std_Internal_UV_TCP_Socket_recvOpt = (socket, size, _w) =>
  // A read can't be larger than an array, so a size beyond that is as good as unlimited.
  socket.startRead(Number(size > 0xffffffffn ? 0xffffffffn : size));
export { Std_Internal_UV_TCP_Socket_recvOpt as "Std.Internal.UV.TCP.Socket.recv?" };

const Std_Internal_UV_TCP_Socket_waitReadable = (socket, _w) => socket.startRead(null);
export { Std_Internal_UV_TCP_Socket_waitReadable as "Std.Internal.UV.TCP.Socket.waitReadable" };

const Std_Internal_UV_TCP_Socket_cancelRecv = (socket, _w) => {
  const promise = socket.readPromise;
  if (promise !== null) {
    socket.readPromise = null;
    dec(promise);
    dec(socket);
    if (socket.reading) {
      socket.reading = false;
      mainEventArrived();
      postMain("tcpCancelRead", [socket.id]);
    }
  }
  return ioOk(0);
};
export { Std_Internal_UV_TCP_Socket_cancelRecv as "Std.Internal.UV.TCP.Socket.cancelRecv" };

const Std_Internal_UV_TCP_Socket_bind = (socket, addr, _w) => {
  if (socket.state !== NEW) {
    return fail("EINVAL");
  }
  socket.state = BOUND;
  socket.local = fromSocketAddress(addr);
  return ioOk(0);
};
export { Std_Internal_UV_TCP_Socket_bind as "Std.Internal.UV.TCP.Socket.bind" };

const Std_Internal_UV_TCP_Socket_listen = (socket, backlog, _w) => {
  if (socket.state === LISTENING) {
    return ioOk(0);
  }
  if (socket.state === CONNECTED) {
    return fail("EINVAL");
  }
  return attemptRequest(() => {
    const local = requestMain(
      "tcpListen",
      socket.id,
      socket.local,
      backlog,
      socket.noDelay,
      socket.keepAlive,
    );
    socket.open(LISTENING, local, null);
    return ioOk(0);
  });
};
export { Std_Internal_UV_TCP_Socket_listen as "Std.Internal.UV.TCP.Socket.listen" };

const Std_Internal_UV_TCP_Socket_accept = (socket, _w) => {
  if (socket.acceptPromise !== null) {
    return fail("EALREADY");
  }
  const promise = new IoPromise();
  if (socket.accepted.length > 0) {
    resolvePromise(promise, ok(acceptedSocket(socket.accepted.shift())));
  } else if (socket.state === LISTENING) {
    inc(promise);
    inc(socket);
    socket.acceptPromise = promise;
    socket.post("tcpAccept");
  }
  // Otherwise, like libuv, wait for a connection that a socket that is not listening never gets.
  return ioOk(promise);
};
export { Std_Internal_UV_TCP_Socket_accept as "Std.Internal.UV.TCP.Socket.accept" };

const Std_Internal_UV_TCP_Socket_tryAccept = (socket, _w) => {
  if (socket.acceptPromise !== null) {
    return fail("EALREADY");
  }
  let client = socket.accepted.shift() ?? null;
  if (client === null && socket.state === LISTENING) {
    client = requestMain("tcpTryAccept", socket.id);
  }
  return ioOk(ok(client === null ? 0 : ok(acceptedSocket(client))));
};
export { Std_Internal_UV_TCP_Socket_tryAccept as "Std.Internal.UV.TCP.Socket.tryAccept" };

const Std_Internal_UV_TCP_Socket_cancelAccept = (socket, _w) => {
  const promise = socket.acceptPromise;
  if (promise !== null) {
    socket.acceptPromise = null;
    dec(promise);
    dec(socket);
    mainEventArrived();
    postMain("tcpCancelAccept", [socket.id]);
  }
  return ioOk(0);
};
export { Std_Internal_UV_TCP_Socket_cancelAccept as "Std.Internal.UV.TCP.Socket.cancelAccept" };

const Std_Internal_UV_TCP_Socket_shutdown = (socket, _w) => {
  if (socket.shutdownRequested) {
    return fail("EALREADY", "shutdown already requested");
  }
  if (socket.state !== CONNECTED) {
    return fail("ENOTCONN");
  }
  socket.shutdownRequested = true;
  const promise = socket.startRequest();
  socket.shutdownPromise = promise;
  socket.post("tcpShutdown");
  return ioOk(promise);
};
export { Std_Internal_UV_TCP_Socket_shutdown as "Std.Internal.UV.TCP.Socket.shutdown" };

const Std_Internal_UV_TCP_Socket_getPeerName = (socket, _w) => {
  if (socket.state === NEW) {
    return fail("EBADF");
  }
  if (socket.remote === null) {
    return fail("ENOTCONN");
  }
  return ioOk(mkSocketAddress(socket.remote.address, socket.remote.port));
};
export { Std_Internal_UV_TCP_Socket_getPeerName as "Std.Internal.UV.TCP.Socket.getPeerName" };

const Std_Internal_UV_TCP_Socket_getSockName = (socket, _w) => {
  // A connecting socket only knows its address once it has connected.
  if (socket.local === null) {
    return fail("EBADF");
  }
  return ioOk(mkSocketAddress(socket.local.address, socket.local.port));
};
export { Std_Internal_UV_TCP_Socket_getSockName as "Std.Internal.UV.TCP.Socket.getSockName" };

const Std_Internal_UV_TCP_Socket_noDelay = (socket, _w) => {
  socket.noDelay = true;
  if (socket.opened) {
    postMain("tcpSetNoDelay", [socket.id]);
  }
  return ioOk(0);
};
export { Std_Internal_UV_TCP_Socket_noDelay as "Std.Internal.UV.TCP.Socket.noDelay" };

const Std_Internal_UV_TCP_Socket_keepAlive = (socket, enable, delay, _w) => {
  const keepAlive = { enable: enable !== 0, delay };
  // libuv only checks the delay when the socket has been opened, and stores it otherwise.
  if (socket.state !== NEW && keepAlive.enable && delay < 1) {
    return fail("EINVAL");
  }
  socket.keepAlive = keepAlive;
  if (socket.opened) {
    postMain("tcpSetKeepAlive", [socket.id, keepAlive]);
  }
  return ioOk(0);
};
export { Std_Internal_UV_TCP_Socket_keepAlive as "Std.Internal.UV.TCP.Socket.keepAlive" };
