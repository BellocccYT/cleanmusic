'use strict';

/*
 * Renders the widget screenshots without a XENEON EDGE:
 *
 *   node_modules\.bin\electron.cmd extras/xeneon-edge/preview/shoot.js
 *
 * The preload stubs iCUE (properties + globals) and answers the local
 * CleanMusic bridge with fixed sample titles. Results go to
 * extras/xeneon-edge/screenshots/.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-gpu');

const WIDGET = path.join(__dirname, '..', 'widget', 'index.html');
const OUT = path.join(__dirname, '..', 'screenshots');
const PRELOAD = path.join(__dirname, 'preload.js');

const SIZES = [
  { id: '840x344', width: 840, height: 344 },
  { id: '2536x696', width: 2536, height: 696 },
  { id: '696x840', width: 696, height: 840 },
];

const STATES = [
  { id: 'connect', scenario: 'connect', wait: 900 },
  { id: 'pairing', scenario: 'pairing', click: true, wait: 1100 },
  { id: 'playing', scenario: 'playing', wait: 1300 },
  { id: 'pause', scenario: 'pause', wait: 900 },
  { id: 'radio', scenario: 'radio', wait: 900 },
  { id: 'offline', scenario: 'offline', wait: 5000 },
  { id: 'idle', scenario: 'idle', wait: 900 },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Keep the batch alive while individual capture windows are destroyed.
app.on('window-all-closed', function () {});

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // <img> requests do not go through the preload's fetch stub; answer the
  // cover proxy with the sample cover as an inline image.
  const coverUrl =
    'data:image/png;base64,' +
    fs.readFileSync(path.join(__dirname, 'cover.png')).toString('base64');
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://localhost:4790/api/cover*'] },
    (_details, callback) => callback({ redirectURL: coverUrl })
  );

  for (const size of SIZES) {
    for (const state of STATES) {
      const win = new BrowserWindow({
        width: size.width,
        height: size.height,
        useContentSize: true,
        show: false,
        frame: false,
        skipTaskbar: true,
        focusable: false,
        backgroundColor: '#070a12',
        webPreferences: {
          preload: PRELOAD,
          contextIsolation: false,
          nodeIntegration: false,
          sandbox: false,
          backgroundThrottling: false,
          additionalArguments: [`--cm-scenario=${state.scenario}`],
        },
      });
      try {
        win.webContents.on('console-message', (_event, level, message) => {
          if (level >= 2 && !message.includes('Electron Security Warning')) {
            console.log(`CONSOLE ${size.id} ${state.id}: ${message}`);
          }
        });
        // A hidden window is not repainted on Windows, so capturePage would
        // return the first frame. Move it off-screen and show it instead.
        win.setPosition(-20000, 0);
        win.showInactive();
        await win.loadFile(WIDGET);
        await wait(state.wait || 900);
        if (state.click) {
          await win.webContents.executeJavaScript(
            "document.getElementById('btnConnect').click(); true"
          );
          await wait(900);
        }
        const image = await win.webContents.capturePage();
        const file = path.join(OUT, `${size.id}-${state.id}.png`);
        fs.writeFileSync(file, image.toPNG());
        console.log(`SHOT ${size.id} ${state.id} -> ${path.relative(process.cwd(), file)}`);
      } catch (error) {
        console.error(`SHOT_FAIL ${size.id} ${state.id}: ${error.message}`);
      } finally {
        win.destroy();
      }
    }
  }

  app.quit();
});
