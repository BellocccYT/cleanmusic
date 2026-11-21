# Plan: CleanMusic 1.4.0 – Songwünsche per Link, KI-Filter, YouTube im Cutter-Modus

Festgelegt am 21.11.2026 mit dem User. Vorher **`AGENTS.md`** lesen – die Regeln
gelten, besonders: **kein YouTube-Lesecode und kein Wort „yt-dlp“ im App-Code**
(`main.js`, `renderer/*`, `preload.js`); alles YouTube-Spezifische gehört ins
Quellen-Plugin (`plugins/ytdlp.js`, nicht im Repository). Downloads bleiben wie sie
sind („Nur Cutting“ + Abo-Downloads) – **YouTube bekommt nirgends einen Download-Knopf.**

Baut auf: Songwünsche 1.0.1 (`player.request`, app.js Abschnitt „Song requests“,
`extras/plugins/streamerbot.js` 1.1.0), Playlist-Import 1.1/1.2 (Spotify-Einbett-Seite,
Plugin-Fähigkeit `playlist`), Cutter-Modus (`renderer/creator-data.js`).

---

## Teil A – `!sr` mit Links (Streamer.bot-Plugin 1.2.0, App 1.4.0)

### Was der User will

Zuschauer schicken `!sr <Link oder Suchtext>`. **Egal welcher Link** – CleanMusic
findet den Song, legt ihn **als Nächstes** in die Warteschlange und speichert ihn
zusätzlich in einer **CleanMusic-Playlist** (Standard „Songwünsche aus dem Chat“).

### Unterstützte Links (App, `songRequest` in app.js + Hilfen in main.js)

| Link | Weg |
| --- | --- |
| `open.spotify.com/track/<id>` (auch `/intl-xx/`, `spotify:track:<id>`) | main.js lädt `https://open.spotify.com/embed/track/<id>` (gleiche Regeln wie beim Playlist-Import: nur dieser Host, 5 MB, 15 s), liest Titel + Artists aus `__NEXT_DATA__` → Abgleich wie beim Import (ISRC falls vorhanden, sonst `spotifyCoreTitle` + Deezer-Suche) |
| `deezer.com/…/track/<id>`, `link.deezer.com/…` (Kurzlink: nur Weiterleitung auf `deezer.com` folgen) | `https://api.deezer.com/track/<id>` → `normalizeDeezer` |
| `music.apple.com/…?i=<id>` bzw. `/song/…/<id>` | `https://itunes.apple.com/lookup?id=<id>&entity=song` → wie Apple-Suchtreffer |
| `youtube.com/watch?v=…`, `youtu.be/…`, `music.youtube.com/watch?v=…`, `youtube.com/shorts/…` | **nur über das Quellen-Plugin**: neue optionale Fähigkeit `lookup(url)` → ein Item wie bei `search()` → `pluginEntry` (voller Titel). Ohne Plugin: Antwort „YouTube-Links gehen gerade nicht.“ |
| alles andere | Antwort „Dieser Link wird nicht unterstützt – schick Titel und Artist.“ |
| kein Link | wie bisher: Suche, bester Treffer (`bestRequestHit`) |

Links nur mit `https`, Hosts per Allowlist, keine anderen Adressen abrufen, keine
Weiterleitungen auf fremde Hosts. Die Prüfung, welcher Link vorliegt, passiert in
main.js (neue Funktion `resolveRequestLink(url)`), der Renderer bekommt ein fertiges
Treffer-Objekt oder einen Grund (`unsupported-link`, `not-found`, `no-source`).

### Position + Playlist

- `player.request(query, { by, source, maxSeconds, position, playlist, blockAi, aiWords })`
  - `position`: `'next'` (Standard, neuer Wunsch kommt **direkt nach dem laufenden
    Titel**, vor älteren Wünschen) oder `'end'` (bisheriges Verhalten).
  - `playlist`: Name (Standard „Songwünsche aus dem Chat“) oder leer = nicht speichern.
    Playlist bei Bedarf mit `createPlaylist` anlegen, Eintrag mit `addToPlaylist`
    (Duplikate fallen dort raus).
