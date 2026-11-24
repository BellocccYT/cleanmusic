'use strict';

/**
 * Unit tests for lib/plugin-manifest.js – Plugin-API v3 manifest and permissions.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const M = require('../lib/plugin-manifest.js');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const head = (json) => `/* cleanmusic-plugin\n${json}\n*/\n'use strict';\nmodule.exports = { apiVersion: 2 };\n`;

check('no manifest: legacy plugin, everything allowed as before', () => {
  const result = M.parseManifest("'use strict';\nmodule.exports = { apiVersion: 2 };");
  assert.equal(result.manifest, null);
  assert.equal(result.error, null);
  assert.equal(M.allows(null, 'player'), true);
  assert.equal(M.allowsUrl(null, 'https://example.com'), true);
});

check('valid manifest: cleaned fields and known permissions only', () => {
  const { manifest, error } = M.parseManifest(
    head(JSON.stringify({
      apiVersion: 3,
      name: 'OBS\u0000-Visualizer',
      version: '1.2.0',
      description: 'x'.repeat(900),
      permissions: ['player', 'PLAYER', 'root', 'network:api.example.com', 'network:-bad-', 'visualizer'],
    }))
  );
  assert.equal(error, null);
  assert.equal(manifest.apiVersion, 3);
  assert.equal(manifest.name, 'OBS -Visualizer');
  assert.equal(manifest.description.length, 600);
  assert.deepEqual(manifest.permissions, ['player', 'network:api.example.com', 'visualizer']);
});

check('broken manifests are reported, not guessed', () => {
  assert.match(M.parseManifest(head('{ kaputt')).error, /JSON/);
  assert.match(M.parseManifest(head('[1,2]')).error, /Objekt/);
  assert.match(M.parseManifest(head('{"apiVersion": 2}')).error, /apiVersion/);
  const far = ' '.repeat(M.HEAD_BYTES) + head('{"apiVersion":3}');
  assert.equal(M.parseManifest(far).manifest, null, 'nur der Dateikopf zählt');
});

check('permissions are enforced for v3 plugins', () => {
  const manifest = { apiVersion: 3, permissions: ['player', 'network:api.example.com'] };
  assert.equal(M.allows(manifest, 'player'), true);
  assert.equal(M.allows(manifest, 'clipboard'), false);
  assert.equal(M.allowsUrl(manifest, 'https://api.example.com/v1'), true);
  assert.equal(M.allowsUrl(manifest, 'https://cdn.api.example.com/x'), true);
  assert.equal(M.allowsUrl(manifest, 'https://example.com/'), false);
  assert.equal(M.allowsUrl(manifest, 'https://evilapi.example.com.attacker.net/'), false);
  assert.equal(M.allowsUrl(manifest, 'file:///C:/Windows'), false);
  assert.equal(M.allowsUrl({ permissions: ['network'] }, 'https://anything.org'), true);
});

check('describe: readable German labels, most risky first', () => {
  const list = M.describe(['clipboard', 'network:api.example.com', 'downloads:cc-only', 'player']);
  assert.deepEqual(list.map((item) => item.id), ['downloads:cc-only', 'network:api.example.com', 'player', 'clipboard']);
  assert.equal(list[1].label, 'Internet: api.example.com');
  assert.ok(list.every((item) => item.label && item.detail && item.risk));
});

console.log(`${checks} passed, 0 failed`);
