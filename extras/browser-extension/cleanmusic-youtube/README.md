# CleanMusic für YouTube (Chrome-Erweiterung 2.0)

Die Brücke zwischen YouTube und der **CleanMusic**-Desktop-App: Das laufende Video landet mit
einem Klick in der Warteschlange – oder wird direkt dort abgespielt. Kein Konto, kein Server,
keine Telemetrie. Alles bleibt auf dem Rechner.

> CleanMusic ist ein inoffizielles Projekt und nicht mit YouTube oder Google verbunden.
> „YouTube“ ist eine Marke von Google LLC.

## Installieren

**Aus dem Chrome Web Store:** [CleanMusic für YouTube](https://chromewebstore.google.com/detail/hghplimkfmogkheakonapklcfgioc)
öffnen → *Hinzufügen*. Kostet nichts, keine Anmeldung.

**Entpackt (Entwicklung):**

1. Diesen Ordner herunterladen bzw. entpacken.
2. `chrome://extensions` öffnen, oben rechts **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** → diesen Ordner auswählen.
4. Optional das Puzzle-Symbol → **CleanMusic für YouTube** anheften.

Funktioniert in Chrome, Edge und jedem Chromium-Browser. Für Edge gibt es einen eigenen Store;
die entpackte Version läuft dort genauso.

**Voraussetzung:** CleanMusic 1.18 oder neuer, installiert und einmal gestartet. Der Installer
registriert `cleanmusic://`; die portable EXE macht das beim ersten Start selbst.

## Was die Erweiterung kann

### Drei Einstiegspunkte auf YouTube

| Ort | Verhalten |
| --- | --- |
| Aktionsleiste unter dem Titel (Like / Teilen / Speichern) | Knopf „CleanMusic“ |
| Player-Steuerungen unten rechts | Noten-Symbol |
| YouTube Music und Shorts | schwebender runder Knopf |

Jeder Knopf lässt sich in den Einstellungen abschalten.

**Zusatztasten** (abschaltbar): `Shift`-Klick spielt sofort ab, `Alt`-Klick sucht den Titel im
Katalog statt ihn hinzuzufügen.

### Popup

- Vorschau mit Thumbnail, Titel und Kanal, Hinweis bei Playlists
- **Zur Warteschlange** und **Jetzt abspielen**
- **Suche** in CleanMusic, vorbefüllt mit Kanal und Titel – auch auf Seiten ohne Video
- Tastatur: `A` = Warteschlange, `P` = abspielen
- Direktlinks zu Einstellungen und Installationshilfe

### Rechtsklick und Tastenkürzel

| Auslöser | Aktion |
| --- | --- |
| Rechtsklick auf eine YouTube-Seite | Aktuelles Video zur Warteschlange |
| Rechtsklick auf einen YouTube-Link | Diesen Link zur Warteschlange |
| Rechtsklick auf markierten Text | Text in CleanMusic suchen |
| `Alt+Shift+C` | Popup öffnen |
| `Alt+Shift+S` | Aktuelles Video zur Warteschlange |
| `Alt+Shift+P` | Aktuelles Video abspielen |

Kürzel änderbar unter `chrome://extensions/shortcuts`.

### Rückmeldung

Kurzer Hinweis auf der Seite (mit Link zur Hilfe, falls die App nicht startet) und ein Häkchen
am Toolbar-Symbol. Beides abschaltbar.

### Einstellungen, Hilfe, Datenschutz

- `options.html`: Knöpfe, Zusatztasten, Rückmeldungen, Verbindungstest, Zurücksetzen
- `onboarding.html`: Einrichtung in drei Schritten, Berechtigungen im Klartext, Fehlerbehebung
- `privacy.html`: vollständige Datenschutzerklärung (auch online:
  `https://bellocccyt.github.io/cleanmusic/privacy/`)

## So läuft die Übergabe

1. Die Erweiterung liest Video-ID, Titel und Kanal aus der Seite.
2. Sie baut `cleanmusic://add?src=youtube&id=…&t=…&a=…` (oder `play`, oder `src=search`).
3. Ein echter Klick auf einen Link öffnet das registrierte Protokoll. Windows startet
   CleanMusic und übergibt den Link.
4. Die App prüft denselben Link noch einmal (`parseDeepLink` in `main.js`): nur
   `add`/`play`, nur die Quellen `deezer`, `apple`, `youtube`, `search`, nur gültige IDs.

Ohne installierte App passiert nichts – dann zeigt der Hinweis auf der Seite den Weg zur
Installation. Für Rechtsklick und Tastenkürzel öffnet der Service Worker `launch.html`: Dort
steht, was gesendet wird, und der eigentliche Start ist ein normaler Klick. So bleibt die
Nutzer-Geste erhalten, die Chrome für externe Protokolle verlangt.

Ohne Quellen-Plugin sucht CleanMusic über Titel und Kanal nach der passenden Vorschau im
Katalog. Mit einem Plugin, das `lookup` anbietet, wird das Video direkt aufgelöst. Die
Erweiterung enthält keinen Download- und keinen Extraktionscode.

## Datenschutz und Berechtigungen

| Berechtigung | Zweck |
| --- | --- |
| `https://www.youtube.com/*`, `https://m.youtube.com/*`, `https://music.youtube.com/*` | Knöpfe einfügen, Video-Angaben lesen |
| `contextMenus` | drei Rechtsklick-Einträge |
| `storage` | Einstellungen lokal (`chrome.storage.local`) |

- keine Netzwerkanfragen aus der Erweiterung, kein Remote-Code, kein `eval`
- keine Cookies, kein Verlauf, keine Lesezeichen, keine Downloads
- keine Synchronisierung der Einstellungen
- Thumbnails lädt Chrome direkt von `i.ytimg.com`

## Entwicklung

Kein Build-Schritt, kein npm-Paket: Die Dateien in diesem Ordner sind die Erweiterung.

```powershell
node extras/browser-extension/test/extension.test.js
```

Der Test prüft die reinen Helfer (URL-Erkennung, Deep-Link-Regeln, Textbereinigung,
Einstellungen) und die Struktur: Manifest, Berechtigungen, vorhandene Dateien, keine
Fremdskripte, keine Inline-Handler, keine `fetch`/`eval`-Aufrufe.

**Vorschau und Store-Screenshots** (Beispieldaten, ohne die App):

```powershell
node extras/browser-extension/preview/build.js
node extras/browser-extension/preview/serve.js   # zweites Terminal
node extras/browser-extension/preview/shoot.js   # schreibt store-assets/*.png
```

Der Ordner `preview/` liegt bewusst neben der Erweiterung und ist nie Teil des ZIPs.

**ZIP für den Store** (ohne Test- und Doku-Dateien):

```powershell
Compress-Archive -Path .\* -DestinationPath ..\cleanmusic-youtube-2.0.0.zip `
  -CompressionLevel Optimal
```

Vorher `test/` und `README.md`/`STORE.md` aus dem Ordner nehmen oder beim Packen
ausschließen – im Store-Paket haben sie nichts zu suchen. Details und alle Listing-Texte
stehen in [`STORE.md`](STORE.md).

## Dateien

| Datei | Zweck |
| --- | --- |
| `manifest.json` | Manifest V3, Berechtigungen, Kürzel, Seiten |
| `shared.js` | reine Helfer: URLs, Deep-Links, Textbereinigung, Einstellungen |
| `content.js` / `content.css` | Knöpfe, Video-Erkennung, Hinweise auf der Seite |
| `background.js` | Service Worker: Kontextmenü, Kürzel, Badge, Seiten öffnen |
| `popup.html` / `popup.css` / `popup.js` | Toolbar-Popup |
| `launch.html` / `launch.css` / `launch.js` | Übergabeseite für Rechtsklick und Kürzel |
| `options.html` / `options.css` / `options.js` | Einstellungen |
| `onboarding.html` / `onboarding.css` / `onboarding.js` | Einrichtung und Hilfe |
| `privacy.html` / `privacy.css` | Datenschutzerklärung |
| `ui.css` | gemeinsame Gestaltung (hell und dunkel) |
| `icon*.png` | CleanMusic-Icon in 16/32/48/128 px |
| `../test/extension.test.js` | Prüfungen (nicht Teil des Store-Pakets) |

## Fehlerbehebung

**Chrome öffnet die App nicht.** CleanMusic installieren und einmal starten. Fragt Chrome nach
der Freigabe für externe Apps, „Öffnen“ wählen. Nach einem App-Update die App einmal von Hand
starten, damit Windows das Protokoll wieder kennt.

**Der Knopf fehlt.** Seite neu laden (F5) und in den Einstellungen prüfen, ob der jeweilige
Knopf aktiv ist. Auf YouTube Music und Shorts erscheint der schwebende Knopf.

**„Video noch nicht bereit“ im Popup.** Die Seite war beim Öffnen des Popups noch nicht fertig
geladen – einmal neu laden.

**Nach dem Neuladen der Erweiterung reagiert die Seite nicht.** YouTube-Tab neu laden; alte
Content-Scripts werden beim Reload der Erweiterung abgehängt.
