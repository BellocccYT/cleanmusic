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

**Ab 1.1.0** zusätzlich: **Plattenspieler** (Cover dreht sich), **Neon**, **Glas**,
**Equalizer**, **Laufschrift** (ganze Breite, z. B. 1920 × 60), **Großes Cover**
(Ecke, 260 × 330) und **Songtext** (aktuelle Zeile, 1000 × 170; Songtexte in CleanMusic
einschalten). Zweite Browserquelle **„Als Nächstes“** über „„Als Nächstes“-URL
kopieren“ (`http://127.0.0.1:4787/upnext`, 520 × 320) – zeigt die nächsten Titel und
Songwünsche mit Namen; `?only=requests` nur Wünsche, `?count=3` weniger Zeilen.

Stile: **Karte mit Cover** (Standard), **Schmale Leiste**, **Nur Text**. Den Stil
kannst du in der Plugin-Karte wählen oder pro Quelle mit `?style=card`,
`?style=bar` oder `?style=minimal` an der URL festlegen.

Optional schreibt das Plugin `nowplaying.txt`, `title.txt`, `artist.txt` und
`cover.jpg` (Standardordner: `Dokumente\CleanMusic OBS`) für OBS-Text- und
Bildquellen.

Der Server lauscht nur auf `127.0.0.1` und beantwortet nur Anfragen an
`127.0.0.1` oder `localhost`. Andere Geräte und Webseiten kommen nicht heran.

## OBS Audio-Visualizer (`obs-visualizer.js`)

Ein echter, musikreaktiver Visualizer für OBS: Die Balken, der Kreis oder die
Welle folgen dem Spektrum, das CleanMusic gerade analysiert – nicht nur dem
Play/Pause-Zustand. Die Farben kommen aus dem Cover.

1. Plugin wie oben hinzufügen und einschalten.
2. In der Plugin-Karte auf **Visualizer-URL kopieren** klicken
   (Standard: `http://127.0.0.1:4789/visualizer`).
3. In OBS: **Quelle hinzufügen → Browser**, URL einfügen, Hintergrund
   transparent lassen. Empfohlene Größe: **800 × 300** für Balken, Spiegel und
   Welle, **420 × 420** für den Kreis.

Stile: **Balken** (Standard), **Spiegel** (wächst von der Mittellinie),
**Kreis** und **Welle**. In der Plugin-Karte wählbar oder pro Quelle über
`?style=bars`, `?style=mirror`, `?style=radial` bzw. `?style=wave` an der URL.
Weitere Einstellungen: **Anzahl Balken** (8–64), **Breite** in Prozent (30–100,
der Rest bleibt transparent), **Abstand** zwischen den Balken (0–20 px),
Empfindlichkeit, Leuchten, dunkler Hintergrund, Titel/Künstler einblenden und
„Bei Pause ausblenden“.

Der Visualizer braucht ein aktives Plugin mit der Fähigkeit
`visualizer: true` (ab CleanMusic 1.15.0). Erst dann schickt CleanMusic das
Spektrum mit etwa 25 Bildern pro Sekunde an den lokalen Server. Der Server
lauscht nur auf `127.0.0.1`; andere Geräte und Webseiten kommen nicht heran.

## Streamer.bot (`streamerbot.js`)

