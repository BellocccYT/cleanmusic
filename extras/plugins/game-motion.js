/* cleanmusic-plugin
{
  "apiVersion": 3,
  "name": "Game Motion",
  "version": "1.0.0",
  "description": "Erkennt das Spiel zum laufenden Titel und setzt eigene Charakterbilder hinter die Motion-Songtexte – im Takt der Musik.",
  "permissions": ["player", "stage", "fs:folder", "ui:settings", "ui:panel"]
}
*/
'use strict';

/**
 * Game Motion – private figures for the motion lyrics.
 *
 * The plugin does NOT ship or download game art. It only reads image files
 * from a folder you pick. Put one sub-folder per game there:
 *
 *   <Charakter-Ordner>/Undertale/sans.png
 *   <Charakter-Ordner>/Undertale/papyrus.webp
 *   <Charakter-Ordner>/hollow-knight/knight.png
 *
 * The game is matched from title/artist/album against games.json (written to
 * the plugin data folder on first start), or from a folder whose name appears
 * in the album. "Spiel erzwingen" overrides the detection.
 *
 * Only for private use. The rights to characters and images stay with their
 * owners – do not stream or publish them without permission.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const IMAGE_EXT = new Set(['.png', '.webp', '.gif', '.apng', '.avif', '.jpg', '.jpeg', '.svg']);
const MOTIONS = ['bounce', 'sway', 'pulse', 'float', 'stomp'];
const SIZE_SCALE = { s: 0.82, m: 1, l: 1.18 };
const MIN_SCORE = 6;

const STARTER_RULES = {
  hinweis:
    'Trage hier Spiele und ihre Stichwörter ein. Ordner = Unterordner im Charakter-Ordner. ' +
    'Die Bilder selbst liegen NICHT im Plugin, sondern in deinem eigenen Ordner. Nur privat verwenden.',
  games: [
    { id: 'undertale', name: 'Undertale', accent: '#ffd23f', artists: ['toby fox'], tracks: ['megalovania', 'bonetrousle', 'spider dance', 'his theme', 'hopes and dreams'] },
    { id: 'deltarune', name: 'Deltarune', accent: '#ff5fa2', artists: ['toby fox'], tracks: ['big shot', 'chaos king', 'pandora palace', 'attack of the killer queen'] },
    { id: 'minecraft', name: 'Minecraft', accent: '#6aa84f', artists: ['c418', 'lena raine', 'gareth coker'], tracks: ['sweden', 'wet hands', 'subwoofer lullaby', 'pigstep', 'others'] },
    { id: 'doom', name: 'DOOM', accent: '#c8321e', artists: ['mick gordon'], tracks: ['bfg division', 'the only thing they fear is you', 'rip & tear', 'at dooms gate'] },
    { id: 'witcher', name: 'The Witcher 3', accent: '#c9a227', artists: ['marcin przybyłowicz', 'percival'], tracks: ['toss a coin to your witcher', 'the trail', 'silver for monsters'] },
    { id: 'cyberpunk', name: 'Cyberpunk 2077', accent: '#fcee0a', artists: ['marcin przybyłowicz'], tracks: ['the rebel path', 'never fade away', 'chippin in', 'outsider no more'] },
    { id: 'hollow-knight', name: 'Hollow Knight', accent: '#8fd6ff', artists: ['christopher larkin'], tracks: ['sealed vessel', 'city of tears', 'greenpath', 'dirtmouth', 'hornet'] },
    { id: 'celeste', name: 'Celeste', accent: '#ff6b9d', artists: ['lena raine'], tracks: ['first steps', 'resurrections', 'reach for the summit', 'confronting myself'] },
    { id: 'skyrim', name: 'Skyrim', accent: '#9fb7c9', artists: ['jeremy soule'], tracks: ['dragonborn', 'secunda', 'the song of the dragonborn', 'awake'] },
    { id: 'zelda', name: 'The Legend of Zelda', accent: '#e0b84c', artists: ['koji kondo'], tracks: ['song of storms', 'gerudo valley', 'hyrule field', 'ballad of the goddess'] },
    { id: 'mario', name: 'Super Mario', accent: '#e52521', artists: ['koji kondo'], tracks: ['athletic theme', 'dire dire docks', 'gusty garden galaxy', 'jump up super star'] },
    { id: 'sonic', name: 'Sonic', accent: '#2f7de1', tracks: ['green hill zone', 'live and learn', 'escape from the city', 'his world'] },
    { id: 'halo', name: 'Halo', accent: '#6fbf73', artists: ["martin o'donnell"], tracks: ['mjolnir mix', 'never forget', 'finish the fight'] },
    { id: 'last-of-us', name: 'The Last of Us', accent: '#9a8f7a', artists: ['gustavo santaolalla'], tracks: ['the last of us', 'all gone', 'the choice'] },
    { id: 'red-dead', name: 'Red Dead Redemption', accent: '#b4472f', artists: ['woody jackson'], tracks: ["deadman's gun", "that's the way it is", 'unshaken', 'cruel cruel world'] },
    { id: 'elden-ring', name: 'Elden Ring', accent: '#d8b45a', artists: ['yuka kitamura'], tracks: ['elden ring', 'godskin apostles', 'radagon', 'the final battle'] },
    { id: 'dark-souls', name: 'Dark Souls', accent: '#b08a54', artists: ['yuka kitamura'], tracks: ['soul of cinder', 'gael', 'nameless song', 'plin plin plon'] },
    { id: 'stardew', name: 'Stardew Valley', accent: '#7cc36b', artists: ['concernedape'], tracks: ['spring', 'dance of the moonlight jellies', 'the valley comes alive'] },
    { id: 'league', name: 'League of Legends', accent: '#0bc6e3', artists: ['riot games', '2wei', 'against the current', 'mako'], tracks: ['legends never die', 'warriors', 'phoenix', 'rise', 'awaken'] },
    { id: 'valorant', name: 'VALORANT', accent: '#ff4655', artists: ['riot games'], tracks: ['die for you', 'fire again'] },
    { id: 'overwatch', name: 'Overwatch', accent: '#f99e1a', tracks: ['heroes never die', 'the world could always use more heroes'] },
    { id: 'gta', name: 'Grand Theft Auto', accent: '#79c34a', tracks: ['welcome to los santos', 'the setup'] },
  ],
};

const LIESMICH = `Game Motion – nur für den privaten Gebrauch
==========================================

1. Charakter-Ordner anlegen, z. B.:
   C:\\Users\\Du\\Bilder\\GameMotion\\Undertale\\sans.png
   C:\\Users\\Du\\Bilder\\GameMotion\\Undertale\\papyrus.webp

   Der Ordnername ist der Spiel-Schlüssel (klein, mit Bindestrich):
   undertale, hollow-knight, doom, cyberpunk, ...

2. In den CleanMusic-Einstellungen unter "Plugins" den Ordner wählen.
   Höchstens 4 Figuren pro Titel, ein Bild pro Figur (PNG/WebP/GIF mit
   Transparenz funktioniert am besten).

3. Erkennung: Titel, Artist und Album werden mit games.json verglichen.
   Eigene Spiele einfach dort ergänzen. "Spiel erzwingen" überschreibt alles.

4. Die Bilder werden nur lokal gelesen und im Vollbild hinter den
   Motion-Songtexten angezeigt. Nichts wird hochgeladen oder mitgeliefert.

Rechte: Charaktere und Bilder gehören den jeweiligen Rechteinhabern.
Dieses Plugin liefert keine Spiel-Assets. Veröffentlichen oder Streamen
nur mit Erlaubnis.
`;

const state = {
  ctx: null,
  dataDir: '',
  rulesFile: '',
  rules: { games: [] },
  rulesError: '',
  rulesMtime: 0,
  settings: {},
  identity: '',
  lastCheck: 0,
  sceneKey: '',
  currentGame: '',
  currentCharacters: [],
  panelKey: '',
};

function text(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);
}

function escHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

function normalize(value) {
  return text(value, 300)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function phrase(haystack, needle) {
  const hay = normalize(haystack);
  const word = normalize(needle);
  if (!hay || !word) return false;
  return ` ${hay} `.includes(` ${word} `);
}

function slug(value) {
  return normalize(value).replace(/ +/g, '-').slice(0, 60);
}

function prettyName(value) {
  return text(String(value || '').replace(/[-_]+/g, ' '), 80).replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function hash32(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return hash >>> 0;
}

function seededShuffle(list, seed) {
  const out = list.slice();
  let value = seed >>> 0 || 1;
  for (let at = out.length - 1; at > 0; at -= 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const pick = value % (at + 1);
    [out[at], out[pick]] = [out[pick], out[at]];
  }
  return out;
}

function listOf(value) {
  return (Array.isArray(value) ? value : value == null ? [] : [value])
    .map((entry) => text(entry, 120))
    .filter(Boolean)
    .slice(0, 40);
}

function parseRules(input) {
  const raw = Array.isArray(input) ? input : input && Array.isArray(input.games) ? input.games : [];
  const games = [];
  for (const entry of raw.slice(0, 500)) {
    if (!entry || typeof entry !== 'object') continue;
    const name = text(entry.name || entry.id, 80);
    if (!name) continue;
    const characters = (Array.isArray(entry.characters) ? entry.characters : [])
      .slice(0, 12)
      .map((character) => {
        if (typeof character === 'string') return { file: text(character, 200) };
        if (!character || typeof character !== 'object') return null;
        return {
          file: text(character.file || character.src, 200),
          name: text(character.name, 40),
          anchor: ['left', 'right', 'center'].includes(character.anchor) ? character.anchor : '',
          motion: MOTIONS.includes(character.motion) ? character.motion : '',
        };
      })
      .filter((character) => character && character.file);
    games.push({
      id: text(entry.id || slug(name), 60),
      name,
      accent: /^#[0-9a-f]{6}$/i.test(String(entry.accent || '')) ? String(entry.accent) : '',
      folder: text(entry.folder, 80),
      keywords: listOf(entry.keywords),
      tracks: listOf(entry.tracks),
      artists: listOf(entry.artists),
      albums: listOf(entry.albums),
      characters,
    });
  }
  return { games };
}

function ensureFiles() {
  try {
    fs.mkdirSync(state.dataDir, { recursive: true });
  } catch {
    /* the data folder is created by CleanMusic anyway */
  }
  if (!fs.existsSync(state.rulesFile)) {
    fs.writeFileSync(state.rulesFile, `${JSON.stringify(STARTER_RULES, null, 2)}\n`, 'utf8');
  }
  const readme = path.join(state.dataDir, 'LIESMICH.txt');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, LIESMICH, 'utf8');
}

