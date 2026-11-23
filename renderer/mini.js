'use strict';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const format = (seconds) => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };

  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => window.mini.command(button.dataset.command));
  });
  $('#close').addEventListener('click', () => window.mini.command('restore'));
  // The state broadcast arrives several times per second – no update may
  // overwrite the thumb while the user is dragging, and it must not snap back
  // before the app has applied the seek.
  let seekHeld = false;
  let seekTarget = null;
  let seekAt = 0;
  const seek = $('#seek');
  const releaseSeek = () => {
    seekHeld = false;
    seekTarget = null;
  };
  seek.addEventListener('pointerdown', () => {
    seekHeld = true;
  });
  seek.addEventListener('change', (event) => {
    seekTarget = Number(event.target.value) || 0;
    seekAt = Date.now();
    seekHeld = true;
    window.mini.command('seek', seekTarget);
  });
  seek.addEventListener('pointerup', () => {
    // A click without a value change never fires `change`.
    if (seekTarget === null) releaseSeek();
  });
  seek.addEventListener('blur', releaseSeek);
  $('#volume').addEventListener('input', (event) => window.mini.command('volume', Number(event.target.value)));
  $('#topmost').addEventListener('change', (event) => window.mini.command('alwaysOnTop', event.target.checked));

  window.mini.onState((state) => {
    const track = state.track;
    $('#title').textContent = track ? track.title : 'Nichts ausgewählt';
    $('#artist').textContent = track ? track.artist || 'CleanMusic' : 'CleanMusic';
    const cover = $('#cover');
    const art = track && track.artwork ? track.artwork : '';
    if (cover.dataset.src !== art) {
      cover.dataset.src = art;
      cover.textContent = '';
      if (art) {
        const image = document.createElement('img');
        image.src = art;
        image.alt = '';
        cover.append(image);
      } else cover.textContent = '♪';
    }
    $('#play').textContent = state.playing ? 'Ⅱ' : '▶';
    const duration = Math.max(0, Number(state.duration) || 0);
    const position = Math.min(duration, Number(state.position) || 0);
    if (seekHeld && seekTarget !== null) {
      // Keep the user's target until the reported position is close to it (or
      // the seek clearly did not happen).
      if (Math.abs(position - seekTarget) < 1.5 || Date.now() - seekAt > 2500) releaseSeek();
    }
    $('#seek').max = String(duration);
    if (!seekHeld) $('#seek').value = String(position);
    $('#seek').disabled = !state.duration;
    $('#time').textContent = `${format(state.position)} / ${format(state.duration)}`;
    $('#volume').value = String(Math.max(0, Math.min(1.5, Number(state.volume) || 0)));
    $('#topmost').checked = Boolean(state.alwaysOnTop);
  });
})();
