# CleanMusic – Projekthinweise

## Stand (Version 0.7.2)

Electron-App für Windows, die Musik-Streamingdienste als offizielle Web-Player einbettet und selbst abspielt: lokale Dateien, 30-Sekunden-Vorschauen (Apple Music, Deezer), Live-Radio, Favoriten, Playlists, Vorschläge, Cutter-Modus (NCS, Kevin-MacLeod-Klassiker, Soundeffekte und freie Musik über Openverse, mit Lizenz und Credit), Vollbild-Player mit Visualizer, optionale Discord Rich Presence und optionale Quellen-Plugins.

## Aufbau

- `main.js` – Hauptprozess: Fenster, IPC, Widevine, Katalog/Charts/Radio, Vorschläge, Cutter-Quellen (Deezer-Playlisten, Openverse), Plugin-Lader, Discord-Steuerung, Smoke-Test.
- `discord-rpc.js` – Discord Rich Presence über die lokale IPC-Pipe.
- `preload.js` – Bridge `window.cm`.
- `renderer/app.js` – gesamte UI und Player-Logik (groß, in Abschnitte gegliedert).
- `renderer/creator-data.js` – Cutter-Kategorien; `renderer/visualizer.js` – Web-Audio-Visualizer (Analyse über `captureStream()`, ohne die Wiedergabe umzuleiten).
- `docs/PLUGIN-API.md` – allgemeine Plugin-API-Dokumentation. Plugins lassen sich in den Einstellungen per Dateidialog oder Drag & Drop hinzufügen und bleiben danach ausgeschaltet.
- `plugins/` – lokale Plugin-Dateien; durch `.gitignore` nicht im Repository und nicht Teil der Builds.
- `README.md` und `LEGAL.md` – Funktionen und rechtliche Einordnung; bei Änderungen mitpflegen.

## Regeln

- Im App-Code (`main.js`, `renderer/*`, `preload.js`) keinen yt-dlp-/YouTube-Extraktionscode und keine yt-dlp-Erwähnungen. Alles Quellenspezifische gehört in ein extern installiertes Plugin.
- Plugins werden nie automatisch geladen: erst nach Aktivierung mit Rückfrage.
- Kein DRM-Bypass, kein Download-Button für Streams, keine Werbeblocker.
- Nutzerdaten liegen in `%APPDATA%\CleanMusic` (`localStorage` + `cleanmusic-config.json`). Nicht anfassen.
- Plugins, `release/` und `node_modules/` bleiben aus Git heraus.

## Testen (nach jeder Änderung)

- `node --check` für geänderte JS-Dateien.
- `npm.cmd run smoke` – unsichtbares Fenster, Wegwerf-Profil. Prüft Vorschauen, Radio, Bibliothek, Cutter-Modus, Vollbild und Visualizer. Ausgabezeilen beginnen mit `SMOKE_`, Fehler mit `..._FAIL`.
- `npm.cmd run smoke:plugin` – aktiviert das erste lokal installierte Plugin und spielt einen Titel, dauert je nach Plugin ca. 1 Minute.
- Release: `npm.cmd run build:win` → `release\CleanMusic-<version>-portable.exe`. Danach `release\win-unpacked\CleanMusic.exe --smoke` laufen lassen.