Chat-Befehle für **Twitch** über [Streamer.bot](https://streamer.bot): `!song` schreibt
den aktuellen Titel in den Chat, `!skip` springt weiter, `!pause` pausiert bzw. setzt fort.
Optional: Songwünsche mit `!sr` (siehe unten).

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

### Songwünsche (optional, ab Plugin 1.1.0 und CleanMusic 1.0.1)

Zuschauer wünschen sich mit `!sr Titel oder Artist` einen Song. CleanMusic sucht
ihn, nimmt den passendsten Treffer und reiht ihn in die Warteschlange ein – dort
steht er unter **„Songwünsche aus dem Chat“** mit „Wunsch von …“. Von dir selbst
eingereihte Titel und Wünsche spielen vor dem Rest der Liste.

1. In der Plugin-Karte **Songwünsche (!sr) erlauben** einschalten (Standard: aus).
2. **Adressen kopieren** – jetzt mit drei zusätzlichen Zeilen:
   ```
   !sr         http://127.0.0.1:4788/request?token=…&user=%user%&q=%rawInputUrlEncoded%
   !wrongsong  http://127.0.0.1:4788/wrongsong?token=…&user=%user%
   !wishes     http://127.0.0.1:4788/requests
   ```
   `%user%` und `%rawInputUrlEncoded%` sind Variablen von Streamer.bot – genau so
   stehen lassen.
3. In Streamer.bot je eine Action mit **Fetch URL** (Ergebnis in eine Variable) und
   **Send Message to Channel**, dazu die Commands `!sr`, `!wrongsong` (eigenen
   letzten Wunsch zurückziehen) und `!wishes` (offene Wünsche anzeigen). Diese
   drei dürfen alle Zuschauer nutzen.

**Ab Plugin 1.2.0 und CleanMusic 1.4.0:** `!sr` nimmt auch **Links** – Spotify,
Deezer, Apple Music und (mit aktivem Quellen-Plugin) YouTube/YouTube Music. Andere
Links bekommen eine freundliche Absage. Neue Einstellungen:

- **Wünsche spielen:** *Als Nächstes* (Standard, neuester Wunsch zuerst) oder *Nach den
  anderen Wünschen*.
- **In Playlist speichern:** Standard „Songwünsche aus dem Chat“ – leer = aus.
- **KI-Songs ablehnen** (Standard an) + **zusätzliche KI-Sperrliste**: lehnt
  gekennzeichnete KI-Musik ab („AI Cover“, „Suno“, „Udio“, „KI-generiert“ …). Nicht
  gekennzeichnete KI-Songs erkennt niemand zuverlässig.

`!wrongsong` nimmt immer den **neuesten** eigenen Wunsch zurück.

Einstellungen: woher die Wünsche kommen (**volle Titel** über ein aktives
Quellen-Plugin, sonst 30-Sekunden-Vorschau – oder nur eines von beidem), Wünsche
pro Zuschauer gleichzeitig (Standard 2), Wartezeit pro Zuschauer (60 s), höchstens
offene Wünsche (15), Höchstlänge (10 Minuten) und gesperrte Wörter. Doppelte Titel
werden abgelehnt. Läuft ein unpassender Wunsch, springen Mods mit `!skip` weiter;
in CleanMusic entfernst du Wünsche in der Warteschlange mit ×.

Achte darauf, dass du gewünschte Musik in deinem Stream spielen darfst
(Musikrichtlinien von Twitch) – die Verantwortung liegt bei dir.

### Titelwechsel per WebSocket (ab Plugin 1.3.0)

Statt „Streamer.bot fragt CleanMusic“ kann CleanMusic auch **von sich aus** eine
Action auslösen, sobald ein neuer Titel läuft – praktisch für Overlays,
„Now Playing“-Grafiken oder eigene Aktionen.

1. In Streamer.bot: **Servers/Clients → WebSocket Server** einschalten (Standard
   `ws://127.0.0.1:8080/`). Ein Passwort ist optional.
2. In CleanMusic in der Plugin-Karte: **Titelwechsel per WebSocket** aktivieren,
   Adresse prüfen, bei Bedarf das **WebSocket-Passwort** eintragen (wird als
   Punkte angezeigt) und den **Namen der Action** eintragen, z. B.
   `CleanMusic Titelwechsel`.
3. In Streamer.bot eine Action mit diesem Namen anlegen. Sie bekommt die
   Argumente `title`, `artist`, `album`, `artwork`, `link`, `source`,
   `duration` und `playing` – z. B. `%title%` oder `%artist%` in einer
   Sub-Action verwenden.

Der Status in der Plugin-Karte zeigt, ob die Verbindung steht und wie viele
Actions Streamer.bot gemeldet hat („Streamer.bot verbunden“). Bricht die
Verbindung ab, versucht CleanMusic es automatisch erneut (2 s bis 30 s,
wachsend). Der Befehl **Streamer.bot neu verbinden** in der Plugin-Karte hilft
beim Einrichten. Die Action wird beim Verbinden einmal für den laufenden Titel
und danach bei jedem Titelwechsel aufgerufen.
