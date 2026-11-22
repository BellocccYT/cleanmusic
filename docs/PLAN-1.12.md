# Fahrplan 1.12 – 1.15

Stand: 1.11.2. Dieser Plan ist für die Umsetzung mit OpenCode geschrieben: Jede Version ist in sich
abgeschlossen und wird **einzeln** gebaut, getestet und geprüft. Es gelten alle Regeln aus
`AGENTS.md` (kein yt-dlp im App-Code, Plugins nie automatisch laden, keine Stream-Downloads,
Nutzerdaten nicht anfassen, keine Tags oder Pushes ohne ausdrückliches OK).

| Version | Thema | Aufwand |
|---|---|---|
| 1.12.0 | Fernbedienung & Komfort | mittel–groß |
| 1.13.0 | Klang, Creator & Live-Hintergründe | mittel–groß |
| 1.14.0 | Streamer Phase 2 + Smart-Playlists | mittel |
| 1.15.0 | Englische Oberfläche | groß (in Etappen) |
| mobile-1.x | Android, danach „TV Lite“ für Android TV / Google TV / Fire TV (Handy-Steuerung) | sehr groß (eigenes Projekt, parallel) |

---

## 1.12.0 – Fernbedienung & Komfort

### A. Handy-Fernbedienung im WLAN (Kernfeature)

Das Handy steuert CleanMusic über eine kleine Webseite, ganz ohne App. Damit ist auch der Wunsch
nach einer Handy-Version zum großen Teil erfüllt.

- **Standard: aus.** Einstellungen → „Handy-Fernbedienung“ → Schalter. Erst beim Einschalten startet
  `main.js` einen `http`-Server (Port 4790, in den Einstellungen änderbar).
- **Zugang:** Zufälliger Schlüssel (`crypto.randomBytes(24)`, base64url) in `cleanmusic-config.json`,
  Knopf „Neuen Link erzeugen“ macht alte Links ungültig. Jede API-Anfrage braucht den Schlüssel
  (Header `X-CM-Key` oder `?k=`), Vergleich mit `crypto.timingSafeEqual`.
- **Nur lokales Netz:** Anfragen nur von Loopback oder privaten IPv4-Adressen (10/8, 172.16/12,
  192.168/16) annehmen, sonst 403. `Host`-Header muss eine IP oder `localhost` sein (gegen
  DNS-Rebinding). Höchstens 20 Anfragen pro Sekunde und IP.
- **Link + QR-Code:** LAN-IPv4 aus `os.networkInterfaces()` (nicht intern, privat), URL
  `http://<ip>:<port>/?k=<schlüssel>`. QR-Code über das npm-Paket `qrcode` (MIT) in `main.js` als
  Data-URL erzeugen. Paket in `dependencies` und in `THIRD-PARTY-NOTICES.md` aufnehmen.
- **Hinweis in der Oberfläche:** Windows fragt beim ersten Start nach der Firewall, dann nur
  „Private Netzwerke“ zulassen.
- **Endpunkte:**
  - `GET /` liefert die Handy-Seite `renderer/remote/index.html`: eine Datei mit Inline-CSS/JS, ohne
    externe Ressourcen, mit eigener CSP, responsiv, große Knöpfe, dunkel/hell.
  - `GET /api/state` liefert Titel, Künstler, Cover-URL (nur `https:`, lokale Cover weglassen),
    Position, Dauer, spielt/pausiert, Lautstärke, die nächsten 10 der Warteschlange und die
    aktuelle Songtext-Zeile.
  - `POST /api/cmd` nimmt `{cmd, value}` an: `toggle`, `play`, `pause`, `next`, `prev`, `seek`,
    `volume`, `like`. Die Befehle laufen über das vorhandene `callRenderer` (main.js) mit denselben
    Namen wie in der Plugin-Player-Steuerung.
  - `GET /api/search?q=` sucht nur im Katalog (Vorschauen), nie lokale Dateien.
    `POST /api/queue {id}` reiht einen Treffer ein („Als Nächstes“ oder „Ans Ende“).
  - `GET /api/events` als Server-Sent Events für Live-Updates. Die Seite fällt auf Polling (1 s)
    zurück.
