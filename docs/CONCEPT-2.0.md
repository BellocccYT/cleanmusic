# CleanMusic 2.0 — Der Raum

**Ein Konzept, das Produkt, Oberfläche, Architektur und Release-Weg neu denkt.**

> Dies ist kein Feature-Plan. Es ist ein Gegenentwurf zu dem, was CleanMusic heute ist:
> ein sehr guter Werkzeugkasten mit 13 gleichberechtigten Ansichten. 2.0 macht daraus
> einen Ort. Alles darf sich ändern — nur nicht die Nutzerdaten, die rechtlichen Grenzen
> und das Versprechen: lokal, ehrlich, ohne Konto.

---

## 1. Manifest

1. **Musik ist kein Feed.** Kein endloses Scrollen, keine Empfehlungsspirale, kein Autoplay, das nie aufhört.
2. **Der Raum gehört dir.** Deine Dateien, deine Reihenfolge, deine Regeln. Nichts wird heimlich umsortiert.
3. **Ein Titel ist ein Ort, kein Inhaltsposten.** Er bekommt Licht, Platz und Herkunft — nicht eine Karte in einer Liste.
4. **Weniger Flächen, mehr Tiefe.** Vier Modi statt 13 Ansichten. Was wichtig ist, wird groß; der Rest tritt zurück.
5. **Lokal zuerst.** Keine Konten, keine Cloud, keine Telemetrie. Das Netz ist ein Fenster, keine Grundlage.
6. **Keine dunklen Muster.** Kein „Bleib dran", keine künstliche Verknappung, keine Angst vor dem Schließen.
7. **Das Werkzeug verschwindet, die Musik bleibt.** Gute Software erklärt sich nicht ständig selbst.

**Leitsatz:** *Kein Feed. Ein Raum.*

---

## 2. Warum jetzt

CleanMusic ist funktional erwachsen geworden: Warteschlange, Autoplay, Mixes, Vorlagen,
Geschmacks-Engine, Cutter, Downloads, Rückblick, Songtexte, Visualizer, Fernbedienung,
Mini-Player, OBS, Streamer.bot, Discord, Mobile. Das Problem ist nicht fehlende Funktion,
sondern **fehlende Form**.

| Symptom | Ursache |
| --- | --- |
| 13 Ansichten mit gleichem Gewicht | Jede Funktion hat eine eigene Fläche bekommen, statt in einem Modell aufzugehen. |
| Mixes, Vorlagen, Smart-Playlists, Favoriten, Verlauf überlappen | Es gibt keinen gemeinsamen Begriff für „eine geregelte Sammlung von Musik". |
| `renderer/app.js` mit ~14.300 Zeilen | UI, Player, Queue, Persistenz, Plugins und Fachlogik wachsen im selben Modul. |
| `main.js` mit ~7.100 Zeilen | Fenster, IPC, Updates, Plugins, Downloads, Remote und Discord liegen nebeneinander. |
| Identität „Music Launcher" | Beschreibt die Technik (Web-Player einbetten), nicht das Erlebnis. |
| Einfach/Erweitert | Zwei Stufen derselben Oberfläche, statt zweier Densities eines Systems. |

**Die Chance:** CleanMusic ist die einzige Musik-App in dieser Nische, die *nicht* versucht,
ein Streamingdienst zu sein. Sie kann der Ort für die Musik sein, die man schon hat —
und für die, die man bewusst dazuholt.

---

## 3. Die Leitidee

### Der Raum

Die App ist ein Raum mit vier Zonen. Musik bewegt sich durch sie hindurch, statt in
Ansichten zu verschwinden.

```
┌──────────────────────────────────────────────────────────────────┐
│  ◉  Hören      Stöbern      Bauen      Verbinden          ⌘K    │  Rail
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                           B Ü H N E                              │
│                  Cover · Titel · Herkunft · Licht                │
│                                                                  │
│         [ Songtext ]   [ Visualizer ]   [ Strom › ]              │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  ▷  Titel — Artist        ─────●──────   🔈   ⤢   ≋  Jetzt-Leiste │
└──────────────────────────────────────────────────────────────────┘
```

