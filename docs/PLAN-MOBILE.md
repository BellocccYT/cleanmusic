# Plan: Android, Android TV, Google TV und Fire TV

Stand: umgesetzt in **mobile-1.1.0** (Phase 1 + 2 + 3). Dieses Dokument hält den
Bauplan fest; die Anleitung für Nutzer und Entwickler steht in
[`../mobile/README.md`](../mobile/README.md).

Eigenes Projekt in `mobile/` (Capacitor), parallel zu den Desktop-Versionen und
nicht in deren Releases. Oberfläche aus `renderer/` wird wiederverwendet; `app.js`
hat eine Ersatz-Brücke für den Betrieb ohne Electron. Eigene Versionsnummern
(`mobile-1.1.0 …`) und eigene Release-Assets
`CleanMusic-Android-<version>.apk`. Die Namen der Desktop-Assets bleiben
unverändert, sonst bricht der Updater.

## Grundsätze

- Vertrieb nur als APK über GitHub-Releases, ohne Play Store und Amazon Appstore.
  **Eine APK für alles** (Handy, Tablet, Android TV, Google TV, Fire TV); die App
  erkennt das Gerät selbst.
- Keine eingebetteten Streaming-Web-Player. Stattdessen „In Spotify / YouTube
  Music / Apple Music öffnen“ per Deep Link in die offizielle App.
- Keine Plugins (Node-Code läuft auf Android nicht), kein yt-dlp, keine
  Stream-Downloads, keine Werbeblocker. Die Regeln aus `AGENTS.md` gelten.
- Mit dabei: Vorschauen (Deezer/Apple), Radio, Favoriten, Playlists, Verlauf,
  Rückblick, Songtexte mit Effekten, Themes, Live-Hintergründe, Plattenspieler,
  Visualizer, Songs teilen. Cutter-Modus nur auf Handy und Tablet.
- Netzwerk aus `main.js` (Katalog, Charts, Radio, `lyrics-get`, Künstlerseiten)
  in `mobile/src/native.js` über `CapacitorHttp` nachgebaut, mit denselben
  Allowlists und Prüfungen.

## Phase 1 – Handy und Tablet (Voraussetzung für TV) — erledigt

- Capacitor-Projekt `mobile/`, Build-Skript kopiert `renderer/` und setzt die
  Mobile-Brücke ein (`scripts/build-web.js`, `src/native.js`, `src/mobile.css`).
- Hintergrund-Wiedergabe: `BackgroundAudioPlugin` + `BackgroundAudioService`
  (MediaSession, Foreground-Service, Benachrichtigung, Sperrbildschirm).
- Lokale Musik über die Android-Mediathek (`MediaLibraryPlugin`,
  `READ_MEDIA_AUDIO`, nur nach Rückfrage).
- Eingebauter Updater: Prüfung beim Start und alle 6 h über die
  GitHub-Releases (`mobile-*`), Download, Größe + SHA-256 (`digest`),
  Android-Installer (`REQUEST_INSTALL_PACKAGES`), Hinweis-Karte
  „Update verfügbar“ mit „Updaten“ / „Später“ (`UpdaterPlugin`, `native.js`).
- Signierschlüssel außerhalb des Repos (`%USERPROFILE%\.cleanmusic\keystore.properties`,
  `CLEANMUSIC_KEYSTORE`), Release-Asset über `scripts/release-asset.js`.

## Phase 2 – CleanMusic TV Lite — erledigt

Dieselbe APK; auf dem Fernseher (`UiModeManager`, `html[data-device="tv"]`)
startet automatisch die Lite-Version (`www/tv.html`, `src/tv.js`).

**Weggelassen und gar nicht geladen:** Cutter-Modus, Downloads und
Downloads-Liste, Wellenform und BPM, Rückblick, Plugins, Playlist-Import,
lokale Musik, Ansicht „Erweitert“. Auf dem Fernseher wird `app.js` nicht
eingebunden.

**Drin:** Jetzt läuft (groß, mit Cover und Songtext), Radio, Charts, Favoriten,
Songtexte mit Effekten, Themes, Live-Hintergründe, Plattenspieler, Visualizer,
Warteschlange und Party-Modus (Karaoke-Text mittig, Live-Hintergrund,
„Als Nächstes“ unten).

