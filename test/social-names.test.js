'use strict';

/**
 * Unit tests for lib/social-names.js – random names, tags and the name filter.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const N = require('../lib/social-names');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('random names: adjective + noun + number, German endings, no code numbers', () => {
  let seed = 7;
  const rng = (max) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % max;
  };
  for (let index = 0; index < 500; index += 1) {
    const name = N.randomName(rng);
    const match = /^(\S+) (\S+) (\d{1,2})$/.exec(name);
    assert.ok(match, name);
    assert.ok(!N.SKIP_NUMBERS.includes(Number(match[3])), name);
    const gender = new Map(N.NOUNS).get(match[2]);
    assert.ok(gender, `Nomen fehlt: ${name}`);
    assert.ok(match[1].endsWith({ m: 'er', f: 'e', n: 'es' }[gender]), name);
  }
  assert.equal(N.randomName(() => 0).split(' ').length, 3);
  assert.ok(N.combinations() > 3000000, `nur ${N.combinations()} Kombinationen`);
  assert.equal(new Set(N.ADJECTIVES).size, N.ADJECTIVES.length, 'doppelte Adjektive');
  assert.equal(new Set(N.NOUNS.map(([word]) => word)).size, N.NOUNS.length, 'doppelte Nomen');
});

check('every adjective × noun combination passes the blocklist', () => {
  const endings = { m: 'er', f: 'e', n: 'es' };
  const bad = [];
  for (const adjective of N.ADJECTIVES) {
    for (const [noun, gender] of N.NOUNS) {
      const name = `${adjective[0].toUpperCase()}${adjective.slice(1)}${endings[gender]} ${noun} 42`;
      if (N.blockedReason(name)) bad.push(name);
    }
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

check('account id and tag come from the key digest', () => {
  const digest = crypto.createHash('sha256').update('schlüssel').digest();
  const id = N.accountIdFromDigest(digest);
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{24}$/);
  assert.equal(N.accountIdFromDigest(new Uint8Array(digest)), id);
  assert.ok(N.validId(id));
  assert.equal(N.tagOf(id), id.slice(0, 4));
  assert.equal(N.display('Leiser Komet 42', id), `Leiser Komet 42 · ${id.slice(0, 4)}`);
  assert.equal(N.tagOf('kaputt'), '????');
  assert.equal(N.accountIdFromDigest(new Uint8Array(32)), '000000000000000000000000');
});

check('good names pass and are cleaned (NFKC, spaces)', () => {
  for (const name of ['Rob', 'DJ Nachtfalter', 'Lena_99', 'Zoë-B.', 'Ｍａｘ', 'Jürgen', 'Badminton Fan', 'Ignazio', 'Μαρία', 'Анна', '山田 太郎']) {
    const result = N.checkName(name);
    assert.ok(result.ok, `${name}: ${result.reason}`);
  }
  assert.equal(N.checkName('  Max   Power ').name, 'Max Power');
  assert.equal(N.checkName('Ｍａｘ').name, 'Max');
});

check('length, characters, URLs, emojis and invisible characters are refused', () => {
  const refuse = (name, pattern) => {
    const result = N.checkName(name);
    assert.equal(result.ok, false, name);
    if (pattern) assert.match(result.reason, pattern, name);
  };
  refuse('ab', /Mindestens 3/);
  refuse('x'.repeat(21), /Höchstens 20/);
  refuse('Rob 🎧', /Emoji/);
  refuse('Rob​ert', /Unsichtbare/);
  refuse('Rob‮ert', /Unsichtbare/);
  refuse('<b>Rob</b>', /Erlaubt sind/);
  refuse('www Rob', /Links/);
  refuse('rob.example', /Links/);
  refuse('Rob https', /Links/);
  refuse('123', /zwei Buchstaben/);
  refuse('Pаypal', /Schriften/); // Cyrillic а inside a Latin name
  refuse('é́́ Rob', /übereinander/);
});

check('blocklist: insults, sexual words, roles – also with accents, leetspeak and spacing', () => {
  for (const name of [
    'Fuck You', 'F.U.C.K', 'fuuuuck', 'Arschloch', 'Ar$chl0ch', 'Hurensohn', 'Wichser', 'P0rn Star', 'Fotze',
    'Admin', 'TheAdmin', 'Cleanmusic Team', 'Clean Music', 'Moderator', 'Offiziell', 'Support', 'Mod', 'Sexy Max',
    'Arsch', 'Möse', 'Nïgger', 'n1gga', 'Kinderficker', 'SYSTEM',
  ]) {
    assert.equal(N.checkName(name).ok, false, `${name} sollte gesperrt sein`);
  }
});

check('blocklist: NS codes and symbols', () => {
  for (const name of ['Max 88', 'Lena1488', 'Tom 14 88', 'HH Kevin', 'H.H.', 'SS Klaus', 'Hitler', 'H1tler', 'N4zi', 'Combat 18', 'C18 Crew', 'Sieg Heil', 'Zyklon B', 'White Power', 'Arier']) {
    assert.equal(N.checkName(name).ok, false, `${name} sollte gesperrt sein`);
  }
  for (const name of ['Jahrgang 1988', 'Max 188', 'Hans Hubert', 'Hamburg', 'Klasse', 'Analog Synth', 'Passat', 'Dickens', 'Barsch', 'Moses', 'Sussex', 'Mongolei']) {
    assert.ok(N.checkName(name).ok, `${name} sollte erlaubt sein: ${N.checkName(name).reason}`);
  }
});

console.log(`\n${checks} passed, 0 failed`);
