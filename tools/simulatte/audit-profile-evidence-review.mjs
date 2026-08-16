#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CdpClient } from './browser-harness.mjs';
import { listenProfileReviewServer } from './profile-evidence-review-server.mjs';

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIRECTORY, '../..');
const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts/profile-evidence-review');

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value || ''));
  if (!match) throw new Error(`Expected viewport WIDTHxHEIGHT, received ${value || 'missing'}`);
  const viewport = { width: Number(match[1]), height: Number(match[2]) };
  if (viewport.width < 320 || viewport.height < 480) throw new Error('profile_review_audit_viewport_too_small');
  return viewport;
}

function parseArgs(argv) {
  const options = {
    chromePath: process.env.CHROME_PATH || '',
    evidenceDirectory: path.join(ROOT, 'artifacts/profile-evidence'),
    outputDirectory: DEFAULT_OUTPUT,
    viewport: { width: 1440, height: 1000 },
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inlineValue] = argv[index].split('=');
    const value = () => inlineValue ?? argv[++index];
    if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--evidence') options.evidenceDirectory = path.resolve(value());
    else if (key === '--out') options.outputDirectory = path.resolve(value());
    else if (key === '--viewport') options.viewport = parseViewport(value());
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/audit-profile-evidence-review.mjs [--viewport WIDTHxHEIGHT] [--evidence DIR] [--out DIR] [--chrome PATH]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  for (const command of ['google-chrome', 'chromium', 'chromium-browser']) {
    if (spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0) return command;
  }
  throw new Error('Profile review audit requires Chrome or Chromium. Pass --chrome PATH.');
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForDevtools(port, child) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((row) => row.type === 'page' && row.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {
      // Chrome has not opened the debugging port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chrome DevTools did not become ready on port ${port}`);
}

async function stopChrome(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.once('error', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result?.value;
}

function auditExpression() {
  return String.raw`(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (label, read, timeoutMs = 10000) => {
      const started = performance.now();
      let value;
      while (!(value = read())) {
        if (performance.now() - started > timeoutMs) throw new Error('Timed out waiting for ' + label);
        await delay(40);
      }
      return value;
    };
    await waitFor('review queue', () => document.body.dataset.reviewReady === 'true');
    const image = document.getElementById('evidence-image');
    await waitFor('bound canvas screenshot', () => image.complete && image.naturalWidth > 0);
    const initialSrc = image.src;
    document.getElementById('show-page').click();
    await waitFor('bound page screenshot', () => image.complete && image.naturalWidth > 0 && image.src !== initialSrc);
    document.getElementById('show-canvas').click();
    await waitFor('restored canvas screenshot', () => image.complete && image.naturalWidth > 0 && image.src === initialSrc);
    document.getElementById('reviewer-id').value = 'Browser Audit Only';
    const verdictRows = Array.from(document.querySelectorAll('.verdict-row'));
    for (const row of verdictRows) row.querySelector('input[value="pass"]').checked = true;
    const controls = Array.from(document.querySelectorAll('button, input, select, textarea'));
    const controlOverflowCount = controls.filter((control) => {
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).length;
    return {
      schema: 'simulatte.profileEvidenceReviewBrowserAudit.v1',
      viewport: { width: innerWidth, height: innerHeight },
      runCount: document.getElementById('run-select').options.length,
      verdictFieldCount: verdictRows.length,
      promptVisible: Boolean(document.getElementById('prompt-text').textContent.trim()),
      buildVisible: Boolean(document.getElementById('build-id').textContent.trim()),
      worldSpecVisible: Boolean(document.getElementById('world-spec-id').textContent.trim()),
      scenePacketVisible: Boolean(document.getElementById('scene-packet-id').textContent.trim()),
      screenshotVisible: image.naturalWidth > 0 && image.naturalHeight > 0,
      submitEnabled: !document.getElementById('submit-review').disabled,
      submittedReview: false,
      documentFitsViewport: document.documentElement.scrollWidth <= innerWidth + 1,
      controlOverflowCount,
    };
  })()`;
}

function assertReceipt(receipt) {
  const checks = [
    [receipt.schema === 'simulatte.profileEvidenceReviewBrowserAudit.v1', 'browser receipt schema is invalid'],
    [receipt.runCount === 94, `expected 94 runs, received ${receipt.runCount}`],
    [receipt.verdictFieldCount === 4, `expected 4 verdict fields, received ${receipt.verdictFieldCount}`],
    [receipt.promptVisible, 'prompt binding is not visible'],
    [receipt.buildVisible, 'build binding is not visible'],
    [receipt.worldSpecVisible, 'WorldSpec binding is not visible'],
    [receipt.scenePacketVisible, 'scene packet binding is not visible'],
    [receipt.screenshotVisible, 'bound screenshot is not visible'],
    [receipt.submitEnabled, 'review submission is unavailable for machine-ready evidence'],
    [receipt.submittedReview === false, 'browser audit must not submit a human verdict'],
    [receipt.documentFitsViewport, 'review page overflows horizontally'],
    [receipt.controlOverflowCount === 0, 'review controls overflow horizontally'],
  ];
  const failures = checks.filter(([pass]) => !pass).map(([, message]) => message);
  if (failures.length) throw new Error(`Profile review browser audit failed: ${failures.join('; ')}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reviewServer = await listenProfileReviewServer({
    outputDirectory: options.evidenceDirectory,
    host: '127.0.0.1',
    port: 0,
  });
  const debugPort = await freePort();
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-profile-review-audit-'));
  const chrome = spawn(findChrome(options.chromePath), [
    '--headless=new',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDirectory}`,
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${options.viewport.width},${options.viewport.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let client = null;
  try {
    const page = await waitForDevtools(debugPort, chrome);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    const exceptions = [];
    client.on('Runtime.exceptionThrown', (params) => exceptions.push(
      params.exceptionDetails.exception?.description || params.exceptionDetails.text || 'browser exception'
    ));
    await Promise.all([client.send('Runtime.enable'), client.send('Page.enable')]);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewport.width,
      height: options.viewport.height,
      deviceScaleFactor: 1,
      mobile: options.viewport.width < 600,
    });
    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: reviewServer.baseUrl });
    await loaded;
    const receipt = await evaluate(client, auditExpression());
    if (exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join(' | ')}`);
    assertReceipt(receipt);
    const capture = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
    });
    const screenshot = Buffer.from(capture.data, 'base64');
    fs.mkdirSync(options.outputDirectory, { recursive: true });
    const baseName = `${options.viewport.width}x${options.viewport.height}`;
    const screenshotPath = path.join(options.outputDirectory, `${baseName}.png`);
    const reportPath = path.join(options.outputDirectory, `${baseName}.json`);
    fs.writeFileSync(screenshotPath, screenshot);
    fs.writeFileSync(reportPath, `${JSON.stringify({
      ...receipt,
      screenshot: path.relative(ROOT, screenshotPath),
      screenshotSha256: crypto.createHash('sha256').update(screenshot).digest('hex'),
    }, null, 2)}\n`);
    console.log(`PROFILE-REVIEW-BROWSER viewport=${baseName} runs=${receipt.runCount} verdicts=${receipt.verdictFieldCount} overflow=${receipt.controlOverflowCount} status=pass`);
  } finally {
    await client?.close();
    await stopChrome(chrome);
    await new Promise((resolve) => reviewServer.server.close(resolve));
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

export { assertReceipt, auditExpression, parseArgs, parseViewport };
