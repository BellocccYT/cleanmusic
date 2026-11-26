# Bauplan: CleanMusic auf dem CORSAIR XENEON EDGE

Ziel: Ein **richtig intuitiver** Touch-Player für das Xeneon Edge (14,5", 2560 × 720, 5-Punkt-Touch,
Windows). Man schaut kurz hin und weiß, was läuft; man tippt einmal und es passiert genau das,
was man erwartet. Keine Einstellungen nötig, keine Tipperei auf dem Touchscreen.

Stand der Recherche (26.11.2026): Das Edge zeigt **iCUE-Widgets** – HTML/CSS/JS in QtWebEngine 6.9.3
(Chromium 130), gepackt als `.icuewidget`. Doku: https://docs.elgato.com/icue/widgets/ ,
Spezifikation: https://docs.elgato.com/icue/widgets/specification , Werkzeug + KI-Skill:
https://github.com/Corsair-Labs/icue-widget-builder , CLI: `npm i -g icuewidget-cli`
(`icuewidget init|validate|package`). Mindestens **iCUE 5.52**.

## 1. Architektur (zwei Teile)

```
CleanMusic (Electron) ──Plugin-API v3──► extras/plugins/xeneon-edge.js   (lokale Brücke, 127.0.0.1/::1:4790)
                                                   ▲ HTTP + Server-Sent Events (Fallback: Polling)
iCUE auf dem Edge ── Widget „CleanMusic“ ──────────┘  extras/xeneon-edge/widget/ → CleanMusic.icuewidget
```

- **Teil A – CleanMusic-Plugin** `extras/plugins/xeneon-edge.js` (wie `obs-visualizer.js`: eine Datei,
  keine Abhängigkeiten, nie automatisch geladen, erst nach Hinzufügen + Aktivieren mit Rückfrage).
- **Teil B – iCUE-Widget** `extras/xeneon-edge/widget/` (`manifest.json`, `index.html`, `scripts/`,
  `styles/`, `resources/icon.svg`, `resources/thumbnail.png`). Gepackt mit `icuewidget package`;
  die `.icuewidget`-Datei landet in `release/` (nicht in Git).
- **Teil C – kleine Erweiterung der Plugin-API** (siehe 4.). Nichts davon kommt in den App-Build;
  `extras/` bleibt draußen.

Warum nicht das eingebaute iCUE-„Media“-Plugin (`widgetbuilder.mediadataprovider:Media:1.1`)? Es kann
nur Titel/Artist/Album/Cover/isPlaying und Play/Pause/Weiter/Zurück – kein Spulen, keine Lautstärke,
kein Songtext, keine Warteschlange, keine Coverfarben, und ob es die Windows-Medienübersicht (SMTC)
liest, ist nicht dokumentiert. **Optional** als Notlösung im Widget: Ist die Brücke nicht erreichbar,
aber das Media-Plugin liefert „CleanMusic“-Daten, Grundfunktionen darüber anbieten (vorher auf echter
Hardware prüfen, ob CleanMusic dort überhaupt erscheint – CleanMusic setzt `navigator.mediaSession`).

## 2. Erlebnis (das Wichtigste)

### Layouts (responsiv, nach Größe des Widget-Slots)

Dokumentiert sind nur **Small 840 × 344** und **Extra Large 2536 × 696** (quer). Medium/Large und
Hochkant sind nicht dokumentiert → per `ResizeObserver` nach Breite/Höhe/Seitenverhältnis wählen,
nicht nach Slot-Namen.

- **XL / breit (≥ 1600 px):** links großes Cover (volle Höhe minus Rand, abgerundet, leichter Schatten),
  daneben Titel (≥ 44 px, max. 2 Zeilen, dann Lauftext nur bei Bedarf), Artist (≥ 28 px), darunter
  die aktuelle Songtext-Zeile groß + nächste Zeile blass (nur wenn Songtexte in CleanMusic an sind),
  unten Fortschrittsbalken über die ganze Breite der Mitte. Rechts ein Block mit den Knöpfen
  Zurück · **Play/Pause (riesig, ≥ 120 px)** · Weiter, darunter Herz und Lautstärke als breiter Schieber.
  Ganz rechts „Als Nächstes“: 3–4 kleine Zeilen mit Mini-Cover (nur Anzeige).
- **Mittel (900–1600 px):** Cover, Titel/Artist, Fortschritt, Knopfreihe; kein „Als Nächstes“.
- **Small (840 × 344) und kleiner:** Cover links (Höhe minus Rand), rechts Titel/Artist (≥ 28 px),
  Fortschritt, Knopfreihe Zurück · Play/Pause · Weiter. Lautstärke/Herz nur über Gesten.
- **Hochkant / schmal:** Cover oben, Text mittig, Knöpfe unten – gleiche Bausteine, andere Anordnung.