- **Keine lokalen Pfade, Benutzernamen oder Plugin-Interna in Antworten.**
- Server stoppt beim Ausschalten und bei `will-quit`. Im Smoke-Test nie auf 0.0.0.0 binden.
- **Smoke `SMOKE_REMOTE`:**
  - Server auf 127.0.0.1 mit Zufallsport starten.
  - Ohne Schlüssel kommt 401, mit falschem 401.
  - `/api/state` ist ok, `toggle` wechselt den Zustand, `/api/search` liefert Treffer.
  - Server stoppen.

### B. Taskleiste: Vorschau-Knöpfe und Fortschritt (nur Windows)

- `win.setThumbarButtons` mit Zurück / Play-Pause / Weiter. Die Icons sind kleine PNGs unter
  `renderer/assets/thumbar/` (am besten von `tools/make-icons.js` erzeugt). Play/Pause tauscht
  das Icon je nach Zustand.
- `win.setProgressBar(pos / dauer)` höchstens 1× pro Sekunde, Modus `paused` bei Pause, `-1` ohne
  Titel. Option „Fortschritt in der Taskleiste“ (Standard an).
- Die Daten kommen aus dem vorhandenen `playerState` in `main.js`, keine neue Abfrage nötig.

### C. Mini-Player

- Kleines, rahmenloses Fenster (ca. 360×120) mit Cover, Titel, Künstler, Zurück/Play/Weiter,
  Fortschritt und Lautstärke. Optional „Immer im Vordergrund“.
- Dateien: `renderer/mini.html`, `renderer/mini.js` und ein eigenes, kleines `preload-mini.js`
  (nur `onState` und `command`). **`preload-mini.js` in `package.json` → `build.files` eintragen.**
- Ton spielt weiter im Hauptfenster. Das Hauptfenster wird nur versteckt, nie geschlossen.
- Öffnen über einen Knopf in der Player-Leiste, das Tray-Menü und das Kürzel aus D. Position in
  `cleanmusic-config.json` (`miniBounds`) speichern und beim Öffnen auf einen sichtbaren Bildschirm
  begrenzen.
- Zustand per IPC aus `playerState`, Befehle über `callRenderer`.

### D. Globale Tastenkürzel (optional)

- **Standard: aus.** Belegung:
  - Play/Pause: `Strg+Alt+P`
  - Weiter / Zurück: `Strg+Alt+→` / `Strg+Alt+←`
  - Lauter / Leiser: `Strg+Alt+↑` / `Strg+Alt+↓`
  - Mini-Player: `Strg+Alt+M`
- Registrierung über `globalShortcut` beim Einschalten, Abmeldung beim Ausschalten und bei
  `will-quit`. Gibt `register` `false` zurück: Hinweis „Kürzel ist schon belegt“.
- In die Kürzel-Übersicht `SHORTCUTS` (app.js) aufnehmen, als „global“ markiert.
- Medientasten laufen weiter über `mediaSession`. Nichts doppelt registrieren.

### E. Mit Windows starten (optional)

- `app.setLoginItemSettings({ openAtLogin, path, args: ['--autostart'] })`, nur in gepackten Builds.
- **Portable:** `process.execPath` zeigt dort auf den Temp-Ordner. Deshalb denselben echten Pfad wie
  die Update-Logik verwenden (`PORTABLE_EXECUTABLE_FILE`). Der Dateiname ändert sich mit jedem
  Update, also bei jedem Start den Eintrag neu setzen, wenn die Option an ist.
- `--autostart` startet versteckt im Tray, wenn das Tray-Symbol an ist, sonst minimiert.

### F. „Diagnose kopieren“ (Hilfe für Fehlerberichte)

- Einstellungen → Hilfe → „Diagnose kopieren“. Der Knopf kopiert in die Zwischenablage:
  - Version und Installationsart (installiert/portable)
  - Electron-, Chrome- und Windows-Version
  - aktive Plugins mit Versionen
  - wichtige Schalter (Audio-Kette, Fernbedienung, Layout)
  - die letzten 30 Fehler aus einem Ringpuffer im Speicher: `window.onerror`,
    `unhandledrejection` und Fehler aus dem Hauptprozess
