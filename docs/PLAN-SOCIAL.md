# Plan: Echte Social-Funktionen (Weg B)

Stand: 25.11.2026 – **S1 ist gebaut** (Server, App-Anbindung, Tests). Der Server läuft seit 25.11.2026 unter
`https://cleanmusic-social.cleanmusic.workers.dev` (Standard-Adresse ab dem nächsten Release);
die Datenschutzseite `site/privacy/social/` ist ausgefüllt (25.11.2026). S2 ist live, S3 („Gemeinsam hören“) ist gebaut und wartet auf das Deploy mit 2.1.0. Weg A (ohne Server: Discord-Knopf, Playlist-Links,
Wochenkarte per Code) ist fertig und bleibt als Offline-Weg erhalten.

## Grundidee

Ein kleiner eigener Dienst, aber so gebaut, dass fast nichts schiefgehen kann:

- **Keine E-Mail, kein Passwort, kein Profilbild, kein Klarname.** Das Gerät erzeugt ein
  Schlüsselpaar; der öffentliche Schlüssel *ist* das Konto. Jede Anfrage wird signiert.
- **Zufallsname als Standard** („Leiser Komet 42“), eigener Name optional mit Filter.
- **Kontakt nur per Code/Link/QR.** Es gibt keine Suche nach Leuten und keine öffentliche
  Liste. Fremde können dich nicht finden oder anschreiben, also gibt es kein Spam und keine
  Belästigung durch Unbekannte. Das ist der wichtigste Schutz überhaupt.
- **Keine Freitexte.** Statt Chat gibt es feste Reaktionen (🔥 ❤️ 😂 🎧 👀), damit nichts
  moderiert werden muss.
- **Standardmäßig aus.** Social wird erst nach einer kurzen Erklärung eingeschaltet.
- **Kein Audio über den Server.** Geteilt werden nur Referenzen (`CMShare.refOf`), also nie
  lokale Dateien oder Radio. Jedes Gerät spielt selbst ab.

## Hosting-Empfehlung: Cloudflare Workers + Durable Objects

- Kein Server zum Warten oder Patchen, WebSockets inklusive, Speicher über Durable Objects
  (SQLite).
- Der kostenlose Tarif reicht für den Anfang (100.000 Anfragen pro Tag). Danach kostet es
  etwa 5 $ im Monat. Die Limits vor dem Start in der Cloudflare-Doku prüfen.
- Daten in der EU halten: Durable Objects mit `jurisdiction: 'eu'`.
- Alternativen:
  - Supabase: Gratisprojekte pausieren bei Inaktivität.
  - Eigener VPS: Wartung und Sicherheitsupdates bleiben bei dir. Wird nicht empfohlen.

## Namen

- **Zufallsname:** Adjektiv + Wort + Zahl aus kuratierten Listen, zum Beispiel
  „Tanzender Bass 7“. Rund 200 × 200 × 100 Kombinationen.
- **Kennung gegen Nachahmer:** Namen sind nicht eindeutig. Dazu wird immer ein Kürzel aus
  dem Schlüssel angezeigt: „Leiser Komet 42 · K7Q2“.
- **Eigener Name** (optional):
  - 3–20 Zeichen: Buchstaben, Ziffern, Leerzeichen, `. _ -`.
  - Keine URLs, keine Emojis, keine unsichtbaren Zeichen.
  - Prüfung nach NFKC-Normalisierung, ohne Akzente und mit Leetspeak-Abbildung
    (`0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`).
  - Sperrliste Deutsch/Englisch: Beleidigungen, Sexuelles, NS-Codes (88, HH, 1488 …) und
    Rollen wie admin, support, cleanmusic, moderator und offiziell.
  - Dieselbe Prüfung läuft in der App (sofortiges Feedback) und auf dem Server
    (verbindlich). Reine Logik in `lib/social-names.js` mit Unit-Tests.
- **Ändern** höchstens einmal pro Tag.
- **Meldungen:** Nach 3 Meldungen von verschiedenen Konten wird der Name automatisch durch
  einen Zufallsnamen ersetzt.

## Bot- und Missbrauchsschutz