### Bedienung

- **Touch-Ziele mindestens 72 px** (Play/Pause deutlich größer), Abstand ≥ 16 px, nichts Kleines am Rand.
- **Sofortiges Feedback:** Jeder Tipp zeigt sofort den neuen Zustand (optimistische Anzeige), drückt
  den Knopf sichtbar ein; kommt binnen 1,5 s keine Bestätigung, zurücksetzen + kurzer Hinweis.
- **Gesten** (zusätzlich zu den Knöpfen, nie nur über Gesten erreichbar):
  - Tippen aufs Cover = Play/Pause
  - Wischen über Cover/Titel nach links/rechts = Weiter/Zurück (Cover gleitet mit, schnappt zurück, wenn
    der Wisch zu kurz war)
  - Doppeltippen aufs Cover = Favorit (Herz-Animation)
  - Fortschrittsbalken: breite Trefferfläche (≥ 56 px hoch), Ziehen zeigt eine Zeitblase, erst beim
    Loslassen wird gespult; Tippen springt an die Stelle
  - Lautstärke: ziehen; Tippen aufs Lautsprecher-Symbol = stumm/an
- **Zustände, die man versteht:**
  - *Nicht verbunden:* freundliche Schritt-für-Schritt-Karte mit großen Ziffern: „1 · CleanMusic öffnen
    → Einstellungen → Plugins → ‚Xeneon Edge' einschalten“, „2 · Hier auf **Verbinden** tippen“,
    „3 · In CleanMusic **Erlauben** klicken“. Prüft alle 3 s automatisch neu, kein Neustart nötig.
  - *Kopplung läuft:* großer 4-stelliger Code, „Bestätige in CleanMusic denselben Code“.
  - *Nichts läuft:* ruhige Karte „Nichts läuft gerade“ + großer Knopf „Weiterhören“ (play).
  - *Pause:* Cover leicht gedimmt, großer Play-Knopf, Fortschritt bleibt stehen.
  - *Radio/Live:* „LIVE“-Pille statt Fortschrittsbalken, Spulen aus.
  - *CleanMusic weg (Verbindung verloren):* letzter Stand bleibt stehen, kleiner Punkt „offline“,
    Knöpfe ausgegraut, automatischer Neuaufbau (Backoff 1–10 s).
- **Lesbar aus 60 cm:** maximal drei Informationsebenen, hohe Kontraste, keine grauen Mini-Texte.

### Aussehen

- Hintergrund: abgedunkelter Verlauf aus den zwei Coverfarben (`track.colors`), Akzent = erste
  Coverfarbe mit Kontrast-Prüfung (WCAG ≥ 4,5 für Text, sonst aufhellen/abdunkeln); ohne Cover ein
  ruhiges CleanMusic-Blau.
- iCUE „Custom Style“: Eigenschaften `textColor`, `accentColor`, `backgroundColor` in einer Gruppe
  anbieten (iCUE blendet dann den Schalter ein); aus = Coverfarben.
- Cover-Wechsel weich überblenden (≤ 300 ms), sonst keine Dauer-Animationen. Optional (Schalter,
  Standard an im XL-Layout): dezentes Mini-Spektrum hinter dem Fortschrittsbalken in der Akzentfarbe,
  höchstens 20 fps, nur beim Abspielen. `prefers-reduced-motion` → keine Bewegung außer Fortschritt.
- Schrift: Systemschrift (Segoe UI Variable) oder eine kleine, frei lizenzierte woff2 im Widget
  (dann Lizenz mitliefern). Zahlen `tabular-nums`.
- Bei langer Pause (> 10 min) sanft dimmen; erste Berührung weckt nur (löst nichts aus).

### iCUE-Eigenschaften (Rechtsklick/Einstellungen des Widgets, alle optional)

`showLyrics` (Schalter, an), `showQueue` (Schalter, an), `showSpectrum` (Schalter, an),
`layout` (Auswahl: Automatisch · Kompakt · Groß), dazu die drei Farben für „Custom Style“ und als
Notlösung ein Textfeld `pairKey` („Kopplungsschlüssel, nur falls Verbinden nicht klappt“).
Keine Port-Einstellung – fest **4790** (die `url`-Berechtigung im Manifest ist an den Port gebunden).

## 3. Teil A – das CleanMusic-Plugin `extras/plugins/xeneon-edge.js`

Manifest-Kopf (v3, Modul darf `apiVersion: 2` bleiben):

```js
/* cleanmusic-plugin
{ "apiVersion": 3, "name": "Xeneon Edge", "version": "1.0.0",
  "description": "Touch-Player für das CORSAIR XENEON EDGE (iCUE-Widget).",
  "permissions": ["player", "visualizer", "server:local", "ui:settings", "ui:panel", "clipboard",
                  "external-links", "network:dzcdn.net", "network:mzstatic.com", "network:ytimg.com",
                  "network:googleusercontent.com"] }
*/
```