**Handy-Steuerung:** QR-Code auf dem Startbildschirm („Mit dem Handy scannen“).
Die Steuerseite ist dieselbe wie am Desktop (`renderer/remote/index.html`) mit
derselben API: `/api/state`, `/api/cmd`, `/api/search`, `/api/queue`,
`/api/events` sowie neu `/api/radio` und `/api/favorites`. Nativer HTTP-Server
(`RemoteServerPlugin`, `RemoteHttpServer`) mit Schlüssel bei jeder Anfrage, nur
Loopback/private IPv4, Host-Prüfung, 20 Anfragen/s/IP, höchstens 10
Live-Verbindungen, „Neuen Link erzeugen“. Server läuft nur bei offener App.

Suche läuft über das Handy (keine Bildschirmtastatur); mehrere Handys erlaubt
(Party) mit kurzer Einblendung „Handy 2 hat einen Song eingereiht“. Koppeln per
QR: der Desktop kann Favoriten und Playlists über `/api/pair` schicken, am
Fernseher einmal bestätigen.

**Fernbedienung als Notlösung:** Play/Pause, Weiter/Zurück, Lautstärke und
Zurück-Taste immer; Fokus-Navigation für Start, Radio, Charts, Favoriten,
Party, Warteschlange; Schrift ≥ 24 px, Overscan-Ränder 5 %.

**TV-Startbildschirm:** `android.software.leanback` (required=false),
`android.hardware.touchscreen` (required=false), `LEANBACK_LAUNCHER`,
TV-Banner 320×180 (`res/drawable-xhdpi/tv_banner.png`).

## Phase 3 – Fire TV — erledigt

Dieselbe TV-App, getestet auf Fire TV (Fire OS ist Android-basiert), Vertrieb
über dieselbe APK, kein Amazon Appstore. **Vega OS:** neuere Fire-TV-Geräte
können keine Android-Apps ausführen; die Download-Seite weist darauf hin.

## Für Endnutzer

- Kurze Links: `…/cleanmusic/android/` und `…/cleanmusic/tv/` leiten auf die
  neueste APK weiter (GitHub-API, Fallback Release-Seite).
- Bebilderte Schritt-für-Schritt-Anleitung „Auf Fire TV / Google TV
  installieren“: Entwickleroptionen (7× tippen), Downloader erlauben, kurzen
  Link eingeben, Play-Protect-Warnung erklären, Alternative per USB-Stick.
- SHA-256 jeder APK in den Release-Notes.
- Kein Konto, keine Anmeldung. Start mit Radio und Charts.

## Tests

`npm.cmd run smoke:mobile` (headless, Electron): App startet, Vorschau spielt,
Radio spielt, Fokus-Navigation erreicht alle TV-Bereiche, TV Lite ohne Cutter
und Downloads, Steuerseite mit/ohne Schlüssel (401), `/api/search` und
`/api/queue`, `/api/radio`, `/api/favorites`, `/api/events`. Dazu am Gerät:
Hintergrund-Wiedergabe nach dem Sperren, Update-Installation, Emulator
„Android TV“/„Google TV“, Fire TV Stick/Cube.

## Bewusst später oder gar nicht

- iOS und Apple TV (Mac, 99 $/Jahr, tvOS ohne Web-Ansicht).
- Samsung (Tizen) und LG (webOS): eigene SDKs und Stores.
- Code-Signatur der Desktop-EXE (kostet jährlich; erst bei mehr Downloads).
- Songtext-Übersetzung/-Export, Cloud-Konto, Telemetrie, Werbeblocker,
  Stream-Downloads: nie.

## Ablauf je Version

1. Version in `mobile/package.json` **und**
   `mobile/android/app/build.gradle` (`versionName "mobile-x.y.z"`, `versionCode`)
   erhöhen; `WHATS_NEW`/`MOBILE_VERSION` in `mobile/src/native.js` pflegen.
2. `README.md`, `AGENTS.md` („Stand“), `mobile/README.md`, dieses Dokument.
3. `node --check` für geänderte JS-Dateien.
4. `npm.cmd run smoke` (Desktop, 0 `_FAIL`) und `npm.cmd run smoke:mobile`.
5. `npm.cmd run build:release` → `mobile/release-assets/CleanMusic-Android-<version>.apk`,
   SHA-256 in die Release-Notes. GitHub-Release mit Tag `mobile-<version>` (der
   Desktop-Updater ignoriert diese Tags, `/releases/latest` bleibt für ihn
   unverändert).
6. Committen, nicht pushen, kein Tag. Release erst nach Prüfung und
   ausdrücklichem OK.