- Den Benutzerordner (`os.homedir()`) überall durch `~` ersetzen. Es werden keine Dateien
  geschrieben und es gibt keine Telemetrie.
- Knopf „Fehler melden“ öffnet die GitHub-Seite für neue Issues **ohne** Daten in der URL. Der
  Nutzer fügt die Diagnose selbst ein.

**WHATS_NEW 1.12.0**, README (Abschnitt Fernbedienung mit Sicherheitshinweisen) und LEGAL (lokaler
Server, nur LAN, Schlüssel) pflegen.

---

## 1.13.0 – Klang & Creator

### A. 10-Band-Equalizer mit Presets

- In `renderer/visualizer.js` (Audio-Kette) zehn `peaking`-Filter zwischen `treble` und `level`
  einfügen: 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k und 16k Hz, Q ≈ 1.1, Gain ±12 dB. Neue
  Funktion `setEq(gains[10])`. Bass/Höhen bleiben bestehen.
- Einschalten baut die Kette (wie Angleichen/Boost). Es gilt die Regel aus AGENTS.md: Die Kette
  trägt den Ton bis zum Neustart, `setOutput` statt `audio.volume`.
- Presets: Neutral, Bass-Boost, Stimme/Podcast, Hell, Warm, Laptop-Lautsprecher, Kopfhörer,
  Elektronisch, Akustik. Dazu bis zu 10 eigene Presets.
- Speichern in `cleanmusic.eq.v1` `{ enabled, preset, gains, custom: [{ name, gains }] }`.
- Ansicht „Einfach“ zeigt nur die Preset-Auswahl, „Erweitert“ (`advanced-only`) die 10 Regler und
  eine kleine Kurve.
- **Smoke:** Kette bauen, EQ setzen, `gain.value` der Filter prüfen.

### B. Cutter-Projekte mit Sammel-Credits

- Ein Projekt sammelt alle Titel und Sounds, die man für ein Video nutzt, und erzeugt am Ende eine
  fertige Credit-Liste für die Videobeschreibung.
- Speichern in `cleanmusic.cutprojects.v1`:
  `{ active, projects: [{ id, name, created, items: [{ key, title, artist, license, licenseUrl, credit, source, url }] }] }`.
- **Im Cutter:**
  - oben eine Projekt-Auswahl (Standard „Kein Projekt“)
  - an jedem Eintrag „Zum Projekt“
  - Downloads im Modus „Nur Cutting“ kommen automatisch ins aktive Projekt
- **Projektansicht:**
  - Liste, Entfernen
  - „Credits kopieren“: YouTube-Beschreibungsformat, nach Lizenz gruppiert, ohne Duplikate
  - „Credits als .txt speichern“
- Speichern der .txt über einen neuen IPC `project-credits-save` in `main.js`:
  - Ziel ist nur `<Cutting-Ordner>/_Projekte/<bereinigter Name>.txt`, nur `.txt`, höchstens 1 MB.
  - Mit `path.relative` prüfen, dass das Ziel im Cutting-Ordner bleibt.
- Download-Ziele, Allowlist und Lizenzprüfung bleiben **unverändert**.

### C. WAV-Ausschnitt: Fade, Normalisieren, Loop

- Optionen im Schnittbereich (Wellenform):
  - Fade-in und Fade-out (0–5 s)
  - Normalisieren (Spitze −1 dBFS)
  - „Loop-tauglich“ (Übergang Ende→Anfang 50–500 ms)
- Bearbeitung im Renderer am dekodierten `AudioBuffer` vor dem WAV-Encoding. Die Prüfungen in
  `cut-save` bleiben unverändert (nur CC0/CC BY/PD).
- **Lizenz:** CC BY verlangt, Änderungen anzugeben. Die Credit-.txt bekommt deshalb eine Zeile
  „Änderungen: Ausschnitt, Fade, normalisiert …“ mit den tatsächlich gewählten Änderungen.

### D. Rückblick als Bild teilen

