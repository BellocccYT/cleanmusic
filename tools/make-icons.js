'use strict';

/**
 * Generates the CleanMusic logo (SVG) and the app icons (PNG + ICO).
 *
 *   npx electron tools/make-icons.js
 *
 * Writes build/icon.svg, build/icon.png (1024), build/icon.ico (16–256),
 * renderer/assets/logo.svg (full) and renderer/assets/logo-small.svg
 * (simplified for small sizes) and renderer/assets/icon.png (256).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Equalizer bar tops (0 = top of the tile, 1024 = bottom), left → right.
const BAR_TOPS = [
  900, 838, 812, 818, 836, 796, 790, 834, 762, 838, 896, 834, 796, 836, 868, 838, 796, 812, 836, 812, 798,
  816, 840, 870, 900, 902, 924, 958,
];

function note(fill) {
  // Two beamed eighth notes, stems on the right of the heads.
  return `
    <g fill="${fill}" transform="translate(-22 -12)">
      <path d="M383 330 Q383 288 422 273 L775 152 Q830 133 830 190 L830 650 L726 650 L726 281 L487 363 L487 770 L383 770 Z" />
      <ellipse cx="368" cy="770" rx="152" ry="114" transform="rotate(-22 368 770)" />
      <ellipse cx="711" cy="650" rx="152" ry="114" transform="rotate(-22 711 650)" />
    </g>`;
}

function bars(count, width, tops) {
  const step = 1024 / count;
  return tops
    .slice(0, count)
    .map((top, i) => {
      const x = (i + 0.5) * step;
      return `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="1100" />`;
    })
    .join('\n      ');
}

function logo({ small = false } = {}) {
  const count = small ? 9 : BAR_TOPS.length;
  const tops = small
    ? [880, 812, 760, 830, 740, 818, 770, 836, 900]
    : BAR_TOPS;
  const width = small ? 64 : 21;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="cm-bg" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#6a82ff" />
      <stop offset="0.55" stop-color="#93c3ff" />
      <stop offset="1" stop-color="#b4f5ff" />
    </linearGradient>
    <radialGradient id="cm-shine" cx="0.8" cy="0.08" r="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5" />
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="cm-note" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#2b45a6" />
      <stop offset="1" stop-color="#4b7cc8" />
    </linearGradient>
    <linearGradient id="cm-eq" gradientUnits="userSpaceOnUse" x1="0" y1="740" x2="0" y2="1024">
      <stop offset="0" stop-color="#0a7dff" />
      <stop offset="1" stop-color="#18f3e1" />
    </linearGradient>
    <clipPath id="cm-tile"><rect width="1024" height="1024" rx="232" /></clipPath>
    <filter id="cm-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${small ? 22 : 14}" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
  <g clip-path="url(#cm-tile)">
    <rect width="1024" height="1024" fill="url(#cm-bg)" />
    <rect width="1024" height="1024" fill="url(#cm-shine)" />
    ${note('url(#cm-note)')}
    <g stroke="url(#cm-eq)" stroke-width="${width}" stroke-linecap="round" filter="url(#cm-glow)">
      ${bars(count, width, tops)}
    </g>
  </g>
  <rect x="6" y="6" width="1012" height="1012" rx="227" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="12" />
</svg>
`;
}

/* ICO with PNG-compressed entries (Windows Vista and newer). */
function writeIco(file, images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  images.forEach(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  });
  fs.writeFileSync(file, Buffer.concat([header, ...entries, ...images.map((image) => image.png)]));
}

async function main() {
  const { app, BrowserWindow } = require('electron');
  const full = logo();
  const small = logo({ small: true });

  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'renderer', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.svg'), full);
  fs.writeFileSync(path.join(ROOT, 'renderer', 'assets', 'logo.svg'), full);
  fs.writeFileSync(path.join(ROOT, 'renderer', 'assets', 'logo-small.svg'), small);

  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 400, height: 400, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<!doctype html><html><body></body></html>');

  const render = (svg, size) =>
    win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = ${size};
          canvas.height = ${size};
          const g = canvas.getContext('2d');
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, ${size}, ${size});
          resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        img.onerror = () => reject(new Error('svg'));
        img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
      })
    `).then((b64) => Buffer.from(b64, 'base64'));

  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), await render(full, 1024));
  fs.writeFileSync(path.join(ROOT, 'renderer', 'assets', 'icon.png'), await render(full, 256));

  const images = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    images.push({ size, png: await render(size <= 48 ? small : full, size) });
  }
  writeIco(path.join(ROOT, 'build', 'icon.ico'), images);

  // Preview sheet for a quick look.
  if (process.env.CM_PREVIEW) {
    const sheet = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const sizes = [256, 128, 64, 32, 24, 16];
        const canvas = document.createElement('canvas');
        canvas.width = 620; canvas.height = 280;
        const g = canvas.getContext('2d');
        g.fillStyle = '#1b1f27'; g.fillRect(0, 0, 620, 280);
        const full = 'data:image/svg+xml;base64,${Buffer.from(full).toString('base64')}';
        const small = 'data:image/svg+xml;base64,${Buffer.from(small).toString('base64')}';
        let x = 12, pending = sizes.length;
        sizes.forEach((size) => {
          const img = new Image();
          const at = x; x += size + 14;
          img.onload = () => { g.drawImage(img, at, 12, size, size); if (--pending === 0) resolve(canvas.toDataURL('image/png').split(',')[1]); };
          img.src = size <= 48 ? small : full;
        });
      })
    `);
    fs.writeFileSync(process.env.CM_PREVIEW, Buffer.from(sheet, 'base64'));
  }

  console.log('ICONS_OK', images.map((image) => `${image.size}:${image.png.length}`).join(' '));
  app.quit();
}

main().catch((error) => {
  console.error('ICONS_FAIL', error.message);
  process.exit(1);
});
