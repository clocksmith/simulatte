#!/usr/bin/env node
import { createServer } from 'node:http';
import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.SIMULATTE_REVIEW_DIR || path.join(ROOT, 'artifacts', 'simulatte-human-reviews'));
const REVIEW_LOG = path.join(DATA_DIR, 'reviews.jsonl');
const DRAFT_PATH = path.join(DATA_DIR, 'draft.json');
const HOST = process.env.HOST || process.env.SIMULATTE_REVIEW_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || process.env.SIMULATTE_REVIEW_PORT || 4766);
const MAX_BODY_BYTES = 1024 * 1024;
const clients = new Set();

await mkdir(DATA_DIR, { recursive: true });

function corsHeaders(req) {
  const origin = req.headers.origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
}

function sendJson(req, res, statusCode, body) {
  res.writeHead(statusCode, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendText(req, res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    ...corsHeaders(req),
    'Content-Type': contentType,
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function hashRecord(record) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(record))
    .digest('hex')
    .slice(0, 16);
}

function stringValue(value, max = 4000) {
  return String(value || '').slice(0, max);
}

function stringArray(value, maxRows = 32, maxChars = 120) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((row) => String(row || '').trim().slice(0, maxChars))
    .filter(Boolean)))
    .slice(0, maxRows);
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compactJson(value, maxChars = 24000) {
  if (!value || typeof value !== 'object') return value || null;
  const raw = JSON.stringify(value);
  const clipped = raw.length > maxChars ? raw.slice(0, maxChars) : raw;
  try {
    return JSON.parse(clipped);
  } catch {
    return {
      clipped: true,
      preview: clipped.slice(0, 2000),
    };
  }
}

function compactRecord(input = {}, type = 'review') {
  const diagnostics = input.diagnostics && typeof input.diagnostics === 'object'
    ? input.diagnostics
    : {};
  const record = {
    schema: 'simulatte.humanVisualReview.v1',
    id: stringValue(input.id, 80) || '',
    type,
    createdAt: new Date().toISOString(),
    clientCreatedAt: stringValue(input.clientCreatedAt, 80),
    runId: stringValue(input.runId, 120),
    status: stringValue(input.status || (type === 'draft' ? 'draft' : 'review'), 40),
    prompt: stringValue(input.prompt, 8000),
    note: stringValue(input.note, 12000),
    tags: stringArray(input.tags, 32, 80),
    expected: stringValue(input.expected, 4000),
    phaseId: stringValue(input.phaseId, 80),
    phaseLabel: stringValue(input.phaseLabel, 120),
    phaseFrom: numberValue(input.phaseFrom, 0),
    phaseTo: numberValue(input.phaseTo, 0),
    pipelinePhase: compactJson(input.pipelinePhase, 4000),
    artifactSummary: compactJson(input.artifactSummary, 32000),
    artifactHash: stringValue(input.artifactHash, 160),
    appUrl: stringValue(input.appUrl, 2000),
    build: stringValue(input.build, 120),
    diagnostics: {
      currentPhase: compactJson(diagnostics.currentPhase, 4000),
      rendererSceneKind: stringValue(diagnostics.rendererSceneKind, 120),
      visualIRSceneKind: stringValue(diagnostics.visualIRSceneKind, 120),
      visualIRCamera: stringValue(diagnostics.visualIRCamera, 120),
      mappingIds: stringArray(diagnostics.mappingIds, 64, 160),
      uniformSlots: stringArray(diagnostics.uniformSlots, 64, 80),
      wgslOperators: stringArray(diagnostics.wgslOperators, 64, 120),
      canvasHash: stringValue(diagnostics.canvasHash, 120),
      renderCount: Number(diagnostics.renderCount || 0),
      fps: numberValue(diagnostics.fps, 0),
      rendererStatus: stringValue(diagnostics.rendererStatus, 400),
    },
  };
  record.id = record.id || `${Date.now().toString(36)}-${hashRecord(record)}`;
  return record;
}

