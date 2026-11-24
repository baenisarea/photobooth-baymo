/* Baymo Photobooth server — serves the photobooth page and hosts each finished strip so visitors can download it
   from their phones by scanning the QR code. Node.js 18+, no packages needed.

   Routes
     GET  /                 the photobooth (files in ./public)
     POST /api/strips       body: the PNG strip (Content-Type: image/png) → 201 { id, url, image }
     GET  /s/<id>           the visitor's download page (what the QR code opens)
     GET  /i/<id>.png       the strip image, shown in the browser
     GET  /d/<id>.png       the strip image, downloaded as a file

   Settings (environment variables)
     PORT=8080              port to listen on
     PUBLIC_URL=            the address phones use to reach this server, e.g. https://photobooth.example.org
                            (if empty, it is taken from the request; set it when running behind a proxy)
     DATA_DIR=./data        where strips are stored
     RETENTION_DAYS=30      strips older than this are deleted (0 = keep forever)
     MAX_MB=15              largest accepted upload */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const SITE_DIR = path.resolve(__dirname, 'public');
const RETENTION_DAYS = process.env.RETENTION_DAYS === undefined ? 30 : +process.env.RETENTION_DAYS;
const MAX_BYTES = (+process.env.MAX_MB || 15) * 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const ID = /^[A-Za-z0-9_-]{12}$/;
fs.mkdirSync(DATA_DIR, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const base = (req) => PUBLIC_URL || `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()}://${req.headers['x-forwarded-host'] || req.headers.host}`;
const stripFile = (id) => path.join(DATA_DIR, id + '.png');

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers });
  res.end(body);
}
function cors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Max-Age', '600'); }

/* a light per-address limit so a stuck kiosk or a stranger can't fill the disk */
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now); hits.set(ip, list);
  return list.length > 60;
}

function upload(req, res) {
  cors(res);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return send(res, 429, JSON.stringify({ error: 'Too many uploads, try again shortly' }), { 'Content-Type': 'application/json' });
  const chunks = []; let size = 0, aborted = false;
  req.on('data', (c) => { size += c.length; if (size > MAX_BYTES) { aborted = true; send(res, 413, JSON.stringify({ error: 'Image too large' }), { 'Content-Type': 'application/json' }); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (aborted) return;
    const buf = Buffer.concat(chunks);
    if (buf.length < 64 || !buf.subarray(0, 8).equals(PNG)) return send(res, 400, JSON.stringify({ error: 'Expected a PNG image' }), { 'Content-Type': 'application/json' });
    const id = crypto.randomBytes(9).toString('base64url');              // 12 characters, unguessable
    fs.writeFile(stripFile(id), buf, (err) => {
      if (err) return send(res, 500, JSON.stringify({ error: 'Could not save the strip' }), { 'Content-Type': 'application/json' });
      const b = base(req);
      send(res, 201, JSON.stringify({ id, url: `${b}/s/${id}`, image: `${b}/i/${id}.png` }), { 'Content-Type': 'application/json' });
    });
  });
}

const page = (title, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex"><title>${title}</title>
<style>
  :root { --teal: #009CA6; --deep: #12464E; --ink: #1A1A1A; --ink2: #4F5B5D; }
  * { box-sizing: border-box; } html, body { margin: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: var(--ink); background: #fff radial-gradient(rgba(0,156,166,.16) 1.1px, transparent 1.3px) 9px 9px / 18px 18px; min-height: 100vh; }
  main { max-width: 520px; margin: 0 auto; padding: 22px 20px 40px; text-align: center; }
  header { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 16px; }
  header img { height: 40px; } header b { font-size: 26px; color: var(--teal); letter-spacing: -.4px; }
  h1 { font-size: 26px; letter-spacing: -.6px; margin: 6px 0 6px; } p { color: var(--ink2); line-height: 1.45; margin: 0 0 16px; }
  .strip { display: block; margin: 0 auto 18px; width: min(68vw, 300px); height: auto; border-radius: 6px; box-shadow: 0 12px 30px rgba(18,70,78,.16); background: #fff; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 54px; padding: 0 28px; border-radius: 27px; background: var(--teal); color: #fff; font-size: 18px; font-weight: 700; text-decoration: none; }
  .tip { font-size: 14px; margin-top: 14px; } footer { margin-top: 26px; font-size: 12px; color: #8A9496; }
</style></head><body><main><header><img src="/assets/logo.png" alt=""><b>Baymo</b></header>${body}<footer>Baymo exhibition photobooth</footer></main></body></html>`;

function stripPage(req, res, id) {
  if (!ID.test(id) || !fs.existsSync(stripFile(id))) {
    return send(res, 404, page('Strip not found · Baymo', '<h1>This strip isn’t available</h1><p>The link may have expired. Strips are kept for a limited time after the exhibition.</p>'), { 'Content-Type': 'text/html; charset=utf-8' });
  }
  send(res, 200, page('Your Baymo photo strip', `<h1>Your Baymo photo strip</h1><p>Thank you for visiting! Save your strip below.</p>
    <img class="strip" src="/i/${id}.png" alt="Your Baymo photo strip">
    <a class="btn" href="/d/${id}.png" download="baymo-photo-strip.png">Download your strip</a>
    <p class="tip">On iPhone, you can also press and hold the picture, then choose “Save to Photos”.</p>`), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
}

function image(res, id, attach) {
  if (!ID.test(id)) return send(res, 404, 'Not found');
  fs.readFile(stripFile(id), (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, buf, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*',
      'Content-Disposition': `${attach ? 'attachment' : 'inline'}; filename="baymo-photo-strip.png"` });
  });
}

function staticFile(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(SITE_DIR, '.' + rel);
  if (!file.startsWith(SITE_DIR + path.sep) && file !== SITE_DIR) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, buf, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  });
}

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  let m;
  if (u === '/api/strips' && req.method === 'OPTIONS') { cors(res); return send(res, 204, ''); }
  if (u === '/api/strips' && req.method === 'POST') return upload(req, res);
  if (u === '/api/health') { cors(res); return send(res, 200, JSON.stringify({ ok: true, service: 'baymo-photobooth' }), { 'Content-Type': 'application/json' }); }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  if ((m = u.match(/^\/s\/([^/]+)$/))) return stripPage(req, res, m[1]);
  if ((m = u.match(/^\/i\/([^/]+)\.png$/))) return image(res, m[1], false);
  if ((m = u.match(/^\/d\/([^/]+)\.png$/))) return image(res, m[1], true);
  return staticFile(res, u);
});

/* delete strips past the retention period, once an hour */
function cleanup() {
  if (!(RETENTION_DAYS > 0)) return;
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  fs.readdir(DATA_DIR, (err, names) => {
    if (err) return;
    names.filter((n) => n.endsWith('.png')).forEach((n) => { const p = path.join(DATA_DIR, n); fs.stat(p, (e, st) => { if (!e && st.mtimeMs < cutoff) fs.unlink(p, () => {}); }); });
  });
}
setInterval(cleanup, 3600000).unref(); cleanup();

server.listen(PORT, () => console.log(`Baymo photobooth on port ${PORT}${PUBLIC_URL ? ` · public address ${PUBLIC_URL}` : ''} · strips in ${DATA_DIR} · kept ${RETENTION_DAYS > 0 ? RETENTION_DAYS + ' days' : 'forever'}`));
