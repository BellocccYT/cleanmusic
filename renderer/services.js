'use strict';

/**
 * Service registry.
 * `url` is the official web player, loaded inside an embedded <webview>.
 * `search` is the official in-service search URL.
 * Nothing here talks to unofficial APIs – CleanMusic only launches
 * the service's own player.
 *
 * `note` is the German short description, `noteEn` its English counterpart
 * (see serviceNote() in renderer/app.js).
 */

window.CM_SERVICES = [
  {
    id: 'ytmusic',
    name: 'YouTube Music',
    short: 'YT',
    color: '#ff2f45',
    note: 'Google-Konto · Web-Player',
    noteEn: 'Google account · web player',
    url: 'https://music.youtube.com',
    search: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
    featured: true,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    short: 'SP',
    color: '#1ed760',
    note: 'Premium für Web-Wiedergabe',
    noteEn: 'Premium for web playback',
    url: 'https://open.spotify.com',
    search: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
    featured: true,
  },
  {
    id: 'apple',
    name: 'Apple Music',
    short: 'AM',
    color: '#fa2d48',
    note: 'Abo · MusicKit für volle Titel',
    noteEn: 'Subscription · MusicKit for full tracks',
    url: 'https://music.apple.com/de/browse',
    search: (q) => `https://music.apple.com/de/search?term=${encodeURIComponent(q)}`,
    officialPlayback: true,
    featured: true,
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    short: 'SC',
    color: '#ff5500',
    note: 'teils kostenlos',
    noteEn: 'partly free',
    url: 'https://soundcloud.com',
    search: (q) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`,
    featured: true,
  },
  {
    id: 'deezer',
    name: 'Deezer',
    short: 'DZ',
    color: '#a238ff',
    note: 'Free nur 30-Sekunden-Previews',
    noteEn: 'Free: 30-second previews only',
    url: 'https://www.deezer.com',
    search: (q) => `https://www.deezer.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'tidal',
    name: 'TIDAL',
    short: 'TD',
    color: '#33e6e6',
    note: 'HiFi-Abo · Web-Player',
    noteEn: 'HiFi subscription · web player',
    url: 'https://listen.tidal.com',
    search: (q) => `https://listen.tidal.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'amazon',
    name: 'Amazon Music',
    short: 'AZ',
    color: '#25d1da',
    note: 'Abo · Web-Player',
    noteEn: 'Subscription · web player',
    url: 'https://music.amazon.de',
    search: (q) => `https://music.amazon.de/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'qobuz',
    name: 'Qobuz',
    short: 'QB',
    color: '#2f7df6',
    note: 'HiFi-Abo · Web-Player',
    noteEn: 'HiFi subscription · web player',
    url: 'https://play.qobuz.com/',
    search: (q) => `https://play.qobuz.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    short: 'BC',
    color: '#1da0c3',
    note: 'Künstler direkt · teils kostenlos',
    noteEn: 'Artists directly · partly free',
    url: 'https://bandcamp.com/',
    search: (q) => `https://bandcamp.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'audius',
    name: 'Audius',
    short: 'AU',
    color: '#cc0fe0',
    note: 'kostenlos · Web-Player',
    noteEn: 'free · web player',
    url: 'https://audius.co/',
    search: (q) => `https://audius.co/search?q=${encodeURIComponent(q)}`,
  },
  // Creator services: subscription libraries for video music and sound
  // effects. Shown under "Creator" and in the cutter mode, not in the
  // music search menus.
  {
    id: 'epidemic',
    name: 'Epidemic Sound',
    short: 'ES',
    color: '#b18cff',
    note: 'Abo · Musik & Soundeffekte für Creator',
    noteEn: 'Subscription · music & sound effects for creators',
    url: 'https://www.epidemicsound.com/music/featured/',
    creator: true,
  },
  {
    id: 'artlist',
    name: 'Artlist',
    short: 'AL',
    color: '#ffd23f',
    note: 'Abo · Musik & Soundeffekte für Creator',
    noteEn: 'Subscription · music & sound effects for creators',
    url: 'https://artlist.io/royalty-free-music',
    creator: true,
  },
];
