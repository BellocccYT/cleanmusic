# Vorschau-Harness

Nur für Entwicklung und Store-Screenshots. **Nicht Teil des Store-ZIPs** – das wird aus
`../cleanmusic-youtube/` gebaut, dieser Ordner liegt bewusst daneben.

## Was es macht

- `chrome-stub.js` beantwortet die Chrome-Aufrufe von Popup und Einstellungen mit
  Beispieldaten (Video-ID `dQw4w9WgXcQ`, Titel, Kanal, Playlist-Flag, drei Kürzel).
- `build.js` kopiert die Erweiterung nach `build/` und hängt den Stub vor `shared.js`.
  Die echten Dateien werden nie verändert. Für Offline-Vorschauen wird außerdem
  `CMX.thumbnailUrl` auf das mitgelieferte `sample-thumb.jpg` umgebogen.
- `shot-*.html` sind fertige 1280 × 800-Kompositionen mit Überschrift, Nutzen-Argumenten
  und der echten Oberfläche im Browser-Rahmen.
- `shoot.js` rendert daraus die fertigen PNGs in `../store-assets/`.

## Ansehen

```powershell
node extras/browser-extension/preview/build.js
node extras/browser-extension/preview/serve.js
```

Dann <http://127.0.0.1:8790/preview/index.html> öffnen.

## Screenshots erzeugen

```powershell
# Server läuft im zweiten Terminal
node extras/browser-extension/preview/shoot.js
node extras/browser-extension/preview/promo.js
```

Ergebnis: `../store-assets/02-popup-1280x800.png`, `03-einstellungen-…`,
`04-einrichtung-…`, `05-uebergabe-…` sowie die beiden Werbekacheln
`promo-klein-440x280.png` und `promo-gross-1400x560.png`.

Warum zwei Durchläufe: Chromium liefert bei `capturePage()` keine Bilder, die in einem
`iframe` liegen. `shoot.js` fotografiert deshalb zuerst die echte Seite in ihrer Größe ab
und setzt dieses Bild in einem zweiten Durchlauf in die 1280 × 800-Komposition ein.
Das Fenster ist dabei auf Deckkraft 0 – sichtbar wird nichts.

Die beiden YouTube-Motive (`01-youtube-knopf`, `06-rechtsklick`) lassen sich so nicht
erzeugen: Sie zeigen echte YouTube-Oberfläche und werden von Hand aufgenommen. Details
stehen in `../cleanmusic-youtube/STORE.md`.

## Wenn sich die Oberfläche ändert

`build.js` und danach `shoot.js` neu laufen lassen. Nur wenn eine Seite andere Maße
braucht, die `width`/`height`-Werte in der jeweiligen `shot-*.html` und in `shoot.js`
anpassen.
