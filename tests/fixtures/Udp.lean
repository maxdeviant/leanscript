import Std.Async.UDP
import Std.Async.Timer

open Std.Async
open Std.Async.UDP
open Std.Net

def loopback (port : UInt16) : SocketAddress :=
  .v4 { addr := IPv4Addr.ofParts 127 0 0 1, port }

def loopback6 (port : UInt16) : SocketAddress :=
  .v6 { addr := IPv6Addr.ofParts 0 0 0 0 0 0 0 1, port }

/-- Shows `e` without its error number, which differs between platforms. -/
def showError (e : IO.Error) : String :=
  match (toString e).splitOn " (error code: " with
  | [before, after] =>
    let rest := (after.dropWhile Char.isDigit).toString
    if rest.startsWith ", " then s!"{before} ({rest.drop 2}" else before
  | _ => toString e

def showResult (label : String) (x : IO α) (fmt : α → String) : IO Unit := do
  try
    IO.println s!"{label}: {fmt (← x)}"
  catch e =>
    IO.println s!"{label}: {showError e}"

def showAsync (label : String) (x : Async α) (fmt : α → String) : Async Unit := do
  try
    IO.println s!"{label}: {fmt (← x)}"
  catch e =>
    IO.println s!"{label}: {showError e}"

def showBytes (bytes : ByteArray) : String :=
  (String.fromUTF8? bytes).getD "invalid UTF-8" |>.quote

def ok (_ : α) : String := "ok"

/-- Returns a socket bound to an ephemeral loopback port, and its address. -/
def bound (addr : SocketAddress := loopback 0) : IO (Socket × SocketAddress) := do
  let socket ← Socket.mk
  socket.bind addr
  return (socket, ← socket.getSockName)

/-- Waits long enough for datagrams sent to loopback to arrive. -/
def settle : Async Unit := do
  let sleep ← Sleep.mk 50
  sleep.wait

def basics : Async Unit := do
  let (a, aAddr) ← bound
  let (b, bAddr) ← bound
  IO.println s!"bound to an ephemeral port: {bAddr.port != 0}"
  a.sendAll #["hel".toUTF8, "lo".toUTF8, ByteArray.empty] bAddr
  let (data, sender) ← b.recv 100
  IO.println s!"received {showBytes data} from the sender: {sender == some aAddr}"
  a.send "one".toUTF8 bAddr
  a.send "two".toUTF8 bAddr
  a.send ByteArray.empty bAddr
  a.send "hello world".toUTF8 bAddr
  a.send "last".toUTF8 bAddr
  settle
  IO.println s!"received {showBytes (← b.recv 100).1}"
  IO.println s!"received {showBytes (← b.recv 100).1}"
  IO.println s!"received {showBytes (← b.recv 100).1}"
  IO.println s!"received truncated {showBytes (← b.recv 5).1}"
  IO.println s!"received {showBytes (← b.recv 100).1}"
  b.send "reply".toUTF8 aAddr
  IO.println s!"replied {showBytes (← a.recv 100).1}"
  let big := ByteArray.mk (Array.ofFn (n := 8000) fun i => (i.val % 251).toUInt8)
  a.send big bAddr
  let (data, _) ← b.recv 10000
  IO.println s!"received {data.size} bytes, intact: {data == big}"
  showAsync "send too much" (a.send (ByteArray.mk (Array.replicate 70000 0)) bAddr) ok

def connected : Async Unit := do
  let (a, aAddr) ← bound
  let (b, bAddr) ← bound
  a.connect bAddr
  IO.println s!"peer is the address connected to: {(← a.getPeerName) == bAddr}"
  IO.println s!"name is unchanged: {(← a.getSockName) == aAddr}"
  a.send "connected".toUTF8
  IO.println s!"received {showBytes (← b.recv 100).1}"
  showAsync "send to an address when connected" (a.send "x".toUTF8 bAddr) ok
  showResult "connect twice" (a.connect bAddr) ok
  -- A connected socket only receives from its peer.
  let (c, _) ← bound
  c.send "stranger".toUTF8 aAddr
  b.send "peer".toUTF8 aAddr
  IO.println s!"received {showBytes (← a.recv 100).1}"
  let fresh ← Socket.mk
  fresh.connect bAddr
  let name ← fresh.getSockName
  IO.println s!"connecting binds to an ephemeral port: {name.port != 0}"
  fresh.send "fresh".toUTF8
  let (data, sender) ← b.recv 100
  IO.println s!"received {showBytes data} from the connected socket: {sender.map (·.port) == some name.port}"

