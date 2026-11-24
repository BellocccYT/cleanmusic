> **Musik. Dein Setup. Ein Startpunkt.** CleanMusic bringt offizielle Web-Player, lokale Wiedergabe und Tools für Stream und Schnitt zusammen – ehrlich über Grenzen, lokal bei deinen Daten.

<!-- Drei GIF-Platzhalter: bis zu animierten Demos zeigen sie repräsentative Screenshots. -->
<p align="center">
  <img src="marketing/screenshots/obs-overlay.png" alt="GIF-Platzhalter – Streamer: Overlay und Als Nächstes" width="32%" />
  <img src="marketing/screenshots/cutter-wellenform.png" alt="GIF-Platzhalter – Cutter-Modus mit Wellenform" width="32%" />
  <img src="marketing/screenshots/vollbild-plattenspieler.png" alt="GIF-Platzhalter – Vollbild-Player" width="32%" />
</p>

<p align="center"><img src="build/icon.png" width="128" alt="CleanMusic-Logo" /></p>

# CleanMusic – The Music Launcher

> Inoffizielles Projekt. Nicht verbunden mit Spotify, Apple, Google/YouTube,
> Amazon, TIDAL, Deezer oder SoundCloud.

**Version 1.26.0**

Ein Startpunkt für alle großen Musik-Streaming-Dienste. Jeder Dienst läuft in
seinem **eigenen offiziellen Web-Player** in einem eingebetteten Browser-Fenster
mit gespeichertem Login. Lokale Musik, Radio und **30-Sekunden-Vorschauen**
spielt CleanMusic **selbst** ab – dazu kommen **Favoriten, Playlists und
Vorschläge** über alle Quellen hinweg, ein **Cutter-Modus** mit Musik und
Soundeffekten für Videos, ein **Vollbild-Player mit Visualizer** und optional
**Discord Rich Presence**.

Optional lassen sich **Quellen-Plugins** einbinden: einzelne Dateien, die du
selbst in den Plugin-Ordner legst und bewusst aktivierst. Es werden **keine
Plugins mitgeliefert**.

Kein DRM-Bypass. Kein Herunterladen oder Speichern von Streams.

## Einblicke

<p align="center">
  <img src="docs/images/01-startseite.png" alt="CleanMusic-Startseite mit Vorschlägen, Trending & Neuheiten und Player" width="100%">
</p>

<table>
  <tr><th colspan="2">Zehn Themes und Akzentfarbe aus dem Cover</th></tr>
  <tr><td colspan="2"><img src="docs/images/02-themes.png" alt="Theme-Auswahl mit zehn Farbschemata" width="100%"></td></tr>
  <tr><th>Cutter-Modus</th><th>Vollbild-Player mit Visualizer</th></tr>
  <tr>
    <td><img src="docs/images/03-cutter.png" alt="Cutter-Modus mit NCS-Kategorien, Titelliste und Video-Credits" width="100%"></td>
    <td><img src="docs/images/04-vollbild-player.png" alt="Vollbild-Player mit Visualizer und Warteschlange" width="100%"></td>
  </tr>
</table>

---

## Download

