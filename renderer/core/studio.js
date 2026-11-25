'use strict';

/**
 * Pure logic for the Studio (Cutter → non-destructive timeline, 2.0 Phase 4).
 *
 * A project holds an ordered list of clips. A clip is a non-destructive
 * reference to a source (title/artist/license/credit/audio url) plus a trim
 * range and per-clip render options (fade, normalize, loop). Export renders
 * the clips in order into one file and writes one credit.
 *
 * Everything here is deterministic and DOM-free, so it can be tested with
 * plain Node. Loaded before app.js as window.CMStudio; tested in
 * test/studio.test.js.
 */
(function () {
  const MAX_CLIPS = 500;

  function str(value, max) {
    return String(value == null ? '' : value).slice(0, max);
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function clampSec(value) {
    return Math.max(0, Math.min(86400, num(value)));
  }

  function clampFade(value) {
    return Math.max(0, Math.min(5, num(value)));
  }

  function clampLoop(value) {
    return Math.max(50, Math.min(500, Math.round(num(value)) || 150));
  }

  function normalizeClip(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const key = str(raw.key, 80).trim();
    if (!key) return null;
    const a = clampSec(raw.in);
    const b = clampSec(raw.out);
    return {
      key,
      title: str(raw.title, 200),
      artist: str(raw.artist, 200),
      license: str(raw.license, 80),
      licenseUrl: str(raw.licenseUrl, 1000),
      credit: str(raw.credit, 2000),
      source: str(raw.source, 80),
      url: str(raw.url, 1000),
      link: str(raw.link, 1000),
      in: Math.min(a, b),
      out: Math.max(a, b),
      fadeIn: clampFade(raw.fadeIn),
      fadeOut: clampFade(raw.fadeOut),
      normalize: raw.normalize === true,
      loop: raw.loop === true,
      loopMs: clampLoop(raw.loopMs),
      duration: clampSec(raw.duration),
    };
  }

  /**
   * Normalises a stored project. Accepts the legacy shape (project.items,
   * a credit list) and lifts each item into a clip so old projects keep
   * working; legacy items have no audio url and are therefore not exportable.
   */
  function normalizeProject(raw) {
    const project = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    let clips = project.clips;
    if (!Array.isArray(clips) && Array.isArray(project.items)) {
      clips = project.items.map((item) => ({
        key: String((item && item.key) || '').slice(0, 80),
        title: item && item.title,
        artist: item && item.artist,
        license: item && item.license,
        licenseUrl: item && item.licenseUrl,
        credit: item && item.credit,
        source: item && item.source,
        // Legacy items stored only "url" (the external link). The audio url is
        // unknown, so the clip keeps the link for the credit but is not exportable.
        url: '',
        link: item && item.url,
        in: 0,
        out: 0,
        duration: 0,
      }));
    }
    return {
      id: str(project.id, 80),
      name: str(project.name || 'Projekt', 80),
      created: num(project.created) || Date.now(),
      clips: (Array.isArray(clips) ? clips : [])
        .map(normalizeClip)
        .filter(Boolean)
        .slice(0, MAX_CLIPS),
    };
  }

  // Build a clip from a source entry (the app's "add to project" path).
  function clipOf(entry, key) {
    const e = entry && typeof entry === 'object' ? entry : {};
    const base = normalizeClip({
      key: str(key || e.id || e.url || `${e.title}|${e.artist}`, 80),
      title: e.title,
      artist: e.artist,
      license: e.license,
      licenseUrl: e.licenseUrl,
      credit: e.credit,
      source: e.sourceLabel || e.source,
      url: e.url,
      link: e.link || e.url,
      in: 0,
      out: num(e.duration),
      duration: num(e.duration),
    });
    return base;
  }

  // Each clip's start/end on the timeline and the total duration (sequential).
  function timelineLayout(clips) {
    let cursor = 0;
    const rows = clips.map((clip) => {
      const duration = Math.max(0, clip.out - clip.in);
      const row = { key: clip.key, start: cursor, end: cursor + duration, duration };
      cursor += duration;
      return row;
    });
    return { rows, total: cursor };
  }

  function totalDuration(clips) {
    return clips.reduce((sum, clip) => sum + Math.max(0, clip.out - clip.in), 0);
  }

  // "free" | "by" | "ncs" | "other" – same rules as app.js licenseKey().
  function licenseKey(license) {
    const value = String(license || '').toLowerCase();
    if (value === 'cc0' || value === 'public domain') return 'free';
    if (value === 'ncs') return 'ncs';
    if (value.startsWith('cc by')) return 'by';
    return 'other';
  }

  // Every clip must carry a CC0/CC BY/PD/NCS licence before export.
  function isStreamSafe(clips) {
    return clips.every((clip) => ['free', 'by', 'ncs'].includes(licenseKey(clip.license)));
  }

  function clipChanges(clip) {
    const parts = ['Ausschnitt'];
    if (clip.fadeIn) parts.push(`Fade-in ${clip.fadeIn.toFixed(1)} s`);
    if (clip.fadeOut) parts.push(`Fade-out ${clip.fadeOut.toFixed(1)} s`);
    if (clip.normalize) parts.push('normalisiert');
    if (clip.loop) parts.push(`Loop-Übergang ${clip.loopMs} ms`);
    return parts.join(', ');
  }

  function clipLabel(clip) {
    return `„${clip.title}“${clip.artist ? ` von ${clip.artist}` : ''}`;
  }

  /**
   * The project credit (.txt) content: credits grouped by licence, deduped,
   * plus a "changes" list that documents every clip's trim and effects.
   */
  function studioCreditText(project) {
    if (!project || !project.clips.length) return '';
    const groups = new Map();
    const seen = new Set();
    project.clips.forEach((clip) => {
      const license = clip.license || 'Lizenz nicht angegeben';
      const credit = (clip.credit || '').trim() || `${clipLabel(clip)}${clip.source ? ` (${clip.source})` : ''}`;
      const key = credit.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (!groups.has(license)) groups.set(license, []);
      groups.get(license).push(credit);
    });
    const credits = Array.from(groups.keys())
      .sort((a, b) => a.localeCompare(b, 'de'))
      .flatMap((license) => [license, ...groups.get(license), '']);
    const changes = project.clips.filter((clip) => clip.out > clip.in).map(
      (clip) => `- ${clipLabel(clip)} – ${clipChanges(clip)}`
    );
    return [
      `Musik & Sounds – ${project.name}`,
      '',
      ...credits,
      ...(changes.length ? ['Änderungen:', ...changes, ''] : []),
      'Zusammengestellt mit CleanMusic',
    ]
      .join('\n')
      .trim();
  }

  // Export presets. Only WAV renders today (no MP3/M4A encoder ships);
  // the others stay as presets so a codec can be added later without a
  // data migration.
  const PRESETS = [
    { id: 'video', label: 'Video (WAV)', format: 'wav' },
    { id: 'normalized', label: 'Normalisiert (WAV)', format: 'wav', normalize: true },
    { id: 'loop', label: 'Loop (WAV)', format: 'wav', loop: true },
  ];

  window.CMStudio = {
    MAX_CLIPS,
    normalizeClip,
    normalizeProject,
    clipOf,
    timelineLayout,
    totalDuration,
    licenseKey,
    isStreamSafe,
    clipChanges,
    clipLabel,
    studioCreditText,
    PRESETS,
  };
})();