- Antwort zusätzlich `{ link: true|false, savedTo: 'Name' }`.

### Streamer.bot-Plugin 1.2.0 (`extras/plugins/streamerbot.js`)

- Neue Einstellungen: **„Wünsche spielen“** (select: „Als Nächstes“ / „Nach den
  anderen Wünschen“), **„In Playlist speichern“** (text, Standard
  „Songwünsche aus dem Chat“, leer = aus), **„KI-Songs ablehnen“** (toggle, Standard an),
  **„KI-Sperrliste“** (text, zusätzliche Wörter/Artists, Komma-getrennt).
- `/request` übergibt die neuen Optionen; Chat-Antworten:
  - Link erkannt + eingereiht: `@user „Titel“ von Artist kommt als Nächstes.`
  - KI erkannt: `@user Das ist als KI-Musik gekennzeichnet und wird nicht gespielt.`
  - Nicht unterstützter Link: siehe Tabelle.
- `extras/plugins/README.md` und ZIP-Anleitung ergänzen; Version `1.2.0`;
  Hinweis „braucht CleanMusic 1.4.0“ (bei älterer App wie bisher 501-Meldung, wenn
  `ctx.player.request` die neuen Felder ignoriert → Version über `ctx` prüfen, falls
  vorhanden, sonst einfach mitschicken).

## Teil B – KI-Filter (App)

Es gibt **keine verlässliche KI-Kennzeichnung** in den öffentlichen Schnittstellen
(geprüft: die Deezer-API hat kein solches Feld). Deshalb eine ehrliche Heuristik:

- Prüfen auf Titel, Artist, Album und – bei Plugin-Treffern – Beschreibung/Tags,
  falls das Plugin sie liefert (neues optionales Item-Feld `aiHint: true` oder
  `description`, siehe Teil C).
- Treffer (Groß/Klein egal, ganze Wörter): `ai`, `ki`, `a.i.`, `ai generated`,
  `ai-generated`, `ai cover`, `ki-generiert`, `suno`, `udio`, `#ai`, `#aimusic`,
  `artificial intelligence`, `künstliche intelligenz` + die KI-Sperrliste des Users.
  Vorsicht bei kurzen Wörtern: `ai`/`ki` nur als eigenes Wort, nicht in „Kaiser“,
  „Kim“, „Ai Otsuka“ (bekannte echte Künstlernamen über eine kleine Ausnahmeliste).
- Bei Treffer und `blockAi`: nicht einreihen, Grund `ai`.
- In der App zusätzlich: Einstellungen → Wiedergabe → **„KI-Songs markieren“**
  (Standard an): Einträge mit KI-Verdacht bekommen in Listen ein kleines Badge
  „KI?“ (Tooltip: „Hinweis im Titel/Artist – kann falsch sein“). Kein automatisches
  Überspringen für eigene Wiedergabe.
- In README/Plugin-Hilfe klar sagen: „Erkennt nur gekennzeichnete Songs.“

## Teil C – YouTube im Cutter-Modus mit Content-ID-Hinweis

### Regeln (in AGENTS.md ergänzen)

YouTube im Cutter-Modus **nur über das Quellen-Plugin, nur anzeigen und abspielen,
nie herunterladen**, jeder Treffer mit sichtbarem Hinweis. Kein Credit-Text, der eine
Lizenz vortäuscht.

### Umsetzung

- `renderer/creator-data.js`: neuer Tab **„YouTube“** (nur sichtbar, wenn ein
  Quellen-Plugin mit `search` aktiv ist), Kategorien als Suchbegriffe, z. B.
  „Gaming-Musik“, „Phonk“, „Lo-Fi“, „Epische Musik“, „Meme-Sounds“, „Lustige Sounds“,
  „No Copyright Music“, plus **„Creative Commons“** (siehe unten). Suche über die
  bestehende Plugin-Suche (`bridge.pluginSearch`).