function summarizeReviews(reviews) {
  const summary = {
    schema: 'simulatte.humanVisualReviewSummary.v1',
    count: reviews.length,
    byPhase: {},
    byPhaseTo: {},
    byStatus: {},
    byTag: {},
    failingPrompts: {},
  };
  for (const review of reviews) {
    bump(summary.byPhase, review.phaseLabel || review.phaseId || 'unknown');
    bump(summary.byPhaseTo, review.phaseTo ? `1->${review.phaseTo}` : 'unknown');
    bump(summary.byStatus, review.status || 'unknown');
    for (const tag of review.tags || []) bump(summary.byTag, tag);
    if (review.status !== 'pass' && review.prompt) {
      bump(summary.failingPrompts, String(review.prompt).slice(0, 160));
    }
  }
  return summary;
}

function bump(bucket, key) {
  bucket[key] = Number(bucket[key] || 0) + 1;
}

async function loadReviews() {
  try {
    const raw = await readFile(REVIEW_LOG, 'utf8');
    return raw
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function loadDraft() {
  try {
    return JSON.parse(await readFile(DRAFT_PATH, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function broadcast(event, payload) {
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    res.write(body);
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'GET' && url.pathname === '/health') {
      const reviews = await loadReviews();
      const summary = summarizeReviews(reviews);
      sendJson(req, res, 200, {
        ok: true,
        schema: 'simulatte.reviewServerHealth.v1',
        reviewCount: reviews.length,
        summary,
        dataDir: DATA_DIR,
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/summary') {
      const reviews = await loadReviews();
      sendJson(req, res, 200, summarizeReviews(reviews));
      return;
    }

    if (method === 'GET' && url.pathname === '/reviews') {
      const reviews = await loadReviews();
      sendJson(req, res, 200, {
        schema: 'simulatte.humanVisualReviewList.v1',
        count: reviews.length,
        reviews,
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/reviews/latest') {
      const reviews = await loadReviews();
      sendJson(req, res, 200, {
        schema: 'simulatte.humanVisualReviewLatest.v1',
        review: reviews[reviews.length - 1] || null,
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/reviews.ndjson') {
      const raw = await readFile(REVIEW_LOG, 'utf8').catch((error) => {
        if (error && error.code === 'ENOENT') return '';
        throw error;
      });
      sendText(req, res, 200, raw, 'application/x-ndjson; charset=utf-8');
      return;
    }

    if (method === 'GET' && url.pathname === '/draft') {
      sendJson(req, res, 200, {
        schema: 'simulatte.humanVisualReviewDraft.v1',
        draft: await loadDraft(),
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        ...corsHeaders(req),
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
      });
      clients.add(res);
      res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, createdAt: new Date().toISOString() })}\n\n`);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (method === 'POST' && url.pathname === '/draft') {
      const draft = compactRecord(await readBody(req), 'draft');
      await writeFile(DRAFT_PATH, `${JSON.stringify(draft, null, 2)}\n`);
      broadcast('draft', draft);
      sendJson(req, res, 200, { ok: true, draft });
      return;
    }

    if (method === 'POST' && url.pathname === '/reviews') {
      const review = compactRecord(await readBody(req), 'review');
      await appendFile(REVIEW_LOG, `${JSON.stringify(review)}\n`);
      await writeFile(DRAFT_PATH, `${JSON.stringify({ ...review, type: 'draft' }, null, 2)}\n`);
      broadcast('review', review);
      sendJson(req, res, 201, { ok: true, review });
      return;
    }

    sendJson(req, res, 404, { ok: false, error: 'not found' });
  } catch (error) {
    const statusCode = Number(error && error.statusCode || 500);
    sendJson(req, res, statusCode, {
      ok: false,
      error: error && error.message ? error.message : String(error || 'server error'),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Simulatte review server listening on http://${HOST}:${PORT}`);
  console.log(`Reviews endpoint: http://${HOST}:${PORT}/reviews`);
  console.log(`SSE endpoint: http://${HOST}:${PORT}/events`);
});
