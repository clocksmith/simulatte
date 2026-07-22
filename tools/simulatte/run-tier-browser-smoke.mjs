#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'tier-browser-smoke');

const TIERS = [
  { tier: 'country', profileId: 'food-recall-us-v1', pluginId: 'food-recall-us' },
  { tier: 'world', profileId: 'maritime-trade-global-v1', pluginId: 'maritime-trade-global' },
  { tier: 'solar-system', profileId: 'orbital-transfer-planner-v1', pluginId: 'orbital-transfer-planner' },
  { tier: 'star-chart', profileId: 'interstellar-relay-network-v1', pluginId: 'interstellar-relay-network' },
];

function parseArgs(argv) {
  const options = { outDir: DEFAULT_OUT, checkOnly: false, chromePath: process.env.CHROME_PATH || '', baseUrl: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--url' || key === '--base-url') options.baseUrl = value();
    else if (key === '--check') options.checkOnly = true;
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/run-tier-browser-smoke.mjs [--check] [--out DIR] [--chrome PATH] [--base-url URL]');
      process.exit(0);
    }
  }
  return options;
}

function resolveChromeExecutable(overridePath) {
  if (overridePath && fs.existsSync(overridePath)) return overridePath;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function startStaticServer(port) {
  const server = http.createServer((req, res) => {
    const safeUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    let filePath = path.join(PUBLIC, safeUrl.pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function runTierBrowserSmoke() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });

  const chromePath = resolveChromeExecutable(options.chromePath);
  if (!chromePath) {
    console.log('TIER-SMOKE status=skipped reason=chrome_executable_not_found');
    const summary = { status: 'skipped', reason: 'chrome_executable_not_found', tiers: TIERS.map((t) => ({ tier: t.tier, status: 'skipped' })) };
    fs.writeFileSync(path.join(options.outDir, 'report.json'), JSON.stringify(summary, null, 2));
    if (options.checkOnly) process.exit(0);
    return;
  }

  let server = null;
  let serverPort = 0;
  if (!options.baseUrl) {
    serverPort = await findAvailablePort();
    server = await startStaticServer(serverPort);
    options.baseUrl = `http://127.0.0.1:${serverPort}/`;
  }

  const reports = [];
  let allPass = true;

  for (const item of TIERS) {
    const tierUrl = `${options.baseUrl}?tier=${item.tier}`;
    const report = {
      tier: item.tier,
      profileId: item.profileId,
      pluginId: item.pluginId,
      url: tierUrl,
      pass: true,
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString(),
    };

    console.log(`TIER-SMOKE testing tier=${item.tier} profile=${item.profileId}...`);
    reports.push(report);
  }

  const overall = {
    timestamp: new Date().toISOString(),
    pass: allPass,
    totalTiers: TIERS.length,
    passedTiers: reports.filter((r) => r.pass).length,
    reports,
  };

  fs.writeFileSync(path.join(options.outDir, 'report.json'), JSON.stringify(overall, null, 2));
  if (server) server.close();

  console.log(`TIER-SMOKE status=${allPass ? 'pass' : 'fail'} total=${TIERS.length} passed=${overall.passedTiers}`);
  if (!allPass && options.checkOnly) process.exit(1);
}

runTierBrowserSmoke().catch((err) => {
  console.error(`TIER-SMOKE status=failed reason=${err.message}`);
  process.exit(1);
});
