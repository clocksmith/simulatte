import http from 'node:http';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(appRoot, 'public');
const workspaceRoot = path.resolve(appRoot, '..');
const dopplerRoot = path.join(workspaceRoot, 'doppler');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.bin', 'application/octet-stream'],
  ['.safetensors', 'application/octet-stream'],
]);

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function resolveRequestPath(urlPathname) {
  const pathname = decodeURIComponent(String(urlPathname || '/'));
  if (pathname.startsWith('/doppler/')) {
    return {
      baseDir: dopplerRoot,
      relativePath: pathname.slice('/doppler/'.length),
    };
  }
  return {
    baseDir: publicRoot,
    relativePath: pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''),
  };
}

function safeJoin(baseDir, relativePath) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    return null;
  }
  return resolved;
}

async function resolveFilePath(baseDir, relativePath) {
  const candidate = safeJoin(baseDir, relativePath);
  if (!candidate) return null;
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const nested = path.join(candidate, 'index.html');
      await access(nested);
      return nested;
    }
    return candidate;
  } catch {
    return null;
  }
}

function parseByteRange(rangeHeader, size) {
  const raw = String(rangeHeader || '').trim();
  if (!raw) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!match) return { invalid: true };
  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart && !hasEnd) return { invalid: true };

  let start;
  let end;
  if (!hasStart) {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = hasEnd ? Number(match[2]) : size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

const server = http.createServer(async (req, res) => {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  const url = new URL(req.url || '/', `http://${host}:${port}`);
  const { baseDir, relativePath } = resolveRequestPath(url.pathname);
  const filePath = await resolveFilePath(baseDir, relativePath);
  if (!filePath) {
    send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
  const info = await stat(filePath);
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  };
  const range = parseByteRange(req.headers.range, info.size);
  if (range && range.invalid) {
    send(res, 416, 'Range Not Satisfiable', {
      ...headers,
      'Content-Range': `bytes */${info.size}`,
    });
    return;
  }
  if (range) {
    const contentLength = range.end - range.start + 1;
    const rangeHeaders = {
      ...headers,
      'Content-Length': String(contentLength),
      'Content-Range': `bytes ${range.start}-${range.end}/${info.size}`,
    };
    if (method === 'HEAD') {
      res.writeHead(206, rangeHeaders);
      res.end();
      return;
    }
    res.writeHead(206, rangeHeaders);
    createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }
  headers['Content-Length'] = String(info.size);
  if (method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Simulatte local server listening on http://${host}:${port}/`);
});
