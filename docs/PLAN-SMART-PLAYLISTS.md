# Plan: Smart-Playlists („Rezepte v0“)

**Stand: umgesetzt und mit CleanMusic 1.19.0 veröffentlicht.**

Smart-Playlists sind der erste Baustein aus [`CONCEPT-2.0.md`](CONCEPT-2.0.md):
eine Playlist, die nicht aus einer festen Liste besteht, sondern aus **Regeln**.
Sie arbeitet ausschließlich mit Musik, die schon auf dem Gerät oder im
Renderer-Zustand ist – **keine neuen Netzwerkanfragen**.

---

## 1. Datenmodell

```js
playlist.smart = {
  sources: ['favorites', 'local', 'history', 'playlists', 'recs', 'charts'],
  limit: 30,               // 5–100
  streamSafe: false,       // nur NCS/CC0/CC BY/bestätigte Plugin-Lizenz
  withCredit: false,       // nur Titel mit Lizenz-/Credit-Notiz
  notPlayedDays: 0,        // 0 | 7 | 14 | 30 | 90
  excludeDislikes: true,   // „Weniger davon“ bleibt draußen
  updatedAt: 0,            // Zeitpunkt der letzten Auswertung
};
```

- Die Playlist bleibt eine normale Playlist: `id`, `name`, `items`, `createdAt`,
  `updatedAt`, `preset`.
- `smart` ist optional. Fehlt es, verhält sich alles wie bisher.
- `loadCollection()` normalisiert die Regeln; unbekannte Quellen und ungültige
  Zahlen werden verworfen, nicht übernommen.
- Backup-Import erhält `smart`; bei einer vorhandenen Playlist gewinnen die
  Regeln, aber es wird nichts gelöscht oder sofort neu gebaut.

## 2. Auswahl-Logik

1. **Quellen sammeln** (nur vorhandene Einträge):
   - Favoriten
   - lokale Dateien (`state.library.entries`)
   - Verlauf (`history`)
   - andere, nicht-smarte Playlists
   - Vorschläge (`state.recs.tracks`)
   - Charts/Neuheiten (`state.charts.tracks`, `state.releases.tracks`)
2. **Filtern:** Radio raus, optional stream-sicher, optional mit Credit,
   optional „seit X Tagen nicht gehört“, optional ohne Dislikes.
3. **Duplikate entfernen:** über `id` und einen stabilen Titel-/Artist-Schlüssel.
   Bei nicht-lateinischen Titeln greift der ID-Fallback, damit japanische,
   kyrillische oder griechische Titel nicht alle auf denselben leeren Schlüssel
   fallen.
4. **Sortieren:** je Quelle nach `tasteScore` (explizites Feedback, Favoriten,
   Plays, Skips), dann alphabetisch.
5. **Mischen:** Quellen reihum, damit eine große lokale Bibliothek nicht alles
   dominiert.
6. **Begrenzen:** auf `limit`, dann als `storable`-Einträge speichern.

## 3. Oberfläche

- **Seitenleiste:** neuer Knopf „Smart-Playlist“; smarte Listen tragen das
  Funken-Symbol statt des Listen-Symbols.
- **Playlist-Kopf:** „Smart-Playlist“, Zeitpunkt der letzten Aktualisierung und
  Regel-Chips (Quellen, Filter, Limit).
- **Aktionen:** „Regeln“, „Aktualisieren“, „Umbenennen“, „Löschen“ sowie
  „Shuffle“/„Abspielen“, sobald Treffer da sind.
- **Dialog:** Name, Quellen (Checkboxen), Limit, „Nicht gehört seit“, drei
  Filter; live Vorschau („38 Titel passen · 12 davon stream-sicher“).
- **Leerer Zustand:** erklärt, dass Regeln gerade nichts treffen, und bietet
  „Regeln bearbeiten“ an.
- **Bewusst nicht:** manuelles Hinzufügen, Entfernen oder Umsortieren. Das
  würde beim nächsten Aktualisieren verloren gehen; stattdessen erklärt die App
  den Weg über die Regeln.

## 4. Verhalten

- **Anlegen:** Regeln wählen → Vorschau → Erstellen. Die Liste wird sofort
  gebaut und als normale Playlist gespeichert.
- **Aktualisieren:** baut die Liste mit dem aktuellen Bestand neu; ein Toast
  nennt die Trefferzahl.
- **Bearbeiten:** Name und Regeln ändern, speichern, neu bauen.
- **Kein Auto-Refresh in v0:** Die Liste ändert sich nur auf Knopfdruck. Das ist
  bewusst vorhersehbar; ein optionales „beim Öffnen aktualisieren“ folgt, wenn
  die Rezepte mit den Mixes zusammengeführt werden.

## 5. Test

`SMOKE_SMART` in `main.js` prüft:

- Anlegen aus Charts/Favoriten/Verlauf/Vorschlägen/lokaler Musik,
- keine Duplikate (IDs und Schlüssel), alle Einträge gültig,
- Kopfzeile, Regel-Chips, Aktualisieren- und Regeln-Knopf, Seitenleisten-Eintrag,
- Dialog mit sechs Quellen und Live-Vorschau,
- Limit ändern → speichern → Liste und localStorage tragen das neue Limit,
- Regel-Normalisierung (Limit 5–100, unbekannte Quellen, ungültige Tage),
- Dislike eines Titels → Aktualisieren → Titel ist draußen,
- Aufräumen und der neue Seitenleisten-Knopf.

## 6. Offen (nächste Ausbaustufen)

- **Auto-Refresh** (`refresh: 'onOpen' | 'manual'`) und ein sichtbarer Hinweis,
  wenn die Liste veraltet ist.
- **BPM- und Stimmungsfilter** für lokale Titel (BPM-Cache und `localMoods`
  sind vorhanden).
- **„Warum dieser Titel?“** je Eintrag: welche Regel und welche Quelle gegriffen
  haben. Dafür braucht der Eintrag eine Herkunftsnotiz.
- **Rezepte mit den Mixes verschmelzen:** System-Rezepte (Täglich, Frisch,
  Entdecken, Nochmal, Tief) und Vorlagen werden schreibgeschützte Rezepte;
  „Duplizieren“ macht daraus ein eigenes.
- **Version:** Der Baustein ist für **1.19.0** gedacht, sobald die Suite grün ist
  und `WHATS_NEW`/Changelog/README ergänzt sind.

## 7. Berührte Dateien

- `renderer/app.js`: Regeln, Engine, Dialog, Playlist-Ansicht, Seitenleiste,
  Backup-Import, Test-Hooks.
- `renderer/index.html`: Knopf „Smart-Playlist“.
- `renderer/styles.css`: Dialog, Chips, Checkbox-Zeilen.
- `main.js`: `SMOKE_SMART`.
- `AGENTS.md`, `README.md`: Status und Kurzbeschreibung.
