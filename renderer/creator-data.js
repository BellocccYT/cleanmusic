'use strict';

/**
 * Cutter mode – categories for video editors.
 *
 * Everything here is meant to be usable in videos:
 *  - NCS: official NoCopyrightSounds playlists on Deezer. NCS releases are
 *    free to use in YouTube/Twitch videos with credit (see usage policy).
 *  - Kevin MacLeod (incompetech.com): the most used background music on
 *    YouTube, CC BY 4.0 – free to use with credit.
 *  - Sound effects (Freesound) and free music (Jamendo) via Openverse,
 *    filtered to CC0 and CC BY.
 */

(function () {
  const INCOMPETECH = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';

  const CLASSICS = {
    lustig: [
      'Fluffing a Duck', 'Monkeys Spinning Monkeys', 'Sneaky Snitch', 'Scheming Weasel faster',
      'Pixel Peeker Polka - faster', 'Spazzmatica Polka', 'Run Amok', 'Merry Go', 'Hitman',
      'Life of Riley', 'Quirky Dog', 'Sneaky Adventure', 'Hyperfun', 'Itty Bitty 8 Bit',
      'Wallpaper', 'Kool Kats', 'Amazing Plan',
    ],
    'gaming-retro': [
      'Pixel Peeker Polka - faster', 'Itty Bitty 8 Bit', 'Hyperfun', 'Pinball Spring',
      'Spazzmatica Polka', 'Sneaky Adventure', 'Sneaky Snitch',
    ],
    chill: [
      'Local Forecast - Elevator', 'Carefree', 'Bossa Antigua', 'Airport Lounge', 'Easy Lemon',
      'Wholesome', 'Daily Beetle', 'Lobby Time', 'Breaktime', 'Cool Vibes', 'Backbay Lounge',
      'Thinking Music', 'Chill Wave',
    ],
    spannung: [
      'Investigations', 'Volatile Reaction', 'Ossuary 6 - Air', 'Dark Fog', 'Ghost Story',
      'Ghost Processional', 'Darkest Child', 'Long Note Four', 'Unnatural Situation', 'The Hive',
      'Night on the Docks - Sax',
    ],
    episch: [
      'Heroic Age', 'Five Armies', 'Impact Prelude', 'Crusade', 'Clash Defiant', 'Rynos Theme',
      'Aftermath', 'Prelude and Action', 'Achilles', 'Killers', 'Movement Proposition', 'Exhilarate',
    ],
    froehlich: [
      'Funkorama', 'Overcast', 'Corncob', 'Gonna Start', 'Thatched Villagers', 'Happy Boy End Theme',
      'Pinball Spring', 'Comic Plodding', 'Rollin at 5', 'Funky Chunk', 'Fretless', 'Kick Shock',
    ],
    emotional: [
      'Sad Trio', 'Lightless Dawn', 'Heartwarming', 'Long Road Ahead', 'At Rest', 'Bittersweet',
      'Dreamer', 'Healing', 'Peaceful Desolation',
    ],
  };

  const classicTrack = (title, category) => ({
    id: `classic:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title,
    artist: 'Kevin MacLeod',
    url: `${INCOMPETECH}${encodeURIComponent(title)}.mp3`,
    category,
  });

  window.CM_CREATOR = {
    tabs: [
      {
        id: 'foryou',
        kind: 'foryou',
        label: 'Für dich',
        icon: 'spark',
        title: 'Für dich',
        info:
          'Vorschläge aus den Kategorien, die du am meisten nutzt – ohne Titel, die du schon gecreditet hast. Alles frei für Videos, Lizenz an jedem Titel.',
        license: null,
        categories: [
          { id: 'mix', label: 'Mix' },
          { id: 'music', label: 'Nur Musik' },
          { id: 'sfx', label: 'Nur Sounds' },
        ],
      },
      {
        id: 'ncs',
        label: 'NCS',
        icon: 'bolt',
        title: 'Beste NCS-Songs',
        info:
          'NoCopyrightSounds – frei für YouTube-, Twitch- und Social-Videos, solange du den Credit angibst. ' +
          'Hier als 30-s-Vorschau, mit Quellen-Plugin als voller Titel.',
        license: 'NCS',
        policy: { label: 'NCS-Nutzungsbedingungen', url: 'https://ncs.io/usage-policy' },
        categories: [
          { id: 'top', label: 'Top 100', playlist: '8934659542' },
          { id: 'trending', label: 'Trending auf YouTube', playlist: '10270036142' },
          { id: 'gaming', label: 'Gaming', playlist: '8892683702' },
          { id: 'phonk', label: 'Phonk', playlist: '13085919743' },
          { id: 'house', label: 'House', playlist: '10270014702' },
          { id: 'future-house', label: 'Future House', playlist: '13085934203' },
          { id: 'dnb', label: 'Drum & Bass', playlist: '10270018322' },
          { id: 'dubstep', label: 'Dubstep', playlist: '10270025202' },
          { id: 'melodic', label: 'Melodic Dubstep', playlist: '13085932143' },
          { id: 'trap', label: 'Trap', playlist: '10270030542' },
          { id: 'pop', label: 'Pop', playlist: '10270010922' },
          { id: 'indie', label: 'Indie Dance', playlist: '13085932563' },
          { id: 'hardstyle', label: 'Hardstyle', playlist: '13085933863' },
          { id: 'drumstep', label: 'Drumstep', playlist: '13085935563' },
          { id: 'glitch', label: 'Glitch Hop', playlist: '13085934123' },
          { id: 'chill', label: 'Chill', playlist: '13087170903' },
          { id: 'feelgood', label: 'Feel Good', playlist: '13087424763' },
          { id: 'classics', label: 'Classics', playlist: '13085923663' },
          { id: 'best-2024', label: 'Best of 2024', playlist: '13085924643' },
          { id: 'best-2023', label: 'Best of 2023', playlist: '13085927343' },
          { id: 'new', label: 'Neu', playlist: '13085931743' },
        ],
      },
      {
        id: 'classics',
        label: 'YouTube-Klassiker',
        icon: 'star',
        title: 'Die meistgenutzten YouTube-Songs',
        info:
          'Kevin MacLeod (incompetech.com) ist der meistgenutzte Komponist in YouTube-Videos. ' +
          'Alle Titel: CC BY 4.0 – kostenlos, auch monetarisiert, mit Credit. Volle Titel.',
        license: 'CC BY 4.0',
        policy: { label: 'Lizenz CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
        categories: [
          { id: 'lustig', label: 'Lustig & Quirky', color: '#ffbf5e' },
          { id: 'froehlich', label: 'Fröhlich & Funky', color: '#35e0c0' },
          { id: 'chill', label: 'Chill & Lounge', color: '#5b8cff' },
          { id: 'spannung', label: 'Spannung & Grusel', color: '#a238ff' },
          { id: 'episch', label: 'Episch & Action', color: '#ff5d6c' },
          { id: 'emotional', label: 'Emotional', color: '#8d99ac' },
          { id: 'gaming-retro', label: 'Gaming & Retro', color: '#35e0c0' },
        ],
        tracks: Object.entries(CLASSICS).flatMap(([category, titles]) =>
          titles.map((title) => classicTrack(title, category))
        ),
      },
      {
        id: 'sfx',
        label: 'Soundeffekte',
        icon: 'wave',
        title: 'Soundeffekte',
        info:
          'Von Freesound, gefiltert auf CC0 (frei) und CC BY (mit Credit). Lizenz steht an jedem Sound.',
        license: null,
        policy: { label: 'Freesound', url: 'https://freesound.org/' },
        search: true,
        categories: [
          { id: 'whoosh', label: 'Whoosh', query: 'whoosh' },
          { id: 'transition', label: 'Transition', query: 'transition swoosh' },
          { id: 'impact', label: 'Impact & Boom', query: 'impact boom' },
          { id: 'riser', label: 'Riser', query: 'riser' },
          { id: 'pop', label: 'Pop', query: 'pop' },
          { id: 'click', label: 'Klick & UI', query: 'click ui' },
          { id: 'notification', label: 'Ding & Notification', query: 'notification ding' },
          { id: 'glitch', label: 'Glitch', query: 'glitch' },
          { id: 'explosion', label: 'Explosion', query: 'explosion' },
          { id: 'applause', label: 'Applaus', query: 'applause' },
          { id: 'laugh', label: 'Lachen', query: 'laugh' },
          { id: 'fail', label: 'Fail', query: 'fail trombone' },
          { id: 'cartoon', label: 'Cartoon', query: 'cartoon boing' },
          { id: 'camera', label: 'Kamera', query: 'camera shutter' },
          { id: 'typing', label: 'Tippen', query: 'keyboard typing' },
          { id: 'heartbeat', label: 'Herzschlag', query: 'heartbeat' },
          { id: 'scifi', label: 'Sci-Fi', query: 'sci-fi' },
          { id: 'ambience', label: 'Atmo', query: 'ambience' },
        ],
      },
      {
        id: 'games',
        label: 'Game-Sounds',
        icon: 'wave',
        title: 'Game-Sounds',
        info:
          'Freesound-Sounds über Openverse, gefiltert auf CC0 und CC BY. Lizenz und Credit stehen an jedem Sound.',
        license: null,
        policy: { label: 'Freesound', url: 'https://freesound.org/' },
        search: true,
        kind: 'sfx',
        categories: [
          { id: 'retro', label: 'Retro & 8-Bit', query: '8-bit retro game sound' },
          { id: 'coin-power-up', label: 'Münze & Power-up', query: 'game coin' },
          { id: 'jump', label: 'Sprung', query: 'video game jump sound' },
          { id: 'level-up', label: 'Level-Up & Sieg', query: 'level up game' },
          { id: 'game-over', label: 'Game Over', query: 'game over sound effect' },
          { id: 'menu-ui', label: 'Menü & UI', query: 'menu ui click' },
          { id: 'arcade', label: 'Arcade', query: 'arcade sound' },
          { id: 'rpg-fantasy', label: 'RPG & Fantasy', query: 'fantasy game magic' },
          { id: 'horror-game', label: 'Horror-Game', query: 'horror video game ambience' },
          { id: 'sci-fi-weapons', label: 'Sci-Fi-Waffen', query: 'sci-fi laser weapon sound' },
          { id: 'racing', label: 'Racing', query: 'racing engine game sound' },
        ],
      },
      {
        id: 'free',
        label: 'Freie Musik',
        icon: 'note',
        title: 'Freie Musik',
        info:
          'Volle Titel von Jamendo & Co., gefiltert auf CC0 und CC BY – mit Credit auch in Videos nutzbar.',
        license: null,
        policy: { label: 'Openverse', url: 'https://openverse.org/' },
        search: true,
        categories: [
          { id: 'cinematic', label: 'Cinematic', query: 'cinematic' },
          { id: 'upbeat', label: 'Upbeat', query: 'upbeat' },
          { id: 'epic', label: 'Episch', query: 'epic' },
          { id: 'inspirational', label: 'Inspirierend', query: 'inspirational' },
          { id: 'relaxing', label: 'Entspannt', query: 'relaxing' },
          { id: 'chill', label: 'Chill', query: 'chill' },
          { id: 'ambient', label: 'Ambient', query: 'ambient' },
          { id: 'piano', label: 'Piano', query: 'piano' },
          { id: 'guitar', label: 'Gitarre', query: 'guitar' },
          { id: 'beats', label: 'Beats', query: 'beat' },
          { id: 'dance', label: 'Dance', query: 'dance' },
          { id: 'electronic', label: 'Electronic', query: 'electronic' },
          { id: 'rock', label: 'Rock', query: 'rock' },
          { id: 'jazz', label: 'Jazz', query: 'jazz' },
          { id: 'adventure', label: 'Abenteuer', query: 'adventure' },
          { id: 'dramatic', label: 'Dramatisch', query: 'dramatic' },
          { id: 'happy', label: 'Happy', query: 'happy' },
          { id: 'sad', label: 'Traurig', query: 'sad' },
          { id: 'summer', label: 'Sommer', query: 'summer' },
          { id: 'lounge', label: 'Lounge', query: 'lounge' },
          { id: 'chiptune', label: 'Chiptune/8-Bit', query: 'chiptune' },
          { id: 'videospiel', label: 'Videospiel', query: 'video game' },
          { id: 'boss-kampf', label: 'Boss-Kampf', query: 'epic battle' },
        ],
      },
      {
        id: 'youtube',
        kind: 'plugin',
        label: 'YouTube',
        icon: 'search',
        title: 'YouTube (über dein Quellen-Plugin)',
        info:
          'Nicht lizenzgeprüft: Viele Titel lösen auf YouTube, TikTok oder Twitch Content-ID-Ansprüche, Stummschaltung oder Sperren aus – auch wenn „No Copyright“ im Titel steht. Kein Download. „Creative Commons“ nutzt YouTubes CC-Filter (Angabe des Uploaders, nicht geprüft).',
        license: null,
        policy: { label: 'So funktioniert Content ID', url: 'https://support.google.com/youtube/answer/2797370' },
        search: true,
        categories: [
          { id: 'gaming', label: 'Gaming-Musik', query: 'gaming music' },
          { id: 'cc', label: 'Creative Commons', query: 'music', cc: true },
          { id: 'phonk', label: 'Phonk', query: 'phonk' },
          { id: 'lofi', label: 'Lo-Fi', query: 'lofi hip hop' },
          { id: 'epic', label: 'Epische Musik', query: 'epic music' },
          { id: 'memes', label: 'Meme-Sounds', query: 'meme sound effects' },
          { id: 'funny', label: 'Lustige Sounds', query: 'funny sound effects' },
          { id: 'nocopyright', label: '„No Copyright“', query: 'no copyright music' },
        ],
      },
    ],
  };
})();
