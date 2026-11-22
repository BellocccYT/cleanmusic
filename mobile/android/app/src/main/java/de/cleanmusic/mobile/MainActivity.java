package de.cleanmusic.mobile;

import android.os.Bundle;
import android.webkit.ValueCallback;

import com.getcapacitor.BridgeActivity;

/**
 * Einstiegspunkt für Handy, Tablet, Android TV, Google TV und Fire TV.
 * Dieselbe APK, dieselbe Activity – die Oberfläche entscheidet sich beim
 * Start (boot.js) anhand von DeviceInfo.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundAudioPlugin.class);
        registerPlugin(DeviceInfoPlugin.class);
        registerPlugin(MediaLibraryPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(RemoteServerPlugin.class);
        registerPlugin(AppLinksPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Zurück-Taste: erst Overlays/Ansichten schließen, erst dann die App.
     * Die Web-Oberfläche entscheidet (window.CMBack), ob sie die Taste
     * verbraucht hat.
     */
    @Override
    public void onBackPressed() {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript(
                    "(function(){try{return Boolean(window.CMBack && window.CMBack());}catch(e){return false;}})()",
                    new ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            if (!"true".equals(value)) MainActivity.super.onBackPressed();
                        }
                    });
            return;
        }
        super.onBackPressed();
    }
}
