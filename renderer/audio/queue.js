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

  window.CMQueue = {
    isPriority,
    shuffled,
    shuffleTail,
    restoreTail,
    queueGroup,
    upcomingIndex,
    nextIndex,
    pendingQueued,
  };
})();
