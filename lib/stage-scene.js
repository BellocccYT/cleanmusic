'use strict';

/**
 * Motion-Songtexte: Figuren/Requisiten aus einem Plugin (2.3, Plugin-API v3).
 *
 * The main process sanitises every scene a plugin hands over before the
 * renderer sees it. Pure CommonJS, no Electron – tested in
 * test/stage-scene.test.js.
 *
 * A scene is deliberately small:
 *
 *   {
 *     game: 'Undertale',
 *     label: true,                 // show the character names
 *     accent: '#ffd23f',
 *     size: 1,                     // 0.5 – 1.4
 *     characters: [
 *       { src: 'file:///…/sans.png', name: 'Sans', anchor: 'left', motion: 'bounce', scale: 1 },
 *     ],
 *   }
 *
 * Image sources: https://, file:// (checked by main.js) or a small
 * data:image/…;base64 URL. No HTML, no scripts, no remote CSS.
 */

const ANCHORS = ['left', 'right', 'center'];
const MOTIONS = ['bounce', 'sway', 'pulse', 'float', 'stomp'];
const MAX_CHARACTERS = 6;
const MAX_DATA_URL = 1.5 * 1024 * 1024;
const MAX_DATA_TOTAL = 8 * 1024 * 1024;
const DATA_IMAGE = /^data:image\/(?:png|webp|gif|apng|avif|jpeg|svg\+xml);base64,[a-z0-9+/=\s]+$/i;
const REMOTE_IMAGE = /^https:\/\/[^\s"'<>]+$/i;
const LOCAL_IMAGE = /^file:\/\/[^\s"'<>]+$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function text(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function cleanSource(raw) {
  const src = String(raw == null ? '' : raw).trim();
  if (!src || src.length > MAX_DATA_TOTAL) return '';
  if (/[\u0000-\u001f\u007f]/.test(src)) return '';
  if (DATA_IMAGE.test(src)) return src.length <= MAX_DATA_URL ? src : '';
  if (REMOTE_IMAGE.test(src) || LOCAL_IMAGE.test(src)) return src;
  return '';
}

function cleanCharacter(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const src = cleanSource(raw.src);
  if (!src) return null;
  return {
    src,
    name: text(raw.name, 40),
    anchor: ANCHORS.includes(raw.anchor) ? raw.anchor : index % 2 ? 'right' : 'left',
    motion: MOTIONS.includes(raw.motion) ? raw.motion : MOTIONS[index % MOTIONS.length],
    scale: clamp(raw.scale, 0.4, 1.4, 1),
  };
}

/** Returns a safe scene or null. Never throws, never keeps unknown fields. */
function cleanScene(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const characters = (Array.isArray(raw.characters) ? raw.characters : [])
    .slice(0, MAX_CHARACTERS)
    .map(cleanCharacter)
    .filter(Boolean);
  if (!characters.length) return null;
  const total = characters.reduce((sum, character) => sum + character.src.length, 0);
  if (total > MAX_DATA_TOTAL) return null;
  return {
    game: text(raw.game, 80),
    label: raw.label === true,
    accent: HEX_COLOR.test(String(raw.accent || '')) ? String(raw.accent).toLowerCase() : '',
    size: clamp(raw.size, 0.5, 1.4, 1),
    characters,
  };
}

/** Stable identity for redraw decisions (renderer + main). */
function sceneKey(scene) {
  if (!scene || !Array.isArray(scene.characters) || !scene.characters.length) return '';
  let hash = 2166136261;
  const value = [
    scene.game,
    scene.label ? '1' : '0',
    scene.accent,
    scene.size,
    scene.characters
      .map((character) => [character.src, character.name, character.anchor, character.motion, character.scale].join('|'))
      .join('~'),
  ].join('~');
  for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return String(hash >>> 0);
}

module.exports = {
  ANCHORS,
  MOTIONS,
  MAX_CHARACTERS,
  MAX_DATA_URL,
  MAX_DATA_TOTAL,
  cleanScene,
  sceneKey,
};
