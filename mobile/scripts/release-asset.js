'use strict';

/**
 * Legt die fertige Release-APK unter dem öffentlichen Namen ab und zeigt
 * Größe und SHA-256 (für die Release-Notes).
 *
 * Ergebnis: mobile/release-assets/CleanMusic-Android-<version>.apk
 *
 * Der Signierschlüssel liegt außerhalb des Repos; ohne ihn bleibt die
 * Release-APK unsigniert und ist nicht updatefähig.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
const version = (gradle.match(/versionName\s+"mobile-([\d.]+)"/) || [])[1];
if (!version) throw new Error('versionName "mobile-x.y.z" in android/app/build.gradle nicht gefunden');

const source = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!fs.existsSync(source)) {
  throw new Error(`Release-APK fehlt: ${source} – zuerst "gradlew assembleRelease" ausführen.`);
}

const targetDir = path.join(root, 'release-assets');
fs.mkdirSync(targetDir, { recursive: true });
const target = path.join(targetDir, `CleanMusic-Android-${version}.apk`);
fs.copyFileSync(source, target);

const data = fs.readFileSync(target);
const sha256 = crypto.createHash('sha256').update(data).digest('hex');

console.log(`Release-APK: ${path.relative(root, target)}`);
console.log(`Version:     mobile-${version}`);
console.log(`Größe:       ${(data.length / (1024 * 1024)).toFixed(1)} MB (${data.length} Bytes)`);
console.log(`SHA-256:     ${sha256}`);
