'use strict';

/**
 * CleanMusic Android – Geräteweiche.
 *
 * `index.html` in der APK ist nur eine winzige Hülle. Diese Datei entscheidet,
 * welche Oberfläche geladen wird:
 *
 *   Handy/Tablet  -> app.html  (renderer/Oberfläche + mobile/src/native.js)
 *   Fernseher     -> tv.html   (CleanMusic TV Lite, eigene schlanke Oberfläche)
 *
 * Auf dem Fernseher wird `app.js` gar nicht erst geladen. Cutter, Downloads,
 * Wellenform/BPM, Rückblick, Plugins, Playlist-Import, lokale Musik und die
 * Ansicht „Erweitert“ sind dort also nicht vorhanden – nicht nur ausgeblendet.
 *
 * Erkennung: nativer DeviceInfo-Plugin (UiModeManager). Fehlt er (Browser-
 * Vorschau, Smoke-Test), gilt `?device=tv` / `?device=phone` oder Handy.
 */

(function () {
  const DEVICE_KEY = 'cleanmusic.device.v1';
  const params = new URLSearchParams(location.search);
  const forced = String(params.get('device') || '').toLowerCase();

  function remember(value) {
    try {
      localStorage.setItem(DEVICE_KEY, value ? 'tv' : 'phone');
    } catch {
      /* Speicher gesperrt – Weiche funktioniert trotzdem */
    }
  }

  function route(tv) {
    remember(tv);
    document.documentElement.dataset.device = tv ? 'tv' : 'phone';
    const target = tv ? 'tv.html' : 'app.html';
    // replace(): die Hülle bleibt nicht in der History, Zurück-Taste führt
    // nicht auf eine leere Seite.
    location.replace(target + location.hash);
  }

  if (forced === 'tv' || forced === 'tv-lite') return route(true);
  if (forced === 'phone' || forced === 'mobile') return route(false);

  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const info = plugins.DeviceInfo;

  function fallback() {
    let stored = '';
    try {
      stored = localStorage.getItem(DEVICE_KEY) || '';
    } catch {
      stored = '';
    }
    route(stored === 'tv');
  }

  if (!info || typeof info.get !== 'function') return fallback();

  let done = false;
  const settle = (tv) => {
    if (done) return;
    done = true;
    route(Boolean(tv));
  };

  // Ein hängender Plugin-Aufruf darf den Start nicht blockieren.
  const timer = setTimeout(fallback, 1500);

  info
    .get()
    .then((result) => {
      clearTimeout(timer);
      settle(result && result.tv);
    })
    .catch(() => {
      clearTimeout(timer);
      fallback();
    });
})();
