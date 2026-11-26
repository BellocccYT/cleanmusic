# Plugin-API (v1, v2 und v3)

CleanMusic lädt Plugins mit `apiVersion: 1`, `2` und `3`. Jede Version erweitert die
vorige: v1- und v2-Plugins laufen unverändert weiter.

## v1: Grundlagen und Quellen

Ein Plugin ist **eine** CommonJS-Datei. Der Dateiname (ohne `.js`) ist die
Plugin-ID (`a-z`, `0-9`, `-`, `_`). Das Plugin läuft im Electron-Hauptprozess
mit vollen Node-Rechten und wird erst geladen, wenn es aktiviert ist.

```js
module.exports = {
  apiVersion: 1,                       // Pflicht
  name: 'Meine Quelle',
  version: '1.0.0',
  description: 'Was das Plugin tut.',
  help: 'Einrichtungshinweis (wird angezeigt, wenn aktiv).',
  notice: 'Rechtlicher Hinweis (wird hervorgehoben angezeigt).',
  source: { id: 'meinequelle', label: 'Meine Quelle' }, // Badge an Titeln
  links: [{ label: 'Doku', url: 'https://…' }],
  actions: [{ id: 'refresh', label: 'Erneut prüfen', when: null }],

  async setup(ctx) {},                 // einmal beim Laden
  dispose() {},                        // beim Deaktivieren

  async status(refresh) {              // Plugin-Karte + „bereit?“
    return { ready: true, text: 'Bereit', detail: '', flags: {} };
  },
  async runAction(actionId) { return { message: 'Erledigt' }; },

  // Fähigkeiten – alle optional:
  async search(query) { return [/* Item */]; },
  async playlist(url) { return { name: 'Meine Playlist', items: [/* Item */] }; },
  async resolve(refId, force) { return { refId, url: 'https://…', duration: 0 }; },
  async match({ title, artist, album, duration, exclude }, force) { return { refId, url: 'https://…' }; },
  async related(refId, limit) { return [/* Item */]; },
};
```

**Item:** `{ id, title, artist, duration, artwork, link }` – `id` ist die
Plugin-eigene Referenz (`refId`), `artwork` muss `https://` sein.

**Stream:** `{ refId, url, duration, title, artist, artwork }` – `url` muss
`http(s)://` sein und direkt im `<audio>`-Element abspielbar.

Optional für schwierige Quellen (ab CleanMusic 1.17):

- `headers`: Objekt mit Request-Headern (z. B. `Referer`, `User-Agent`). CleanMusic
  setzt sie ausschließlich für genau diese Stream-URL (und ihre Alternates), weil
  `<audio>` selbst keine Header setzen kann.
- `alternates`: bis zu drei weitere direkte URLs, die bei einem Abspielfehler
  nacheinander probiert werden (z. B. ein anderes Audioformat).
- `expires`: Ablaufzeit in Millisekunden (Unix-Zeit), damit Header rechtzeitig
  verworfen werden.
- `format`: kurze Beschreibung für Diagnose/Anzeige, z. B. `"m4a · aac · 128 kbps"`.

Scheitert ein voller Titel trotz Alternates und Neuauflösung, spielt CleanMusic
automatisch die passende 30-Sekunden-Vorschau aus dem Katalog, statt die
Warteschlange anzuhalten.

**Stumme Treffer (ab 1.27.0):** Spielt ein über `match` gefundener Titel nur digitale
Stille (z. B. ein Re-Upload, dessen Ton wegen eines Urheberrechtsanspruchs
stummgeschaltet ist), merkt sich CleanMusic dessen `refId` und fragt erneut. `match`
bekommt dann `exclude`: ein Array mit bis zu 100 `refId`s, die übersprungen werden
sollen. Ältere Plugins ignorieren das Feld; liefern sie trotzdem eine ausgeschlossene
`refId`, spielt CleanMusic die Vorschau.

**`ctx`** (an `setup`):

| Feld | Zweck |
| --- | --- |
| `apiVersion`, `appVersion`, `platform` | Infos |
| `userAgent` | der User-Agent, mit dem CleanMusic Medien lädt |
| `fetch(url, options)` | Chromiums Netzwerk-Stack (wie das `<audio>`-Element) |
| `config.get()` / `config.set(patch)` | eigene, dauerhafte Plugin-Einstellungen |
| `pickFile({ title, filters })` | Datei-Dialog, liefert Pfad oder `null` |
| `log(...args)` | Ausgabe nur im Dev-/Smoke-Modus |

