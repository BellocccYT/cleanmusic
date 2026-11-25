'use strict';

/**
 * Music entries (2.0, Phase 1) – window.CMEntries.
 *
 * Every playable thing in CleanMusic has one shape: a plain object with `id`,
 * `kind`, `title`, `artist`, `url` and a few optional fields. This module builds
 * those objects (catalogue previews, plugin titles, local files, radio, the
 * cutter sources) and answers the small questions around them: what may be
 * stored, what counts as valid, which licence category a title has.
 *
 * Pure and DOM-free, loaded before app.js, tested in test/entries.test.js.
 */
(function () {
  // 'stream' = a full, directly playable file (free music, sound effects).
  const KINDS = ['preview', 'plugin', 'stream', 'local', 'radio'];
  const FIELDS = [
    'id', 'kind', 'source', 'sourceLabel', 'title', 'artist', 'album', 'artwork',
    'duration', 'url', 'link', 'artistId', 'pluginId', 'refId', 'path', 'dir', 'meta',
    'license', 'licenseUrl', 'credit', 'category', 'addedAt', 'ytLicense', 'aiHint',
  ];

  function previewEntry(track) {
    return {
      id: String(track.id),
      kind: 'preview',
      source: track.source || 'deezer',
      sourceLabel: track.sourceLabel || 'Vorschau',
      title: track.title || 'Unbekannt',
      artist: track.artist || '',
      album: track.album || '',
      artwork: track.artwork || '',
      duration: Number(track.duration) || 0,
      url: track.preview || track.url || '',
      link: track.link || '',
      artistId: track.artistId || null,
    };
  }

  function pluginEntry(plugin, item) {
    return {
      id: `p:${plugin.id}:${item.id}`,
      kind: 'plugin',
      pluginId: plugin.id,
      refId: String(item.id),
      source: plugin.source.id,
      sourceLabel: plugin.source.label,
      title: item.title || 'Unbekannt',
      artist: item.artist || '',
      album: '',
      artwork: item.artwork || '',
      duration: Number(item.duration) || 0,
      url: '',
      link: item.link || '',
      aiHint: Boolean(item.aiHint),
      ytLicense: item.license === 'cc-by' ? 'cc-by' : '',
    };
  }

  // Favourites saved by 0.5.0 (before plugins existed).
  function migrateEntry(entry) {
    if (!entry || entry.kind !== 'youtube' || !entry.ytId) return entry;
    const next = Object.assign({}, entry, {
      id: `p:ytdlp:${entry.ytId}`,
      kind: 'plugin',
      pluginId: 'ytdlp',
      refId: entry.ytId,
    });
    delete next.ytId;
    return next;
  }

  function ncsEntry(track) {
    const entry = previewEntry(track);
    entry.license = 'NCS';
    entry.licenseUrl = 'https://ncs.io/usage-policy';
    entry.credit =
      `Song: ${entry.artist ? `${entry.artist} - ` : ''}${entry.title} [NCS Release]\n` +
      'Music provided by NoCopyrightSounds\n' +
      `Free Download/Stream: https://ncs.io/music-search?q=${encodeURIComponent(entry.title)}`;
    return entry;
  }

  function classicEntry(track) {
    return {
      id: track.id,
      kind: 'stream',
      source: 'incompetech',
      sourceLabel: 'incompetech',
      title: track.title,
      artist: track.artist,
      album: '',
      artwork: '',
      duration: 0,
      url: track.url,
      link: track.url,
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      credit:
        `"${track.title}" Kevin MacLeod (incompetech.com)\n` +
        'Licensed under Creative Commons: By Attribution 4.0 License\n' +
        'http://creativecommons.org/licenses/by/4.0/',
      category: track.category,
    };
  }

  function openverseEntry(item) {
    return {
      id: String(item.id),
      kind: 'stream',
      source: String(item.source || 'openverse'),
      sourceLabel: item.sourceLabel || 'Openverse',
      title: item.title || 'Unbekannt',
      artist: item.artist || '',
      album: '',
      artwork: item.artwork || '',
      duration: Number(item.duration) || 0,
      url: item.url,
      link: item.link || '',
      license: item.license || '',
      licenseUrl: item.licenseUrl || '',
      credit: item.credit || '',
      meta: Array.isArray(item.tags) ? item.tags.join(' · ') : '',
    };
  }

  function licenseKey(license) {
    const value = String(license || '').toLowerCase();
    if (value === 'cc0' || value === 'public domain') return 'free';
    if (value === 'ncs') return 'ncs';
    if (value.startsWith('cc by')) return 'by';
    return 'other';
  }

  // Licence filter category for a recipe. Plugin-confirmed CC counts as CC BY.
  function licenseCategory(entry) {
    const key = licenseKey(entry && entry.license);
    if (key === 'other' && entry && entry.ytLicense === 'cc-by') return 'by';
    return key;
  }

  function localEntry(track) {
    return {
      id: `local:${track.path}`,
      kind: 'local',
      source: 'local',
      sourceLabel: 'Lokal',
      title: track.title || track.name || 'Unbekannt',
      artist: track.artist || '',
      album: '',
      artwork: '',
      duration: 0,
      url: track.url,
      link: '',
      path: track.path,
      dir: track.dir || '',
    };
  }

  function radioEntry(station) {
    return {
      id: `radio:${station.id}`,
      kind: 'radio',
      source: 'radio',
      sourceLabel: 'Radio',
      title: station.name,
      artist:
        [station.country, ...(station.tags || [])]
          .filter(Boolean)
          .slice(0, 2)
          .join(' · ') || 'Live Radio',
      album: '',
      artwork: station.favicon || '',
      duration: 0,
      url: station.url,
      link: station.homepage || '',
      meta: [
        station.country,
        station.codec,
        station.bitrate ? `${station.bitrate} kbps` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }

  // Strips an entry down to the fields worth storing (no blob URLs, no objects)
  // and remembers when it was added.
  function storable(entry) {
    const out = {};
    FIELDS.forEach((key) => {
      const value = entry[key];
      if (value !== undefined && value !== null && value !== '') out[key] = value;
    });
    if (!out.addedAt) out.addedAt = Date.now();
    return out;
  }

  function validEntry(entry) {
    return Boolean(
      entry &&
        typeof entry.id === 'string' &&
        typeof entry.title === 'string' &&
        KINDS.includes(entry.kind)
    );
  }

  window.CMEntries = {
    KINDS,
    FIELDS,
    previewEntry,
    pluginEntry,
    migrateEntry,
    ncsEntry,
    classicEntry,
    openverseEntry,
    licenseKey,
    licenseCategory,
    localEntry,
    radioEntry,
    storable,
    validEntry,
  };
})();
