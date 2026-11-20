'use strict';

/**
 * Service registry.
 * `url` is the official web player, loaded inside an embedded <webview>.
 * `search` is the official in-service search URL.
 * Nothing here talks to unofficial APIs – CleanMusic only launches
 * the service's own player.
 */

window.CM_SERVICES = [
  {
    id: 'ytmusic',
    name: 'YouTube Music',
    short: 'YT',
    color: '#ff2f45',
    note: 'Google-Konto · Web-Player',
    url: 'https://music.youtube.com',
    search: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    short: 'SP',
    color: '#1ed760',
    note: 'Premium für Web-Wiedergabe',
    url: 'https://open.spotify.com',
    search: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'apple',
    name: 'Apple Music',
    short: 'AM',
    color: '#fa2d48',
    note: 'Abo · MusicKit für volle Titel',
    url: 'https://music.apple.com/de/browse',
    search: (q) => `https://music.apple.com/de/search?term=${encodeURIComponent(q)}`,
    officialPlayback: true,
  },
  {
    id: 'tidal',
    name: 'TIDAL',
    short: 'TD',
    color: '#33e6e6',
    note: 'HiFi-Abo · Web-Player',
    url: 'https://listen.tidal.com',
    search: (q) => `https://listen.tidal.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'deezer',
    name: 'Deezer',
    short: 'DZ',
    color: '#a238ff',
    note: 'Free nur 30-Sekunden-Previews',
    url: 'https://www.deezer.com',
    search: (q) => `https://www.deezer.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'amazon',
    name: 'Amazon Music',
    short: 'AZ',
    color: '#25d1da',
    note: 'Abo · Web-Player',
    url: 'https://music.amazon.de',
    search: (q) => `https://music.amazon.de/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    short: 'SC',
    color: '#ff5500',
    note: 'teils kostenlos',
    url: 'https://soundcloud.com',
    search: (q) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`,
  },
];
