'use strict';

/**
 * Builds preview/build/ – a throwaway copy of the extension with the Chrome
 * API stub injected. The preview only exists for screenshots and design work
 * and is never part of the store ZIP (which packs cleanmusic-youtube/).
 *
 *   node extras/browser-extension/preview/build.js
 */

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'cleanmusic-youtube');
const DST = path.join(__dirname, 'build');
const STUB = path.join(__dirname, 'chrome-stub.js');
const PAGES = ['popup.html', 'options.html'];
const SKIP = new Set(['README.md', 'STORE.md']);

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });

for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
  if (entry.isFile() && SKIP.has(entry.name)) continue;
  const source = path.join(SRC, entry.name);
  const target = path.join(DST, entry.name);
  if (entry.isDirectory()) copyTree(source, target);
  else fs.copyFileSync(source, target);
}

fs.copyFileSync(STUB, path.join(DST, 'chrome-stub.js'));

// Screenshots must not depend on YouTube's CDN (offline previews, CI). The
// preview copy therefore resolves thumbnails to a bundled sample image.
fs.copyFileSync(path.join(__dirname, 'sample-thumb.jpg'), path.join(DST, 'sample-thumb.jpg'));
fs.appendFileSync(
  path.join(DST, 'shared.js'),
  '\n/* preview only: local sample thumbnail instead of i.ytimg.com */\n' +
    "CMX.thumbnailUrl = () => 'sample-thumb.jpg';\n"
);

for (const page of PAGES) {
  const file = path.join(DST, page);
  const html = fs.readFileSync(file, 'utf8');
  const marker = '<script src="shared.js"></script>';
  if (!html.includes(marker)) {
    throw new Error(`${page}: script marker not found`);
  }
  fs.writeFileSync(
    file,
    html.replace(marker, '<script src="chrome-stub.js"></script>\n  ' + marker)
  );
}

console.log('Preview gebaut:', DST);
console.log('Server starten:  node extras/browser-extension/preview/serve.js');