| Schutz | Wie |
| --- | --- |
| Massen-Konten | Proof-of-Work beim Anlegen (Hashcash, 2–5 s im Hintergrund, Schwierigkeit serverseitig regelbar), maximal 3 Konten pro Tag und IP-Präfix |
| Gefälschte Anfragen | Signatur mit ECDSA P-256 über Zeitstempel (±5 min), Nonce und Body-Hash |
| Spam | Rate-Limits je Schlüssel: Freundescode einlösen 20/h, Aktivität 1/15 s, Reaktionen 30/min; neue Konten (< 24 h) enger |
| Fremdkontakt | Nur per Code; Codes laufen nach 24 h ab oder werden widerrufen |
| Belästigung | Blockieren (sofort, einseitig) und Melden in jeder Freundeszeile |
| Notfall | `GET /v1/status` mit Not-Aus (`social.enabled`), Sperrliste für Schlüssel |
| Ausgabe | Namen nur als Text (`esc`), nie HTML |

Turnstile (CAPTCHA) nur, falls Proof-of-Work nicht reicht.

## Funktionen in Phasen

### S1 – Konto, Freunde, „Hört gerade“ ✅ erledigt (25.11.2026)

Umgesetzt in `server/social/` (Worker + Durable Object, Tests mit Miniflare), `lib/social-names.js`,
`lib/social-protocol.js`, `social-main.js` (Schlüssel per `safeStorage`, Signatur, eine erlaubte
Adresse), `renderer/core/social.js`, Ansicht „Freunde“ in `renderer/app.js`, `site/f/` und
`site/privacy/social/` (Platzhalter für Verantwortlichen/Impressum). Zusätzlich zum Plan:
`POST /v1/friend/remove` (Entfernen ohne Blockieren) und `/v1/admin/*` (Not-Aus, Sperren,
Meldungen – nur mit `ADMIN_TOKEN`). Freundescodes gelten einmal. Smoke `SMOKE_SOCIAL_SERVER`.


- Social einschalten mit Erklärung, Schlüssel und Zufallsnamen. Name ändern, Konto löschen.
- Freundescode erzeugen (Link `site/f/#…`, QR, `cleanmusic://friend?c=…`) und einlösen.
  Höchstens 200 Freunde.
- „Freunde hören gerade“:
  - Titel, Artist und Share-Referenz; verfällt nach 10 Minuten.
  - Antippen spielt den Song über `findSharedEntry`.
  - Eigene Aktivität nur mit dem Schalter „Meine Aktivität zeigen“, standardmäßig aus.
- Feste Emoji-Reaktionen auf den Song eines Freundes.

### S2 – Gruppen auf dem Server ✅ erledigt (25.11.2026)

Umgesetzt in `server/social/src/groups.js` (Tabellen `groups`, `members`, `group_codes`, `weeks`,
`group_tracks`): Gruppencode `G1-…` (24 h, für mehrere Personen, nur Hash gespeichert, Link wie
Freundescodes über `site/f/`), max. 10 Gruppen je Konto und 30 Mitglieder; Wochenkarte je Konto
(`POST /v1/week`, nur in Gruppen, letzte zwei Wochen, die App schickt sie höchstens alle 10 min);
Gruppen-Playlist bis 200 Referenzen ohne Duplikate, Entfernen durch Leitung oder wer hinzugefügt hat;
Verlassen/Entfernen, die Leitung geht an das älteste Mitglied, leere Gruppen verschwinden. App: Panel
„Gruppen“ in der Ansicht „Freunde“. Der Wochenkarten-Code im Rückblick bleibt als Offline-Weg.


- Die Wochenkarte aktualisiert sich automatisch. Der Code zum Kopieren bleibt als
  Offline-Weg.
- Gemeinsame Gruppen-Playlist: Referenzen, höchstens 200 Titel. Alle dürfen hinzufügen,
  der Ersteller darf entfernen.

### 2.1 – Freundschaftsanfragen und Online-Status (gebaut 25.11.2026, Server-Deploy offen)

