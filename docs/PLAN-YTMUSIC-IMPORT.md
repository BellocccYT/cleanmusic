# Plan: YouTube-Music-Playlists per Link übertragen (Version 1.2.0)

Festgelegt am 21.11.2026 mit dem User. Baut auf dem Spotify-Import aus 1.1.0 auf
(`docs/PLAN-SPOTIFY-IMPORT.md`, app.js „Von Spotify übertragen“). Englisch rutscht
auf 1.3. **Vorher `AGENTS.md` lesen** – die Regeln gelten, besonders:

- **Im App-Code (`main.js`, `renderer/*`, `preload.js`) kein YouTube-Lesecode und
  kein Wort „yt-dlp“.** Das Lesen der YouTube-Playlist passiert ausschließlich im
  Plugin. Die App kennt nur eine neue, allgemeine Plugin-Fähigkeit `playlist(url)`.
- Nutzerdaten in `%APPDATA%\CleanMusic` nicht anfassen (auch nicht das dort
  installierte Plugin – das tauscht der User selbst über „Plugin hinzufügen“).

## Ergebnis für den User

- Der Knopf heißt jetzt **„Playlist übertragen“** (Seitenleiste + Bibliothek), der
  Dialog „Playlist übertragen“. Das Link-Feld nimmt Spotify- **und** YouTube-/
  YouTube-Music-Playlist-Links an (`music.youtube.com/playlist?list=…`,
  `www.youtube.com/playlist?list=…`, `…/watch?v=…&list=…`).
- YouTube-Link + aktives Quellen-Plugin mit `playlist`: Die Titel kommen **direkt
  als volle Titel des Plugins** in eine neue CleanMusic-Playlist (wie Suchtreffer des
  Plugins, `pluginEntry`) – kein Deezer-Abgleich nötig, daher auch keine
  „nicht gefunden“-Liste (höchstens leere/private Einträge, die das Plugin weglässt).
- YouTube-Link ohne passendes Plugin: klare Meldung **ohne Plugin-Namen**:
  „Für YouTube-Music-Links brauchst du ein aktives Quellen-Plugin mit Playlist-Import.
  Alternativ die Playlist auf tunemymusic.com als CSV exportieren und hier über
  *Datei wählen* laden.“
- Spotify-Links und Datei-Import funktionieren unverändert.

## 1. Plugin-API (App)

- `main.js`, `pluginInfo` → `capabilities.playlist: typeof mod.playlist === 'function'`.
- Neuer IPC `plugin-playlist` (id, url) nach dem Muster von `plugin-charts`
  (`readyPlugin(id, 'playlist')`, `Promise.race` mit **180 s** Timeout, Ergebnis über
  `cleanItems`, höchstens 2000 Einträge, Name mit `cleanText(…, 100)`):
  Plugin liefert `{ name, items: [{ id, title, artist, duration, artwork, link }] }`
  (dieselbe Form wie `search()`), App gibt `{ name, items, error }` zurück.
- `preload.js`: `pluginPlaylist: (id, url) => ipcRenderer.invoke('plugin-playlist', id, url)`.
- `docs/PLUGIN-API.md`: `playlist(url)` dokumentieren (optional, ab CleanMusic 1.2.0,
  Rückgabe wie oben, Plugin prüft die URL selbst und wirft bei fremden Links einen
  verständlichen Fehler).

## 2. Renderer

- Link-Erkennung im bestehenden Dialog (`openSpotifyImportDialog` →
  gern umbenennen in `openPlaylistImportDialog`):
  `music.youtube.com` / `www.youtube.com` / `youtube.com` / `m.youtube.com` mit
  `list=`-Parameter → YouTube-Weg, sonst wie bisher Spotify.
- YouTube-Weg: `readyPlugins('playlist')[0]` → `bridge.pluginPlaylist(plugin.id, url)`,
  Fortschritt „Playlist wird gelesen …“ (Abbrechen wie bisher), dann
  `createPlaylist(name)` (gleiche Namens-Dedupe wie beim Spotify-Import) +
  `addToPlaylist(id, items.map((item) => pluginEntry(plugin, item)))`.
  Ergebnis: „X Titel übertragen“.
- Texte/Knöpfe: „Von Spotify übertragen“ → „Playlist übertragen“; Hinweistext im
  Dialog: „Spotify- oder YouTube-Music-Link einfügen – oder eine CSV-/JSON-Datei wählen.“
- `WHATS_NEW['1.2.0']` ergänzen, `package.json` → 1.2.0, README-Abschnitt
  „Playlists übertragen“ (YouTube Music braucht ein Quellen-Plugin mit Playlist-Import;
  ohne Plugin über tunemymusic.com als CSV), `AGENTS.md` „Stand“, `docs/PLAN-1.0.md`
  (Englisch → 1.3).

