# CleanMusic für YouTube (Chrome-Erweiterung)

Ein kleiner Knopf im YouTube-Player und ein Toolbar-Popup: Das laufende Video
landet mit einem Klick in der **CleanMusic-Warteschlange** – oder wird direkt
dort abgespielt.

## Installieren (Chrome / Edge)

1. Ordner `cleanmusic-youtube` herunterladen bzw. entpacken.
2. In Chrome `chrome://extensions` öffnen.
3. Oben rechts **Entwicklermodus** einschalten.
4. **Entpackte Erweiterung laden** → diesen Ordner auswählen.
5. Oben rechts auf das Puzzle-Symbol → **CleanMusic für YouTube** anheften
   (optional, dann ist das Toolbar-Symbol immer sichtbar).

Die Erweiterung läuft auch in Microsoft Edge (`edge://extensions`) und anderen
Chromium-Browsern. Für den Chrome Web Store müsste sie dort separat
veröffentlicht werden; das ist hier nicht enthalten.

## Benutzen

- Auf einem YouTube-Video erscheint in der **Aktionsleiste unter dem Titel**
  (Like / Teilen / Speichern) ein **CleanMusic-Knopf** und links in den
  Player-Steuerungen ein kleines Noten-Symbol. Klick = **zur Warteschlange**.
- Auf YouTube Music und bei Shorts erscheint ein schwebender runder Knopf.
- Oder das Toolbar-Symbol öffnen: Dort gibt es **Zur Warteschlange** und
  **Jetzt abspielen**.

Beim ersten Mal fragt Chrome, ob `cleanmusic://` geöffnet werden darf. Das
bestätigen; CleanMusic muss dafür installiert sein (der Installer registriert
das Protokoll, die portable EXE beim ersten Start).

## Was passiert mit dem Video?

Die Erweiterung schickt nur Video-ID, Titel und Channel an die **lokale**
CleanMusic-App (`cleanmusic://add?src=youtube&id=…`). Kein Server, kein Konto,
keine Telemetrie.

- Ist in CleanMusic ein Quellen-Plugin mit `lookup` aktiv (z. B. yt-dlp), wird
  das Video direkt aufgelöst.
- Ohne Plugin sucht CleanMusic über Titel und Artist nach der passenden
  Vorschau im Katalog.
- **CleanMusic 1.18+** legt den Titel in die Warteschlange. In **1.17.0** kennt
  die App die `add`-Aktion noch nicht und startet den Titel stattdessen; das
  ist der eingebaute Fallback, bis die neue Version installiert ist.

## Dateien

| Datei | Zweck |
| --- | --- |
| `manifest.json` | Manifest V3, Berechtigungen nur für YouTube |
| `content.js` / `content.css` | Knopf in der Aktionsleiste und den Player-Steuerungen, Video-Infos, kleine Toasts |
| `background.js` | öffnet den `cleanmusic://`-Link |
| `popup.html` / `popup.css` / `popup.js` | Toolbar-Popup mit beiden Aktionen |
| `icon*.png` | CleanMusic-Icon in 16/32/48/128 px |

## Weitergeben

Den kompletten Ordner als ZIP weitergeben. Der Empfänger entpackt ihn und lädt
ihn über `chrome://extensions` → **Entpackte Erweiterung laden**. Die
Erweiterung enthält keine ausführbaren Binaries; CleanMusic und das optionale
Quellen-Plugin werden getrennt installiert.
