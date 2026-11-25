# CleanMusic Social – Server (Weg B, Phase S1)

Cloudflare Worker + ein Durable Object (`SocialHub`, SQLite) für Konten, Freunde,
„Hört gerade“ und Reaktionen. Plan: [`docs/PLAN-SOCIAL.md`](../../docs/PLAN-SOCIAL.md).
**Nicht Teil des Electron-Builds** – eigener Ordner, eigene `package.json`.

- `src/index.js` – Worker: leitet `/v1/*` an das Durable Object in der EU-Jurisdiktion,
  reicht nur das IP-Präfix (/24 bzw. /48) weiter.
- `src/hub.js` – Endpunkte, Signaturprüfung, Proof-of-Work, Rate-Limits, Aufräumen (Alarm
  alle 10 Minuten).
- `../../lib/social-names.js`, `../../lib/social-protocol.js` – gemeinsam mit der App
  (Namensfilter, Zufallsnamen, Kürzel, signierter Text, Freundescodes).

## Endpunkte

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/v1/status` | öffentlich: an/aus, PoW-Schwierigkeit, Grenzen |
| POST | `/v1/account` | Konto anlegen (Proof-of-Work), Zufallsname |
| DELETE | `/v1/account` | alles sofort löschen (geht auch bei Not-Aus) |
| POST | `/v1/name` | eigener Name (Filter, 1×/Tag) oder `{ random: true }` |
| POST | `/v1/friend-code` | Code (24 h, einmal nutzbar, max. 5 offen); `{ revoke: true }` widerruft |
| POST | `/v1/friend/redeem` | Code einlösen (max. 200 Freunde) |
| POST | `/v1/friend/remove` | Freundschaft beenden |
| GET | `/v1/friends` | Freunde, Aktivität (10 min), Reaktionen (24 h), Blockierte |
| POST | `/v1/activity` | eigener Song als Referenz oder `{ clear: true }` |
| POST | `/v1/react` | 🔥 ❤️ 😂 🎧 👀 auf den aktuellen Song eines Freundes |
| POST | `/v1/report` | Melden (`name`/`spam`/`other`); 3× Name → Zufallsname |
| POST | `/v1/block` | Blockieren (sofort, einseitig) bzw. `{ block: false }` |

Jede Anfrage außer `/v1/status` ist signiert: ECDSA P-256 über
`CM-SOCIAL-1 · Methode · Pfad · Zeit (±5 min) · Nonce · SHA-256(Body)` in den Headern
`cm-key`, `cm-time`, `cm-nonce`, `cm-sig`. Nonces werden 10 Minuten gemerkt.

Rate-Limits je Schlüssel (neue Konten < 24 h enger): Code einlösen 20/h (5/h),
Codes erzeugen 10/h (3/h), Aktivität 1/15 s, Reaktionen 30/min (10/min), Meldungen 10/Tag
(3/Tag). Je Netz (gehashtes IP-Präfix, Salz wechselt täglich): 600 Anfragen/10 min,
3 neue Konten pro Tag.

## Testen (ohne Cloudflare-Konto)

```powershell
cd server/social
npm install
npm test
```

`npm test` bündelt den Worker mit esbuild (wie `wrangler deploy`) und startet ihn mit
Durable Object in Miniflare. Lokal ausprobieren: `npm run dev` startet
`wrangler dev --local` auf `http://127.0.0.1:8787` – diese Adresse kannst du in CleanMusic
unter **Freunde → Social-Server** (Ansicht „Erweitert“) eintragen.

## Veröffentlichen (macht der Betreiber selbst)

1. Kostenloses Cloudflare-Konto anlegen: <https://dash.cloudflare.com/sign-up>.
2. Im Terminal anmelden (öffnet den Browser):

   ```powershell
   cd server/social
   npx wrangler login
   ```

3. Optional, für Not-Aus und Sperren ohne neues Deploy – ein langes Zufalls-Token:

   ```powershell
   npx wrangler secret put ADMIN_TOKEN
   ```

4. Veröffentlichen:

   ```powershell
   npx wrangler deploy
   ```

   Wrangler zeigt danach die Adresse, z. B. `https://cleanmusic-social.<dein-name>.workers.dev`.
5. Adresse in der App eintragen:
   - für dich: **Freunde → Social-Server** (Ansicht „Erweitert“), Rückfrage bestätigen;
   - für alle: `DEFAULT_SERVER` in `lib/social-protocol.js` setzen und ein Release bauen.
6. Vor dem Start: Datenschutzseite `site/privacy/social/` vervollständigen (Verantwortlicher,
   Impressum, Auftragsverarbeitung mit Cloudflare, Mindestalter) und den Entwurfs-Hinweis
   entfernen.

Limits des kostenlosen Tarifs (Anfragen pro Tag, Durable-Object-Speicher) vorher in der
Cloudflare-Doku prüfen.

## Betrieb

- **Not-Aus:** `SOCIAL_ENABLED = "false"` in `wrangler.toml` (+ `wrangler deploy`) oder ohne
  Deploy mit Token:
  `curl -X POST -H "Authorization: Bearer <TOKEN>" -d '{"enabled":false}' https://…/v1/admin/switch`.
  Status und „Konto löschen“ funktionieren weiter.
- **PoW-Schwierigkeit:** `POW_BITS` (8–28, Standard 20 ≈ 1–3 s) oder `{"pow": 22}` an
  `/v1/admin/switch`.
- **Sperren:** `POST /v1/admin/ban` mit `{"id":"<Konto-ID>"}` löscht das Konto und sperrt den
  Schlüssel; `{"id":"…","banned":false}` hebt die Sperre auf.
- **Meldungen ansehen:** `GET /v1/admin/reports`.
- Ohne `ADMIN_TOKEN` (mind. 32 Zeichen) gibt es die `/v1/admin/*`-Adressen nicht.
- `LOCAL_DEV` und `TEST_LIMITS` sind nur für lokale Läufe gedacht und dürfen nie in
  `wrangler.toml` stehen (ohne `LOCAL_DEV` liegen die Daten in der EU-Jurisdiktion).
