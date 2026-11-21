# CleanMusic – Projekthinweise

## Stand (Version 0.9.0)

Electron-App für Windows, die Musik-Streamingdienste als offizielle Web-Player einbettet und selbst abspielt: lokale Dateien, 30-Sekunden-Vorschauen (Apple Music, Deezer), Live-Radio, Favoriten, Playlists, Vorschläge, Cutter-Modus (NCS, Kevin-MacLeod-Klassiker, Soundeffekte und freie Musik über Openverse, mit Lizenz und Credit), Vollbild-Player mit Visualizer, optionale Discord Rich Presence und optionale Quellen-Plugins. Seit 0.8: gehörrichtiger Lautstärkeregler (optional Angleichen und Boost über eine Web-Audio-Kette), zehn Themes plus Akzent aus dem Cover, Plugin-API v2 (Ereignisse, Player-Steuerung, Einstellungsfelder) und ein optionales OBS-Overlay-Plugin in `extras/plugins/`. Seit 0.9: Downloads nur „Nur Cutting“ (freie Lizenzen, Credit-.txt, Drag ins Schnittprogramm), lokaler Hör-Verlauf, Startseite mit „Neu für dich“, „Trending & Neuheiten“ (Charts, Neuerscheinungen, Plugin-Charts über `charts()`) und „Wiederentdecken“. Dazu: Medientasten/Windows-Medien-Overlay (mediaSession), Backup als JSON (Import ergänzt nur), Tray-Symbol mit optionalem Weiterlaufen beim Schließen (Herunterfahren nie blockieren). Als Nächstes (1.0, mit dem User): Streamer.bot als eigenes Plugin.

## Aufbau

- `main.js` – Hauptprozess: Fenster, IPC, Widevine, Katalog/Charts/Radio, Vorschläge, Cutter-Quellen (Deezer-Playlisten, Openverse), Plugin-Lader, Discord-Steuerung, Smoke-Test.
- `discord-rpc.js` – Discord Rich Presence über die lokale IPC-Pipe.
- `preload.js` – Bridge `window.cm`.
- `renderer/app.js` – gesamte UI und Player-Logik (groß, in Abschnitte gegliedert).
- `renderer/creator-data.js` – Cutter-Kategorien; `renderer/visualizer.js` – Web-Audio-Visualizer (Analyse über `captureStream()`, ohne die Wiedergabe umzuleiten) und die optionale Audio-Kette für Angleichen/Boost. Ist die Kette einmal gebaut (`createMediaElementSource`), trägt sie den Ton bis zum Neustart: AudioContext dann nie suspendieren, Lautstärke über `setOutput` statt `audio.volume`.
- `renderer/themes.js` – Theme-Paletten; `app.js` setzt daraus CSS-Variablen (auch `--*-rgb`-Tripel für Transparenzen). Neue Farben im Stylesheet immer über Variablen, nie fest (Ausnahme: Vollbild-Player, Markenfarben).
- `extras/plugins/` – optionale Plugins im Repository (nicht im Build, nie automatisch geladen). `tools/make-icons.js` erzeugt Logo und Icons (`npm.cmd run icons`).
- `docs/PLUGIN-API.md` – allgemeine Plugin-API-Dokumentation. Plugins lassen sich in den Einstellungen per Dateidialog oder Drag & Drop hinzufügen und bleiben danach ausgeschaltet.
- `plugins/` – lokale Plugin-Dateien; durch `.gitignore` nicht im Repository und nicht Teil der Builds.
- `README.md` und `LEGAL.md` – Funktionen und rechtliche Einordnung; bei Änderungen mitpflegen.

## Regeln

- Im App-Code (`main.js`, `renderer/*`, `preload.js`) keinen yt-dlp-/YouTube-Extraktionscode und keine yt-dlp-Erwähnungen. Alles Quellenspezifische gehört in ein extern installiertes Plugin.
- Plugins werden nie automatisch geladen: erst nach Aktivierung mit Rückfrage.
- Kein DRM-Bypass, kein Download-Button für Streams, keine Werbeblocker. Downloads nur im Modus „Nur Cutting“ (CC0, CC BY, Public Domain aus dem Cutter-Modus, Host-Allowlist und Lizenzprüfung in `main.js`); niemals einen Modus „alles“ einbauen.
- Nutzerdaten liegen in `%APPDATA%\CleanMusic` (`localStorage` + `cleanmusic-config.json`). Nicht anfassen.
- Plugins, `release/` und `node_modules/` bleiben aus Git heraus.

## Testen (nach jeder Änderung)

- `node --check` für geänderte JS-Dateien.
- `npm.cmd run smoke` – unsichtbares Fenster, Wegwerf-Profil. Prüft Vorschauen, Radio, Bibliothek, Cutter-Modus, Vollbild und Visualizer. Ausgabezeilen beginnen mit `SMOKE_`, Fehler mit `..._FAIL`.
- `npm.cmd run smoke:obs` – wie `smoke`, plus OBS-Overlay-Plugin aus `extras/plugins/` (Server, Ereignisse, Steuerung, Einstellungen, Textdateien).
- `npm.cmd run smoke:plugin` – aktiviert das erste lokal installierte Plugin und spielt einen Titel, dauert je nach Plugin ca. 1 Minute.
- Release: `npm.cmd run build:win` → `release\CleanMusic-<version>-portable.exe`. Danach `release\win-unpacked\CleanMusic.exe --smoke` laufen lassen.
