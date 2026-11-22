package de.cleanmusic.mobile;

import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Erkennt, ob die App auf einem Fernseher läuft (Android TV, Google TV,
 * Fire TV). Dieselbe APK startet dann die schlanke TV-Oberfläche.
 */
@CapacitorPlugin(name = "DeviceInfo")
public class DeviceInfoPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        UiModeManager manager =
                (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        boolean television =
                manager != null
                        && manager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;

        // Fire TV meldet sich nicht immer als TELEVISION, hat aber keine
        // Touch-Oberfläche und ist ein Amazon-Gerät.
        boolean fireTv =
                Build.MANUFACTURER != null
                        && Build.MANUFACTURER.toLowerCase().contains("amazon")
                        && !getContext().getPackageManager()
                                .hasSystemFeature("android.hardware.touchscreen");

        JSObject result = new JSObject();
        result.put("tv", television || fireTv);
        result.put("mode", television ? "television" : fireTv ? "firetv" : "mobile");
        result.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        result.put("model", Build.MODEL == null ? "" : Build.MODEL);
        result.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(result);
    }
}
