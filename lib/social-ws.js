'use strict';

/**
 * A minimal WebSocket (RFC 6455) for Social rooms (S3) – no dependencies.
 *
 * Electron 33's main process runs Node 20 without a global WebSocket, and
 * `net` cannot upgrade. The room connection needs custom handshake headers
 * anyway (the signed cm-* headers, lib/social-protocol.js), which a browser
 * WebSocket could not send. So:
 *
 * - connect(url, options, handlers) – client over node:http/https (TLS with
 *   certificate checks), masked frames, ping/pong, close codes.
 * - accept(req, socket, head, handlers) – the server side for the smoke
 *   test's fake server (social-main.js createFakeServer).
 *
 * Text messages only, at most 64 KB each; fragments are joined.
 */

const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 64 * 1024;

function acceptKey(key) {
  return crypto.createHash('sha1').update(String(key) + GUID).digest('base64');
}

function encodeFrame(opcode, payload, masked) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload == null ? '' : payload), 'utf8');
  const size = data.length < 126 ? 2 : data.length < 65536 ? 4 : 10;
  const header = Buffer.alloc(size);
  header[0] = 0x80 | opcode;
  const flag = masked ? 0x80 : 0;
  if (data.length < 126) header[1] = flag | data.length;
  else if (data.length < 65536) {
    header[1] = flag | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header[1] = flag | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  if (!masked) return Buffer.concat([header, data]);
  const mask = crypto.randomBytes(4);
  const body = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) body[index] = data[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, body]);
}

function closePayload(code, reason) {
  if (!code) return Buffer.alloc(0);
  const text = Buffer.from(String(reason || '').slice(0, 100), 'utf8');
  const out = Buffer.alloc(2 + text.length);
  out.writeUInt16BE(code, 0);
  text.copy(out, 2);
  return out;
}

/**
 * Frame handling on an upgraded socket, for both sides. `masked` = we are the
 * client. handlers: { message(text), close({ code, reason }) }.
 */
function attach(socket, masked, handlers) {
  let pending = Buffer.alloc(0);
  let parts = [];
  let partOpcode = 0;
  let finished = false;
  let closeSent = false;

  const write = (opcode, payload) => {
    if (finished || socket.destroyed) return false;
    try {
      socket.write(encodeFrame(opcode, payload, masked));
      return true;
    } catch {
      return false;
    }
  };

  const finish = (code, reason) => {
    if (finished) return;
    finished = true;
    try {
      socket.destroy();
    } catch {
      /* gone */
    }
    if (handlers.close) {
      try {
        handlers.close({ code: code || 1006, reason: reason || '' });
      } catch {
        /* a handler must not break the socket */
      }
    }
  };

  const read = (chunk) => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    for (;;) {
      if (finished || pending.length < 2) return;
      const first = pending[0];
      const second = pending[1];
      const final = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const hasMask = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (pending.length < 4) return;
        length = pending.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (pending.length < 10) return;
        const big = pending.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) {
          write(0x8, closePayload(1009, 'zu groß'));
          finish(1009, 'zu groß');
          return;
        }
        length = Number(big);
        offset = 10;
      }
      if (length > MAX_FRAME) {
        write(0x8, closePayload(1009, 'zu groß'));
        finish(1009, 'zu groß');
        return;
      }
      let mask = null;
      if (hasMask) {
        if (pending.length < offset + 4) return;
        mask = pending.subarray(offset, offset + 4);
        offset += 4;
      }
      if (pending.length < offset + length) return;
      let payload = pending.subarray(offset, offset + length);
      if (mask) {
        const copy = Buffer.alloc(length);
        for (let index = 0; index < length; index += 1) copy[index] = payload[index] ^ mask[index % 4];
        payload = copy;
      }
      pending = pending.subarray(offset + length);

      if (opcode === 0x8) {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
        if (!closeSent) write(0x8, payload.length >= 2 ? payload.subarray(0, 2) : Buffer.alloc(0));
        finish(code, reason);
        return;
      }
      if (opcode === 0x9) {
        write(0xa, payload);
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x1 || opcode === 0x2) {
        partOpcode = opcode;
        parts = [payload];
      } else if (opcode === 0x0) {
        parts.push(payload);
      } else continue;
      if (!final) continue;
      const data = Buffer.concat(parts);
      parts = [];
      if (data.length > MAX_FRAME) {
        finish(1009, 'zu groß');
        return;
      }
      if (partOpcode === 0x1 && handlers.message) {
        try {
          handlers.message(data.toString('utf8'));
        } catch {
          /* a handler must not break the socket */
        }
      }
    }
  };

  socket.setNoDelay(true);
  socket.on('data', read);
  socket.on('error', () => finish(1006, 'Verbindungsfehler'));
  socket.on('close', () => finish(1006, 'Verbindung beendet'));

  return {
    read,
    send(text) {
      const data = Buffer.from(String(text), 'utf8');
      return data.length <= MAX_FRAME ? write(0x1, data) : false;
    },
    close(code = 1000, reason = '') {
      if (finished) return;
      closeSent = write(0x8, closePayload(code, reason));
      // Wait briefly for the other side's close frame, then cut.
      const timer = setTimeout(() => finish(code, reason), 1500);
      if (timer.unref) timer.unref();
    },
    get open() {
      return !finished;
    },
  };
}