- In `#view-review` gibt es den Knopf „Als Bild teilen“. Er zeichnet ein Canvas im Format
  1080×1920 (Story) oder 1080×1080 (Post).
- Inhalt:
  - Top-5-Künstler und -Titel, Hörminuten, Lieblingsquelle
  - Theme-Farben aus den CSS-Variablen
  - Logo (`renderer/assets/logo.svg`) und „CleanMusic“
- **Keine Cover:** Fremde Bilder machen das Canvas unbrauchbar, und an den Covern hat CleanMusic
  keine Rechte.
- Speichern über einen neuen IPC `save-png`:
  - `dialog.showSaveDialog` mit dem Bilder-Ordner als Standard
  - nur `data:image/png;base64,`, höchstens 15 MB
- Zusätzlich „In Zwischenablage“ über `clipboard.writeImage`.

### E. Automatisches Backup in einen Ordner (klein)

- Option „Backup automatisch speichern“: wöchentlich ein JSON wie das vorhandene Backup in einen
  selbst gewählten Ordner, z. B. OneDrive. Das gibt eine Art Sync ohne Konto.
- Höchstens die letzten 5 Dateien behalten und nur eigene Dateien (`cleanmusic-backup-*.json`)
  löschen.

### F. Live-Hintergründe und bewegter Vollbild-Hintergrund

Vorhanden sind `BACKGROUNDS` in app.js (`none`, `aurora`, `gradient`, `mesh`, `cover`, `stars`),
`html[data-bg]`, `#app-bg`, der Bewegungs-Schalter `bgMotion` (`html.bg-still`) und im Vollbild
`.fs-bg` (das Cover verschwommen, `fs-drift`). Darauf aufbauen und nichts davon entfernen.

**1. Neue Live-Hintergründe** (in `BACKGROUNDS` mit `live: true`):

| Hintergrund | Umsetzung |
|---|---|
| Lava-Lampe | große, weiche Farbblasen in Theme-Farben, die langsam verschmelzen |
| Wellen | fließende Linien |
| Synthwave-Gitter | Retro-Gitter mit Sonne, läuft auf den Betrachter zu |
| Partikel-Nebel | langsame Lichtpunkte mit Tiefenschärfe |
| Regen auf Glas | Tropfen mit weicher Unschärfe |

- Umsetzung mit **einem** Canvas in `#app-bg` (neue Datei `renderer/live-bg.js`) oder reinem CSS.
- Farben immer aus den Theme-Variablen (`--accent-rgb` usw.), nie fest.

**2. Eigenes Video oder GIF als Hintergrund** (wie bei Wallpaper Engine):

- Eintrag „Eigenes Video …“ öffnet über einen neuen IPC `live-bg-pick` einen Dateidialog.
  - Nur `.mp4`, `.webm` und `.gif`, höchstens 300 MB.
  - Den Pfad in `cleanmusic-config.json` speichern, die Datei nicht kopieren.
- Abspielen stumm, in Schleife und ohne Ton-Weiterleitung (eigenes `<video muted loop>`, nie
  über die Audio-Kette).
- CSP in `renderer/index.html` für `media-src file:` prüfen.
- Fehlt die Datei später, auf „Keiner“ zurückfallen und einen Hinweis zeigen.

**3. „Mit der Musik pulsieren“** (Schalter, Standard aus):

- `renderer/visualizer.js` bekommt eine neue Funktion `level()` mit geglätteter Bass-Energie
  (0–1) aus dem vorhandenen Analyser. Der Ton wird dafür **nicht** umgeleitet.
- app.js setzt daraus per `requestAnimationFrame` die CSS-Variable `--beat` am Root, höchstens
  30× pro Sekunde und nur während der Wiedergabe.
- Hintergründe nutzen `--beat` für leichtes Zoomen, Helligkeit oder Tempo. Kein Flackern:
  Ausschlag begrenzen, Helligkeit höchstens ±15 %.

**4. Vollbild: „Bewegter Hintergrund“** (Auswahl im Vollbild-Menü und in den Einstellungen):

