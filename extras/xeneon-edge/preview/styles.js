'use strict';

/*
 * Renders one screenshot per widget style (840 x 344):
 *
 *   node_modules\.bin\electron.cmd extras/xeneon-edge/preview/styles.js
 *
 * Results: extras/xeneon-edge/screenshots/styles-840x344-<style>.png
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

const WIDGET = path.join(__dirname, '..', 'widget', 'index.html');
const OUT = path.join(__dirname, '..', 'screenshots');
const PRELOAD = path.join(__dirname, 'preload.js');
const STYLES = ['auto', 'nacht', 'neon', 'glas', 'hell', 'retro'];
const WIDTH = 840;
const HEIGHT = 344;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.on('window-all-closed', function () {});

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const coverUrl =
    'data:image/png;base64,' +
    fs.readFileSync(path.join(__dirname, 'cover.png')).toString('base64');
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://localhost:4790/api/cover*'] },
    (_details, callback) => callback({ redirectURL: coverUrl })
  );

  for (const style of STYLES) {
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
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
        additionalArguments: ['--cm-scenario=playing', `--cm-style=${style}`],
      },
    });
    try {
      win.webContents.on('console-message', (_event, level, message) => {
        if (level >= 2 && !message.includes('Electron Security Warning')) {
          console.log(`CONSOLE ${style}: ${message}`);
        }
      });
      win.setPosition(-20000, 0);
      win.showInactive();
      await win.loadFile(WIDGET);
      await wait(1400);
      const image = await win.webContents.capturePage();
      const file = path.join(OUT, `styles-${WIDTH}x${HEIGHT}-${style}.png`);
      fs.writeFileSync(file, image.toPNG());
      console.log(`STYLE ${style} -> ${path.relative(process.cwd(), file)}`);
    } catch (error) {
      console.error(`STYLE_FAIL ${style}: ${error.message}`);
    } finally {
      win.destroy();
      await wait(200);
    }
  }

  app.quit();
});
