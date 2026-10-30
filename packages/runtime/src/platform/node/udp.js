// `Std.Internal.UV.UDP`, UDP sockets, which the main thread runs as `sockets.js` describes.
//
// Each extern reports the results and errors that the C runtime's `udp.cpp` does, which come from
// libuv, except where `docs/differences.md` says otherwise. The socket tracks the state that libuv
// checks before it makes a system call, so that those errors are reported without asking the main
// thread.

import { CHILDREN, dec, inc, mkCtor, RC, track } from "../../core.js";
import { LeanByteArray } from "../../bytearray.js";
import { ioOk } from "../../io.js";
import { formatIpAddr, mkSocketAddress } from "../../net.js";
import { IoPromise, resolvePromise } from "../../task.js";
import { mainEventArrived, newMainId, onMainEvent, postMain, requestMain } from "./host.js";
import { attemptRequest, fail, failed, fromSocketAddress, ok } from "./results.js";

/** Returns the Node socket type for addresses of the IP version `tag`, as an `IPAddr` tags it. */
const family = (tag) => (tag === 0 ? "udp4" : "udp6");

const some = (x) => mkCtor(1, [x], null);

/** The sockets that the main thread has, by ID, to route its events to. */
const sockets = new Map();

let listening = false;

function handleEvent(event) {
  sockets.get(event.id)?.handleEvent(event);
}

/** A `Socket`. Its pending requests each own a reference to it, so that it stays alive. */
class UdpSocket {
  constructor() {
    if (!listening) {
      onMainEvent("sockets", handleEvent);
      listening = true;
    }
    this[RC] = 1;
    this.id = newMainId();
    /**
     * The address the socket is bound to, as `{ address, port }`, or `null` if the main thread
     * doesn't have the socket yet, which libuv only opens when it is first needed.
     */
    this.local = null;
    /** The address the socket is connected to, or `null`. */
    this.remote = null;

    /** The datagrams received and not read yet, as `datagram` events. */
    this.datagrams = [];
    /** Whether the main thread has been asked for a datagram. */
    this.reading = false;
    /** The promise of the pending `recv` or `waitReadable`, if any. */
    this.readPromise = null;
    /** The size of the pending `recv`, or `null` for `waitReadable`. */
    this.readSize = null;

    /** The promises of the pending sends, in order. */
    this.sendPromises = [];
    track(this);
  }

  [CHILDREN]() {
    return this.readPromise === null ? this.sendPromises : [this.readPromise, ...this.sendPromises];
  }

  describe() {
    return `UDP socket ${this.id}`;
  }

  finalize() {
    if (this.local !== null) {
      sockets.delete(this.id);
      postMain("udpClose", [this.id]);
    }
  }

  /**
   * Binds the socket to `local`, or to an unused port of every address of the IP version `tag` if
   * it is `null`. Throws the error that binding reports.
   */
  bind(tag, local) {
    this.local = requestMain("udpBind", this.id, family(tag), local);
    sockets.set(this.id, this);
  }

  /**
   * Like libuv, binds the socket to an unused port of every address of the IP version `tag` unless
   * it is bound already. Throws the error that binding reports.
   */
  bindIfNeeded(tag) {
    if (this.local === null) {
      this.bind(tag, null);
    }
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
      case "datagram":
        // A datagram can arrive after its read was canceled, and is then kept for the next one.
        if (this.reading) {
          this.reading = false;
          mainEventArrived();
        }
        this.datagrams.push(event);
        this.serveRead();
        break;
      case "udpSent":
        mainEventArrived();
        this.finishRequest(
          this.sendPromises.shift(),
          event.error === undefined ? ok(0) : failed(event.error),
        );
        break;
    }
  }

  /** Starts a `recv` of up to `size` bytes, or a `waitReadable` if `size` is `null`. */
  startRead(size) {
    if (this.readPromise !== null) {
      return fail("EALREADY");
    }
    return attemptRequest(() => {
      // libuv binds the socket to receive on, for IPv4.
      this.bindIfNeeded(0);
      const promise = this.startRequest();
      this.readPromise = promise;
      this.readSize = size;
      this.serveRead();
      if (this.readPromise !== null && !this.reading) {
        this.reading = true;
        this.post("udpRead");
      }
      return ioOk(promise);
    });
  }

  /** Finishes the pending read, if any, if a datagram or an error has been received. */
  serveRead() {
    const promise = this.readPromise;
    const next = this.datagrams[0];
    if (promise === null || next === undefined) {
      return;
    }
    this.readPromise = null;
    let result;
    // libuv asks for a buffer to receive into before it receives anything, so a `waitReadable`,
    // which has none, and a `recv` with an empty one, neither receive nor see an error.
    if (this.readSize === null) {
      result = ok(0);
    } else if (this.readSize === 0) {
      result = failed("ENOBUFS");
    } else {
      this.datagrams.shift();
      if (next.error !== undefined) {
        result = failed(next.error);
      } else {
        // The rest of a datagram that doesn't fit is lost, as it is natively.
        const size = Math.min(next.bytes.length, this.readSize);
        const bytes = new LeanByteArray(next.bytes.subarray(0, size), size);
        const from = some(mkSocketAddress(next.from.address, next.from.port));
        result = ok(mkCtor(0, [bytes, from], null));
      }
    }
    this.finishRequest(promise, result);
  }
}

