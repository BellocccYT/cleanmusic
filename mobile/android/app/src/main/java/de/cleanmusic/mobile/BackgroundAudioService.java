package de.cleanmusic.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Vordergrund-Dienst für die Wiedergabe im WebView.
 *
 * Der Ton bleibt im WebView (<audio>). Dieser Dienst hält den Prozess am
 * Leben, zeigt die Benachrichtigung und stellt die MediaSession für
 * Sperrbildschirm, Kopfhörer und Bluetooth bereit. Steuerbefehle werden an
 * das JavaScript weitergegeben, das weiterhin die einzige Wiedergabequelle
 * ist (kein zweiter Player, kein DRM, kein Download).
 */
public class BackgroundAudioService extends Service {

    private static final String TAG = "CleanMusicAudio";

    public static final String ACTION_UPDATE = "de.cleanmusic.mobile.UPDATE";
    public static final String ACTION_PLAY = "de.cleanmusic.mobile.PLAY";
    public static final String ACTION_PAUSE = "de.cleanmusic.mobile.PAUSE";
    public static final String ACTION_TOGGLE = "de.cleanmusic.mobile.TOGGLE";
    public static final String ACTION_NEXT = "de.cleanmusic.mobile.NEXT";
    public static final String ACTION_PREVIOUS = "de.cleanmusic.mobile.PREVIOUS";
    public static final String ACTION_STOP = "de.cleanmusic.mobile.STOP";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_ALBUM = "album";
    public static final String EXTRA_ARTWORK = "artwork";
    public static final String EXTRA_PLAYING = "playing";
    public static final String EXTRA_POSITION = "position";
    public static final String EXTRA_DURATION = "duration";

    private static final String CHANNEL_ID = "cleanmusic_playback";
    private static final int NOTIFICATION_ID = 4711;
    private static final long WAKE_LOCK_MS = 6L * 60L * 60L * 1000L;

    public interface Listener {
        void onAction(String action, long position);
    }

    /** Wird vom Plugin gesetzt und lebt nur im App-Prozess. */
    public static volatile Listener listener;

    /** Läuft der Dienst gerade? Wird vom Plugin vor dem Start geprüft. */
    public static volatile boolean running = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private MediaSession session;
    private NotificationManager notificationManager;
    private AudioManager audioManager;
    private PowerManager.WakeLock wakeLock;
    private AudioFocusRequest focusRequest;
    private boolean hasAudioFocus = false;
    private boolean foreground = false;

    private String title = "";
    private String artist = "";
    private String album = "";
    private String artworkUrl = "";
    private String loadingArtworkUrl = "";
    private Bitmap artwork;
    private Bitmap fallbackIcon;
    private boolean playing = false;
    private long position = 0;
    private long duration = 0;

