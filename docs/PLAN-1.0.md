# Plan: CleanMusic 1.0

Festgelegt am 21.11.2026 mit dem User. Reihenfolge = Bau-Reihenfolge; jede
Stufe wird einzeln getestet, released und über die Update-Suche verteilt.

## Umfang 1.0

| Stufe | Inhalt |
| --- | --- |
| **0.10** | Warteschlange + Autoplay – **erledigt** |
| **0.11** | Epidemic Sound und Artlist.io im Cutter-Modus – **erledigt** |
| **0.12** | Erste-Schritte-Assistent – **erledigt** |
| ~~0.13~~ | Englische Oberfläche – **auf 1.2 verschoben** (Entscheidung 21.11.2026: erst 1.0 fertig machen; 1.1 enthält Playlist-Import) |
| **1.0** | Installer zusätzlich zur portablen EXE, Feinschliff, Release – **gebaut** |

**Nicht in 1.0** (bewusst später): lokale Bibliothek mit Tags/Covern, Crossfade,
Mini-Player, Playlist-Import/Export, Streamer.bot Teil 2 (WebSocket),
Code-Signatur (vorerst ohne – SmartScreen-Hinweis bleibt in den Release-Notizen).

## 0.10 – Warteschlange + Autoplay

- **„Als Nächstes abspielen“** und **„Zur Warteschlange hinzufügen“** im +-Menü,
  im Rechtsklick auf Titel und im Vollbild-Player.
- **Warteschlangen-Ansicht** (Seitenleiste oder Ausklapp-Panel an der Player-Leiste):
  aktuelle Reihenfolge, Ziehen zum Sortieren, Entfernen, „Leeren“.
- **Autoplay** (Einstellung, Standard an): Läuft ein einzelner Titel aus der Suche
  oder einer Karte, geht es danach mit **Vorschlägen** weiter (Deezer-Artist-Radio,
  bei Plugin-Titeln dessen `related()`), statt mit den restlichen Suchtreffern.
  Von Hand Eingereihtes hat **immer Vorrang**. Ganze Listen (Playlist, Favoriten,
  Album) spielen wie bisher als Liste; Autoplay greift erst an deren Ende.
- Kennzeichnung in der Warteschlange: „Von dir eingereiht“ / „Autoplay“.
- Kein Autoplay für Radio und Cutter-Sounds.
- Tests: Smoke für Reihenfolge (manuell vor Autoplay), Autoplay nach Suchtitel,
  „Als Nächstes“ während Autoplay.

## 0.11 – Epidemic Sound und Artlist.io

Beides sind Abo-Dienste mit Lizenz für Creator-Videos. Es gibt keine offene API –
also wie bei Spotify & Co. die **offiziellen Web-Apps eingebettet**, mit eigener,
dauerhafter Sitzung (Login bleibt).

- Neue Reiter im Cutter-Modus: **Epidemic Sound** und **Artlist**
  (öffnen `epidemicsound.com` bzw. `artlist.io` eingebettet), dazu Einträge
  unter „Dienste“.
- **Downloads nur über die offiziellen Download-Knöpfe** der Seiten, mit deinem
  Abo. CleanMusic speichert sie in `Musik\CleanMusic Cutting\Epidemic Sound\`
  bzw. `…\Artlist\` (Hauptprozess: `will-download` nur für diese beiden
  Sitzungen), zeigt sie danach zum Ziehen ins Schnittprogramm an und legt eine
  `.txt` mit Hinweis „Lizenz über dein Abo – Kanal ggf. beim Dienst freischalten“ ab.
- Für alle anderen Dienste (Spotify, Apple, …) ändert sich nichts; CleanMusic greift dort nichts ab.
- CleanMusic umgeht nichts: keine Wasserzeichen-Entfernung, kein Download
  ohne Abo, kein Zugriff an der Web-App vorbei.
- Risiko: Google-Login kann eingebettete Fenster ablehnen → E-Mail-Login oder
  „Im Browser öffnen“ anbieten.
- LEGAL.md: Abschnitt zu Abo-Lizenzen (Lizenz gilt für das Konto/den Kanal,
  Nutzungsbedingungen der Dienste).

## 0.12 – Erste-Schritte-Assistent

Beim ersten Start (und später über Einstellungen erneut aufrufbar), 4–5 Schritte:

1. Willkommen + Theme wählen (Live-Vorschau).
2. Musikordner hinzufügen (optional).
3. Was CleanMusic spielt: Vorschauen, Radio, eingebettete Dienste, Cutter-Modus.
4. Optionen: Downloads „Nur Cutting“, Update-Suche, Discord, Tray.
5. Plugins kurz erklärt (optional, nichts wird automatisch geladen).

Bestehende Nutzer sehen ihn nicht automatisch (nur „Neu in dieser Version“-Hinweis).

## 1.2 – Englische Oberfläche (verschoben von 0.13)

- Alle Texte aus `app.js`/`index.html` in Sprachdateien (`renderer/i18n/de.js`,
  `en.js`), Funktion `t('key')`. Sprache: Systemsprache als Standard, umschaltbar
  in den Einstellungen und im Assistenten.
- README zusätzlich auf Englisch (`README.en.md`).
- Großer, aber mechanischer Umbau – dabei `app.js` in Module aufteilen
  (Player, Bibliothek, Cutter, Einstellungen, Plugins), damit es wartbar bleibt.
- Smoke-Test in beiden Sprachen.

## 1.0 – Installer, Feinschliff, Release

- **Installer (NSIS)** zusätzlich zur portablen EXE: Startmenü, Deinstallation,
  Daten bleiben in `%APPDATA%\CleanMusic`. **Umgesetzt ohne electron-updater:**
  der eigene Updater lädt `CleanMusic-<version>-setup.exe` (gleiche SHA-256-Prüfung
  wie bei der portablen EXE) und startet ihn still (`--updated /S --force-run`).
  Ein Code-Weg, keine zusätzliche Abhängigkeit, kein `latest.yml` nötig.
- Feinschliff: Tastenkürzel-Übersicht (`?`/F1). Leistung bei großen Listen und
  Fehlermeldungen nach Rückmeldungen aus dem Alltag.
- README/Screenshots, LEGAL, Release-Notizen; Release v1.0.0.

## Arbeitsweise

- Nach jeder Stufe: `smoke` (+ passende Spezial-Tests), Build, kurze Prüfung durch
  den User, dann Release-Tag (nur auf Ansage des Users).
- Regeln aus `AGENTS.md` gelten weiter (kein DRM-Bypass, keine Downloads außer
  „Nur Cutting“ und den offiziellen Abo-Downloads aus 0.11, Plugins optional).