- **Bühne** — was jetzt läuft. Kein Dashboard, sondern ein Ort mit Licht aus dem Cover.
- **Regal** — was dir gehört: Sammlung, Rezepte, Playlists, Künstler, lokale Musik.
- **Studio** — was du baust: Cutter, Projekte, Exporte, Chronik.
- **Fenster** — was draußen passiert: begrenzte Entdeckung, Charts, Radio-Wellen.
- **Strom** — die eine Warteschlange, in die alles mündet.
- **Jetzt-Leiste** — immer da, wächst bei Bedarf zur Bühne auf.

### Die vier Grundobjekte

| Objekt | Bedeutung | Ersetzt heute |
| --- | --- | --- |
| **Titel** | Ein Stück Musik mit Herkunft, Besitzstatus und Credit. | Track/Entry |
| **Strom** | Die reale Reihenfolge dessen, was als Nächstes läuft. | Queue + Autoplay |
| **Rezept** | Eine Regel, die Musik auswählt — live oder als Momentaufnahme. | Mixes, Vorlagen, Smart-Playlists |
| **Welle** | Eine begrenzte Radio-Session mit Anfang und Ende. | Endlos-Radio |

Alles andere (Favorit, Verlauf, Playlist, Wunsch) ist eine **Eigenschaft** oder **Sicht**
auf diese Objekte, keine eigene Welt.

---

## 4. Die neue Informationsarchitektur

### 4.1 Vier Modi statt 13 Ansichten

| Modus | Enthält | Kerntätigkeit |
| --- | --- | --- |
| **Hören** | Bühne, Strom, Songtext, Visualizer, Vollbild, Chronik | Zuhören und den nächsten Titel bestimmen |
| **Stöbern** | Regal: Sammlung, Rezepte, Playlists, Künstler, lokale Musik, Fenster, Wellen | Auswählen und entdecken |
| **Bauen** | Studio: Cutter, Projekte, Exporte, Downloads, BPM/Waveform | Schneiden und veröffentlichen |
| **Verbinden** | Plugins, Ausgänge (OBS, Streamer.bot, Discord, Fernbedienung, Mini), Backup, Updates | Anschluss und Betrieb |

**Einstellungen** sind kein Modus mehr, sondern ein **Schaltraum**: ein modales Blatt,
das über dem aktuellen Ort liegt und ihn nicht verlässt. Sechs Register bleiben
(Wiedergabe, Klang, Darstellung, Plugins, Verbindungen, System), aber sie fühlen sich
wie Einstellungen an — nicht wie ein Ziel.

### 4.2 Was verschmilzt

| Heute | 2.0 |
| --- | --- |
| Startseite, Mixes, Vorlagen, Favoriten, Verlauf, Suche, Radio, Lokal, Künstler, Playlist | **Regal** mit Facetten und einer Suche |
| Warteschlange + Autoplay + Songwünsche | **Strom** mit Herkunfts-Marken und Weiche |
| Mixes + Vorlagen + Smart-Playlists | **Rezepte** (System- und Nutzer-Rezepte) |
| Cutter + Downloads + Rückblick | **Studio** (Bauen) bzw. **Chronik** (Hören) |
| Einfach/Erweitert | **Ruhig/Dicht** als Density, kein Feature-Schalter |
| 16 Themes als Liste | **6 Grundstimmungen** + **Galerie** mit 10 weiteren |

### 4.3 Navigation

- **Rail links, 64 px**, vier Moden + Suche (`Strg/Cmd+K`). Labels erscheinen bei Hover und Fokus.
- **Jetzt-Leiste unten**, 72 px: Cover, Titel, Transport, Fortschritt, Lautstärke, Bühne, Strom.
- **Ablage rechts** (Drawer, 360 px): Strom, Songtext, Credits, „Warum das?". Kein Modal.
- **Zurück** gibt es nur innerhalb eines Modus (z. B. Künstler → Album → Titel).
- **Tiefe statt Breite:** Ein Klick öffnet einen Titel in der Bühne, nicht in einer neuen Liste.

---

## 5. Die Zonen im Detail