function loadRules(force) {
  let mtime = 0;
  try {
    mtime = fs.statSync(state.rulesFile).mtimeMs;
  } catch {
    mtime = 0;
  }
  if (!force && mtime && mtime === state.rulesMtime) return state.rules;
  state.rulesMtime = mtime;
  if (!mtime) {
    state.rules = { games: [] };
    state.rulesError = 'games.json fehlt';
    return state.rules;
  }
  try {
    state.rules = parseRules(JSON.parse(fs.readFileSync(state.rulesFile, 'utf8')));
    state.rulesError = '';
  } catch (error) {
    state.rulesError = `games.json: ${text(error && error.message, 120)}`;
  }
  return state.rules;
}

function rootFolder(settings) {
  const raw = text(settings.folder, 500);
  if (!raw) return '';
  try {
    return fs.statSync(raw).isDirectory() ? path.resolve(raw) : '';
  } catch {
    return '';
  }
}

function listGameFolders(root) {
  if (!root) return [];
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !/^[._]/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 200);
  } catch {
    return [];
  }
}

function listImages(dir) {
  if (!dir) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !/^[._]/.test(entry.name) && IMAGE_EXT.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 200);
  } catch {
    return [];
  }
}

// null = not found, '' = the root itself is this game
function folderFor(root, wanted) {
  const slugWanted = slug(wanted);
  if (!root || !slugWanted) return null;
  if (slug(path.basename(root)) === slugWanted) return '';
  const folders = listGameFolders(root);
  const exact = folders.find((name) => name === wanted);
  if (exact) return exact;
  return folders.find((name) => slug(name) === slugWanted) || null;
}

