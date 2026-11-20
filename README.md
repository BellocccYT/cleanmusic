# CleanMusic – The Music Launcher

> Inoffizielles Projekt. Nicht verbunden mit Spotify, Apple, Google/YouTube,
> Amazon, TIDAL, Deezer oder SoundCloud.

**Version 0.7.1**

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
  <img src="docs/images/01-startseite.png" alt="CleanMusic-Startseite mit Suche, Diensten und Charts" width="100%">
</p>

<table>
  <tr><th>Cutter-Modus</th><th>Vollbild-Player mit Visualizer</th></tr>
  <tr>
    <td><img src="docs/images/03-cutter.png" alt="Cutter-Modus mit NCS-Kategorien, Titelliste und Video-Credits" width="100%"></td>
    <td><img src="docs/images/04-vollbild-player.png" alt="Vollbild-Player mit Visualizer und Warteschlange" width="100%"></td>
  </tr>
</table>

---

## Was zu 100 % in CleanMusic läuft

| Bereich | Status |
| --- | --- |
| Lokale Dateien (MP3, FLAC, WAV, M4A, AAC, OGG, OPUS, WMA, AIFF) | ✅ eigener Player, eigene Bibliothek |
| **Song-Suche mit In-App-Wiedergabe** | ✅ Apple Music + Deezer Katalog, 30-s-Vorschauen direkt im Player |
| **Beliebte Titel** | ✅ Deezer-Charts, sofort abspielbar |
| **Live-Radio** | ✅ tausende öffentliche Sender, volle Songs, kein Login, kein DRM |
| **Favoriten & Playlists** | ✅ ♥ und + an jedem Titel/Sender, gemischt aus allen Quellen, Drag & Drop |
| **Vorschläge „Für dich“** | ✅ aus deinen Favoriten (Deezer-Artist-Radio, verwandte Artists, optional über Plugins) |
| **Cutter-Modus** | ✅ NCS, YouTube-Klassiker (CC BY), Soundeffekte & freie Musik mit Lizenz und Credit |
| **Vollbild-Player & Visualizer** | ✅ Cover-Farben, Beat-Puls, Kreis/Balken/Welle, Kino-Modus |
| **Discord Rich Presence** | ⚙️ optional – eigene Discord-Application-ID nötig |
| **Quellen-Plugins** | ⚙️ optional – nicht enthalten, Datei in den Plugin-Ordner legen und aktivieren |
| Apple Music | ✅ offizieller Web-Player; zusätzlich **MusicKit-Fenster** für volle Titel (Developer-Token nötig) |
| Spotify, YouTube Music, TIDAL, Deezer, Amazon Music, SoundCloud | ✅ als offizieller Web-Player eingebettet |
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

### Favoriten, Playlists & Vorschläge

- **♥** an jedem Titel, jeder Vorschau, jedem Plugin-Treffer, jeder lokalen
  Datei und jedem Radiosender – oder im Player unten links für den laufenden
  Titel. Alles landet unter **Bibliothek → Favoriten** (Filter: Titel / Radio).
- **+** fügt einen Titel einer **Playlist** hinzu oder legt direkt eine neue
  an. Playlists mischen alle Quellen, zeigen ein Cover-Mosaik und lassen sich
  umbenennen, löschen, abspielen und shuffeln.
- **Drag & Drop:** Titel aus jeder Liste auf *Favoriten*, eine Playlist oder
  *Neue Playlist* in der Seitenleiste ziehen. In einer Playlist per Griff
  sortieren.
- **„Für dich“** auf der Startseite und **„Mehr wie deine Favoriten“** in den
  Favoriten: CleanMusic nimmt deine häufigsten Favoriten-Artists und holt über
  die öffentliche Deezer-API Artist-Radio und Top-Titel verwandter Artists.
  Ein aktives Quellen-Plugin steuert verwandte Titel zu deinen Plugin-Favoriten bei.
  **Neu mischen** lädt frische Vorschläge.
- Abgelaufene Deezer-Vorschau-Links in Favoriten/Playlists werden beim
  Abspielen automatisch erneuert.

Alles bleibt lokal (im Profil der App); es gibt kein Konto und keine Cloud.

### Cutter-Modus (für Videos)

Musik und Soundeffekte, die du in Videos verwenden darfst – mit Lizenz an jedem
Titel und fertigem Credit:

| Bereich | Quelle | Lizenz | Wiedergabe |
| --- | --- | --- | --- |
| **NCS** – 21 Kategorien (Top 100, Trending auf YouTube, Gaming, Phonk, House, Drum & Bass, Dubstep, Trap …) | offizielle NCS-Playlists bei Deezer | NCS: frei für YouTube/Twitch/Social mit Credit | 30-s-Vorschau (Apple-Katalog), mit Quellen-Plugin voller Titel |
| **YouTube-Klassiker** – die meistgenutzten YouTube-Songs (Kevin MacLeod: *Fluffing a Duck*, *Monkeys Spinning Monkeys*, *Sneaky Snitch*, *Investigations* …) in 6 Stimmungen | incompetech.com | CC BY 4.0 | volle Titel |
| **Soundeffekte** – Whoosh, Transition, Impact, Riser, Pop, Klick, Glitch, Applaus, Lachen, Fail … oder eigene Suche | Freesound über Openverse | CC0 oder CC BY (pro Sound angezeigt) | volle Sounds |
| **Freie Musik** – Cinematic, Upbeat, Episch, Entspannt, Piano, Beats … oder eigene Suche | Jamendo & Co. über Openverse | CC0 oder CC BY | volle Titel |

