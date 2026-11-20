'use strict';

/**
 * Optional Discord Rich Presence ("Hört gerade …").
 *
 * Talks to the locally running Discord client over its official IPC
 * socket (named pipe on Windows, unix socket elsewhere) – the same
 * mechanism every game uses. Needs a Discord application ID that the
 * user creates once in the Discord developer portal; its name is what
 * Discord shows ("Hört CleanMusic").
 *
 * Frame format: int32 LE opcode, int32 LE length, UTF-8 JSON.
 */

const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const MIN_INTERVAL = 4500; // Discord allows ~5 activity updates per 20 s.

function socketPaths() {
  const paths = [];
  for (let index = 0; index < 10; index += 1) {
    if (process.platform === 'win32') {
      paths.push(`\\\\?\\pipe\\discord-ipc-${index}`);
    } else {
      const base =
        process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
      paths.push(
        path.join(base, `discord-ipc-${index}`),
        path.join(base, 'app', 'com.discordapp.Discord', `discord-ipc-${index}`),
        path.join(base, 'snap.discord', `discord-ipc-${index}`)
      );
    }
  }
  return paths;
}

function encode(op, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function clip(value, max) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

class DiscordPresence {
  constructor() {
    this.enabled = false;
    this.clientId = '';
    this.showArtwork = true;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.ready = false;
    this.user = null;
    this.error = null;
    this.connecting = false;
    this.retryTimer = null;
    this.retryDelay = 5000;
    this.sendTimer = null;
    this.lastSentAt = 0;
    this.lastPayload = null;
    this.pending = undefined; // undefined = nothing queued, null = clear
    this.listeningType = true; // falls back to "Playing" if Discord rejects type 2
    this.onChange = null;
  }

  configure({ enabled, clientId, showArtwork }) {
    const id = String(clientId || '').trim();
    const nextEnabled = Boolean(enabled) && /^\d{15,25}$/.test(id);
    const changed = nextEnabled !== this.enabled || id !== this.clientId;

    this.enabled = nextEnabled;
    this.clientId = id;
    this.showArtwork = showArtwork !== false;
    this.error = enabled && !/^\d{15,25}$/.test(id) ? 'Bitte eine gültige Application-ID eintragen.' : null;

    if (changed) {
      this.disconnect();
      this.retryDelay = 5000;
      if (this.enabled) this.connect();
    }
    this.emit();
  }

  status() {
    return {
      enabled: this.enabled,
      connected: Boolean(this.socket) && this.ready,
      connecting: this.connecting,
      user: this.user,
      error: this.error,
    };
  }

  emit() {
    if (typeof this.onChange === 'function') this.onChange(this.status());
  }

  async connect() {
    if (!this.enabled || this.socket || this.connecting) return;
    this.connecting = true;
    this.emit();

    for (const candidate of socketPaths()) {
      const socket = await new Promise((resolve) => {
        const attempt = net.connect(candidate);
        const fail = () => {
          attempt.destroy();
          resolve(null);
        };
        attempt.once('connect', () => {
          attempt.off('error', fail);
          resolve(attempt);
        });
        attempt.once('error', fail);
      });

      if (!socket) continue;
      if (!this.enabled) {
        socket.destroy();
        break;
      }

      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => this.onData(chunk));
      socket.on('error', () => {});
      socket.on('close', () => this.onClose());
      socket.write(encode(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
      break;
    }

    this.connecting = false;
    if (!this.socket) {
      this.error = 'Discord läuft nicht (oder blockiert Rich Presence).';
      this.scheduleRetry();
    }
    this.emit();
  }

  disconnect() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.sendTimer);
    this.retryTimer = null;
    this.sendTimer = null;
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      try {
        socket.end();
        socket.destroy();
      } catch {
        /* ignore */
      }
    }
    this.ready = false;
    this.user = null;
    this.lastPayload = null;
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (!this.enabled) return;
    this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
    this.retryDelay = Math.min(60000, this.retryDelay * 2);
  }

  onClose() {
    const wasReady = this.ready;
    this.socket = null;
    this.ready = false;
    if (wasReady && !this.error) this.error = 'Verbindung zu Discord getrennt.';
    this.emit();
    this.scheduleRetry();
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 8) {
      const op = this.buffer.readInt32LE(0);
      const length = this.buffer.readInt32LE(4);
      if (this.buffer.length < 8 + length) break;

      const raw = this.buffer.slice(8, 8 + length).toString('utf8');
      this.buffer = this.buffer.slice(8 + length);

      let message = null;
      try {
        message = JSON.parse(raw);
      } catch {
        continue;
      }
      this.onMessage(op, message);
    }
  }

  onMessage(op, message) {
    if (op === OP.PING) {
      if (this.socket) this.socket.write(encode(OP.PONG, message));
      return;
    }

    if (op === OP.CLOSE) {
      this.error =
        message && message.code === 4000
          ? 'Discord kennt diese Application-ID nicht.'
          : `Discord hat die Verbindung beendet${message && message.message ? `: ${message.message}` : ''}.`;
      this.retryDelay = 60000;
      this.emit();
      return;
    }

    if (op !== OP.FRAME || !message) return;

    if (message.cmd === 'DISPATCH' && message.evt === 'READY') {
      this.ready = true;
      this.error = null;
      this.retryDelay = 5000;
      const user = message.data && message.data.user;
      this.user = user ? user.global_name || user.username || null : null;
      this.emit();
      if (this.pending !== undefined || this.lastPayload) this.flush(true);
      return;
    }

    if (message.evt === 'ERROR') {
      const text = (message.data && message.data.message) || 'Unbekannter Fehler';
      // Older Discord builds reject the "Listening" activity type.
      if (this.listeningType && /type/i.test(text)) {
        this.listeningType = false;
        if (this.lastPayload) this.flush(true);
        return;
      }
      this.error = `Discord: ${text}`;
      this.emit();
    }
  }

  buildActivity(track) {
    if (!track || !track.title) return null;

    const activity = {
      type: this.listeningType ? 2 : 0,
      details: clip(track.title, 128),
      state: clip(
        track.playing
          ? track.artist
            ? `von ${track.artist}`
            : track.source || 'CleanMusic'
          : `Pausiert${track.artist ? ` · ${track.artist}` : ''}`,
        128
      ),
      instance: false,
    };

    const assets = {};
    const artwork = String(track.artwork || '');
    if (this.showArtwork && /^https:\/\//i.test(artwork) && artwork.length < 300) {
      assets.large_image = artwork;
    } else {
      assets.large_image = 'logo';
    }
    const largeText = clip(track.album || track.source || 'CleanMusic', 128);
    if (largeText.length >= 2) assets.large_text = largeText;
    activity.assets = assets;

    if (track.playing) {
      const now = Date.now();
      const position = Math.max(0, Number(track.position) || 0);
      const duration = Number(track.duration) || 0;
      const start = Math.round(now - position * 1000);
      activity.timestamps =
        duration > 0 && !track.live ? { start, end: Math.round(start + duration * 1000) } : { start };
    }

    const link = String(track.link || '');
    if (/^https:\/\//i.test(link) && link.length <= 512) {
      activity.buttons = [{ label: clip(track.linkLabel || 'Anhören', 32), url: link }];
    }

    return activity;
  }

  update(track) {
    if (!this.enabled) return;
    this.pending = this.buildActivity(track);
    this.flush(false);
  }

  clear() {
    if (!this.enabled) return;
    this.pending = null;
    this.flush(false);
  }

  flush(force) {
    clearTimeout(this.sendTimer);
    if (!this.socket || !this.ready) return;

    const wait = force ? 0 : Math.max(0, MIN_INTERVAL - (Date.now() - this.lastSentAt));
    this.sendTimer = setTimeout(() => {
      if (!this.socket || !this.ready) return;
      const activity = this.pending !== undefined ? this.pending : this.lastPayload;
      this.pending = undefined;
      this.lastPayload = activity;
      if (activity && typeof activity.type === 'number') activity.type = this.listeningType ? 2 : 0;
      this.lastSentAt = Date.now();
      this.socket.write(
        encode(OP.FRAME, {
          cmd: 'SET_ACTIVITY',
          args: { pid: process.pid, activity: activity || undefined },
          nonce: crypto.randomUUID(),
        })
      );
    }, wait);
  }

  shutdown() {
    this.enabled = false;
    this.disconnect();
  }
}

module.exports = { DiscordPresence };