`actions[].when` blendet eine Aktion nur ein, wenn `status().flags[when]`
wahr ist. Alle Rückgaben werden von CleanMusic gekürzt und auf gültige URLs
geprüft.

### Download nur für Creative Commons, Player-Zustand (CleanMusic 1.5.0+)

- `download(refId, { dir })` (optional): lädt einen Titel als `.m4a` nach `dir` und gibt
  `{ file, title, artist, license, link }` zurück. **Nur** erlaubt, wenn die Quelle das
  einzelne Video als Creative Commons ausweist – das Plugin muss das pro Video prüfen und
  sonst einen Fehler werfen. CleanMusic bietet den Download nur bei Items mit
  `license: 'cc-by'` im Modus „Nur Cutting“ an, prüft `license` und den Zielordner noch
  einmal und schreibt die Credit-.txt.
- `player.state()` / `onEvent` enthalten zusätzlich `lyric` (`{ line, next }` bei
  eingeschalteten Songtexten, sonst `null`) und `upNext` (`[{ title, artist, by }]`,
  die nächsten bis zu 10 Titel; `by` = Name bei Songwünschen).

### Suche mit Optionen, Link-Lookup, Hinweise (CleanMusic 1.4.0+)

- `search(query, options)` bekommt als zweiten Parameter `{ limit, creativeCommons }`.
  Bei `creativeCommons: true` (Cutter-Modus, Kategorie „Creative Commons“) nur Treffer
  liefern, die die Quelle als Creative Commons ausweist, und an jedem Item
  `license: 'cc-by'` setzen. Ältere Plugins ignorieren den Parameter – ohne
  `license` zeigt CleanMusic dann nur den Content-ID-Hinweis.
- `lookup(url)` (optional): ein einzelnes Item zu einem Link (für Songwünsche per Link).
  Link selbst prüfen, bei fremden Links einen verständlichen Fehler werfen.
- Optionale Item-Felder: `aiHint: true` (Quelle/Uploader kennzeichnet KI-Musik),
  `license: 'cc-by'`.
- `await player.request(query, { by, source, maxSeconds, position, playlist, blockAi, aiWords })`:
  `query` darf ein Link sein (Spotify, Deezer, Apple Music; YouTube über `lookup`).
  `position`: `'next'` (Standard) oder `'end'`; `playlist`: Name der CleanMusic-Playlist,
  in der der Wunsch zusätzlich landet; `blockAi` + `aiWords` (Komma-Liste): KI-Filter.
  Neue Gründe: `ai`, `unsupported-link`, `no-lookup`. Antwort zusätzlich `{ link, savedTo }`.
- Bis zu 24 Einstellungsfelder pro Plugin (vorher 12).

### Playlist-Import (CleanMusic 1.2.0+)

`playlist(url)` ist eine optionale Fähigkeit. Sie wird für Playlist-Links angeboten
und liefert die Playlist mit Items in derselben Form wie `search()` zurück:

```js
async playlist(url) {
  // URL prüfen; bei fremden oder ungültigen Links einen verständlichen Fehler werfen.
  return { name: 'Meine Playlist', items: [{ id, title, artist, duration, artwork, link }] };
}
```

CleanMusic begrenzt den Namen auf 100 Zeichen und die Rückgabe auf 2000 Items.
Der Link selbst wird vom Plugin geprüft; CleanMusic kennt keine quellenspezifischen
Details und importiert die Items als Titel des Plugins.

## v2: Ereignisse, Player-Steuerung, Einstellungsfelder

Mit `apiVersion: 2` kommen dazu:

```js
module.exports = {
  apiVersion: 2,
  name: 'Mein Overlay',

  // Felder, die CleanMusic in der Plugin-Karte anzeigt und speichert.
  settings: [
    { id: 'port', type: 'number', label: 'Port', default: 4787, min: 1024, max: 65535 },
    { id: 'style', type: 'select', label: 'Stil', default: 'card',
      options: [{ value: 'card', label: 'Karte' }, { value: 'bar', label: 'Leiste' }] },
    { id: 'files', type: 'toggle', label: 'Textdateien schreiben', default: false, help: 'Kurzer Hinweis' },
    { id: 'folder', type: 'folder', label: 'Ordner', default: '' },
    { id: 'name', type: 'text', label: 'Name', default: '', placeholder: 'optional' },
    { id: 'secret', type: 'password', label: 'Passwort', default: '' },   // als Punkte angezeigt
  ],
  async onSettings(values) {},         // nach jeder Änderung, values = alle Felder

  // Player-Ereignisse: 'nowplaying' (anderer Titel), 'volume', 'state' (jede Änderung),
  // 'visualizer' (Live-Spektrum, nur wenn das Plugin `visualizer: true` setzt).
  onEvent(type, player) {},
};
```

