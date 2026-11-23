'use strict';

/**
 * Checks for the CleanMusic browser extension.
 *
 *   node extras/browser-extension/test/extension.test.js
 *
 * No browser and no dependencies: pure helpers plus a structural audit of the
 * manifest, the pages and the files they reference. Run this before packing a
 * new version for the Chrome Web Store.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', 'cleanmusic-youtube');
const CMX = require(path.join(ROOT, 'shared.js'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error.message}`);
  }
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}

/* --- URL handling -------------------------------------------------------- */

test('watch links are parsed', () => {
  assert.deepEqual(CMX.parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), {
    id: 'dQw4w9WgXcQ'
  });
  assert.deepEqual(CMX.parseYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42'), {
    id: 'dQw4w9WgXcQ'
  });
  assert.deepEqual(CMX.parseYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), {
    id: 'dQw4w9WgXcQ'
  });
});

test('short, embed, live and youtu.be links are parsed', () => {
  assert.equal(CMX.parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=3').id, 'dQw4w9WgXcQ');
  assert.equal(CMX.parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
  assert.equal(CMX.parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
  assert.equal(CMX.parseYouTubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
});

test('foreign hosts and broken ids are rejected', () => {
  assert.equal(CMX.parseYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(CMX.parseYouTubeUrl('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(CMX.parseYouTubeUrl('https://www.youtube.com/watch?v=short'), null);
  assert.equal(CMX.parseYouTubeUrl('https://www.youtube.com/results?search_query=test'), null);
  assert.equal(CMX.parseYouTubeUrl('not a url'), null);
  assert.equal(CMX.parseYouTubeUrl(''), null);
});

/* --- Deep links ---------------------------------------------------------- */

test('deep links round-trip through the app rules', () => {
  const link = CMX.buildDeepLink('add', {
    id: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley'
  });
  const parsed = CMX.parseDeepLink(link);
  assert.equal(parsed.action, 'add');
  assert.equal(parsed.src, 'youtube');
  assert.equal(parsed.id, 'dQw4w9WgXcQ');
  assert.equal(parsed.title, 'Never Gonna Give You Up');
  assert.equal(parsed.artist, 'Rick Astley');
  assert.equal(CMX.isAllowedLink(link), true);
});

test('play is the fallback action, add is the explicit one', () => {
  const video = { id: 'dQw4w9WgXcQ' };
  assert.match(CMX.buildDeepLink('play', video), /^cleanmusic:\/\/play\?/);
  assert.match(CMX.buildDeepLink('add', video), /^cleanmusic:\/\/add\?/);
  assert.match(CMX.buildDeepLink('something-else', video), /^cleanmusic:\/\/add\?/);
  assert.equal(CMX.buildDeepLink('add', { id: 'nope' }), '');
});

test('control characters and length limits are cleaned', () => {
  const link = CMX.buildDeepLink('add', {
    id: 'dQw4w9WgXcQ',
    title: 'A\u0000B'.repeat(200),
    artist: '  Spaced   Artist  '
  });
  const parsed = CMX.parseDeepLink(link);
  assert.ok(!parsed.title.includes('\u0000'));
  assert.ok(parsed.title.length <= 200);
  assert.equal(parsed.artist, 'Spaced Artist');
});

test('search links are built and validated', () => {
  const link = CMX.buildSearchLink('Rick Astley Never Gonna');
  assert.match(link, /^cleanmusic:\/\/play\?src=search&t=/);
  assert.equal(CMX.parseDeepLink(link).action, 'play');
  assert.equal(CMX.parseDeepLink(link).src, 'search');
  assert.equal(CMX.buildSearchLink('   '), '');
});

test('anything that is not a valid cleanmusic link is rejected', () => {
  const rejected = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'cleanmusic://play?src=file&id=1',
    'cleanmusic://play?src=youtube&id=../../x',
    'cleanmusic://play?src=youtube&id=short',
    'cleanmusic://play?src=youtube',
    'cleanmusic://play?src=search',
    'file:///C:/Windows/System32/calc.exe'
  ];
  rejected.forEach((link) => assert.equal(CMX.isAllowedLink(link), false, link));
});

/* --- Text cleanup -------------------------------------------------------- */

test('titles lose YouTube noise', () => {
  assert.equal(
    CMX.cleanTitle('Rick Astley - Never Gonna Give You Up (Official Music Video)'),
    'Rick Astley - Never Gonna Give You Up'
  );
  assert.equal(CMX.cleanTitle('Song Name (Official Video) - YouTube'), 'Song Name');
  assert.equal(CMX.cleanTitle('(3) Song Name - YouTube Music'), 'Song Name');
  assert.equal(CMX.cleanTitle('Song Name #shorts'), 'Song Name');
  assert.equal(CMX.cleanTitle('  A   B  '), 'A B');
});

test('artists lose Topic / VEVO / byline suffixes', () => {
  assert.equal(CMX.cleanArtist('Rick Astley - Topic'), 'Rick Astley');
  assert.equal(CMX.cleanArtist('RickAstleyVEVO'), 'RickAstley');
  assert.equal(CMX.cleanArtist('Daft Punk • Discovery • 2001'), 'Daft Punk');
});

test('"Artist - Song" titles are split when the channel is not the artist', () => {
  const split = CMX.splitArtistTitle('Daft Punk - One More Time', 'Random Uploads');
  assert.equal(split.artist, 'Daft Punk');
  assert.equal(split.title, 'One More Time');

  const kept = CMX.splitArtistTitle('One More Time', 'Daft Punk');
  assert.equal(kept.artist, 'Daft Punk');
  assert.equal(kept.title, 'One More Time');

  const prefixed = CMX.splitArtistTitle('Daft Punk - One More Time', 'Daft Punk');
  assert.equal(prefixed.title, 'One More Time');
  assert.equal(prefixed.artist, 'Daft Punk');

  // A real artist name in the channel must not split "Song - Live".
  const live = CMX.splitArtistTitle('One More Time - Live at Wembley', 'Daft Punk');
  assert.equal(live.title, 'One More Time - Live at Wembley');
  assert.equal(live.artist, 'Daft Punk');
});

test('cleanVideo only accepts real video ids', () => {
  assert.equal(CMX.cleanVideo(null), null);
  assert.equal(CMX.cleanVideo({ id: 'nope' }), null);
  const video = CMX.cleanVideo({ id: 'dQw4w9WgXcQ', title: 'T', artist: 'A', playlist: 1 });
  assert.equal(video.playlist, true);
  assert.equal(video.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

/* --- Settings ------------------------------------------------------------ */

test('settings fall back to defaults and reject junk', () => {
  const defaults = CMX.settingsWithDefaults(null);
  assert.equal(defaults.playerButton, true);
  assert.equal(defaults.floatButton, true);

  const merged = CMX.settingsWithDefaults({ playerButton: false, badge: 'yes', unknown: true });
  assert.equal(merged.playerButton, false);
  assert.equal(merged.badge, true);
  assert.equal('unknown' in merged, false);
});

/* --- Manifest and package ------------------------------------------------ */

test('manifest is MV3 with the minimum needed permissions', () => {
  assert.equal(MANIFEST.manifest_version, 3);
  assert.deepEqual(MANIFEST.permissions.slice().sort(), ['contextMenus', 'storage']);
  assert.equal('activeTab' in MANIFEST, false);
  assert.equal('scripting' in MANIFEST, false);
  assert.deepEqual(MANIFEST.host_permissions.slice().sort(), [
    'https://m.youtube.com/*',
    'https://music.youtube.com/*',
    'https://www.youtube.com/*'
  ]);
  assert.ok(MANIFEST.content_security_policy.extension_pages.includes("script-src 'self'"));
});

test('manifest references existing files', () => {
  const referenced = [
    MANIFEST.background.service_worker,
    MANIFEST.action.default_popup,
    MANIFEST.options_ui.page,
    ...Object.values(MANIFEST.icons),
    ...Object.values(MANIFEST.action.default_icon),
    ...MANIFEST.content_scripts[0].js,
    ...MANIFEST.content_scripts[0].css
  ];
  referenced.forEach((file) => assert.ok(exists(file), `missing: ${file}`));
  assert.ok(MANIFEST.version.split('.').length === 3);
});

test('every page uses local scripts only', () => {
  const pages = fs.readdirSync(ROOT).filter((file) => file.endsWith('.html'));
  assert.ok(pages.length >= 4, 'expected the extension pages');
  pages.forEach((page) => {
    const html = read(page);
    assert.ok(!/<script[^>]+src=["']https?:/i.test(html), `${page}: remote script`);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${page}: inline script`);
    const refs = Array.from(html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)).map((m) => m[1]);
    refs
      .filter((ref) => !/^https?:/i.test(ref) && !/^(mailto|chrome|javascript):/i.test(ref))
      .forEach((ref) => {
        const target = ref.split('?')[0];
        assert.ok(exists(target), `${page}: missing ${target}`);
      });
  });
});

test('no evaluate, no remote fetch, no inline handlers', () => {
  const scripts = fs.readdirSync(ROOT).filter((file) => file.endsWith('.js'));
  scripts.forEach((file) => {
    const source = read(file);
    assert.ok(!/\beval\s*\(/.test(source), `${file}: eval`);
    assert.ok(!/new Function\s*\(/.test(source), `${file}: new Function`);
    assert.ok(!/fetch\s*\(/.test(source), `${file}: fetch`);
    assert.ok(!/XMLHttpRequest/.test(source), `${file}: XHR`);
    assert.ok(!/document\.write\s*\(/.test(source), `${file}: document.write`);
  });
  fs.readdirSync(ROOT)
    .filter((file) => file.endsWith('.html'))
    .forEach((page) => {
      assert.ok(!/\son[a-z]+\s*=/i.test(read(page)), `${page}: inline event handler`);
    });
});

test('the only remote origin referenced is the thumbnail CDN', () => {
  const html = fs.readdirSync(ROOT).filter((file) => file.endsWith('.html'))
    .map((file) => read(file)).join('\n');
  const remote = Array.from(html.matchAll(/https?:\/\/[a-z0-9.-]+/gi)).map((m) => m[0].toLowerCase());
  remote.forEach((url) => {
    assert.ok(
      /^https:\/\/(i\.ytimg\.com|github\.com|bellocccyt\.github\.io)$/.test(url),
      `unexpected remote origin: ${url}`
    );
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
