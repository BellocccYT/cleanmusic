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
  $('#seek').addEventListener('change', (event) => window.mini.command('seek', Number(event.target.value)));
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
    $('#seek').max = String(Math.max(0, Number(state.duration) || 0));
    $('#seek').value = String(Math.min(Number(state.duration) || 0, Number(state.position) || 0));
    $('#seek').disabled = !state.duration;
    $('#time').textContent = `${format(state.position)} / ${format(state.duration)}`;
    $('#volume').value = String(Math.max(0, Math.min(1.5, Number(state.volume) || 0)));
    $('#topmost').checked = Boolean(state.alwaysOnTop);
  });
})();