**Player-Zustand** (`player` in `onEvent` und `ctx.player.state()`):

```js
{
  track: { id, title, artist, album, source, kind, artwork, link, license, colors: ['#rrggbb', '#rrggbb'] } | null,
  playing, position, duration, live, // position in Sekunden, Stand von `at`
  volume, muted,                      // volume 0–1,5 (Regler-Wert, 1 = 100 %)
  at,                                 // Zeitstempel (ms) der Meldung
  visualizer: { spectrum: [0–255, …], level: 0–1, at }, // nur mit `visualizer: true`
}
```

`colors` sind die zwei Akzentfarben aus dem Cover (leer ohne Cover). Läuft ein
Titel, kann ein Plugin die Position mit `position + (Date.now() - at) / 1000`
hochrechnen.

**Zusätzliche `ctx`-Felder in v2:**

| Feld | Zweck |
| --- | --- |
| `settings.get()` | aktuelle Werte der `settings`-Felder (mit Standardwerten) |
| `player.state()` | aktueller Player-Zustand (siehe oben) |
| `player.play()`, `pause()`, `toggle()`, `next()`, `previous()` | Wiedergabe steuern |
| `player.setVolume(level)`, `player.setMuted(bool)` | Lautstärke (0–1, mit Boost bis 1,5) |
| `await player.request(query, { by, source, maxSeconds })` | **ab CleanMusic 1.0.1:** Songwunsch suchen und einreihen. `source`: `'auto'` (volle Titel vom Quellen-Plugin, sonst Vorschau), `'full'`, `'preview'`. Antwort `{ ok, track, position, playingNow }` oder `{ ok: false, reason }` mit `not-found`, `duplicate`, `too-long`, `no-source`, `timeout` |
| `await player.requests()` | offene Songwünsche: `[{ by, title, artist, source, preview, position }]` |
| `await player.removeRequest(by)` | letzten offenen Wunsch dieser Person entfernen: `{ ok, track }` |
| `copyText(text)` | in die Zwischenablage |
| `openExternal(url)` | `http(s)`-Link im Standardbrowser öffnen |
| `openPath(dir)` | Ordner im Explorer öffnen (nur Ordner) |
| `notify(text)` | kurze Meldung in CleanMusic anzeigen |
| `refresh()` | Plugin-Karte neu laden (z. B. nach Statuswechsel) |
| `dataDir` | eigener Datenordner (`%APPDATA%\CleanMusic\plugin-data\<id>`, bei Bedarf selbst anlegen) |
| `getPath(name)` | `documents`, `music`, `pictures`, `videos`, `downloads`, `temp` |

Einstellungen werden schon während `setup()` geliefert. Fehler in `onEvent`
werden abgefangen und stören die Wiedergabe nie.

### Live-Spektrum für Overlays (CleanMusic 1.15.0+)

Ein Plugin, das `visualizer: true` exportiert, bekommt zusätzlich etwa 25-mal
pro Sekunde `onEvent('visualizer', player)`. In `player.visualizer` steht dann:

```js
{
  spectrum: [0–255, …], // 32 logarithmisch verteilte Bänder, 30 Hz – 16 kHz
  level: 0–1,           // Bass-Pegel für Puls-/Beat-Effekte
  at,                   // Zeitstempel (ms) dieser Messung
}
```

CleanMusic analysiert dafür weiterhin nur den Ton, der ohnehin läuft
(`captureStream()`, keine Umleitung); der Visualizer muss dafür nicht sichtbar
sein. Die Daten fließen nur, solange mindestens ein aktives Plugin
`visualizer: true` setzt. Ein Overlay-Server kann sie per Server-Sent Events an
OBS weiterreichen; `extras/plugins/obs-visualizer.js` ist das vollständige
Beispiel.

### Charts für die Startseite

```js
chartsLabel: 'YouTube Top 100',          // Name des Reiters (optional)
async charts(limit) { return [/* Item */]; },
```

