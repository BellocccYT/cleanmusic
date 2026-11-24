'use strict';

/**
 * One place for every localStorage key.
 *
 * Loaded before app.js and exposed as window.CMPersist. Keeping the keys here
 * makes migrations and backups auditable; the actual read/write helpers live
 * in renderer/core/storage.js.
 */
(function () {
  const STORAGE = {
    settings: 'cleanmusic.settings.v1',
    library: 'cleanmusic.library.v1',
    volume: 'cleanmusic.volume.v1', // 0.7 and older: linear element volume
    level: 'cleanmusic.volume.v2', // { level (slider, 0–1.5), muted }
    playback: 'cleanmusic.playback.v1',
    collection: 'cleanmusic.collection.v1',
    matches: 'cleanmusic.matches.v1',
    recs: 'cleanmusic.recs.v1',
    credits: 'cleanmusic.credits.v1',
    openverseCache: 'cleanmusic.ovcache.v1',
    downloads: 'cleanmusic.downloads.v1', // entry id → { path, at }
    creatorDownloads: 'cleanmusic.creatordl.v1', // [{ path, name, service, at }]
    seenVersion: 'cleanmusic.seenversion.v1', // last version the user saw "what's new" for
    creatorUsage: 'cleanmusic.creatorusage.v1', // { "tab:category": opens } for "Für dich"
    localView: 'cleanmusic.localview.v1', // { sort }
    localMoods: 'cleanmusic.localmoods.v1', // { folder: mood }
    stats: 'cleanmusic.stats.v1', // { months: { "YYYY-MM": { secs, plays, hours, tracks, artists, sources } } }
    bpm: 'cleanmusic.bpm.v1', // { entryId: bpm }
    history: 'cleanmusic.history.v1', // [{ entry, plays, first, last }]
    taste: 'cleanmusic.taste.v1', // { tracks, artists, skips, revision } – local taste profile
    eq: 'cleanmusic.eq.v1',
    cutProjects: 'cleanmusic.cutprojects.v1',
    autoBackup: 'cleanmusic.autobackup.v1',
    nav: 'cleanmusic.nav.v1', // { services, creator } sidebar sections
    onboardingMusic: 'cleanmusic.onboardingmusic.v1', // boolean
    schema: 'cleanmusic.schema.v1', // { version, history } – see core/migrations.js
    quarantine: 'cleanmusic.quarantine.v1', // { items: [{ key, reason, at, raw }] } unreadable values
    schemaSnapshot: 'cleanmusic.schema.snapshot.v1', // local pre-migration snapshot (no file access)
  };

  window.CMPersist = {
    STORAGE,
    entries: () => Object.entries(STORAGE),
  };
})();
