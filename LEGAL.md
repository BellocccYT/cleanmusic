# Rechtliche Einordnung

> Keine Rechtsberatung. Das ist eine technische und praktische Einschätzung,
> keine Freigabe. Für eine Veröffentlichung solltest du im Zweifel eine
> Anwältin oder einen Anwalt fragen.

## Was CleanMusic technisch macht

- Es lädt die **offiziellen Web-Player** der Anbieter in einem eingebetteten
  Chromium-Fenster (`<webview>`), mit eigenem, persistentem Login.
- Werbung, Login, Bezahlung, Wiedergabe und DRM laufen **vollständig beim
  Anbieter**. CleanMusic blockiert keine Werbung, umgeht keine
  Zugriffsbeschränkungen und entschlüsselt keine Streams.
- Zusätzlich werden **30-Sekunden-Vorschauen** über die offiziellen,
  öffentlichen Schnittstellen von Apple (iTunes Search API) und Deezer geladen
  und im eigenen `<audio>`-Player abgespielt. Vorschläge kommen aus
  öffentlichen Deezer-Endpunkten (Artist-Radio, verwandte Artists).
- Lokale Dateien und öffentliche Radiostreams werden direkt abgespielt.
- Im Cutter-Modus: frei lizenzierte Musik und Soundeffekte (CC0/CC BY) direkt
  von den Urhebern bzw. Openverse sowie NCS-Kategorien mit offiziellen
  Vorschauen – jeweils mit Lizenzangabe und Credit-Text.
- Optional: Discord Rich Presence über den lokalen Discord-Client.
- Favoriten und Playlists sind reine lokale Listen (Metadaten + Links), es
  werden keine Audiodaten gespeichert.
- **Optional:** ein Plugin-Lader. CleanMusic bringt **keine** Plugins mit; ein
  Plugin ist eine Datei, die der Nutzer selbst in den Plugin-Ordner legt und
  bewusst aktiviert (siehe Abschnitt „Plugins“).

Ohne Plugins ist das deutlich weniger invasiv als ein Downloader oder ein
Client mit reverse-engineerter API. Es ist aber **nicht dasselbe wie eine
ausdrückliche Erlaubnis** des Anbieters.

## Der entscheidende Punkt

Ein WebView-Wrapper ist ein **Graubereich**, keine klar erlaubte Integration:

- Die Nutzungsbedingungen der Dienste erlauben grundsätzlich nur die Nutzung
  über die offiziellen Clients und die offiziell dokumentierten Schnittstellen.
- Spotify verbietet in den Nutzerrichtlinien unter anderem:
  - Reverse-Engineering und das Erstellen abgeleiteter Werke (§ 1),
  - das Kopieren, Weiterverbreiten, Aufzeichnen oder öffentliche Zugänglichmachen
    von Inhalten (§ 2),
  - das Umgehen von Zugriffsbeschränkungen (§ 9),
  - **das Umgehen oder Blockieren von Werbung** (§ 10).
- CleanMusic verstößt nicht gegen § 10 (Werbung bleibt erhalten) und nicht
  gegen § 9 (kein Geo-/DRM-Bypass). Ein Wrapper kann aber als „abgeleitetes
  Werk" oder als nicht genehmigte Weitergabe der Dienst-Oberfläche ausgelegt
  werden.
- Marken und Logos der Dienste dürfen nicht so verwendet werden, dass eine
  Zugehörigkeit oder Unterstützung suggeriert wird.

Kurz: **Technisch sauber, rechtlich grau.** Für den privaten Gebrauch ist das
Risiko meist gering. Für eine öffentliche Distribution ist es real.

## Wenn du es auf GitHub stellst

Das ist möglich, aber mit Risiken:

1. **Kein offizieller Segen.** Spotify, Apple & Co. können verlangen, dass die
   App entfernt wird. GitHub reagiert auf DMCA- und Markenbeschwerden.
2. **Keine Marken/Logos bündeln.** Nutze neutrale Namen und keine offiziellen
   Icons. „CleanMusic" ist neutral; „Spotify Launcher" wäre es nicht.