/** Sets the socket option `name` of `socket`, which libuv can only do once it has the socket. */
function setOption(socket, name, ...args) {
  if (socket.local === null) {
    return fail("EBADF");
  }
  return attemptRequest(() => {
    requestMain("udpSetOption", socket.id, name, args);
    return ioOk(0);
  });
}

export const externs = {
  "Std.Internal.UV.UDP.Socket.new": (_w) => ioOk(new UdpSocket()),
  "Std.Internal.UV.UDP.Socket.bind": (socket, addr, _w) => {
    if (socket.local !== null) {
      return fail("EINVAL");
    }
    return attemptRequest(() => {
      socket.bind(addr.tag, fromSocketAddress(addr));
      return ioOk(0);
    });
  },
  "Std.Internal.UV.UDP.Socket.connect": (socket, addr, _w) => {
    if (socket.remote !== null) {
      return fail("EISCONN");
    }
    return attemptRequest(() => {
      socket.bindIfNeeded(addr.tag);
      const { local, remote } = requestMain("udpConnect", socket.id, fromSocketAddress(addr));
      socket.local = local;
      socket.remote = remote;
      return ioOk(0);
    });
  },
  "Std.Internal.UV.UDP.Socket.send": (socket, data, addr, _w) => {
    if (data.length === 0) {
      dec(data);
      const promise = new IoPromise();
      resolvePromise(promise, ok(0));
      return ioOk(promise);
    }
    const remote = addr === 0 ? null : addr.f0;
    if (remote !== null && socket.remote !== null) {
      dec(data);
      return fail("EISCONN");
    }
    if (remote === null && socket.remote === null) {
      dec(data);
      return fail("EDESTADDRREQ");
    }
    const bytes = new Uint8Array(data.reduce((n, a) => n + a.size, 0));
    let offset = 0;
    for (const a of data) {
      bytes.set(a.bytes.subarray(0, a.size), offset);
      offset += a.size;
    }
    dec(data);
    return attemptRequest(() => {
      if (remote !== null) {
        socket.bindIfNeeded(remote.tag);
      }
      const promise = socket.startRequest();
      socket.sendPromises.push(promise);
      socket.post(
        "udpSend",
        [bytes, remote === null ? null : fromSocketAddress(remote)],
        [bytes.buffer],
      );
      return ioOk(promise);
    });
  },
  "Std.Internal.UV.UDP.Socket.recv": (socket, size, _w) =>
    // A read can't be larger than an array, so a size beyond that is as good as unlimited.
    socket.startRead(Number(size > 0xffffffffn ? 0xffffffffn : size)),
  "Std.Internal.UV.UDP.Socket.waitReadable": (socket, _w) => socket.startRead(null),
  "Std.Internal.UV.UDP.Socket.cancelRecv": (socket, _w) => {
    const promise = socket.readPromise;
    if (promise !== null) {
      socket.readPromise = null;
      dec(promise);
      dec(socket);
      if (socket.reading) {
        socket.reading = false;
        mainEventArrived();
        postMain("udpCancelRead", [socket.id]);
      }
    }
    return ioOk(0);
  },
  "Std.Internal.UV.UDP.Socket.getPeerName": (socket, _w) => {
    if (socket.local === null) {
      return fail("EBADF");
    }
    if (socket.remote === null) {
      return fail("ENOTCONN");
    }
    return ioOk(mkSocketAddress(socket.remote.address, socket.remote.port));
  },
  "Std.Internal.UV.UDP.Socket.getSockName": (socket, _w) => {
    if (socket.local === null) {
      return fail("EBADF");
    }
    return ioOk(mkSocketAddress(socket.local.address, socket.local.port));
  },
  "Std.Internal.UV.UDP.Socket.setBroadcast": (socket, on, _w) =>
    setOption(socket, "setBroadcast", on !== 0),
  "Std.Internal.UV.UDP.Socket.setMulticastLoop": (socket, on, _w) =>
    setOption(socket, "setMulticastLoopback", on !== 0),
  "Std.Internal.UV.UDP.Socket.setMulticastTTL": (socket, ttl, _w) =>
    ttl > 255 ? fail("EINVAL") : setOption(socket, "setMulticastTTL", ttl),
  "Std.Internal.UV.UDP.Socket.setTTL": (socket, ttl, _w) =>
    ttl < 1 || ttl > 255 ? fail("EINVAL") : setOption(socket, "setTTL", ttl),
  "Std.Internal.UV.UDP.Socket.setMulticastInterface": (socket, iface, _w) =>
    setOption(socket, "setMulticastInterface", formatIpAddr(iface)),
  "Std.Internal.UV.UDP.Socket.setMembership": (socket, group, iface, membership, _w) =>
    attemptRequest(() => {
      // libuv binds the socket for the group's IP version first.
      socket.bindIfNeeded(group.tag);
      if (membership !== 0 && membership !== 1) {
        return fail("EINVAL");
      }
      const args = [formatIpAddr(group), iface === 0 ? undefined : formatIpAddr(iface.f0)];
      return setOption(socket, membership === 1 ? "addMembership" : "dropMembership", ...args);
    }),
};
