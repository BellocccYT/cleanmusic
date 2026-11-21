# CleanMusic – Projekthinweise

## Stand (Version 1.1.0)

Electron-App für Windows, die Musik-Streamingdienste als offizielle Web-Player einbettet und selbst abspielt: lokale Dateien, 30-Sekunden-Vorschauen (Apple Music, Deezer), Live-Radio, Favoriten, Playlists, Vorschläge, Cutter-Modus (NCS, Kevin-MacLeod-Klassiker, Soundeffekte und freie Musik über Openverse, mit Lizenz und Credit), Vollbild-Player mit Visualizer, optionale Discord Rich Presence und optionale Quellen-Plugins. Seit 0.8: gehörrichtiger Lautstärkeregler (optional Angleichen und Boost über eine Web-Audio-Kette), zehn Themes plus Akzent aus dem Cover, Plugin-API v2 (Ereignisse, Player-Steuerung, Einstellungsfelder) und ein optionales OBS-Overlay-Plugin in `extras/plugins/`. Seit 0.9: Downloads nur „Nur Cutting“ (freie Lizenzen, Credit-.txt, Drag ins Schnittprogramm), lokaler Hör-Verlauf, Startseite mit „Neu für dich“, „Trending & Neuheiten“ (Charts, Neuerscheinungen, Plugin-Charts über `charts()`) und „Wiederentdecken“. Dazu: Medientasten/Windows-Medien-Overlay (mediaSession), Backup als JSON (Import ergänzt nur), Tray-Symbol mit optionalem Weiterlaufen beim Schließen (Herunterfahren nie blockieren). Schlaf-Timer, Video-Credits als .txt. Klang (Bass/Höhen als Shelf-Filter in der Audio-Kette). Fenstergröße/-position in cleanmusic-config.json. Update-Suche bei jedem Start über die GitHub-Releases von `BellocccYT/cleanmusic` (main.js, Abschnitt „Updates“): portable EXE/AppImage laden die neue Datei daneben, prüfen Größe + SHA-256 (`digest` der Release-Assets) und starten per `app.relaunch({ execPath })`. Seit 1.0 zusätzlich ein NSIS-Installer (ein Klick, pro Benutzer): installierte Kopien erkennt main.js am Uninstaller neben der EXE (`isInstalledCopy`), laden `CleanMusic-<version>-setup.exe` in den Temp-Ordner und starten ihn mit `--updated /S --force-run` (kein electron-updater). Release-Asset-Namen müssen `CleanMusic-<version>-portable.exe`, `CleanMusic-<version>-setup.exe` bzw. `CleanMusic-<version>.AppImage` bleiben. Streamer.bot-Plugin Phase 1 in `extras/plugins/streamerbot.js` (Fetch URL: /song, /skip, /pause mit Token, Port 4788, keine Songwünsche, Twitch). 0.10: Warteschlange + Autoplay (renderer/app.js, Abschnitt „Queue + autoplay“: eingereihte Kopien mit `queued`, Autoplay-Kopien mit `autoplay`, Suchtreffer spielen allein). 0.11: Creator-Dienste Epidemic Sound + Artlist (`creator: true` in services.js; main.js „Creator services“: `will-download` nur für deren Sitzungen → Cutting-Ordner + Lizenz-Notiz). Update-Meldung mit kurzem Gong und „Updaten“ / „Erinnere mich später noch einmal“ (2 h + nächster Start). 0.12: Erste-Schritte-Assistent (app.js „First steps“; öffnet nur, wenn noch nichts gespeichert ist – `FIRST_RUN`, nie im Smoke-Test) und „Neu in dieser Version“-Karte (`WHATS_NEW` je Version pflegen, `cleanmusic.seenversion.v1`). 1.0.1: Songwünsche für Plugins (`ctx.player.request`/`requests`/`removeRequest`, main.js `callRenderer` mit Antwort über `player-command-result`; app.js Abschnitt „Song requests“, Einträge mit `requestedBy`), genutzt vom Streamer.bot-Plugin 1.1.0 (`!sr`, `!wrongsong`, `!wishes`, Standard aus). 1.0: Installer, Tastenkürzel-Übersicht (`?`/F1, `SHORTCUTS` in app.js – bei neuen Kürzeln pflegen). Fahrplan: `docs/PLAN-1.0.md` (0.10–0.12 und 1.0 erledigt; Englisch auf 1.1 verschoben). Streamer.bot Phase 2 nach 1.1. Nächstes Feature: Spotify-Playlist-Import (1.1.0) – Bauplan in `docs/PLAN-SPOTIFY-IMPORT.md`; Englisch damit auf 1.2. Danach: YouTube-Music-Playlists per Link (1.2.0) – Bauplan inkl. Veröffentlichen in `docs/PLAN-YTMUSIC-IMPORT.md`; Englisch dann auf 1.3.

Statuskorrektur 1.1.0: Der oben erwähnte Spotify-Playlist-Import ist umgesetzt (öffentlicher
Embed-Link und CSV/JSON-Dateien), Abgleich über öffentliche Deezer-Vorschauen. Link-Import
nutzt keine Spotify-Sitzung, Cookies oder Tokens; Englisch liegt auf 1.2. Plan:
`docs/PLAN-SPOTIFY-IMPORT.md`.

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
- Kein DRM-Bypass, kein Download-Button für Streams, keine Werbeblocker. Downloads nur im Modus „Nur Cutting“ (CC0, CC BY, Public Domain aus dem Cutter-Modus, Host-Allowlist und Lizenzprüfung in `main.js`) und – davon getrennt – Downloads, die der User in den offiziellen Web-Apps von Epidemic Sound/Artlist selbst mit seinem Abo startet; niemals einen Modus „alles“ einbauen und keine Downloads aus anderen Diensten abgreifen.
- Nutzerdaten liegen in `%APPDATA%\CleanMusic` (`localStorage` + `cleanmusic-config.json`). Nicht anfassen.
- Plugins, `release/` und `node_modules/` bleiben aus Git heraus.

## Testen (nach jeder Änderung)

- `node --check` für geänderte JS-Dateien.
- `npm.cmd run smoke` – unsichtbares Fenster, Wegwerf-Profil. Prüft Vorschauen, Radio, Bibliothek, Cutter-Modus, Vollbild und Visualizer. Ausgabezeilen beginnen mit `SMOKE_`, Fehler mit `..._FAIL`.
- `npm.cmd run smoke:obs` – wie `smoke`, plus OBS-Overlay-Plugin aus `extras/plugins/` (Server, Ereignisse, Steuerung, Einstellungen, Textdateien).
- `npm.cmd run smoke:streamerbot` – wie `smoke`, plus Streamer.bot-Plugin (Token, Host-Prüfung, !song/!skip/!pause, Spam-Bremse, Songwünsche mit Limits, Duplikaten, Wartezeit, !wrongsong).
- `npm.cmd run smoke:update` – tut so, als liefe 0.0.1, und lädt das neueste GitHub-Release in einen Wegwerf-Ordner (Prüfsumme, Größe); ersetzt und startet nichts. `npm.cmd run smoke:update-setup` – dasselbe als installierte Kopie (lädt die Setup-EXE, sobald das neueste Release eine hat).
- `npm.cmd run smoke:plugin` – aktiviert das erste lokal installierte Plugin und spielt einen Titel, dauert je nach Plugin ca. 1 Minute.
- Release: `npm.cmd run build:win` → `release\CleanMusic-<version>-portable.exe` und `release\CleanMusic-<version>-setup.exe`. Danach `release\win-unpacked\CleanMusic.exe --smoke` laufen lassen.