def implicitBind : Async Unit := do
  let (b, bAddr) ← bound
  let sender ← Socket.mk
  sender.send "implicit".toUTF8 bAddr
  let name ← sender.getSockName
  IO.println s!"sending binds to {name.ipAddr}, on an ephemeral port: {name.port != 0}"
  let (data, from_) ← b.recv 100
  IO.println s!"received {showBytes data} from that port: {from_.map (·.port) == some name.port}"
  let receiver ← Socket.mk
  let _ ← receiver.native.recv 100
  let name ← receiver.getSockName
  IO.println s!"receiving binds to {name.ipAddr}, on an ephemeral port: {name.port != 0}"
  receiver.native.cancelRecv
  let sender6 ← Socket.mk
  let (b6, b6Addr) ← bound (loopback6 0)
  sender6.send "six".toUTF8 b6Addr
  IO.println s!"sending to IPv6 binds to {(← sender6.getSockName).ipAddr}"
  IO.println s!"received {showBytes (← b6.recv 100).1} over IPv6"
  let member ← Socket.mk
  showResult "invalid membership" (member.native.setMembership (.v4 (IPv4Addr.ofParts 224 0 0 1)) none 2) ok
  IO.println s!"setting membership binds to {(← member.getSockName).ipAddr}"

def selectors : Async Unit := do
  let (a, _) ← bound
  let (b, bAddr) ← bound
  let timeout ← Selector.sleep 50
  let first ← Selectable.one #[
    .case (b.recvSelector 100) fun (data, _) => return showBytes data,
    .case timeout fun _ => return "timed out"]
  IO.println s!"receive with no data: {first}"
  a.send "ping".toUTF8 bAddr
  let (data, _) ← Selectable.one #[.case (b.recvSelector 100) pure]
  IO.println s!"received with a selector: {showBytes data}"

def options : Async Unit := do
  let fresh ← Socket.mk
  showResult "name of a new socket" fresh.getSockName ok
  showResult "peer of a new socket" fresh.getPeerName ok
  showResult "send to no address" (discard <| fresh.native.send #["x".toUTF8] none) ok
  showResult "broadcast on a new socket" (fresh.setBroadcast true) ok
  showResult "multicast loop on a new socket" (fresh.setMulticastLoop true) ok
  showResult "TTL 0" (fresh.setTTL 0) ok
  showResult "TTL 256" (fresh.setTTL 256) ok
  showResult "TTL on a new socket" (fresh.setTTL 64) ok
  showResult "multicast TTL 256" (fresh.setMulticastTTL 256) ok
  showResult "multicast TTL on a new socket" (fresh.setMulticastTTL 1) ok
  showResult "multicast interface on a new socket" (fresh.setMulticastInterface (.v4 (IPv4Addr.ofParts 127 0 0 1))) ok
  let (socket, _) ← bound
  showResult "bind twice" (socket.bind (loopback 0)) ok
  showResult "peer of a bound socket" socket.getPeerName ok
  showResult "broadcast" (socket.setBroadcast true) ok
  showResult "multicast loop" (socket.setMulticastLoop false) ok
  showResult "TTL" (socket.setTTL 64) ok
  showResult "multicast TTL 0" (socket.setMulticastTTL 0) ok
  showResult "multicast interface" (socket.setMulticastInterface (.v4 (IPv4Addr.ofParts 127 0 0 1))) ok
  showResult "multicast interface that is not local" (socket.setMulticastInterface (.v4 (IPv4Addr.ofParts 192 0 2 1))) ok
  showResult "join a group that is not multicast" (socket.setMembership (.v4 (IPv4Addr.ofParts 127 0 0 1)) none .enterGroup) ok
  showResult "leave a group that was not joined" (socket.setMembership (.v4 (IPv4Addr.ofParts 224 0 0 1)) none .leaveGroup) ok

def reading : Async Unit := do
  let (a, _) ← bound
  let (b, bAddr) ← bound
  let _ ← b.native.recv 10
  showResult "parallel receive" (discard <| b.native.recv 10) ok
  showResult "parallel waitReadable" (discard <| b.native.waitReadable) ok
  b.native.cancelRecv
  b.native.cancelRecv
  a.send "abc".toUTF8 bAddr
  settle
  showAsync "receive nothing" (b.recv 0) (showBytes ·.1)
  showAsync "receive after cancel" (b.recv 10) (showBytes ·.1)
  -- A port that nothing listens on, as we just dropped the socket that had it.
  let closedPort ← do
    let (_, addr) ← bound
    pure addr.port
  let (c, _) ← bound
  c.connect (loopback closedPort)
  c.send "anyone?".toUTF8
  showAsync "receive from a closed port" (c.recv 10) (showBytes ·.1)

def program : Async Unit := do
  basics
  connected
  implicitBind
  selectors
  options
  reading
  IO.println "done"

def main : IO Unit := do
  discard <| EAsync.toBaseIO do
    try program catch e => IO.eprintln s!"error: {e}"
