# Plan: Spotify-Playlists nach CleanMusic übertragen (Version 1.1.0)

Festgelegt am 21.11.2026 mit dem User: **beide Wege** – Link einfügen (öffentliche
Playlists) **und** Datei-Import (private Playlists, exakte Treffer). Die englische
Oberfläche rutscht damit auf 1.2. Vor dem Bauen `AGENTS.md` lesen – die Regeln dort
gelten (vor allem: kein yt-dlp im App-Code, Nutzerdaten nicht anfassen, Release-Tag
nur auf Ansage des Users).

## Was am Ende da ist

- **Bibliothek → „Von Spotify übertragen“** (Knopf neben „Neue Playlist“ in der
  Seitenleiste, `renderer/index.html` Zeile ~84, und in der Bibliotheks-Ansicht).
- Ein Dialog mit zwei Wegen:
  1. **Link einfügen**: `https://open.spotify.com/playlist/<id>` (auch mit `?si=…`,
     `spotify:playlist:<id>`) → **Übertragen**.
  2. **Datei wählen …**: CSV oder JSON (siehe unten). Kurzer Hinweis im Dialog:
     „Private Playlist? Auf exportify.app mit Spotify anmelden, Playlist als CSV
     speichern und hier laden.“
- Fortschritt im Dialog: „42 / 120 gefunden …“, Abbrechen möglich.
- Ergebnis: **neue CleanMusic-Playlist** mit dem Namen der Spotify-Playlist
  (bei Namensgleichheit „Name (2)“). Darunter: „118 von 120 übertragen“ und eine
  aufklappbare Liste der nicht gefundenen Titel mit **Kopieren**.
- Die Titel sind normale Vorschau-Einträge (`previewEntry`, `kind: 'preview'`).
  Mit aktivem Quellen-Plugin und „volle Titel“ spielt CleanMusic sie wie gewohnt
  voll (bestehender Plugin-Abgleich, nichts Neues nötig).

## Weg 1: Link (öffentliche Playlists)

- Hauptprozess, neuer IPC `spotify-playlist-link` (url) → lädt
  `https://open.spotify.com/embed/playlist/<id>` (nur dieser Host, nur `https`,
  `net.fetch` mit 15 s Timeout, Antwort höchstens 5 MB).
- Daraus das JSON im `<script id="__NEXT_DATA__" type="application/json">` lesen.
  Erwartet (bitte am echten Beispiel prüfen, Format kann sich ändern):
  `props.pageProps.state.data.entity` mit `name`/`title` und `trackList`
  (je Titel `title`, `subtitle` = Artists, `duration` in ms, `uri`).
  Robust bleiben: Felder optional lesen, bei unbekanntem Format eine klare
  Meldung („Spotify hat das Format geändert – bitte den Datei-Import nutzen“).
- Die Einbett-Seite zeigt eventuell nur die ersten ~100 Titel → dann im Ergebnis
  ehrlich sagen: „Spotify zeigt über den Link nur 100 Titel – für alle den
  Datei-Import nutzen.“
- **Nicht erlaubt**: die eingeloggte Spotify-Sitzung (`persist:cm-spotify`),
  deren Cookies oder Tokens benutzen; keine weiteren Spotify-Adressen.

## Weg 2: Datei (CSV / JSON)

- IPC `playlist-import-file` → `dialog.showOpenDialog` (Filter `.csv`, `.json`,
  höchstens 10 MB) → liest und parst im Hauptprozess.
- **CSV** (Kopfzeile, Spalten ohne Groß/Klein, Komma oder Semikolon, Anführungszeichen
  mit `""`-Escapes, BOM entfernen). Spaltennamen mindestens:
  - Exportify: `Track Name`, `Artist Name(s)`, `Album Name`, `Duration (ms)`, `ISRC`
  - TuneMyMusic: `Track name`, `Artist name`, `Album`, `ISRC`, `Playlist name`
  - Soundiiz: `title`, `artist`, `album`, `isrc`
  - Artists mit `,` oder `;` getrennt → erster Artist für die Suche, alle für die Anzeige.
  - Playlist-Name: Spalte `Playlist name` oder Dateiname ohne Endung.
