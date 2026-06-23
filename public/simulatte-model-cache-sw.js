const CACHE_PREFIX = 'simulatte-embedding-model-';
const MODEL_PATH_MARKER = '/Clocksmith/rdrr/resolve/';

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
  const cached = await cachedModelResponse(request.url);
  if (!cached) return fetch(request);
  const range = request.headers.get('range');
  if (!range) return cached;
  return rangedResponse(cached, range);
}

async function cachedModelResponse(url) {
  const names = await caches.keys();
  for (const name of names) {
    if (!name.startsWith(CACHE_PREFIX)) continue;
    const cache = await caches.open(name);
    const response = await cache.match(url);
    if (response) return response;
  }
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