**Anfragen statt Sofort-Freundschaft.** `POST /v1/friend-code { requests: true }` legt einen
„Frage-Code“ an (Spalte `codes.ask`, per `ALTER TABLE` ergänzt). Wer ihn mit
`POST /v1/friend/redeem` einlöst, macht eine Anfrage (Tabelle `requests`); erst
`POST /v1/friend/accept { id }` des Code-Inhabers macht beide zu Freunden.
`POST /v1/friend/decline { id }` lehnt still ab (für den Absender „wartet“ die Anfrage weiter,
bis sie abläuft), `{ id, withdraw: true }` zieht die eigene Anfrage zurück. `GET /v1/friends`
liefert `requests` (an dich) und `sent` (von dir) mit. Grenzen: 7 Tage (`LIMITS.requestTtlMs`),
höchstens 20 offene je Richtung (`LIMITS.openRequests`), Rate-Limit `answer` 60/h (neue Konten 20/h).
Blockieren löscht Anfragen beider Seiten, „Konto löschen“ ebenso; wer dich anfragt, kann gemeldet
werden. Haben sich beide gegenseitig angefragt (oder löst du den Code von jemandem ein, der dich
schon gefragt hat), seid ihr sofort Freunde. Code: `server/social/src/requests.js`.

**Rückwärtskompatibel (Entscheidung):** Nur Codes mit dem Kennzeichen erzeugen Anfragen – und das
Kennzeichen setzt nur die App ab 2.1. Wer eine Anfrage beantworten muss, ist also immer jemand mit
2.1; ein 2.0.x-Nutzer bleibt nie auf einer Anfrage sitzen, die er nicht sehen kann. Codes aus 2.0.x
(ohne Kennzeichen) machen wie bisher sofort Freunde, auch wenn ein 2.1-Client sie einlöst. Löst ein
2.0.x-Client einen Frage-Code ein, entsteht die Anfrage ebenfalls; weil 2.0.x „pending“ nicht kennt,
antwortet der Server ihm mit HTTP 409 `anfrage-gesendet` und einer lesbaren Meldung („Anfrage an …
gesendet – sobald die Person annimmt, seid ihr Freunde“), die 2.0.x als Toast zeigt. 2.1-Clients
schicken beim Einlösen `requests: true` und bekommen 202 `{ friend, pending: true }`. Ein Server vor
2.1 ignoriert das Kennzeichen – dann bleibt alles sofort, und die App sagt das beim Code dazu.

**Online-Status (opt-in).** Schalter „Mir online zeigen“, Standard aus: `POST /v1/presence
{ show }`. Nur solange er an ist, gibt es eine Zeile in `presence` mit einem auf die Minute
gerundeten Zeitpunkt der letzten signierten Anfrage (höchstens ein Schreibzugriff pro Minute);
die Aufräumrunde setzt ihn nach 6 Minuten (`LIMITS.onlineTtlMs`) auf 0, Ausschalten löscht die
Zeile. Freunde bekommen in `GET /v1/friends` nur `online: true/false` – kein „zuletzt online“,
und wer den Schalter aus hat, sieht genauso aus wie jemand, der offline ist. Keine zusätzlichen
Anfragen: der bestehende Poll (`pollPlan`) und der Aktivitäts-Herzschlag halten ihn frisch; bei
verstecktem Fenster ohne geteilte Aktivität wirkt man nach etwa 6 Minuten offline. Keine
Gegenseitigkeit: auch wer sich selbst verbirgt, sieht, wer online ist. Code: `src/presence.js`.

**App.** `renderer/core/social.js`: `normalizeFriends` (Anfragen, `online`, `features` – ältere
Server liefern beides nicht), `sortFriends`/`friendStatus`, `onlineNotices` (Toast nur bei
offline → online zwischen zwei Polls, nie beim ersten Laden, nie für neue Freunde, höchstens
einmal je Freund in 30 min), `onlineText`, `newRequests`, `navBadge`, `expiresIn`. Lokaler Zustand
`cleanmusic.social.v1` um `showOnline` (Standard aus) und `onlineToasts` (Standard an) ergänzt –
kein neuer Schlüssel. Ansicht „Freunde“ neu gegliedert: Kopf mit Name, Kürzel und Schalter-Chips,
„Anfragen“ (Zähler, Annehmen/Ablehnen/⋯), „Online · hört gerade“, „Alle Freunde“ (hört gerade,
online, Rest), Menü „⋯“ je Freund (Abspielen, Entfernen, Blockieren, Melden), „Freund hinzufügen“
mit „Gesendete Anfragen“ (Zurückziehen), unten „Du & Privatsphäre“ mit den drei Schaltern.
Die Seitenleiste zählt offene Anfragen (vor „hören gerade“). Im Smoke werden keine Toasts gezeigt,
`socialRt.notes` hält sie für die Prüfung.