- **Server** auf `127.0.0.1:4790` **und** `[::1]:4790` (das Widget ruft `http://localhost:4790` auf;
  niemals `0.0.0.0`/`::`). `Host`-Prüfung: nur `localhost:4790`, `127.0.0.1:4790`, `[::1]:4790`
  (Schutz gegen DNS-Rebinding). Port belegt → klarer Status „Port 4790 ist belegt“.
- **CORS:** Herkunft des Widgets ist unbekannt (QtWebEngine) → `Access-Control-Allow-Origin: *`,
  keine Cookies; Preflight (`OPTIONS`) beantworten inkl. `Access-Control-Allow-Private-Network: true`.
  Sicherheit kommt vom Token, nicht von CORS.
- **Kopplung (statt Tippen):** `POST /api/pair` → `{ pairId, code }` (4 Ziffern, 2 min gültig, höchstens
  eine offene Anfrage). Das Plugin zeigt den Code im Panel (`ctx.ui.panel`, Slot `settings`) und per
  `ctx.notify`, dazu eine Aktion **„Xeneon Edge erlauben“** (`actions` mit `when: 'pairing'`,
  `status().flags.pairing`). `GET /api/pair/<pairId>` liefert nach dem Erlauben einmalig `{ token }`
  (32 Byte, base64url). Gespeichert wird nur ein SHA-256 des Tokens in `ctx.dataDir` (höchstens
  3 Geräte); Aktion „Kopplungen zurücksetzen“. Notlösung: Panel zeigt einen Schlüssel mit „Kopieren“
  (`ctx.copyText`) für die Widget-Eigenschaft `pairKey`.
- **Alles außer `/api/pair*` braucht den Header `X-CM-Token`** (zeitkonstanter Vergleich), 20 Anfragen/s,
  höchstens 4 SSE-Verbindungen.
- **Endpunkte:**
  - `GET /api/state` – bereinigter Zustand: `track` (title, artist, album, kind, live, colors,
    `cover` = `/api/cover?v=<id>` statt fremder URL), `playing`, `position`, `duration`, `at`,
    `volume`, `muted`, `favorite`, `lyric`, `upNext` (max. 4, je mit Cover-Pfad), `lyricsOn`.
    Keine Dateipfade, keine Links mit Tokens.
  - `GET /api/events` – Server-Sent Events: `state` bei jeder Änderung, `spectrum` (32 Werte 0–255,
    max. 20/s, nur wenn mindestens ein Client `?spectrum=1` hat und der Plugin-Schalter an ist),
    `ping` alle 15 s. EventSource ist in der iCUE-Doku nicht erwähnt → Widget fällt automatisch auf
    `fetch('/api/state')` jede Sekunde zurück, wenn SSE nicht klappt.
  - `POST /api/cmd` `{ command, value }` – `toggle`, `play`, `pause`, `next`, `previous`, `seek`
    (Sekunden), `volume` (0–1,5), `mute` (bool), `like`. Antwort `{ ok, state }`.
  - `GET /api/cover?v=<id>` – Cover des aktuellen bzw. eines `upNext`-Titels als Bild, vom Plugin über
    `ctx.fetch` geholt (nur `https:` und die Hosts aus dem Manifest, nur `image/*`, max. 2 MB, Cache
    der letzten 12 im Speicher). `data:image/...`-Cover (lokale Dateien) direkt dekodieren. Sonst 404 →
    Widget zeigt Verlauf mit Anfangsbuchstaben. So muss das Widget nur `localhost:4790` erreichen.
- **Einstellungen** (`settings`): `spectrum` (Schalter, an), `lyrics` (Schalter „Songtext ans Widget
  senden“, an). Mehr nicht. Statuszeile: „Bereit – Widget verbunden (1)“ / „Wartet auf das Widget“ /
  „Port belegt“.
- **Panel** (`slot: 'settings'`): Kurzanleitung mit Link „Widget herunterladen“ (`ctx.openExternal` auf
  die GitHub-Release-Seite), Kopplungs-Code während einer Anfrage, Liste der gekoppelten Geräte.
- `onEvent('state'|'nowplaying'|'volume'|'visualizer')` aktualisiert den Zustand; Fehler nie werfen.
  Beim Deaktivieren Server schließen, Port frei (wie `obs-visualizer.js`).

## 4. Teil C – kleine Erweiterung der Plugin-API (CleanMusic 2.2)

Der Renderer kennt die Befehle `seek` und `like` schon (Handy-Fernbedienung, `renderer/app.js`
`case 'seek'` / `case 'like'`), die Plugin-API reicht sie nur noch nicht durch:

