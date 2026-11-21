# Plan: Streamer.bot-Plugin (Ziel: CleanMusic 1.0)

Status: **Phase 1 gebaut** (`extras/plugins/streamerbot.js`, Weg A „Fetch URL“).
Entscheidungen (21.11.2026): erst Fetch URL, WebSocket später; Befehle `!song`,
`!skip`, `!pause`; **keine Songwünsche**; Plattform Twitch.
Nachtrag 21.11.2026: **Songwünsche optional** auf Wunsch des Users – Plugin 1.1.0
(`!sr`, `!wrongsong`, `!wishes`, Standard aus, Limits pro Zuschauer), braucht
CleanMusic 1.0.1 (`player.request`/`requests`/`removeRequest`).

## Ziel

Streamer können CleanMusic aus Streamer.bot heraus steuern und Titelwechsel
in ihren Stream-Automationen nutzen, ohne dass CleanMusic selbst etwas über
Twitch/YouTube wissen muss:

- Chat-Befehle wie `!song` (aktueller Titel), `!skip`, `!pause` (nur Mods),
  `!vol 40` (nur Mods)
- Ereignis „Titelwechsel“ → z. B. Chat-Nachricht, Szene/Quelle in OBS umschalten,
  Alert anzeigen
- Optional Wünsche aus dem Chat (`!sr …`) – nur aus erlaubten Quellen, siehe unten

## Bausteine, die es seit 0.8/0.9 schon gibt

- **Plugin-API v2** (`docs/PLUGIN-API.md`): `onEvent('nowplaying' | 'state' | 'volume')`,
  `ctx.player.play/pause/toggle/next/previous/setVolume/setMuted`,
  Einstellungsfelder in der Plugin-Karte, `ctx.notify`, `ctx.copyText`.
- **Vorbild OBS-Overlay** (`extras/plugins/obs-overlay.js`): lokaler Server nur auf
  `127.0.0.1`, Host-Prüfung, Status in der Plugin-Karte, Smoke-Test `smoke:obs`.

## Architektur (Vorschlag)

Eigenes Plugin `extras/plugins/streamerbot.js` (API v2), **nicht** in der EXE,
wie das OBS-Plugin erst nach Hinzufügen + Aktivieren aktiv.

### Weg A – lokale HTTP-API (einfach, robust) – empfohlen für den Start

Das Plugin öffnet `http://127.0.0.1:4788` (Port einstellbar):

| Route | Wirkung |
| --- | --- |
| `GET /api/nowplaying` | JSON: Titel, Artist, Quelle, Cover, Position, Link |
| `GET /api/nowplaying.txt` | eine Zeile „Artist – Titel“ (für Chat-Antworten) |
| `POST /api/toggle`, `/api/next`, `/api/previous` | Wiedergabe steuern |
| `POST /api/volume?level=40` | Lautstärke in % (0–100, mit Boost bis 150) |

In Streamer.bot legt man je Befehl eine Action an, die per Sub-Action
**„Fetch URL“** diese Adresse aufruft (bei `!song` das Ergebnis in den Chat
schreiben). Vorteil: keine Abhängigkeit von Streamer.bot-internen
Ereignisnamen, leicht zu testen (curl, Smoke-Test).

Schutz: nur `127.0.0.1`, Host-Prüfung wie beim OBS-Plugin, **Token** (zufällig
erzeugt, in der Plugin-Karte kopierbar) als Header oder Query-Parameter für alle
steuernden Routen, damit keine Webseite im Browser Befehle auslösen kann.

### Weg B – Streamer.bot-WebSocket (Komfort, Phase 2)

Streamer.bot hat einen eingebauten WebSocket-Server (in Streamer.bot unter
*Servers/Clients → WebSocket Server*, Standard-Port 8080). Das Plugin verbindet
sich als Client und

- ruft bei jedem Titelwechsel eine Action auf (z. B. „CleanMusic Titelwechsel“)
  und übergibt Titel, Artist, Cover, Link als Argumente,
- kann die Liste der Actions abfragen, damit man in der Plugin-Karte per
  Auswahlfeld wählt, welche Action ausgelöst wird.

Vor dem Bau gegen die aktuelle Streamer.bot-Doku prüfen: genaue Request-Namen,
Authentifizierung des WebSocket-Servers, Versionsunterschiede.

## Einstellungsfelder (Plugin-Karte)

- HTTP-Port (Standard 4788), Token (anzeigen/kopieren/neu erzeugen)
- WebSocket an/aus, Adresse (Standard `ws://127.0.0.1:8080/`), Passwort falls gesetzt
- Action für Titelwechsel (Auswahl), Chat-Text-Vorlage (`🎵 {artist} – {title}`)
- Befehle erlauben: Steuerung ja/nein, Lautstärke ja/nein, Wünsche ja/nein

## Song-Wünsche aus dem Chat (rechtlich vorsichtig)

- Nur Titel aus Quellen, die CleanMusic legal abspielt: lokale Musik, freie
  Musik aus dem Cutter-Modus, Radio – und Vorschauen/Plugins nur, wenn der
  Streamer das bewusst einschaltet.
- Wünsche landen in einer eigenen Warteschlange, die der Streamer freigibt
  (kein automatisches Abspielen fremder Wünsche).
- Hinweis in der Plugin-Karte: Musik im Stream braucht passende Rechte
  (Plattform-Regeln, GEMA/Urheberrecht). Für Streams eignen sich vor allem
  freie Lizenzen (Cutter-Modus) und eigene Musik.

## Tests

- `npm run smoke:streamerbot`: Plugin aus `extras/plugins/` laden, HTTP-Routen
  mit und ohne Token prüfen, fremden Host ablehnen, Steuerbefehle gegen den
  Player prüfen (wie `smoke:obs`).
- WebSocket-Teil gegen einen kleinen Fake-Server im Test (kein echtes Streamer.bot nötig).

## Nächste Phase

- Weg B (WebSocket): Titelwechsel als Ereignis direkt in Streamer.bot, Action-Auswahl
  in der Plugin-Karte. Vorher gegen die aktuelle Streamer.bot-Doku prüfen.

## Ursprüngliche Fragen (beantwortet)

1. Reicht für den Start Weg A (Fetch URL), oder soll Weg B gleich mit?
2. Welche Befehle brauchst du wirklich (`!song`, `!skip`, `!vol`, `!sr`)?
3. Song-Wünsche: überhaupt gewünscht – und wenn ja, nur freie Musik?
4. Twitch, YouTube oder beides (betrifft nur die Texte/Beispiele, Streamer.bot
   kümmert sich um die Plattform)?
