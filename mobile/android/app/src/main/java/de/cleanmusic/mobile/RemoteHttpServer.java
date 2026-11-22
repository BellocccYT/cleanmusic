package de.cleanmusic.mobile;

import android.util.Log;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Kleiner HTTP-Server für die Handy-Steuerung auf dem Fernseher.
 *
 * Dieselben Schutzmaßnahmen wie in der Desktop-Fernbedienung (1.12):
 *  - Schlüssel bei jeder Anfrage (X-CM-Key oder ?k=), Vergleich ohne Zeitleck
 *  - nur Loopback bzw. private IPv4-Adressen
 *  - Host-Prüfung (Port und lokaler Name/IP)
 *  - 20 Anfragen pro Sekunde und IP, höchstens 10 Live-Verbindungen (SSE)
 *  - nur solange die App offen ist; „Neuen Link erzeugen“ beendet alte Streams
 *
 * Die eigentlichen Aktionen (Suche, Warteschlange, Radio, Favoriten) laufen
 * nicht hier, sondern in JavaScript – dieselbe Allowlist wie native.js.
 */
public class RemoteHttpServer {

    public interface Delegate {
        String key();
        String stateJson();
        String pageHtml();
        Result forward(String kind, String path, Map<String, String> query, String body, String device);
    }

    public static class Result {
        public final int status;
        public final String json;

        public Result(int status, String json) {
            this.status = status;
            this.json = json == null ? "{}" : json;
        }
    }

    private static final String TAG = "CleanMusicRemote";
    private static final int MAX_HEADER_BYTES = 16 * 1024;
    private static final int MAX_BODY_BYTES = 8 * 1024;
    private static final int MAX_CONNECTIONS = 12;
    private static final int MAX_STREAMS = 10;

    private final Delegate delegate;
    private final int requestedPort;
    private final ServerSocket socket;
    private final int port;
    private final ExecutorService workers = Executors.newFixedThreadPool(MAX_CONNECTIONS);
    private final Semaphore permits = new Semaphore(MAX_CONNECTIONS);
    private final Set<PrintWriter> streams = ConcurrentHashMap.newKeySet();
    private final Map<String, long[]> rate = new ConcurrentHashMap<>();
    private final Map<String, String> devices = new ConcurrentHashMap<>();
    private final AtomicLong deviceCounter = new AtomicLong();

    private volatile boolean running = true;
    private Thread acceptThread;

    public RemoteHttpServer(Delegate delegate, int requestedPort) throws IOException {
        this.delegate = delegate;
        this.requestedPort = requestedPort;
        ServerSocket created;
        try {
            created = new ServerSocket();
            created.setReuseAddress(true);
            created.bind(new InetSocketAddress(requestedPort), 20);
        } catch (IOException busy) {
            if (requestedPort == 0) throw busy;
            created = new ServerSocket();
            created.setReuseAddress(true);
            created.bind(new InetSocketAddress(0), 20);
        }
        this.socket = created;
        this.port = created.getLocalPort();
    }

    public int getPort() {
        return port;
    }

