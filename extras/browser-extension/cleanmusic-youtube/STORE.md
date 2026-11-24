# Store-Unterlagen – CleanMusic für YouTube 2.0.0

Alles, was der Chrome-Web-Store-Dialog abfragt, plus die Begründungen für die Prüfung.
Die Angaben sind so formuliert, dass sie zum tatsächlichen Code passen – nicht mehr
versprechen und nichts weglassen.

> **Status: veröffentlicht.** Version 2.0.0, seit 24. November 2026 im Chrome Web Store,
> Sichtbarkeit öffentlich.
> Eintrag: https://chromewebstore.google.com/detail/hghplimkfmogkheakonapklcfgioc
> Item-ID: `hghplimkfmogkheakonapklcfgioc`

## Basisdaten

| Feld | Wert |
| --- | --- |
| Name | `CleanMusic für YouTube` |
| Kurzbeschreibung (max. 132 Zeichen) | `YouTube-Videos mit einem Klick in die CleanMusic-Warteschlange legen oder direkt in der Desktop-App abspielen.` |
| Kategorie | `Fun` |
| Sprache | Deutsch |
| Sichtbarkeit | öffentlich (zuerst `unlisted`, dann umgestellt) |
| Homepage | https://bellocccyt.github.io/cleanmusic/ |
| Support | https://github.com/BellocccYT/cleanmusic/issues |
| Datenschutz-URL | https://bellocccyt.github.io/cleanmusic/privacy/ |
| Version | `2.0.0` |
| Einmalige Gebühr | 5 USD (Developer-Konto, 2FA obligatorisch) |

## Detaillierte Beschreibung

```text
CleanMusic für YouTube verbindet den Browser mit der CleanMusic-Desktop-App.

Das Video, das du gerade siehst, landet mit einem Klick in der Warteschlange – oder
startet sofort in CleanMusic. Der Knopf sitzt dort, wo du ihn erwartest: unter dem
Titel neben Like und Teilen, unten rechts in den Player-Steuerungen und als
schwebender Knopf auf YouTube Music und Shorts.

FUNKTIONEN
• Ein Klick: Video in die Warteschlange oder direkt abspielen
• Vorschau im Popup mit Thumbnail, Titel und Kanal
• Suche in CleanMusic – auch für Seiten ohne Video
• Shift-Klick spielt sofort, Alt-Klick sucht im Katalog
• Rechtsklick: aktuelles Video, YouTube-Link oder markierten Text übernehmen
• Tastenkürzel für Popup, Warteschlange und Wiedergabe
• Einstellungen für jeden Knopf, Hinweise und Häkchen
• Funktioniert auf youtube.com, m.youtube.com und music.youtube.com

DATENSCHUTZ
Die Erweiterung hat keinen Server. Sie liest ausschließlich Video-Kennung, Titel und
Kanal der geöffneten YouTube-Seite – und nur in dem Moment, in dem du einen
CleanMusic-Knopf drückst. Diese Angaben gehen an die lokal installierte App, sonst
nirgendwohin. Keine Konten, keine Cookies, kein Verlauf, keine Analyse, kein Code aus
dem Internet. Einstellungen liegen nur auf deinem Gerät.

COMMUNITY
Fragen und Austausch: https://discord.gg/XqYMZJXJjA
Bugs bitte über die GitHub-Issues: https://github.com/BellocccYT/cleanmusic/issues

VORAUSSETZUNG
CleanMusic (Windows, kostenlos, Open Source) muss installiert sein. Ohne die App zeigt
die Erweiterung eine Einrichtungsseite mit Download-Link und erklärt die Schritte.

CleanMusic ist ein inoffizielles Projekt und nicht mit YouTube oder Google verbunden.
```

## Begründung der Berechtigungen (Privacy-Tab)

**Host-Berechtigung – `https://www.youtube.com/*`, `https://m.youtube.com/*`,
`https://music.youtube.com/*`**

> The content script places the CleanMusic button in the YouTube interface and reads the
> current video id, title and channel name. Reading happens only to build the link the user
> explicitly requested. No other website is accessed.

**`contextMenus`**

> Adds three right-click entries that hand content to the local app: the current YouTube
> video, a right-clicked YouTube link, or selected text as a catalog search.

**`storage`**

> Stores six local UI preferences (which buttons are shown, feedback on/off) in
> `chrome.storage.local`. Nothing is synced or transmitted.

**Remote code**

> No. All JavaScript ships inside the package; the extension uses no `eval`, no remote
> scripts and no remotely hosted wasm.

**Single purpose (one sentence)**

> Send the YouTube video the user is currently watching to the locally installed CleanMusic
> desktop app, either into its queue or straight to playback.

## Copy-Paste für das Datenschutz-Formular

