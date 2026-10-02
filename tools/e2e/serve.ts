/**
 * The static server the `served` projects read the built site through: plain
 * files from site/dist over HTTP on one loopback port, the way a host such as
 * GitHub Pages hands them out. It exists so the flows run once from disk and
 * once from a server, the two ways the site is read.
 *
 * Deliberately small: GET and HEAD only, no directory listings, no caching
 * headers, and a 404 for anything outside site/dist. A folder answers its
 * index.html, the one convention a static host adds. An address the site does
 * not hold answers status 404 with the body of 404.html, at the address that
 * missed, as GitHub Pages does.
 *
 * Usage: tsx tools/e2e/serve.ts <port>   (started by playwright.config.ts)
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(fileURLToPath(import.meta.url), '../../../site/dist');

/** The media types the built site ships; anything else goes out as bytes. */
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0) {
  process.stderr.write('usage: serve.ts <port>\n');
  process.exit(2);
}

http
  .createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let file = path.join(DIST, pathname);
    // A path that climbs out of the site is a 404, never a file from elsewhere.
    if (file !== DIST && !file.startsWith(DIST + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      const page = path.join(DIST, '404.html');
      if (fs.existsSync(page)) {
        res.writeHead(404, { 'content-type': TYPES['.html'] as string });
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(page).pipe(res);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1');
