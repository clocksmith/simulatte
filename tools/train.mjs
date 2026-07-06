#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const DEFAULT_WEB_PORT = 4173;
const DEFAULT_REVIEW_PORT = 4766;
const FETCH_LIMIT_MS = 900;
const WAIT_ATTEMPTS = 80;
const WAIT_DELAY_MS = 125;
const SESSION_DIR = path.join(ROOT, 'artifacts', 'simulatte-train');
const SESSION_PATH = path.join(SESSION_DIR, 'session.json');
const DEFAULT_REVIEW_DIR = path.join(ROOT, 'artifacts', 'simulatte-human-reviews');

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(`[train] ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});

async function main() {
  process.chdir(ROOT);
  if (args.help) {
    printHelp();
    return;
  }
  if (args.stop) {
    await stopSession();
    return;
  }
  assertRepo();
  await mkdir(SESSION_DIR, { recursive: true });

  const previous = await readSession();
  const reviewDir = path.resolve(args.reviewDir || DEFAULT_REVIEW_DIR);
  await mkdir(reviewDir, { recursive: true });

  const review = await ensureService({
    name: 'review',
    port: args.reviewPort || DEFAULT_REVIEW_PORT,
    previous: previous && previous.review,
    isExpected: checkReviewServer,
    start: (port) => startDetached('review', process.execPath, ['tools/simulatte-review-server.mjs'], {
      ...process.env,
      HOST,
      SIMULATTE_REVIEW_HOST: HOST,
      SIMULATTE_REVIEW_PORT: String(port),
      SIMULATTE_REVIEW_DIR: reviewDir,
    }),
  });

  const web = await ensureService({
    name: 'web',
    port: args.webPort || DEFAULT_WEB_PORT,
    previous: previous && previous.web,
    isExpected: checkWebServer,
    start: (port) => startDetached('web', process.execPath, ['tools/serve-local.mjs'], {
      ...process.env,
      HOST,
      PORT: String(port),
    }),
  });

  const reviewUrl = `http://${HOST}:${review.port}`;
  const appUrl = new URL(`http://${HOST}:${web.port}/`);
  appUrl.searchParams.set('training', '1');
  appUrl.searchParams.set('trainingServer', reviewUrl);
  if (args.auditNoInitial) appUrl.searchParams.set('auditNoInitial', '1');

  await writeSession({
    schema: 'simulatte.trainSession.v1',
    appUrl: appUrl.href,
    reviewUrl,
    reviewDir,
    reviewLog: path.join(reviewDir, 'reviews.jsonl'),
    web,
    review,
    logs: {
      web: logPathFor('web'),
      review: logPathFor('review'),
    },
    updatedAt: new Date().toISOString(),
  });

  printReady(appUrl.href, reviewUrl, reviewDir);

  if (!args.noOpen) {
    await openTrainingUrl(appUrl.href);
  }

  if (args.check) {
    await stopStartedServices([web, review], 'startedInRun');
    if (web.startedInRun || review.startedInRun) {
      await rm(SESSION_PATH, { force: true });
    }
  }
}

function assertRepo() {
  const packagePath = path.join(ROOT, 'package.json');
  const publicPath = path.join(ROOT, 'public', 'index.html');
  const reviewServerPath = path.join(ROOT, 'tools', 'simulatte-review-server.mjs');
  if (!existsSync(packagePath) || !existsSync(publicPath) || !existsSync(reviewServerPath)) {
    throw new Error('run from the Simulatte repository checkout');
  }
}

function parseArgs(argv) {
  const result = {
    auditNoInitial: false,
    check: false,
    help: false,
    noOpen: false,
    reviewDir: '',
    reviewPort: 0,
    stop: false,
    webPort: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--audit-no-initial') result.auditNoInitial = true;
    else if (arg === '--check') result.check = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--no-open') result.noOpen = true;
    else if (arg === '--stop') result.stop = true;
    else if (arg === '--review-dir') result.reviewDir = argv[++index] || '';
    else if (arg.startsWith('--review-dir=')) result.reviewDir = arg.slice('--review-dir='.length);
    else if (arg === '--review-port') result.reviewPort = numberArg(argv[++index], '--review-port');
    else if (arg.startsWith('--review-port=')) result.reviewPort = numberArg(arg.slice('--review-port='.length), '--review-port');
    else if (arg === '--web-port') result.webPort = numberArg(argv[++index], '--web-port');
    else if (arg.startsWith('--web-port=')) result.webPort = numberArg(arg.slice('--web-port='.length), '--web-port');
    else throw new Error(`unknown argument ${arg}`);
  }
  return result;
}

function numberArg(raw, name) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`${name} must be a TCP port`);
  }
  return value;
}

