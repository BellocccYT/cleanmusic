'use strict';

/**
 * Pure queue helpers.
 *
 * Loaded before app.js and exposed as window.CMQueue. No DOM, no audio and no
 * state: every function takes the data it needs, which makes the queue
 * testable and keeps app.js from growing further.
 */
(function () {
  function isPriority(entry) {
    return Boolean(entry && (entry.queued || entry.requestedBy));
  }

  function shuffled(list, random) {
    const copy = list.slice();
    const pick = typeof random === 'function' ? random : Math.random;
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(pick() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  // Mixes everything after the current title. Queued titles and song requests
  // stay in front and in their original order.
  function shuffleTail(items, index, random) {
    const list = Array.isArray(items) ? items.slice() : [];
    if (index < 0 || list.length < 2) return { items: list, upcoming: -1 };
    const head = list.slice(0, index + 1);
    const tail = list.slice(index + 1);
    const front = tail.filter(isPriority);
    const mixed = shuffled(tail.filter((entry) => !isPriority(entry)), random);
    return {
      items: head.concat(front, mixed),
      upcoming: tail.length ? index + 1 : -1,
    };
  }

  // Undoes shuffleTail: restores the order captured in `base`, keeps queued
  // titles in front and keeps titles that were added while shuffle was on.
  function restoreTail(items, index, base) {
    const list = Array.isArray(items) ? items.slice() : [];
    if (!Array.isArray(base) || index < 0) return { items: list, upcoming: -1 };
    const current = list[index];
    const head = list.slice(0, index + 1);
    const tail = list.slice(index + 1);
    const at = base.indexOf(current);
    const baseTail = at >= 0 ? base.slice(at + 1) : [];
    const inTail = new Set(tail);
    const front = tail.filter(isPriority);
    const ordered = baseTail.filter((entry) => inTail.has(entry) && !front.includes(entry));
    const known = new Set([...front, ...ordered]);
    const added = tail.filter((entry) => !known.has(entry));
    return {
      items: head.concat(front, ordered, added),
      upcoming: tail.length ? index + 1 : -1,
    };
  }

  function queueGroup(entry) {
    if (entry.requestedBy) return 'request';
    if (entry.queued) return 'queued';
    if (entry.autoplay) return 'autoplay';
    return 'context';
  }

  function upcomingIndex(items, index, repeat) {
    if (items[index + 1] && items[index + 1].queued) return index + 1;
    if (items.length < 2) return -1;
    if (index + 1 < items.length) return index + 1;
    if (repeat === 'all') return 0;
    return -1;
  }

  function nextIndex(length, current, direction, upcoming) {
    if (!length) return -1;
    if (direction > 0 && upcoming >= 0 && upcoming < length) return upcoming;
    if (current < 0) return 0;
    return (current + direction + length) % length;
  }

  function pendingQueued(items, index) {
    return items.slice(index + 1).filter((entry) => entry.queued);
  }

  // Where new titles land: 'next' right after the current one, 'end' after the
  // titles the user queued before. Returns -1 when the queue has no current title.
  function insertPosition(items, index, mode) {
    const list = Array.isArray(items) ? items : [];
    if (index < 0 || !list[index]) return -1;
    let at = index + 1;
    if (mode === 'end') {
      while (at < list.length && list[at].queued) at += 1;
    }
    return at;
  }

  // Removes a title from the waiting part (never the running one or earlier).
  // Returns the new list and whether something changed.
  function removeAt(items, index, position) {
    const list = Array.isArray(items) ? items.slice() : [];
    if (position <= index || position >= list.length) return { items: list, changed: false };
    list.splice(position, 1);
    return { items: list, changed: true };
  }

  // Moves a title inside the waiting part. Same guard rules as removeAt.
  function moveAt(items, index, from, to) {
    const list = Array.isArray(items) ? items.slice() : [];
    const blocked =
      from <= index || to <= index || from >= list.length || to >= list.length || from === to;
    if (blocked) return { items: list, changed: false };
    const [entry] = list.splice(from, 1);
    list.splice(to, 0, entry);
    return { items: list, changed: true };
  }

  // Drops everything after the current title that was added on top of a list
  // (queued titles, autoplay suggestions). Hands back how many were removed.
  function clearAdded(items, index) {
    const list = Array.isArray(items) ? items.slice() : [];
    if (index < 0 || index >= list.length) return { items: list, removed: 0 };
    const head = list.slice(0, index + 1);
    const rest = list.slice(index + 1).filter((entry) => !entry.queued && !entry.autoplay);
    return { items: head.concat(rest), removed: list.length - head.length - rest.length };
  }

  // The seed for autoplay: the last title (starting at the current one) that
  // `accept` likes. 0 is a valid index, so -1 means "nothing found".
  function seedIndex(items, index, accept) {
    const list = Array.isArray(items) ? items : [];
    if (typeof accept !== 'function') return -1;
    for (let at = index; at >= 0; at -= 1) {
      const entry = list[at];
      if (entry && accept(entry)) return at;
    }
    return -1;
  }

  window.CMQueue = {
    isPriority,
    shuffled,
    shuffleTail,
    restoreTail,
    queueGroup,
    upcomingIndex,
    nextIndex,
    pendingQueued,
    insertPosition,
    removeAt,
    moveAt,
    clearAdded,
    seedIndex,
  };
})();
