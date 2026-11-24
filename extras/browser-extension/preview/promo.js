'use strict';

/**
 * Renders the two store promo tiles (24-bit PNG, no alpha).
 *
 *   node extras/browser-extension/preview/serve.js     (second terminal)
 *   node extras/browser-extension/preview/promo.js
 *
 * Output: ../store-assets/promo-klein-440x280.png and promo-gross-1400x560.png
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-gpu');

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:8790/preview/';
const OUT = path.join(__dirname, '..', 'store-assets');

const TILES = [
  { page: 'promo-small.html', width: 440, height: 280, out: 'promo-klein-440x280.png' },
  { page: 'promo-large.html', width: 1400, height: 560, out: 'promo-gross-1400x560.png' }
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const win = new BrowserWindow({
    width: 1400,
    height: 560,
    useContentSize: true,
    show: false,
    opacity: 0,
    backgroundColor: '#07090d',
    webPreferences: { contextIsolation: true, backgroundThrottling: false }
  });
  win.showInactive();

  const done = [];
  for (const tile of TILES) {
    win.setContentSize(tile.width, tile.height);
    let loaded = false;
    for (let attempt = 0; attempt < 3 && !loaded; attempt += 1) {
      try {
        await win.loadURL(BASE + tile.page);
        loaded = true;
      } catch (error) {
        console.warn('  retry:', tile.page, error.message);
        await wait(500);
      }
    }
    if (!loaded) continue;
    await wait(900);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, tile.out), image.toPNG());
    done.push({ file: tile.out, size: image.getSize() });
  }

  win.destroy();
  console.log('PROMO ' + JSON.stringify(done));
  app.quit();
});
