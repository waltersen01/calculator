/* Finanzkompass – Proxy für die Enable Banking API
 *
 * Aufgabe: den privaten API-Schlüssel sicher verwahren, Anfragen der App mit einem
 * kurzlebigen JWT (RS256) signieren und an https://api.enablebanking.com weiterreichen.
 * Läuft als Cloudflare Worker oder im Docker-Container (siehe node-server.mjs).
 *
 * Einstellungen (Worker: Settings → Variables and Secrets, Docker: .env):
 *   EB_APP_ID       Application ID aus dem Enable Banking Control Panel (Text)
 *   EB_PRIVATE_KEY  Inhalt der privaten Schlüsseldatei (.pem) – als Secret
 *   ACCESS_TOKEN    Ein langes Zufallspasswort, das du auch in der App einträgst – als Secret
 *   ALLOWED_ORIGIN  Adresse(n) deiner App ohne Pfad, kommagetrennt, z. B. https://dein-name.github.io
 */

const API = 'https://api.enablebanking.com';
// Nur diese Endpunkte werden durchgereicht (nur Kontoinformationen, keine Zahlungen)
const ALLOWED_PATH = /^\/(aspsps|application|auth|sessions(\/[A-Za-z0-9-]+)?|accounts\/[A-Za-z0-9-]+\/(balances|transactions|details))$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    // Ohne Origin-Header: Aufruf von derselben Adresse (Docker/nginx) oder kein Browser – das Token schützt trotzdem
    const originOk = !origin || !allowed.length || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk && origin ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!originOk) return json({ error: 'origin not allowed', message: `Die Adresse ${origin} ist im Proxy nicht freigegeben. Ergänze sie in ALLOWED_ORIGIN.` }, 403, cors);

    const auth = request.headers.get('Authorization') || '';
    if (!env.ACCESS_TOKEN || !safeEqual(auth, 'Bearer ' + env.ACCESS_TOKEN)) return json({ error: 'unauthorized' }, 401, cors);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (!ALLOWED_PATH.test(path)) return json({ error: 'not found' }, 404, cors);
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'method not allowed' }, 405, cors);

    let body;
    if (request.method === 'POST') {
      body = await request.text();
      // Rücksprung nur zur eigenen App erlauben
      if (path === '/auth' && allowed.length) {
        try {
          const redirect = JSON.parse(body).redirect_url || '';
          if (!allowed.some((o) => redirect.startsWith(o + '/'))) return json({ error: 'redirect_url not allowed', message: `Die Rücksprung-Adresse ${redirect} ist im Proxy nicht freigegeben. Ergänze ihre Adresse in ALLOWED_ORIGIN.` }, 400, cors);
        } catch (e) {
          return json({ error: 'invalid json' }, 400, cors);
        }
      }
    }

    let jwt;
    try {
      jwt = await makeJwt(env.EB_APP_ID, env.EB_PRIVATE_KEY);
    } catch (e) {
      return json({ error: 'key_invalid', message: 'Proxy nicht eingerichtet oder Schlüssel ungültig: ' + e.message }, 500, cors);
    }
    const upstream = await fetch(String(env.EB_API_URL || API).replace(/\/+$/, '') + path + url.search, {
      method: request.method,
      headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
      body,
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' },
    });
  },
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function makeJwt(appId, pem) {
  if (!appId) throw new Error('EB_APP_ID fehlt');
  if (!pem) throw new Error('EB_PRIVATE_KEY fehlt');
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = enc({ typ: 'JWT', alg: 'RS256', kid: appId }) + '.' + enc({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return data + '.' + b64url(new Uint8Array(sig));
}

/** PEM einlesen; ältere „BEGIN RSA PRIVATE KEY“-Schlüssel (PKCS#1) werden nach PKCS#8 verpackt */
function pemToPkcs8(pem) {
  const isPkcs1 = /BEGIN RSA PRIVATE KEY/.test(pem);
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (!isPkcs1) return der.buffer;
  const len = (n) => {
    if (n < 0x80) return [n];
    const out = [];
    while (n > 0) { out.unshift(n & 0xff); n >>= 8; }
    return [0x80 | out.length, ...out];
  };
  const version = [0x02, 0x01, 0x00];
  const algorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...len(der.length)];
  const inner = version.length + algorithm.length + octet.length + der.length;
  const head = [0x30, ...len(inner), ...version, ...algorithm, ...octet];
  const out = new Uint8Array(head.length + der.length);
  out.set(head, 0);
  out.set(der, head.length);
  return out.buffer;
}