Hat ein aktives Plugin `charts()`, bekommt *Trending & Neuheiten* auf der
Startseite einen eigenen Reiter. Die Items werden wie Suchtreffer behandelt
(abspielen über `resolve`). `charts` funktioniert auch mit `apiVersion: 1`.

## v3: Manifest und Berechtigungen (CleanMusic 1.25.0+)

Ein v3-Plugin beginnt mit einem **Manifest-Kopf**. CleanMusic liest ihn, **ohne das
Plugin auszuführen**, und zeigt die Berechtigungen vor dem Aktivieren an
(Plugin-Karte und Aktivierungs-Dialog):

```js
/* cleanmusic-plugin
{
  "apiVersion": 3,
  "name": "Mein Plugin",
  "version": "1.0.0",
  "description": "Was es tut – in einem Satz.",
  "permissions": ["player", "network:api.example.com", "ui:settings"]
}
*/
'use strict';
module.exports = { apiVersion: 3, name: 'Mein Plugin', /* … */ };
```

- Der Kopf muss in den ersten 8 KB der Datei stehen und gültiges JSON mit
  `"apiVersion": 3` enthalten. Ein fehlerhafter Kopf blockiert das Laden – es gibt
  **keinen** stillen Rückfall auf volle Rechte.
- `module.exports.apiVersion` darf `2` bleiben, wenn das Plugin auch mit älteren
  CleanMusic-Versionen laufen soll (die ignorieren den Kommentar). `apiVersion: 3` im
  Modul verlangt den Manifest-Kopf.

| Berechtigung | Erlaubt über die CleanMusic-Schnittstelle |
| --- | --- |
| `player` | `ctx.player.*` und die Ereignisse `nowplaying`/`state`/`volume` |
| `visualizer` | `visualizer: true` – Live-Spektrum im Ereignis `visualizer` |
| `source` | `search`, `resolve`, `lookup`, `playlist`, `charts`, `match`, `related` |
| `downloads:cc-only` | `download` (weiterhin nur mit bestätigter CC-Lizenz) |
| `network` | `ctx.fetch` zu jeder Adresse |
| `network:<host>` | `ctx.fetch` nur zu diesem Host und seinen Subdomains |
| `server:local` | nur Angabe für die Anzeige (eigener lokaler Server, z. B. für OBS) |
| `fs:folder` | `ctx.pickFile`, `ctx.openPath` |
| `clipboard` | `ctx.copyText` |
| `external-links` | `ctx.openExternal` |
| `ui:settings` | Einstellungsfelder (`settings`) |
| `ui:panel` | `ctx.ui.panel({ slot, title, html })` – eigene Panels |
| `stage` | `ctx.stage.set(scene)` / `ctx.stage.clear()` – Figuren und Farben hinter den Motion-Songtexten |
| `library:read` | `ctx.library.*` – Favoriten, Playlists, Verlauf, Warteschlange, lokale Titel lesen |

Ohne passende Berechtigung wirft die Schnittstelle einen Fehler
(„Plugin-Berechtigung … fehlt im Manifest“), Ereignisse und Fähigkeiten bleiben aus.
**Wichtig:** Plugins sind weiterhin Node-Code mit den Rechten des Benutzers – die
Berechtigungen regeln, was ein Plugin *über CleanMusic* darf, und machen sichtbar, was es
vorhat. Sie ersetzen nicht das Vertrauen in die Quelle.

### Bibliothek lesen (`library:read`)

`ctx.library` liefert **nur lesende**, bereinigte Auszüge (Titel, Artist, Album, Art,
Quelle, Lizenz, Dauer, Cover-URL – keine Dateipfade):

```js
const favorites = await ctx.library.favorites(); // { ok, items: [...] }
const playlists = await ctx.library.playlists(); // { ok, items: [{ name, count, smart }] }
const history = await ctx.library.history();     // { ok, items: [...] } (zuletzt gehört)
const queue = await ctx.library.queue();         // { ok, items: [...] } (Warteschlange)
const local = await ctx.library.local();         // { ok, items: [...] } (lokale Dateien)
const current = await ctx.library.current();     // { ok, item } | { ok, item: null }
```

### Eigene Panels (`ui:panel`)

Ein Plugin kann kleine, schreibgeschützte Panels anmelden. Sie erscheinen in der
Plugin-Karte unter „Plugins“ (`slot: 'settings'`) oder als Abschnitt auf der Startseite
(`slot: 'home'`):