- `main.js` `pluginContext` → `player`: `seek: (seconds) => sendPlayerCommand('seek', Number(seconds))`
  und `toggleFavorite: () => sendPlayerCommand('like')` (Berechtigung `player`, wie die anderen).
- Player-Zustand um `favorite: boolean` (aktueller Titel in den Favoriten) und `lyricsOn` ergänzen –
  im Renderer dort, wo `playerSnapshot()` gebaut wird (nach dem Modul-Umbau von `renderer/app.js`
  im neuen Player-Modul).
- `docs/PLUGIN-API.md` (v2-Tabelle + „neu in 2.2“), `AGENTS.md`.
- **Reihenfolge:** Teil C nach (oder zusammen mit) dem Modul-Umbau von `renderer/app.js`, damit es
  keine Konflikte gibt. Teil A/B ändern keinen App-Code. Ohne Teil C blendet das Widget Spulen und Herz
  aus (Plugin meldet `capabilities: { seek, like }` im Zustand).

## 5. Tests und Prüfung

- `test/xeneon-edge.test.js` (in `test:unit`, ohne Electron, wie `test/obs-visualizer.test.js`):
  Plugin mit Fake-`ctx` laden, Server starten; prüfen: falscher `Host` → 403, ohne Token → 401,
  Kopplung (Code, Erlauben, Token einmalig, Ablauf nach 2 min, max. 3 Geräte), `/api/cmd` ruft die
  richtigen `ctx.player`-Funktionen, `/api/state` enthält keine Pfade/fremden URLs, Cover-Proxy nur
  erlaubte Hosts + `image/*` + Größenlimit, SSE liefert `state`, Rate-Limit, Port nach dem
  Deaktivieren frei.
- Reine Widget-Logik in `extras/xeneon-edge/widget/scripts/logic.js` (Layout-Wahl nach Größe,
  Zeitformat, Positions-Hochrechnung aus `at`, Wisch-Erkennung, Kontrastfarben) mit Tests per `vm`.
- `npm.cmd run smoke:xeneon` (wie `smoke:visualizer`): echtes CleanMusic, Plugin aus `extras/plugins/`
  aktivieren, koppeln, Vorschau abspielen, per `/api/cmd` pausieren/weiter/spulen/Lautstärke/Herz,
  Zustand prüft die Wirkung; Fremd-Host gesperrt; Zeilen `SMOKE_XENEON…`, Fehler `…_FAIL`.
- Widget: `icuewidget validate extras/xeneon-edge/widget` und `icuewidget package …` müssen sauber
  durchlaufen (achtung: `index.html` mit `<!DOCTYPE html>` groß, `<head>` als striktes XML).
- **Screenshots** ohne Edge: `index.html` in Electron/Chromium mit einem kleinen iCUE-Stub
  (`icueEvents.onICUEInitialized`, Eigenschaften als globale Variablen) gegen das laufende Plugin in
  **840 × 344** und **2536 × 696** (+ hochkant), Zustände: nicht verbunden, Kopplung, läuft, Pause,
  Radio, offline. Danach auf echter Hardware: Touch, Wischen, SSE vs. Polling, `localhost`-Auflösung.

## 6. Regeln (aus AGENTS.md, gelten hier besonders)

- Plugin nie automatisch laden; nur `127.0.0.1`/`::1`; keine Telemetrie, kein Server im Netz, keine
  Downloads, keine Werbung. Keine Daten außer Titel/Artist/Album/Cover/Songtext-Zeile/Position.
- Inoffiziell: im Widget und in der Doku „Inoffiziell – nicht von CORSAIR“, Markennamen nur
  beschreibend („für CORSAIR XENEON EDGE“), kein Corsair-Logo.
- Doku: `extras/plugins/README.md` (Installation in 3 Schritten), `README.md` (kurzer Abschnitt),
  `docs/PLUGIN-API.md` (Teil C), `AGENTS.md` (Aufbau + Testen), `WHATS_NEW` nur, wenn Teil C in eine
  App-Version kommt. Release: `.icuewidget` optional als zusätzliches Asset
  `CleanMusic-Xeneon-Edge-<version>.icuewidget` – die Namen der App-Assets bleiben unverändert
  (Updater!).

## 7. Offen / auf echter Hardware klären

- Funktionieren `EventSource` und `localhost` vs. `127.0.0.1` im iCUE-Widget? (Fallback Polling ist Pflicht.)
- Echte Pixelgrößen von Medium/Large und Hochkant-Slots.
- Liest das iCUE-Media-Plugin die Windows-Medienübersicht (und damit CleanMusic)?
- Zeigt iCUE die `url`-Berechtigung beim Import verständlich an?