| Option | Verhalten |
|---|---|
| Cover ruhig | wie bisher |
| Cover bewegt | Standard. Der verschwommene Cover-Hintergrund driftet, zoomt und dreht leicht im Takt (`--beat`), mit sanfter Farbverschiebung. |
| Live-Hintergrund | der gewählte Live-Hintergrund, verschwommen hinter dem Player |
| Aus | dunkle Fläche |

Speichern in `state.settings.fsBackground`.

**5. Leistung und Rücksicht:**

- Animation anhalten bei `document.hidden`, im minimierten Fenster und im Mini-Player-Modus
  (Hauptfenster versteckt).
- Höchstens 30 fps, Canvas-Auflösung mit `devicePixelRatio` höchstens 1.
- `prefers-reduced-motion` und `bgMotion: false` stoppen jede Bewegung.
- Option „Im Akkubetrieb anhalten“ (Standard an) über `navigator.getBattery()`, wenn vorhanden.
- In der Ansicht „Einfach“ nur die Auswahl zeigen. Pulsieren und Akku-Option sind `advanced-only`.

**6. Smoke `SMOKE_LIVEBG`:**

- Jeden Live-Hintergrund setzen und prüfen, dass das Canvas nicht leer ist (Pixelprobe).
- `--beat` ändert sich bei Wiedergabe.
- Bei `document.hidden` bzw. `bgMotion: false` läuft keine Animationsschleife mehr.
- Die Vollbild-Optionen setzen die richtigen Klassen bzw. Attribute.

---

## 1.14.0 – Streamer Phase 2 + Smart-Playlists

### A. Streamer.bot-Plugin 1.3.0 (`extras/plugins/streamerbot.js`)

- **`/voteskip?user=`:**
  - Benötigte Stimmen (Standard 3) und Zeitfenster (60 s) als Einstellung.
  - Jede Person zählt einmal, Zurücksetzen bei Titelwechsel.
  - Antwort „2/3 Stimmen zum Überspringen“.
- **Rollen:**
  - `/request?…&role=viewer|sub|vip|mod`.
  - Einstellungen je Rolle: maximal offene Wünsche und Wartezeit. Option „Mods ohne Limit“.
  - In der Anleitung **nur echte Streamer.bot-Variablen** verwenden. Die Namen in der
    Streamer.bot-Dokumentation nachschlagen, nicht raten.
- **`/sron` und `/sroff`** (nur Mods, mit Token): Wünsche öffnen oder schließen, bleibt gespeichert.
  Antwort bei geschlossenen Wünschen: „Songwünsche sind gerade zu“.
- **Kanalpunkte:**
  - `&reward=1` umgeht Wartezeit und Limit pro Person.
  - KI-Filter, Maximallänge und Duplikat-Prüfung gelten weiter.
  - Anleitung für den Reward-Trigger mit der Eingabe des Zuschauers.
- **`/myrequests?user=`:** eigene offene Wünsche mit Position.
- Den Smoke-Test `smoke:streamerbot` um diese Fälle erweitern. Plugin-README und
  ZIP-Beschreibung pflegen.

### B. OBS-Overlay 1.2.0 (`extras/plugins/obs-overlay.js`)

- Neue Seite `/requests`: die nächsten 5 Wünsche mit „von <Name>“, dieselben Stil-Parameter wie
  die übrigen Seiten.
- `/song` zeigt „Gewünscht von <Name>“, wenn der Titel ein `requestedBy` hat.
- Daten über das vorhandene `ctx.player.requests()`. `smoke:obs` erweitern.

### C. Smart-Playlists

- Regelbasierte Listen, die sich selbst aktualisieren.
- Speichern in `cleanmusic.smartlists.v1`:
  `[{ id, name, match: 'all'|'any', rules: [{ field, op, value }], sort, limit }]`.
- **Felder:** Quelle, Künstler, Favorit, Stimmung (lokal, `cleanmusic.localmoods.v1`), BPM
  (`cleanmusic.bpm.v1`), Wiedergaben und „zuletzt gehört vor X Tagen“ (Hör-Verlauf), hinzugefügt am.