function detectGame(track, rules, root, manual) {
  const title = normalize(track && track.title);
  const artist = normalize(track && track.artist);
  const album = normalize(track && track.album);

  if (manual) {
    const wanted = text(manual, 80);
    const rule = rules.games.find((entry) => slug(entry.id) === slug(wanted) || slug(entry.name) === slug(wanted));
    if (rule) {
      const found = folderFor(root, rule.folder || rule.id || rule.name);
      return Object.assign({}, rule, { folder: rule.folder || (found != null ? found : slug(rule.id || rule.name)) });
    }
    const folder = folderFor(root, wanted);
    return { id: slug(wanted), name: prettyName(wanted), accent: '', folder: folder != null ? folder : slug(wanted), auto: true };
  }

  let best = null;
  for (const rule of rules.games) {
    let score = 0;
    const name = normalize(rule.name);
    const id = normalize(rule.id);
    if (name && phrase(album, name)) score += 8;
    if (name && phrase(title, name)) score += 5;
    if (name && phrase(artist, name)) score += 3;
    if (id && id !== name && phrase(album, id)) score += 6;
    for (const keyword of rule.keywords) {
      if (phrase(album, keyword)) score += 6;
      else if (phrase(title, keyword)) score += 4;
      else if (phrase(artist, keyword)) score += 2;
    }
    for (const trackName of rule.tracks) {
      if (phrase(title, trackName)) score += 9;
      else if (phrase(album, trackName)) score += 3;
    }
    for (const artistName of rule.artists) {
      if (phrase(artist, artistName)) score += 7;
      else if (phrase(album, artistName)) score += 2;
    }
    for (const albumName of rule.albums) {
      if (phrase(album, albumName)) score += 9;
    }
    if (!best || score > best.score) best = { rule, score };
  }
  if (best && best.score >= MIN_SCORE) {
    const rule = best.rule;
    const found = folderFor(root, rule.id || rule.name);
    return Object.assign({}, rule, { folder: rule.folder || (found != null ? found : slug(rule.id || rule.name)) });
  }

  // No rule, but the album/title names a folder: "Hollow Knight (OST)" -> hollow-knight.
  let folderBest = null;
  for (const folder of listGameFolders(root)) {
    const name = normalize(folder);
    if (!name) continue;
    let score = 0;
    if (phrase(album, name)) score += 8;
    else if (phrase(title, name)) score += 5;
    else continue;
    if (!folderBest || score > folderBest.score) folderBest = { folder, score };
  }
  if (folderBest && folderBest.score >= MIN_SCORE) {
    return { id: slug(folderBest.folder), name: prettyName(folderBest.folder), accent: '', folder: folderBest.folder, auto: true };
  }

  // Folder points directly at one game (…/Undertale/*.png).
  const base = path.basename(root);
  if (base && (phrase(album, base) || phrase(title, base))) {
    return { id: slug(base), name: prettyName(base), accent: '', folder: '', auto: true };
  }
  return null;
}

