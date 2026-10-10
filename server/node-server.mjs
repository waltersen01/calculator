/* Finanzkompass – Enable-Banking-Proxy als eigenständiger Node-Server (Docker statt Cloudflare Worker).
   Nutzt denselben Code wie der Worker; Einstellungen kommen aus Umgebungsvariablen. */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import worker from './enablebanking-proxy.js';

const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    console.warn(e.code === 'EACCES'
      ? `Schlüsseldatei ${file} ist nicht lesbar – Dateirechte prüfen (z. B. chmod 644 secrets/enablebanking.pem).`
      : `Schlüsseldatei ${file} nicht gefunden – lege den privaten Schlüssel als secrets/enablebanking.pem ab.`);
    return '';
  }
};

const env = {
  EB_APP_ID: process.env.EB_APP_ID || '',
  EB_PRIVATE_KEY: process.env.EB_PRIVATE_KEY || (process.env.EB_PRIVATE_KEY_FILE ? read(process.env.EB_PRIVATE_KEY_FILE) : ''),
  ACCESS_TOKEN: process.env.ACCESS_TOKEN || '',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '',
  EB_API_URL: process.env.EB_API_URL || '',
};
const configured = Boolean(env.EB_APP_ID && env.EB_PRIVATE_KEY && env.ACCESS_TOKEN);
const PORT = Number(process.env.PORT) || 8787;

const server = http.createServer(async (req, res) => {
  try {
    // Statusabfrage ohne Token: Die App erkennt so den Proxy im Docker-Container
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ service: 'finanzkompass-proxy', configured }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const name of ['origin', 'authorization', 'content-type']) if (req.headers[name]) headers.set(name, req.headers[name]);
    const hasBody = !['GET', 'HEAD'].includes(req.method) && chunks.length > 0;
    const request = new Request(new URL(req.url, 'http://localhost'), { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
    const response = await worker.fetch(request, env);
    const out = {};
    response.headers.forEach((value, name) => { out[name] = value; });
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy_error', message: 'Enable Banking ist nicht erreichbar: ' + e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Finanzkompass-Proxy läuft auf Port ${PORT}${configured ? '' : ' – noch nicht eingerichtet (EB_APP_ID, EB_PRIVATE_KEY_FILE, ACCESS_TOKEN fehlen)'}`);
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
