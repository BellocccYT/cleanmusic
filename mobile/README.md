# CleanMusic für Android – Prototyp

Phase 1, Etappe 1 aus `docs/PLAN-1.12.md`: eine installierbare Debug-APK für Handy und
Tablet, mit Katalogsuche, Radio und Hintergrund-Wiedergabe. Die Oberfläche kommt aus
`renderer/`; die Desktop-Dateien (`main.js`, `preload.js`, `renderer/*`) bleiben
unverändert.

## APK aufs Handy

Fertige Datei:

```
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

1. APK per USB-Kabel, Cloud oder Messenger aufs Handy kopieren.
2. Auf dem Handy die Datei antippen.
3. Android fragt beim ersten Mal nach der Erlaubnis, unbekannte Apps zu installieren.
   Für den Dateimanager bzw. den Browser „Zulassen“ wählen.
4. Play Protect kann warnen (die App ist nur mit dem Debug-Schlüssel signiert):
   „Trotzdem installieren“ wählen.
5. Beim ersten Abspielen fragt Android nach **Benachrichtigungen**. Erlauben – sonst
   erscheint keine Steuerung auf dem Sperrbildschirm.

Die App heißt **CleanMusic**, Paket `de.cleanmusic.mobile`, Version `mobile-1.0.0`.

## Was du testen solltest

**Radio**

- App startet direkt im Radio-Bereich. Einen Sender antippen.
- Läuft der Stream? Titel und Sender erscheinen unten in der Player-Leiste?
- Genre-Chips und die Sendersuche probieren.
- Sender mit ♥ in die Favoriten legen, danach unter „Favoriten“ wiederfinden.

**Katalogsuche (30-Sekunden-Vorschauen)**

- Oben ins Suchfeld tippen, z. B. „Daft Punk“, Enter.
- Treffer von Apple Music und Deezer sollten erscheinen.
- Ersten Treffer antippen. Die Vorschau sollte nach kurzer Ladezeit spielen.
- Cover, Titel und Künstler sollten in der Player-Leiste und im Vollbild-Player
  erscheinen.
- Suche und Radio abwechseln; die Wiedergabe darf nicht hängen bleiben.

**Hintergrund-Wiedergabe (der wichtigste Test)**

1. Radio oder eine Vorschau starten.
2. Bildschirm sperren und 30–60 Sekunden warten.
3. Wieder entsperren: Läuft die Musik weiter?
4. Während der Sperre die Benachrichtigung öffnen: Titel, Künstler und Cover sichtbar?
5. In der Benachrichtigung Pause, Weiter und Zurück drücken. Reagiert die App?
6. Sperrbildschirm-Steuerung (Play/Pause, Zurück/Weiter, Fortschrittsbalken bei
   Vorschauen) testen.
7. Zu einer anderen App wechseln, z. B. Browser oder Karten. Musik läuft weiter?
8. Falls vorhanden: Kopfhörer-/Bluetooth-Tasten testen.

**Oberfläche**

- Hochkant und quer drehen; auf einem Tablet testen, falls vorhanden.
- Einstellungen → Theme, Hintergrund, Visualizer, EQ, Plattenspieler.
- Vollbild-Player öffnen (Knopf in der Player-Leiste).
- App aus der Übersicht wegwischen: Die Wiedergabe und die Benachrichtigung sollen
  aufhören (der WebView ist dann weg).

## Was dieser Prototyp absichtlich nicht kann

- Keine lokale Musik (Android-Medienbibliothek kommt später).
- Keine Plugins, kein Cutter-Modus, keine Downloads, kein yt-dlp.
- Keine eingebetteten Streaming-Web-Player. „Im Browser“ öffnet die offizielle Seite.
- Keine Künstlerseiten, keine Songtexte, kein Updater.
- Kein Release-Signierschlüssel, kein automatisches Update. Die Debug-APK ist nur zum
  Testen und lässt sich nicht über eine später mit anderem Schlüssel signierte Version
  installieren.

## Netzwerk und Regeln

`mobile/src/native.js` baut nur zwei Wege nach, beide über `CapacitorHttp` und mit
denselben Allowlists wie `main.js`:

| Zweck | Host und Pfad |
|---|---|
| Apple-Vorschauen | `https://itunes.apple.com/search` |
| Deezer-Vorschauen | `https://api.deezer.com/search` |
| Radio | `https://de1.api.radio-browser.info/json/stations/search` |

Andere Adressen lehnt die Brücke ab. Cover und Vorschau-Audios laufen direkt im
WebView (`https:`); Radio-Streams dürfen auch `http:` sein, deshalb erlaubt die App
Klartext-Verkehr ausschließlich für die Medienwiedergabe.

## Selbst bauen

Voraussetzungen:

- Node.js 22 oder neuer
- JDK 21 (Gradle 8.14 läuft nicht auf Java 25)
- Android SDK mit Plattform 36 und Build-Tools 36
- `ANDROID_HOME` gesetzt oder `mobile/android/local.properties` mit `sdk.dir=...`

```powershell
cd mobile
npm install
npm run build:apk
```

Das Skript macht drei Dinge:

1. `npm run build:web` kopiert `../renderer` nach `mobile/www` und setzt Mobile-Brücke,
   Mobile-CSS, Viewport und die angepasste CSP ein.
2. `cap sync android` kopiert `www` in das Android-Projekt.
3. Gradle baut die Debug-APK nach
   `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

`mobile/www` ist generiert. Änderungen an der Oberfläche gehören weiterhin in
`renderer/`; Mobile-spezifisches gehört nach `mobile/src/`.

## Signierung

Die Debug-APK wird von Gradle mit dem automatisch erzeugten Debug-Schlüssel signiert.
Der liegt unter `%USERPROFILE%\.android\debug.keystore` – **außerhalb** des Repos.

Für eine spätere Release-APK gilt: Den Signierschlüssel sicher außerhalb des Repos
aufbewahren, niemals committen. Ohne denselben Schlüssel sind keine Updates über eine
bereits installierte Version möglich. `mobile/.gitignore` schließt `*.jks`,
`*.keystore` und `keystore.properties` aus.
