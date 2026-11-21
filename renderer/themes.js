'use strict';

/**
 * CleanMusic themes.
 *
 * Every theme fills the same set of colour slots; app.js turns them into CSS
 * variables (plus "r, g, b" triplets for translucent shades). The palettes of
 * the community themes are used under their MIT licences – see
 * THIRD-PARTY-NOTICES.md. Only colour values are taken, no other assets.
 *
 * Slots: bg, bg2 (app background), panel, panel2, panel3 (cards and inputs,
 * getting lighter on dark themes), border, borderSoft, text, muted, muted2,
 * accent, accent2, danger, ok, warn, onAccent (text on accent buttons).
 */
window.CM_THEMES = [
  {
    id: 'nacht',
    name: 'CleanMusic Nacht',
    credit: 'CleanMusic',
    light: false,
    colors: {
      bg: '#080a0e', bg2: '#0b0e14', panel: '#11161f', panel2: '#161c27', panel3: '#1b2230',
      border: '#232c3a', borderSoft: '#1a2230', text: '#e8ecf3', muted: '#8d99ac', muted2: '#5f6a7c',
      accent: '#5b8cff', accent2: '#35e0c0', danger: '#ff5d6c', ok: '#3ddc97', warn: '#ffbf5e', onAccent: '#06121a',
    },
  },
  {
    id: 'tag',
    name: 'CleanMusic Tag',
    credit: 'CleanMusic',
    light: true,
    colors: {
      bg: '#eef1f6', bg2: '#e6eaf1', panel: '#ffffff', panel2: '#f6f8fb', panel3: '#e3e8f0',
      border: '#d0d8e4', borderSoft: '#e1e6ee', text: '#172033', muted: '#536076', muted2: '#7b879a',
      accent: '#2f6bff', accent2: '#0c9b86', danger: '#d93448', ok: '#16925c', warn: '#b8730a', onAccent: '#ffffff',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    credit: 'Catppuccin',
    light: false,
    colors: {
      bg: '#11111b', bg2: '#181825', panel: '#1e1e2e', panel2: '#252536', panel3: '#313244',
      border: '#45475a', borderSoft: '#313244', text: '#cdd6f4', muted: '#a6adc8', muted2: '#7f849c',
      accent: '#89b4fa', accent2: '#94e2d5', danger: '#f38ba8', ok: '#a6e3a1', warn: '#f9e2af', onAccent: '#11111b',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    credit: 'Catppuccin',
    light: true,
    colors: {
      bg: '#e6e9ef', bg2: '#dce0e8', panel: '#eff1f5', panel2: '#f5f6f9', panel3: '#ccd0da',
      border: '#bcc0cc', borderSoft: '#ccd0da', text: '#4c4f69', muted: '#6c6f85', muted2: '#8c8fa1',
      accent: '#1e66f5', accent2: '#179299', danger: '#d20f39', ok: '#40a02b', warn: '#df8e1d', onAccent: '#ffffff',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    credit: 'Dracula Theme',
    light: false,
    colors: {
      bg: '#191a21', bg2: '#1e1f29', panel: '#21222c', panel2: '#282a36', panel3: '#343746',
      border: '#44475a', borderSoft: '#343746', text: '#f8f8f2', muted: '#b6b9cc', muted2: '#6272a4',
      accent: '#bd93f9', accent2: '#ff79c6', danger: '#ff5555', ok: '#50fa7b', warn: '#f1fa8c', onAccent: '#191a21',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    credit: 'Nord (Sven Greb)',
    light: false,
    colors: {
      bg: '#242933', bg2: '#2a303b', panel: '#2e3440', panel2: '#353c4a', panel3: '#3b4252',
      border: '#434c5e', borderSoft: '#3b4252', text: '#eceff4', muted: '#b4bccb', muted2: '#7b88a1',
      accent: '#88c0d0', accent2: '#a3be8c', danger: '#bf616a', ok: '#a3be8c', warn: '#ebcb8b', onAccent: '#2e3440',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    credit: 'Tokyo Night (enkia)',
    light: false,
    colors: {
      bg: '#16161e', bg2: '#1a1b26', panel: '#1f2335', panel2: '#24283b', panel3: '#292e42',
      border: '#3b4261', borderSoft: '#292e42', text: '#c0caf5', muted: '#a9b1d6', muted2: '#565f89',
      accent: '#7aa2f7', accent2: '#bb9af7', danger: '#f7768e', ok: '#9ece6a', warn: '#e0af68', onAccent: '#16161e',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    credit: 'Rosé Pine',
    light: false,
    colors: {
      bg: '#191724', bg2: '#1c1a29', panel: '#1f1d2e', panel2: '#26233a', panel3: '#2d2a42',
      border: '#403d52', borderSoft: '#2d2a42', text: '#e0def4', muted: '#908caa', muted2: '#6e6a86',
      accent: '#c4a7e7', accent2: '#ebbcba', danger: '#eb6f92', ok: '#9ccfd8', warn: '#f6c177', onAccent: '#191724',
    },
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    credit: 'Gruvbox (Pavel Pertsev)',
    light: false,
    colors: {
      bg: '#1d2021', bg2: '#232526', panel: '#282828', panel2: '#32302f', panel3: '#3c3836',
      border: '#504945', borderSoft: '#3c3836', text: '#ebdbb2', muted: '#bdae93', muted2: '#928374',
      accent: '#fabd2f', accent2: '#8ec07c', danger: '#fb4934', ok: '#b8bb26', warn: '#fe8019', onAccent: '#1d2021',
    },
  },
  {
    id: 'everforest',
    name: 'Everforest',
    credit: 'Everforest (Sainnhe Park)',
    light: false,
    colors: {
      bg: '#232a2e', bg2: '#272e33', panel: '#2d353b', panel2: '#343f44', panel3: '#3d484d',
      border: '#475258', borderSoft: '#3d484d', text: '#d3c6aa', muted: '#9da9a0', muted2: '#7a8478',
      accent: '#a7c080', accent2: '#83c092', danger: '#e67e80', ok: '#a7c080', warn: '#dbbc7f', onAccent: '#232a2e',
    },
  },
];