**Reihenfolge beim Veröffentlichen:** erst den Worker deployen (`cd server/social && npm run
deploy`, CleanMusic-Konto), dann die App 2.1.0 veröffentlichen. Umgekehrt ginge es auch (die App
fällt auf das alte Verhalten zurück), aber dann gäbe es bis zum Deploy keine Anfragen.

### S3 – Gemeinsam hören (Listening-Party) ✅ gebaut (25.11.2026, für 2.1.0; Worker noch nicht deployt)

Umgesetzt in `server/social/src/rooms.js` (Andockpunkte in `hub.js`: `ROOM_SCHEMA`, `ROOM_RATE`, Fälle in
`route`, `webSocketMessage`/`webSocketClose`, `deleteAccountRooms`, `cleanupRooms`, Not-Aus schließt alle
Sockets): Raumcode `R1-…` (nur Hash), max. 20 Leute, ein Raum je Konto. REST `POST/GET /v1/room`,
`/v1/room/join`, `/v1/room/leave` (`close: true` = für alle beenden), `/v1/room/kick` (nur Host, Sperre je
Raum). Live: ein signierter WebSocket `GET /v1/room/live` (Hibernation, `ping`/`pong` automatisch, ohne das
Objekt zu wecken). Nachrichten: `state` (nur Host, `{ ref, pos, at, playing, full }`, `proto.cleanRoomState`),
`react` (feste Emojis, nur weitergereicht), `time` (Zeitabgleich, `skewFromSamples`). Host-Übergabe an das
älteste Mitglied, ohne Host stirbt der Raum nach 30 Minuten, Gäste ohne Verbindung fallen nach 30 Minuten
raus, spätestens nach 24 Stunden ist Schluss. Kosten: Eingehende WebSocket-Nachrichten zählen bei Cloudflare
1:20, Pings gar nicht – ein voller Raum über 2 Stunden bleibt unter ~500 Anfragen. Kein Polling.

App: `lib/social-ws.js` (minimaler WebSocket, Electron 33 hat im Hauptprozess keinen), `social-main.js`
(Verbindung, Ping 25 s, Neuaufbau 2–30 s, IPC `social-room` nur `connect`/`send`/`disconnect`/`status`,
Nachrichten werden geprüft), reine Regeln in `renderer/core/social.js` (`roomSyncPlan`, `roomHostPlan`,
`roomDeviation`), UI „Gemeinsam hören“ in der Ansicht „Freunde“. Wer als Gast selbst pausiert/spult/einen
anderen Song wählt, hört selbst weiter („Wieder synchron“). Volle Titel brauchen auf jedem Gerät ein
Quellen-Plugin; ohne Plugin fällt der Gast auf die 30-Sekunden-Vorschau zurück (die App sucht sie über
Titel/Artist im Katalog, auch für YouTube-Referenzen). Mit „Im Raum nur Vorschauen“ (`previewOnly`)
spielt auch der Host die Vorschau, damit alle ohne Plugin dasselbe hören.

2.2 – Jam und Algorithmus-Schalter: Raum-Snapshots tragen zusätzlich `jam` und `queue` (bis 50
Einträge, nur `ref` + wer hinzugefügt hat, keine Audiodaten). Nachrichten: `jam` (nur Host schaltet
an/aus), `add` (alle bei aktivem Jam, Host immer), `unqueue` (Host oder wer den Titel hinzugefügt hat)
und `queue-clear` (Host). Der Host löst jeden Eintrag auf, hängt ihn an seine eigene Warteschlange
und entfernt ihn beim Start aus der geteilten Liste; Gäste sehen die Liste nur. „Algorithmus aus“
(`noAuto` in `cleanmusic.room.v1`) schaltet Autoplay im Raum ab. Der Freunde-Tab fragt im offenen
Fenster alle 10 s, relative Zeiten werden alle 15 s ohne Anfrage neu gezeichnet. Ältere Server ohne
`jam`/`queue` blenden den Jam aus. Tests: `test/social.test.js`, `test/social-protocol.test.js`,
`server/social/test/worker.test.js`, Smoke `SMOKE_SOCIAL_SERVER`.

