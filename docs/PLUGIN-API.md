# Plugin-API (v1 und v2)

CleanMusic lädt Plugins mit `apiVersion: 1` und `apiVersion: 2`. v2 ist eine
Erweiterung: Jedes v1-Plugin läuft unverändert weiter.

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
  async match({ title, artist, album, duration }, force) { return { refId, url: 'https://…' }; },
  async related(refId, limit) { return [/* Item */]; },
};
```

**Item:** `{ id, title, artist, duration, artwork, link }` – `id` ist die
Plugin-eigene Referenz (`refId`), `artwork` muss `https://` sein.

**Stream:** `{ refId, url, duration, title, artist, artwork }` – `url` muss
`http(s)://` sein und direkt im `<audio>`-Element abspielbar.

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
  ],
  async onSettings(values) {},         // nach jeder Änderung, values = alle Felder

  // Player-Ereignisse: 'nowplaying' (anderer Titel), 'volume', 'state' (jede Änderung).
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

### Charts für die Startseite

```js
chartsLabel: 'YouTube Top 100',          // Name des Reiters (optional)
async charts(limit) { return [/* Item */]; },
```

Hat ein aktives Plugin `charts()`, bekommt *Trending & Neuheiten* auf der
Startseite einen eigenen Reiter. Die Items werden wie Suchtreffer behandelt
(abspielen über `resolve`). `charts` funktioniert auch mit `apiVersion: 1`.

## Beispiel: OBS-Overlay

`extras/plugins/obs-overlay.js` ist ein vollständiges v2-Plugin: ein lokaler
Server (nur `127.0.0.1`) liefert eine transparente Browserquelle für OBS, live
per Server-Sent Events, dazu optional Textdateien. Es ist nicht Teil von
CleanMusic und wird wie jedes Plugin erst nach dem Hinzufügen und Aktivieren
geladen. Test: `npm run smoke:obs`.
