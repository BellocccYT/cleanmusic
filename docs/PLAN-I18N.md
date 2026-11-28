# Englisch-Option – Fahrplan

Stand: Welle 1 und 2 gebaut, dazu ein großer Teil von Welle 3 (Einstellungen
Wiedergabe/Klang/Verbindungen/System, Songtext-Einstellungen, Effekt-Menü und
„Warum läuft das?“). Deutsch bleibt Quellsprache und ist immer vollständig;
Englisch fällt je Schlüssel auf Deutsch zurück. 723 Schlüssel, `SMOKE_I18N` läuft
alle neun Hauptansichten auf Englisch ab und prüft Wiedergabe-, Darstellung-
und System-Tab.

## Was steht (Welle 1 + 2)

| Baustein | Ort |
|---|---|
| Modul | `renderer/core/i18n.js` → `window.CMI18n` (`t`, `has`, `setLang`, `lang`, `locale`, `applyStatic`, `number`, `date`, `missingKeys`) |
| Kataloge | `renderer/i18n/de.js`, `renderer/i18n/en.js` → `window.CM_I18N_CATALOGS` |
| Einstellung | `settings.language` (`de`/`en`, Standard `de`) in `renderer/core/state.js` |
| Schalter | Einstellungen → System, Panel `#language-panel` (`#opt-language`, „Jetzt neu starten“) |
| Übersetzt | Seitenleiste, Player-Leiste, Vollbild, Dialoge, Ladeanzeige, Einstellungs-Kopf/Tabs, Startseite, Suche, Favoriten, Playlists (inkl. Regeln, Erweitern, Sortieren, Teilen), Vorlagen, Mixes, Radio, lokale Musik, Künstlerseite, Warteschlange, Downloads, Playlist-Import, Songtext-Werkzeuge, Einstellungen Wiedergabe/Klang/Verbindungen/System (inkl. Equalizer, Übergänge, Fernbedienung, MusicKit), „Warum läuft das?“, Effekt-Menü mit Kategorien und allen 27 Effekt-Namen |
| Daten mit Englisch | `services.js` `noteEn`, `core/mixes.js` `titleEn`/`subtitleEn`/`descEn`, `LOCAL_MOODS` `labelEn`, `core/recipes.js` `labelOf`/`helpOf` |
| Tests | `test/i18n.test.js` (Parität, Fallback, benutzte Schlüssel), Smoke `SMOKE_I18N` (9 Ansichten) |

Regeln:

- Jeder neue Schlüssel kommt in **beide** Kataloge. `test/i18n.test.js` prüft die
  Parität, sonst schlägt `npm run test:unit` fehl.
- Statische Texte in HTML: `data-i18n`, `data-i18n-title`, `data-i18n-placeholder`,
  `data-i18n-aria-label`. Nur diese Elemente werden von `applyStatic()` angefasst.
- Dynamische Ansichten rufen `t('…', { platzhalter })` direkt beim Rendern.
- Sortierungen nutzen `CMI18n.locale()`, nie hart `'de'`.
- Ein fehlender Schlüssel erscheint nie als `nav.home` im UI: `t()` fällt auf Deutsch
  zurück, `applyStatic()` lässt den vorhandenen Text stehen. Beides landet in
  `missingKeys()` – der Smoke prüft, dass die Liste leer ist.

## Welle 2 – Inhalte (erledigt)

Erledigt: Startseite, Suche, Favoriten, Playlists samt Regeln/Erweitern/Sortieren/
Teilen, Vorlagen, Mixes, Radio, lokale Musik, Künstlerseite, Warteschlange,
Downloads-Ansicht, Playlist-Import-Dialog und Songtext-Werkzeuge.

Vorgehen je Ansicht war: Strings sammeln → Schlüssel nach Bereich (`home.*`,
`search.*`, …) → Katalog ergänzen → `t()` einsetzen → Smoke-Prüfung.

## Welle 3 – Werkzeuge und Dialoge

Erledigt:

- „Warum läuft das?“ (`whyCurrent`, `whyOrigin`) samt Herkunft, Lizenz,
  Stream-sicher, Rezept, Aktionen und Toasts.
- Songtext-Einstellungen (Größe, Effekt, Ausrichtung, Versatz, Mitscrollen,
  Abdunkeln, Großansicht, Kino-Herz).
- Effekt-Menü: Titel/Hinweis, Kategorien-Chips, Gruppen (neue Felder `labelEn`/
  `hintEn` in `CMLyricVideo.PICKER_GROUPS`), „Einfach“, „Weitere“, Supporter-Herz
  und alle Effekt-Namen (`FX_LABELS_EN` ist jetzt vollständig, 27 Einträge).
- Einstellungen: Wiedergabe, Klang (inkl. 10-Band-EQ und Übergänge),
  Verbindungen (Fernbedienung, MusicKit), System (Start, Tray, Taskleiste,
  Diagnose) und Darstellung (Themes, Ansicht, Hintergründe, Visualizer,
  Leistungsstufen) sind vollständig übersetzt. Hintergrund- und
  Leistungsprofile tragen `labelEn`/`hintEn`.

Offen:

1. Cutter-Modus und Studio (Kategorienamen in `creator-data.js` bleiben Eigennamen,
   Beschreibungen brauchen `…En`-Felder).
2. Plugins-Karten, Plugin-Panels auf der Startseite, Plugin-Einstellungen.
3. Social: Freunde-Ansicht, Karten, Anfragen, Gruppen, Räume, Meldungen.
4. Onboarding, „Neu in dieser Version“, Tastenkürzel-Übersicht, Support-Dialoge.
5. Schlaf-Timer, Lautstärke-/Layout-/Backup-Toasts.
6. Discord-Panel (Verbindungen) und Plugin-Karten.
7. Update-Karte/-Status und Downloads-Panel.

## Welle 4 – außerhalb des Renderers

- `main.js`: Systemdialoge, Tray-Menü, Benachrichtigungen, Update-Texte. Der
  Hauptprozess kennt die Sprache nur über `cleanmusic-config.json` → beim
  Sprachwechsel mitschreiben oder per IPC abfragen.
- Mini-Player (`renderer/mini.js`), Handy-Fernbedienung (`renderer/remote/`).
- Mobile/TV: `mobile/src/*` (TV Lite bleibt vorerst deutsch).
- Website/Changelog und Chrome-Erweiterung: eigene Entscheidung, unabhängig von der App.

## Offen

- **Sofort umschalten** ohne Neustart: braucht ein Neu-Rendern aller Ansichten
  (`showView`-Pfad) und ist bewusst nicht Teil von Welle 1. Heute: Hinweis + Knopf
  „Jetzt neu starten“ (lädt den Renderer neu, Wiedergabe stoppt).
- **Systemsprache automatisch übernehmen**: `navigator.language` in `init()` als
  Startwert, sobald `settings.language` noch nie gesetzt wurde.
- **Zahlen/Datum**: `number()`/`date()` liegen bereit, werden aber noch kaum genutzt.
- **Inhalte bleiben deutsch**: Vorlagen-Titel/-Beschreibungen (`playlist-presets.js`),
  Cutter-Kategorien (`creator-data.js`) und Plugin-Texte sind Daten, keine
  Oberfläche. Bei Bedarf eigene `…En`-Felder ergänzen (wie bei `services.js`).
- **Effekt-Namen**: `FX_LABELS_EN` in `app.js` deckt Werkzeugleiste, Einstellungen
  und Effekt-Menü vollständig ab; die Gruppenlabels liefert `PICKER_GROUPS` mit
  `labelEn`/`hintEn`.
- **Übersetzungsqualität**: Begriffe wie „Cutter-Modus“, „Rückblick“, „Mix“ sind
  bewusst als Markenbegriffe übersetzt („Cutter mode“, „Your recap“, „Mix“); bei
  Bedarf in `docs/` festhalten und konsistent halten.
