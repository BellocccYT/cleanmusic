# Übergabe: Release 2.0.0 („Social“)

Stand 25.11.2026. Für die Weiterarbeit (auch mit OpenCode). Regeln und Aufbau stehen in
`AGENTS.md`; Social im Detail in `docs/PLAN-SOCIAL.md` und `server/social/README.md`.

## Was schon fertig ist

- **Social S1** (Freunde, „hört gerade“, Reaktionen, Blockieren/Melden, Konto löschen) und
  **S2** (Gruppen mit Gruppencode, automatische Wochenkarte, Gruppen-Playlist) – gebaut,
  getestet, auf master.
- **Server live:** `https://cleanmusic-social.cleanmusic.workers.dev` (Cloudflare-Konto
  „CleanMusic“, Konto-ID `5c7bd0ef691181685bcf56963415d7a6`), Version mit S2.
- `DEFAULT_SERVER` in `lib/social-protocol.js` zeigt darauf. In 1.27.0 ist „Freunde“ noch
  ausgeblendet, weil 1.27.0 keinen Server kennt – erst das nächste Release zeigt Social.
- Datenschutzseite `site/privacy/social/` ist ausgefüllt (Betreiberangaben so lassen, nichts
  ergänzen oder erfinden).

## Entscheidung

Release als **2.0.0** mit Freunden und Gruppen. **S3 (Gemeinsam hören) kommt danach als 2.1**
(Plan in `docs/PLAN-SOCIAL.md`, Abschnitt S3).

## Schritte vor dem Release

### 1. Weniger Anfragen (Cloudflare-Gratis-Tarif: ca. 100.000 Anfragen/Tag)

`renderer/app.js`, Abschnitt „Social (Weg B)“, `startSocialTimers` / `refreshFriends`:
heute alle 60 s `GET /v1/friends` **und** `GET /v1/groups` (bei sichtbarem Fenster).

- Takt: alle 30 s prüfen, aber nur abfragen, wenn
  - die Ansicht „Freunde“ offen ist und die letzte Abfrage ≥ 30 s her ist, **oder**
  - sonst ≥ 3 min her ist; nie bei `document.hidden`.
- `GET /v1/groups` nur, wenn `socialRt.groups.length > 0` oder die letzte Gruppen-Abfrage
  ≥ 10 min her ist (oder direkt nach Erstellen/Beitreten – passiert schon über
  `refreshFriends`).
- Reine Entscheidung als Helfer in `renderer/core/social.js` (z. B. `pollPlan`) mit Test in
  `test/social.test.js`. Server nicht ändern.

### 2. Proof-of-Work auf 22 Bits

- `server/social/wrangler.toml`: `POW_BITS = "22"`.
- Veröffentlichen **nur mit dem CleanMusic-Konto** (die feste Konto-ID verhindert ein
  falsches Konto), in einem normalen PowerShell-Fenster:

  ```powershell
  cd server/social
  npx.cmd wrangler whoami
  $env:CLOUDFLARE_ACCOUNT_ID = '5c7bd0ef691181685bcf56963415d7a6'; npx.cmd wrangler deploy
  ```

- Prüfen: `https://cleanmusic-social.cleanmusic.workers.dev/v1/status` → `"pow": 22`.
- Achtung: Pro Netz sind nur 3 neue Konten am Tag erlaubt – keine Wegwerf-Konten für Tests
  anlegen, die Miniflare-Tests decken die Abläufe ab.

### 3. Release 2.0.0

Vorlage: Commit `81afb34` (Release 1.27.0) – dieselben Stellen anfassen:

- `package.json` → `"version": "2.0.0"`; `renderer/index.html` (Versionsstelle wie in 81afb34).
- `renderer/app.js` → `WHATS_NEW` um `'2.0.0'` ergänzen (Freunde, Gruppen, Datenschutz-Link);
  `SMOKE_WHATS_NEW` muss grün bleiben.
- `site/changelog/index.html` → Eintrag 2.0.0.
- `docs/releases/v2.0.0.md` → Release-Notes (**vor** dem Tag anlegen; `build.yml` nimmt sie als
  Release-Text und postet sie in Discord).
- `README.md` und `AGENTS.md` → Stand/Version.

Tests (alle grün, sonst kein Release):

```powershell
npm.cmd run test:unit
npm.cmd run smoke
npm.cmd run smoke:mobile
cd server/social; npm test
```

Dann `npm.cmd run build:win` und `release\win-unpacked\CleanMusic.exe --smoke`.

**Tag `v2.0.0` erst nach ausdrücklichem OK des Users** setzen und pushen.

## Regeln für diese Arbeit

- Andere Sitzungen arbeiten parallel im selben Ordner: nur eigene Dateien/Hunks committen
  (`git commit -o <pfade>`), vorher `git pull --rebase`.
- Commit-Nachrichten auf Deutsch.
- Kein Deploy und kein Tag ohne OK des Users. Keine Konten anlegen.
