'use strict';

/*
 * Renders the widget assets (icon, selector preview, thumbnail) and the
 * sample cover used by the screenshot harness:
 *
 *   node_modules\.bin\electron.cmd extras/xeneon-edge/preview/make-assets.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { pathToFileURL } = require('node:url');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

const PAGE = pathToFileURL(path.join(__dirname, 'make-assets.html')).toString();
const WIDGET = path.join(__dirname, '..', 'widget', 'resources');
const PREVIEW = path.join(__dirname, 'cover.png');

const JOBS = [
  { kind: 'icon', width: 256, height: 256, out: path.join(WIDGET, 'icon.png'), transparent: true },
  { kind: 'preview', width: 128, height: 56, out: path.join(WIDGET, 'preview.png') },
  { kind: 'thumb', width: 512, height: 256, out: path.join(WIDGET, 'thumbnail.png') },
  { kind: 'cover', width: 400, height: 400, out: PREVIEW },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Destroying the last capture window must not end the whole batch.
app.on('window-all-closed', function () {});

app.whenReady().then(async () => {
  fs.mkdirSync(WIDGET, { recursive: true });

  for (const job of JOBS) {
    const win = new BrowserWindow({
      width: job.width,
      height: job.height,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: Boolean(job.transparent),
      backgroundColor: job.transparent ? '#00000000' : '#070a12',
      webPreferences: { sandbox: false },
    });
    try {
      await win.loadURL(`${PAGE}?kind=${job.kind}`);
      await wait(500);
      const image = await win.webContents.capturePage();
      fs.writeFileSync(job.out, image.toPNG());
      console.log(`ASSET ${job.kind} -> ${path.relative(process.cwd(), job.out)}`);
    } catch (error) {
      console.error(`ASSET_FAIL ${job.kind}: ${error.message}`);
    } finally {
      win.destroy();
      await wait(250);
    }
  }

  app.quit();
});