```js
async setup(ctx) {
  ctx.ui.panel({
    slot: 'settings',
    title: 'Mein Status',
    html: '<p>Verbunden mit …</p>', // wird als HTML eingesetzt – Plugin ist vertrauenswürdig
  });
}
```

Pro Plugin und Slot bleibt das zuletzt angemeldete Panel stehen (höchstens vier Insgesamt);
HTML wird auf 20 000 Zeichen begrenzt. Panels verschwinden beim Deaktivieren des Plugins.

### Figuren hinter den Motion-Songtexten (`stage`)

Ein Plugin mit der Berechtigung `stage` kann den Vollbild-Songtexten eine kleine
Bühne geben – etwa Figuren zum laufenden Spiel. CleanMusic animiert sie im Takt
(der Beat kommt aus dem laufenden Visualizer, nicht aus dem Plugin):

```js
async setup(ctx) {
  ctx.stage.set({
    game: 'Undertale',
    label: true,                       // Namen unter den Figuren
    accent: '#ffd23f',
    size: 1,                           // 0.5 – 1.4
    characters: [
      { src: 'file:///C:/Bilder/GameMotion/Undertale/sans.png', name: 'Sans', anchor: 'left', motion: 'bounce', scale: 1 },
      { src: 'file:///C:/Bilder/GameMotion/Undertale/papyrus.png', name: 'Papyrus', anchor: 'right', motion: 'sway', scale: 1 },
    ],
  });
}
```

- `src`: `https://`, `file://` (nur Bilder, die Datei muss existieren) oder ein
  kleines `data:image/…;base64`. Kein HTML, kein SVG mit Skript, keine Fremd-CSS.
- `anchor`: `left`, `right`, `center`. `motion`: `bounce`, `sway`, `pulse`,
  `float`, `stomp`. Höchstens sechs Figuren, höchstens 1,5 MB pro Data-URL.
- `ctx.stage.clear()` blendet die Bühne aus; beim Deaktivieren passiert das
  automatisch. Setzen mehrere Plugins eine Bühne, gewinnt die zuletzt gesetzte.
- Es wird **nichts** gespeichert und nichts hochgeladen. Die Bühne erscheint nur
  im Vollbild, wenn ein Motion-Stil aktiv ist. Bei `prefers-reduced-motion`
  stehen die Figuren still.
- Rechte: Charakterbilder sind in der Regel geschützt. Ein Plugin sollte keine
  Spiel-Assets mitliefern, sondern nur vom Nutzer gewählte Dateien anzeigen.
  Beispiel: `extras/plugins/game-motion.js`.

### Dynamische Auswahllisten

Ein `select`-Feld kann seine Optionen vom Plugin holen:

```js
settings: [
  { id: 'device', type: 'select', label: 'Gerät', options: [{ value: 'auto', label: 'Automatisch' }], optionsFrom: 'listDevices' },
],
listDevices: async () => [{ value: 'mic-1', label: 'USB-Mikrofon' }],
```

CleanMusic ruft `listDevices()` beim Anzeigen der Einstellungen auf (höchstens 3 s,
höchstens 50 Einträge) und hängt die Optionen an die festen an. Gespeichert werden nur
Werte, die in einer der beiden Listen vorkommen. Funktioniert auch mit v2.

Beispiel mit Manifest: `extras/plugins/obs-visualizer.js`.

## Beispiel: OBS-Overlay

`extras/plugins/obs-overlay.js` ist ein vollständiges v2-Plugin: ein lokaler
Server (nur `127.0.0.1`) liefert eine transparente Browserquelle für OBS, live
per Server-Sent Events, dazu optional Textdateien. Es ist nicht Teil von
CleanMusic und wird wie jedes Plugin erst nach dem Hinzufügen und Aktivieren
geladen. Test: `npm run smoke:obs`.

## Beispiel: OBS-Audio-Visualizer

`extras/plugins/obs-visualizer.js` zeigt, wie ein Overlay das Live-Spektrum
nutzt: `visualizer: true` im Plugin-Objekt, `player.visualizer.spectrum` in
`onEvent('visualizer', player)` und ein kleiner lokaler Server, der die 32
Bänder per Server-Sent Events an OBS weitergibt. Stile: Balken, Spiegel, Kreis
und Welle; die Farben stammen aus dem Cover. Test:
`npm run smoke:visualizer`.
