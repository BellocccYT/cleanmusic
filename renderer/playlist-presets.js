'use strict';

/**
 * Pre-made playlists ("Vorlagen").
 *
 * Every preset exists twice:
 *  - safe:   only free licences (NCS, CC BY, CC0/Public Domain) – safe for
 *            streams and videos, as long as the credit is kept.
 *  - normal: the regular catalogue (Apple Music / Deezer previews), with the
 *            same mood but no licence guarantee.
 *
 * The renderer builds a real, editable playlist from these rules, so a
 * template never replaces the user's own playlists and can be refreshed.
 */

(function () {
  const PRESETS = [
    {
      id: 'gaming',
      title: 'Gaming & Retro',
      subtitle: 'Pixel, Arcade, Let’s Play',
      icon: 'bolt',
      color: '#35e0c0',
      description: 'Schnelle Beats, 8-Bit-Flair und Energie für Gameplay, Montagen und Reaction-Clips.',
      safe: { classics: 'gaming-retro', ncs: 'gaming' },
      normal: { query: 'gaming music' },
    },
    {
      id: 'chill',
      title: 'Chill & Lounge',
      subtitle: 'Ruhig im Hintergrund',
      icon: 'wave',
      color: '#5b8cff',
      description: 'Entspannte Beats und Lounge-Sounds für Talk, Vlog und lange Streams.',
      safe: { classics: 'chill', ncs: 'chill' },
      normal: { query: 'chill lounge music' },
    },
    {
      id: 'epic',
      title: 'Episch & Action',
      subtitle: 'Trailer, Kino, große Momente',
      icon: 'star',
      color: '#ff5d6c',
      description: 'Orchestraler Druck und treibende Themes für Trailer, Highlights und Cinematics.',
      safe: { classics: 'episch', ncs: 'melodic' },
      normal: { query: 'epic orchestral music' },
    },
    {
      id: 'happy',
      title: 'Fröhlich & Funky',
      subtitle: 'Gute Laune, schnelle Schnitte',
      icon: 'spark',
      color: '#ffbf5e',
      description: 'Funk, Pop und quirlige Melodien für Comedy, Tutorials und Werbeclips.',
      safe: { classics: 'froehlich', ncs: 'feelgood' },
      normal: { query: 'happy upbeat pop' },
    },
    {
      id: 'dark',
      title: 'Spannung & Grusel',
      subtitle: 'True Crime, Horror, Mystery',
      icon: 'wave',
      color: '#a238ff',
      description: 'Dunkle Flächen und subtiler Druck für Storytelling, True Crime und Grusel.',
      safe: { classics: 'spannung', ncs: 'phonk' },
      normal: { query: 'dark cinematic music' },
    },
    {
      id: 'emotional',
      title: 'Emotional & Piano',
      subtitle: 'Leise Töne, große Gefühle',
      icon: 'heart',
      color: '#8d99ac',
      description: 'Piano und ruhige Streicher für Rückblicke, Abschiede und persönliche Geschichten.',
      safe: { classics: 'emotional', ncs: 'indie' },
      normal: { query: 'emotional piano music' },
    },
    {
      id: 'focus',
      title: 'Fokus & Konzentration',
      subtitle: 'Arbeiten, Lernen, Coden',
      icon: 'note',
      color: '#5b8cff',
      description: 'Unaufdringliche Musik ohne große Refrains – für Deep Work und Lern-Sessions.',
      safe: { classics: 'chill', openverse: 'ambient' },
      normal: { query: 'focus study music' },
    },
    {
      id: 'workout',
      title: 'Workout & Energy',
      subtitle: 'Training, Laufen, Push',
      icon: 'bolt',
      color: '#ff7a45',
      description: 'House, Drum & Bass und harte Beats mit konstantem Tempo für Training und Sport.',
      safe: { ncs: ['dnb', 'house'], openverse: 'dance' },
      normal: { query: 'workout music' },
    },
  ];

  window.CM_PLAYLIST_PRESETS = {
    presets: PRESETS,
    limit: 40,
  };
})();
