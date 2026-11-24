package de.cleanmusic.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Eingebauter Updater (es gibt keinen Store, der das übernimmt).
 *
 * Die App prüft selbst die GitHub-Releases (mobile-*). Der Download läuft
 * hier, prüft Größe und SHA-256 und öffnet danach den Android-Installer.
 * Der Nutzer bestätigt mit einem Klick; Android kann zusätzlich nach der
 * Erlaubnis „Unbekannte Apps installieren“ fragen.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private static final Set<String> HOSTS = new HashSet<>(Arrays.asList(
            "github.com",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
            "github-releases.githubusercontent.com"));

    private static final long MAX_BYTES = 300L * 1024L * 1024L;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url", "");
        final String name = call.getString("name", "");
        final Double sizeValue = call.getDouble("size", 0.0);
        final long size = sizeValue == null ? 0L : Math.round(sizeValue);
        final String sha256 = call.getString("sha256", "");

        if (!allowedUrl(url)) {
            call.reject("Unerwartete Download-Adresse");
            return;
        }
        if (!name.matches("^CleanMusic-Android-\\d+\\.\\d+\\.\\d+\\.apk$")) {
            call.reject("Unerwarteter Dateiname");
            return;
        }
        if (sha256 == null || !sha256.toLowerCase(Locale.US).matches("^[0-9a-f]{64}$")) {
            call.reject("Prüfsumme fehlt – Update wird nicht geladen");
            return;
        }

        io.execute(() -> {
            HttpURLConnection connection = null;
            File target = null;
            File partial = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Ordner nicht anlegbar");
                target = new File(dir, name);
                partial = new File(dir, name + ".part");

                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("accept", "application/vnd.android.package-archive, application/octet-stream");
                connection.setRequestProperty("user-agent", "CleanMusic-Android");

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) throw new Exception("HTTP " + status);
                if (!allowedUrl(connection.getURL().toString())) throw new Exception("Unerwartete Weiterleitung");

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long received = 0;
                byte[] buffer = new byte[64 * 1024];

                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(partial)) {
                    int read;
                    while ((read = input.read(buffer)) > 0) {
                        received += read;
                        if (received > MAX_BYTES) throw new Exception("Datei zu groß");
                        digest.update(buffer, 0, read);
                        output.write(buffer, 0, read);
                    }
                }

                if (size > 0 && received != size) throw new Exception("Download unvollständig");
                {
                    StringBuilder hex = new StringBuilder();
                    for (byte value : digest.digest()) hex.append(String.format(Locale.US, "%02x", value));
                    if (!hex.toString().equals(sha256.toLowerCase(Locale.US))) {
                        throw new Exception("Prüfsumme stimmt nicht – Datei verworfen");
                    }
                }

                if (target.exists() && !target.delete()) throw new Exception("Alte Datei bleibt liegen");
                if (!partial.renameTo(target)) throw new Exception("Datei konnte nicht gespeichert werden");

                JSObject result = new JSObject();
                result.put("file", target.getAbsolutePath());
                result.put("size", received);
                call.resolve(result);
            } catch (Exception error) {
                if (partial != null) partial.delete();
                call.reject(error.getMessage() == null ? "Download fehlgeschlagen" : error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("file", "");        File file = new File(path);
        File dir = new File(getContext().getCacheDir(), "updates");
        try {
            if (!file.getCanonicalPath().startsWith(dir.getCanonicalPath())) {
                call.reject("Datei liegt nicht im Update-Ordner");
                return;
            }
        } catch (Exception error) {
            call.reject("Datei nicht lesbar");
            return;
        }
        if (!file.isFile() || file.length() <= 0) {
            call.reject("Update-Datei fehlt");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settingsIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settingsIntent);
            } catch (Exception ignored) {
                // Einstellungen nicht erreichbar – der Nutzer findet sie selbst.
            }
            JSObject result = new JSObject();
            result.put("started", false);
            result.put("reason", "permission");
            call.resolve(result);
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Installer konnte nicht geöffnet werden");
        }
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdownNow();
        super.handleOnDestroy();
    }

    private static boolean allowedUrl(String value) {
        if (value == null) return false;
        try {
            URL url = new URL(value);
            return "https".equalsIgnoreCase(url.getProtocol()) && HOSTS.contains(url.getHost().toLowerCase(Locale.US));
        } catch (Exception error) {
            return false;
        }
    }
}
