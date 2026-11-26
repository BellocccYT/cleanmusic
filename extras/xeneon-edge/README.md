# CleanMusic auf dem CORSAIR XENEON EDGE

Inoffiziell – **nicht von CORSAIR**. Markennamen nur beschreibend, kein
Corsair-Logo.

Zwei Teile:

```
CleanMusic ──Plugin-API v3──► extras/plugins/xeneon-edge.js  (localhost:4790)
                                        ▲ HTTP + SSE (Fallback: Polling)
iCUE auf dem Edge ── Widget „CleanMusic“ ┘  extras/xeneon-edge/widget/
```

## Installation

1. **Plugin:** `extras/plugins/xeneon-edge.js` in CleanMusic unter
   **Einstellungen → Plugins → Plugin-Datei hinzufügen** wählen und
   einschalten.
2. **Widget:** `CleanMusic-Xeneon-Edge-<version>.icuewidget` aus dem
   GitHub-Release in iCUE importieren, auf dem Edge öffnen.
3. Im Widget **Verbinden** antippen; in CleanMusic erscheint ein 4-stelliger
   Code. Denselben Code mit **Xeneon Edge erlauben** bestätigen.

Das Widget merkt sich den Schlüssel (nur lokal, nur für `localhost:4790`).
Höchstens drei Geräte; **Kopplungen zurücksetzen** entfernt alle.

## Bedienung

- **Tippen** aufs Cover: Play/Pause.
- **Doppeltippen** aufs Cover: Favorit (sobald die Plugin-API `like` liefert).
- **Seitlich wischen** auf Cover/Titel: Weiter/Zurück.
- **Senkrecht ziehen** auf dem Cover: Lautstärke; auf dem Lautsprecher-Symbol
  tippen: stumm/an (in mittleren/großen Layouts).
- **Fortschrittsbalken:** breite Trefferfläche, Ziehen zeigt die Zeitblase,
  Loslassen spult (sobald `seek` verfügbar ist).
- Große Knöpfe bleiben immer sichtbar; Gesten sind nur eine Zugabe.

Layouts: 840 × 344 (kompakt), mittlere Breiten, 2536 × 696 (breit mit „Als
Nächstes“), hochkant (696 × 840 und höher). Die Wahl erfolgt über
Seitenverhältnis/Breite, nicht über den Slot-Namen.

## Stile

Der Stil ist eine iCUE-Eigenschaft (`style`) und lässt sich jederzeit wechseln:

| Stil | Aussehen |
|---|---|
| **Automatisch (Cover)** | Hintergrund und Akzent aus den zwei Coverfarben (Standard) |
| **Nacht** | Ruhiges Marineblau/Schwarz, blauer Akzent |
| **Neon** | Fast schwarz mit Pink und Cyan-Glühen, feine Scanlines |
| **Glas** | Dunkles Glas mit hellblauem Akzent, weichgezeichnete Flächen |
| **Hell** | Helle Fläche, dunkle Schrift, kräftiger blauer Akzent |
| **Retro** | Warmes Braun/Creme, Amber-Akzent, leichte Vignette |

Jeder Stil prüft die Text- und Akzentfarben gegen den Hintergrund (WCAG 4,5:1);
„Custom Style“ in iCUE überschreibt die Farben, der Stil bleibt für Flächen,
Glühen und Effekte zuständig. Screenshots: `screenshots/styles-840x344-*.png`.

## iCUE-Einstellungen

| Eigenschaft | Standard | Wirkung |
|---|---|---|
| `layout` | Automatisch | Automatisch, Kompakt oder Groß |
| `style` | Automatisch (Cover) | Nacht, Neon, Glas, Hell oder Retro |
| `showLyrics` | an | aktuelle + nächste Songtext-Zeile |
| `showQueue` | an | „Als Nächstes“ im breiten Layout |
| `showSpectrum` | an | dezentes Mini-Spektrum (max. 20 fps) |
| `pairKey` | leer | Kopplungsschlüssel als Notlösung |
| `textColor` / `accentColor` / `backgroundColor` | siehe Kopf | „Custom Style“; alle drei auf Standard = Coverfarben |

## Tests und Prüfung

```powershell
node test\xeneon-edge.test.js          # in npm run test:unit enthalten
npm.cmd run smoke:xeneon               # echtes CleanMusic + Plugin
icuewidget validate extras\xeneon-edge\widget
icuewidget package extras\xeneon-edge\widget -o release\CleanMusic-Xeneon-Edge-1.0.0.icuewidget
node_modules\.bin\electron.cmd extras\xeneon-edge\preview\shoot.js
node_modules\.bin\electron.cmd extras\xeneon-edge\preview\styles.js
```

`preview/shoot.js` rendert die Screenshots in `screenshots/` (840 × 344,
2536 × 696 und 696 × 840; Zustände: nicht verbunden, Kopplung, läuft, Pause,
Radio, offline, nichts läuft) mit einem iCUE-Stub und festen Beispieldaten –
ohne Edge. `preview/styles.js` rendert alle sechs Stile in 840 × 344,
`preview/make-assets.js` Icon, Vorschau, Thumbnail und das Beispiel-Cover.

## Sicherheit

Das Widget spricht nur `http://localhost:4790` an (Manifest-Berechtigung
`url`, Port gebunden). Das Plugin lauscht nur auf `127.0.0.1` und `::1`,
prüft den `Host`-Header (DNS-Rebinding), verlangt außer `/api/pair*` einen
32-Byte-Schlüssel (Header `X-CM-Token`; bei Bildern/SSE als `?k=`, weil diese
keine Header senden können) und begrenzt auf 20 Anfragen/s sowie vier
SSE-Verbindungen. Gespeichert werden nur SHA-256-Hashes der Schlüssel in
`<userData>/plugin-data/xeneon-edge/devices.json`. Keine Telemetrie, keine
Downloads, keine Werbung; übertragen werden nur Titel, Artist, Album, Cover,
Songtext-Zeile, Position und Lautstärke.

## Teil C (noch offen)

`seek` und `toggleFavorite` fehlen noch in der Plugin-API (Plan:
`docs/PLAN-XENEON-EDGE.md`, Abschnitt 4) und kommen nach dem Modul-Umbau von
`renderer/app.js`. Das Plugin erkennt sie automatisch (`capabilities.seek` /
`capabilities.like`), das Widget blendet Fortschritts-Ziehen und Herz bis
dahin aus. Der Smoke meldet dafür `seekStatus`/`likeStatus: 501`.