function resolveFile(root, folder, file) {
  const candidates = [];
  if (path.isAbsolute(file)) candidates.push(file);
  else {
    if (folder) candidates.push(path.join(root, folder, file));
    candidates.push(path.join(root, file));
  }
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile() && IMAGE_EXT.has(path.extname(candidate).toLowerCase())) return candidate;
    } catch {
      /* try the next place */
    }
  }
  return '';
}

function pickCharacters(root, game, count, track, motion) {
  const folder = game.folder || '';
  const dir = folder ? path.join(root, folder) : root;
  const seed = hash32([track && track.id, track && track.title, track && track.artist, game.id].join('|'));
  const explicit = (game.characters || [])
    .map((character) => {
      const file = resolveFile(root, folder, character.file);
      return file ? { file, name: character.name || path.basename(file, path.extname(file)), anchor: character.anchor, motion: character.motion } : null;
    })
    .filter(Boolean);
  let chosen = explicit;
  if (!chosen.length) {
    chosen = listImages(dir)
      .map((name) => ({ file: path.join(dir, name), name: path.basename(name, path.extname(name)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    chosen = seededShuffle(chosen, seed);
  }
  return chosen.slice(0, Math.max(1, Math.min(4, count))).map((character, index) => ({
    file: character.file,
    name: character.name,
    anchor: character.anchor || (index % 2 ? 'right' : 'left'),
    motion:
      character.motion ||
      (MOTIONS.includes(motion) ? motion : MOTIONS[hash32(`${character.name}|${track && track.title}|${index}`) % MOTIONS.length]),
  }));
}

function sceneKey(scene) {
  if (!scene) return '';
  let hash = 2166136261;
  const value = [
    scene.game,
    scene.label ? '1' : '0',
    scene.accent,
    scene.size,
    scene.characters.map((character) => [character.src, character.name, character.anchor, character.motion].join('|')).join('~'),
  ].join('~');
  for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return String(hash >>> 0);
}

function buildScene(track, settings, rulesOverride) {
  if (!settings.enabled || !track) return { scene: null, reason: 'aus' };
  const root = rootFolder(settings);
  if (!root) return { scene: null, reason: 'folder' };
  const rules = rulesOverride || loadRules(false);
  const game = detectGame(track, rules, root, settings.manualGame);
  if (!game) return { scene: null, reason: 'unknown' };
  const characters = pickCharacters(root, game, Number(settings.count) || 2, track, settings.motion);
  if (!characters.length) return { scene: null, reason: 'images', game: game.name };
  const scene = {
    game: game.name || prettyName(game.folder),
    label: Boolean(settings.names),
    accent: game.accent || '',
    size: SIZE_SCALE[settings.size] || 1,
    characters: characters.map((character) => ({
      src: pathToFileURL(character.file).href,
      name: character.name,
      anchor: character.anchor,
      motion: character.motion,
      scale: 1,
    })),
  };
  return { scene, game: scene.game, reason: '' };
}

function refreshPanel() {
  const ctx = state.ctx;
  if (!ctx || !ctx.ui || typeof ctx.ui.panel !== 'function') return;
  const chars = state.currentCharacters || [];
  const key = `${state.currentGame}|${chars.map((character) => character.src).join('|')}|${state.settings.folder}|${state.settings.enabled}`;
  if (key === state.panelKey) return;
  state.panelKey = key;
  const thumbs = chars
    .slice(0, 4)
    .map(
      (character) =>
        `<img src="${escHtml(character.src)}" alt="" style="width:44px;height:44px;object-fit:contain;border-radius:8px;background:rgba(255,255,255,.08)" />`
    )
    .join('');
  const title = state.currentGame || 'Noch kein Spiel erkannt';
  const hint = !state.settings.folder
    ? 'Wähle oben einen Charakter-Ordner.'
    : chars.length
      ? 'Diese Figuren erscheinen im Vollbild hinter den Motion-Songtexten.'
      : 'Kein Treffer – Spiel in games.json ergänzen oder „Spiel erzwingen“ nutzen.';
  ctx.ui.panel({
    slot: 'settings',
    title: 'Game Motion',
    html: `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="display:flex;gap:6px">${thumbs || '<span style="opacity:.6">♪</span>'}</div>
      <div style="min-width:140px">
        <strong>${escHtml(title)}</strong>
        <div style="opacity:.72;font-size:12px">${escHtml(hint)}</div>
      </div>
    </div>`,
  });
}

function update(track, force) {
  const ctx = state.ctx;
  if (!ctx) return;
  const identity = track ? [track.id, track.title, track.artist, track.album].join('|') : '';
  const now = Date.now();
  if (!force && identity === state.identity && now - state.lastCheck < 1500) return;
  state.identity = identity;
  state.lastCheck = now;
  if (!track) {
    state.sceneKey = '';
    state.currentGame = '';
    state.currentCharacters = [];
    ctx.stage.clear();
    refreshPanel();
    return;
  }
  const result = buildScene(track, state.settings);
  const key = sceneKey(result.scene);
  if (!force && key === state.sceneKey) return;
  state.sceneKey = key;
  state.currentGame = result.scene ? result.scene.game : '';
  state.currentCharacters = result.scene ? result.scene.characters : [];
  if (result.scene) ctx.stage.set(result.scene);
  else ctx.stage.clear();
  refreshPanel();
}

module.exports = {
  apiVersion: 3,
  name: 'Game Motion',
  version: '1.0.0',
  description: 'Figuren aus deinem eigenen Ordner hinter den Motion-Songtexten, im Takt der Musik.',
  help:
    'Charakter-Ordner mit einem Unterordner pro Spiel wählen (z. B. Undertale/sans.png). ' +
    'Die Erkennung steht in games.json im Plugin-Datenordner; „Spiel erzwingen“ überschreibt sie.',
  notice:
    'Nur für den privaten Gebrauch. Das Plugin enthält keine Spiel-Assets; die Rechte an Charakteren und Bildern liegen bei den Rechteinhabern.',

  settings: [
    { id: 'enabled', type: 'toggle', label: 'Figuren in den Songtexten', default: true, help: 'Aus = keine Einblendung, die Songtexte bleiben unverändert.' },
    {
      id: 'folder',
      type: 'folder',
      label: 'Charakter-Ordner',
      default: '',
      help: 'Aufbau: <Ordner>/<Spiel>/<Bild>.png – z. B. Undertale/sans.png. PNG oder WebP mit Transparenz wirkt am besten.',
    },
    { id: 'manualGame', type: 'text', label: 'Spiel erzwingen', default: '', placeholder: 'z. B. undertale', help: 'Leer = automatisch aus Titel, Artist und Album erkennen.' },
    { id: 'count', type: 'number', label: 'Figuren pro Titel', default: 2, min: 1, max: 4 },
    {
      id: 'motion',
      type: 'select',
      label: 'Bewegung',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Automatisch' },
        { value: 'bounce', label: 'Hüpfen' },
        { value: 'sway', label: 'Schwingen' },
        { value: 'pulse', label: 'Pulsieren' },
        { value: 'float', label: 'Schweben' },
        { value: 'stomp', label: 'Stampfen' },
      ],
    },
    {
      id: 'size',
      type: 'select',
      label: 'Größe',
      default: 'm',
      options: [
        { value: 's', label: 'Klein' },
        { value: 'm', label: 'Mittel' },
        { value: 'l', label: 'Groß' },
      ],
    },
    { id: 'names', type: 'toggle', label: 'Namen einblenden', default: false },
  ],

  actions: [
    { id: 'rules', label: 'Spiel-Regeln öffnen', when: 'rules' },
    { id: 'folder', label: 'Charakter-Ordner öffnen', when: 'folderSet' },
    { id: 'reload', label: 'Neu erkennen', when: null },
  ],

  async setup(ctx) {
    state.ctx = ctx;
    state.dataDir = ctx.dataDir;
    state.rulesFile = path.join(ctx.dataDir, 'games.json');
    state.settings = ctx.settings.get();
    ensureFiles();
    loadRules(true);
    try {
      update(ctx.player.state().track, true);
    } catch {
      /* no track yet */
    }
    refreshPanel();
  },

  dispose() {
    try {
      if (state.ctx && state.ctx.stage) state.ctx.stage.clear();
    } catch {
      /* the plugin is going away anyway */
    }
    state.ctx = null;
    state.sceneKey = '';
    state.identity = '';
  },

  async onSettings(values) {
    state.settings = values || {};
    state.sceneKey = '';
    state.identity = '';
    state.panelKey = '';
    loadRules(true);
    update(state.ctx && state.ctx.player ? state.ctx.player.state().track : null, true);
  },

  onEvent(type, player) {
    if (type !== 'nowplaying' && type !== 'state') return;
    update(player && player.track, false);
  },

  async status() {
    const folderSet = Boolean(rootFolder(state.settings));
    const characters = state.currentCharacters.length;
    return {
      ready: Boolean(state.currentGame),
      text: state.currentGame
        ? `${state.currentGame} · ${characters} ${characters === 1 ? 'Figur' : 'Figuren'}`
        : folderSet
          ? state.rulesError || 'Kein Spiel erkannt'
          : 'Charakter-Ordner wählen',
      detail: `${(state.rules.games || []).length} Spiel-Regeln · ${folderSet ? 'Ordner verbunden' : 'kein Ordner'}`,
      flags: { rules: true, folderSet, scene: Boolean(state.currentGame) },
    };
  },

  async runAction(actionId) {
    const ctx = state.ctx;
    if (!ctx) return { message: 'Plugin ist nicht geladen.' };
    if (actionId === 'rules') {
      await ctx.openPath(state.dataDir);
      return { message: 'games.json liegt im geöffneten Ordner.' };
    }
    if (actionId === 'folder') {
      const root = rootFolder(state.settings);
      if (!root) return { message: 'Noch kein Charakter-Ordner gewählt.' };
      await ctx.openPath(root);
      return { message: 'Charakter-Ordner geöffnet.' };
    }
    if (actionId === 'reload') {
      state.identity = '';
      state.sceneKey = '';
      state.rulesMtime = 0;
      loadRules(true);
      update(ctx.player.state().track, true);
      return { message: state.currentGame ? `${state.currentGame} erkannt.` : 'Kein Spiel erkannt.' };
    }
    return { message: 'Unbekannte Aktion.' };
  },

  // Pure helpers for test/game-motion.test.js – never called by CleanMusic.
  __test: {
    normalize,
    phrase,
    slug,
    prettyName,
    parseRules,
    detectGame,
    pickCharacters,
    buildScene,
    seededShuffle,
  },
};
