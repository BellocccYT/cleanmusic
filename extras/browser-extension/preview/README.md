# Vorschau-Harness

Nur für Entwicklung und Store-Screenshots. **Nicht Teil des Store-ZIPs** – das wird aus
`../cleanmusic-youtube/` gebaut, dieser Ordner liegt bewusst daneben.

## Was es macht

- `chrome-stub.js` beantwortet die Chrome-Aufrufe von Popup und Einstellungen mit
  Beispieldaten (Video-ID `dQw4w9WgXcQ`, Titel, Kanal, Playlist-Flag, drei Kürzel).
- `build.js` kopiert die Erweiterung nach `build/` und hängt den Stub vor `shared.js`.
  Die echten Dateien werden nie verändert.
- `shot-*.html` sind fertige 1280 × 800-Kompositionen mit Überschrift, Nutzen-Argumenten
  und der echten Oberfläche im Browser-Rahmen.

## Benutzen

```powershell
node extras/browser-extension/preview/build.js
node extras/browser-extension/preview/serve.js
```

Dann <http://127.0.0.1:8790/preview/index.html> öffnen.

## Screenshots aufnehmen

1. Server starten, `shot-*.html` öffnen.
2. Fenster auf 1280 × 800 bringen (oder Full-Page-Screenshot).
3. Als PNG speichern.

Fertig abgelegt liegen die Bilder in `../store-assets/`:

| Datei | Inhalt |
| --- | --- |
| `02-popup-1280x800.png` | Popup mit Beispielvideo |
| `03-einstellungen-1280x800.png` | Einstellungen |
| `04-einrichtung-1280x800.png` | Einrichtung ohne App |
| `05-uebergabe-1280x800.png` | Übergabeseite |

Die beiden YouTube-Motive (`01-youtube-knopf`, `06-rechtsklick`) müssen von Hand
aufgenommen werden – sie zeigen echte YouTube-Oberfläche. Details in `../cleanmusic-youtube/STORE.md`.

## Wenn sich die Oberfläche ändert

`build.js` neu laufen lassen reicht; die Shot-Seiten lesen nur `build/`. Nur wenn eine
Seite andere Maße braucht, die `width`/`height`-Werte in der jeweiligen `shot-*.html`
anpassen.
