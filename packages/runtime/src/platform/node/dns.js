// `Std.Internal.UV.DNS`, which resolves host names and addresses.
//
// Each extern reports the results and errors that the C runtime does, which come from libuv's
// `getaddrinfo` and `getnameinfo`, except where `docs/differences.md` says otherwise.

import { dec, inc, mkCtor } from "../../core.js";
import { mkArray } from "../../array.js";
import { ioError, ioOk, mkIoError } from "../../io.js";
import { formatSocketAddress, mkIpAddr, socketAddressPort } from "../../net.js";
import { mkString } from "../../string.js";
import { IoPromise, resolvePromise } from "../../task.js";
import { lookupHost, lookupService, systemError } from "./host.js";

/** The IP version to resolve to for each `getAddrInfo` family, where 0 is either version. */
const versions = [0, 4, 6];

/**
 * Returns a successful `EST.Out` with a new `IO.Promise`, after calling `start` with a function
 * that resolves the promise with an owned `Except IO.Error α` once the request finishes.
 */
function request(start) {
  const promise = new IoPromise();
  // The request holds a reference until it resolves the promise.
  inc(promise);
  start((result) => {
    resolvePromise(promise, result);
    dec(promise);
  });
  return ioOk(promise);
}

const ok = (x) => mkCtor(1, [x], null);

const Std_Internal_UV_DNS_getAddrInfo = (host, _service, family, _w) => {
  const name = host.toString();
  if (name === "") {
    return ioError(mkIoError(systemError({ code: "EINVAL" }), undefined));
  }
  return request((resolve) =>
    // Like `getaddrinfo`, an unknown family means either version.
    lookupHost(name, versions[family] ?? 0, (err, addresses) =>
      resolve(
        err === undefined
          ? ok(mkArray(addresses.map(mkIpAddr)))
          : mkCtor(0, [mkIoError(err, undefined)], null),
      ),
    ),
  );
};
export { Std_Internal_UV_DNS_getAddrInfo as "Std.Internal.UV.DNS.getAddrInfo" };

const Std_Internal_UV_DNS_getNameInfo = (addr, _w) =>
  request((resolve) =>
    lookupService(formatSocketAddress(addr), socketAddressPort(addr), (host, service) =>
      resolve(ok(mkCtor(0, [mkString(host), mkString(service)], null))),
    ),
  );
export { Std_Internal_UV_DNS_getNameInfo as "Std.Internal.UV.DNS.getNameInfo" };
