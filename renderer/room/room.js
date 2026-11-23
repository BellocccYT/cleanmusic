'use strict';

/**
 * Room prototype ("Der Raum").
 *
 * Standalone preview: no network, no player, no persistence. It exists to
 * test the shell from docs/CONCEPT-2.0.md before anything is rebuilt.
 */
(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const TRACKS = [
    {
      title: 'Midnight City',
      artist: 'M83',
      album: 'Hurry Up, We’re Dreaming',
      source: 'Jetzt · Vorschau',
      kind: 'Deezer · 30 s',
      safe: false,
      duration: 243,
      letter: 'M',
      a: '#5b8cff',
      b: '#35e0c0',
      note: 'Aus deinem Rezept „Späte Stunden“: Chill, 60–100 BPM, seit 14 Tagen nicht gehört.',
    },
    {
      title: 'Fluffing a Duck',
      artist: 'Kevin MacLeod',
      album: 'Royalty Free',
      source: 'Jetzt · CC BY',
      kind: 'incompetech · CC BY 4.0',
      safe: true,
      duration: 67,
      letter: 'F',
      a: '#e0a35b',
      b: '#b45b5b',
      note: 'Stream-sicher: CC BY 4.0. Der Credit wird automatisch mitgeschrieben.',
    },
    {
      title: 'One More Time',
      artist: 'Daft Punk',
      album: 'Discovery',
      source: 'Jetzt · Vorschau',
      kind: 'Deezer · 30 s',
      safe: false,
      duration: 320,
      letter: 'O',
      a: '#ff7a90',
      b: '#6d5bff',
      note: 'Aus dem Strom: Songwunsch von @viewer2 – als Nächstes eingereiht.',
    },
    {
      title: 'The Less I Know The Better',
      artist: 'Tame Impala',
      album: 'Currents',
      source: 'Jetzt · Vorschau',
      kind: 'Deezer · 30 s',
      safe: false,
      duration: 216,
      letter: 'T',
      a: '#c06bff',
      b: '#5b8cff',
      note: 'Aus dem Verlauf: zuletzt vor 22 Tagen gehört, kein Dislike.',
    },
  ];

  const MODES = {
    listen: { title: 'Hören' },
    browse: { title: 'Stöbern' },
    build: { title: 'Bauen' },
    connect: { title: 'Verbinden' },
  };

  const THEME_CYCLE = ['nacht', 'tag', 'nord'];

  const root = $('#room');
  const drawer = $('#drawer');
  const stageArt = $('#stage-art');
  let mode = 'listen';
  let index = 0;
  let playing = false;
  let themeIndex = 0;
  let toastTimer = null;

  function fmt(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function current() {
    return TRACKS[index];
  }

  function applyTheme(id) {
    const themes = Array.isArray(window.CM_THEMES) ? window.CM_THEMES : [];
    const theme = themes.find((entry) => entry.id === id) || themes[0];
    if (!theme) return;
    const html = document.documentElement;
    const aliases = {
      bg2: 'bg-2',
      panel2: 'panel-2',
      panel3: 'panel-3',
      borderSoft: 'border-soft',
      muted2: 'muted-2',
      accent2: 'accent-2',
      onAccent: 'on-accent',
    };
    Object.entries(theme.colors).forEach(([key, value]) => {
      // bg2 → --bg-2, borderSoft → --border-soft, onAccent → --on-accent …
      const name =
        aliases[key] || key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      html.style.setProperty(`--${name}`, value);
      if (/^#[0-9a-f]{6}$/i.test(value)) {
        const number = parseInt(value.slice(1), 16);
        html.style.setProperty(
          `--${name}-rgb`,
          `${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}`
        );
      }
    });
    html.dataset.theme = theme.id;
    html.dataset.light = theme.light ? '1' : '0';
    themeIndex = Math.max(0, THEME_CYCLE.indexOf(theme.id));
    const button = $('[data-action="theme"]');
    if (button) button.title = `Theme: ${theme.name} · wechseln (T)`;
  }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function setPlaying(value) {
    playing = Boolean(value);
    root.classList.toggle('playing', playing);
    const label = $('#stage-play-label');
    if (label) label.textContent = playing ? 'Pause' : 'Abspielen';
    const now = $('#now-play');
    if (now) now.setAttribute('aria-label', playing ? 'Pausieren' : 'Abspielen');
  }

  function setMode(next) {
    if (!MODES[next]) return;
    mode = next;
    root.dataset.mode = mode;
    $$('.rail-btn[data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
    $$('[data-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== mode;
    });
    const meta = MODES[mode];
    $('#mode-eyebrow').textContent = 'Der Raum';
    $('#mode-title').textContent = meta.title;
    $('#main').scrollTop = 0;
    if (mode !== 'listen') toggleDrawer(false);
  }

  function toggleDrawer(force) {
    const open = typeof force === 'boolean' ? force : !drawer.classList.contains('open');
    drawer.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function renderUpNext() {
    const host = $('#upnext');
    if (!host) return;
    host.innerHTML = '';
    for (let offset = 1; offset <= 3; offset += 1) {
      const track = TRACKS[(index + offset) % TRACKS.length];
      const row = document.createElement('button');
      row.className = 'upnext-row';
      row.dataset.track = String((index + offset) % TRACKS.length);
      row.innerHTML = `
        <span class="upnext-art">${track.letter}</span>
        <span class="upnext-copy"><strong>${track.title}</strong><small>${track.artist} · ${track.kind}</small></span>
        <span class="upnext-mark">${offset === 1 ? 'NEXT' : `+${offset}`}</span>`;
      host.appendChild(row);
    }

    const queue = $('#drawer-queue');
    if (queue) {
      queue.innerHTML = '';
      for (let offset = 1; offset <= 4; offset += 1) {
        const track = TRACKS[(index + offset) % TRACKS.length];
        const row = document.createElement('div');
        row.className = 'queue-row';
        row.dataset.track = String((index + offset) % TRACKS.length);
        row.innerHTML = `
          <span class="q-art">${track.letter}</span>
          <span><strong>${track.title}</strong><small>${track.artist} · ${track.kind}</small></span>`;
        queue.appendChild(row);
      }
    }
    $('#queue-count').textContent = String(TRACKS.length);
  }

  function renderTrack() {
    const track = current();
    $('#stage-source').textContent = track.source;
    $('#stage-title').textContent = track.title;
    $('#stage-artist').textContent = track.artist;
    $('#stage-album').textContent = track.album;
    $('#stage-kind').textContent = track.kind;
    $('#stage-safe').textContent = track.safe ? 'Stream-sicher' : 'Nicht stream-sicher';
    $('#stage-safe').style.color = track.safe ? 'var(--ok)' : '';
    $('#stage-note').innerHTML = `<strong>Warum das?</strong><span>${track.note}</span>`;
    $('#art-letter').textContent = track.letter;
    stageArt.style.setProperty('--art-a', track.a);
    stageArt.style.setProperty('--art-b', track.b);
    root.style.setProperty('--art-a', track.a);
    root.style.setProperty('--art-b', track.b);

    $('#now-title').textContent = track.title;
    $('#now-artist').textContent = track.artist;
    $('#now-art').textContent = track.letter;
    $('#drawer-art').textContent = track.letter;
    $('#drawer-title').textContent = track.title;
    $('#drawer-artist').textContent = `${track.artist} · ${track.kind}`;
    const playingRow = $('.queue-row.playing');
    if (playingRow) playingRow.dataset.track = String(index);
    $('#now-duration').textContent = fmt(track.duration);
    $('#now-time').textContent = fmt(track.duration * 0.36);
    $('#progress-fill').style.width = '36%';
    renderUpNext();
  }

  function step(direction) {
    index = (index + direction + TRACKS.length) % TRACKS.length;
    setPlaying(true);
    renderTrack();
    toast(`▶ ${current().title} · ${current().artist}`);
  }

  function playTrack(nextIndex) {
    if (!Number.isInteger(nextIndex) || !TRACKS[nextIndex]) return;
    index = nextIndex;
    setPlaying(true);
    renderTrack();
    toast(`▶ ${current().title}`);
  }

  function cycleTheme() {
    themeIndex = (themeIndex + 1) % THEME_CYCLE.length;
    applyTheme(THEME_CYCLE[themeIndex]);
    toast(`Theme: ${THEME_CYCLE[themeIndex]}`);
  }

  function handleAction(action) {
    switch (action) {
      case 'play':
        setPlaying(!playing);
        return;
      case 'next':
        step(1);
        return;
      case 'prev':
        step(-1);
        return;
      case 'drawer':
        toggleDrawer();
        return;
      case 'theme':
        cycleTheme();
        return;
      case 'like':
        toast('♥ In Favoriten – im Prototyp nur angedeutet.');
        return;
      case 'why':
        toast(current().note);
        return;
      case 'queue':
        toggleDrawer(true);
        toast('Im Strom – der laufende Titel bleibt vorn.');
        return;
      case 'search':
        toast('Suche: Strg/Cmd+K ist im Prototyp noch nicht verdrahtet.');
        return;
      case 'full':
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
        return;
      default:
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action], [data-mode], [data-track]');
    if (!target) return;
    if (target.dataset.action) {
      handleAction(target.dataset.action);
      return;
    }
    if (target.dataset.mode) {
      setMode(target.dataset.mode);
      return;
    }
    if (target.dataset.track != null) {
      playTrack(Number(target.dataset.track));
    }
  });

  document.addEventListener('keydown', (event) => {
    const tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space') {
      event.preventDefault();
      setPlaying(!playing);
      return;
    }
    if (event.key === 'q' || event.key === 'Q') {
      toggleDrawer();
      return;
    }
    if (event.key === 't' || event.key === 'T') {
      cycleTheme();
      return;
    }
    if (event.key === 'ArrowRight') {
      step(1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      step(-1);
      return;
    }
    const modes = { 1: 'listen', 2: 'browse', 3: 'build', 4: 'connect' };
    if (modes[event.key]) setMode(modes[event.key]);
  });

  const requested = new URLSearchParams(window.location.search).get('theme');
  applyTheme(THEME_CYCLE.includes(requested) ? requested : 'nacht');
  setMode('listen');
  setPlaying(false);
  renderTrack();
})();