- **Quelle der Titel:** Favoriten, Playlists, Verlauf und lokale Bibliothek, ohne Duplikate.
- **Vorlagen:**
  - „Lange nicht gehört“
  - „Meine Top 50“
  - „Schnell (über 140 BPM)“
  - „Entspannt (lokal, ruhig)“
- Anzeige in der Bibliothek mit eigenem Symbol, Inhalt nur lesbar. „Als normale Playlist speichern“
  erzeugt eine Kopie.
- **Smoke:** Liste mit 2 Regeln anlegen und Ergebnis prüfen.

---

## 1.15.0 – Englische Oberfläche (in Etappen)

- `renderer/i18n.js` mit `t(key, vars)`, Wörterbüchern `de` und `en`. Ein fehlender Schlüssel fällt
  auf Deutsch zurück und wird in der Diagnose gezählt.
- Einstellung „Sprache: System / Deutsch / English“ (`cleanmusic-config.json`), sodass auch `main.js`
  Dialoge, Tray-Menü und Benachrichtigungen übersetzt.
- **Etappe 1:** Navigation, Player-Leiste, Einstellungen, häufige Meldungen.
- **Etappe 2:** alle Ansichten (Start, Bibliothek, Rückblick, Downloads, Künstler).
- **Etappe 3:** Cutter, Plugins, Erste Schritte, `WHATS_NEW` je Sprache, Website `site/` auf
  Englisch.
- Plugin-API: `ctx.app.language` (nur lesen), in `docs/PLUGIN-API.md` dokumentieren.
- **Smoke `SMOKE_I18N`:** auf `en` schalten, wichtige Ansichten öffnen, null fehlende Schlüssel
  erwarten.

---

## Danach: Android, Android TV, Google TV und Fire TV (eigenes Projekt)

Läuft parallel zu den Desktop-Versionen, **nicht** in deren Releases. Ordner `mobile/` im selben
Repository mit **Capacitor**. Die Oberfläche aus `renderer/` wird wiederverwendet. `app.js` hat
schon eine Ersatz-Brücke für den Betrieb ohne Electron; Teile, die nur auf dem Desktop gehen,
werden dort ausgeblendet. Eigene Versionsnummern (`mobile-1.0.0` …), eigene Release-Assets
`CleanMusic-Android-<version>.apk`. Die Namen der Desktop-Assets bleiben unverändert, sonst bricht
der Updater.

**Grundsätze:**
- **Vertrieb nur als APK über GitHub-Releases, ohne Play Store und Amazon Appstore.** Eine APK
  für alles (Handy, Tablet, Android TV, Google TV, Fire TV); die App erkennt das Gerät selbst.
- Keine eingebetteten Streaming-Web-Player. Stattdessen „In Spotify / YouTube Music / Apple Music
  öffnen“ per Deep Link in die offizielle App.
- Keine Plugins: Node-Code läuft auf Android nicht. Kein yt-dlp, keine Stream-Downloads, keine
  Werbeblocker. Die Regeln aus AGENTS.md gelten unverändert.
- Was mitkommt: Vorschauen (Deezer/Apple), Radio, Favoriten, Playlists, Verlauf, Rückblick,
  Songtexte mit Effekten, Themes, Live-Hintergründe, Plattenspieler und Visualizer, Songs teilen.
  Den Cutter-Modus gibt es nur auf Handy und Tablet, nicht auf dem Fernseher.
- Netzwerkzugriffe aus `main.js` (Katalog, Charts, Radio, `lyrics-get`, Künstlerseiten) werden in
  `mobile/src/native.js` über `CapacitorHttp` nachgebaut, mit denselben Allowlists und Prüfungen.

### Phase 1 – Android-App für Handy und Tablet (Voraussetzung für TV)

- Capacitor-Projekt `mobile/`, Build-Skript kopiert `renderer/` hinein und setzt die
  Mobile-Brücke ein.
- **Hintergrund-Wiedergabe** mit Sperrbildschirm- und Benachrichtigungs-Steuerung (MediaSession,
  Foreground-Service). Das ist der schwierigste Teil, zuerst als Prototyp bauen.
- Lokale Musik über die Android-Medienbibliothek (Berechtigung `READ_MEDIA_AUDIO`, nur nach
  Rückfrage).
