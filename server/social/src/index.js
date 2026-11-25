/**
 * CleanMusic Social (Weg B) – Cloudflare Worker entry.
 *
 * The Worker only forwards /v1/* to one Durable Object ("hub", SQLite) that
 * lives in the EU jurisdiction. The client IP never travels further than this
 * file: only its network prefix (/24 for IPv4, /48 for IPv6) goes to the hub,
 * which hashes it with a salt that changes every day (rate limits only).
 */
import { SocialHub } from './hub.js';

export { SocialHub };

/** 203.0.113.7 → 203.0.113, 2001:db8:1:2::5 → 2001:db8:1 – never the full address. */
export function ipPrefix(ip) {
  const value = String(ip || '').trim();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(value);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}`;
  if (value.includes(':')) {
    const [head, tail = ''] = value.toLowerCase().split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const groups = left.concat(new Array(Math.max(0, 8 - left.length - right.length)).fill('0'), right);
    return groups.slice(0, 3).map((group) => group.replace(/^0+(?=.)/, '')).join(':');
  }
  return 'unbekannt';
}

function hubStub(env) {
  // Production: the data stays in the EU. Local runs (Miniflare, wrangler dev)
  // do not support jurisdictions and set LOCAL_DEV=true (never in wrangler.toml).
  const namespace = env.LOCAL_DEV === 'true' ? env.HUB : env.HUB.jurisdiction('eu');
  return namespace.get(namespace.idFromName('hub'));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/')) {
      return new Response('CleanMusic Social', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    const headers = new Headers(request.headers);
    headers.set('cm-ip', ipPrefix(request.headers.get('cf-connecting-ip')));
    return hubStub(env).fetch(new Request(request, { headers }));
  },
};
