'use strict';

/**
 * Plugin-API v3: manifest and permissions (2.0, Phase 5).
 *
 * A v3 plugin starts with a manifest comment that CleanMusic reads WITHOUT
 * running the plugin, so the user sees what it wants before activating it:
 *
 *   /* cleanmusic-plugin
 *   {
 *     "apiVersion": 3,
 *     "name": "OBS-Audio-Visualizer",
 *     "version": "1.2.0",
 *     "description": "…",
 *     "permissions": ["player", "visualizer", "server:local", "clipboard"]
 *   }
 *   *\/
 *
 * Permissions are enforced on the CleanMusic plugin context (ctx.player,
 * ctx.fetch, ctx.copyText, …). Plugins are still Node code with the user's
 * rights, so the dialog keeps saying: only activate trusted plugins.
 * Plugins without a manifest (API v1/v2) keep working unchanged.
 *
 * Pure CommonJS, no Electron – tested in test/plugin-manifest.test.js.
 */

const HEAD_BYTES = 8192;
const MARKER = /\/\*\s*cleanmusic-plugin\s*([\s\S]*?)\*\//;
const HOST = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/;
const MAX_PERMISSIONS = 20;

const PERMISSIONS = [
  { id: 'player', label: 'Wiedergabe lesen und steuern', detail: 'Laufender Titel, Play/Pause, Weiter, Lautstärke und Songwünsche.', risk: 'medium' },
  { id: 'visualizer', label: 'Live-Spektrum lesen', detail: 'Die Frequenzbalken der laufenden Musik (z. B. für ein OBS-Overlay).', risk: 'low' },
  { id: 'source', label: 'Musik-Quelle', detail: 'Sucht und liefert Titel, die CleanMusic abspielt.', risk: 'medium' },
  { id: 'downloads:cc-only', label: 'Downloads nur mit Creative-Commons-Lizenz', detail: 'Speichert Titel, für die das Plugin eine CC-Lizenz bestätigt – mit Credit.', risk: 'high' },
  { id: 'network', label: 'Internet-Zugriff (beliebige Adressen)', detail: 'Darf über CleanMusic jede Adresse im Internet abrufen.', risk: 'high' },
  { id: 'server:local', label: 'Lokaler Server', detail: 'Öffnet einen Port auf diesem PC, z. B. für OBS-Browserquellen oder Streamer.bot.', risk: 'medium' },
  { id: 'fs:folder', label: 'Dateien in gewählten Ordnern', detail: 'Darf Dateien auswählen und Ordner öffnen, die du freigibst.', risk: 'medium' },
  { id: 'clipboard', label: 'In die Zwischenablage schreiben', detail: 'Z. B. eine Overlay-Adresse zum Einfügen in OBS.', risk: 'low' },
  { id: 'external-links', label: 'Links im Browser öffnen', detail: 'Öffnet Webseiten in deinem Standardbrowser.', risk: 'low' },
  { id: 'ui:settings', label: 'Eigene Einstellungen', detail: 'Zeigt Einstellungsfelder unter „Plugins“.', risk: 'low' },
];

const RISK_ORDER = { high: 0, medium: 1, low: 2 };

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/** Known permission ids plus "network:<host>" entries; unknown ones are dropped. */
function normalizePermissions(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const value = String(raw == null ? '' : raw).trim().toLowerCase();
    if (PERMISSIONS.some((permission) => permission.id === value)) {
      if (!out.includes(value)) out.push(value);
      return;
    }
    const match = /^network:(.+)$/.exec(value);
    if (match && HOST.test(match[1]) && !out.includes(value)) out.push(value);
  });
  return out.slice(0, MAX_PERMISSIONS);
}

/** Read the manifest from the head of a plugin file (text). Never runs code. */
function parseManifest(text) {
  const head = String(text == null ? '' : text).slice(0, HEAD_BYTES);
  const match = MARKER.exec(head);
  if (!match) return { manifest: null, error: null };
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return { manifest: null, error: 'Manifest ist kein gültiges JSON.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { manifest: null, error: 'Manifest ist kein Objekt.' };
  }
  if (Number(data.apiVersion) !== 3) {
    return { manifest: null, error: 'Manifest braucht "apiVersion": 3.' };
  }
  return {
    manifest: {
      apiVersion: 3,
      name: clean(data.name, 80),
      version: clean(data.version, 30),
      description: clean(data.description, 600),
      permissions: normalizePermissions(data.permissions),
    },
    error: null,
  };
}

/** Human-readable list, most risky first. */
function describe(permissions) {
  return normalizePermissions(permissions)
    .map((id) => {
      const known = PERMISSIONS.find((permission) => permission.id === id);
      if (known) return Object.assign({}, known);
      const host = id.slice('network:'.length);
      return { id, label: `Internet: ${host}`, detail: `Darf über CleanMusic Adressen bei ${host} abrufen.`, risk: 'medium' };
    })
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
}

/**
 * May a plugin use a permission? Without a manifest (API v1/v2) everything
 * stays allowed as before – compatibility first.
 */
function allows(manifest, permission) {
  if (!manifest) return true;
  return normalizePermissions(manifest.permissions).includes(String(permission));
}

/** May ctx.fetch reach this URL? "network" = all, "network:host" = that host and its subdomains. */
function allowsUrl(manifest, url) {
  if (!manifest) return true;
  let host = '';
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  const list = normalizePermissions(manifest.permissions);
  if (list.includes('network')) return true;
  return list.some((entry) => {
    if (!entry.startsWith('network:')) return false;
    const allowed = entry.slice('network:'.length);
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

module.exports = {
  HEAD_BYTES,
  PERMISSIONS,
  normalizePermissions,
  parseManifest,
  describe,
  allows,
  allowsUrl,
};
