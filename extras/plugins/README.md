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

### Effekte ab Plugin 1.3.0 (nach dem Vorbild von „Waveform“)

Angelehnt an das OBS-Plugin [Waveform](https://obsproject.com/forum/resources/waveform.1423/),
aber eigener Code und nur mit den Daten, die CleanMusic liefert (32 Spektrum-Bänder
von 30 Hz bis 16 kHz). Alle neuen Einstellungen starten so, dass bestehende Quellen
genau wie vorher aussehen.

Neue Stile:

| Stil | URL | Empfohlene Größe |
|---|---|---|
| Gestufte Balken (LED-Optik) | `?style=steps` | 800 × 300 |
| Kreis, gestuft | `?style=radial-steps` | 420 × 420 |
| Kreis-Kurve (geschlossene Kurve um den Kreis) | `?style=radial-wave` | 420 × 420 |
| Pegelanzeige (waagerecht in breiten, senkrecht in hohen Quellen) | `?style=meter` | 800 × 80 oder 80 × 400 |
| Pegelanzeige, gestuft | `?style=meter-steps` | 800 × 80 |
| Pegel-Verlauf (läuft von rechts nach links) | `?style=history` | 800 × 200 |

Neue Einstellungen in der Plugin-Karte:

- **Farbmodus:** *Automatisch* (wie bisher), *Einfarbig*, *Farbverlauf*, *Nur Linien*,
  *Pulsieren (Lautstärke)* bzw. *(Tonhöhe)* – alles wechselt zwischen Grund- und
  Spitzenfarbe –, *Dreifarbig* (leise/mittel/laut wie eine Aussteuerungsanzeige;
  ohne eigene Farben: Cover-Farben plus Rot für die Spitze).
- **Eigene Farben:** bis zu drei Farben, z. B. `#5b8cff, #35e0c0, #ffd166`
  (Grundfarbe, Spitzenfarbe, Mittelfarbe für „Dreifarbig“). `#RRGGBBAA` setzt die
  Deckkraft. Leer = Farben aus dem Cover.
- **Glättung** (*Normal*, *Schnelle Spitzen*, *Zeitbasiert*, beides) und **Trägheit**
  (0–98 %, Standard 88 %): wie schnell die Balken fallen. *Zeitbasiert* sieht bei
  30 und 60 fps gleich aus.
- **Frequenzbereich (Hz):** z. B. `30-250` für nur Bass, `200-5k` für Stimmen.
- **Frequenzen spiegeln:** symmetrisch, Bass in der Mitte.
- **Stufenhöhe** und **Stufenabstand** für die gestuften Stile.
- **Kreis-Bogen** (10–360°) und **Kreis-Drehung** (0 = oben, im Uhrzeigersinn).
  Halbkreis unten: Bogen 180, Drehung 90; oben: Bogen 180, Drehung 270. Teilbögen
  werden in der Quelle zentriert und füllen sie aus.
- **Pegel:** Durchschnitt (RMS) oder Spitze, für Pegelanzeige und Verlauf.
- **Lautstärke angleichen:** leise Titel größer, laute kleiner (höchstens 4-fach).
- **Bei Stille ausblenden** (nach ca. 1,5 s) und **Verzögerung** (0–1000 ms), falls
  der Ton in OBS später ankommt als das Bild.

**Pro Quelle über die URL:** Jede Einstellung außer dem Port lässt sich an der URL
überschreiben, z. B. zwei Browserquellen mit unterschiedlichem Aussehen:
`/visualizer?style=radial-wave&radialArc=180&radialRotation=270&colorMode=range`.
Farben ohne `#` schreiben (`colors=ff4d8d,ffd166`), Schalter mit `1`/`0`.
Diese Feinheiten gibt es **nur** als URL-Parameter:

| Parameter | Wirkung | Bereich (Standard) |
|---|---|---|
| `minHeight` | Mindesthöhe der Balken in px | 0–200 (0) |
| `rounded` | abgerundete Ecken | 1/0 (1) |
| `inner` | Innenradius der Kreis-Stile in % | 5–90 (wie bisher) |
| `invert` | Kreis-Balken wachsen nach innen | 1/0 (0) |
| `slope` | Höhen anheben | 0–10 (0) |
| `rolloff` | Ränder auslaufen lassen, in Oktaven | 0–4 (0) |
| `blur` | Glätten über benachbarte Balken | 0–4 (0) |
| `interp` | Zwischenwerte: `linear`, `cubic`, `nearest` | (`linear`) |
| `scale` | Frequenzachse `log` oder `linear` | (`log`) |
| `ratio` | Länge des Farbverlaufs | 0,25–4 (1) |
| `floor` / `ceil` | Untergrenze/Obergrenze in % (Rauschen ausblenden) | 0–90 / 10–100 (0 / 100) |
| `mid` / `crest` | Schwellen für „Dreifarbig“ in % | 5–95 / 6–100 (65 / 85) |
| `seconds` | Länge des Pegel-Verlaufs in Sekunden | 1–30 (6) |
| `maxGain` | höchste Verstärkung beim Angleichen | 1–8 (4) |

Die Seite zeichnet höchstens 60 Bilder pro Sekunde (OBS-Browserquellen laufen
standardmäßig mit 30). Browser erlauben etwa sechs Live-Verbindungen pro Adresse –
wer mehr als sechs Visualizer-Quellen gleichzeitig nutzt, verteilt sie auf
`127.0.0.1` und `localhost`.

**Was von Waveform nicht geht** (CleanMusic liefert dafür keine Daten):
echte Wellenform (Audio-Samples), Stereo bzw. einzelne Kanäle, FFT-Größe und
Fensterfunktion (die Analyse steckt in CleanMusic), Pegel in dBFS (Pegelanzeige und
Verlauf werden aus dem Spektrum geschätzt), Audioquelle bzw. OBS-Ausgabebus
(der Visualizer zeigt immer die Musik aus CleanMusic). „Weiter analysieren bei
Stummschaltung“ ist schon eingebaut: Die Analyse sitzt vor der Lautstärke.

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

## Xeneon Edge (`xeneon-edge.js`)

Macht CleanMusic zum Touch-Player auf dem CORSAIR XENEON EDGE. Das Plugin ist
die lokale Brücke für das iCUE-Widget **CleanMusic** (eigene Datei
`CleanMusic-Xeneon-Edge-<version>.icuewidget` aus dem Release).

1. Plugin wie oben hinzufügen und einschalten. Es öffnet nur
   `http://localhost:4790` (IPv4 und IPv6); andere Geräte im Netzwerk kommen
   nicht heran.
2. Das Widget in iCUE importieren und auf dem Edge öffnen.
3. Im Widget **Verbinden** antippen – in der Plugin-Karte erscheint ein
   4-stelliger Code. Denselben Code mit **Xeneon Edge erlauben** bestätigen.

Danach verbindet sich das Widget automatisch (SSE, sonst jede Sekunde
Abfrage). Die Karte zeigt gekoppelte Geräte (höchstens drei), den Code während
der Kopplung und die Aktionen **Kopplungsschlüssel kopieren** (Notlösung für
die Widget-Eigenschaft „Kopplungsschlüssel“), **Widget herunterladen** und
**Kopplungen zurücksetzen**. Einstellungen: Mini-Spektrum und Songtext-Zeile
senden (beides an). Im Widget selbst gibt es sechs Stile (Automatisch aus dem
Cover, Nacht, Neon, Glas, Hell, Retro) und die Wahl zwischen Automatisch,
Kompakt und Groß.

Das Widget zeigt nur Titel, Artist, Album, Cover, Songtext-Zeile, Position und
Lautstärke; Cover werden über die Brücke geladen, damit das Widget keine
Deezer-/Apple-/YouTube-Adressen braucht. Spulen und Herz erscheinen erst, wenn
die Plugin-API `seek`/`toggleFavorite` liefert (geplant für CleanMusic 2.2,
Teil C); bis dahin werden sie ausgeblendet. Inoffiziell – nicht von CORSAIR,
Markennamen nur beschreibend.

## Berechtigungen (Plugin-API v3)

Ab CleanMusic 1.25.0 kann ein Plugin am Dateianfang ein Manifest tragen
(`/* cleanmusic-plugin { … } */`). CleanMusic zeigt dann **vor dem Aktivieren**, was das
Plugin darf (z. B. Wiedergabe steuern, Live-Spektrum lesen, lokaler Server), und sperrt
alles andere an der CleanMusic-Schnittstelle. Der OBS-Audio-Visualizer hat ein solches
Manifest; OBS-Overlay und Streamer.bot nutzen weiter die ältere API v2. Details:
`docs/PLUGIN-API.md`.