async function ensureService({ name, port, previous, isExpected, start }) {
  const resolved = await resolvePort(port, isExpected);
  if (resolved.existing) {
    return {
      name,
      port: resolved.port,
      existing: true,
      pid: previous && previous.port === resolved.port && isProcessAlive(previous.pid) ? previous.pid : 0,
      startedInRun: false,
      startedByTrain: Boolean(previous && previous.port === resolved.port && isProcessAlive(previous.pid)),
    };
  }

  const child = start(resolved.port);
  await waitForService(name, resolved.port, isExpected);
  return {
    name,
    port: resolved.port,
    existing: false,
    pid: child.pid,
    startedInRun: true,
    startedByTrain: true,
  };
}

async function resolvePort(startPort, isExpected) {
  for (let offset = 0; offset < 50; offset += 1) {
    const port = startPort + offset;
    if (await isExpected(port)) return { port, existing: true };
    if (await canListen(port)) return { port, existing: false };
  }
  throw new Error(`no available port found from ${startPort}`);
}

function startDetached(name, command, commandArgs, env) {
  const logPath = logPathFor(name);
  const out = openSync(logPath, 'a');
  const err = openSync(logPath, 'a');
  const child = spawn(command, commandArgs, {
    cwd: ROOT,
    detached: true,
    env,
    stdio: ['ignore', out, err],
  });
  child.unref();
  closeSync(out);
  closeSync(err);
  return child;
}

function logPathFor(name) {
  return path.join(SESSION_DIR, `${name}.log`);
}

async function waitForService(name, port, isExpected) {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
    if (await isExpected(port)) return;
    await sleep(WAIT_DELAY_MS);
  }
  throw new Error(`${name} server did not become ready on ${HOST}:${port}`);
}

async function checkWebServer(port) {
  try {
    const response = await fetchLimited(`http://${HOST}:${port}/`);
    if (!response.ok) return false;
    const text = await response.text();
    return /physics-canvas|prompt-review-bridge\.js|Simulatte/i.test(text);
  } catch {
    return false;
  }
}

async function checkReviewServer(port) {
  try {
    const response = await fetchLimited(`http://${HOST}:${port}/health`);
    if (!response.ok) return false;
    const json = await response.json();
    return json && json.schema === 'simulatte.reviewServerHealth.v1';
  } catch {
    return false;
  }
}

async function fetchLimited(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_LIMIT_MS);
  try {
    return await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function openTrainingUrl(url) {
  const attempts = process.platform === 'darwin'
    ? [
      ['open', ['-a', 'Google Chrome', url]],
      ['open', [url]],
    ]
    : process.platform === 'win32'
      ? [['cmd', ['/c', 'start', 'chrome', url]]]
      : [
        ['google-chrome', [url]],
        ['chromium', [url]],
        ['chromium-browser', [url]],
        ['xdg-open', [url]],
      ];

  for (const [command, commandArgs] of attempts) {
    if (await runOpener(command, commandArgs)) {
      console.log(`[train] opened ${url}`);
      return;
    }
  }
  console.log(`[train] open manually: ${url}`);
}

function runOpener(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

async function stopSession() {
  const session = await readSession();
  if (!session) {
    console.log('[train] no train session file found');
    return;
  }
  await stopStartedServices([session.web, session.review]);
  await rm(SESSION_PATH, { force: true });
  console.log('[train] stopped train-started services');
}

async function stopStartedServices(services, flag = 'startedByTrain') {
  for (const service of services) {
    if (!service || !service[flag] || !service.pid) continue;
    killProcessGroup(service.pid);
  }
}

function killProcessGroup(pid) {
  if (!isProcessAlive(pid)) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function readSession() {
  try {
    return JSON.parse(await readFile(SESSION_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function writeSession(session) {
  await writeFile(SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printReady(appUrl, reviewUrl, reviewDir) {
  console.log(`[train] app ${appUrl}`);
  console.log(`[train] review server ${reviewUrl}`);
  console.log(`[train] review records ${path.join(reviewDir, 'reviews.jsonl')}`);
  console.log('[train] browser fallback: local queue plus Export reviews');
  console.log('[train] keys: T toggle, 1 looks right; use Save feedback for free-text critique');
  console.log('[train] stop with npm run train -- --stop');
}

function printHelp() {
  console.log(`Usage: npm run train -- [options]

Launch Simulatte training mode with the local app and review server.

Options:
  --no-open              Start servers without opening Chrome
  --stop                 Stop services started by this launcher
  --check                Verify startup, then stop services started by this run
  --web-port PORT        Preferred app server port
  --review-port PORT     Preferred review server port
  --review-dir PATH      Directory for reviews.jsonl
  --audit-no-initial     Add auditNoInitial=1 to the opened URL
`);
}
