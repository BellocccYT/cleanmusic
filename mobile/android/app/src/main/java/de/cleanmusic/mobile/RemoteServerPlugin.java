package de.cleanmusic.mobile;

import android.graphics.Bitmap;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.security.SecureRandom;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Handy-Steuerung für den Fernseher.
 *
 * Der Server läuft nur, solange die App offen ist. Er liefert dieselbe
 * Steuerseite wie am Desktop (renderer/remote/index.html) und dieselben
 * Schnittstellen: /api/state, /api/cmd, /api/search, /api/queue, /api/events
 * sowie /api/radio und /api/favorites.
 */
@CapacitorPlugin(name = "RemoteServer")
public class RemoteServerPlugin extends Plugin {

    private static final int DEFAULT_PORT = 4790;
    private static final long REQUEST_TIMEOUT_MS = 8000;

    private RemoteHttpServer server;
    private String key = "";
    private volatile String stateJson = "{}";
    private String pageHtml;
    private String ip = "";
    private final AtomicLong ids = new AtomicLong();
    private final Map<String, Waiter> pending = new HashMap<>();

    private static class Waiter {
        final CountDownLatch latch = new CountDownLatch(1);
        int status = 504;
        String json = "{\"error\":\"timeout\"}";

        void complete(int status, String json) {
            this.status = status;
            this.json = json == null ? "{}" : json;
            latch.countDown();
        }
    }

