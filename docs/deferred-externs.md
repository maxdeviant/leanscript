# Deferred externs

Externs that we have looked at and decided not to implement yet, with the reason and what we know
about the design so far. Remove an entry once its externs are implemented, and move anything it
says about differences from native Lean into `docs/differences.md`.

## File locks

**Externs:** `IO.FS.Handle.lock`, `IO.FS.Handle.tryLock`, and `IO.FS.Handle.unlock`.

**Targets:** Node. Browsers have no file system.

**Why deferred:** Node has no API for `flock`, and the runtime is pure JS, so the design needs more
thought.

**Options considered:**

- Run a short-lived helper process that inherits the handle's file descriptor and calls `flock(2)`
  on it: util-linux's `flock(1)` (`flock -x 3`) on Linux, falling back to `perl`. A `flock` lock
  belongs to the open file description, so it stays held after the helper exits. This matches
  native Lean, including across processes, but costs a process spawn per call. It fails where
  neither helper is installed (such as on Alpine), on NFS on Linux (where `flock` is emulated with
  per-process `fcntl` locks), and on Windows (where `LockFileEx` locks are released when the process
  that took them exits).
- Track locks in JS, keyed by the file's device and inode. This needs nothing extra, but only
  excludes other handles in the same program, not other processes.
- Lock files, as `proper-lockfile` and `lockfile` do, don't fit: they don't exclude a native
  process that takes a real `flock` on the same file, and they go stale after a crash.

Prior art outside Node (Deno's `FsFile.lock`, Rust's `File::lock`, Go's `lockedfile`, and Python's
`fcntl.flock`) calls `flock` on Unix and `LockFileEx` on Windows.

## Mutexes and condition variables

**Externs:** `Std.BaseMutex.new`, `.lock`, `.tryLock`, and `.unlock`; `Std.Condvar.new`, `.wait`,
`.notifyOne`, and `.notifyAll`; `Std.BaseRecursiveMutex.new`, `.lock`, `.tryLock`, and `.unlock`;
and `Std.BaseSharedMutex.new`, `.read`, `.tryRead`, `.unlockRead`, `.write`, `.tryWrite`, and
`.unlockWrite`.

**Targets:** Node and browsers.

**Why deferred:** to think more about what code that uses them can expect.

**Proposed design:** there is only one thread, so a critical section that doesn't suspend always
finds its mutex free, and mutual exclusion holds trivially. Only waiting is a problem:

- Locking a free mutex takes it. Locking a held one throws, as it could only be released by Lean
  code that can't run while we wait. `tryLock` returns `false` instead. A recursive mutex just
  counts, as it is always held by the current thread.
- A shared mutex tracks a reader count and a writer flag. Taking a read while a write is held, or a
  write while anything is held, throws. The `try` variants return `false` instead.
- `Condvar.wait` always throws, as only Lean code could notify it. `notifyOne` and `notifyAll` do
  nothing.

A mutex can still be contended when `Async` code holds it across an `await` and another callback
runs in the meantime. Native Lean blocks the second caller until the holder resumes on another
thread. That can't work here, even if Lean code ran on a worker that blocks with `Atomics.wait`,
because the holder must resume on the same blocked thread. So unlike waiting for an unfinished
task, this is effectively accepted. `lock` and `wait` are `BaseIO`, so they can't return an IO
error, and a failure ends the program.

Making `lock` always succeed would silently break mutual exclusion in that `Async` case, so we
ruled it out.

When implemented, add a "Blocking on mutexes and condition variables throws" entry, marked
accepted, to `docs/differences.md`, and drop the mention of mutexes from "Waiting for an unfinished
task throws".