- Raum per Code, höchstens 20 Leute. Der Host steuert, der Server verteilt nur
  `{ ref, position, at, playing }` über WebSocket (Durable Object, Hibernation).
- Jedes Gerät spielt selbst. Bei Vorschauen ist der Gleichlauf ungefähr, bei vollen Titeln
  sekundengenau.
- Nur Reaktionen, kein Chat. Ohne Host stirbt der Raum nach 30 Minuten.

Freitext-Chat ist bewusst nicht geplant: Er wäre die einzige Stelle, die echte Moderation
bräuchte.

## Datenschutz (vor dem Start klären)

- **Gespeichert:**
  - öffentlicher Schlüssel, Anzeigename, Freunde und Blockierte, Gruppen
  - letzte Aktivität (verfällt nach 10 Minuten)
  - Wochensummen (Sekunden, Plays, Top-Artists)
- **Nicht gespeichert:** IP-Adressen (nur gehasht im Rate-Limit-Fenster, höchstens 24 h),
  keine Telemetrie, kein Verlauf über die Wochensummen hinaus.
- **Löschen:** „Konto löschen“ entfernt sofort alles. Inaktive Konten werden nach
  12 Monaten automatisch gelöscht.
- **Vom Betreiber zu klären (keine Rechtsberatung):**
  - Datenschutzerklärung `site/privacy/social/` mit Cloudflare als Auftragsverarbeiter
  - Impressum
  - Mindestalter (in Deutschland oft 16)

## Aufbau im Repository

- `server/social/` – Cloudflare Worker mit eigener `package.json` und `wrangler.toml`.
  Nicht im Electron-Build, eigene Tests mit Miniflare/Vitest.
  - Endpunkte:
    - `POST /v1/account` (Proof-of-Work)
    - `POST /v1/name`
    - `POST /v1/friend-code`
    - `POST /v1/friend/redeem`
    - `POST /v1/friend/accept`, `POST /v1/friend/decline` (2.1)
    - `POST /v1/presence` (2.1)
    - `GET /v1/friends`
    - `POST /v1/activity`
    - `POST /v1/react`
    - `POST /v1/report`
    - `POST /v1/block`
    - `DELETE /v1/account`
    - `GET /v1/status`
    - WebSocket `/v1/room/:code`
- `lib/social-names.js` – Namensfilter, Zufallsnamen und Kürzel. Rein, wird von App und
  Worker genutzt.
- `renderer/core/social.js` – Client-Zustand (Freunde, Aktivität, Räume) ohne Netzwerk.
- `main.js`:
  - IPC `social-request` mit fester Host-Allowlist (nur die Social-Domain).
  - Der private Schlüssel liegt per `safeStorage` im Hauptprozess; der Renderer sieht ihn
    nie.
  - Der Renderer selbst ruft nichts direkt auf.
- Mobile später: `native.js` über `CapacitorHttp`, Schlüssel im Android Keystore.
- Smoke `SMOKE_SOCIAL_SERVER` gegen einen lokalen Fake-Server, wie beim Streamer.bot-Smoke.

## Was du selbst machen musst

1. Ein kostenloses Cloudflare-Konto anlegen (Konten lege ich nicht an).
2. Einmal `npx wrangler login` im Terminal ausführen.
3. Datenschutzerklärung und Mindestalter freigeben.

## Aufwand

| Phase | Aufwand |
| --- | --- |
| S1 | 1–2 Sitzungen |
| S2 | 1 Sitzung |
| S3 | 1–2 Sitzungen |

Gut aufteilbar: Worker und Namensfilter sind eigenständig und auch mit OpenCode machbar. Die
App-Anbindung danach.