- Jeder YouTube-Treffer im Cutter: Badge **„⚠ Content ID möglich“**, Tooltip/Infozeile:
  „Nicht lizenzgeprüft. Kann auf YouTube, TikTok oder Twitch Content-ID-Ansprüche,
  Stummschaltung oder Sperren auslösen – Rechte vor der Nutzung selbst klären.“
  **Kein** Download-Knopf, **kein** Kopier-Credit wie bei CC-Titeln
  (stattdessen Knopf „Quelle öffnen“).
- Kategorie **„Creative Commons“**: Plugin-Suche mit Option `{ creativeCommons: true }`
  (Plugin nutzt YouTubes CC-Filter). Badge **„CC BY laut Uploader“** + Hinweis
  „Angabe des Uploaders, nicht geprüft – Content ID trotzdem möglich“. Credit-Knopf
  erlaubt, Text: „„Titel“ von Kanal (YouTube), CC BY laut Uploader: <Link>“.
- Plugin-API (`docs/PLUGIN-API.md`): `search(query, limit, options)` mit optionalem
  `options.creativeCommons`; neue optionale Fähigkeit `lookup(url)`; optionale
  Item-Felder `license` (z. B. `'cc-by'`) und `aiHint`.

### Plugin `plugins/ytdlp.js` 1.3.0

- `lookup(url)`: gleiche Host-Prüfung wie `playlistUrl`, Video-ID mit
  `^[A-Za-z0-9_-]{11}$` prüfen, immer als `https://www.youtube.com/watch?v=<id>`
  weitergeben; `run(['-J', '--no-playlist', '--', url])` → `normalizeVideo` + `aiHint`
  (Titel/Beschreibung/Tags enthalten KI-Wörter) + `license` (yt-dlp-Feld `license`
  enthält „Creative Commons“ → `'cc-by'`).
- `search(query, limit, options)`: bei `options.creativeCommons` die Suche über
  `https://www.youtube.com/results?search_query=<q>&sp=EgIwAQ%3D%3D` (CC-Filter,
  `--flat-playlist -J -I 1:<limit>`), Items mit `license: 'cc-by'`.
- Paket aktualisieren wie in `docs/PLAN-YTMUSIC-IMPORT.md` Abschnitt 3
  (`.bak` von 1.2.0, ZIP neu packen).

## Tests

- `node --check` für alle geänderten Dateien.
- `npm.cmd run smoke` (keine `_FAIL`, alle bisherigen Zeilen da) – neu
  `SMOKE_AI_FILTER`: Wortliste trifft „Song (AI Cover)“, „Suno Mix“, „KI-generiert“,
  aber **nicht** „Kaiser Chiefs“, „Ai Otsuka“, „Pakistan“.
- `npm.cmd run smoke:streamerbot` erweitern: Spotify-Track-Link → eingereiht als
  Nächstes + in Playlist „Songwünsche aus dem Chat“; Deezer-Link; Apple-Link;
  nicht unterstützter Link → Antwort; Titel mit „(AI Cover)“ → abgelehnt;
  `position: 'end'` reiht hinten ein.
- `npm.cmd run smoke:plugin` erweitern: `lookup()` mit einem YouTube-Link,
  `search('lofi', 10, { creativeCommons: true })` → Items mit `license`.
- Kontrolle: `Select-String -Path main.js, preload.js, renderer\*.js, renderer\*.html -Pattern "yt-dlp"` findet nichts.

## Veröffentlichen (nur auf Ansage des Users)

Wie in `docs/PLAN-YTMUSIC-IMPORT.md` Abschnitt 5, mit Version **1.4.0**
(`package.json`, `WHATS_NEW['1.4.0']`, README, AGENTS „Stand“). Streamer.bot-Plugin-ZIP
für die Weitergabe: `release\cleanmusic-plugin-streamerbot-1.2.0.zip`
(`streamerbot.js` + `ANLEITUNG.md`, wie bei 1.1.0).
