'use strict';

/**
 * Renders the store screenshots (1280 × 800, PNG) without a visible window.
 *
 *   node extras/browser-extension/preview/build.js
 *   node extras/browser-extension/preview/serve.js     (second terminal)
 *   node extras/browser-extension/preview/shoot.js
 *
 * Two passes per shot, because Chromium's capturePage() does not include
 * images that live inside an iframe: first the real page is captured at its
 * own size, then the 1280 × 800 composition replaces the iframe with that
 * capture and is captured as well. No external image service, no YouTube CDN.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-gpu');

const BASE = process.env.PREVIEW_URL || 'http://127.0.0.1:8790/preview/';
const CAPTURES = path.join(__dirname, 'captures');
const OUT = path.join(__dirname, '..', 'store-assets');
const LAUNCH_LINK =
  'cleanmusic%3A%2F%2Fadd%3Fsrc%3Dyoutube%26id%3DdQw4w9WgXcQ%26t%3DNever%2520Gonna%2520Give%2520You%2520Up%26a%3DRick%2520Astley';

const SHOTS = [
  {
    key: 'popup',
    page: 'build/popup.html',
    size: [360, 414],
    shot: 'shot-popup.html',
    out: '02-popup-1280x800.png'
  },
  {
    key: 'options',
    page: 'build/options.html',
    size: [700, 704],
    shot: 'shot-options.html',
    out: '03-einstellungen-1280x800.png'
  },
  {
    key: 'onboarding',
    page: 'build/onboarding.html',
    size: [700, 574],
    shot: 'shot-onboarding.html',
    out: '04-einrichtung-1280x800.png'
  },
  {
    key: 'launch',
    page: `build/launch.html?link=${LAUNCH_LINK}`,
    size: [640, 560],
    shot: 'shot-launch.html',
    out: '05-uebergabe-1280x800.png'
  }
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function load(win, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await win.loadURL(url);
      return true;
    } catch (error) {
      console.warn('  retry:', url, error.message);
      await wait(500);
    }
  }
  return false;
}

app.whenReady().then(async () => {
  fs.mkdirSync(CAPTURES, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,
    show: false,
    opacity: 0,
    backgroundColor: '#07090d',
    webPreferences: { contextIsolation: true, backgroundThrottling: false }
  });
  // A hidden window does not composite reliably: capturePage() then returns
  // stale frames (missing thumbnails inside pages, old checkbox states).
  // Showing it with opacity 0 keeps it invisible while painting normally.
  win.showInactive();

  const done = [];

  for (const shot of SHOTS) {
    const [width, height] = shot.size;

    // Pass 1: the real page at its real size.
    win.setContentSize(width, height);
    if (!(await load(win, BASE + shot.page))) {
      console.warn('  skip', shot.key, '(page did not load)');
      continue;
    }
    await win.webContents.executeJavaScript(
      `document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';`
    );
    await wait(900);
    const pageImage = await win.webContents.capturePage();
    fs.writeFileSync(path.join(CAPTURES, `${shot.key}.png`), pageImage.toPNG());

    // Pass 2: the 1280 × 800 composition with the capture in place of the iframe.
    win.setContentSize(1280, 800);
    if (!(await load(win, BASE + shot.shot))) {
      console.warn('  skip', shot.shot, '(composition did not load)');
      continue;
    }
    await wait(700);
    await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.querySelector('iframe');
        if (!frame) return false;
        const img = document.createElement('img');
        img.src = '/preview/captures/${shot.key}.png?t=' + Date.now();
        img.width = frame.getAttribute('width');
        img.height = frame.getAttribute('height');
        img.alt = '';
        img.style.display = 'block';
        frame.replaceWith(img);
        return true;
      })()
    `);
    await wait(600);
    const composed = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, shot.out), composed.toPNG());
    done.push({ file: shot.out, size: composed.getSize() });
  }

  win.destroy();
  console.log('SHOTS ' + JSON.stringify(done));
  app.quit();
});
