'use strict';

/**
 * Social names (Weg B, docs/PLAN-SOCIAL.md): random names, the short tag from
 * the account key and the filter for self-chosen names.
 *
 * Pure – no network, no storage. Used by the app (main.js / social-main.js)
 * for instant feedback and by the Cloudflare Worker (server/social) as the
 * binding check. Works as a CommonJS module and as a plain script
 * (window.CMSocialNames). Tested in test/social-names.test.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.CMSocialNames = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN = 3;
  const MAX = 20;

  // Adjective stems – the ending follows the noun's gender (der/die/das):
  // "Leiser Komet", "Leise Wolke", "Leises Echo".
  const ADJECTIVES = (
    'leis laut wild sanft hell klar warm kühl frisch schnell flink ruhig still mutig frei froh heiter munter wach weit ' +
    'tief hoh bunt blau grün rot gelb golden silbern violett tanzend summend singend träumend leuchtend funkelnd ' +
    'glitzernd schwebend fliegend rollend springend lachend pfeifend klingend schwingend strahlend glühend flackernd ' +
    'rauschend wandernd segelnd gleitend hüpfend wirbelnd kreisend steigend wachsend blühend rufend flüsternd groovend ' +
    'swingend rockend trommelnd klimpernd zirpend brummend schnurrend staunend lauschend lächelnd grinsend spielend ' +
    'zaubernd funkend blinkend schimmernd glänzend pulsierend vibrierend hallend tönend sprudelnd plätschernd fließend ' +
    'treibend schaukelnd wippend nickend klatschend jubelnd kosmisch magisch mystisch episch lyrisch rhythmisch ' +
    'melodisch harmonisch akustisch elektrisch digital nordisch tropisch polar solar lunar stellar galaktisch neu jung ' +
    'klein groß riesig winzig rund schlau weise klug cool lässig locker entspannt verträumt verspielt kühn tapfer treu ' +
    'freundlich fröhlich glücklich lustig witzig pfiffig fix zackig flott rasant spritzig quirlig gemütlich kuschelig ' +
    'flauschig weich zart fein prächtig herrlich stark kräftig wendig geschmeidig elegant charmant brillant markant ' +
    'vital sonnig wolkig neblig windig frostig eisig feurig nächtlich sommerlich winterlich herbstlich zeitlos endlos ' +
    'grenzenlos schwerelos lautlos furchtlos sorglos mühelos wolkenlos sternklar glasklar kristallklar federleicht ' +
    'blitzschnell bärenstark quietschfidel putzmunter hellwach tiefblau himmelblau smaragdgrün goldgelb silbergrau ' +
    'nachtblau meerblau mondhell sonnengelb grau dunkl sauber leuchtstark samtig seiden gläsern hölzern luftig ' +
    'wuselig gewitzt beschwingt schwungvoll lebhaft heimlich fern nah sacht behutsam'
  ).split(' ');

  // Nouns with gender: m = der, f = die, n = das.
  const NOUNS = [
    ['m', 'Komet Bass Beat Mond Stern Planet Meteor Nebel Wind Regen Donner Blitz Funke Klang Ton Akkord Rhythmus Groove ' +
      'Song Chor Kanon Walzer Tango Samba Jazz Blues Funk Rock Reggae Swing Remix Loop Synth Verstärker Lautsprecher ' +
      'Kopfhörer Plattenspieler Regler Fader Mixer Sampler Takt Refrain Vers Hall Pegel Puls Herzschlag Ozean See Fluss ' +
      'Bach Wasserfall Gipfel Berg Hügel Wald Baum Ahorn Kaktus Kristall Diamant Saphir Rubin Opal Smaragd Bernstein ' +
      'Panda Otter Biber Igel Fuchs Luchs Dachs Hase Pinguin Delfin Wal Kolibri Papagei Pfau Flamingo Tukan Kranich ' +
      'Reiher Spatz Specht Rabe Uhu Falke Koala Lemur Gecko Leguan Drache Phönix Yeti Roboter Pirat Zauberer Träumer ' +
      'Tänzer Sänger Trommler Geiger Pianist Gitarrist Bassist Pilot Kapitän Astronaut Entdecker Wanderer Nomade ' +
      'Kobold Wichtel Satellit Asteroid Quasar Pulsar Polarstern Sonnenstrahl Regenbogen Wirbel Strudel Vulkan ' +
      'Gletscher Eisberg Schneemann Keks Muffin Kakao Espresso Toast Pudding Apfel Pfirsich Kürbis Ingwer Zimt Honig'],
    ['f', 'Wolke Welle Melodie Harmonie Stimme Gitarre Geige Trommel Flöte Harfe Orgel Trompete Posaune Tuba Oboe ' +
      'Klarinette Mandoline Ukulele Zither Laute Pauke Rassel Glocke Schallplatte Kassette Hymne Ballade Sonate ' +
      'Symphonie Oper Arie Note Bühne Rakete Galaxie Nova Supernova Sternschnuppe Milchstraße Aurora Dämmerung Brise ' +
      'Flut Quelle Lagune Insel Düne Oase Prärie Tundra Blume Rose Tulpe Lilie Orchidee Palme Birke Linde Tanne Möwe ' +
      'Eule Lerche Amsel Meise Taube Libelle Biene Hummel Grille Katze Robbe Qualle Schildkröte Krabbe Muschel Perle ' +
      'Feder Kerze Laterne Lampe Spirale Brücke Karawane Mission Idee Fantasie Legende Fabel Odyssee Reise Zeitreise ' +
      'Brezel Waffel Torte Mango Banane Kirsche Beere Melone Limette Zitrone Olive Bohne Nudel Pizza Tasse'],
    ['n', 'Echo Lied Solo Duett Trio Quartett Orchester Konzert Album Mixtape Intro Outro Finale Tempo Sample Signal ' +
      'Radio Mikrofon Klavier Piano Cello Banjo Saxophon Xylophon Akkordeon Tamburin Horn Metronom Studio Festival ' +
      'Feuerwerk Licht Glühwürmchen Polarlicht Nordlicht Sternbild Universum Raumschiff Ufo Prisma Spektrum Mosaik ' +
      'Origami Puzzle Rätsel Wunder Abenteuer Märchen Gewitter Meer Delta Atoll Tal Feld Blatt Moos Kleeblatt ' +
      'Gänseblümchen Eichhörnchen Kaninchen Faultier Erdmännchen Zebra Känguru Lama Alpaka Nashorn Nilpferd ' +
      'Chamäleon Seepferdchen Einhorn Pony Fohlen Kätzchen Rentier Gnu Okapi Schnabeltier Croissant Bonbon Popcorn ' +
      'Marzipan Müsli Plätzchen'],
  ].flatMap(([gender, words]) => words.split(' ').map((word) => [word, gender]));

  const ENDING = { m: 'er', f: 'e', n: 'es' };
  // Numbers that are used as extremist codes never appear in random names.
  const SKIP_NUMBERS = new Set([14, 18, 28, 74, 88]);
  const RANDOM_MAX_LENGTH = 30;

  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // Substring blocklist on the normalised "skeleton" (letters only, leet mapped).
  const BLOCK_ANY = [
    // EN
    'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'faggot', 'nigger', 'nigga', 'retard', 'rapist', 'porn',
    'pedo', 'paedo', 'pedophil', 'cocksuck', 'motherf', 'dickhead', 'jerkoff', 'wanker', 'blowjob', 'handjob',
    'dildo', 'penis', 'vagina', 'boobs',
    // DE
    'arschloch', 'arschgeige', 'arschgesicht', 'fotze', 'ficken', 'ficker', 'fick', 'wichser', 'wixer', 'wixxer',
    'wichsen', 'hurensohn', 'hure', 'schlampe', 'nutte', 'missgeburt', 'spasti', 'mongo', 'schwuchtel', 'kanake',
    'neger', 'zigeuner', 'judensau', 'kinderficker', 'vergewaltig', 'titten', 'moese', 'sperma', 'porno', 'puff',
    // NS
    'hitler', 'nazi', 'nsdap', 'siegheil', 'heilhitler', 'whitepower', 'whitepride', 'aryan', 'arier', 'holocaust',
    'auschwitz', 'swastika', 'hakenkreuz', 'waffenss', 'combat', 'bloodandhonour', 'bloodhonour', 'reichsbuerger',
    'endsieg', 'fuehrer', 'judenfrei', 'ziklon', 'zyklon',
    // roles – nobody may pose as the team
    'admin', 'moderator', 'cleanmusic', 'support', 'offiziell', 'official', 'kundendienst', 'helpdesk', 'sysop',
  ];
  // Whole-word blocklist (short words that hide inside innocent words).
  const BLOCK_WORD = [
    'ass', 'arsch', 'anal', 'cum', 'dick', 'cock', 'tits', 'hoe', 'fag', 'sex', 'sexy', 'hh', 'ss', 'kkk', 'nsu',
    'kz', 'mod', 'mods', 'staff', 'system', 'root', 'owner', 'team', 'service',
  ];
  // Innocent words that contain a blocked substring (removed before matching).
  const ALLOW = [
    'badminton', 'ignazio', 'nazion', 'nazar', 'mongol', 'puffin', 'puffer', 'kombat', 'scombat', 'shitake',
    'supportiv', 'hurenkind',
  ];

  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'i' };
  // Look-alike letters from other scripts (only for matching the blocklist).
  const CONFUSABLE = {
    а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ѕ: 's', к: 'k', м: 'm', н: 'h', т: 't', в: 'b',
    α: 'a', ε: 'e', ο: 'o', ρ: 'p', ν: 'v', ι: 'i', κ: 'k', τ: 't', υ: 'u', χ: 'x', ß: 'ss',
  };
  const GERMAN = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

  function pick(list, randomInt) {
    return list[randomInt(list.length)];
  }

  function defaultRandomInt(max) {
    const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (cryptoApi && cryptoApi.getRandomValues) {
      const value = cryptoApi.getRandomValues(new Uint32Array(1))[0];
      return value % max;
    }
    return Math.floor(Math.random() * max);
  }

  /** "Leiser Komet 42" – adjective + noun + number (1–99 without code numbers). */
  function randomName(randomInt = defaultRandomInt) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const [noun, gender] = pick(NOUNS, randomInt);
      const adjective = pick(ADJECTIVES, randomInt);
      let number = 1 + randomInt(99);
      if (SKIP_NUMBERS.has(number)) number += 1;
      const word = adjective.charAt(0).toUpperCase() + adjective.slice(1) + ENDING[gender];
      const name = `${word} ${noun} ${number}`;
      if (name.length <= RANDOM_MAX_LENGTH && !blockedReason(name)) return name;
    }
    return 'Leiser Komet 42';
  }

  function combinations() {
    return ADJECTIVES.length * NOUNS.length * (99 - SKIP_NUMBERS.size);
  }

  /** Account id (24 Crockford base32 characters) from a SHA-256 digest of the public key. */
  function accountIdFromDigest(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bits = 0;
    let value = 0;
    let out = '';
    for (let index = 0; index < 15 && index < data.length; index += 1) {
      value = (value << 8) | data[index];
      bits += 8;
      while (bits >= 5) {
        out += CROCKFORD[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
      value &= 0xff;
    }
    return out;
  }

  function validId(id) {
    return /^[0-9A-HJKMNP-TV-Z]{24}$/.test(String(id || ''));
  }

  /** The short tag next to every name ("K7Q2") – names are not unique, the tag is hard to fake. */
  function tagOf(id) {
    return validId(id) ? String(id).slice(0, 4) : '????';
  }

  function display(name, id) {
    return `${String(name || '')} · ${tagOf(id)}`;
  }

  function stripMarks(text) {
    return text.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
  }

  /** Letters-only skeleton for the blocklist: NFKC, lower case, umlauts, accents, look-alikes, leetspeak. */
  function skeletons(input) {
    let text = String(input || '').normalize('NFKC').toLowerCase();
    text = text.replace(/[äöüß]/g, (char) => GERMAN[char]);
    text = stripMarks(text);
    text = Array.from(text).map((char) => CONFUSABLE[char] || LEET[char] || char).join('');
    const words = text.split(/[^\p{L}]+/u).filter(Boolean);
    let joined = words.join('');
    ALLOW.forEach((word) => {
      joined = joined.split(word).join('');
    });
    // "fuuuuck" → "fuck": runs of three or more letters count once.
    const collapsed = joined.replace(/(\p{L})\1{2,}/gu, '$1');
    return { words, joined, collapsed };
  }

  function digitCodes(input) {
    const text = String(input || '').normalize('NFKC');
    const runs = text.match(/\d+/g) || [];
    const all = runs.join('');
    if (runs.some((run) => run === '88' || run.includes('1488') || run.includes('8814'))) return true;
    if (all.includes('1488') || all.includes('8814')) return true;
    return /(^|[^\p{L}])c\s*[-_.]?\s*18(?!\d)/iu.test(text);
  }

  /** Why a text may not be shown as a name (blocklist only), or '' if it is fine. */
  function blockedReason(input) {
    if (digitCodes(input)) return 'Dieser Name enthält einen Code, der nicht erlaubt ist.';
    const { words, joined, collapsed } = skeletons(input);
    const hit = BLOCK_ANY.find((word) => joined.includes(word) || collapsed.includes(word));
    if (hit) return 'Dieser Name ist nicht erlaubt.';
    if (words.some((word) => BLOCK_WORD.includes(word)) || BLOCK_WORD.includes(joined) || BLOCK_WORD.includes(collapsed)) {
      return 'Dieser Name ist nicht erlaubt.';
    }
    return '';
  }

  function scriptsOf(text) {
    const scripts = new Set();
    for (const char of text) {
      if (/\p{Script=Latin}/u.test(char)) scripts.add('latin');
      else if (/\p{Script=Cyrillic}/u.test(char)) scripts.add('cyrillic');
      else if (/\p{Script=Greek}/u.test(char)) scripts.add('greek');
    }
    return scripts;
  }

  /**
   * Check a self-chosen name. Returns { ok: true, name } with the cleaned name
   * or { ok: false, reason } with a German message for the UI.
   */
  function checkName(input) {
    const raw = String(input == null ? '' : input);
    if (/[\u0000-\u001f\u007f-\u009f­؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/u.test(raw)) {
      return { ok: false, reason: 'Unsichtbare Zeichen sind nicht erlaubt.' };
    }
    const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (/\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(name)) return { ok: false, reason: 'Emojis sind im Namen nicht erlaubt.' };
    const length = Array.from(name).length;
    if (length < MIN) return { ok: false, reason: `Mindestens ${MIN} Zeichen.` };
    if (length > MAX) return { ok: false, reason: `Höchstens ${MAX} Zeichen.` };
    if (!/^[\p{L}\p{M}\p{Nd} ._-]+$/u.test(name)) {
      return { ok: false, reason: 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen und . _ -' };
    }
    if (/\p{M}{2,}/u.test(name)) return { ok: false, reason: 'Zu viele Zeichen übereinander.' };
    if ((name.match(/\p{L}/gu) || []).length < 2) return { ok: false, reason: 'Der Name braucht mindestens zwei Buchstaben.' };
    if (/www|https?|\p{L}\.\p{L}{2,}|[._-]{3,}/iu.test(name)) return { ok: false, reason: 'Links und Adressen sind im Namen nicht erlaubt.' };
    if (scriptsOf(name).size > 1) return { ok: false, reason: 'Bitte keine Schriften mischen (z. B. lateinisch und kyrillisch).' };
    const blocked = blockedReason(name);
    if (blocked) return { ok: false, reason: blocked };
    return { ok: true, name };
  }

  return {
    MIN,
    MAX,
    ADJECTIVES,
    NOUNS,
    SKIP_NUMBERS: Array.from(SKIP_NUMBERS),
    randomName,
    combinations,
    accountIdFromDigest,
    validId,
    tagOf,
    display,
    blockedReason,
    checkName,
  };
});
