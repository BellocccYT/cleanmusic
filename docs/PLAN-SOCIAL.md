# Plan: Echte Social-Funktionen (Weg B)

Stand: 25.11.2026 – **S1 ist gebaut** (Server, App-Anbindung, Tests). Der Server läuft seit 25.11.2026 unter
`https://cleanmusic-social.cleanmusic.workers.dev` (Standard-Adresse ab dem nächsten Release);
die Datenschutzseite `site/privacy/social/` ist ausgefüllt (25.11.2026). S2 und S3 sind offen. Weg A (ohne Server: Discord-Knopf, Playlist-Links,
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

### S2 – Gruppen auf dem Server

- Die Wochenkarte aktualisiert sich automatisch. Der Code zum Kopieren bleibt als
  Offline-Weg.
- Gemeinsame Gruppen-Playlist: Referenzen, höchstens 200 Titel. Alle dürfen hinzufügen,
  der Ersteller darf entfernen.

### S3 – Gemeinsam hören (Listening-Party)

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
