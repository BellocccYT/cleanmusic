'use strict';

/**
 * Tiny static server for the preview pages (no dependencies).
 *
 *   node extras/browser-extension/preview/serve.js
 *   → http://127.0.0.1:8790/preview/index.html
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8790);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

http
  .createServer((request, response) => {
    const url = decodeURIComponent((request.url || '/').split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'preview/index.html' : url);
    if (!file.startsWith(ROOT)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(data);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`Preview: http://127.0.0.1:${PORT}/preview/index.html`);
  });
