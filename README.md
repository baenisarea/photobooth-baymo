# Baymo Photobooth

The exhibition photobooth page plus a small server. When a visitor presses **Done**, the strip is uploaded here and the
QR code opens that strip's own download page on their phone. No packages to install; Node.js 18 or newer.

## Run it

    node server.js                      # then open http://localhost:8080 on the kiosk

## Put it online (needed for the QR code)

Visitors' phones must be able to reach this server, so run it on a host with a public address, e.g. Render, Railway,
Fly.io or any VPS, then open that address on the kiosk.

| Setting (environment variable) | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on (most hosts set this for you) |
| `PUBLIC_URL` | from the request | The public address, e.g. `https://photobooth.example.org` — set it if the QR codes show the wrong address |
| `DATA_DIR` | `./data` | Where strips are saved. On hosts with temporary disks, point this at a persistent volume |
| `RETENTION_DAYS` | `30` | Strips older than this are deleted (`0` keeps them forever) |
| `MAX_MB` | `15` | Largest accepted upload |

Use HTTPS on the public address: browsers only allow the kiosk camera on `https://` (or `localhost`).

## Pointing the kiosk at the server

- **Simplest:** open the server's own address on the kiosk (`https://photobooth.example.org/`). Nothing else to set.
- **Page hosted somewhere else** (another static site): tell the page where the server is, in any one of these ways:
  - open the page as `https://your-site/photobooth/?api=https://photobooth.example.org` (remembered on that screen),
  - or set `apiBase: 'https://photobooth.example.org'` in `public/assets/config.js`,
  - or tap the Baymo logo 5 times (or press Ctrl+Shift+U), enter the address, press **Test connection**, then **Save**.
- Both addresses must use **https**: browsers block the camera on plain http, and block an http server from an https page.
- The claude.ai artifact preview can't do either: it blocks the camera and any request to another server, so there it
  always falls back to the on-screen download.

## What it serves

- `/` — the photobooth
- `POST /api/strips` — receives a strip (PNG), replies `{ id, url, image }`
- `/s/<id>` — the visitor's download page (what the QR code opens)
- `/i/<id>.png`, `/d/<id>.png` — the image, shown or downloaded
- `/api/health` — returns `{ "ok": true }`

Each strip gets a random 12-character id, so links can't be guessed. If the server can't be reached, the Done screen
says so and offers a download on the kiosk instead. Strips are visitors' photos: tell visitors how long they are kept.
