package de.cleanmusic.mobile;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Kleine Brücke zwischen WebView und BackgroundAudioService.
 * Sie überträgt nur Titel/Status und leitet Sperrbildschirm-Tasten weiter.
 */
@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    private static boolean notificationPermissionAsked = false;

    @Override
    public void load() {
        BackgroundAudioService.listener =
                new BackgroundAudioService.Listener() {
                    @Override
                    public void onAction(String action, long position) {
                        JSObject data = new JSObject();
                        data.put("action", action);
                        data.put("position", position);
                        notifyListeners("mediaAction", data);
                    }
                };
    }

    @PluginMethod
    public void start(PluginCall call) {
        requestNotificationPermissionOnce();
        pushState(call);
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        pushState(call);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundAudioService.class);
        try {
            getContext().stopService(intent);
        } catch (Exception ignored) {
            // Dienst war bereits beendet.
        }
        call.resolve();
    }

    private void pushState(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        String artwork = call.getString("artwork", "");
        Boolean playingValue = call.getBoolean("playing", false);
        Double positionValue = call.getDouble("position", 0.0);
        Double durationValue = call.getDouble("duration", 0.0);

        boolean playing = Boolean.TRUE.equals(playingValue);
        long position = Math.max(0, Math.round(positionValue == null ? 0 : positionValue));
        long duration = Math.max(0, Math.round(durationValue == null ? 0 : durationValue));

        Intent intent = new Intent(getContext(), BackgroundAudioService.class)
                .setAction(BackgroundAudioService.ACTION_UPDATE)
                .putExtra(BackgroundAudioService.EXTRA_TITLE, title == null ? "" : title)
                .putExtra(BackgroundAudioService.EXTRA_ARTIST, artist == null ? "" : artist)
                .putExtra(BackgroundAudioService.EXTRA_ALBUM, album == null ? "" : album)
                .putExtra(BackgroundAudioService.EXTRA_ARTWORK, artwork == null ? "" : artwork)
                .putExtra(BackgroundAudioService.EXTRA_PLAYING, playing)
                .putExtra(BackgroundAudioService.EXTRA_POSITION, position)
                .putExtra(BackgroundAudioService.EXTRA_DURATION, duration);

        BackgroundAudioService.push(getContext(), intent, playing);
    }

    private void requestNotificationPermissionOnce() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (notificationPermissionAsked) return;
        notificationPermissionAsked = true;

        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (getActivity() != null) {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[] {Manifest.permission.POST_NOTIFICATIONS},
                    7401);
        }
    }
}
