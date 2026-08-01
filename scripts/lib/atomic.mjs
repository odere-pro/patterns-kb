/* atomic.mjs — write a file without ever showing a reader a half-written one.
 *
 * `writeFileSync` opens with O_TRUNC: the file is emptied, then refilled. For
 * site/assets/graph.json — 1.7 MB, many write(2) calls — that window is wide enough to
 * matter, and seven other scripts JSON.parse that file at module load. Two sessions
 * working the same repo hit it for real: one ran `make all` while the other ran
 * `make check`, and the reader died with `SyntaxError: Unexpected end of JSON input`.
 *
 * Writing to a sibling temp file and renaming closes it. rename(2) is atomic within a
 * filesystem, so a concurrent reader sees either the old file or the new one, never a
 * prefix. The temp name carries the pid so two writers cannot collide on it either.
 *
 * This does NOT make `make all` safe to run twice concurrently — see lock.mjs for that.
 * It only guarantees that whatever a reader gets is a complete file.
 */
import { writeFileSync, renameSync, unlinkSync } from "node:fs";

export function writeAtomic(file, data) {
  const tmp = `${file}.tmp.${process.pid}`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  } catch (e) {
    /* Leave no debris behind on a failed write — a stray .tmp.<pid> beside a generated
     * artifact would look like a build output and confuse the next reader. */
    try { unlinkSync(tmp); } catch { /* already gone, or never created */ }
    throw e;
  }
}
