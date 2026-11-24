'use strict';

/**
 * Sharing without a server: songs and whole playlists as links.
 *
 * A playlist link carries a compact, compressed code in the URL #fragment
 * (https://bellocccyt.github.io/cleanmusic/p/#P1.…). The fragment never
 * reaches the web server; the page hands the code to CleanMusic via
 * cleanmusic://playlist?d=…, and CleanMusic finds the titles again
 * (Deezer/Apple by id, YouTube via plugin, otherwise by title + artist).
 * Local files cannot be shared and are skipped.
 *
 * Loaded before app.js as window.CMShare; tested in test/share.test.js.
 */
(function () {
  const PREFIX = 'P1.';
  const CODE_RE = /^P1\.[A-Za-z0-9_-]{8,12000}$/;
  const NAME_MAX = 80;
  const TEXT_MAX = 80;
  const TRACKS_MAX = 100;
  const SRC = { deezer: 'd', apple: 'a', youtube: 'y', search: 's' };
  const SRC_BACK = { d: 'deezer', a: 'apple', y: 'youtube', s: 'search' };

  function clean(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function validRef(ref) {
    if (!ref || !SRC[ref.src]) return false;
    if ((ref.src === 'deezer' || ref.src === 'apple') && !/^\d{1,20}$/.test(ref.id)) return false;
    if (ref.src === 'youtube' && !/^[A-Za-z0-9_-]{11}$/.test(ref.id)) return false;
    if (ref.src === 'search' && !ref.title) return false;
    return Boolean(ref.title || ref.id);
  }

  /**
   * How to find an entry again elsewhere: { src, id, title, artist } or null
   * (local files and radio cannot be shared). Same rules as the song links.
   */
  function refOf(entry) {
    if (!entry || entry.kind === 'local' || entry.kind === 'radio') return null;
    const id = String(entry.id || '');
    const title = clean(entry.title, TEXT_MAX);
    const artist = clean(entry.artist, TEXT_MAX);
    let ref;
    if (/^deezer:\d{1,20}$/.test(id)) ref = { src: 'deezer', id: id.slice(7), title, artist };
    else if (/^apple:\d{1,20}$/.test(id)) ref = { src: 'apple', id: id.slice(6), title, artist };
    else if (entry.kind === 'plugin' && /^[A-Za-z0-9_-]{11}$/.test(String(entry.refId || ''))) {
      ref = { src: 'youtube', id: String(entry.refId), title, artist };
    } else ref = { src: 'search', id: '', title, artist };
    return validRef(ref) ? ref : null;
  }

  function toBase64Url(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function pipe(bytes, stream) {
    const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await response.arrayBuffer());
  }

  /** Build the share code for a playlist. Returns { code, shared, skipped }. */
  async function encodePlaylist(name, entries) {
    const refs = [];
    let skipped = 0;
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const ref = refOf(entry);
      if (!ref) {
        skipped += 1;
        return;
      }
      if (refs.length < TRACKS_MAX) refs.push(ref);
      else skipped += 1;
    });
    if (!refs.length) return { code: '', shared: 0, skipped };
    const compact = {
      v: 1,
      n: clean(name, NAME_MAX) || 'Playlist',
      t: refs.map((ref) => [SRC[ref.src], ref.id, ref.title, ref.artist]),
    };
    const packed = await pipe(new TextEncoder().encode(JSON.stringify(compact)), new CompressionStream('deflate-raw'));
    return { code: PREFIX + toBase64Url(packed), shared: refs.length, skipped };
  }

  /** Read a code (also inside a longer text or link). Returns { name, tracks } or { error }. */
  async function decodePlaylist(text) {
    const match = /P1\.[A-Za-z0-9_-]{8,12000}/.exec(String(text || ''));
    if (!match || !CODE_RE.test(match[0])) return { error: 'Kein CleanMusic-Playlist-Code gefunden.' };
    let data;
    try {
      const bytes = await pipe(fromBase64Url(match[0].slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
      if (bytes.length > 200000) return { error: 'Der Playlist-Code ist zu groß.' };
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return { error: 'Der Playlist-Code ist beschädigt oder unvollständig.' };
    }
    if (!data || data.v !== 1 || !Array.isArray(data.t)) return { error: 'Unbekanntes Playlist-Format.' };
    const tracks = data.t
      .slice(0, TRACKS_MAX)
      .map((row) => (Array.isArray(row)
        ? { src: SRC_BACK[row[0]], id: String(row[1] == null ? '' : row[1]), title: clean(row[2], TEXT_MAX), artist: clean(row[3], TEXT_MAX) }
        : null))
      .filter(validRef);
    if (!tracks.length) return { error: 'Die Playlist enthält keine übertragbaren Titel.' };
    return { name: clean(data.n, NAME_MAX) || 'Geteilte Playlist', tracks };
  }

  window.CMShare = {
    PREFIX,
    CODE_RE,
    TRACKS_MAX,
    refOf,
    encodePlaylist,
    decodePlaylist,
  };
})();
