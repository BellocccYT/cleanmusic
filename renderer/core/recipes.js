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
    { id: 'favorites', label: 'Favoriten', help: 'Alles, was du mit ♥ gespeichert hast.' },
    { id: 'local', label: 'Lokale Musik', help: 'Dateien aus deinen Ordnern.' },
    { id: 'history', label: 'Verlauf', help: 'Was du zuletzt gehört hast.' },
    { id: 'playlists', label: 'Meine Playlists', help: 'Titel aus deinen anderen Playlists.' },
    { id: 'recs', label: 'Vorschläge', help: 'Die zuletzt geladenen Empfehlungen.' },
    { id: 'charts', label: 'Charts & Neuheiten', help: 'Nur, wenn die Startseite sie schon geladen hat.' },
  ];
  const DAYS = [0, 7, 14, 30, 90];
  const LIMIT_MIN = 5;
  const LIMIT_MAX = 100;
  const BPM_MIN = 40;
  const BPM_MAX = 240;
  const WHY_LIMIT = 150;

  const REFRESH = [
    { id: 'manual', label: 'Nur per Knopf', chip: '' },
    { id: 'onOpen', label: 'Bei jedem Öffnen', chip: 'Aktualisiert beim Öffnen' },
    { id: 'daily', label: 'Einmal am Tag', chip: 'Täglich neu' },
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
    const r = normalize(rules);
    const out = r.sources.map((id) => (SOURCES.find((source) => source.id === id) || {}).label || id);
    if (r.kinds.length) out.push(r.kinds.map((id) => KINDS.find((kind) => kind.id === id).label).join(' / '));
    if (r.moods.length) out.push(`Stimmung: ${r.moods.map((id) => MOODS.find((mood) => mood.id === id).label).join(', ')}`);
    if (r.bpmMin && r.bpmMax) out.push(`${r.bpmMin}–${r.bpmMax} BPM`);
    else if (r.bpmMin) out.push(`ab ${r.bpmMin} BPM`);
    else if (r.bpmMax) out.push(`bis ${r.bpmMax} BPM`);
    if (r.streamSafe) out.push('Nur stream-sicher');
    if (r.withCredit) out.push('Nur mit Credit');
    if (r.notPlayedDays) out.push(`${r.notPlayedDays} Tage nicht gehört`);
    if (r.excludeDislikes) out.push('Ohne Dislikes');
    out.push(`Max. ${r.limit}`);
    const refresh = REFRESH.find((item) => item.id === r.refresh);
    if (refresh && refresh.chip) out.push(refresh.chip);
    return out;
  }

  /** Why is this entry in the recipe? A short, human sentence. */
  function explain(rules, entryId, details = {}) {
    const r = normalize(rules);
    const source = SOURCES.find((item) => item.id === r.why[entryId]);
    const parts = [source ? `aus „${source.label}“` : 'aus den gewählten Quellen'];
    if ((r.bpmMin || r.bpmMax) && details.bpm) parts.push(`${Math.round(details.bpm)} BPM`);
    if (r.moods.length && details.mood) {
      const mood = MOODS.find((item) => item.id === details.mood);
      if (mood) parts.push(`Stimmung ${mood.label}`);
    }
    if (r.notPlayedDays) parts.push(`seit ${r.notPlayedDays} Tagen nicht gehört`);
    if (r.streamSafe) parts.push('stream-sicher');
    return `Passt ins Rezept: ${parts.join(' · ')}`;
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
    normalize,
    rejects,
    collect,
    needsRefresh,
    chips,
    explain,
  };
})();
