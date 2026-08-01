#!/usr/bin/env node
/* with-lock.mjs — run a command while holding the repo's build lock.
 *
 *   node scripts/with-lock.mjs <command> [args…]
 *
 * Atomic writes (lib/atomic.mjs) guarantee a reader never sees half a file. They do NOT
 * make two concurrent `make all` runs safe, because `make all` is seven builders in
 * sequence and six of them read back what the first one wrote:
 *
 *   session A: build.mjs writes graph.json
 *   session B: build.mjs writes graph.json        <- A's inputs just changed
 *   session A: build-hub, build-graph-page, …     <- generated from B's graph
 *
 * Every file involved is complete and parseable, every builder exits 0, and the result is
 * a hub built from one graph and a graph built from another. There is no error to notice.
 * That is why this is a lock and not more atomicity.
 *
 * flock(1) is not on stock macOS, so the lease is a file created with O_EXCL carrying the
 * holder's pid. A lock whose holder is gone is stale and gets taken — otherwise a killed
 * build would wedge the repo until someone deleted a file they have never heard of.
 */
import { openSync, writeSync, closeSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = join(ROOT, ".kb-build.lock");
const WAIT_MS = 60_000;   // a full `make all` is ~2s; a minute means something is wrong
const POLL_MS = 150;

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error("usage: with-lock.mjs <command> [args…]"); process.exit(1); }

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function acquire() {
  const deadline = Date.now() + WAIT_MS;
  let announced = false;
  for (;;) {
    try {
      const fd = openSync(LOCK, "wx");            // O_CREAT|O_EXCL — the atomic bit
      writeSync(fd, JSON.stringify({ pid: process.pid, cmd: [cmd, ...args].join(" ") }));
      closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let holder = null;
      try { holder = JSON.parse(readFileSync(LOCK, "utf8")); } catch { /* torn or empty */ }
      /* No readable holder, or a holder that no longer exists: the lock outlived its
       * process. Take it rather than making someone delete a file by hand. */
      if (!holder?.pid || !alive(holder.pid)) {
        try { unlinkSync(LOCK); } catch { /* another waiter won the race; loop and retry */ }
        continue;
      }
      if (!announced) {
        console.error(`waiting for the build lock (held by pid ${holder.pid}: ${holder.cmd ?? "?"})…`);
        announced = true;
      }
      if (Date.now() > deadline) {
        console.error(`build lock still held by pid ${holder.pid} after ${WAIT_MS / 1000}s — giving up.`);
        console.error(`if that process is gone, remove ${LOCK}`);
        process.exit(1);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS);
    }
  }
}

acquire();
try {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  process.exitCode = r.status ?? 1;
} finally {
  /* Release only our own lease — if it was stolen while we ran, the thief owns it now. */
  try {
    if (existsSync(LOCK) && JSON.parse(readFileSync(LOCK, "utf8")).pid === process.pid) unlinkSync(LOCK);
  } catch { /* nothing safe left to do at exit */ }
}
