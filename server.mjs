// Minimal zero-dependency static server for the built app (dist/).
// - Unknown pages redirect to "/" (the start screen); missing assets are a plain 404.
// - Range requests (audio seeking/looping), long-lived caching for hashed assets.
// - /healthz for Docker/orchestrators, graceful shutdown on SIGTERM/SIGINT.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
// Optional folder with the soundtrack (e.g. a Docker volume); used when the
// build itself has no /audio file.
const audioDir = process.env.AUDIO_DIR ? normalize(process.env.AUDIO_DIR) : null;

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

const baseHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'SAMEORIGIN',
};

function send(res, status, headers = {}, body = '') {
  res.writeHead(status, { ...baseHeaders, ...headers });
  res.end(body);
}

async function fileFor(pathname) {
  const file = normalize(join(root, pathname));
  if (file !== root && !file.startsWith(root + sep)) return null; // path traversal
  try {
    const st = await stat(file);
    if (st.isFile()) return { file, st };
    if (st.isDirectory()) {
      const index = join(file, 'index.html');
      const ist = await stat(index);
      if (ist.isFile()) return { file: index, st: ist };
    }
  } catch {}
  return null;
}

async function audioFile(pathname) {
  const file = join(audioDir, basename(pathname));
  try {
    const st = await stat(file);
    return st.isFile() ? { file, st } : null;
  } catch { return null; }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { allow: 'GET, HEAD' }, 'Method Not Allowed');
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send(res, 400, {}, 'Bad Request');
    }
    if (pathname === '/healthz') return send(res, 200, { 'content-type': 'text/plain' }, 'ok');

    const found = await fileFor(pathname)
      ?? (extname(pathname) ? null : await fileFor(pathname.replace(/\/$/, '') + '.html'))
      ?? (audioDir && pathname.startsWith('/audio/') ? await audioFile(pathname) : null);
    if (!found) {
      // A missing asset is a real 404; any other unknown URL goes back home.
      if (extname(pathname)) return send(res, 404, { 'content-type': 'text/plain' }, 'Not Found');
      return send(res, 302, { location: '/' });
    }

    const { file, st } = found;
    const headers = {
      'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'accept-ranges': 'bytes',
      'last-modified': st.mtime.toUTCString(),
      // Vite emits content-hashed files under /assets/<name>-<hash>.ext.
      'cache-control': /\/assets\/.+-[\w-]{8,}\.\w+$/.test(file.replaceAll('\\', '/'))
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    };

    let start = 0, end = st.size - 1, status = 200;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(Number(range[2]), st.size - 1);
      } else {
        start = Math.max(0, st.size - Number(range[2]));
      }
      if (start > end || start >= st.size) {
        return send(res, 416, { 'content-range': `bytes */${st.size}` });
      }
      status = 206;
      headers['content-range'] = `bytes ${start}-${end}/${st.size}`;
    }
    headers['content-length'] = end - start + 1;
    res.writeHead(status, { ...baseHeaders, ...headers });
    if (req.method === 'HEAD') return res.end();

    const stream = createReadStream(file, { start, end });
    stream.on('error', err => {
      console.error('[server] read error', err);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) send(res, 500, { 'content-type': 'text/plain' }, 'Internal Server Error');
    else res.destroy();
  }
});

server.listen(port, host, () => {
  console.log(`Gargantua Kerr Lab: http://localhost:${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[server] ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