## 3. Plugin (`plugins/ytdlp.js`, nicht im Repository)

Arbeitskopie ist `plugins/ytdlp.js` (per `.gitignore` ausgeschlossen, wird von
`npm.cmd start` und `smoke:plugin` geladen). Version **1.2.0**.

- Neue Funktion `playlist(url)` nach dem Muster von `charts()`:
  - URL prüfen: nur `https`, Host `music.youtube.com`, `www.youtube.com`,
    `youtube.com`, `m.youtube.com`; `list`-Parameter muss `^[A-Za-z0-9_-]{10,64}$`
    sein. Immer als `https://www.youtube.com/playlist?list=<id>` an das Programm geben
    (keine Nutzer-URL direkt durchreichen).
  - `run(['--flat-playlist', '-J', '-I', '1:2000', '--', url], 120000)`,
    Einträge mit `normalizeVideo` (wie `charts`), leere/private Einträge weglassen.
  - Name: `json.title` (bei YouTube Music evtl. mit Präfix „Album – “ o. Ä. – so lassen).
  - Rückgabe `{ name, items }`.
- In `module.exports` aufnehmen; `version: '1.2.0'`.
- Danach das Plugin-Paket aktualisieren:
  `C:\Users\Belloccc\Desktop\Code\cleanmusic-plugin-ytdlp\`
  1. alte `ytdlp.js` als `ytdlp-1.1.0.js.bak` sichern,
  2. neue `ytdlp.js` hineinkopieren,
  3. ZIP neu packen (PowerShell):
     `Compress-Archive -Path ytdlp.js, ANLEITUNG.md, RECHTLICHER-HINWEIS.md, LEGAL-yt-dlp.md -DestinationPath cleanmusic-plugin-ytdlp.zip -Force`
     (im Paketordner ausführen; vorher die alte ZIP als `cleanmusic-plugin-ytdlp-1.1.0.zip.bak` sichern).

## 4. Tests

- `node --check` für alle geänderten Dateien (auch `plugins/ytdlp.js`).
- `npm.cmd run smoke`: `SMOKE_PLAYLIST_IMPORT` um zwei Punkte erweitern –
  YouTube-Link wird erkannt; ohne Plugin kommt die Meldung (ohne „yt-dlp“).
  Keine `_FAIL`-Zeile, alle bisherigen `SMOKE_`-Zeilen weiter da (22).
- `npm.cmd run smoke:plugin` (nutzt `plugins/ytdlp.js`): zusätzlich
  `playlist('https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i')`
  → Name + > 20 Einträge; ein Titel daraus lässt sich abspielen.
- Kontrolle: `Select-String -Path main.js, preload.js, renderer\*.js, renderer\*.html -Pattern "yt-dlp"`
  darf **nichts** finden. (Die vorhandene Migration mit der Plugin-ID `ytdlp` in
  `migrateEntry` bleibt unverändert – das ist nur eine ID für alte Favoriten.)

## 5. Veröffentlichen (nur, wenn der User es ausdrücklich sagt)

PowerShell im Projektordner, Schritt für Schritt, jeweils Ergebnis prüfen:

```powershell
git status --short
git add -A
git commit -m "CleanMusic 1.2.0: YouTube-Music-Playlists per Link übertragen"
git push origin master
git tag -a v1.2.0 -m "CleanMusic 1.2.0"
git push origin v1.2.0
```

Der GitHub-Workflow baut dann Installer, portable EXE und AppImage (ca. 8–10 Minuten):

```powershell
gh run list --limit 1
gh run watch <ID aus der Liste> --exit-status
```

Release-Notizen (Deutsch, Stil wie bei 1.1.0: „Neu“, „Gut zu wissen“, „Download“
mit `CleanMusic-1.2.0-setup.exe`, `CleanMusic-1.2.0-portable.exe`,
`CleanMusic-1.2.0.AppImage`, Hinweis „Wer 0.9.0 oder neuer nutzt, bekommt das Update
automatisch beim Start angeboten.“ und dass YouTube-Links das Quellen-Plugin ab 1.2.0
brauchen) in eine Datei außerhalb des Repos schreiben, z. B. `$env:TEMP\cm-notes-120.md`, dann:

```powershell
gh release edit v1.2.0 --title "CleanMusic 1.2.0" --notes-file "$env:TEMP\cm-notes-120.md"
gh api repos/BellocccYT/cleanmusic/releases/latest --jq ".tag_name, (.assets[] | .name + ' ' + (.digest // '-'))"
```

Erwartet: `v1.2.0` und drei Dateien mit `sha256:…`. Die Asset-Namen dürfen sich
**nicht** ändern (der Updater sucht genau `CleanMusic-<version>-setup.exe`,
`-portable.exe`, `.AppImage`). Commits ohne echte E-Mail-Adresse (lokale
noreply-Konfiguration nicht ändern).
