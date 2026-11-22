'use strict';

/**
 * Baut den Web-Teil der Android-App:
 *  - kopiert renderer/ nach mobile/www
 *  - lässt Desktop-Dateien unangetastet
 *  - setzt Mobile-Brücke, Mobile-CSS und Viewport in die Kopie ein
 *
 * Nur die Kopie wird verändert. main.js, preload.js und renderer/* bleiben
 * unverändert im Repository.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const source = path.join(repoRoot, 'renderer');
const target = path.join(root, 'www');
const src = path.join(root, 'src');

const DESKTOP_ONLY = new Set([
  'mini.html',
  'mini.js',
  'musickit.html',
  'musickit.js',
]);

function copyRenderer(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'remote') continue; // Handy-Fernbedienung gibt es nur am Desktop
    if (DESKTOP_ONLY.has(entry.name)) continue;
    const fromPath = path.join(from, entry.name);
    const toPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyRenderer(fromPath, toPath);
    else fs.copyFileSync(fromPath, toPath);
  }
}

function inject(html) {
  const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />';
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
  // Nur die drei in native.js erlaubten Katalog-/Radio-Hosts. Auf Android
  // läuft der Verkehr über CapacitorHttp; die Regel hilft der Browser-Vorschau.
  html = html.replace(
    "connect-src 'self';",
    "connect-src 'self' https://itunes.apple.com https://api.deezer.com https://de1.api.radio-browser.info;"
  );
  html = html.replace('</head>', `  ${mobileCss}\n</head>`);
  html = html.replace(
    '<script src="app.js"></script>',
    `${nativeScript}\n  <script src="app.js"></script>`
  );
  html = html.replace('<html lang="de" data-perf="balanced">', '<html lang="de" data-perf="balanced" data-mobile="1">');
  return html;
}

if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error(`renderer/ nicht gefunden: ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
copyRenderer(source, target);

fs.copyFileSync(path.join(src, 'native.js'), path.join(target, 'native.js'));
fs.copyFileSync(path.join(src, 'mobile.css'), path.join(target, 'mobile.css'));

const indexFile = path.join(target, 'index.html');
const html = fs.readFileSync(indexFile, 'utf8');
fs.writeFileSync(indexFile, inject(html), 'utf8');

const mustExist = ['index.html', 'app.js', 'services.js', 'styles.css', 'native.js', 'mobile.css'];
for (const file of mustExist) {
  if (!fs.existsSync(path.join(target, file))) throw new Error(`www/${file} fehlt nach dem Build`);
}

console.log(`www gebaut: ${path.relative(root, target)} (${mustExist.join(', ')})`);
