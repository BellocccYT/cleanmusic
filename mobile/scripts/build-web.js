'use strict';

/**
 * Baut den Web-Teil der Android-App:
 *  - kopiert renderer/ nach mobile/www (Desktop-Dateien bleiben unangetastet)
 *  - erzeugt die Geräteweiche index.html
 *  - erzeugt app.html (Handy/Tablet) und tv.html (TV Lite)
 *  - kopiert Mobile-Brücke, Mobile-CSS und TV-Dateien
 *
 * Nur die Kopie in mobile/www wird verändert. main.js, preload.js und
 * renderer/* bleiben unverändert im Repository.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const source = path.join(repoRoot, 'renderer');
const target = path.join(root, 'www');
const src = path.join(root, 'src');

const DESKTOP_ONLY = new Set(['mini.html', 'mini.js', 'musickit.html', 'musickit.js']);
const REMOTE = 'remote';

const NETWORK_HOSTS = [
  'https://itunes.apple.com',
  'https://api.deezer.com',
  'https://de1.api.radio-browser.info',
  'https://lrclib.net',
  'https://api.github.com',
].join(' ');

function copyRenderer(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (DESKTOP_ONLY.has(entry.name)) continue;
    // Die Handy-Steuerseite wird vom nativen HTTP-Server ausgeliefert und
    // liegt deshalb als eigene Datei in www/remote/.
    const fromPath = path.join(from, entry.name);
    const toPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyRenderer(fromPath, toPath);
    else fs.copyFileSync(fromPath, toPath);
  }
}

function injectApp(html) {
  const viewport =
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />';
  const mobileCss = '<link rel="stylesheet" href="mobile.css" />';
  const nativeScript = '<script src="native.js"></script>';

  if (!html.includes('</head>')) throw new Error('renderer/index.html: </head> fehlt');
  if (!html.includes('<script src="app.js"></script>')) {
    throw new Error('renderer/index.html: app.js-Einbindung nicht gefunden');
  }

  html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  ${viewport}`);
  // Capacitor injiziert seine Laufzeit als Inline-Skript ins HTML. Ohne
  // 'unsafe-inline' blockiert die Desktop-CSP die native Brücke.
  html = html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
  // Auf Android laufen die Abfragen über CapacitorHttp; die Regel hilft der
  // Browser-Vorschau und dokumentiert dieselben Hosts wie native.js.
  html = html.replace("connect-src 'self';", `connect-src 'self' ${NETWORK_HOSTS};`);
  html = html.replace('</head>', `  ${mobileCss}\n</head>`);
  html = html.replace('<script src="app.js"></script>', `${nativeScript}\n  <script src="app.js"></script>`);
  html = html.replace('<html lang="de" data-perf="balanced">', '<html lang="de" data-perf="balanced" data-mobile="1">');
  return html;
}

function injectTv(html) {
  const viewport =
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />';
  if (!html.includes('</head>')) throw new Error('tv.html: </head> fehlt');
  html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  ${viewport}`);
  return html;
}

const SHELL = `<!doctype html>
<html lang="de" data-device="phone">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none';" />
  <title>CleanMusic</title>
  <link rel="icon" href="assets/logo-small.svg" />
  <style>
    html, body { height: 100%; margin: 0; background: #080a0e; color: #e8ecf3; }
    body { display: grid; place-items: center; font: 16px system-ui, sans-serif; }
    .splash { display: grid; justify-items: center; gap: 14px; opacity: 0.9; }
    .splash img { width: 64px; height: 64px; }
    .splash span { letter-spacing: 0.6px; color: #8d99ac; font-size: 13px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #5b8cff; animation: pulse 1s infinite alternate; }
    @keyframes pulse { from { opacity: 0.25; } to { opacity: 1; } }
  </style>
</head>
<body>
  <div class="splash">
    <img src="assets/logo-small.svg" alt="" />
    <strong>CleanMusic</strong>
    <span>Gerät wird erkannt …</span>
    <i class="dot"></i>
  </div>
  <script src="boot.js"></script>
</body>
</html>
`;

if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error(`renderer/ nicht gefunden: ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
copyRenderer(source, target);

for (const file of ['native.js', 'boot.js', 'mobile.css', 'tv.css', 'tv.js']) {
  fs.copyFileSync(path.join(src, file), path.join(target, file));
}

const indexHtml = fs.readFileSync(path.join(target, 'index.html'), 'utf8');
fs.writeFileSync(path.join(target, 'app.html'), injectApp(indexHtml), 'utf8');
fs.rmSync(path.join(target, 'index.html'));

const tvHtml = fs.readFileSync(path.join(src, 'tv.html'), 'utf8');
fs.writeFileSync(path.join(target, 'tv.html'), injectTv(tvHtml), 'utf8');
fs.writeFileSync(path.join(target, 'index.html'), SHELL, 'utf8');

// Handy-Steuerseite für den nativen HTTP-Server (und für den Desktop).
if (!fs.existsSync(path.join(target, REMOTE, 'index.html'))) {
  throw new Error('www/remote/index.html fehlt – renderer/remote/index.html nicht kopiert');
}

const mustExist = [
  'index.html',
  'app.html',
  'tv.html',
  'app.js',
  'services.js',
  'styles.css',
  'core/storage.js',
  'core/persist.js',
  'core/migrations.js',
  'core/recipes.js',
  'core/group.js',
  'core/text.js',
  'audio/queue.js',
  'onboarding-music.js',
  'assets/onboarding/thinking-music.mp3',
  'native.js',
  'mobile.css',
  'tv.js',
  'tv.css',
  'boot.js',
  'remote/index.html',
];
for (const file of mustExist) {
  if (!fs.existsSync(path.join(target, file))) throw new Error(`www/${file} fehlt nach dem Build`);
}

console.log(`www gebaut: ${path.relative(root, target)}`);
console.log(`  Geräteweiche: index.html -> app.html (Handy/Tablet) | tv.html (TV Lite)`);
console.log(`  Dateien: ${mustExist.join(', ')}`);