Unter [Releases](https://github.com/BellocccYT/cleanmusic/releases/latest):

| Datei | Für wen |
| --- | --- |
| `CleanMusic-<version>-setup.exe` | **Installer** – Startmenü- und Desktop-Verknüpfung, Deinstallation über die Windows-Einstellungen, Updates mit einem Klick |
| `CleanMusic-<version>-portable.exe` | **Portable** – keine Installation, einfach doppelklicken (z. B. vom USB-Stick) |
| `CleanMusic-<version>.AppImage` | Linux |
| `CleanMusic-Android-<version>.apk` | **Android, Android TV, Google TV, Fire TV** – eine APK für alles, eigene Versionsnummern (`mobile-…`), eigener Updater. Anleitung: [Android](https://bellocccyt.github.io/cleanmusic/android/) · [TV / Fire TV](https://bellocccyt.github.io/cleanmusic/tv/) |

Installer und portable EXE teilen sich dasselbe Profil (`%APPDATA%\CleanMusic`):
Favoriten, Playlists und Einstellungen sind in beiden da. Beim Deinstallieren
bleibt das Profil erhalten.

**Tipp für Streamer (Elgato Wave Link, Windows-App-Lautstärke):** Nimm den
Installer. Die portable EXE entpackt sich bei jedem Start in einen neuen
Temp-Ordner – für Wave Link und Windows ist sie dann jedes Mal ein „neues“
Programm, und die Zuordnung zu einem Kanal oder Ausgabegerät geht verloren.
Die installierte Version liegt immer am selben Ort.

Die Dateien sind nicht code-signiert – Windows
SmartScreen fragt beim ersten Start einmal nach (*Weitere Informationen →
Trotzdem ausführen*).

## Erste Schritte

Beim allerersten Start führt ein kurzer **Assistent** durch CleanMusic: Theme wählen,
Musikordner hinzufügen, was CleanMusic alles abspielt, die wichtigsten Optionen
(Autoplay, Update-Suche, Downloads, Visualizer, Infobereich) und Plugins. Dazu läuft
eine leise Hintergrundmusik („Thinking Music“ von Kevin MacLeod, CC BY 4.0), die sich
im Assistenten mit einem Klick ausschalten lässt. Jederzeit erneut unter
*Einstellungen → System → „Erste Schritte erneut zeigen“*. Nach einem Update zeigt
eine kleine Karte, was neu ist.

## Was zu 100 % in CleanMusic läuft

| Bereich | Status |
| --- | --- |
| Lokale Dateien (MP3, FLAC, WAV, M4A, AAC, OGG, OPUS, WMA, AIFF) | ✅ eigener Player, eigene Bibliothek |
| **Song-Suche mit In-App-Wiedergabe** | ✅ Apple Music + Deezer Katalog, 30-s-Vorschauen direkt im Player |
| **Beliebte Titel** | ✅ Deezer-Charts, sofort abspielbar |
| **Live-Radio** | ✅ tausende öffentliche Sender, volle Songs, kein Login, kein DRM |
| **Favoriten & Playlists** | ✅ ♥ und + an jedem Titel/Sender, gemischt aus allen Quellen, Drag & Drop |
| **Smart-Playlists** (ab 1.19.0) | ✅ Regeln aus Favoriten, lokaler Musik, Verlauf, Playlists, Vorschlägen und Charts; Filter für stream-sicher, Credit, Dislikes, Tempo, Stimmung und Art; aktualisieren sich beim Öffnen oder täglich (ab 1.22.0) |
| **Vorlagen-Playlists** | ✅ acht Themen, je **stream-sicher** (NCS, CC BY, CC0) oder **normal** (Katalog) mit einem Klick |
| **Vorschläge „Für dich“** | ✅ aus deinen Favoriten (Deezer-Artist-Radio, verwandte Artists, optional über Plugins) |
| **Cutter-Modus** | ✅ NCS, YouTube-Klassiker (CC BY), Soundeffekte & freie Musik mit Lizenz und Credit |
| **Vollbild-Player & Visualizer** | ✅ Cover-Farben, Beat-Puls, Kreis/Balken/Welle, Kino-Modus |
| **Discord Rich Presence** | ⚙️ optional – eigene Discord-Application-ID nötig; ab 1.26.0 mit Knopf „In CleanMusic anhören“ für Freunde |
| **Quellen-Plugins** | ⚙️ optional – nicht enthalten, Datei in den Plugin-Ordner legen und aktivieren; ab 1.25.0 zeigen Plugins mit Manifest ihre Berechtigungen vor dem Aktivieren |
| Apple Music | ✅ offizieller Web-Player; zusätzlich **MusicKit-Fenster** für volle Titel (Developer-Token nötig) |
| Spotify, YouTube Music, TIDAL, Deezer, Amazon Music, SoundCloud | ✅ als offizieller Web-Player eingebettet |
| Qobuz, Bandcamp, Audius | ✅ zusätzlich als offizieller Web-Player – ausklappbar unter „Weitere Dienste“ |
| Dienste in der Seitenleiste | ✅ vier häufige Dienste sichtbar, der Rest hinter „Weitere Dienste“; Creator separat ausklappbar |
| Suche in einem Dienst | ✅ startet die Suche im jeweiligen Web-Player |

### Songs & Vorschauen

Die **Suche** zeigt Treffer aus dem Apple-Music- und Deezer-Katalog direkt in
CleanMusic: Cover, Artist, Album, Quelle und ein Play-Button. Beim Start der
Suche erscheinen zusätzlich die aktuellen Deezer-Charts.

- **Vorschauen (30 s)** laufen komplett in der App – über die offiziellen
  Preview-URLs von Apple (iTunes Search API) und Deezer. Kein Login nötig.
- **Volle Titel** laufen dort, wo es geht: lokale Dateien, Apple Music über
  das **MusicKit-Fenster** (Developer-Token + Abo) oder über ein aktives
  **Quellen-Plugin**.
- Der Button **↗** öffnet den Titel im jeweiligen Dienst (Web-Player oder
  System-Browser).
- Der **Globus-Button** pro Titel öffnet ein Menü: „In Spotify / YouTube Music /
  Amazon Music … suchen". So springst du mit einem Klick vom 30-s-Treffer in
  den vollen Song im Dienst.
- **Warum läuft das?** Der Info-Knopf im Player zeigt Herkunft (Playlist, Mix,
  Charts, Suche, Radio, Songwunsch oder Autoplay), Quelle, Lizenz,
  Stream-sicher-Status, Länge und bei lokalen Titeln den Dateipfad. Credits
  lassen sich direkt kopieren, Links im Dienst öffnen.

### Übergänge zwischen Titeln

*Einstellungen → Wiedergabe → Übergang*: **Crossfade** (2–12 Sekunden, ein zweiter
Player blendet den alten Titel aus, während der neue einblendet) oder **Lückenlos** (der
nächste Titel wird vorgeladen). Nicht bei Radio und „Titel wiederholen“.

### Dein Rückblick

In der Seitenleiste: Hörminuten, abgespielte Titel, Top-Künstler, Top-Titel, wann du hörst
(nach Uhrzeit und Monat) und deine meistgenutzte Quelle – für diesen Monat, das Jahr oder
alles. Gezählt wird nur lokal (`cleanmusic.stats.v1`), ab Version 1.7.

**Gruppe (ab 1.23.0):** Wer hört diese Woche am meisten? Unten im Rückblick gibst du dir
einen Namen und kopierst deine **Wochenkarte** – ein kurzer Text mit Code (`CM1-…`),
den du in eure WhatsApp- oder Discord-Gruppe schickst. Die Codes der anderen fügst du
ein, CleanMusic zeigt daraus die Rangliste der Kalenderwoche. Kein Konto, kein Server:
geteilt wird nur, was in der Karte steht (Name, Hörzeit, Titelzahl, bis zu drei
Top-Künstler). Der Code schützt nur vor Tippfehlern, nicht vor Schummeln – es ist ein Spaß.
Ab 1.24.0 steckt die Karte in einem Link (`…/cleanmusic/g/#CM1-…`): Antippen öffnet
CleanMusic, das vor dem Hinzufügen nachfragt. Der Code steht hinter dem `#` und wird
dadurch nicht an GitHub Pages übertragen.

### Künstlerseiten

Klick auf einen Künstlernamen (in Listen, in der Player-Leiste oder im Vollbild-Player):
Top-Titel, Alben & Singles (Klick zeigt die Titel) und ähnliche Künstler – Daten aus der
offenen Deezer-Schnittstelle.

### Songs teilen

Im **+**-Menü eines Titels: **Link zum Teilen kopieren**. Der Link
(`https://bellocccyt.github.io/cleanmusic/s/?…`) ist in Discord, WhatsApp & Co. anklickbar
und öffnet den Song direkt in CleanMusic (`cleanmusic://` – der Installer registriert das,
die portable EXE beim Start). Ohne CleanMusic zeigt die Seite den Song bei Deezer, Apple
Music bzw. YouTube Music, eine Spotify-Suche und den Download. Die Seite liegt in `site/`
und wird per GitHub Pages veröffentlicht (`.github/workflows/pages.yml`); sie speichert
nichts und hat keine Statistik.

**Playlists teilen (ab 1.26.0):** In jeder Playlist gibt es **Teilen**. Der Link
(`https://bellocccyt.github.io/cleanmusic/p/#P1.…`) enthält die Titel als komprimierten Code
hinter dem `#` – der geht nie an einen Server. Antippen zeigt die Titelliste und öffnet
CleanMusic, das vor dem Übernehmen nachfragt und die Titel bei Deezer, Apple Music oder über
dein Quellen-Plugin wiederfindet. Lokale Dateien und Radio bleiben bei dir; bis zu 100 Titel.

### Chrome-Erweiterung für YouTube (2.0)

Unter `extras/browser-extension/cleanmusic-youtube/` liegt eine Manifest-V3-Erweiterung,
die im Chrome Web Store veröffentlicht ist
([Eintrag](https://chromewebstore.google.com/detail/hghplimkfmogkheakonapklcfgioc)):
Knopf unter dem Titel, in den Player-Steuerungen und schwebend auf YouTube Music/Shorts;
Popup mit Vorschau und Katalogsuche; drei Rechtsklick-Einträge; drei Tastenkürzel;
Einstellungen, Einrichtungs- und Datenschutzseite. Sie schickt nur Video-ID, Titel und Channel an die lokale App –
über `cleanmusic://add` bzw. `cleanmusic://play`, geprüft von `parseDeepLink` in
`main.js`. Keine Netzwerkanfragen, kein Remote-Code, Einstellungen nur lokal.
Installation per „Entpackte Erweiterung laden“ in `chrome://extensions`; Store-Texte,
Berechtigungsbegründungen und Prüfliste stehen in `STORE.md`, Details in der
`README.md` der Erweiterung. Prüfen mit
`node extras/browser-extension/test/extension.test.js`.

### Lokale Musik nach Ordner und Stimmung

*Lokale Musik* filtert nach **Stimmung** (Chill, Party, Workout, Fokus, Gaming, Traurig –
geraten aus Ordner- und Dateinamen, pro Ordner selbst festlegbar) und sortiert auf
Wunsch **nach Ordner**.

### Favoriten, Playlists & Vorschläge

- **♥** an jedem Titel, jeder Vorschau, jedem Plugin-Treffer, jeder lokalen
  Datei und jedem Radiosender – oder im Player unten links für den laufenden
  Titel. Alles landet unter **Bibliothek → Favoriten** (Filter: Titel / Radio).
- **+** fügt einen Titel einer **Playlist** hinzu oder legt direkt eine neue
  an. Playlists mischen alle Quellen, zeigen ein Cover-Mosaik und lassen sich
  umbenennen, löschen, abspielen und shuffeln.
- **Erweitern:** holt zu den Künstlern, die schon in der Playlist sind, neue
  passende Titel dazu (Deezer-Artist-Radio, bei Plugin-Titeln deren verwandte
  Titel). Vor dem Hinzufügen zeigt ein Dialog alle Funde mit Checkboxen – alle
  vorausgewählt, einzeln abwählbar. Doppelte Titel werden übersprungen; nichts
  wird umsortiert.
- **Drag & Drop:** Titel aus jeder Liste auf *Favoriten*, eine Playlist oder
  *Neue Playlist* in der Seitenleiste ziehen. In einer Playlist per Griff
  sortieren.
- **Smart-Playlists** (ab 1.19.0): Seitenleiste → *Smart-Playlist*. Du wählst Quellen
  (Favoriten, lokale Musik, Verlauf, andere Playlists, Vorschläge, Charts) und
  Filter (stream-sicher, mit Credit, seit X Tagen nicht gehört, ohne Dislikes)
  sowie ein Limit. Die Vorschau zeigt sofort, wie viele Titel passen;
  **Aktualisieren** baut die Liste mit deinem aktuellen Bestand neu. Alles
  bleibt lokal, es werden keine neuen Suchen ausgelöst.
  Ab 1.22.0 kommen dazu: **Aktualisieren** nur per Knopf, bei jedem Öffnen oder
  einmal am Tag; Filter für **Tempo** (BPM von–bis, nur bereits analysierte Titel),
  **Stimmung** und **Art** (lokal, Vorschau, volle Titel, freie Musik). „Warum läuft
  das?“ nennt Quelle und Regel, aus der ein Titel stammt. Ab 1.24.0 legt der
  Funken-Knopf an jedem **Mix** eine eigene Smart-Playlist mit den Regeln des Mixes an
  (täglich neu, frei anpassbar).
- **Vorlagen** (Seitenleiste): acht fertige Themen wie *Gaming & Retro*,
  *Chill & Lounge*, *Episch & Action* oder *Workout & Energy*. Jede gibt es
  **stream-sicher** – nur NCS, CC BY und CC0, also mit Credit im Stream nutzbar –
  und **normal** aus dem Katalog. Ein Klick legt eine echte Playlist an;
  erneutes Anklicken ergänzt neue Titel.
- **„Neu für dich“** auf der Startseite und **„Mehr wie deine Favoriten“** in den
  Favoriten: CleanMusic nimmt deine häufigsten Favoriten-Artists **und was du
  zuletzt oft gehört hast** und holt über die öffentliche Deezer-API Artist-Radio
  und Top-Titel verwandter Artists. Gerade Gehörtes wird nicht erneut vorgeschlagen.
  Ein aktives Quellen-Plugin steuert verwandte Titel zu deinen Plugin-Favoriten bei.
  **Neu mischen** lädt frische Vorschläge.
- **Trending & Neuheiten:** Deezer-Charts oder neue Alben der Deezer-Redaktion
  (umschaltbar). **Wiederentdecken:** Titel, die du oft gehört oder favorisiert,
  aber lange nicht mehr gespielt hast.
- **Hör-Verlauf:** Ein Titel zählt nach 20 Sekunden (Vorschau: 12 s) als gehört.
  Der Verlauf (max. 300 Titel) bleibt lokal; Radio wird nicht erfasst.
- Abgelaufene Deezer-Vorschau-Links in Favoriten/Playlists werden beim
  Abspielen automatisch erneuert.

Alles bleibt lokal (im Profil der App); es gibt kein Konto und keine Cloud.

### Mixes & dein Geschmack

- **Mehr davon / Weniger davon:** Rechtsklick auf einen Titel (oder das **+**-Menü)
  → *Geschmack*. Das gilt für den Titel oder direkt für den Artist. Alles wird nur
  auf deinem Gerät gespeichert.
- **Mixes** (Seitenleiste, auch auf der Startseite): **Dein Mix**, **Neu für dich**,
  **Entdecken**, **Nochmal** und **Tiefe Schnitte**. Sie entstehen aus Favoriten,
  Playlists, lokalen Titeln, Hörverlauf und frischen Vorschlägen – nicht aus einem
  Cloud-Profil.
- **Dein Mix** mischt, was du oft hörst, mit Titeln, die dazu passen. **Neu für dich**
  und **Entdecken** zeigen Neues (bekannte bzw. unbekannte Artists), **Nochmal**
  holt ältere Lieblinge zurück, **Tiefe Schnitte** gräbt selten gehörte Titel aus
  deinen Playlists aus.
- Mixes bleiben einen Tag stabil, lassen sich **neu mischen** und als echte
  **Playlist speichern**. Frühe Skips (Weiter innerhalb der ersten Sekunden) und
  „Weniger davon“ sorgen dafür, dass solche Titel seltener auftauchen.

### Playlists übertragen

Unter **Bibliothek → Playlist übertragen** kannst du Spotify-Playlists per öffentlichem
`open.spotify.com/playlist/...`-Link oder Spotify-URI sowie YouTube-/YouTube-Music-Playlists
per Link übertragen (`music.youtube.com/playlist?list=…`, `youtube.com/playlist?list=…`
oder ein Video mit `&list=…`). Für YouTube Music brauchst du ein aktives Quellen-Plugin
mit Playlist-Import (ab Version 1.2.0). Ohne Plugin kannst du die Playlist auf
[TuneMyMusic](https://www.tunemymusic.com/) als CSV exportieren und in CleanMusic laden.

Für private Spotify-Playlists kannst du bei exportify.app mit deinem Spotify-Konto eine
CSV-Datei exportieren. Auch CSV-Dateien von TuneMyMusic und Soundiiz sowie Spotifys
Playlist-JSON aus dem persönlichen Datenexport werden unterstützt. Bei JSON-Exporten
mit mehreren Playlists kannst du auswählen, welche du übertragen möchtest.

Spotify-Playlists werden wie bisher mit öffentlichen Deezer-Vorschauen abgeglichen;
nicht gefundene Titel zeigt CleanMusic am Ende an. YouTube-Playlists werden direkt als
volle Titel des aktiven Plugins übernommen. Spotify kann über den öffentlichen Link nur
bis zu 100 Titel anzeigen; für vollständige Playlists bitte den Datei-Import verwenden.

### Cutter-Modus (für Videos)

> **Tempo & Wellenform (ab 1.7):** Musik-Tabs lassen sich nach Tempo filtern (langsam bis
> sehr schnell – CleanMusic misst die BPM selbst). Für den laufenden Titel zeigt der
> Cutter-Modus die **Wellenform**: Start/Ende setzen (Tasten **I**/**O**), Ausschnitt als
> Schleife abspielen, Zeitmarken kopieren – und bei CC0/CC BY/Public Domain im Modus „Nur
> Cutting“ den Ausschnitt **als WAV** mit Credit-.txt in `CleanMusic Cutting\Schnitte`.
>
> **Für dich (ab 1.5):** Vorschläge aus den Kategorien, die du am meisten nutzt – ohne
> Titel, die du schon gecreditet hast (Mix, nur Musik, nur Sounds).
>
> **YouTube-Download nur für Creative Commons (ab 1.5, Quellen-Plugin ab 1.4.0):** Im
> YouTube-Tab bekommen Titel mit „CC BY laut Uploader“ im Modus „Nur Cutting“ einen
> Download-Knopf. Das Plugin prüft die Lizenz bei **jedem** Video noch einmal; nur wenn
> YouTube es als Creative Commons ausweist, landet die m4a mit Credit-.txt in
> `CleanMusic Cutting\YouTube (Creative Commons)`. Alles andere bleibt ohne Download.

> **YouTube-Tab (ab 1.4, nur mit aktivem Quellen-Plugin):** zeigt YouTube-Treffer
> (Gaming-Musik, Phonk, Lo-Fi, Meme-Sounds …) mit dem Hinweis **„⚠ Content ID möglich“** –
> nicht lizenzgeprüft, kein Download. „Creative Commons“ nutzt YouTubes CC-Filter
> (Angabe des Uploaders, nicht geprüft).

Musik und Soundeffekte, die du in Videos verwenden darfst – mit Lizenz an jedem
Titel und fertigem Credit:

| Bereich | Quelle | Lizenz | Wiedergabe |
| --- | --- | --- | --- |
| **NCS** – 21 Kategorien (Top 100, Trending auf YouTube, Gaming, Phonk, House, Drum & Bass, Dubstep, Trap …) | offizielle NCS-Playlists bei Deezer | NCS: frei für YouTube/Twitch/Social mit Credit | 30-s-Vorschau (Apple-Katalog), mit Quellen-Plugin voller Titel |
| **YouTube-Klassiker** – Kevin MacLeod in 6 Stimmungen plus **Gaming & Retro** (*Itty Bitty 8 Bit*, *Pixel Peeker Polka*, *Hyperfun* …) | incompetech.com | CC BY 4.0 | volle Titel |
| **Soundeffekte** – Whoosh, Transition, Impact, Riser, Pop, Klick, Glitch, Applaus, Lachen, Fail … oder eigene Suche | Freesound über Openverse | CC0 oder CC BY (pro Sound angezeigt) | volle Sounds |
| **Game-Sounds** – Retro & 8-Bit, Münze & Power-up, Sprung, Level-Up & Sieg, Game Over, Menü & UI, Arcade, RPG & Fantasy, Horror-Game, Sci-Fi-Waffen, Racing | Freesound über Openverse | CC0 oder CC BY (pro Sound angezeigt) | volle Sounds |
| **Freie Musik** – Cinematic, Upbeat, Episch, Entspannt, Chiptune/8-Bit, Videospiel, Boss-Kampf … oder eigene Suche | Jamendo & Co. über Openverse | CC0 oder CC BY | volle Titel |

- **Kopier-Knopf** an jedem Titel: kopiert den Credit in die Zwischenablage und
  sammelt ihn in **Video-Credits**. *Alle kopieren* liefert den kompletten Block
  für die Videobeschreibung.
- Lizenz-Badge (CC0 · CC BY · NCS) und ↗ zur Quelle bzw. zum Download beim Urheber.
- Openverse erlaubt ohne Konto ~200 Anfragen am Tag; CleanMusic speichert
  Ergebnisse deshalb 24 h zwischen.

### Epidemic Sound & Artlist (mit deinem Abo)

Unter **Creator** in der Seitenleiste und als Knöpfe im **Cutter-Modus** laufen die
offiziellen Web-Apps von **Epidemic Sound** und **Artlist** eingebettet – Login bleibt
gespeichert. Was du dort über deren Download-Knöpfe mit deinem Abo herunterlädst,
speichert CleanMusic ohne Rückfrage in `Musik\CleanMusic Cutting\Epidemic Sound\`
bzw. `…\Artlist\`, mit einer `– Lizenz.txt`-Notiz daneben. Im Cutter-Modus stehen
die letzten Abo-Downloads unter den Video-Credits – zum Ziehen ins Schnittprogramm.
Gespeichert werden nur Audiodateien (und ZIP mit Stems). CleanMusic greift nicht an
den Web-Apps vorbei auf Dateien zu.

### Downloads: nur freie Dateien für Videos

Unter *Einstellungen → System → Downloads* gibt es genau zwei Stufen: **Aus** (Standard)
und **Nur Cutting**. Dann bekommen frei lizenzierte Titel im Cutter-Modus
(**CC0, CC BY, Public Domain** – Kevin MacLeod, Freesound, Jamendo über
Openverse) einen Download-Knopf. Jede Datei landet in
`MusikCleanMusic Cutting<Kategorie>\x60 (Ordner änderbar), daneben eine
`.txt` mit Lizenz und fertigem Credit-Text. Fertige Downloads ziehst du über das
grüne Datei-Symbol direkt in dein Schnittprogramm; ein Klick zeigt die Datei im
Explorer. Streams, Vorschauen, NCS-Titel und Plugin-Titel lassen sich
**nicht** herunterladen – einen Modus „alles herunterladen“ gibt es bewusst nicht.

### Vollbild-Player

Taste **F**, der Knopf ⤢ in der Player-Leiste oder Doppelklick aufs Cover:

- großes Cover, das im Takt pulsiert; Hintergrund und Leuchten in den Farben
  des Covers
- Visualizer im Stil *Kreis ums Cover*, *Balken* oder *Welle* (oben rechts umschaltbar)
- „Als Nächstes“ mit den kommenden Titeln (anklickbar)
- Kino-Modus: nach ein paar Sekunden ohne Mausbewegung verschwinden Bedienelemente und Zeiger
- Tasten: **Leertaste** Play/Pause · **← →** ±5 s · **↑ ↓** Lautstärke ·
  **N / P** weiter/zurück · **Esc** schließen

### Themes & Hintergründe

Seit 1.5 sechzehn Themes (neu: Synthwave, Ozean, Sonnenuntergang, Terminal,
Mitternacht Gold, Kirschblüte) und **Hintergründe**: Aurora, Verlauf, Farbwolken,
Cover (unscharfes Cover des laufenden Titels) und Sternenhimmel – langsam animiert oder
als ruhiges Standbild (*Einstellungen → Darstellung*).

Zehn Farbschemata unter *Einstellungen → Darstellung*: **CleanMusic Nacht** (Standard),
**CleanMusic Tag** (hell), **Catppuccin Mocha / Latte**, **Dracula**, **Nord**,
**Tokyo Night**, **Rosé Pine**, **Gruvbox Dark** und **Everforest**. Die Paletten
der Community-Themes stehen unter MIT-Lizenz (siehe
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)). Optional übernimmt die
**Akzentfarbe das Cover** des laufenden Titels – automatisch so angepasst, dass
sie auf hellen und dunklen Themes lesbar bleibt.

### Stream-sicher-Modus

*Einstellungen → Wiedergabe → Stream-sicher-Modus (Ich streame)*: Die Player-Leiste
zeigt **✓ Stream-sicher** (NCS, CC0, CC BY) oder **⚠ Nicht stream-sicher**, und
Songwünsche aus dem Chat kommen nur noch aus freier Musik (Creative Commons über das
Quellen-Plugin, Openverse). Erkennt nur bekannte Lizenzen – im Zweifel gilt ein Titel
als nicht sicher.

### Downloads-Liste

In der Seitenleiste **Downloads**: alles aus deinem Cutting-Ordner (auch YouTube-CC, Schnitte und Abo-Downloads) – abspielen, ins Schnittprogramm ziehen, Credit kopieren, im Ordner zeigen. Die **Suchleiste** findet Downloads nach Wörtern in Titel, Künstler, Ordner, Lizenz und Credit; **„Ordner ändern …“** wählt deinen Wunschordner.

### Plattenspieler

*Einstellungen → Darstellung → Plattenspieler* (oder im Vollbild-Player oben rechts): Das Cover dreht sich als Schallplatte mit Rillen, im Vollbild-Player setzt ein Tonarm beim Abspielen auf und hebt bei Pause ab. Auch in der Player-Leiste dreht sich eine kleine Platte.

### Ansicht: Einfach oder Erweitert

*Einstellungen → Darstellung → Ansicht*: **Einfach** blendet Cutter-Modus, Downloads, Plugins, Discord und Profi-Schalter aus, **Erweitert** zeigt alles.

### Songtexte

Im Vollbild-Player blendet der Knopf mit den drei Linien den **mitlaufenden Songtext**
ein (aus der freien Datenbank [LRCLIB](https://lrclib.net); dabei werden nur Titel,
Artist, Album und Länge abgefragt). Auch als OBS-Overlay-Stil „Songtext“. Einstellbar (in den Einstellungen und direkt im Vollbild-Player): Schriftgröße, Ausrichtung, Zeitversatz, Mitscrollen, gesungene Zeilen abdunkeln, Großansicht ohne Cover, „Neu suchen“ und **Effekte**: Pop, Karaoke (füllt sich im Takt), Motion (große Zeile, Wörter poppen einzeln rein wie in Lyric-Videos), Neon, Welle, Schreibmaschine und Zoom. Visualizer-Stile: Kreis, Balken, Welle, Spiegel und Partikel.

### Lautstärke

- Der Regler arbeitet **gehörrichtig** (feine Schritte im leisen Bereich), mit
  Prozentanzeige und Lautsprecher-Symbol in Stufen.
- **Mausrad** auf Regler oder Lautsprecher (mit Umschalt in 1-%-Schritten),
  **M** schaltet stumm, **+ / −** regeln überall, **↑ / ↓** im Vollbild-Player.
- Optional unter *Einstellungen → Klang*: **Lautstärke angleichen** (sanfter
  Kompressor gleicht laute und leise Titel an) und **Boost bis 150 %** mit
  Limiter gegen Übersteuern. Beides ist standardmäßig aus.
- **Klang:** Bass und Höhen (Regler und Voreinstellungen wie *Mehr Bass*, *Stimme klar*,
  *Laptop-Lautsprecher*) unter *Einstellungen → Klang*. 0 dB = unverändert.
- **Kein Ton, obwohl der Titel läuft:** Der Visualizer hört mit und erkennt echte
  Stille (digitale Null, nicht „leise“ – Lautstärke oder Stummschalten lösen das
  nie aus). Liefert ein voller Titel über ein Plugin nach einigen Sekunden keinen
  Ton, wird er einmal neu geladen; bleibt es dabei, läuft die 30-s-Vorschau.
  Vorschauen und lokale Titel bekommen nur einen Hinweis, Radio bleibt außen vor
  (Pausen sind dort normal). Ohne Visualizer wird nichts vermutet.

### Visualizer (optional)

Analysiert über die Web-Audio-API, was gerade läuft – lokale Dateien, Vorschauen,
Radio, Plugin-Titel. Die Wiedergabe selbst wird dabei nicht umgeleitet (Analyse
per `captureStream()`), es kann also nichts stumm werden. Ist *Lautstärke
angleichen* oder *Boost* an, läuft der Ton ohnehin über Web Audio; der
Visualizer hört dann direkt dort mit. Ein- und ausschalten,
Stil wählen und den **Mini-Visualizer** in der Player-Leiste gibt es unter
*Einstellungen → Darstellung → Visualizer*. Bei Pause zeichnet er nur noch ~8× pro Sekunde.
Die Spektrum-Balken funktionieren auch, wenn der Ton über die optionale
Lautstärke-/Klang-Kette läuft.

### Leistung im Vollbild (ab 1.13.1)

Unter *Einstellungen → Darstellung → Leistung im Vollbild* lässt sich die GPU-Last regulieren:

- **Ausgewogen** (Standard): Visualizer mit 24 fps, volle CSS-Auflösung und deutlich
  reduzierte Blur-/Blend-Effekte.
- **Sparmodus**: 15 fps, kleinere interne Canvas-Auflösung, keine großen Schatten und
  keine Blur-Effekte. Empfohlen bei hoher GPU-Last oder im Akkubetrieb.
- **Qualität**: maximal 30 fps mit vollen Effekten.

Der **Vollbild-Visualizer** ist zusätzlich separat abschaltbar; der kleine Visualizer in
der Player-Leiste bleibt davon unabhängig. Live-Hintergründe und bewegte Cover pausieren
weiterhin automatisch, wenn das Fenster verborgen ist. Ton, Audio-Kette und EQ bleiben
von allen Leistungsstufen unberührt.

### Discord Rich Presence (optional)

Zeigt in deinem Discord-Profil „Hört CleanMusic“ mit Titel, Artist, Cover,
Fortschrittsbalken und einem *Anhören*-Link. Läuft lokal über den
Discord-Client (IPC), standardmäßig **aus**. Ab 1.26.0 sehen Freunde zusätzlich den Knopf
**„In CleanMusic anhören“**, der den Song bei ihnen öffnet (abschaltbar; nie für lokale
Dateien oder Radio; du selbst siehst den Knopf nicht – das macht Discord so).

1. Im [Discord Developer Portal](https://discord.com/developers/applications)
   „New Application“ anlegen, Name z. B. *CleanMusic*.
2. Die **Application ID** unter *Einstellungen → Verbindungen → Discord Rich Presence*
   eintragen, *Speichern*, Schalter an.
3. Optional ein Bild namens `logo` unter *Rich Presence → Art Assets*
   hochladen (wird gezeigt, wenn ein Titel kein Cover hat oder „Cover
   anzeigen“ aus ist).

### Live-Radio

Unter **Radio** findest du tausende öffentliche Sender über die
[Radio-Browser-API](https://www.radio-browser.info/):

- Genre-Filter (Pop, Rock, Electronic, Jazz, Techno, Schlager, 80s, 90s …)
- Sendersuche
- **Volle Songs, kein Login, kein DRM** – die Sender streamen öffentlich
- LIVE-Anzeige statt Fortschrittsbalken
- läuft im selben Player wie lokale Titel und Vorschauen

### Warteschlange & Autoplay

- **„Als Nächstes abspielen“** und **„Zur Warteschlange hinzufügen“** über das
  +-Menü oder per **Rechtsklick** auf jeden Titel. Eingereihte Titel kommen immer
  zuerst – auch bei Zufallswiedergabe und wenn du eine andere Liste startest.
- **Warteschlange** (Listen-Symbol in der Player-Leiste): läuft gerade, von dir
  eingereiht, Rest der Liste, Autoplay. Ziehen zum Sortieren, ✕ zum Entfernen,
  Klick zum Abspielen.
- **Autoplay** (Standard an): Sobald die Warteschlange zu Ende ist, laufen passende
  Vorschläge weiter (Artist-Radio, bei Plugin-Titeln deren verwandte Titel) – auch nach
  Songwünschen aus dem Chat. Abschaltbar in der Warteschlange oder unter
  *Einstellungen → Wiedergabe*.

### Player

- Shuffle mischt die Warteschlange wirklich: kein Titel kommt doppelt, bevor alle
  dran waren; Ausschalten stellt die alte Reihenfolge wieder her. Repeat
  (aus / alle / Titel) mit gespeichertem Zustand
- Queue aus lokalen Titeln, Vorschauen, Plugin-Titeln, Radiosendern, Favoriten
  oder Playlists
- Cover, Artist und Quellen-Badge im „Now Playing" (z. B. *30 s Vorschau*,
  *Voll · Quelle des Plugins*, *Radio · LIVE*)
- ♥ und + für den laufenden Titel direkt im Player

### Einstellungen

Die Einstellungen sind in sechs Kategorien gegliedert: **Wiedergabe**, **Klang**,
**Darstellung**, **Plugins**, **Verbindungen** und **System**. Jede Kategorie zeigt nur
ihre eigenen Optionen; die Tab-Leiste bleibt beim Scrollen oben stehen.

## Neu in 1.13: Klang, Creator & Live-Hintergründe

- **10-Band-Equalizer** mit Neutral, Bass-Boost, Stimme/Podcast, Hell, Warm, Laptop,
  Kopfhörer, Elektronisch und Akustik sowie bis zu zehn eigenen Presets. Die vorhandenen
  Bass-/Höhen-Regler bleiben erhalten.
- **Cutter-Projekte** sammeln Titel und Credits für ein Video. Erfolgreiche „Nur Cutting“-Downloads
  werden dem aktiven Projekt hinzugefügt; Credits lassen sich nach Lizenz sortiert kopieren oder
  als `.txt` im Unterordner `_Projekte` des Cutting-Ordners speichern.
- **WAV-Ausschnitte** können Fade-in/Fade-out, Normalisierung auf −1 dBFS und einen Loop-Übergang
  erhalten. Bei CC BY nennt die Credit-Datei die gewählten Änderungen.
- **Dein Rückblick als Bild:** Story (1080×1920) oder Post (1080×1080), speichern oder kopieren.
  Das Bild enthält Theme-Farben und Top-Listen, aber keine Cover.
- **Wöchentliche automatische Backups** sind optional und gehen in einen selbst gewählten Ordner.
- **Datensicherung bei Updates:** Muss ein Update gespeicherte Daten umbauen, legt CleanMusic vorher
  automatisch eine Sicherung unter `%APPDATA%\CleanMusic\backups` an (die letzten fünf bleiben).
  Beschädigte Einträge werden nicht gelöscht, sondern beiseitegelegt; CleanMusic sagt dir Bescheid.
  CleanMusic behält dort höchstens fünf eigene `cleanmusic-backup-*.json`-Dateien; kein Konto,
  keine Cloud-Synchronisierung.
- **Live-Hintergründe:** Lava-Lampe, Wellen, Synthwave-Gitter, Partikel-Nebel und Regen auf Glas.
  Optional ein eigenes MP4/WebM/GIF (max. 300 MB); es bleibt am ursprünglichen Speicherort, wird
  stumm abgespielt und nie in die Musik-Audio-Kette geleitet. Animationen pausieren im Hintergrund,
  bei „Bewegung aus“, `prefers-reduced-motion` und optional im Akkubetrieb.

### Handy-Fernbedienung, Mini-Player & Windows

- **Handy-Fernbedienung** (*Einstellungen → Verbindungen → Handy-Fernbedienung*): schaltet einen lokalen
  Webserver auf Port 4790 ein und zeigt Link + QR-Code. Sie funktioniert im selben privaten
  WLAN, braucht bei jeder Anfrage den geheimen Schlüssel und akzeptiert nur Loopback bzw.
  private IPv4-Adressen. Standardmäßig **aus**; ein neuer Link widerruft den alten.
- Die Fernbedienung steuert Wiedergabe, Position, Lautstärke, Favorit und Warteschlange und
  sucht ausschließlich im Vorschau-Katalog – keine lokalen Dateien und keine Stream-Downloads.
- **Sicherheit:** Erlaube die Windows-Firewall beim ersten Dialog nur für **Private Netzwerke**.
  Die Verbindung ist unverschlüsseltes HTTP im LAN. Verwende sie nicht in fremden/öffentlichen
  WLANs und teile QR-Code oder Link nur mit vertrauten Geräten.
- Der **Mini-Player** bleibt beim Wechseln ins kleine Fenster im Hintergrund mit dem Hauptfenster
  verbunden; optional immer im Vordergrund. Die Windows-Taskleiste hat Zurück/Play-Pause/Weiter
  und optional Fortschritt.
- Optional: globale `Strg+Alt`-Tastenkürzel (standardmäßig aus), Start mit Windows sowie
  *Einstellungen → System → Diagnose kopieren*. Fehler werden nur im Arbeitsspeicher gehalten;
  der Diagnosebericht enthält keine Telemetrie und ersetzt den Benutzerordner durch `~`.

---

## Schneller laden mit dem Quellen-Plugin

Das Quellen-Plugin (ab 1.3.0) lädt die nächsten beiden Titel und den ersten
Suchtreffer schon vorab und bündelt mehrere Titel in einem Aufruf. Am meisten bringt
ein **aktuelles yt-dlp als Python-Modul**: Es startet etwa doppelt so schnell wie die
einzelne EXE, und das Plugin nimmt es automatisch, sobald es mindestens so neu ist.

```powershell
python -m pip install -U yt-dlp
```

Die Plugin-Karte zeigt dann „schneller Start (Python)“.

## Updates

CleanMusic sucht **bei jedem Start und danach alle 2 Stunden** nach einer neuen Version (abschaltbar unter
*Einstellungen → System → Updates*, dort gibt es auch **Jetzt suchen**). Ist eine da,
erscheint unten rechts ein Hinweis:

Unter Windows erscheint außerdem sofort eine Systembenachrichtigung, auch wenn CleanMusic
minimiert/im Infobereich läuft. Nach vollständigem Beenden gibt es keine Benachrichtigungen:
CleanMusic betreibt keinen Hintergrunddienst.

- **Installiert (Setup):** *Updaten* lädt den neuen Installer, prüft Größe und
  SHA-256-Prüfsumme; nach *Jetzt installieren* schließt sich CleanMusic kurz,
  installiert das Update ohne Rückfragen und startet von selbst neu.
- **Portable EXE und AppImage** aktualisieren sich selbst: *Updaten* lädt
  die neue Datei neben deine jetzige, prüft Größe und SHA-256-Prüfsumme und
  startet sie nach *Jetzt neu starten*. Die alte EXE kannst du danach löschen.
- Deine Daten bleiben in jedem Fall, weil sie im App-Profil liegen.
- Aus dem Quellcode gestartet gibt es einen Link zur Download-Seite.

Gefragt wird nur die öffentliche Release-Liste dieses Repositorys auf GitHub,
ohne persönliche Daten.

---

## Plugins (optional)

CleanMusic kann **Quellen-Plugins** laden – einzelne `.js`-Dateien, die weitere
Quellen für Suche, volle Titel und Vorschläge anbinden. **Es werden keine
Plugins mitgeliefert.**

1. Wähle in *Einstellungen → Plugins* **Plugin-Datei hinzufügen …** und öffne
   eine `.js`-Datei. Du kannst sie auch per Drag & Drop auf den Plugin-Bereich
   ziehen. CleanMusic kopiert die Datei in deinen Plugin-Ordner im App-Profil
   (z. B. `%APPDATA%\CleanMusic\plugins`).
2. Die Plugin-Liste wird automatisch neu eingelesen. Das Plugin bleibt
   **ausgeschaltet**. Erst beim Aktivieren wird es geladen – nach einer
   Rückfrage, denn Plugins laufen mit vollen Rechten.
3. Liegt im Profil schon eine Datei mit demselben Namen, fragt CleanMusic vor
   dem Überschreiben. Nach dem Ersetzen bleibt das Plugin ausgeschaltet.

Ein aktives Plugin kann:

- **Suchen:** eigener Trefferblock in der Suche.
- **Volle Titel abspielen:** CleanMusic streamt die URL, die das Plugin liefert.
- **Abgleichen:** Apple-Music-/Deezer-Vorschauen als vollen Titel abspielen
  (eigener Schalter, sonst läuft die 30-s-Vorschau).
- **Vorschläge:** verwandte Titel zu deinen Favoriten aus dieser Quelle.

Was ein Plugin tut und ob das bei der jeweiligen Quelle erlaubt ist, liegt in
der Verantwortung von dir bzw. der Person, die das Plugin geschrieben hat.
Die Schnittstelle ist in [docs/PLUGIN-API.md](docs/PLUGIN-API.md) beschrieben.
Ein Plugin mit `charts()` bekommt auf der Startseite unter *Trending & Neuheiten*
einen eigenen Reiter (z. B. Top-Listen seiner Quelle).
Seit **API v2** können Plugins auf Titelwechsel reagieren, den Player steuern
und eigene Einstellungsfelder in ihrer Plugin-Karte anzeigen; v1-Plugins laufen
unverändert. Siehe auch die Hinweise zu Plugins in [LEGAL.md](LEGAL.md).

### Streamer.bot (optionales Plugin)

[`extras/plugins/streamerbot.js`](extras/plugins/) bringt Twitch-Chat-Befehle über
Streamer.bot: `!song` postet den aktuellen Titel, `!skip` und `!pause` steuern
CleanMusic (Token-geschützt, nur lokal). Optional **Songwünsche** mit `!sr`,
`!wrongsong` und `!wishes` – mit Limits pro Zuschauer, in der Warteschlange als
„Wunsch von …“ markiert. Seit 1.4 (Plugin 1.2.0) auch **per Link** – Spotify, Deezer,
Apple Music und YouTube (mit Quellen-Plugin): Der Wunsch kommt **als Nächstes** und
landet zusätzlich in der Playlist „Songwünsche aus dem Chat“. Ein **KI-Filter** lehnt
gekennzeichnete KI-Songs ab („AI Cover“, „Suno“, „KI-generiert“ …) – er erkennt nur,
was gekennzeichnet ist. Seit Plugin 1.3.0 meldet CleanMusic **Titelwechsel per
WebSocket** an Streamer.bot und ruft dort eine Action auf (Titel, Artist, Album,
Cover, Link, Quelle, Länge, Wiedergabestatus); optional mit Passwort, mit
automatischem Neuaufbau. Anleitung:
[extras/plugins/README.md](extras/plugins/README.md#streamerbot-streamerbotjs).

### OBS Now-Playing (optionales Plugin)

Ab Plugin 1.1.0: zehn Stile – Karte, Leiste, Nur Text, **Plattenspieler** (Cover dreht
sich), **Neon**, **Glas**, **Equalizer**, **Laufschrift**, **großes Cover** und
**Songtext** – plus eine zweite Quelle **„Als Nächstes“** (`/upnext`, nur Wünsche:
`/upnext?only=requests`), die die kommenden Titel und Songwünsche mit Namen zeigt.

Im Repository liegt unter [`extras/plugins/obs-overlay.js`](extras/plugins/)
ein fertiges Plugin für Streamer: Es zeigt den laufenden Titel als
**transparentes Overlay in OBS** (Browserquelle, Stil *Karte mit Cover*,
*Schmale Leiste* oder *Nur Text*, live aktualisiert) und schreibt auf Wunsch
`nowplaying.txt`, `title.txt`, `artist.txt` und `cover.jpg`. Der kleine
Server läuft nur auf `127.0.0.1`. Es ist **nicht** in der EXE enthalten –
hinzufügen wie jedes andere Plugin, Anleitung in
[extras/plugins/README.md](extras/plugins/README.md).

### OBS Audio-Visualizer (optionales Plugin)

Ab 1.15.0 liegt unter
[`extras/plugins/obs-visualizer.js`](extras/plugins/) ein echter,
musikreaktiver Visualizer für OBS: **Balken**, **Spiegel**, **Kreis** oder
**Welle** folgen dem Live-Spektrum aus CleanMusic, die Farben kommen aus dem
Cover. Einfach als transparente Browserquelle einfügen (ca. 800 × 300, Kreis
420 × 420). Das Plugin meldet CleanMusic dafür `visualizer: true`; nur dann
schickt die App das Spektrum etwa 25-mal pro Sekunde an den lokalen Server.
Anleitung: [extras/plugins/README.md](extras/plugins/README.md#obs-audio-visualizer-obs-visualizerjs).

---

## Android, Android TV und Fire TV

Die Android-App ist ein eigenes Projekt in `mobile/` mit eigenen Versionen
(`mobile-1.1.0`) und eigenen Release-Dateien `CleanMusic-Android-<version>.apk`.
Sie läuft parallel zu den Desktop-Versionen; deren Asset-Namen und Updater
bleiben unverändert.

- **Eine APK für alles:** Handy, Tablet, Android TV, Google TV und Fire TV.
  Die App erkennt das Gerät (`UiModeManager`) und startet auf dem Fernseher
  automatisch **CleanMusic TV Lite**.
- **Keine eingebetteten Streaming-Web-Player:** „In Spotify / YouTube Music /
  Apple Music öffnen“ übergibt den Titel per Deep Link an die offizielle App.
- **Keine Plugins, kein yt-dlp, keine Stream-Downloads:** Node-Code läuft auf
  Android nicht. Die Regeln aus `AGENTS.md` gelten unverändert.
- **Mit dabei:** Vorschauen (Deezer/Apple), Radio, Charts, Favoriten, Playlists,
  Verlauf, Rückblick, Songtexte mit Effekten, Themes, Live-Hintergründe,
  Plattenspieler, Visualizer, Songs teilen und lokale Musik über die
  Android-Mediathek (nur nach Rückfrage).
- **Hintergrund-Wiedergabe:** Benachrichtigung, Sperrbildschirm und
  Kopfhörer-Tasten über `MediaSession` und einen Foreground-Service.
- **Eingebauter Updater:** prüft beim Start und alle 6 Stunden die
  GitHub-Releases (`mobile-*`), lädt die APK, prüft Größe und SHA-256 und
  öffnet den Android-Installer.
- **TV Lite:** kein Cutter, keine Downloads, keine Wellenform/BPM, kein
  Rückblick, keine Plugins, kein Playlist-Import, keine lokale Musik und keine
  Ansicht „Erweitert“ – diese Teile werden auf dem Fernseher gar nicht geladen.
  Bedienung über QR-Code und Handy (`/api/state`, `/api/cmd`, `/api/search`,
  `/api/queue`, `/api/events`, `/api/radio`, `/api/favorites`).
- **Fernbedienung als Notlösung:** Fokus-Navigation, Play/Pause, Weiter/Zurück,
  Lautstärke und Zurück-Taste funktionieren immer.

Bauen, Signieren und Testen: [`mobile/README.md`](mobile/README.md).

## Was es bewusst **nicht** macht

- DRM-Streams entschlüsseln oder Streams speichern / herunterladen (Downloads
  gibt es nur für frei lizenzierte Dateien aus dem Cutter-Modus)
- Plugins oder Downloader mitliefern
- Werbung blockieren
- Einen „einen Player für alle" vortäuschen: Spotify, TIDAL, Amazon & Co.
  bleiben in ihren offiziellen Web-Playern

Ein Musik-Launcher funktioniert wie Heroic nur in einer Hinsicht: Er **startet**
den richtigen Player. Er ersetzt ihn nicht, weil Musik – anders als DRM-freie
Spiele-Binaries – serverseitig verschlüsselt gestreamt wird.

---

## Starten

```powershell
npm.cmd install
npm.cmd start
```

Falls PowerShell Skripte blockiert (`npm.ps1 cannot be loaded`), immer
`npm.cmd` statt `npm` verwenden.

Falls Electron nach der Installation nicht startet ("Electron failed to install
correctly"), den Binary-Download einmal manuell nachholen:

```powershell
node node_modules/electron/install.js
```

Entwicklung mit DevTools:

```powershell
npm.cmd run dev
```

Smoke-Test (Fenster bleibt unsichtbar, eigenes Wegwerf-Profil – deine
Favoriten werden nicht angefasst): prüft Renderer, Vorschauen, Radio,
Favoriten, Playlists und Vorschläge.

```powershell
npm.cmd run smoke
```

Zusätzlich das erste gefundene Plugin aktivieren und durchspielen (Suche,
voller Titel, Abgleich, Vorschläge – dauert je nach Plugin ~1 Minute):

```powershell
npm.cmd run smoke:plugin
```

Im Entwicklungsmodus (`npm.cmd start`) wird zusätzlich der Projektordner
`plugins` durchsucht; in der fertigen EXE nur der Plugin-Ordner des Profils
und `plugins` neben der portablen EXE.

## Fertige EXE bauen

```powershell
npm.cmd run build:win
```

Ergebnis:

- `release\CleanMusic-1.1.0-setup.exe` – **Installer** (ein Klick, pro Benutzer,
  ohne Admin-Rechte; installiert nach `%LOCALAPPDATA%\Programs\cleanmusic`)
- `release\CleanMusic-1.1.0-portable.exe` – **eine einzelne portable EXE**,
  kein Installer, einfach doppelklicken
- `release\win-unpacked\CleanMusic.exe` – entpackte Variante, startet etwas
  schneller (Ordner muss zusammenbleiben)

`release/` bleibt aus Git ausgeschlossen. Für eine Weitergabe hängst du die
EXE-Dateien als Assets an ein GitHub Release (macht der Workflow bei einem
`v*`-Tag), statt sie ins Repository zu committen.

Die EXE ist nicht code-signiert. Windows SmartScreen zeigt beim ersten Start
„Windows hat den PC geschützt" → **Weitere Informationen** →
**Trotzdem ausführen**. Für eine signierte Version braucht es ein
Code-Signing-Zertifikat.

## Linux / AppImage

AppImages müssen auf Linux gebaut werden – electron-builder kann sie nicht
unter Windows cross-kompilieren.

```bash
npm run build:linux
```

Ergebnis: `release/CleanMusic-1.1.0.AppImage`.

Alternativ über GitHub Actions: Das Workflow-File
`.github/workflows/build.yml` baut bei jedem `v*`-Tag automatisch die
Windows-Portable-EXE **und** das Linux-AppImage und hängt beides an das
GitHub-Release.

**Widevine unter Linux:** Ohne installiertes Chrome/Chromium mit
`libwidevinecdm.so` funktionieren Spotify, Apple Music, Deezer und Amazon
Music im AppImage nicht. CleanMusic sucht beim Start nach dem CDM; wenn keiner
da ist, bleibt der „Im Browser öffnen"-Fallback. Details:
[LEGAL.md](LEGAL.md).

---

## Bedienung

- **Sidebar** → Dienst anklicken: der offizielle Web-Player öffnet sich eingebettet.
- **Bibliothek** → Favoriten, lokale Musik, deine Playlists, *Neue Playlist*.
- **Suche oben** → Enter: Treffer mit Vorschau (und mit aktivem Plugin dessen Treffer).
- **♥ / +** an jedem Titel, auch im Player unten links.
- **Drag & Drop** von Titeln auf Favoriten oder Playlists in der Seitenleiste.
- **Lokale Musik** → Ordner hinzufügen, Titel anklicken, unten abspielen.
- **Einstellungen** → Plugins, System-Browser, Sessions zurücksetzen,
  MusicKit-Fenster.
- **Cutter-Modus** → Kategorien durchklicken, Kopier-Knopf sammelt Credits.
- **F** öffnet den Vollbild-Player (Leertaste, Pfeiltasten, N/P, Esc).
- **M** stumm, **+ / −** lauter/leiser, **Mausrad** auf dem Lautstärkeregler.
- **Infobereich (Tray):** Symbol mit aktuellem Titel, Play/Pause, Weiter, Zurück.
  Optional läuft CleanMusic beim Schließen dort weiter (*Einstellungen → System*).
- **Schlaf-Timer** (Mond-Symbol in der Player-Leiste): Stopp nach 15–90 Minuten
  oder am Ende des Titels.
- **Video-Credits** im Cutter-Modus kopieren oder **als .txt speichern**.
- **Medientasten** der Tastatur und das **Windows-Medien-Overlay** (mit Titel,
  Artist und Cover) steuern CleanMusic.
- **Einstellungen → System → Sichern & Wiederherstellen** → Favoriten, Playlists,
  Video-Credits, Verlauf und Aussehen als JSON sichern oder auf einem anderen PC
  ergänzen (es wird nichts gelöscht).
- **Einstellungen → Darstellung** → Theme wählen, Akzentfarbe aus dem Cover.
- **Strg + K** fokussiert die Suche.
- **?** (oder **F1**) zeigt alle Tastenkürzel – auch unter *Einstellungen → System*.

Jeder Dienst bekommt eine eigene persistente Session (`persist:cm-<dienst>`),
Logins bleiben also nach einem Neustart erhalten. Über *Einstellungen →
Dienst-Daten → zurücksetzen* meldest du einen Dienst wieder ab.

---

## Technische Hinweise

### Woher die Songs kommen

Die Suche, die Charts und die Vorschläge werden im Hauptprozess über
offizielle, öffentliche Schnittstellen geladen:

- **Apple Music:** `itunes.apple.com/search` (iTunes Search API) – liefert
  Titelmetadaten und eine offizielle `previewUrl` (30 s, AAC).
- **Deezer:** `api.deezer.com/search`, `/chart`, `/artist/{id}/radio`,
  `/artist/{id}/related`, `/artist/{id}/top`, `/playlist/{id}/tracks` –
  Metadaten und offizielle `preview`-URLs (30 s, MP3). NCS-Titel haben bei
  Deezer oft keine Vorschau; CleanMusic holt sie dann beim Abspielen über die
  iTunes-Suche (gleicher Artist und Titel) samt Cover.
- **incompetech.com:** die Kevin-MacLeod-MP3s, wie vom Urheber bereitgestellt.
- **Openverse** (`api.openverse.org`): Creative-Commons-Suche für Freesound-
  und Jamendo-Audio, gefiltert auf CC0 und CC BY, inklusive Attribution.

Die Vorschau-URLs sind ausdrücklich für die Einbindung gedacht. CleanMusic
lädt sie in den eigenen `<audio>`-Player, speichert keine Streams und
entschlüsselt nichts.

### Widevine / DRM

Electron bringt kein Widevine mit. CleanMusic sucht beim Start das neueste
Widevine-CDM von Chrome oder Edge unter Windows und lädt es über
`--widevine-cdm-path` (Verzeichnis mit `widevinecdm.dll`). Das ist **kein**
Umgehen von DRM: Der CDM holt sich weiterhin eine gültige Lizenz vom Dienst.
Ohne CDM zeigen Spotify, Apple Music, Deezer und Amazon Music nur Fehler –
YouTube Music und SoundCloud laufen meist trotzdem.

Der Status steht in *Einstellungen → System*.

**Wichtige Einschränkung (VMP):** Chrome ab Version 59 verlangt für die
Lizenzvergabe ein „Verified Media Path"-signiertes Binary. Stock-Electron ist
nicht VMP-signiert. Viele Dienste liefern trotzdem Lizenzen, manche (z. B.
bestimmte Spotify-/Amazon-Titel) verweigern sie mit einem Lizenzfehler. Dann
hilft nur der System-Browser oder der lizenzierte
[castLabs-Electron-Fork](https://github.com/castlabs/electron-releases).
CleanMusic zeigt in dem Fall den Banner **Im Browser öffnen**.

### User-Agent

Die App meldet sich als normales Chrome, sonst verweigern einige Player den
Start. Google-Logins können trotzdem gelegentlich als „unsicherer Browser"
abgelehnt werden – dann hilft nur der Login im System-Browser. Der Button
**Im Browser** ist überall vorhanden.

### Speicher

Jeder eingebettete Player ist ein eigener Chromium-Renderer. Wenn du alle sieben
Dienste gleichzeitig öffnest, braucht das entsprechend RAM. CleanMusic erstellt
einen Player erst beim ersten Öffnen und behält ihn dann im Hintergrund, damit
die Musik weiterläuft.

### Daten

Favoriten, Playlists, Video-Credits, Bibliothek, Vorschläge und Einstellungen liegen im
`localStorage` des App-Profils. Welche Plugins aktiv sind, deren eigene
Einstellungen und die Discord-Einstellungen liegen in `cleanmusic-config.json` im selben Profil – das darf
nur der Hauptprozess schreiben.

### Apple MusicKit

`Einstellungen → Apple Music → MusicKit-Fenster öffnen`. Dort trägst du einen
MusicKit-Developer-Token (ES256-JWT aus deinem Apple-Developer-Account) ein.
Damit läuft echte In-App-Wiedergabe über Apples Player-SDK. Der Token bleibt
lokal in `localStorage` des MusicKit-Fensters.

---
 
## Community

Fragen, Ideen und Austausch: **Discord** → https://discord.gg/XqYMZJXJjA

Bugs und Funktionswünsche bitte weiterhin über die
[GitHub-Issues](https://github.com/BellocccYT/cleanmusic/issues) – dort bleiben sie
auffindbar und lassen sich mit Logs und Screenshots nachvollziehen.

Neue Versionen postet `.github/workflows/discord-changelog.yml` automatisch in
`#changelogs`, sobald der Build die Dateien hochgeladen hat. Der Text kommt aus
`docs/releases/<tag>.md` (zugleich der Text der GitHub-Release); ohne diese Datei wird
nichts gepostet. Nachholen: Actions → „Discord-Changelog“ → Run workflow.

## Rechtliches

Die eingebetteten Player sind die offiziellen Web-Angebote der Anbieter; es
gelten deren Nutzungsbedingungen. Für eine **Veröffentlichung** einer solchen
App brauchst du bei den meisten Diensten eine Freigabe (Spotify, Apple, TIDAL
haben eigene Partner-/Review-Prozesse). Für den privaten Gebrauch ist das
Einbetten der offiziellen Player der pragmatische, aber nicht garantierte Weg.

CleanMusic selbst umgeht keine technischen Schutzmaßnahmen und verbreitet
keine Audiodateien. **Plugins sind nicht Teil von CleanMusic:** Sie werden
nicht mitgeliefert, sind standardmäßig aus und laufen auf Verantwortung der
Nutzer:innen. Ein Plugin kann eine Quelle auf eine Weise nutzen, die deren
Bedingungen nicht erlauben.

Die vollständige Einordnung inklusive GitHub-/AppImage-Risiken steht in
[LEGAL.md](LEGAL.md).

---

## Struktur

```
AGENTS.md               Kontext und Regeln für künftige Code-Sitzungen
main.js                 Electron-Hauptprozess, Fenster, IPC, Widevine, Dateiscan,
                        Katalog/Charts/Radio, Vorschläge, Cutter-Quellen, Plugin-Lader,
                        Discord-Steuerung, Smoke-Test
discord-rpc.js          Discord Rich Presence über den lokalen Discord-IPC
preload.js              schmale, sichere Bridge für den Renderer
renderer/
  index.html            App-Shell
  styles.css            Layout und Farben (über Theme-Variablen)
  themes.js             die Farbpaletten
  assets/               Logo, Fenster-Icon und Assistenten-Musik
  core/text.js          reine Text-/Zeit-/Format-Helfer (getestet)
  core/storage.js       localStorage-Helfer (getestet)
  core/persist.js       alle localStorage-Schlüssel an einer Stelle (getestet)
  audio/queue.js        reine Queue-Helfer: Shuffle, Restore, Upcoming (getestet)
  onboarding-music.js   leise Hintergrundmusik im Erste-Schritte-Assistenten
  services.js           Dienste-Registry (URLs + offizielle Such-URLs)
  creator-data.js       Cutter-Modus: Kategorien, NCS-Playlists, YouTube-Klassiker
  visualizer.js         Web-Audio-Visualizer (Kreis, Balken, Welle, Mini) und
                        optionale Audio-Kette (Angleichen, Boost, Limiter)
  app.js                Navigation, Webviews, Bibliothek, Favoriten, Playlists,
                        Vorschläge, Cutter-Modus, Vollbild-Player, Player
  musickit.html/.js     optionale Apple-MusicKit-Wiedergabe
docs/                   Plugin-API und Screenshots für die README
extras/plugins/         optionale Plugins zum Selbst-Hinzufügen (OBS-Overlay, Streamer.bot)
build/                  App-Icons (aus tools/make-icons.js)
tools/                  Hilfsskripte (Icons erzeugen)
plugins/                Lokale Plugin-Dateien – nicht Teil des Repositorys oder der Builds
THIRD-PARTY-NOTICES.md  Lizenzhinweise der Theme-Paletten
```

## Nächste sinnvolle Schritte

Der Fahrplan zu **1.0** steht in [docs/PLAN-1.0.md](docs/PLAN-1.0.md) (Warteschlange + Autoplay,
Epidemic Sound und Artlist, Erste-Schritte-Assistent, Installer – fertig). Als Nächstes:

- **1.1: Englische Oberfläche** (Deutsch/Englisch umschaltbar, README auf Englisch).

0. ~~**Streamer.bot Phase 2:** Titelwechsel als WebSocket-Ereignis~~ – erledigt in
   Plugin 1.3.0 (Action mit Argumenten, Action-Liste, Passwort, Auto-Reconnect). Plan:
   [docs/PLAN-STREAMERBOT.md](docs/PLAN-STREAMERBOT.md). Offen bleibt nur ein
   Auswahlfeld für die Action (braucht dynamische Optionslisten in der Plugin-API).

1. **Cloud-freier Sync** zwischen PCs über einen selbst gewählten Ordner.
3. **Cutter-Extras:** BPM-Filter, Wellenform mit Schnittmarken, Sounds per Drag & Drop in den Editor.
4. **Scrobbling** (Last.fm / ListenBrainz) für lokale Titel, Radio und volle Titel.
5. **ISRC-Matching** für Playlist-Import/Export zwischen Diensten.
6. **MusicKit-Token-Generator** (JWT aus `.p8` lokal erzeugen).
