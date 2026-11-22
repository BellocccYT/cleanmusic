package de.cleanmusic.mobile;

import android.Manifest;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Lokale Musik über die Android-Medienbibliothek.
 *
 * Es wird nichts kopiert und nichts hochgeladen: die App liest nur die von
 * Android freigegebenen Audio-Einträge (Titel, Künstler, Dauer, content://-URI)
 * und spielt sie über den WebView-Player ab. Die Berechtigung wird erst beim
 * Hinzufügen abgefragt.
 */
@CapacitorPlugin(
        name = "MediaLibrary",
        permissions = {
            @Permission(
                    alias = "audio",
                    strings = {
                        Manifest.permission.READ_MEDIA_AUDIO,
                        Manifest.permission.READ_EXTERNAL_STORAGE
                    })
        })
public class MediaLibraryPlugin extends Plugin {

    private static String requiredPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? Manifest.permission.READ_MEDIA_AUDIO
                : Manifest.permission.READ_EXTERNAL_STORAGE;
    }

    private boolean granted() {
        return ContextCompat.checkSelfPermission(getContext(), requiredPermission())
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (granted()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("audio", call, "afterPermission");
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", granted());
        call.resolve(result);
    }

    @PluginMethod
    public void listAudio(PluginCall call) {
        if (!granted()) {
            call.reject("Berechtigung fehlt");
            return;
        }

        JSArray files = new JSArray();
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        String[] projection;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            projection = new String[] {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.DISPLAY_NAME,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.SIZE,
                    MediaStore.Audio.Media.BUCKET_DISPLAY_NAME,
                    MediaStore.Audio.Media.RELATIVE_PATH,
            };
        } else {
            projection = new String[] {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.DISPLAY_NAME,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.SIZE,
                    MediaStore.Audio.Media.BUCKET_DISPLAY_NAME,
            };
        }

        String selection =
                MediaStore.Audio.Media.IS_MUSIC + " != 0 AND "
                        + MediaStore.Audio.Media.DURATION + " > 5000 AND "
                        + MediaStore.Audio.Media.SIZE + " > 0";

        try (Cursor cursor = getContext()
                .getContentResolver()
                .query(collection, projection, selection, null, MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC")) {
            if (cursor == null) {
                call.reject("Mediathek nicht lesbar");
                return;
            }

            int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
            int nameColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
            int titleColumn = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
            int artistColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
            int albumColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
            int durationColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
            int sizeColumn = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);
            int bucketColumn = cursor.getColumnIndex(MediaStore.Audio.Media.BUCKET_DISPLAY_NAME);
            int pathColumn = cursor.getColumnIndex(MediaStore.Audio.Media.RELATIVE_PATH);

            int guard = 0;
            while (cursor.moveToNext() && guard < 4000) {
                guard += 1;
                long id = cursor.getLong(idColumn);
                String name = value(cursor, nameColumn, "Titel");
                String title = value(cursor, titleColumn, "");
                String artist = value(cursor, artistColumn, "");
                String album = value(cursor, albumColumn, "");
                String folder = value(cursor, bucketColumn, "");
                if (folder.isEmpty()) folder = value(cursor, pathColumn, "Android-Mediathek");

                if (artist.equals("<unknown>")) artist = "";
                if (album.equals("<unknown>")) album = "";

                JSObject file = new JSObject();
                file.put("uri", ContentUris.withAppendedId(collection, id).toString());
                file.put("name", name);
                file.put("title", title.isEmpty() ? stripExtension(name) : title);
                file.put("artist", artist);
                file.put("album", album);
                file.put("folder", folder);
                file.put("size", cursor.getLong(sizeColumn));
                file.put("duration", Math.round(cursor.getLong(durationColumn) / 1000.0));
                files.put(file);
            }
        } catch (Exception error) {
            call.reject("Mediathek: " + error.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("files", files);
        result.put("count", files.length());
        call.resolve(result);
    }

    private static String value(Cursor cursor, int index, String fallback) {
        if (index < 0 || cursor.isNull(index)) return fallback;
        String text = cursor.getString(index);
        return text == null ? fallback : text.trim();
    }

    private static String stripExtension(String name) {
        if (name == null) return "Titel";
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}