/**
 * Client: opens ws:// or wss:// with extra handshake headers.
 * handlers: { open(), message(text), close({ code, reason, status, body }) }
 * – a refused handshake (e.g. 401/404 with a JSON body) ends in close() with
 * `status` and the parsed `body`.
 */
function connect(urlString, options, handlers) {
  const done = { closed: false };
  let conn = null;
  const close = (info) => {
    if (done.closed) return;
    done.closed = true;
    if (handlers.close) {
      try {
        handlers.close(info);
      } catch {
        /* ignore */
      }
    }
  };
  let url;
  try {
    url = new URL(String(urlString || ''));
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'ws:' && url.protocol !== 'wss:')) {
    setTimeout(() => close({ code: 1006, reason: 'Ungültige Adresse' }), 0);
    return { send: () => false, close() {}, get open() { return false; } };
  }
  const secure = url.protocol === 'wss:';
  const key = crypto.randomBytes(16).toString('base64');
  const request = (secure ? https : http).request({
    host: url.hostname,
    servername: secure ? url.hostname : undefined,
    port: Number(url.port) || (secure ? 443 : 80),
    path: url.pathname + url.search,
    method: 'GET',
    headers: Object.assign({}, (options && options.headers) || {}, {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Key': key,
      'Sec-WebSocket-Version': '13',
    }),
    timeout: (options && options.timeout) || 15000,
  });
  request.on('upgrade', (response, socket, head) => {
    if (String(response.headers['sec-websocket-accept'] || '') !== acceptKey(key)) {
      socket.destroy();
      close({ code: 1002, reason: 'Handshake abgelehnt' });
      return;
    }
    socket.setTimeout(0);
    conn = attach(socket, true, { message: handlers.message, close });
    if (handlers.open) {
      try {
        handlers.open();
      } catch {
        /* ignore */
      }
    }
    if (head && head.length) conn.read(head);
  });
  request.on('response', (response) => {
    let raw = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      if (raw.length < 4096) raw += chunk;
    });
    response.on('end', () => {
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      close({ code: 1006, reason: `HTTP ${response.statusCode}`, status: response.statusCode, body });
    });
  });
  request.on('timeout', () => request.destroy(new Error('Zeitüberschreitung')));
  request.on('error', (error) => close({ code: 1006, reason: (error && error.message) || 'Verbindungsfehler' }));
  request.end();
  return {
    send: (text) => Boolean(conn && conn.send(text)),
    close(code, reason) {
      if (conn) conn.close(code, reason);
      else {
        request.destroy();
        close({ code: code || 1000, reason: reason || 'getrennt' });
      }
    },
    get open() {
      return Boolean(conn && conn.open);
    },
  };
}

/** Server side (fake server): answer the upgrade and return the connection. */
function accept(req, socket, head, handlers) {
  const key = String(req.headers['sec-websocket-key'] || '');
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return null;
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
  );
  const conn = attach(socket, false, handlers);
  if (head && head.length) conn.read(head);
  return conn;
}

/** A refused upgrade with a JSON body, as the Worker answers it. */
function refuse(socket, status, data) {
  const body = JSON.stringify(data || {});
  socket.end(
    `HTTP/1.1 ${status} Error\r\nContent-Type: application/json; charset=utf-8\r\n` +
      `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
  );
}

module.exports = { connect, accept, refuse, acceptKey, encodeFrame, MAX_FRAME };