- **Kopier-Knopf** an jedem Titel: kopiert den Credit in die Zwischenablage und
  sammelt ihn in **Video-Credits**. *Alle kopieren* liefert den kompletten Block
  für die Videobeschreibung.
- Lizenz-Badge (CC0 · CC BY · NCS) und ↗ zur Quelle bzw. zum Download beim Urheber.
- Openverse erlaubt ohne Konto ~200 Anfragen am Tag; CleanMusic speichert
  Ergebnisse deshalb 24 h zwischen.

### Vollbild-Player

Taste **F**, der Knopf ⤢ in der Player-Leiste oder Doppelklick aufs Cover:

- großes Cover, das im Takt pulsiert; Hintergrund und Leuchten in den Farben
  des Covers
- Visualizer im Stil *Kreis ums Cover*, *Balken* oder *Welle* (oben rechts umschaltbar)
- „Als Nächstes“ mit den kommenden Titeln (anklickbar)
- Kino-Modus: nach ein paar Sekunden ohne Mausbewegung verschwinden Bedienelemente und Zeiger
- Tasten: **Leertaste** Play/Pause · **← →** ±5 s · **↑ ↓** Lautstärke ·
  **N / P** weiter/zurück · **Esc** schließen

### Visualizer (optional)

Analysiert über die Web-Audio-API, was gerade läuft – lokale Dateien, Vorschauen,
Radio, Plugin-Titel. Die Wiedergabe selbst wird dabei nicht umgeleitet (Analyse
per `captureStream()`), es kann also nichts stumm werden. Ein- und ausschalten,
Stil wählen und den **Mini-Visualizer** in der Player-Leiste gibt es unter
*Einstellungen → Visualizer*. Bei Pause zeichnet er nur noch ~8× pro Sekunde.

### Discord Rich Presence (optional)

Zeigt in deinem Discord-Profil „Hört CleanMusic“ mit Titel, Artist, Cover,
Fortschrittsbalken und einem *Anhören*-Link. Läuft lokal über den
Discord-Client (IPC), standardmäßig **aus**.

1. Im [Discord Developer Portal](https://discord.com/developers/applications)
   „New Application“ anlegen, Name z. B. *CleanMusic*.
2. Die **Application ID** unter *Einstellungen → Discord Rich Presence*
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

### Player

- Shuffle und Repeat (aus / alle / Titel) mit gespeichertem Zustand
- Queue aus lokalen Titeln, Vorschauen, Plugin-Titeln, Radiosendern, Favoriten
  oder Playlists
- Cover, Artist und Quellen-Badge im „Now Playing" (z. B. *30 s Vorschau*,
  *Voll · Quelle des Plugins*, *Radio · LIVE*)
- ♥ und + für den laufenden Titel direkt im Player

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
Die Schnittstelle (Plugin-API v1) ist in [docs/PLUGIN-API.md](docs/PLUGIN-API.md)
beschrieben. Siehe auch die Hinweise zu Plugins in [LEGAL.md](LEGAL.md).

---

## Was es bewusst **nicht** macht

- DRM-Streams entschlüsseln oder Streams speichern / herunterladen
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

- `release\CleanMusic-0.7.1-portable.exe` – **eine einzelne portable EXE**,
  kein Installer, einfach doppelklicken
- `release\win-unpacked\CleanMusic.exe` – entpackte Variante, startet etwas
  schneller (Ordner muss zusammenbleiben)

`release/` bleibt aus Git ausgeschlossen. Für eine Weitergabe hängst du die
portable EXE als Asset an ein GitHub Release, statt sie ins Repository zu committen.

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

Ergebnis: `release/CleanMusic-0.7.1.AppImage`.

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
- **Strg + K** fokussiert die Suche.

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
  styles.css            dunkles Launcher-Theme
  services.js           Dienste-Registry (URLs + offizielle Such-URLs)
  creator-data.js       Cutter-Modus: Kategorien, NCS-Playlists, YouTube-Klassiker
  visualizer.js         Web-Audio-Visualizer (Kreis, Balken, Welle, Mini)
  app.js                Navigation, Webviews, Bibliothek, Favoriten, Playlists,
                        Vorschläge, Cutter-Modus, Vollbild-Player, Player
  musickit.html/.js     optionale Apple-MusicKit-Wiedergabe
docs/                   Plugin-API und Screenshots für die README
plugins/                Lokale Plugin-Dateien – nicht Teil des Repositorys oder der Builds
```

## Nächste sinnvolle Schritte

1. **Export/Import** von Favoriten, Playlists und Video-Credits (JSON-Backup).
2. **Medientasten & Windows-Media-Overlay** (`navigator.mediaSession`), Tray-Icon.
3. **Cutter-Extras:** BPM-Filter, Wellenform mit Schnittmarken, Sounds per Drag & Drop in den Editor.
4. **Scrobbling** (Last.fm / ListenBrainz) für lokale Titel, Radio und volle Titel.
5. **ISRC-Matching** für Playlist-Import/Export zwischen Diensten.
6. **MusicKit-Token-Generator** (JWT aus `.p8` lokal erzeugen).