    public void start() {
        acceptThread = new Thread(() -> {
            while (running) {
                try {
                    Socket client = socket.accept();
                    workers.execute(() -> handle(client));
                } catch (IOException error) {
                    if (running) Log.w(TAG, "accept: " + error.getMessage());
                }
            }
        }, "CleanMusicRemoteAccept");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    public void stop() {
        running = false;
        closeStreams();
        try {
            socket.close();
        } catch (IOException ignored) {
            // schon zu
        }
        workers.shutdownNow();
    }

    public void broadcast(String json) {
        if (streams.isEmpty()) return;
        String payload = "event: state\ndata: " + json + "\n\n";
        for (PrintWriter writer : streams) {
            try {
                writer.write(payload);
                writer.flush();
                if (writer.checkError()) streams.remove(writer);
            } catch (Exception error) {
                streams.remove(writer);
            }
        }
    }

    public void closeStreams() {
        for (PrintWriter writer : streams) {
            try {
                writer.close();
            } catch (Exception ignored) {
                // Verbindung war schon weg
            }
        }
        streams.clear();
    }

    public int streamCount() {
        return streams.size();
    }

    /* ---------------------------------------------------------------- */

    private void handle(Socket client) {
        boolean acquired = permits.tryAcquire();
        if (!acquired) {            try {
                write(client.getOutputStream(), 503, "application/json", "{\"error\":\"busy\"}", false);
                client.close();
            } catch (Exception ignored) {
                // nichts mehr zu retten
            }
            return;
        }

        try {
            client.setSoTimeout(8000);
            client.setTcpNoDelay(true);
            InputStream input = new BufferedInputStream(client.getInputStream());
            String rawHeaders = readHeaders(input);
            if (rawHeaders == null) {
                client.close();
                return;
            }

            String[] lines = rawHeaders.split("\r\n");
            if (lines.length == 0) {
                client.close();
                return;
            }
            String[] requestLine = lines[0].split(" ");
            if (requestLine.length < 2) {
                write(client.getOutputStream(), 400, "application/json", "{\"error\":\"bad-request\"}", false);
                client.close();
                return;
            }

            String method = requestLine[0].toUpperCase(Locale.US);
            String target = requestLine[1];
            Map<String, String> headers = new HashMap<>();
            for (int index = 1; index < lines.length; index += 1) {
                int colon = lines[index].indexOf(':');
                if (colon <= 0) continue;
                headers.put(
                        lines[index].substring(0, colon).trim().toLowerCase(Locale.US),
                        lines[index].substring(colon + 1).trim());
            }

            InetAddress remote = client.getInetAddress();
            if (!allowedAddress(remote)) {
                write(client.getOutputStream(), 403, "application/json", "{\"error\":\"forbidden\"}", false);
                client.close();
                return;
            }
            String ip = remote.getHostAddress();
            if (!hostAllowed(headers.get("host"), ip)) {
                write(client.getOutputStream(), 403, "application/json", "{\"error\":\"forbidden\"}", false);
                client.close();
                return;
            }
            if (!rateAllowed(ip)) {
                write(client.getOutputStream(), 429, "application/json", "{\"error\":\"rate-limit\"}", false);
                client.close();
                return;
            }

            String path = target;
            Map<String, String> query = new HashMap<>();
            int mark = target.indexOf('?');
            if (mark >= 0) {
                path = target.substring(0, mark);
                query = parseQuery(target.substring(mark + 1));
            }

            String supplied = headers.get("x-cm-key");
            if (supplied == null || supplied.isEmpty()) supplied = query.get("k");
            if (!authorized(supplied)) {
                write(client.getOutputStream(), 401, "application/json", "{\"error\":\"unauthorized\"}", false);
                client.close();
                return;
            }

            if ("GET".equals(method) && ("/".equals(path) || "/index.html".equals(path))) {
                String html = delegate.pageHtml();
                if (html == null) {
                    write(client.getOutputStream(), 500, "application/json", "{\"error\":\"unavailable\"}", false);
                    client.close();
                    return;
                }
                writePage(client.getOutputStream(), html);
                client.close();
                return;
            }

            if ("GET".equals(method) && "/api/state".equals(path)) {
                write(client.getOutputStream(), 200, "application/json; charset=utf-8", delegate.stateJson(), false);
                client.close();
                return;
            }

            if ("GET".equals(method) && "/api/events".equals(path)) {
                // Live-Verbindungen zählen nicht gegen das Anfrage-Limit;
                // sie werden separat auf 10 begrenzt.
                permits.release();
                acquired = false;
                openStream(client);
                return;
            }

            String body = "";
            if ("POST".equals(method)) {
                body = readBody(input, headers.get("content-length"));
                if (body == null) {
                    write(client.getOutputStream(), 413, "application/json", "{\"error\":\"body-too-large\"}", false);
                    client.close();
                    return;
                }
            }

            String device = deviceLabel(ip);
            String kind = kindFor(method, path);
            if (kind == null) {
                write(client.getOutputStream(), 404, "application/json", "{\"error\":\"not-found\"}", false);
                client.close();
                return;
            }

            Result result = delegate.forward(kind, path, query, body, device);
            String type = "application/json; charset=utf-8";
            write(client.getOutputStream(), result.status, type, result.json, false);
            client.close();
        } catch (Exception error) {
            Log.w(TAG, "request: " + error.getMessage());
            try {
                client.close();
            } catch (IOException ignored) {
                // schon zu
            }
        } finally {
            if (acquired) permits.release();
        }
    }

    private void openStream(Socket client) throws IOException {
        if (streams.size() >= MAX_STREAMS) {
            write(client.getOutputStream(), 429, "application/json", "{\"error\":\"too-many-streams\"}", false);
            client.close();
            return;
        }
        OutputStream output = client.getOutputStream();
        String head = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/event-stream; charset=utf-8\r\n"
                + "Cache-Control: no-cache, no-transform\r\n"
                + "Connection: keep-alive\r\n"
                + "X-Accel-Buffering: no\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + "\r\n";
        output.write(head.getBytes(StandardCharsets.UTF_8));
        output.flush();

        PrintWriter writer = new PrintWriter(output, true);
        streams.add(writer);
        writer.write("event: state\ndata: " + delegate.stateJson() + "\n\n");
        writer.flush();

        // Hält die Verbindung offen und erkennt geschlossene Clients.
        try {
            while (running && !writer.checkError()) {
                Thread.sleep(15000);
                if (!running || writer.checkError()) break;
                writer.write(": ping\n\n");
                writer.flush();
            }
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        } finally {
            streams.remove(writer);
            try {
                writer.close();
                client.close();
            } catch (Exception ignored) {
                // schon zu
            }
        }
    }

    /* ---------------------------------------------------------------- */

    private static String kindFor(String method, String path) {
        if ("GET".equals(method) && "/api/search".equals(path)) return "search";
        if ("GET".equals(method) && "/api/radio".equals(path)) return "radio-list";
        if ("POST".equals(method) && "/api/radio".equals(path)) return "radio-play";
        if ("GET".equals(method) && "/api/favorites".equals(path)) return "favorites-list";
        if ("POST".equals(method) && "/api/favorites".equals(path)) return "favorite-play";
        if ("POST".equals(method) && "/api/cmd".equals(path)) return "cmd";
        if ("POST".equals(method) && "/api/queue".equals(path)) return "queue";
        if ("POST".equals(method) && "/api/pair".equals(path)) return "pair";
        return null;
    }

    private boolean authorized(String supplied) {
        if (supplied == null || supplied.isEmpty()) return false;
        String expected = delegate.key();
        if (expected == null || expected.isEmpty()) return false;
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8));
    }

    private boolean hostAllowed(String hostHeader, String remoteIp) {
        if (hostHeader == null) return false;
        String host = hostHeader.trim().toLowerCase(Locale.US);
        int colon = host.lastIndexOf(':');
        if (colon > 0) {
            try {
                int portValue = Integer.parseInt(host.substring(colon + 1));
                if (portValue != port) return false;
            } catch (NumberFormatException error) {
                return false;
            }
            host = host.substring(0, colon);
        } else {
            return false;
        }
        if ("localhost".equals(host)) return true;
        if (!host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return false;
        try {
            InetAddress address = InetAddress.getByName(host);
            return allowedAddress(address) && isLocalAddress(address);
        } catch (Exception error) {
            return false;
        }
    }

    /** Gehört die Adresse zu diesem Gerät? (Host-Kopfzeile darf nicht fälschbar sein.) */
    private static boolean isLocalAddress(InetAddress address) {
        if (address.isLoopbackAddress()) return true;
        try {
            java.util.Enumeration<java.net.NetworkInterface> interfaces =
                    java.net.NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                java.net.NetworkInterface entry = interfaces.nextElement();
                if (!entry.isUp()) continue;
                java.util.Enumeration<InetAddress> addresses = entry.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    if (addresses.nextElement().equals(address)) return true;
                }
            }
        } catch (Exception ignored) {
            // Keine Netzwerkschnittstellen lesbar
        }
        return false;
    }

    private static boolean allowedAddress(InetAddress address) {
        if (address == null) return false;
        if (address.isLoopbackAddress() || address.isSiteLocalAddress()) return true;
        // 100.64/10 (Tailscale/CGNAT) und IPv6-Link-Local bewusst nicht.
        return false;
    }

    private boolean rateAllowed(String ip) {
        long now = System.currentTimeMillis();
        long[] entry = rate.get(ip);
        if (entry == null || now - entry[0] >= 1000) {
            entry = new long[] {now, 0};
            rate.put(ip, entry);
        }
        entry[1] += 1;
        return entry[1] <= 20;
    }

    private String deviceLabel(String ip) {
        return devices.computeIfAbsent(
                ip, key -> "Handy " + deviceCounter.incrementAndGet());
    }

    public void forgetDevices() {
        devices.clear();
        deviceCounter.set(0);
    }

    private static String readHeaders(InputStream input) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        int previousWasLineBreak = 0;
        int current;
        while ((current = input.read()) >= 0) {
            buffer.write(current);
            if (buffer.size() > MAX_HEADER_BYTES) return null;
            if (current == '\n') {
                if (previousWasLineBreak == 1) break;
                previousWasLineBreak = 1;
            } else if (current == '\r') {
                // CRLF: das \r zählt nicht als eigene Zeile
            } else {
                previousWasLineBreak = 0;
            }
        }
        if (buffer.size() == 0) return null;
        String text = buffer.toString("UTF-8");
        return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n");
    }

    private static String readBody(InputStream input, String lengthHeader) throws IOException {
        int length = 0;
        if (lengthHeader != null) {
            try {
                length = Integer.parseInt(lengthHeader.trim());
            } catch (NumberFormatException error) {
                length = 0;
            }
        }
        if (length <= 0) return "";
        if (length > MAX_BODY_BYTES) return null;
        byte[] data = new byte[length];
        int read = 0;
        while (read < length) {
            int chunk = input.read(data, read, length - read);
            if (chunk < 0) break;
            read += chunk;
        }
        return new String(data, 0, read, StandardCharsets.UTF_8);
    }

    private static Map<String, String> parseQuery(String value) {
        Map<String, String> query = new HashMap<>();
        if (value == null || value.isEmpty()) return query;
        for (String pair : value.split("&")) {
            int equals = pair.indexOf('=');
            try {
                String key = equals < 0 ? pair : pair.substring(0, equals);
                String val = equals < 0 ? "" : pair.substring(equals + 1);
                query.put(decode(key), decode(val));
            } catch (Exception ignored) {
                // kaputter Parameter wird ignoriert
            }
        }
        return query;
    }

    private static String decode(String value) {
        try {
            return java.net.URLDecoder.decode(value, "UTF-8");
        } catch (Exception error) {
            return value;
        }
    }

    private static void writePage(OutputStream output, String body) throws IOException {
        byte[] data = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: text/html; charset=utf-8\r\n"
                + "Content-Length: " + data.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + "Referrer-Policy: no-referrer\r\n"
                + "Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\r\n"
                + "Connection: close\r\n"
                + "\r\n";
        output.write(head.getBytes(StandardCharsets.UTF_8));
        if (data.length > 0) output.write(data);
        output.flush();
    }

    private static void write(OutputStream output, int status, String type, String body, boolean chunked)
            throws IOException {
        byte[] data = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + data.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + "Referrer-Policy: no-referrer\r\n"
                + "Connection: close\r\n"
                + "\r\n";
        output.write(head.getBytes(StandardCharsets.UTF_8));
        if (data.length > 0) output.write(data);
        output.flush();
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 413: return "Payload Too Large";
            case 429: return "Too Many Requests";
            case 503: return "Service Unavailable";
            case 504: return "Gateway Timeout";
            default: return "Error";
        }
    }
}
