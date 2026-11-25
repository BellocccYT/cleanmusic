'use strict';

/**
 * Queue slice (2.0, Phase 1) – window.CMQueueSlice.
 *
 * The queue is the first state slice on the store: all list changes go through
 * here and are built on the pure helpers in audio/queue.js, so app.js keeps
 * only the playback side (playFromQueue, planUpcoming, rendering).
 *
 * The slice wraps the plain `state` object (or a CMState store) by reference –
 * `state.queue` stays the object the rest of app.js reads. Actions return
 * `{ items, index, changed }`; nothing is scheduled or rendered here.
 *
 * Loaded after audio/queue.js and before app.js, tested in test/queue.test.js.
 */
(function () {
  const Q = window.CMQueue;
  if (!Q) throw new Error('renderer/audio/queue.js fehlt');

  function create(target) {
    // Accepts a plain state object or a CMState store (createStore(state)).
    const isStore =
      target &&
      typeof target.get === 'function' &&
      typeof target.subscribe === 'function' &&
      target.state &&
      typeof target.state === 'object';
    const state = isStore ? target.state : target && typeof target === 'object' ? target : {};
    if (!state.queue || typeof state.queue !== 'object') {
      state.queue = { items: [], index: -1, kind: 'queue', upcoming: -1 };
    }

    const queue = {
      state,
      get: () => state.queue,
      items: () => state.queue.items,
      index: () => state.queue.index,
      length: () => state.queue.items.length,
      current() {
        const q = state.queue;
        return q.items[q.index] || null;
      },
      // Wholesale replacement (new list, new run). Creates a new object on
      // purpose: running autoplay tasks compare identities. `extra` may carry
      // fields like shuffleBase.
      replace(items, index, kind, extra) {
        const at = Number(index);
        state.queue = Object.assign(
          {
            items: (Array.isArray(items) ? items : []).slice(),
            index: Number.isFinite(at) ? Math.trunc(at) : 0,
            kind: kind || (state.queue && state.queue.kind) || 'queue',
            upcoming: -1,
          },
          extra && typeof extra === 'object' ? extra : {}
        );
        return state.queue;
      },
      // Adds copies in place. Returns the index of the first one, or -1 when
      // there is no current title to insert after (caller then replaces).
      insert(entries, mode) {
        const copies = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
        const q = state.queue;
        if (!copies.length) return -1;
        const at = Q.insertPosition(q.items, q.index, mode);
        if (at < 0) return -1;
        q.items.splice(at, 0, ...copies);
        return at;
      },
      // Appends (autoplay suggestions). Returns how many were added.
      append(entries) {
        const copies = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
        if (!copies.length) return 0;
        state.queue.items.push(...copies);
        return copies.length;
      },
      remove(position) {
        const result = Q.removeAt(state.queue.items, state.queue.index, position);
        if (!result.changed) return false;
        state.queue.items = result.items;
        return true;
      },
      move(from, to) {
        const result = Q.moveAt(state.queue.items, state.queue.index, from, to);
        if (!result.changed) return false;
        state.queue.items = result.items;
        return true;
      },
      // Removes queued/autoplay titles after the current one. Returns the count.
      clearAdded() {
        const result = Q.clearAdded(state.queue.items, state.queue.index);
        state.queue.items = result.items;
        return result.removed;
      },
      // Shuffles everything after the current title, optionally snapshotting the
      // current order for restore().
      shuffle(snapshot = true) {
        const q = state.queue;
        if (q.index < 0 || q.items.length < 2) return false;
        if (snapshot) q.shuffleBase = q.items.slice();
        const result = Q.shuffleTail(q.items, q.index);
        q.items = result.items;
        q.upcoming = result.upcoming;
        return true;
      },
      // Undoes shuffle() using the snapshot (or the given list).
      restore(base) {
        const q = state.queue;
        const saved = Array.isArray(base) ? base : Array.isArray(q.shuffleBase) ? q.shuffleBase : null;
        q.shuffleBase = null;
        if (!saved || q.index < 0) return false;
        const result = Q.restoreTail(q.items, q.index, saved);
        q.items = result.items;
        q.upcoming = result.upcoming;
        return true;
      },
      // Last title (from the current one backwards) that `accept` likes.
      seed(accept) {
        const at = Q.seedIndex(state.queue.items, state.queue.index, accept);
        return at >= 0 ? state.queue.items[at] : null;
      },
      // Titles the user queued that have not played yet.
      pending() {
        return Q.pendingQueued(state.queue.items, state.queue.index);
      },
    };

    return queue;
  }

  window.CMQueueSlice = { create };
})();