- **Eingebauter Updater** (es gibt keinen Store, der das übernimmt):
  - Die App prüft beim Start und alle 6 h die GitHub-Releases, wie die Desktop-App.
  - Neue APK laden, Größe und SHA-256 (`digest`) prüfen, dann den Android-Installer öffnen
    (Berechtigung `REQUEST_INSTALL_PACKAGES`). Der Nutzer bestätigt mit einem Klick.
  - Hinweis-Karte „Update verfügbar“ mit „Updaten“ / „Später“, auch auf dem Fernseher per
    Fernbedienung bedienbar.
- Signierschlüssel für die APK sicher und **außerhalb des Repos** aufbewahren. Ohne ihn sind keine
  Updates mehr möglich.

### Phase 2 – „CleanMusic TV Lite“ für Android TV und Google TV

Dieselbe APK. Auf einem Fernseher (`UiModeManager`, `html[data-device="tv"]`) startet automatisch
die **Lite-Version**: eine schlanke Anzeige für den großen Bildschirm, gesteuert **hauptsächlich
per Handy**.

**Weggelassen in der Lite-Version:**
- Cutter-Modus, Downloads und Downloads-Liste
- Wellenform und BPM
- Rückblick
- Plugins
- Playlist-Import
- lokale Musik
- Ansicht „Erweitert“

Diese Teile werden auf dem Fernseher gar nicht erst geladen (nicht nur ausgeblendet), damit die
App auf schwachen TV-Sticks schnell bleibt.

**Drin:**
- Jetzt läuft (groß, mit Cover und Songtext)
- Radio, Charts, Favoriten
- Songtexte mit Effekten, Themes, Live-Hintergründe, Plattenspieler, Visualizer
- Warteschlange
- **Party-Modus:** Karaoke-Songtexte mittig, Live-Hintergrund dahinter, „Als Nächstes“ unten
  eingeblendet

**Handy-Steuerung (Hauptbedienung):**
- Der Fernseher zeigt auf dem Startbildschirm groß einen **QR-Code** mit dem Text „Mit dem Handy
  scannen“. Das Handy öffnet die Steuerseite im Browser, **ohne App**.
- Die Steuerseite ist **dieselbe wie am Desktop** (`renderer/remote/index.html`), mit derselben
  API wie in 1.12:
  - `/api/state`, `/api/cmd`, `/api/search`, `/api/queue`, `/api/events`
  - neu `/api/radio` und `/api/favorites`, damit man vom Handy aus Sender und Favoriten wählen
    kann
- Auf dem Fernseher läuft dafür ein kleiner HTTP-Server als nativer Capacitor-Plugin (Kotlin,
  z. B. NanoHTTPD). Gleiche Schutzmaßnahmen wie in 1.12:
  - Schlüssel bei jeder Anfrage, nur Loopback/private IPv4, `Host`-Prüfung
  - 20 Anfragen pro Sekunde, höchstens 10 Live-Verbindungen
  - „Neuen Link erzeugen“
  - Der Server läuft nur, solange die App offen ist.
- **Die Suche läuft übers Handy**, nicht über die Bildschirmtastatur. Auf dem Fernseher gibt es
  nur einen Hinweis „Suchen? Nimm dein Handy“.
- Mehrere Handys gleichzeitig erlaubt (Party). Am Fernseher werden kurz Gerät und Aktion
  eingeblendet, z. B. „Handy 2 hat einen Song eingereiht“.
- **Koppeln per QR:** Der Desktop kann über denselben Weg Favoriten und Playlists auf den
  Fernseher schicken. Am Fernseher muss man das einmal bestätigen.

**Fernbedienung nur als Notlösung:**
- Play/Pause, Weiter/Zurück, Lautstärke und Zurück-Taste funktionieren immer.
- Einfache Fokus-Navigation mit klar sichtbarem Fokusrahmen für Start, Radio, Favoriten und
  Party-Modus. Keine tiefen Menüs, keine Hover-Bedienung, keine Wischgesten.
