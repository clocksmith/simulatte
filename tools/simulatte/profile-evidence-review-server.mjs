#!/usr/bin/env node
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildProfileReviewIndex,
  createProfileReviewReceipt,
  loadProfileReviewContext,
  profileReviewQueueView,
  storeProfileReviewReceipt,
  validateProfileReviewIndex,
  writeProfileReviewIndex,
} from './profile-evidence-review-contract.mjs';
import { sha256File } from './profile-evidence-contract.mjs';

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIRECTORY, '../..');
const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts/profile-evidence');
const MAX_BODY_BYTES = 64 * 1024;
const STATIC_FILES = Object.freeze({
  '/': ['profile-evidence-review.html', 'text/html; charset=utf-8'],
  '/review.css': ['profile-evidence-review.css', 'text/css; charset=utf-8'],
  '/review.js': ['profile-evidence-review-page.js', 'text/javascript; charset=utf-8'],
});

function parseArgs(argv) {
  const options = {
    check: false,
    host: process.env.SIMULATTE_PROFILE_REVIEW_HOST || '127.0.0.1',
    port: Number(process.env.SIMULATTE_PROFILE_REVIEW_PORT || 4767),
    outputDirectory: DEFAULT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inlineValue] = argv[index].split('=');
    const value = () => inlineValue ?? argv[++index];
    if (key === '--check') options.check = true;
    else if (key === '--host') options.host = String(value());
    else if (key === '--port') options.port = Number(value());
    else if (key === '--out') options.outputDirectory = path.resolve(value());
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/profile-evidence-review-server.mjs [--check] [--out DIR] [--host HOST] [--port PORT]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.host) throw new Error('profile_review_host_invalid');
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error('profile_review_port_invalid');
  }
  return options;
}

function securityHeaders(contentType) {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Content-Security-Policy': "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, securityHeaders('application/json; charset=utf-8'));
  res.end(`${JSON.stringify(value, null, 2)}\n`);
}

function sendBytes(res, statusCode, bytes, contentType) {
  res.writeHead(statusCode, {
    ...securityHeaders(contentType),
    'Content-Length': bytes.length,
  });
  res.end(bytes);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('profile_review_request_too_large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    const error = new Error('profile_review_request_json_invalid');
    error.statusCode = 400;
    throw error;
  }
}

function assetMap(context) {
  const assets = new Map();
  for (const row of context.rows) {
    for (const key of ['canvasScreenshot', 'pageScreenshot']) {
      const evidence = row.queueRow[key];
      if (!evidence) continue;
      const assetPath = path.resolve(context.outputDirectory, evidence.path);
      assets.set(evidence.sha256, assetPath);
    }
  }
  return assets;
}

function errorStatus(error) {
  if (error?.statusCode) return Number(error.statusCode);
  if (error?.code === 'profile_review_run_unknown') return 404;
  if (error?.code === 'profile_review_duplicate_reviewer') return 409;
  if (error?.code === 'profile_review_machine_evidence_not_ready') return 409;
  if (String(error?.code || '').startsWith('profile_review_')) return 400;
  return 500;
}

function createProfileReviewServer({ outputDirectory = DEFAULT_OUTPUT } = {}) {
  let submission = Promise.resolve();
  return createServer(async (request, response) => {
    try {
      const method = String(request.method || 'GET').toUpperCase();
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (method === 'GET' && STATIC_FILES[url.pathname]) {
        const [fileName, contentType] = STATIC_FILES[url.pathname];
        sendBytes(response, 200, fs.readFileSync(path.join(TOOL_DIRECTORY, fileName)), contentType);
        return;
      }
      if (method === 'GET' && url.pathname === '/api/queue') {
        const context = loadProfileReviewContext(outputDirectory);
        const index = buildProfileReviewIndex(context);
        sendJson(response, 200, profileReviewQueueView(context, index));
        return;
      }
      if (method === 'GET' && url.pathname === '/api/index') {
        const result = validateProfileReviewIndex(outputDirectory);
        sendJson(response, 200, result.index);
        return;
      }
      const assetMatch = method === 'GET' && /^\/api\/assets\/([a-f0-9]{64})$/.exec(url.pathname);
      if (assetMatch) {
        const context = loadProfileReviewContext(outputDirectory);
        const assetPath = assetMap(context).get(assetMatch[1]);
        if (!assetPath || !fs.existsSync(assetPath) || sha256File(assetPath) !== assetMatch[1]) {
          sendJson(response, 404, { ok: false, error: 'profile_review_asset_not_bound' });
          return;
        }
        sendBytes(response, 200, fs.readFileSync(assetPath), 'image/png');
        return;
      }
      if (method === 'POST' && url.pathname === '/api/reviews') {
        const input = await readJsonBody(request);
        const task = submission.then(() => {
          const context = loadProfileReviewContext(outputDirectory);
          const receipt = createProfileReviewReceipt(context, input);
          const stored = storeProfileReviewReceipt(context, receipt);
          const reviewIndex = writeProfileReviewIndex(outputDirectory).index;
          const row = reviewIndex.rows.find((candidate) => candidate.runId === receipt.run.id);
          return { stored, row, reviewIndex };
        });
        submission = task.catch(() => {});
        const result = await task;
        sendJson(response, 201, {
          ok: true,
          reviewSha256: result.stored.sha256,
          reviewStatus: result.row.reviewStatus,
          platformClaimEligible: result.row.platformClaimEligible,
          summary: result.reviewIndex.summary,
        });
        return;
      }
      sendJson(response, 404, { ok: false, error: 'not found' });
    } catch (error) {
      sendJson(response, errorStatus(error), {
        ok: false,
        error: error?.code || error?.message || 'profile_review_server_error',
      });
    }
  });
}

async function listenProfileReviewServer(options) {
  const initialized = writeProfileReviewIndex(options.outputDirectory);
  const server = createProfileReviewServer(options);
  await new Promise((resolve, reject) => {
    server.listen(options.port, options.host, resolve).once('error', reject);
  });
  const address = server.address();
  return {
    server,
    baseUrl: `http://${options.host}:${address.port}`,
    index: initialized.index,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    const result = validateProfileReviewIndex(options.outputDirectory);
    console.log(`PROFILE-REVIEW check runs=${result.index.totalRuns} reviews=${result.index.totalReviews} pending=${result.index.summary.pending} conflict=${result.index.summary.conflict} eligible=${result.index.summary.platformClaimEligible}`);
    return;
  }
  const running = await listenProfileReviewServer(options);
  console.log(`Simulatte profile evidence review: ${running.baseUrl}`);
  console.log(`Bound queue: ${running.index.queueSha256}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

export {
  createProfileReviewServer,
  listenProfileReviewServer,
  parseArgs,
};
