'use strict';

/**
 * Recipes (smart playlists) – the pure part (2.0, Phase 3).
 *
 * Loaded before app.js and exposed as window.CMRecipes. Everything here works
 * on plain data and small callbacks, so it can be tested without a browser
 * (test/recipes.test.js). app.js supplies the context: which entries exist,
 * their BPM, their mood, when they were last played, taste and licenses.
 * No network – a recipe only ever picks from music that is already here.
 */
(function () {
  const SOURCES = [
    {
      id: 'favorites',
      label: 'Favoriten',
      help: 'Alles, was du mit ♥ gespeichert hast.',
      helpEn: 'Everything you saved with ♥.',
    },
    { id: 'local', label: 'Lokale Musik', help: 'Dateien aus deinen Ordnern.', helpEn: 'Files from your folders.' },
    { id: 'history', label: 'Verlauf', help: 'Was du zuletzt gehört hast.', helpEn: 'What you listened to recently.' },
    {
      id: 'playlists',
      label: 'Meine Playlists',
      help: 'Titel aus deinen anderen Playlists.',
      helpEn: 'Tracks from your other playlists.',
    },
    { id: 'recs', label: 'Vorschläge', help: 'Die zuletzt geladenen Empfehlungen.', helpEn: 'The suggestions loaded most recently.' },
    {
      id: 'charts',
      label: 'Charts & Neuheiten',
      help: 'Nur, wenn die Startseite sie schon geladen hat.',
      helpEn: 'Only if the home page already loaded them.',
    },
  ];
  const DAYS = [0, 7, 14, 30, 90];
  const LIMIT_MIN = 5;
  const LIMIT_MAX = 100;
  const BPM_MIN = 40;
  const BPM_MAX = 240;
  const WHY_LIMIT = 150;

  const REFRESH = [
    { id: 'manual', label: 'Nur per Knopf', labelEn: 'Only via button', chip: '' },
    {
      id: 'onOpen',
      label: 'Bei jedem Öffnen',
      labelEn: 'Whenever opened',
      chip: 'Aktualisiert beim Öffnen',
      chipEn: 'Refreshed on open',
    },
    { id: 'daily', label: 'Einmal am Tag', labelEn: 'Once a day', chip: 'Täglich neu', chipEn: 'New daily' },
  ];

  // Entry kinds a recipe can be limited to (radio is never part of a recipe).
  const KINDS = [
    { id: 'local', label: 'Lokale Dateien' },
    { id: 'preview', label: '30-s-Vorschauen' },
    { id: 'plugin', label: 'Volle Titel (Plugins)' },
    { id: 'stream', label: 'Freie Musik' },
  ];

  // Same ids and labels as LOCAL_MOODS in app.js (which adds the keywords).
  const MOODS = [
    { id: 'chill', label: 'Chill' },
    { id: 'party', label: 'Party' },
    { id: 'workout', label: 'Workout' },
    { id: 'fokus', label: 'Fokus' },
    { id: 'gaming', label: 'Gaming' },
    { id: 'traurig', label: 'Traurig' },
  ];

  // Licence categories for the explicit licence filter. The ids match
  // licenseKey()/licenseCategory() in app.js.
  const LICENSES = [
    { id: 'free', label: 'CC0 / Public Domain' },
    { id: 'by', label: 'CC BY' },
    { id: 'ncs', label: 'NCS' },
    { id: 'other', label: 'Andere / unklar' },
  ];

  // System recipes: the five daily Mixes as editable smart-playlist rules.
  // "Als Rezept speichern" turns one into an own playlist that renews daily.
  const SYSTEM = {
    daily: { sources: ['favorites', 'history', 'local', 'recs'], limit: 30, refresh: 'daily' },
    fresh: { sources: ['recs', 'charts'], limit: 30, refresh: 'daily', notPlayedDays: 30 },
    discover: { sources: ['recs', 'charts'], limit: 30, refresh: 'daily', notPlayedDays: 90 },
    again: { sources: ['history', 'favorites'], limit: 30, refresh: 'daily', notPlayedDays: 14 },
    deep: { sources: ['playlists', 'local'], limit: 30, refresh: 'daily', notPlayedDays: 30 },
  };

  /** Rules for a system recipe (a fresh copy), or null. */
  function system(id) {
    return Object.prototype.hasOwnProperty.call(SYSTEM, id) ? normalize(SYSTEM[id]) : null;
  }

  // English labels for the chips and the "why" line. The default language is
  // German and stays exactly as before; CMI18n only exists in the app.
  const EN = {
    sources: {
      favorites: 'Favorites',
      local: 'Local music',
      history: 'History',
      playlists: 'My playlists',
      recs: 'Suggestions',
      charts: 'Charts & new',
    },
    kinds: {
      local: 'Local files',
      preview: '30 s previews',
      plugin: 'Full tracks (plugins)',
      stream: 'Free music',
    },
    moods: { chill: 'Chill', party: 'Party', workout: 'Workout', fokus: 'Focus', gaming: 'Gaming', traurig: 'Sad' },
    licenses: { free: 'CC0 / Public domain', by: 'CC BY', ncs: 'NCS', other: 'Other / unclear' },
  };

  const inEnglish = () => {
    const i18n = typeof window !== 'undefined' ? window.CMI18n : null;
    return Boolean(i18n && typeof i18n.lang === 'function' && i18n.lang() === 'en');
  };

  function labelOf(group, id) {
    const list = { sources: SOURCES, refresh: REFRESH, kinds: KINDS, moods: MOODS, licenses: LICENSES }[group] || [];
    const item = list.find((entry) => entry.id === id);
    if (inEnglish()) {
      if (item && item.labelEn) return item.labelEn;
      if (EN[group] && EN[group][id]) return EN[group][id];
    }
    return item ? item.label : id;
  }

  function helpOf(id) {
    const source = SOURCES.find((entry) => entry.id === id);
    if (!source) return '';
    return inEnglish() && source.helpEn ? source.helpEn : source.help;
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  const pick = (list, values) =>
    Array.from(new Set((Array.isArray(values) ? values : []).filter((id) => list.some((item) => item.id === id))));

  function bpmValue(value) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(BPM_MAX, Math.max(BPM_MIN, number));
  }

  /** Clean rules from storage, a backup or the dialog. Unknown values are dropped. */
  function normalize(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const sources = pick(SOURCES, input.sources);
    const days = Number(input.notPlayedDays);
    let bpmMin = bpmValue(input.bpmMin);
    let bpmMax = bpmValue(input.bpmMax);
    if (bpmMin && bpmMax && bpmMin > bpmMax) [bpmMin, bpmMax] = [bpmMax, bpmMin];
    const why = {};
    if (input.why && typeof input.why === 'object') {
      Object.keys(input.why)
        .slice(0, WHY_LIMIT)
        .forEach((id) => {
          const source = input.why[id];
          if (typeof id === 'string' && SOURCES.some((item) => item.id === source)) why[id] = source;
        });
    }
    return {
      sources: sources.length ? sources : ['favorites', 'local', 'history'],
      limit: Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.round(Number(input.limit)) || 30)),
      streamSafe: Boolean(input.streamSafe),
      withCredit: Boolean(input.withCredit),
      notPlayedDays: DAYS.includes(days) ? days : 0,
      excludeDislikes: input.excludeDislikes !== false,
      refresh: REFRESH.some((item) => item.id === input.refresh) ? input.refresh : 'manual',
      bpmMin,
      bpmMax,
      moods: pick(MOODS, input.moods),
      kinds: pick(KINDS, input.kinds),
      licenses: pick(LICENSES, input.licenses),
      updatedAt: Number(input.updatedAt) || 0,
      why,
    };
  }

  /**
   * Does an entry pass the filters? `ctx` supplies the lookups:
   * valid(entry), streamSafe(entry), disliked(entry), lastPlayed(id) → ms,
   * bpm(entry) → number|0, mood(entry) → id|'', now → ms.
   * Returns '' when accepted, otherwise the name of the rule that rejected it.
   */
  function rejects(entry, rules, ctx) {
    if (!entry || (ctx.valid && !ctx.valid(entry))) return 'invalid';
    if (entry.kind === 'radio') return 'radio';
    if (rules.kinds.length && !rules.kinds.includes(entry.kind)) return 'kind';
    if (rules.streamSafe && !(ctx.streamSafe && ctx.streamSafe(entry))) return 'streamSafe';
    if (rules.withCredit && !entry.credit) return 'credit';
    if (rules.excludeDislikes && ctx.disliked && ctx.disliked(entry)) return 'dislike';
    if (rules.licenses && rules.licenses.length) {
      const license = ctx.license ? ctx.license(entry) : 'other';
      if (!rules.licenses.includes(license)) return 'license';
    }
    if (rules.notPlayedDays > 0) {
      const last = ctx.lastPlayed ? Number(ctx.lastPlayed(entry.id)) || 0 : 0;
      const now = Number(ctx.now) || Date.now();
      if (last && now - last < rules.notPlayedDays * DAY_MS) return 'played';
    }
    if (rules.bpmMin || rules.bpmMax) {
      const bpm = ctx.bpm ? Number(ctx.bpm(entry)) || 0 : 0;
      if (!bpm) return 'bpmUnknown';
      if (rules.bpmMin && bpm < rules.bpmMin) return 'bpm';
      if (rules.bpmMax && bpm > rules.bpmMax) return 'bpm';
    }
    if (rules.moods.length) {
      const mood = ctx.mood ? ctx.mood(entry) : '';
      if (!rules.moods.includes(mood)) return 'mood';
    }
    return '';
  }

  /**
   * Interleave the sources so one big list cannot dominate, without
   * duplicates (by id and by keyOf), up to the limit.
   * groups: [{ source, list }] – each list already filtered and sorted.
   * Returns { items, why } where why maps entry id → source id.
   */
  function collect(groups, limit, keyOf) {
    const out = [];
    const why = {};
    const seenIds = new Set();
    const seenKeys = new Set();
    const lists = (Array.isArray(groups) ? groups : []).filter((group) => group && Array.isArray(group.list));
    const cursors = lists.map(() => 0);
    const max = Math.max(0, Number(limit) || 0);
    let added = true;
    while (out.length < max && added) {
      added = false;
      for (let index = 0; index < lists.length && out.length < max; index += 1) {
        const { list, source } = lists[index];
        while (cursors[index] < list.length) {
          const entry = list[cursors[index]];
          cursors[index] += 1;
          const key = keyOf ? keyOf(entry) : entry.id;
          if (seenIds.has(entry.id) || seenKeys.has(key)) continue;
          seenIds.add(entry.id);
          seenKeys.add(key);
          out.push(entry);
          if (Object.keys(why).length < WHY_LIMIT) why[entry.id] = source;
          added = true;
          break;
        }
      }
    }
    return { items: out, why };
  }

  function dayKey(time) {
    const date = new Date(time);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  /**
   * Should a recipe be rebuilt now? trigger: 'open' (playlist opened) or
   * 'start' (app start / day change).
   */
  function needsRefresh(rules, trigger, now = Date.now()) {
    const refresh = rules && rules.refresh;
    if (refresh === 'onOpen') return trigger === 'open';
    if (refresh === 'daily') {
      const at = Number(rules.updatedAt) || 0;
      return !at || dayKey(at) !== dayKey(now);
    }
    return false;
  }

  /** Short labels for the rule chips (playlist header, "Warum läuft das?"). */
  function chips(rules) {
    const en = inEnglish();
    const r = normalize(rules);
    const out = r.sources.map((id) => labelOf('sources', id));
    if (r.kinds.length) out.push(r.kinds.map((id) => labelOf('kinds', id)).join(' / '));
    if (r.moods.length) {
      const moods = r.moods.map((id) => labelOf('moods', id)).join(', ');
      out.push(en ? `Mood: ${moods}` : `Stimmung: ${moods}`);
    }
    if (r.bpmMin && r.bpmMax) out.push(`${r.bpmMin}–${r.bpmMax} BPM`);
    else if (r.bpmMin) out.push(en ? `from ${r.bpmMin} BPM` : `ab ${r.bpmMin} BPM`);
    else if (r.bpmMax) out.push(en ? `up to ${r.bpmMax} BPM` : `bis ${r.bpmMax} BPM`);
    if (r.streamSafe) out.push(en ? 'Stream-safe only' : 'Nur stream-sicher');
    if (r.withCredit) out.push(en ? 'With credit only' : 'Nur mit Credit');
    if (r.licenses.length) {
      const licenses = r.licenses.map((id) => labelOf('licenses', id)).join(', ');
      out.push(en ? `License: ${licenses}` : `Lizenz: ${licenses}`);
    }
    if (r.notPlayedDays) {
      out.push(en ? `Not heard for ${r.notPlayedDays} days` : `${r.notPlayedDays} Tage nicht gehört`);
    }
    if (r.excludeDislikes) out.push(en ? 'Without dislikes' : 'Ohne Dislikes');
    out.push(`Max. ${r.limit}`);
    const refresh = REFRESH.find((item) => item.id === r.refresh);
    if (refresh && refresh.chip) {
      out.push(en && refresh.chipEn ? refresh.chipEn : refresh.chip);
    }
    return out;
  }

  /** Why is this entry in the recipe? A short, human sentence. */
  function explain(rules, entryId, details = {}) {
    const en = inEnglish();
    const r = normalize(rules);
    const source = SOURCES.find((item) => item.id === r.why[entryId]);
    const parts = [
      source
        ? en
          ? `from “${labelOf('sources', source.id)}”`
          : `aus „${source.label}“`
        : en
          ? 'from the selected sources'
          : 'aus den gewählten Quellen',
    ];
    if ((r.bpmMin || r.bpmMax) && details.bpm) parts.push(`${Math.round(details.bpm)} BPM`);
    if (r.moods.length && details.mood) {
      const mood = MOODS.find((item) => item.id === details.mood);
      if (mood) parts.push(en ? `mood ${labelOf('moods', mood.id)}` : `Stimmung ${mood.label}`);
    }
    if (r.notPlayedDays) {
      parts.push(en ? `not heard for ${r.notPlayedDays} days` : `seit ${r.notPlayedDays} Tagen nicht gehört`);
    }
    if (r.streamSafe) parts.push(en ? 'stream-safe' : 'stream-sicher');
    return en ? `Fits the recipe: ${parts.join(' · ')}` : `Passt ins Rezept: ${parts.join(' · ')}`;
  }

  window.CMRecipes = {
    SOURCES,
    DAYS,
    LIMIT_MIN,
    LIMIT_MAX,
    BPM_MIN,
    BPM_MAX,
    REFRESH,
    KINDS,
    MOODS,
    LICENSES,
    normalize,
    rejects,
    collect,
    needsRefresh,
    chips,
    explain,
    labelOf,
    helpOf,
    SYSTEM_IDS: Object.keys(SYSTEM),
    system,
  };
})();