- **JSON** aus Spotifys Datenexport (`Playlist1.json`):
  `{ playlists: [{ name, items: [{ track: { trackName, artistName, albumName, trackUri } }] }] }`
  → bei mehreren Playlists eine Auswahl im Dialog (Checkboxen), jede wird eine eigene
  CleanMusic-Playlist.
- Einheitliches Ergebnis beider Wege:
  `{ name, tracks: [{ title, artist, album, durationMs, isrc }], limited: bool, error }`
  (höchstens 2000 Titel, Texte kürzen wie sonst mit `cleanText`).

## Zuordnen (Matching)

- IPC `playlist-match` (Liste von bis zu 50 Titeln pro Aufruf; der Renderer ruft
  stückweise auf, damit Fortschritt und Abbrechen gehen).
- Je Titel:
  1. ISRC vorhanden → `https://api.deezer.com/track/isrc:<ISRC>` (offizielle
     Deezer-API). Treffer mit Vorschau → fertig.
  2. Sonst Deezer-Suche `artist:"…" track:"…"` (`https://api.deezer.com/search?q=…`),
     dann ohne Anführungszeichen; den besten Treffer wählen (gleiche Idee wie
     `bestRequestHit` in `renderer/app.js`: Wörter von Artist/Titel vergleichen,
     Karaoke/Cover/Instrumental abwerten, Dauer ±10 s bevorzugen).
  3. Sonst nicht gefunden.
- Mapping mit dem bestehenden `normalizeDeezer` (main.js), damit die Einträge wie
  Suchtreffer aussehen. Drosseln: höchstens 4 gleichzeitig, ~8 Anfragen/Sekunde
  (Deezer erlaubt 50 pro 5 Sekunden).
- Im Renderer: `previewEntry(track)` → `storable(...)` → neue Playlist über
  `createPlaylist(name)` + `addToPlaylist(id, entries)` (Duplikate fallen dort raus).

## Texte, Doku, Recht

- UI-Texte auf Deutsch, „du“.
- README: neuer Abschnitt „Playlists von Spotify übertragen“ (beide Wege,
  Exportify-Hinweis, Grenze 100 Titel beim Link).
- LEGAL.md: Es werden nur Titelnamen/Artists übernommen (öffentliche Einbett-Seite
  bzw. eigene Exportdatei), keine Musikdateien, kein Login bei Spotify durch
  CleanMusic, keine Tokens aus der eingebetteten Sitzung.
- `WHATS_NEW['1.1.0']` in `renderer/app.js` pflegen, `package.json` auf 1.1.0,
  `AGENTS.md` „Stand“ ergänzen, `docs/PLAN-1.0.md` (Englisch → 1.2).

## Tests

- `node --check` für geänderte Dateien.
- Neuer Smoke-Schritt `SMOKE_PLAYLIST_IMPORT` in `main.js` (nach `SMOKE_ONBOARDING`):
  - CSV-Parser mit einem kleinen Beispiel im Code (Exportify-Kopfzeile, ein Titel mit
    Komma im Namen in Anführungszeichen, Semikolon-Variante, BOM) → richtige Felder.
  - JSON-Parser mit einem Mini-`Playlist1.json`.
  - ISRC-Treffer: `GBDUW0000059` (Daft Punk – One More Time) → Deezer-Treffer.
  - Link-Import einer bekannten öffentlichen Playlist (z. B.
    `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M`) → Name + Titel > 0;
    bei Netzwerkfehler nur melden, nicht abstürzen.
  - Komplettlauf im Renderer: 3 Titel importieren → neue Playlist mit ≥ 2 Einträgen,
    danach wieder löschen.
- Danach `npm.cmd run smoke` komplett: keine Zeile mit `_FAIL`, alle bisherigen
  `SMOKE_`-Zeilen weiter vorhanden.
- Kein Release-Tag pushen – das entscheidet der User.
