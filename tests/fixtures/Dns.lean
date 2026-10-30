import Std.Async.DNS

open Std.Async
open Std.Net

def showFamily : Option AddressFamily → String
  | none => "any"
  | some .ipv4 => "IPv4"
  | some .ipv6 => "IPv6"

def showAddrs (host : String) (family : Option AddressFamily) : Async Unit := do
  let label := s!"{host.quote} {showFamily family}"
  try
    IO.println s!"{label}: {← DNS.getAddrInfo host "" family}"
  catch e =>
    IO.println s!"{label}: {e}"

def addrInfo : Async Unit := do
  for host in ["127.0.0.1", "::1", "::ffff:1.2.3.4", "0x7f.1", "1.2.3", "", "does-not-exist.invalid"]
    do
    showAddrs host none
  showAddrs "127.0.0.1" (some .ipv4)
  showAddrs "::1" (some .ipv6)
  let any ← DNS.getAddrInfo "localhost" ""
  let v4 ← DNS.getAddrInfo "localhost" "" (some .ipv4)
  let v6 ← DNS.getAddrInfo "localhost" "" (some .ipv6)
  let loopback := IPAddr.v4 (IPv4Addr.ofParts 127 0 0 1)
  IO.println s!"localhost: {any.contains loopback} {v4.contains loopback} {v6.contains loopback}"
  IO.println s!"localhost families: {v4.all (·.family == .ipv4)} {v6.all (·.family == .ipv6)}"
  -- An IPv6 address can't be resolved to an IPv4 one.
  let fails ← try
      discard <| DNS.getAddrInfo "::1" "" (some .ipv4)
      pure false
    catch _ => pure true
  IO.println s!"::1 as IPv4 fails: {fails}"

def nameInfo : Async Unit := do
  let v4 a b c d port := SocketAddress.v4 { addr := IPv4Addr.ofParts a b c d, port }
  -- An address without a name, like one reserved for documentation, comes back as it is.
  for addr in [v4 127 0 0 1 80, v4 127 0 0 1 22, v4 127 0 0 1 0, v4 127 0 0 1 54321,
      v4 192 0 2 1 443] do
    let info ← DNS.getNameInfo addr
    IO.println s!"{addr.ipAddr}:{addr.port}: {info.host.quote} {info.service.quote}"

def program : Async Unit := do
  addrInfo
  nameInfo
  IO.println "done"

def main : IO Unit := do
  discard <| EAsync.toBaseIO program