### 5.1 Bühne (Hören)

Die Bühne ist der Standard, sobald etwas läuft. Sie ist kein Vollbild-Player, sondern
die ruhige Mitte der App.

- **Raumlicht:** Zwei Farben aus dem Cover färben den Hintergrund (langsam, 8–12 s Übergang).
  Abschaltbar; bei `prefers-reduced-motion` statisch.
- **Inhalt:** Cover (groß, aber nicht dominierend), Titel, Artist, Album, Herkunft
  („Lokal", „Vorschau", „Plugin", „Radio"), Dauer, Qualitäts-/Besitz-Badge.
- **Drei Ebenen:** Songtext · Visualizer · Strom. Immer nur eine groß, die anderen als Reiter.
- **„Warum das?"** zeigt Quelle, Lizenz, Credit und — bei Rezepten — die erfüllte Regel.
- **Nächste drei Titel** als Horizont, direkt greifbar und verschiebbar.
- **Vollbild** bleibt ein eigener Zustand (F11), kein zweiter Player.

**Interaktion:** `Leertaste` überall Play/Pause. `J` springt zur Bühne. `S` öffnet den Strom.
Ein Doppelklick auf das Cover öffnet die Credits, kein Kontextmenü-Friedhof.

### 5.2 Strom (die eine Warteschlange)

Der Strom ist das Herz. Alles mündet hier: Playlists, Rezepte, Wellen, Songwünsche,
„Als Nächstes", Autoplay.

- **Eine Liste, viele Herkünfte.** Jeder Eintrag trägt eine Marke: `Playlist`, `Rezept`,
  `Wunsch`, `Radio`, `Autoplay`, `manuell`.
- **Horizont:** Die nächsten fünf Titel sind sichtbar, der Rest ist ein ruhiger Verlauf.
- **Weiche am Ende:** Was passiert, wenn der Strom endet? Drei Optionen: *Stopp* (Standard),
  *Rezept weiter* (mit sichtbarer Regel), *Welle fortsetzen*. Kein heimliches Endlos-Autoplay.