3. **Kein Monetarisieren.** Keine Spenden-Buttons, keine Pro-Version, keine
   Werbung, kein Verkauf – das verschärft die rechtliche Bewertung deutlich.
4. **Keine Assets oder Keys** der Anbieter mitliefern.
5. **Disclaimer** in README und App: „Inoffizielles Projekt, nicht mit Spotify,
   Apple, Google, Amazon, TIDAL, Deezer oder SoundCloud verbunden."
6. **Bereit sein zu reagieren.** Wenn ein Anbieter oder GitHub sich meldet:
   Dienst entfernen oder das Projekt umbenennen. Das ist kein Weltuntergang,
   aber einplanen.

Der Quellcode selbst ist in der Regel unproblematisch. Die Kombination aus
Name, UI und gebündelten Diensten ist der Punkt, an dem Beschwerden ansetzen.

## Plugins

CleanMusic enthält einen allgemeinen Plugin-Lader. Plugins werden nicht
mitgeliefert und sind standardmäßig ausgeschaltet. Ein Plugin wird erst nach
einer bewussten Aktivierung und einer Rückfrage geladen. Plugins laufen mit den
Rechten des App-Hauptprozesses; installiere daher nur Dateien, denen du
vertraust.

Eine `.js`-Datei, die du über *Einstellungen → Plugins* auswählst oder auf den
Plugin-Bereich ziehst, wird von CleanMusic in deinen Profil-Plugin-Ordner
kopiert. Die App prüft nicht, ob die Datei vertrauenswürdig oder ihr Verhalten
zulässig ist.

Nutzer:innen sind selbst dafür verantwortlich, welche Plugins sie installieren
und verwenden. Ein Plugin kann Dienste oder Inhalte auf eine Weise nutzen, die
den Nutzungsbedingungen des jeweiligen Anbieters widerspricht. CleanMusic prüft
oder genehmigt Plugins nicht und übernimmt keine Verantwortung für ihr
Verhalten.

## Downloads („Nur Cutting“)

- Standardmäßig **aus**. Eingeschaltet lädt CleanMusic nur Dateien, deren Lizenz
  das ausdrücklich erlaubt: **CC0, CC BY oder Public Domain**, und nur von
  bekannten Quellen freier Musik (incompetech.com, Freesound, Jamendo, ccMixter,
  Wikimedia). Lizenz und Quelle prüft der Hauptprozess, nicht nur die Oberfläche.
- Neben jeder Datei liegt eine `.txt` mit Titel, Urheber, Lizenz-Link und
  Credit-Text. Bei CC BY **musst** du diesen Credit in deinem Video angeben.
- Streams der Dienste, 30-Sekunden-Vorschauen, NCS-Titel (eigene
  Nutzungsbedingungen, Download nur bei NCS selbst) und alles, was Plugins
  liefern, sind vom Download ausgeschlossen. Einen Modus „alles
  herunterladen“ gibt es nicht und wird es nicht geben – das würde Urheber- und
  Nutzungsrechte der Dienste verletzen.

## Cutter-Modus: Was du in Videos verwenden darfst

Der Cutter-Modus zeigt nur Quellen, deren Nutzung in Videos ausdrücklich
erlaubt ist – **unter Bedingungen**, die CleanMusic an jedem Titel anzeigt:

- **NCS (NoCopyrightSounds):** frei für Videos auf YouTube, Twitch, TikTok &
  Co., **mit Credit** im vorgegebenen Format (CleanMusic erzeugt ihn). Nicht
  frei für Werbung, TV, Kino, Apps/Spiele oder Wiederveröffentlichung – dafür
  braucht es eine Lizenz von NCS. Maßgeblich ist die aktuelle
  [NCS Usage Policy](https://ncs.io/usage-policy).
- **Kevin MacLeod (incompetech.com):** CC BY 4.0 – auch kommerziell und
  monetarisiert erlaubt, **mit Credit**. Wer keinen Credit angeben will, kann
  bei filmmusic.io eine Lizenz kaufen.
- **Openverse (Freesound, Jamendo …):** nur **CC0** (keine Pflichten) und
  **CC BY** (Credit Pflicht). Die Lizenz steht an jedem Sound; maßgeblich ist
  die Angabe auf der verlinkten Originalseite.
- **Content ID:** Auch freie Musik kann auf YouTube fälschlich gemeldet werden.
  Der Credit in der Beschreibung ist dann dein Nachweis für den Widerspruch.

Die 30-Sekunden-Vorschauen der NCS-Titel kommen aus Apples offiziellem
Katalog; volle NCS-Titel gibt es kostenlos bei ncs.io oder – mit einem
Quellen-Plugin – in CleanMusic.

## Discord Rich Presence

- Läuft ausschließlich über den **lokalen** Discord-Client (offizielle
  IPC-Schnittstelle, wie bei Spielen). CleanMusic spricht keinen Discord-Server
  direkt an und braucht kein Discord-Konto-Login.
- Standardmäßig **aus**. Eingeschaltet sehen andere in deinem Profil Titel,
  Artist, Cover (abschaltbar) und einen Link zum Titel.
- Die Application-ID gehört zu einer Discord-Application, die du selbst
  anlegst; es gelten die Discord-Developer-Bedingungen. Name und Bild der
  Application keine fremden Marken verwenden („Spotify“ o. Ä.).

## OBS-Overlay-Plugin

- Liegt nur als **optionales Plugin** im Ordner `extras/plugins/` und ist nicht
  Teil der EXE. Es zeigt Titel, Artist und Cover dessen, was in CleanMusic läuft.
- Der Server lauscht ausschließlich auf `127.0.0.1` und beantwortet nur
  Anfragen an `127.0.0.1`/`localhost` – weder andere Geräte im Netzwerk noch
  Webseiten können ihn abfragen.
- Was du im Stream zeigst, verantwortest du selbst: Ein Overlay mit Titel und
  Cover ist üblich; die Musik selbst im Stream zu spielen, braucht die
  passenden Rechte (z. B. freie Musik aus dem Cutter-Modus).

## Themes

- Die Community-Themes übernehmen nur **Farbwerte** freier Paletten (MIT-Lizenz).
  Lizenztexte und Rechteinhaber stehen in `THIRD-PARTY-NOTICES.md`, die auch in
  der EXE enthalten ist.

## AppImage / Linux

- AppImages **können nicht unter Windows gebaut werden**. Der Build muss auf
  Linux oder in CI (GitHub Actions, `ubuntu-latest`) laufen. Das Workflow-
  File liegt unter `.github/workflows/build.yml`.
- **Widevine ist das Hauptproblem:** Electron bringt keinen CDM mit. Unter
  Linux funktionieren Spotify, Apple Music, Deezer und Amazon Music nur, wenn
  ein Chrome-/Chromium-Widevine auf dem System liegt
  (`libwidevinecdm.so`). CleanMusic sucht beim Start danach, aber eine frische
  AppImage-Umgebung ohne Chrome hat keinen CDM.
- Ohne Widevine bleiben YouTube Music und SoundCloud meist nutzbar, die
  DRM-Dienste zeigen einen Fehler und den „Im Browser öffnen"-Fallback.
- Für garantierte DRM-Wiedergabe bräuchte es den lizenzierten
  [castLabs-Electron-Fork](https://github.com/castlabs/electron-releases) oder
  eine eigene Vereinbarung mit den Anbietern.

## Empfehlung

- **Privat:** so lassen, wie es ist. Ohne Plugins nutzt die App ausschließlich
  offizielle Player und offizielle Vorschau-APIs.
- **Öffentlich auf GitHub:** neutraler Name, keine Logos, klarer Disclaimer,
  keine Monetarisierung, keine gebündelten Assets – und den Ordner `plugins/`
  nicht mit veröffentlichen. Dann ist es ein nachvollziehbares
  Open-Source-Projekt mit Restrisiko – kein garantierter Bestand.
- **Kommerziell:** ohne Lizenzvereinbarung mit den Anbietern nicht.
