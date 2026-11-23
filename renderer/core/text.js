'use strict';

/**
 * Pure text, time and list helpers.
 *
 * Loaded before app.js and exposed as window.CMText. Nothing in here touches
 * the DOM, localStorage or the player, so it can be tested with plain Node.
 */
(function () {
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  }

  function fmtTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function fmtLong(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    return `${hours} Std. ${minutes % 60} Min.`;
  }

  function fmtSize(bytes) {
    if (!bytes) return '–';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function formatList(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normKey(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\b(feat|ft|featuring)\b.*$/g, '')
      .replace(/[^a-z0-9äöüß]+/g, ' ')
      .trim();
  }

  function matchKey(entry) {
    const artist = normKey(entry.artist);
    const title = normKey(entry.title);
    if (artist && title) return `${artist}|${title}`;
    // normKey() only keeps Latin letters, so Japanese/Cyrillic/Greek titles
    // would otherwise all share the key "|". Fall back to the raw text (and
    // finally to the id) so dedupe and taste feedback stay per title.
    const rawArtist = String(entry.artist || '').trim().toLowerCase();
    const rawTitle = String(entry.title || '').trim().toLowerCase();
    if (rawArtist || rawTitle) return `${artist || rawArtist}|${title || rawTitle}`;
    return `id:${entry.id}`;
  }

  function shuffled(list) {
    const copy = list.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  function primaryArtist(value) {
    return String(value || '')
      .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bfeaturing\b|\bx\b|\bvs\.?|\/|\bund\b|\band\b)\s*/i)[0]
      .trim();
  }

  function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  function stringSeed(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededShuffle(list, seed) {
    const copy = list.slice();
    let value = (seed >>> 0) || 1;
    const next = () => {
      value ^= value << 13;
      value >>>= 0;
      value ^= value >>> 17;
      value ^= value << 5;
      value >>>= 0;
      return value / 4294967296;
    };
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(next() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  window.CMText = {
    esc,
    fmtTime,
    fmtLong,
    fmtSize,
    formatList,
    uid,
    normKey,
    matchKey,
    shuffled,
    primaryArtist,
    todayKey,
    stringSeed,
    seededShuffle,
  };
})();
