import Std.Net.Addr

open Std.Net

/-- Hides `x` from the compiler, so that operations on it are not constant folded. -/
def hide (x : α) : IO α := do
  (← IO.mkRef x).get

def ipv4 : IO Unit := do
  for s in ["0.0.0.0", "127.0.0.1", "255.255.255.255", "192.168.1.10", "256.0.0.1", "1.2.3",
      "1.2.3.4.5", "01.2.3.4", "0.0.0.00", "1.2.3.", ".1.2.3", "1..2.3", "1.2.3.4 ", " 1.2.3.4",
      "a.b.c.d", "", "1.2.3.4\x00junk", "1.2.3.4%eth0", "١.٢.٣.٤"] do
    let addr := IPv4Addr.ofString (← hide s)
    IO.println s!"{s.quote}: {addr.map (·.octets.toList)} {addr.map (·.toString)}"
  IO.println (IPv4Addr.ofParts 10 0 (← hide 0) 1).toString

def ipv6 : IO Unit := do
  for s in ["::", "::1", "1::", "1:2:3:4:5:6:7:8", "2001:db8::1", "2001:DB8:0:0:1:0:0:1",
      "2001:db8:0:0:1::1", "fe80::1%eth0", "fe80::1%", "::ffff:192.168.1.1", "::192.168.1.1",
      "::0.0.0.1", "1:2:3:4:5:6:1.2.3.4", "1:2:3:4:5:6:7:1.2.3.4", "1:2:3:4:5:6:7:8:9", ":1::",
      "1:::2", "1::2::3", "12345::", "1:2:3:4:5:6:7::", "::1:2:3:4:5:6:7", "1:2:3:4:5:6:7:",
      ":", "", "g::", "::ffff:1.2.3", "::ffff:1.2.3.4.5", "0:0:0:0:0:ffff:0:1", "0:0:1:0:0:0:1:0",
      "1:0:0:2:0:0:0:3", "0:0:0:0:0:0:0:2", "::1%" ++ "".pushn 'x' 50] do
    let addr := IPv6Addr.ofString (← hide s)
    IO.println s!"{s.quote}: {addr.map (·.segments.toList)} {addr.map (·.toString)}"
  for parts in [[0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 1, 1], [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1],
      [0, 0, 0, 0, 0, 0xfffe, 0x7f00, 1], [1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 1, 0, 0, 1],
      [0xabcd, 0, 0xef01, 0, 0, 0x2345, 0, 0]] do
    match ← hide parts with
    | [a, b, c, d, e, f, g, h] => IO.println (IPv6Addr.ofParts a b c d e f g h).toString
    | _ => pure ()

def addrs : IO Unit := do
  let v4 := IPAddr.v4 (IPv4Addr.ofParts 10 1 2 3)
  let v6 := IPAddr.v6 (IPv6Addr.ofParts 0xfe80 0 0 0 0 0 0 1)
  IO.println s!"{v4} {v6} {v4 == v6} {v4 == (← hide v4)}"
  let sock := SocketAddress.v6 { addr := IPv6Addr.ofParts 0 0 0 0 0 0 0 1, port := 8080 }
  IO.println s!"{sock.ipAddr} {sock.port}"

def main : IO Unit := do
  ipv4
  ipv6
  addrs