    @Override
    public void load() {
        try (InputStream input = getContext().getAssets().open("public/remote/index.html")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) > 0) out.write(buffer, 0, read);
            pageHtml = out.toString("UTF-8");
        } catch (Exception error) {
            pageHtml = null;
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (server != null) {
            call.resolve(info());
            return;
        }
        if (key == null || key.length() < 20) key = newKey();
        ip = localIpv4();
        if (ip.isEmpty()) {
            JSObject result = info();
            result.put("error", "Kein WLAN/LAN gefunden. Bitte mit dem Heimnetz verbinden.");
            call.resolve(result);
            return;
        }
        try {
            server = new RemoteHttpServer(new RemoteHttpServer.Delegate() {
                @Override
                public String key() {
                    return key;
                }

                @Override
                public String stateJson() {
                    return stateJson;
                }

                @Override
                public String pageHtml() {
                    return pageHtml;
                }

                @Override
                public RemoteHttpServer.Result forward(
                        String kind, String path, Map<String, String> query, String body, String device) {
                    return request(kind, path, query, body, device);
                }
            }, DEFAULT_PORT);
            server.start();
            call.resolve(info());
        } catch (Exception error) {
            server = null;
            JSObject result = info();
            result.put("error", "Steuerung konnte nicht starten: " + error.getMessage());
            call.resolve(result);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopServer();
        call.resolve(info());
    }

    @PluginMethod
    public void get(PluginCall call) {
        call.resolve(info());
    }

    @PluginMethod
    public void rotate(PluginCall call) {
        key = newKey();
        if (server != null) {
            server.closeStreams();
            server.forgetDevices();
        }
        notifyStreams();
        call.resolve(info());
    }

    @PluginMethod
    public void updateState(PluginCall call) {
        JSObject data = call.getData();
        if (data != null) {
            stateJson = data.toString();
            if (server != null) server.broadcast(stateJson);
        }
        call.resolve();
    }

    @PluginMethod
    public void respond(PluginCall call) {
        String id = call.getString("id", "");
        Integer status = call.getInt("status", 200);
        JSONObject data = call.getData();
        String json = "{}";
        if (data != null) {
            Object value = data.opt("data");
            if (value instanceof JSONObject || value instanceof JSONArray) json = value.toString();
            else if (value != null) json = JSONObject.quote(String.valueOf(value));
        }
        Waiter waiter;
        synchronized (pending) {
            waiter = pending.remove(id);
        }
        if (waiter != null) waiter.complete(status == null ? 200 : status, json);
        call.resolve();
    }

    /* ---------------------------------------------------------------- */

    private RemoteHttpServer.Result request(
            String kind, String path, Map<String, String> query, String body, String device) {
        String id = "r" + ids.incrementAndGet();
        Waiter waiter = new Waiter();
        synchronized (pending) {
            pending.put(id, waiter);
        }

        JSObject payload = new JSObject();
        fillPayload(payload, id, kind, path, query, body, device);
        notifyListeners("request", payload);

        try {
            if (!waiter.latch.await(REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                synchronized (pending) {
                    pending.remove(id);
                }
                return new RemoteHttpServer.Result(504, "{\"error\":\"timeout\"}");
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return new RemoteHttpServer.Result(503, "{\"error\":\"interrupted\"}");
        }
        return new RemoteHttpServer.Result(waiter.status, waiter.json);
    }

    private static void fillPayload(
            JSObject target,
            String id,
            String kind,
            String path,
            Map<String, String> query,
            String body,
            String device) {
        target.put("id", id);
        target.put("kind", kind);
        target.put("path", path);
        target.put("device", device == null ? "" : device);
        JSObject params = new JSObject();
        for (Map.Entry<String, String> entry : query.entrySet()) params.put(entry.getKey(), entry.getValue());
        target.put("query", params);
        if (body != null && !body.isEmpty()) {
            try {
                target.put("body", new JSONObject(body));
            } catch (Exception error) {
                target.put("body", new JSONObject());
            }
        } else {
            target.put("body", new JSONObject());
        }
    }

    private void stopServer() {
        RemoteHttpServer current = server;
        server = null;
        stateJson = "{}";
        if (current != null) current.stop();
        synchronized (pending) {
            for (Waiter waiter : pending.values()) waiter.complete(503, "{\"error\":\"stopped\"}");
            pending.clear();
        }
    }

    private void notifyStreams() {
        if (server != null) server.broadcast(stateJson);
    }

    private JSObject info() {
        JSObject result = new JSObject();
        boolean running = server != null;
        int port = running ? server.getPort() : DEFAULT_PORT;
        result.put("enabled", running);
        result.put("port", port);
        result.put("requestedPort", DEFAULT_PORT);
        result.put("ip", ip);
        result.put("url", running ? url(port) : "");
        result.put("qr", running ? qr(url(port)) : "");
        result.put("streams", running ? server.streamCount() : 0);
        result.put("error", null);
        return result;
    }

    private String url(int port) {
        if (ip == null || ip.isEmpty() || key == null || key.isEmpty()) return "";
        return "http://" + ip + ":" + port + "/?k=" + key;
    }

    private String qr(String url) {
        if (url == null || url.isEmpty()) return "";
        try {
            Map<EncodeHintType, Object> hints = new HashMap<>();
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 1);
            BitMatrix matrix = new QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, 480, 480, hints);
            Bitmap bitmap = Bitmap.createBitmap(matrix.getWidth(), matrix.getHeight(), Bitmap.Config.ARGB_8888);
            for (int x = 0; x < matrix.getWidth(); x += 1) {
                for (int y = 0; y < matrix.getHeight(); y += 1) {
                    bitmap.setPixel(x, y, matrix.get(x, y) ? 0xFF000000 : 0xFFFFFFFF);
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            bitmap.recycle();
            return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception error) {
            return "";
        }
    }

    /** Private IPv4 des Geräts; WLAN/LAN bevorzugt, virtuelle Adapter später. */
    private static String localIpv4() {
        String fallback = "";
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface entry = interfaces.nextElement();
                if (!entry.isUp() || entry.isLoopback()) continue;
                String name = entry.getName() == null ? "" : entry.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni")) continue;
                Enumeration<InetAddress> addresses = entry.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (!(address instanceof Inet4Address)) continue;
                    if (!address.isSiteLocalAddress()) continue;
                    String value = address.getHostAddress();
                    if (value == null || value.isEmpty()) continue;
                    boolean wifi = name.contains("wlan") || name.contains("ap") || name.contains("eth");
                    if (wifi) return value;
                    if (fallback.isEmpty()) fallback = value;
                }
            }
        } catch (Exception ignored) {
            // Keine Netzwerkschnittstelle lesbar
        }
        return fallback;
    }

    private static String newKey() {
        byte[] bytes = new byte[24];
        new SecureRandom().nextBytes(bytes);
        return Base64.encodeToString(
                bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    @Override
    protected void handleOnDestroy() {
        stopServer();
        super.handleOnDestroy();
    }
}
