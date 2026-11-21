# Optionale Plugins

Diese Plugins gehören **nicht** zu CleanMusic und werden nie automatisch geladen.
So nutzt du eines:

1. CleanMusic öffnen → **Einstellungen → Plugins → Plugin hinzufügen** und die
   `.js`-Datei auswählen (oder auf den Plugin-Bereich ziehen).
2. Den Schalter beim Plugin einschalten und die Rückfrage bestätigen.

## OBS Now-Playing (`obs-overlay.js`)

Zeigt den laufenden Titel als Overlay in OBS oder Streamlabs.

1. Plugin wie oben hinzufügen und einschalten.
2. In der Plugin-Karte auf **Overlay-URL kopieren** klicken
   (Standard: `http://127.0.0.1:4787/overlay`).
3. In OBS: **Quelle hinzufügen → Browser**, URL einfügen, Breite **600** und Höhe **160**.

Stile: **Karte mit Cover** (Standard), **Schmale Leiste**, **Nur Text**. Den Stil
kannst du in der Plugin-Karte wählen oder pro Quelle mit `?style=card`,
`?style=bar` oder `?style=minimal` an der URL festlegen.

Optional schreibt das Plugin `nowplaying.txt`, `title.txt`, `artist.txt` und
`cover.jpg` (Standardordner: `Dokumente\CleanMusic OBS`) für OBS-Text- und
Bildquellen.

Der Server lauscht nur auf `127.0.0.1` und beantwortet nur Anfragen an
`127.0.0.1` oder `localhost`. Andere Geräte und Webseiten kommen nicht heran.
