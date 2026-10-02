#!/usr/bin/env node
/* kb.mjs — read and write the knowledge base without opening a page.
 *
 * A thin launcher: the program is tools/src/kb/cli.ts, which reads the markdown under docs/
 * and the data files in docs/data/. This file stays at the path every skill, agent and layer
 * names, loads the tools workspace's TypeScript loader in this process (no second process to
 * start) and hands it the arguments. The command surface lives in tools/src/kb/spec.ts; run
 * `node scripts/kb.mjs` with no arguments for the full list. KB_ROOT points it at another
 * tree, as the tests do.
 *
 * It needs the tools workspace installed: with no node_modules it says to run `make install`
 * and exits 2, rather than failing on a missing import. */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = join(ROOT, "node_modules", "tsx", "dist", "esm", "api", "index.mjs");

if (!existsSync(API)) {
  process.stderr.write("kb.mjs: the tools workspace is not installed — run: make install\n");
  process.exit(2);
}

const { register } = await import(pathToFileURL(API).href);
register();
const { main } = await import(pathToFileURL(join(ROOT, "tools", "src", "kb", "cli.ts")).href);
main(import.meta.url, process.argv);
