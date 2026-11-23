# Plan: CleanMusic 2.0.0

**Entscheidung vom 23.11.2026:** Die bestehende Oberfläche bleibt. Kein Rail-/Bühnen-Umbau,
kein Ersatz der Seitenleiste. 2.0.0 wird ein **Qualitäts- und Architektur-Release**:
die App wird erwachsener, nicht anders.

Ausgangspunkt: CleanMusic 1.20.1.

---

## 1. Definition von 2.0.0

2.0.0 ist fertig, wenn alle **Muss**-Punkte erfüllt sind. **Kann**-Punkte dürfen warten.

### Muss

1. **Architektur:** Queue, Audio-Steuerung, Store und Persistenz liegen in eigenen Modulen.
   `renderer/app.js` bleibt Verdrahtung und UI, nicht mehr die einzige Quelle für alles.
2. **Daten:** Schema-Version und idempotente Migrationen. Ein Update darf nie Nutzerdaten
   verlieren; vor jeder Migration gibt es eine Sicherung.
3. **Rezepte:** Smart-Playlists sind vollständig: Auto-Refresh, System-Rezepte
   (Mixes/Vorlagen), BPM-/Stimmungsfilter und nachvollziehbare Herkunft pro Eintrag.
4. **Studio:** Nicht-destruktive Timeline mit mehreren Clips, Projekten und Export-Presets;
   Credits werden automatisch mitgeschrieben.
5. **Plugin-API v3:** Fähigkeiten und Berechtigungen, dynamische Optionslisten, UI-Slots;
   v2-Plugins laufen unverändert weiter.
6. **Mobile Parität:** Hören, Bibliothek, Rezepte und Suche verhalten sich auf Handy/Tablet
   wie am Desktop; TV Lite bleibt bewusst schlank.
7. **Tests:** Unit-Tests für Queue, Store, Migrationen und Rezepte; alle Smoke-Suiten grün;
   ein gepackter Build besteht den Handtest.

### Kann

- Design-Tokens und die Dichte „Ruhig/Dicht“.
- Englische Oberfläche und englische README.
- Visuelle Regressionstests.
- Weitere freie Dienste oder Plugin-Komfort.

### Nicht-Ziele

- Kein Raum-Umbau, keine neue Shell, kein Ersatz der 13 Ansichten.
- Kein Rewrite, kein Wechsel weg von Electron.
- Keine Konten, Cloud, Telemetrie oder Social-Features.
- Keine Änderung an Download-/DRM-Regeln.

---

## 2. Ausgangslage (1.20.1)

| Bereich | Stand |
| --- | --- |
| `renderer/app.js` | ~14.900 Zeilen; UI, Player, Queue, Persistenz und Fachlogik |
| `main.js` | ~7.400 Zeilen; Fenster, IPC, Updates, Plugins, Downloads, Remote |
| Ausgelagerte Module | `renderer/core/text.js` (10 Tests), `renderer/core/storage.js` (5 Tests) |
| Queue | Funktionen in `app.js`, teils mit DOM/State verflochten |
| Persistenz | `readJSON`/`writeJSON`, viele einzelne `localStorage`-Schlüssel, keine Schema-Version |
| Rezepte | Smart-Playlists v0; Mixes und Vorlagen noch getrennt |
| Studio | Einzelclip-Cutter; keine Timeline |
| Plugin-API | v2 mit Feldern, Ereignissen und Player-Steuerung |
| Mobile | 1.1.0; TV Lite ohne Cutter/Plugins/Downloads |

---

## 3. Phasen

Jede Phase ist auslieferbar. Keine Phase bricht die vorherige.

### Phase 0 – Sicherheitsnetz (klein)

- Baseline: alle Suiten grün, `test:unit` für reine Module.
- Queue-Funktionen zuerst als reine Funktionen abbilden und testen, **bevor** sie ersetzt werden.
- Persistenz-Inventar: alle `localStorage`-Schlüssel und ihre Formen dokumentieren.

**Fertig, wenn:** `renderer/audio/queue.js` existiert, getestet ist und `app.js` es nutzt,
ohne Verhaltensänderung.

### Phase 1 – Queue & Store (Muss 1)

- `renderer/audio/queue.js`: Shuffle, Restore, Gruppe, nächster Index, Upcoming.
- `renderer/core/state.js`: ein Store mit klaren Aktionen/Selektoren für Queue, Player,
  Sammlung und Einstellungen. Keine versteckten Globals.
- `renderer/core/persist.js`: ein Ort für Schlüssel, Laden, Speichern, Backup.
- `app.js` liest/schreibt nur noch über diese Schicht.

**Fertig, wenn:** Queue-Tests grün, alle Smokes grün, `app.js` < 12.000 Zeilen.

### Phase 2 – Schema & Migrationen (Muss 2)

