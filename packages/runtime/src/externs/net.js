// The externs of `net.js`.

import { mkString } from "../string.js";
import { formatIpv4, formatIpv6, option, parseIpv4, parseIpv6 } from "../net.js";

const Std_Net_IPv4Addr_ofString = (s) => option(parseIpv4(s.toString()));
export { Std_Net_IPv4Addr_ofString as "Std.Net.IPv4Addr.ofString" };

const Std_Net_IPv4Addr_toString = (addr) => mkString(formatIpv4(addr));
export { Std_Net_IPv4Addr_toString as "Std.Net.IPv4Addr.toString" };

const Std_Net_IPv6Addr_ofString = (s) => option(parseIpv6(s.toString()));
export { Std_Net_IPv6Addr_ofString as "Std.Net.IPv6Addr.ofString" };

const Std_Net_IPv6Addr_toString = (addr) => mkString(formatIpv6(addr));
export { Std_Net_IPv6Addr_toString as "Std.Net.IPv6Addr.toString" };
