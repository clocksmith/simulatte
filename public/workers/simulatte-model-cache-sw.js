const CACHE_PREFIX = 'simulatte-embedding-model-';
const MODEL_PATH_MARKER = '/Clocksmith/rdrr/resolve/';
const OPFS_ROOT = 'simulatte-model-cache';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !isModelRequest(request.url)) return;
  event.respondWith(responseFromModelCache(request));
});

function isModelRequest(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'huggingface.co' && parsed.pathname.includes(MODEL_PATH_MARKER);
  } catch (_err) {
    return false;
  }
}

async function responseFromModelCache(request) {
  const range = request.headers.get('range');
  const opfs = await opfsModelResponse(request.url, range);
  if (opfs) return opfs;
  const cached = await cachedModelResponse(request.url);
  if (!cached) return fetch(request);
  if (!range) return cached;
  return rangedResponse(cached, range);
}

async function cachedModelResponse(url) {
  if (typeof caches === 'undefined') return null;
  const names = await caches.keys();
  for (const name of names) {
    if (!name.startsWith(CACHE_PREFIX)) continue;
    const cache = await caches.open(name);
    const response = await cache.match(url);
    if (response) return response;
  }
  return null;
}

async function opfsModelResponse(url, rangeHeader) {
  const file = await cachedOpfsFile(url);
  if (!file) return null;
  const range = parseRange(rangeHeader);
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': contentTypeForPath(url),
    'Content-Length': String(file.size),
    'X-Simulatte-Model-Cache': 'opfs',
  });
  if (!range) {
    return new Response(file.stream ? file.stream() : file, {
      status: 200,
      headers,
    });
  }
  const start = Math.min(range.start, Math.max(0, file.size - 1));
  const end = Math.min(range.end == null ? file.size - 1 : range.end, file.size - 1);
  if (end < start) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${file.size}`,
      },
    });
  }
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
  return new Response(file.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
}

async function cachedOpfsFile(url) {
  if (
    typeof navigator === 'undefined' ||
    !navigator.storage ||
    typeof navigator.storage.getDirectory !== 'function'
  ) {
    return null;
  }
  try {
    const root = await navigator.storage.getDirectory();
    const cacheRoot = await root.getDirectoryHandle(OPFS_ROOT);
    const filename = opfsCacheFileName(url);
    for await (const [, handle] of cacheRoot.entries()) {
      if (!handle || handle.kind !== 'directory') continue;
      try {
        const fileHandle = await handle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        if (file.size > 0) return file;
      } catch (_err) {}
    }
  } catch (_err) {}
  return null;
}

async function rangedResponse(response, rangeHeader) {
  const range = parseRange(rangeHeader);
  if (!range) return response;
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  const start = Math.min(range.start, Math.max(0, bytes.byteLength - 1));
  const end = Math.min(range.end == null ? bytes.byteLength - 1 : range.end, bytes.byteLength - 1);
  if (end < start) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${bytes.byteLength}`,
      },
    });
  }
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Content-Range', `bytes ${start}-${end}/${bytes.byteLength}`);
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
}

function parseRange(header) {
  const match = /^bytes=(\d+)-(\d*)$/i.exec(String(header || '').trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : null;
  if (!Number.isFinite(start) || start < 0 || (end != null && (!Number.isFinite(end) || end < start))) {
    return null;
  }
  return { start, end };
}

function opfsCacheFileName(url) {
  return `${hashString(url)}-${safeCacheSegment(urlBasename(url))}`;
}

function urlBasename(url) {
  try {
    const path = new URL(url).pathname;
    return path.split('/').filter(Boolean).pop() || 'artifact';
  } catch (_err) {
    return 'artifact';
  }
}

function safeCacheSegment(value) {
  const text = String(value || 'cache').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '');
  return text || 'cache';
}

function hashString(str) {
  let hash = 2166136261;
  const value = String(str || '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function contentTypeForPath(path) {
  if (/\.json($|\?)/i.test(path)) return 'application/json';
  return 'application/octet-stream';
}
