import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.safetensors': 'application/octet-stream',
});

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function safeJoin(baseDirectory, relativePath) {
  const base = path.resolve(baseDirectory);
  const resolved = path.resolve(base, relativePath);
  return resolved === base || resolved.startsWith(`${base}${path.sep}`) ? resolved : null;
}

async function resolveFile(baseDirectory, relativePath) {
  const candidate = safeJoin(baseDirectory, relativePath);
  if (!candidate) return { status: 403, file: null };
  try {
    const info = await stat(candidate);
    if (!info.isDirectory()) return { status: 200, file: candidate, info };
    const nested = path.join(candidate, 'index.html');
    const nestedInfo = await stat(nested);
    return nestedInfo.isFile()
      ? { status: 200, file: nested, info: nestedInfo }
      : { status: 404, file: null };
  } catch {
    return { status: 404, file: null };
  }
}

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(header || '').trim());
  if (!match || (!match[1] && !match[2])) return header ? { invalid: true } : null;
  const suffix = !match[1];
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = suffix ? size - 1 : (match[2] ? Number(match[2]) : size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

function requestLocation(publicRoot, mounts, pathname) {
  const mount = mounts.find((entry) => pathname.startsWith(entry.prefix));
  if (mount) return { root: mount.root, relativePath: pathname.slice(mount.prefix.length), allowsSpaFallback: false };
  return {
    root: publicRoot,
    relativePath: pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''),
    allowsSpaFallback: true,
  };
}

export function createStaticSiteHandler({
  publicRoot,
  mounts = [],
  cacheControl = 'no-store',
  onRequest = null,
} = {}) {
  if (!publicRoot) throw new Error('static_site_server_public_root_missing');
  const normalizedMounts = mounts.map((entry) => ({
    prefix: entry.prefix.endsWith('/') ? entry.prefix : `${entry.prefix}/`,
    root: path.resolve(entry.root),
  }));

  return async function handleStaticSiteRequest(request, response) {
    const method = String(request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      onRequest?.({ pathname: null, status: 405, file: null });
      send(response, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    } catch {
      onRequest?.({ pathname: null, status: 400, file: null });
      send(response, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }

    try {
      const location = requestLocation(path.resolve(publicRoot), normalizedMounts, pathname);
      let resolved = await resolveFile(location.root, location.relativePath);
      if (resolved.status === 404 && location.allowsSpaFallback && !path.extname(pathname)) {
        const entry = pathname.startsWith('/blank/') ? 'blank/index.html' : 'index.html';
        resolved = await resolveFile(publicRoot, entry);
      }
      if (!resolved.file) {
        onRequest?.({ pathname, status: resolved.status, file: null });
        send(response, resolved.status, resolved.status === 403 ? 'Forbidden' : 'Not Found', {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        return;
      }

      const headers = {
        'Content-Type': MIME_TYPES[path.extname(resolved.file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': cacheControl,
        'Accept-Ranges': 'bytes',
      };
      const range = byteRange(request.headers.range, resolved.info.size);
      if (range?.invalid) {
        onRequest?.({ pathname, status: 416, file: resolved.file });
        send(response, 416, 'Range Not Satisfiable', { ...headers, 'Content-Range': `bytes */${resolved.info.size}` });
        return;
      }

      const status = range ? 206 : 200;
      const streamOptions = range ? { start: range.start, end: range.end } : undefined;
      headers['Content-Length'] = String(range ? range.end - range.start + 1 : resolved.info.size);
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${resolved.info.size}`;
      onRequest?.({ pathname, status, file: resolved.file });
      response.writeHead(status, headers);
      if (method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(resolved.file, streamOptions).pipe(response);
    } catch (error) {
      onRequest?.({ pathname, status: 500, file: null, error });
      send(response, 500, 'Internal Server Error', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
  };
}

export function createStaticSiteServer(options) {
  return http.createServer(createStaticSiteHandler(options));
}
