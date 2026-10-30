import Std.Async.TCP
import Std.Async.Timer

open Std.Async
open Std.Async.TCP
open Std.Net
open Std.Internal.UV.TCP (Socket)

def loopback (port : UInt16) : SocketAddress :=
  .v4 { addr := IPv4Addr.ofParts 127 0 0 1, port }

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

def showBytes : Option ByteArray → String
  | none => "eof"
  | some bytes => (String.fromUTF8? bytes).getD "invalid UTF-8" |>.quote

def ok (_ : α) : String := "ok"

/-- Returns a listening server on an ephemeral loopback port, and its address. -/
def listener : IO (Socket.Server × SocketAddress) := do
  let server ← Socket.Server.mk
  server.bind (loopback 0)
  server.listen 128
  return (server, ← server.getSockName)

def echo : Async Unit := do
  let (server, addr) ← listener
  IO.println s!"listening on an ephemeral port: {addr.port != 0}"
  let client ← Socket.Client.mk
  client.noDelay
  let accepted ← async server.accept
  client.connect addr
  let conn ← await accepted
  IO.println s!"peer is the server: {(← client.getPeerName) == addr}"
  IO.println s!"accepted the client: {(← conn.getPeerName) == (← client.getSockName)}"
  client.sendAll #["hel".toUTF8, "lo".toUTF8, ByteArray.empty]
  client.send ByteArray.empty
  -- Wait for all of the data, so that the reads below don't depend on how it arrives.
  let sleep ← Sleep.mk 50
  sleep.wait
  IO.println s!"server read: {showBytes (← conn.recv? 3)}"
  IO.println s!"server read: {showBytes (← conn.recv? 100)}"
  client.shutdown
  showAsync "second shutdown" client.shutdown ok
  showAsync "send after shutdown" (client.send "x".toUTF8) ok
  IO.println s!"server read: {showBytes (← conn.recv? 100)}"
  showAsync "server read after eof" (conn.recv? 100) showBytes
  conn.send "bye".toUTF8
  conn.shutdown
  IO.println s!"client read: {showBytes (← client.recv? 100)}"
  IO.println s!"client read: {showBytes (← client.recv? 100)}"

def bulk : Async Unit := do
  let (server, addr) ← listener
  let client ← Socket.Client.mk
  let accepted ← async server.accept
  client.connect addr
  let conn ← await accepted
  let size := 1000000
  let data := ByteArray.mk (Array.ofFn (n := size) fun i => (i.val % 251).toUInt8)
  let sent ← async do
    client.send data
    client.shutdown
  let mut received := ByteArray.empty
  repeat
    match ← conn.recv? 65536 with
    | some chunk => received := received ++ chunk
    | none => break
  await sent
  IO.println s!"bulk: received {received.size} bytes, intact: {received == data}"

def selectors : Async Unit := do
  let (server, addr) ← listener
  let timeout ← Selector.sleep 50
  let first ← Selectable.one #[
    .case server.acceptSelector fun _ => return "accepted",
    .case timeout fun _ => return "timed out"]
  IO.println s!"accept with no client: {first}"
  let client ← Socket.Client.mk
  client.connect addr
  let conn ← Selectable.one #[.case server.acceptSelector pure]
  IO.println "accepted with a selector"
  let timeout ← Selector.sleep 50
  let first ← Selectable.one #[
    .case (conn.recvSelector 100) fun data => return showBytes data,
    .case timeout fun _ => return "timed out"]
  IO.println s!"receive with no data: {first}"
  client.send "ping".toUTF8
  let data ← Selectable.one #[.case (conn.recvSelector 100) pure]
  IO.println s!"received with a selector: {showBytes data}"
  client.shutdown
  let data ← Selectable.one #[.case (conn.recvSelector 100) pure]
  IO.println s!"received with a selector: {showBytes data}"

def tryAccept : Async Unit := do
  let (server, addr) ← listener
  IO.println s!"tryAccept with no client: {(← server.tryAccept).isSome}"
  let client ← Socket.Client.mk
  client.connect addr
  let sleep ← Sleep.mk 50
  sleep.wait
  IO.println s!"tryAccept with a client: {(← server.tryAccept).isSome}"

def errors : Async Unit := do
  -- A port that nothing listens on, as we just closed the server that had it.
  let closedPort ← do
    let (_, addr) ← listener
    pure addr.port
  let client ← Socket.Client.mk
  showAsync "connect to a closed port" (client.connect (loopback closedPort)) ok
  let fresh ← Socket.new
  showResult "receive on a new socket" (discard <| fresh.recv? 10) ok
  showResult "send on a new socket" (discard <| fresh.send #["x".toUTF8]) ok
  showResult "shutdown on a new socket" (discard <| fresh.shutdown) ok
  showResult "peer of a new socket" fresh.getPeerName ok
  showResult "name of a new socket" fresh.getSockName ok
  showResult "keepAlive with no delay" (fresh.keepAlive 1 0) ok
  showResult "keepAlive off" (fresh.keepAlive 0 0) ok
  showResult "keepAlive" (fresh.keepAlive 1 10) ok
  let bound ← Socket.new
  bound.bind (loopback 0)
  showResult "bind twice" (bound.bind (loopback 0)) ok
  showResult "peer of a bound socket" bound.getPeerName ok
  showResult "name of a bound socket" bound.getSockName ok
  let (server, _) ← listener
  let _ ← server.native.accept
  showResult "parallel accept" (discard <| server.native.accept) ok
  showResult "parallel tryAccept" (discard <| server.native.tryAccept) ok
  server.native.cancelAccept
  server.native.cancelAccept
  showResult "accept after cancel" (discard <| server.native.accept) ok
  server.native.cancelAccept

def connected : Async Unit := do
  let (server, addr) ← listener
  let client ← Socket.Client.mk
  let accepted ← async server.accept
  client.connect addr
  let conn ← await accepted
  showResult "keepAlive with no delay when connected" (client.native.keepAlive 1 0) ok
  showResult "keepAlive off when connected" (client.native.keepAlive 0 0) ok
  showResult "keepAlive when connected" (client.native.keepAlive 1 10) ok
  let _ ← conn.native.recv? 10
  showResult "parallel receive" (discard <| conn.native.recv? 10) ok
  showResult "parallel waitReadable" (discard <| conn.native.waitReadable) ok
  conn.native.cancelRecv
  conn.native.cancelRecv
  client.send "abc".toUTF8
  let sleep ← Sleep.mk 50
  sleep.wait
  showAsync "receive nothing" (conn.recv? 0) showBytes
  showAsync "receive after cancel" (conn.recv? 10) showBytes
  -- Dropping the server's end of the connection closes it.
  let closed ← do
    let accepted ← async server.accept
    let client ← Socket.Client.mk
    client.connect addr
    discard <| await accepted
    pure client
  showAsync "receive after the peer closed" (closed.recv? 10) showBytes

def program : Async Unit := do
  echo
  bulk
  selectors
  tryAccept
  connected
  errors
  IO.println "done"

def main : IO Unit := do
  discard <| EAsync.toBaseIO do
    try program catch e => IO.eprintln s!"error: {e}"
