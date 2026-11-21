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

## Streamer.bot (`streamerbot.js`)

Chat-Befehle für **Twitch** über [Streamer.bot](https://streamer.bot): `!song` schreibt
den aktuellen Titel in den Chat, `!skip` springt weiter, `!pause` pausiert bzw. setzt fort.

**In CleanMusic**

1. Plugin wie oben hinzufügen und einschalten.
2. In der Plugin-Karte **Adressen kopieren** klicken. Du bekommst drei Zeilen, z. B.:
   ```
   !song   http://127.0.0.1:4788/song
   !skip   http://127.0.0.1:4788/skip?token=…
   !pause  http://127.0.0.1:4788/pause?token=…
   ```
   Den Token nie im Stream zeigen. Falls doch: **Token neu erzeugen** und die
   Adressen in Streamer.bot ersetzen.

**In Streamer.bot** (Menünamen können je nach Version leicht abweichen)

1. **Actions** → neue Action *CleanMusic !song*:
   - Sub-Action **Fetch URL** → die `/song`-Adresse, Ergebnis in die Variable `cmSong`.
   - Sub-Action **Twitch → Send Message to Channel** → Text `%cmSong%`.
2. **Commands** → neuer Command `!song` → Action *CleanMusic !song* zuweisen.
3. Genauso je eine Action mit **Fetch URL** auf die `/skip`- und `/pause`-Adresse
   (optional die Antwort per *Send Message* in den Chat), dazu die Commands
   `!skip` und `!pause`. Diese beiden in Streamer.bot **nur für Moderatoren**
   freigeben.

Einstellungen in der Plugin-Karte: Port (Standard 4788), Text für `!song` mit den
Platzhaltern `{title}`, `{artist}`, `{source}`, `{link}`, Text wenn nichts läuft,
und ein Schalter, der `!skip`/`!pause` komplett abschaltet. Zwischen zwei
Steuerbefehlen liegen mindestens 2,5 Sekunden (Schutz vor Chat-Spam).

Sicherheit: Der Server lauscht nur auf `127.0.0.1`, beantwortet nur Anfragen an
`127.0.0.1`/`localhost`, und Steuerbefehle brauchen den Token – eine Webseite
kann CleanMusic also nicht fernsteuern.