    private final AudioManager.OnAudioFocusChangeListener focusListener =
            new AudioManager.OnAudioFocusChangeListener() {
                @Override
                public void onAudioFocusChange(int change) {
                    if (change == AudioManager.AUDIOFOCUS_LOSS
                            || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                        // Andere App übernimmt: WebView pausieren lassen.
                        dispatch("pause", 0);
                    }
                }
            };

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;

        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        fallbackIcon = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);

        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power != null) {
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CleanMusic:Playback");
            wakeLock.setReferenceCounted(false);
        }

        createChannel();
        createSession();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || notificationManager == null) return;
        NotificationChannel channel =
                new NotificationChannel(CHANNEL_ID, "Wiedergabe", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Steuerung der CleanMusic-Wiedergabe");
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        notificationManager.createNotificationChannel(channel);
    }

    private void createSession() {
        session = new MediaSession(this, "CleanMusic");
        session.setFlags(
                MediaSession.FLAG_HANDLES_MEDIA_BUTTONS
                        | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setPlaybackToLocal(
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build());

        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent =
                PendingIntent.getActivity(
                        this,
                        90,
                        open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        session.setSessionActivity(contentIntent);

        session.setCallback(
                new MediaSession.Callback() {
                    @Override
                    public void onPlay() {
                        dispatch("play", 0);
                    }

                    @Override
                    public void onPause() {
                        dispatch("pause", 0);
                    }

                    @Override
                    public void onSkipToNext() {
                        dispatch("next", 0);
                    }

                    @Override
                    public void onSkipToPrevious() {
                        dispatch("previous", 0);
                    }

                    @Override
                    public void onSeekTo(long pos) {
                        dispatch("seek", pos);
                    }

                    @Override
                    public void onStop() {
                        dispatch("stop", 0);
                    }
                });

        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP.equals(action)) {
                dispatch("stop", 0);
                stopSelf();
                return START_NOT_STICKY;
            }
            if (ACTION_PLAY.equals(action)) {
                dispatch("play", 0);
            } else if (ACTION_PAUSE.equals(action)) {
                dispatch("pause", 0);
            } else if (ACTION_TOGGLE.equals(action)) {
                dispatch(playing ? "pause" : "play", 0);
            } else if (ACTION_NEXT.equals(action)) {
                dispatch("next", 0);
            } else if (ACTION_PREVIOUS.equals(action)) {
                dispatch("previous", 0);
            } else if (ACTION_UPDATE.equals(action)) {
                readState(intent);
                updateSession();
                updateNotification();
                updateWakeLock();
                updateAudioFocus();
            }
        }

        ensureForeground();
        return START_NOT_STICKY;
    }

    private void readState(Intent intent) {
        title = safe(intent.getStringExtra(EXTRA_TITLE), 200);
        artist = safe(intent.getStringExtra(EXTRA_ARTIST), 200);
        album = safe(intent.getStringExtra(EXTRA_ALBUM), 200);
        String newArtwork = safe(intent.getStringExtra(EXTRA_ARTWORK), 1000);
        if (!newArtwork.equals(artworkUrl)) {
            artworkUrl = newArtwork;
            artwork = null;
            loadArtwork();
        }
        playing = intent.getBooleanExtra(EXTRA_PLAYING, false);
        position = Math.max(0, intent.getLongExtra(EXTRA_POSITION, 0));
        duration = Math.max(0, intent.getLongExtra(EXTRA_DURATION, 0));
    }

    private static String safe(String value, int max) {
        if (value == null) return "";
        String text = value.replaceAll("[\\r\\n\\t]+", " ").trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    private void ensureForeground() {
        if (notificationManager == null) return;
        Notification notification = buildNotification();
        if (!foreground) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foreground = true;
        } else {
            notificationManager.notify(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification() {
        if (!foreground || notificationManager == null) return;
        notificationManager.notify(NOTIFICATION_ID, buildNotification());
    }

    private PendingIntent actionIntent(String action, int code) {
        Intent intent = new Intent(this, BackgroundAudioService.class).setAction(action);
        return PendingIntent.getService(
                this,
                code,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent =
                PendingIntent.getActivity(
                        this,
                        90,
                        open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        int playIcon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playLabel = playing ? "Pause" : "Abspielen";

        builder.setSmallIcon(R.drawable.ic_stat_music)
                .setContentTitle(title.isEmpty() ? "CleanMusic" : title)
                .setContentText(artist.isEmpty() ? "CleanMusic" : artist)
                .setContentIntent(contentIntent)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setOngoing(playing)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setLargeIcon(artwork != null ? artwork : fallbackIcon)
                .addAction(
                        new Notification.Action.Builder(
                                        android.R.drawable.ic_media_previous,
                                        "Zurück",
                                        actionIntent(ACTION_PREVIOUS, 21))
                                .build())
                .addAction(
                        new Notification.Action.Builder(
                                        playIcon,
                                        playLabel,
                                        actionIntent(ACTION_TOGGLE, 22))
                                .build())
                .addAction(
                        new Notification.Action.Builder(
                                        android.R.drawable.ic_media_next,
                                        "Weiter",
                                        actionIntent(ACTION_NEXT, 23))
                                .build())
                .addAction(
                        new Notification.Action.Builder(
                                        android.R.drawable.ic_menu_close_clear_cancel,
                                        "Stop",
                                        actionIntent(ACTION_STOP, 24))
                                .build())
                .setStyle(
                        new Notification.MediaStyle()
                                .setMediaSession(session.getSessionToken())
                                .setShowActionsInCompactView(0, 1, 2));

        if (!album.isEmpty()) builder.setSubText(album);
        return builder.build();
    }

    private void updateSession() {
        if (session == null) return;

        MediaMetadata.Builder meta =
                new MediaMetadata.Builder()
                        .putString(MediaMetadata.METADATA_KEY_TITLE, title.isEmpty() ? "CleanMusic" : title)
                        .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                        .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
                        .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);
        if (artwork != null) {
            meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        }
        session.setMetadata(meta.build());

        long actions =
                PlaybackState.ACTION_PLAY
                        | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                        | PlaybackState.ACTION_SEEK_TO
                        | PlaybackState.ACTION_STOP;
        session.setPlaybackState(
                new PlaybackState.Builder()
                        .setActions(actions)
                        .setState(
                                playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                                position,
                                playing ? 1f : 0f)
                        .build());
    }

    private void updateWakeLock() {
        if (wakeLock == null) return;
        if (playing) {
            if (!wakeLock.isHeld()) wakeLock.acquire(WAKE_LOCK_MS);
        } else if (wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    private void updateAudioFocus() {
        if (audioManager == null) return;
        if (playing && !hasAudioFocus) {
            int result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest == null) {
                    focusRequest =
                            new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                                    .setAudioAttributes(
                                            new AudioAttributes.Builder()
                                                    .setUsage(AudioAttributes.USAGE_MEDIA)
                                                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                                    .build())
                                    .setOnAudioFocusChangeListener(focusListener)
                                    .build();
                }
                result = audioManager.requestAudioFocus(focusRequest);
            } else {
                result =
                        audioManager.requestAudioFocus(
                                focusListener,
                                AudioManager.STREAM_MUSIC,
                                AudioManager.AUDIOFOCUS_GAIN);
            }
            hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else if (!playing && hasAudioFocus) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
            } else {
                audioManager.abandonAudioFocus(focusListener);
            }
            hasAudioFocus = false;
        }
    }

    private void loadArtwork() {
        final String url = artworkUrl;
        if (url.isEmpty() || !url.startsWith("https://") || session == null) return;
        if (url.equals(loadingArtworkUrl)) return;
        loadingArtworkUrl = url;

        io.execute(
                () -> {
                    Bitmap bitmap = null;
                    HttpURLConnection connection = null;
                    try {
                        connection = (HttpURLConnection) new URL(url).openConnection();
                        connection.setConnectTimeout(5000);
                        connection.setReadTimeout(7000);
                        connection.setInstanceFollowRedirects(true);
                        connection.setRequestProperty("accept", "image/*");
                        int length = connection.getContentLength();
                        if (length <= 0 || length <= 3 * 1024 * 1024) {
                            try (InputStream stream = connection.getInputStream()) {
                                bitmap = BitmapFactory.decodeStream(stream);
                            }
                        }
                    } catch (Exception error) {
                        Log.w(TAG, "Cover konnte nicht geladen werden", error);
                    } finally {
                        if (connection != null) connection.disconnect();
                        loadingArtworkUrl = "";
                    }

                    final Bitmap loaded = bitmap;
                    main.post(
                            () -> {
                                if (loaded == null || !url.equals(artworkUrl)) return;
                                artwork = loaded;
                                updateSession();
                                updateNotification();
                            });
                });
    }

    private void dispatch(final String action, final long value) {
        final Listener target = listener;
        if (target == null) return;
        main.post(
                () -> {
                    try {
                        target.onAction(action, value);
                    } catch (Exception error) {
                        Log.w(TAG, "Aktion konnte nicht zugestellt werden", error);
                    }
                });
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // WebView ist weg – kein Grund, den Dienst weiterlaufen zu lassen.
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        foreground = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (audioManager != null && hasAudioFocus) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
            } else {
                audioManager.abandonAudioFocus(focusListener);
            }
            hasAudioFocus = false;
        }
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        try {
            stopForeground(true);
        } catch (Exception ignored) {
            // Dienst war nicht (mehr) im Vordergrund.
        }
        if (notificationManager != null) notificationManager.cancel(NOTIFICATION_ID);
        io.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Startet oder aktualisiert den Dienst. Läuft er schon, reicht startService;
     * sonst startet ihn startForegroundService (nur bei laufender Wiedergabe).
     */
    public static void push(Context context, Intent intent, boolean playing) {
        if (!running && !playing) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!running) ContextCompat.startForegroundService(context, intent);
            else context.startService(intent);
        } else {
            context.startService(intent);
        }
    }
}