- **Mischen** mischt nur den Schwanz, nie den laufenden Titel — das bleibt.
- **Wünsche** stehen vorn, sind aber sichtbar markiert und einzeln entfernbar.
- **Persistenz:** Der Strom überlebt den Neustart, mit klarer Frage beim ersten Start
  („Weiterhören?"), nicht automatisch.

### 5.3 Rezepte (das neue Sammlungsmodell)

Ein Rezept ist eine **Regel**, keine Liste. Es gibt zwei Zustände:

1. **Live** — wird bei jedem Öffnen neu ausgewertet (Standard).
2. **Gebacken** — eine Momentaufnahme, die bearbeitet werden kann (wie eine Playlist heute).

**Regelmodell (Vorschlag):**

```js
{
  name: "Späte Stunden",
  rules: {
    sources: ["favorites", "local", "history", "charts"], // Mehrfachauswahl
    moods: ["chill", "melancholisch"],
    bpm: [60, 100],
    streamSafe: false,          // nur NCS/CC0/CC BY/Plugin-CC
    withCredit: false,          // nur Titel mit Lizenz/Credit
    notPlayedDays: 14,          // seit X Tagen nicht gehört
    excludeDislikes: true,
    excludeRequests: true,
    limit: 40
  },
  refresh: "onOpen",            // onOpen | manual | daily
  updatedAt: "2026-11-23T12:00:00Z"
}
```

- **Vorschau vor dem Anlegen:** „38 Titel passen — 12 davon stream-sicher."
- **Kein Netzwerk:** Rezepte arbeiten nur mit vorhandenen Einträgen (Sammlung, Verlauf,
  lokale Dateien, bereits geladene Charts/Vorschläge). Sie lösen keine neuen Suchen aus.
- **System-Rezepte:** Die bisherigen Mixes (Täglich, Frisch, Entdecken, Nochmal, Tief)
  und Vorlagen (Gaming, Chill, Episch …) werden zu schreibgeschützten System-Rezepten.
  „Duplizieren" macht daraus ein eigenes Rezept.
- **Sicherheit:** Duplikatfrei, Dislikes ausgeschlossen, maximal N Titel, Reihenfolge
  deterministisch je Tag (Seed), damit ein Rezept nicht bei jedem Öffnen springt.

Damit wird die ohnehin geplante **Smart-Playlist** zum ersten Baustein — nicht zu einem
weiteren Sonderfall.

### 5.4 Fenster (begrenzte Entdeckung)

Das Fenster ist die bewusste Gegenidee zum Feed.

- **12 Karten pro Tag**, danach ist Schluss. Kein Nachladen, kein „mehr davon".
- **Jede Karte erklärt sich:** „Weil du X hörst", „Neu im Genre Y", „Chart-Platz 14".
- **Wochenrhythmus:** Montags neue Auswahl, nicht stündlich.
- **Wellen:** Eine Welle ist eine Radio-Session mit Ziel (60–90 min), Seed-Künstlern und
  Stimmung. Sie endet hörbar. „Neue Welle" ist eine bewusste Handlung.
- **Charts** bleiben, aber als Kontext („Was gerade draußen läuft"), nicht als Startseite.

### 5.5 Regal (Sammlung)

- **Ein Index** über lokale Dateien, Katalog-Vorschauen und Plugin-Quellen.
- **Besitzstatus** ist sichtbar: `Lokal` · `Vorschau` · `Stream` · `Radio`.
- **Facetten:** Genre, Stimmung, BPM, Quelle, Lizenz, zuletzt gehört, Dauer.
- **Suche** ist die Kommandozentrale: Titel, Artist, Album, Aktion („spiele", „reihe ein",
  „öffne Künstler", „füge zu Rezept"). `Strg/Cmd+K` öffnet sie überall.
- **Favoriten** sind ein Filter, kein eigener Ort. **Chronik** (Rückblick) liegt bei Hören.
- **Duplikate** werden zusammengeführt, aber nie gelöscht — nur gruppiert.

### 5.6 Studio (Bauen)

- **Projekt statt Einzeldatei:** Eine nicht-destruktive Timeline mit mehreren Clips,
  Übergängen und einer Credit-Spur.
- **Werkzeuge:** Waveform, Schnittmarken, BPM/Key (Batch), Fades, Normalisierung, Loop,
  Stream-sicher-Prüfung.
- **Export:** Presets (WAV, MP3, M4A), Zielordner, automatische Credit-.txt mit
  Lizenz, Quelle und Änderungen.
- **Downloads** sind ein Ausgang des Studios, keine eigene Welt: „Nur Cutting"
  bleibt die Regel, mit Ordner, Lizenz und Credit.
- **Chronik** (vormals Rückblick) wandert zu Hören: Monatsstatistik, Top-Artists,
  Teilen als Bild — ohne Cover, wie bisher.

### 5.7 Verbinden (Betrieb)

- **Plugins:** Karten mit klaren Fähigkeiten, Status und Berechtigungen.
- **Ausgänge:** OBS-Overlay, OBS-Visualizer, Streamer.bot, Discord, Fernbedienung,
  Mini-Player. Jeder Ausgang zeigt: an/aus, Adresse, letzter Fehler.
- **Backup:** JSON-Export/Import, wöchentlich optional, maximal fünf eigene Dateien.
- **Updates:** ruhig, mit Notizen und „Später", nie mit Countdown.

---

## 6. Designsprache

### 6.1 Haltung

**Warm, ruhig, körperlich.** Kein Neon-Dashboard, keine Glas-Effekte als Selbstzweck.
Der Raum reagiert auf Musik, aber die Musik bleibt die Hauptsache.

Drei Bewegungsregeln:

1. **Direkt:** Eine Aktion beginnt sofort, ohne Inszenierung (80–120 ms).
2. **Körperlich:** Dinge haben Gewicht — kein Gummiband, keine Überfederung.
3. **Leise:** Bewegung erklärt, sie unterhält nicht. Bei `prefers-reduced-motion` fast nichts.

### 6.2 Tokens

| Kategorie | Regel |
| --- | --- |
| Farbe | Rollen statt Hex: `bg`, `surface`, `surface-2`, `text`, `muted`, `accent`, `accent-2`, `danger`, `ok`, `warn`, `on-accent`. Alle Themes füllen dieselben Rollen. |
| Abstand | 4-px-Basis: 4, 8, 12, 16, 24, 32, 48, 64. Keine Zwischenwerte. |
| Radius | 6 (klein), 10 (Karte), 16 (Fläche), 999 (Pille). |
| Typografie | System-Stack für Text, eine Display-Schrift für Titel (lokal gebündelt, kein CDN). Skala: 12, 14, 16, 20, 28, 40, 56. |
| Elevation | Zwei Stufen: `raised` (Karte) und `overlay` (Blatt). Keine Schattenkaskade. |
| Icons | Eine Familie, 1,5 px Strich, 20/24 px. |
| Fokus | 2-px-Ring in `accent`, immer sichtbar, nie nur Farbe. |

### 6.3 Themes

- **6 Grundstimmungen:** Nacht, Tag, Papier, Mitternacht, Wald, Meer.
- **Galerie:** die übrigen 10 als bewusste Auswahl, nicht als Liste.
- **Raumlicht:** Cover-Farben fließen in `accent` und Hintergrund, aber nur zu 12–18 % —
  die Lesbarkeit gewinnt immer.
- **Kontrast:** WCAG AA für Text, AAA für Fließtext, wo möglich. Jedes Theme wird
  automatisch auf Kontrast geprüft (Test, nicht Augenmaß).

### 6.4 Density

- **Ruhig** (Standard): große Zeilen, 56 px, weniger Metadaten.
- **Dicht:** 36-px-Zeilen, mehr Spalten, für große Bibliotheken.
- Density ist eine Darstellungsoption, kein Feature-Schalter. „Erweitert" verschwindet
  als Begriff — Profi-Funktionen sind einfach da, wenn man sie öffnet.

---

## 7. Architektur

### 7.1 Prinzip: Strangler, kein Neuschreiben

Ein Big-Bang-Rewrite würde Nutzerdaten, Plugins und die Testbasis riskieren. Stattdessen
wird der Monolith von außen nach innen ersetzt: neue Module übernehmen je einen Bereich,
die alte Oberfläche bleibt funktionsfähig, bis der neue Weg grün ist.

### 7.2 Zielstruktur Renderer

```
renderer/
  core/        store.js  events.js  persist.js  migrations.js  format.js
  audio/       engine.js  queue.js  crossfade.js  silence.js  output.js
  data/        catalog.js  library.js  radio.js  lyrics.js  recipes.js
  features/    stage/  browse/  studio/  connect/  search/
  ui/          components/  tokens.css  motion.css  a11y.css
  app.js       nur noch Bootstrap + Verdrahtung (< 800 Zeilen)
```

Regeln:

- **Eine Richtung:** `features` → `core`/`audio`/`data` → `ui`. Niemals zurück.
- **Keine versteckten Globals.** Ein Store, klar benannte Actions, Selektoren.
- **Reine Logik ist testbar.** Queue, Rezepte, Stille-Entscheidung, Crossfade-Faktor,
  Migrationen sind Funktionen ohne DOM.
- **Persistenz versioniert.** `cleanmusic.schema.v1` plus `migrations.js`; jede Migration
  ist idempotent und schreibt vorher eine Sicherung.

### 7.3 Zielstruktur Hauptprozess

```
main/
  window.js    ipc.js    updates.js    plugins.js
  downloads.js remote.js  discord.js    smoke.js
main.js        Bootstrap + Registrierung
```

### 7.4 Plugin-API v3 (Vorschlag)

Die heutige API v2 ist mächtig, aber implizit: Ein Plugin läuft mit vollem Node-Zugriff.
Für 2.0:

- **Manifest mit Fähigkeiten:** `player`, `library:read`, `network:allowlist`, `fs:folder`,
  `ui:panel`, `ui:settings`, `visualizer`, `downloads:cc-only`.
- **Berechtigungen beim Aktivieren** sichtbar machen („Dieses Plugin darf: Netzwerk zu
  api.example.com, Player steuern").
- **Dynamische Optionslisten** (für Streamer.bot-Action-Auswahl) und **UI-Slots**
  (Bühnen-Panel, Einstellungs-Abschnitt, Kontextmenü).
- **Kompatibilität:** v2-Plugins laufen weiter, mit Hinweis und ohne neue Fähigkeiten.
- **Kein Remote-Code, keine automatische Aktivierung** — bleibt Gesetz.

### 7.5 Tests und Budgets

| Ebene | Inhalt |
| --- | --- |
| Unit | Queue, Rezepte, Migrationen, Stille, Crossfade, Parser |
| Contract | bestehende Smoke-Suiten (smoke, obs, visualizer, streamerbot, mobile, update) |
| Visuell | Screenshots je Modus × 6 Grundthemes × 2 Densities; Kontrastprüfung |
| Hand | 5 Personen, 30 Minuten, echte Bibliothek |

**Budgets:** Start < 1,5 s bis interaktiv · Moduswechsel < 100 ms · Visualizer 60 fps ·
Leerlauf < 250 MB · keine Layout-Sprünge (CLS) · Tastatur vollständig bedienbar.

---

## 8. Daten und Datenschutz

- **Lokal zuerst.** `%APPDATA%\CleanMusic` bleibt die einzige Quelle der Wahrheit.
- **Kein Konto, keine Cloud, keine Telemetrie.** Ein optionaler „Gesundheitsbericht"
  bleibt lokal und wird nur auf Klick exportiert.
- **Export ist ein Versprechen:** Sammlung, Rezepte, Playlists, Verlauf und Einstellungen
  als offenes JSON — lesbar, versioniert, wieder importierbar.
- **Migrationen sind heilig:** Vor jeder Schema-Änderung `.bak`, danach Prüfsumme;
  bei Fehler startet die App mit der Sicherung und erklärt es.
- **Löschen ist endgültig und sichtbar.** Kein Papierkorb, der heimlich wieder auftaucht.

---

## 9. Rechtliche Leitplanken (unverändert)

- Kein DRM-Bypass, kein Download aus Streams, keine Werbeblocker.
- Downloads nur „Nur Cutting" (CC0, CC BY, PD) und – getrennt – was der Nutzer in
  offiziellen Creator-Web-Apps selbst startet; YouTube nur mit Plugin und
  bestätigter CC-Lizenz.
- Kein yt-dlp im App-Code; Quellenspezifisches bleibt im Plugin.
- Plugins nie automatisch laden; Aktivierung mit Rückfrage.
- Nutzerdaten nie anfassen ohne Migration und Sicherung.

---

## 10. Release-Weg

Jede Stufe ist auslieferbar. Keine Stufe bricht die vorherige.

| Version | Name | Inhalt | Größe | Fertig, wenn |
| --- | --- | --- | --- | --- |
| **1.19** | Fundament | Module extrahieren, Tokens, Store, Unit-Tests, keine sichtbare Änderung | M | Alle Smoke-Suiten grün, app.js < 6.000 Zeilen |
| **1.20** | Raum | Rail, Jetzt-Leiste, Bühne, Strom, 4 Modi (hinter Flag), Schaltraum | L | Tägliche Nutzung ohne Altpfade möglich |
| **1.21** | Rezepte | Rezept-Engine, Live/Gebacken, System-Rezepte, Fenster, Wellen | M | Smart-Playlist-Plan geht darin auf |
| **1.22** | Studio | Timeline, Projekte, Batch-BPM, Export-Presets, Stream-sicher-Prüfung | L | Ein Projekt von Import bis Credit exportierbar |
| **2.0** | Der Raum | Plugin-API v3, Mobile-Parität, Feinschliff, Doku, Migration | L | 5 Nutzer bestehen den Handtest |

**Realistische Einordnung:** Allein und nebenbei sind das **4–6 Monate**. Wenn es schneller
gehen soll, ist der ehrliche Schnitt: **1.19 + 1.20 + 1.21** (Raum + Rezepte) — das
verändert das Erlebnis bereits vollständig, ohne das Studio anzufassen.

---

## 11. Risiken

| Risiko | Wirkung | Gegenmittel |
| --- | --- | --- |
| Scope-Kriechen | 2.0 wird nie fertig | Jede Stufe hat ein Exit-Kriterium; Studio darf warten |
| Datenverlust bei Migration | Vertrauen zerstört | `.bak`, Idempotenz, Test mit echten Profilen |
| Plugin-Bruch | Streamer/OBS-Nutzer verlieren Funktion | v2 weiter unterstützen, Fähigkeiten additiv |
| Performance-Regression | App fühlt sich schwerer an | Budgets im Smoke, Modul-Lazy-Loading |
| Theme-/Kontrastfehler | Unlesbarkeit | Automatische Kontrastprüfung je Theme |
| Motivation | Projekt stirbt | Kleine Releases, sichtbare Verbesserung ab 1.20 |

---

## 12. Erfolg (ohne Telemetrie)

- **Handtest:** 5 Personen finden in 30 s ihren letzten Titel, starten eine Welle und
  legen ein Rezept an — ohne Erklärung.
- **Alltag:** Eine Woche ohne Rückfall in die alte Ansichten-Struktur.
- **Stabilität:** 0 Abstürze in den Smoke-Suiten, Update-Quote über GitHub-Downloads
  (aggregiert, nicht personenbezogen).
- **Klarheit:** Die App lässt sich in einem Satz erklären: *„Dein Musikraum — lokal,
  ehrlich, ohne Feed."*

---

## 13. Nicht-Ziele

- Kein Streamingdienst, keine Konten, keine Cloud-Synchronisierung.
- Kein Social-Feed, keine Likes als Währung, keine Reichweitenlogik.
- Kein DRM-Bypass, keine Downloads aus Streams, kein „alles"-Modus.
- Keine KI-Empfehlungen, die Daten nach außen schicken.
- Kein Rewrite von Mobile in 2.0 — Parität ja, Neuentwicklung nein.
- Keine neue Programmiersprache, kein Wechsel weg von Electron.

---

## 14. Offene Entscheidungen

1. **Wie radikal?** Nur Oberfläche (1.20) oder auch Studio (1.22)? Empfehlung: Raum + Rezepte zuerst.
2. **Name:** Bleibt „CleanMusic"? Untertitel „Der Raum" oder „Dein Musikraum"?
3. **Bühne als Standard?** Startet die App künftig in der Bühne oder im Regal?
4. **Plugin-Sandbox:** Fähigkeiten nur deklarieren (einfach) oder erzwingen (sicher, aufwendig)?
5. **Mobile:** 2.0 mit voller Parität oder TV Lite weiter separat?

---

## 15. Die ersten drei Schritte

**Stand:** Schritt 1 (Rezepte v0) ist mit CleanMusic 1.19.0 veröffentlicht –
siehe [`PLAN-SMART-PLAYLISTS.md`](PLAN-SMART-PLAYLISTS.md). Schritt 2 hat
begonnen: `renderer/core/text.js` ist der erste ausgelagerte, mit Node getestete
Baustein. Der Raum-Prototyp (Schritt 3) ist noch offen.

1. **Rezepte v0 im heutigen UI bauen.** Die geplante Smart-Playlist wird als
   `playlist.smart` umgesetzt — mit Regel-Engine, Vorschau und „Aktualisieren".
   Das ist der Kern von 1.21 und sofort nützlich.
2. **Fundament schneiden.** `audio/queue.js`, `core/store.js`, `core/persist.js` aus
   `app.js` lösen, mit Unit-Tests absichern. Keine sichtbare Änderung, volle Suiten grün.
3. **Raum-Prototyp.** Rail + Jetzt-Leiste + Bühne als statisches HTML mit Tokens,
   hinter einem Flag. Erst wenn er sich richtig anfühlt, wird der Rest umgebaut.

---

*Dieses Dokument ist ein Vorschlag, kein Gesetz. Es soll den größten Hebel beschreiben,
nicht jede Schraube. Alles, was hier steht, darf verworfen werden — außer den Leitplanken
in Abschnitt 9.*
