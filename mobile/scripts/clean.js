'use strict';

// Entfernt nur generierte Mobile-Artefakte (www und Android-Build-Ausgaben).
// Quellcode, Signierschlüssel und die Android-Projektdateien bleiben erhalten.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'www'),
  path.join(root, 'android', 'app', 'build'),
  path.join(root, 'android', 'build'),
];

for (const target of targets) {
  if (!target.startsWith(root + path.sep)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`entfernt: ${path.relative(root, target)}`);
}
