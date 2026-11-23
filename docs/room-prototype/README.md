# Raum-Prototyp

Vorschau der künftigen CleanMusic-Oberfläche aus
[`docs/CONCEPT-2.0.md`](../CONCEPT-2.0.md). Der Prototyp ist bewusst
eigenständig: keine Wiedergabe, keine Netzwerkabfragen, keine Nutzerdaten.
Er ist **nicht Teil der App** und wird nicht mit ausgeliefert.

## Öffnen

- Direkt im Browser: `docs/room-prototype/index.html` öffnen. Über
  `?theme=tag` oder `?theme=nord` lässt sich die Stimmung vorwählen. (Die
  Datei lädt `renderer/themes.js`; deshalb braucht sie den Repo-Kontext.)
- Tastatur: `1`–`4` wechselt Hören/Stöbern/Bauen/Verbinden, `Leertaste`
  Play/Pause, `Q` öffnet den Strom, `T` wechselt das Theme, `←`/`→` den Titel.

## Was hier getestet wird

- **Rail** mit vier Modi statt 13 Ansichten.
- **Bühne** mit Cover-Licht, Herkunft, „Warum das?“ und den nächsten Titeln.
- **Strom** als eine Warteschlange mit Herkunft und sichtbarem Horizont.
- **Rezepte** als Karten mit Regel-Chips (Smart-Playlists von 1.19.0).
- **Studio** als nicht-destruktive Timeline mit Credit-Hinweis.
- **Verbinden** als ruhige Statusseite für OBS, Streamer.bot, Discord und Fernbedienung.
- **Jetzt-Leiste** als dauerhafter Anker, die zur Bühne werden kann.

## Grenzen

- Beispieldaten, keine echte Bibliothek.
- Kein Audio; Play/Pause ist nur ein Zustand.
- Keine Persistenz; ein Neuladen setzt alles zurück.
- Noch keine Verbindung zu `app.js`, absichtlich.
- **Entscheidung:** Die bestehende Oberfläche bleibt. Der Prototyp dient nur
  als Design-Notiz; einzelne Ideen können später übernommen werden.