- `cleanmusic.schema.v1` plus `migrations.js`.
- Jede Migration idempotent; vorher `.bak`, danach Prüfung.
- Export/Import-Test mit einem echten Profil (Favoriten, Playlists, Rezepte, Verlauf).
- Fehlerfall: beschädigte Datei → Start mit Sicherung und verständlicher Meldung.

**Fertig, wenn:** Migrationstests und ein manueller Update-Test von 1.20.1 grün sind.

### Phase 3 – Rezepte vollständig (Muss 3)

- `playlist.smart` bleibt das Datenmodell; `refresh: 'manual' | 'onOpen' | 'daily'`.
- System-Rezepte: Mixes und Vorlagen werden schreibgeschützte Rezepte; „Duplizieren“
  erzeugt ein eigenes.
- Filter: BPM-Bereich, Stimmung, Quelle, Lizenz, Credit, „nicht gehört seit“.
- „Warum dieser Titel?“ pro Eintrag: Regel, Quelle, Lizenz.
- Keine neuen Netzwerkabfragen.

**Fertig, wenn:** `SMOKE_RECIPES` deckt Anlegen, Auto-Refresh, System-Rezept, Filter und
Duplikatfreiheit ab.

### Phase 4 – Studio (Muss 4)

- Projekt mit Timeline, mehreren Clips, nicht-destruktiv.
- Waveform, Schnittmarken, Fades, Normalisierung, Loop, BPM/Key (Batch).
- Export-Presets (WAV/MP3/M4A) und automatische Credit-.txt.
- Stream-sicher-Prüfung vor dem Export.

**Fertig, wenn:** Ein Projekt von Import bis Credit exportiert werden kann und
`SMOKE_STUDIO` den Weg prüft.

### Phase 5 – Plugin-API v3 (Muss 5)

- Manifest mit Fähigkeiten (`player`, `library:read`, `network:allowlist`, `fs:folder`,
  `ui:panel`, `ui:settings`, `visualizer`, `downloads:cc-only`).
- Berechtigungen beim Aktivieren sichtbar; keine automatische Aktivierung.
- Dynamische Optionslisten und UI-Slots; v2 bleibt kompatibel.
- Kein Remote-Code.

**Fertig, wenn:** OBS- und Streamer.bot-Plugins unverändert laufen und ein v3-Beispiel
seine Fähigkeiten anzeigt.

### Phase 6 – Mobile Parität (Muss 6)

- Handy/Tablet: dieselben Rezepte, Suche, Queue und Player-Zustände wie Desktop.
- TV Lite: bewusst ohne Cutter/Plugins/Downloads, aber mit Rezepten und Suche.
- Gemeinsame Tests für Zustand und Deep Links.

**Fertig, wenn:** `smoke:mobile` die neuen Rezepte und die Parität prüft.

### Phase 7 – 2.0.0 (Release)

- `WHATS_NEW` für alle Versionen seit dem letzten Stand.
- Changelog, README, Plugin-Doku, Migrationshinweis.
- Gepackter Build, alle Suiten, Update-Kette, Pages.
- Kein Datenverlust beim Update von 1.20.1.

---

## 4. Reihenfolge und Aufwand

| Phase | Inhalt | Größe |
| --- | --- | --- |
| 0 | Queue-Modul + Tests | S |
| 1 | Store/Persistenz | L |
| 2 | Schema/Migrationen | M |
| 3 | Rezepte | M |
| 4 | Studio | L |
| 5 | Plugin-API v3 | M–L |
| 6 | Mobile | L |
| 7 | Release | S |

**Realistisch:** 3–5 Monate nebenbei. Ohne Studio und Mobile-Parität: 6–8 Wochen.

---

## 5. Risiken

| Risiko | Gegenmittel |
| --- | --- |
| Queue-Extraktion ändert Verhalten | Erst reine Funktionen + Tests, dann Schritt für Schritt ersetzen |
| Datenverlust bei Migration | `.bak`, Idempotenz, Test mit echtem Profil |
| Plugin-Bruch | v2 weiter unterstützen, Fähigkeiten additiv |
| Performance | Budgets im Smoke, Lazy-Loading der Module |
| Scope-Kriechen | Muss/Kann strikt trennen; jede Phase einzeln ausliefern |

---

## 6. Erste Schritte (ab jetzt)

1. ✅ `renderer/audio/queue.js` mit reinen Funktionen und `test/queue.test.js`.
2. ✅ `shuffleQueueTail`, `restoreQueueTail`, `queueGroup`, `upcomingIndex` und `nextIndex`
   in `app.js` durch das Modul ersetzen.
3. Danach `core/persist.js` und den Store angehen.

**Stand:** Queue-Modul und 9 Queue-Tests sind drin; `renderer/core/persist.js` bündelt
alle `localStorage`-Schlüssel (4 Tests). `npm run test:unit` fährt 28 Prüfungen.
Die Smoke-Suiten prüfen das unveränderte Verhalten (Shuffle, Restore, Queue-Reihenfolge).

**Regel:** Kein Schritt ohne grüne Tests. Kein Big-Bang.