- Große Schrift (mindestens 24 px), Ränder für Overscan (5 %).
- **Nötig, damit die App auf dem TV-Startbildschirm erscheint (auch ohne Store):**
  - im Manifest `android.software.leanback` (`required=false`) und `android.hardware.touchscreen`
    (`required=false`)
  - `LEANBACK_LAUNCHER`-Eintrag
  - TV-Banner 320×180
- **Test:** Emulator „Android TV“ bzw. „Google TV“ in Android Studio, danach auf einem echten Gerät.

### Phase 3 – Fire TV

- Fire TV mit **Fire OS** basiert auf Android: dieselbe TV-App, getestet auf Fire TV Stick bzw.
  Fire TV Cube.
- Vertrieb über dieselbe APK, kein Amazon Appstore.
- **Achtung:** Neuere Fire-TV-Geräte mit **Vega OS** können keine Android-Apps ausführen. Vor dem
  Start prüfen, welche Geräte das betrifft, und auf der Download-Seite deutlich angeben.

### Für Endnutzer einfach machen

- Kurzer Download-Link auf der Landingpage, z. B. `/android` und `/tv`, der zur neuesten APK
  weiterleitet. Mit der TV-Fernbedienung muss man nur wenige Zeichen tippen.
- Auf der Landingpage eine bebilderte Schritt-für-Schritt-Anleitung „Auf Fire TV / Google TV
  installieren“:
  - Entwickleroptionen einschalten (7× auf Gerätename bzw. Build tippen).
  - Der App „Downloader“ das Installieren erlauben.
  - Den kurzen Link eingeben.
  - Bei einer Play-Protect-Warnung „Trotzdem installieren“ wählen, und erklären, warum die Warnung
    kommt.
  - Alternative ohne Downloader: APK per USB-Stick und Dateimanager.
- Die SHA-256 jeder APK in den Release-Notes angeben.
- Kein Konto, keine Anmeldung. Die App startet direkt mit Radio und Charts.

### Tests (mobile)

- Eigenes Smoke-Skript `mobile/smoke` (Emulator, headless):
  - App startet
  - Vorschau spielt
  - Radio spielt
  - Fokus-Navigation erreicht alle Hauptbereiche (TV)
  - TV Lite: kein Cutter und keine Downloads geladen; die Handy-Steuerseite verbindet sich mit
    Schlüssel, ohne Schlüssel kommt 401; `/api/search` und `/api/queue` funktionieren
  - Hintergrund-Wiedergabe läuft nach dem Sperren weiter

---

## Bewusst später oder gar nicht

- **iOS und Apple TV:** brauchen einen Mac, ein Apple-Entwicklerkonto (99 $/Jahr) und für Apple TV
  eine komplett neue Oberfläche (keine Web-Ansicht auf tvOS). Erst, wenn Android gut läuft.
- **Samsung (Tizen) und LG (webOS):** eigene SDKs und Stores, zu viel Aufwand für zu wenig Nutzen.
- **Code-Signatur:** kostet jährlich Geld. Lohnt sich, sobald die Downloads steigen
  (SmartScreen-Warnung).
- **Songtext-Übersetzung, Songtext-Export:** rechtlich heikel, nicht einbauen.
- **Cloud-Konto, Telemetrie, Werbeblocker, Stream-Downloads:** nie (siehe AGENTS.md).

## Ablauf je Version (Checkliste)

1. Version in `package.json` erhöhen, `WHATS_NEW`-Eintrag, `README.md`, `AGENTS.md` („Stand“ +
   neue Abschnitte/Namen) und bei Bedarf `LEGAL.md` und `docs/PLUGIN-API.md` pflegen.
2. `node --check` für alle geänderten JS-Dateien.
3. `npm.cmd run smoke` muss 0 `_FAIL` zeigen. Bei Plugin-Änderungen zusätzlich `smoke:streamerbot`
   bzw. `smoke:obs`.
4. Neue Kürzel in `SHORTCUTS`, neue Dateien in `build.files` prüfen.
5. Committen (Autor wie bisher), **nicht pushen, kein Tag.** Das Release kommt erst nach Prüfung
   und ausdrücklichem OK.
