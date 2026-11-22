package de.cleanmusic.mobile;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Öffnet Webseiten und die offiziellen Musik-Apps per Deep Link.
 *
 * Es werden keine Web-Player eingebettet und keine Streams abgegriffen:
 * CleanMusic übergibt nur Titel/Künstler an die offizielle App. Ist sie nicht
 * installiert, öffnet der Browser die offizielle Webseite.
 */
@CapacitorPlugin(name = "AppLinks")
public class AppLinksPlugin extends Plugin {

    private static final String SPOTIFY_PACKAGE = "com.spotify.music";
    private static final String YOUTUBE_MUSIC_PACKAGE = "com.google.android.apps.youtube.music";
    private static final String APPLE_MUSIC_PACKAGE = "com.apple.android.music";

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = clean(call.getString("url", ""), 900);
        if (!isWebUrl(url)) {
            call.resolve(opened(false));
            return;
        }
        call.resolve(opened(openUrl(url, null)));
    }

    @PluginMethod
    public void openMusic(PluginCall call) {
        String service = clean(call.getString("service", ""), 20).toLowerCase();
        String title = clean(call.getString("title", ""), 200);
        String artist = clean(call.getString("artist", ""), 200);
        String link = clean(call.getString("url", ""), 900);
        if (title.isEmpty()) {
            call.resolve(opened(false));
            return;
        }

        String query = Uri.encode((artist + " " + title).trim());
        boolean opened = false;

        if ("spotify".equals(service)) {
            opened = openUrl("spotify:search:" + query, SPOTIFY_PACKAGE);
            if (!opened) opened = openUrl("https://open.spotify.com/search/" + query, SPOTIFY_PACKAGE);
            if (!opened) opened = openUrl("https://open.spotify.com/search/" + query, null);
        } else if ("ytmusic".equals(service) || "youtube".equals(service)) {
            String url = "https://music.youtube.com/search?q=" + query;
            opened = openUrl(url, YOUTUBE_MUSIC_PACKAGE);
            if (!opened) opened = openUrl(url, null);
        } else if ("apple".equals(service)) {
            String url = isWebUrl(link) ? link : "https://music.apple.com/de/search?term=" + query;
            opened = openUrl(url, APPLE_MUSIC_PACKAGE);
            if (!opened) opened = openUrl(url, null);
        } else if ("deezer".equals(service)) {
            String url = "https://www.deezer.com/search/" + query;
            opened = openUrl(url, "deezer.android.app");
            if (!opened) opened = openUrl(url, null);
        } else {
            opened = isWebUrl(link) && openUrl(link, null);
        }

        call.resolve(opened(opened));
    }

    private JSObject opened(boolean value) {
        JSObject result = new JSObject();
        result.put("opened", value);
        return result;
    }

    private boolean openUrl(String url, String packageName) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (packageName != null) intent.setPackage(packageName);
            if (getActivity() != null) getActivity().startActivity(intent);
            else getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException | IllegalArgumentException error) {
            return false;
        }
    }

    private static boolean isWebUrl(String value) {
        return value != null && (value.startsWith("https://") || value.startsWith("http://"));
    }

    private static String clean(String value, int max) {
        if (value == null) return "";
        String text = value.replaceAll("[\\r\\n\\t]+", " ").trim();
        return text.length() > max ? text.substring(0, max) : text;
    }
}