Diese vier Texte gehören in die Felder unter **Datenschutz** (englisch, weil das
Prüfteam international sitzt; Deutsch wird ebenfalls akzeptiert):

**Alleiniger Zweck**

```text
Send the YouTube video the user is currently watching to the locally installed CleanMusic desktop app: add it to the app's queue or start playback there. The extension has no server, no account and no other purpose.
```

**Begründung für contextMenus**

```text
Three right-click entries hand content to the local app: the current YouTube video, a right-clicked YouTube link, or selected text as a catalog search. The entries only appear on YouTube pages and YouTube links.
```

**Begründung für storage**

```text
Stores six local UI preferences (which buttons are shown, feedback on/off) in chrome.storage.local. No personal data, no sync, nothing is transmitted.
```

**Begründung für Hostberechtigung**

```text
Content script on youtube.com, m.youtube.com and music.youtube.com: it adds the CleanMusic buttons to the player and reads the current video id, title and channel name to build the cleanmusic:// link the user asked for. No other sites are accessed; nothing is stored or sent to a server.
```

## Store-Eintrag: weitere Felder

| Feld | Wert |
| --- | --- |
| Offizielle URL | leer lassen (nur verifizierte Domains; `github.io` lässt sich nicht verifizieren) |
| URL der Startseite | `https://bellocccyt.github.io/cleanmusic/` |
| Support-URL | `https://github.com/BellocccYT/cleanmusic/issues` |
| Nicht jugendfreie Inhalte | aus |
| Sichtbarkeit | erst `Nur mit Link`, nach dem Test `Öffentlich` |

## Testanweisungen (Tab „Testanweisungen“)

Das Feld ist auf **500 Zeichen** begrenzt. Anmeldung: keine, beide Felder leer lassen.

```text
CleanMusic is a free Windows app (github.com/BellocccYT/cleanmusic); this extension is its bridge.

Test: open youtube.com/watch?v=dQw4w9WgXcQ.
CleanMusic buttons appear under the title and in the player (reload once if not).
Open the popup: thumbnail, title, Queue/Play.
A click sends cleanmusic://add?... to the local app.

Without the app nothing opens - expected; the in-page notice links to onboarding.html with install steps. No network requests, no remote code.
```



| Frage | Antwort |
| --- | --- |
| Werden personenbezogene Daten erhoben? | Nein |
| Website-Inhalte | Ja – Video-ID, Titel, Kanal; nur lokal an die App, nicht an den Entwickler |
| Authentifizierungsdaten | Nein |
| Finanzdaten, Gesundheit, Nachrichten, Standort | Nein |
| Verkauf an Dritte | Nein |
| Nutzung für Kredite, Versicherung, Werbung | Nein |
| Übermittlung an Dritte | Nein |
| Verschlüsselung | nicht relevant – keine Übertragung |
| Datenschutzerklärung | https://bellocccyt.github.io/cleanmusic/privacy/ |

Hinweis für die Prüfung: Chrome zählt „Erheben“ als Übertragung vom Gerät weg. Die
Video-Angaben verlassen den Rechner nicht, sie gehen per `cleanmusic://` an ein lokal
installiertes Programm.

## Hinweise für Reviewer („Notes for review“)

```text
CleanMusic is a free, open-source Windows desktop app (github.com/BellocccYT/cleanmusic).
This extension is its browser bridge and does nothing on its own, by design.

Test steps:
1. Open any YouTube video (e.g. youtube.com/watch?v=dQw4w9WgXcQ).
2. The CleanMusic buttons appear under the title and in the player controls. If they do not,
   reload the page once.
3. Open the toolbar popup: it shows thumbnail, title and channel, plus "Queue" and "Play".
4. Clicking a button launches "cleanmusic://add?..." or "cleanmusic://play?...".
5. If the desktop app is not installed, Windows/Chrome has no handler and nothing opens.
   This is expected: the in-page notice links to onboarding.html, which explains the
   installation and offers a download link. No error state is hidden from the user.

The extension makes no network requests of its own. Thumbnails in the popup are regular
<img> requests to i.ytimg.com. All settings are stored locally. No analytics, no remote code.
```

## Screenshots (1280 × 800 PNG, oder 640 × 400)

Der Store erlaubt **maximal fünf**. Empfohlene Reihenfolge – das erste Bild ist das
Vorschaubild in der Suche:

| # | Datei | Motiv | Bildunterschrift | Quelle |
| --- | --- | --- | --- | --- |
| 1 | `01-youtube-knopf-1280x800.png` | YouTube-Videoseite mit CleanMusic-Knopf unter dem Titel | „Ein Klick unter dem Titel“ | selbst aufnehmen |
| 2 | `02-popup-1280x800.png` | Popup mit Thumbnail, Titel und beiden Aktionen | „Warteschlange oder direkt abspielen“ | erzeugt |
| 3 | `03-einstellungen-1280x800.png` | Einstellungen mit den Knopf-Schaltern | „Du entscheidest, wo der Knopf erscheint“ | erzeugt |
| 4 | `04-einrichtung-1280x800.png` | Einrichtungsseite mit den drei Schritten | „Ohne App? Die Erweiterung erklärt den Weg“ | erzeugt |
| 5 | `05-uebergabe-1280x800.png` | Übergabeseite mit Video-Vorschau | „Erst zeigen, dann senden“ | erzeugt |
| – | `06-rechtsklick-1280x800.png` | Rechtsklick-Menü auf einem YouTube-Link | „Auch per Rechtsklick und Tastenkürzel“ | optional, ersetzt eins der fünf |

Die vier erzeugten Bilder liegen in `../store-assets/` und entstehen aus dem echten
Popup, den echten Einstellungen und den echten Hilfeseiten:

```powershell
node extras/browser-extension/preview/build.js
node extras/browser-extension/preview/serve.js      # zweites Terminal
node extras/browser-extension/preview/shoot.js
```

Für Bild 1 ein YouTube-Video öffnen, den CleanMusic-Knopf unter dem Titel zeigen und bei
1280 × 800 aufnehmen. Bild 6 ist optional. Keine YouTube-Logos in eigene Grafiken einbauen.

## Werbekacheln (optional)

| Datei | Größe | Inhalt |
| --- | --- | --- |
| `../store-assets/promo-klein-440x280.png` | 440 × 280 | Logo, „YouTube → CleanMusic“, „Kostenlos · kein Konto“ |
| `../store-assets/promo-gross-1400x560.png` | 1400 × 560 | große Kachel mit drei Merkmalen |

Beide 24-Bit-RGB-PNG ohne Alpha. Erzeugen mit laufendem Preview-Server:

```powershell
node extras/browser-extension/preview/promo.js
```

## Prüfliste für jede neue Version

- [ ] `node extras/browser-extension/test/extension.test.js` → 0 Fehler
- [ ] Auf frischem Chrome-Profil geladen, ohne CleanMusic installiert: Onboarding erscheint
- [ ] Mit installierter App: alle drei Knöpfe, Popup, Rechtsklick, alle drei Kürzel
- [ ] Popup auf einer Nicht-YouTube-Seite: klare Meldung, Suche funktioniert
- [ ] Nach App-Update: Protokoll greift nach einmaligem Start der App
- [ ] `README.md`, `STORE.md`, `test/`, `preview/` NICHT im ZIP
- [ ] Datenschutz-URL erreichbar (GitHub Pages deployt `site/` bei Push)
- [ ] Version in `manifest.json` und hier gleich
- [ ] Screenshots zeigen die aktuelle Oberfläche
- [ ] Sichtbarkeit passt (öffentlich lassen oder bewusst ändern)

## Neue Version einreichen

1. `version` in `manifest.json` erhöhen (z. B. `2.0.1`) und oben in dieser Datei nachziehen.
2. Prüfliste abarbeiten, `node extras/browser-extension/test/extension.test.js` laufen lassen.
3. ZIP bauen (siehe unten).
4. Dashboard → Artikel → **Paket** → neues ZIP hochladen. Die Store-Seite bleibt live,
   bis die neue Version freigegeben ist.
5. **„Neu in dieser Version"** ausfüllen, **„Prüfen lassen"**.
6. Nach der Freigabe im Store prüfen, ob die neue Version installiert wird
   (Chrome aktualisiert automatisch, manuell geht es über `chrome://extensions`).

## ZIP bauen

```powershell
$version = "2.0.0"
$src = "extras\browser-extension\cleanmusic-youtube"
$stage = Join-Path $env:TEMP "cmx-store-$version"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stage | Out-Null
Get-ChildItem $src -File |
  Where-Object { $_.Name -notin @('README.md', 'STORE.md') } |
  Copy-Item -Destination $stage
Compress-Archive -Path "$stage\*" `
  -DestinationPath "extras\browser-extension\cleanmusic-youtube-$version.zip" `
  -CompressionLevel Optimal
```

`manifest.json` muss im Wurzelverzeichnis des ZIP liegen.

## „Neu in dieser Version“ (Store-Feld)

```text
2.0.0
• Neu aufgebaut für den Chrome Web Store
• Vorschau im Popup mit Thumbnail, Titel und Kanal
• Suche in CleanMusic direkt aus dem Popup
• Rechtsklick-Menü für Video, YouTube-Link und markierten Text
• Drei Tastenkürzel, änderbar in Chrome
• Einstellungen: jeder Knopf einzeln abschaltbar
• Einrichtungsseite für den Fall, dass die App noch fehlt
• Übergabeseite mit Bestätigung statt stillem Fehlschlag
```
