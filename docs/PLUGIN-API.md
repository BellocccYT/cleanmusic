# Plugin-API v1

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
