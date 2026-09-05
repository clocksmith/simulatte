#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, createAuditHost, findChrome } from './browser-session.mjs';
import { profileProgramRoundTripExpression } from './browser-profile-probes.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'tier-browser-smoke');

const TIERS = [
  { tier: 'datacenter', profileId: 'gpu-supercluster-v1', pluginId: 'gpu-supercluster' },
  { tier: 'country', profileId: 'food-recall-us-v1', pluginId: 'food-recall-us' },
  { tier: 'country', profileId: 'grid-resilience-us-v1', pluginId: 'grid-resilience-us' },
  { tier: 'world', profileId: 'maritime-trade-global-v1', pluginId: 'maritime-trade-global' },
  { tier: 'world', profileId: 'subsea-network-global-v1', pluginId: 'subsea-network-global' },
  { tier: 'solar-system', profileId: 'orbital-transfer-planner-v1', pluginId: 'orbital-transfer-planner' },
  { tier: 'solar-system', profileId: 'asteroid-defense-v1', pluginId: 'asteroid-defense' },
  { tier: 'star-chart', profileId: 'interstellar-relay-network-v1', pluginId: 'interstellar-relay-network' },
];

function parseArgs(argv) {
  const options = { outDir: DEFAULT_OUT, checkOnly: false, chromePath: process.env.CHROME_PATH || '', baseUrl: '', profileId: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--url' || key === '--base-url') options.baseUrl = value();
    else if (key === '--profile') options.profileId = value();
    else if (key === '--check') options.checkOnly = true;
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/run-tier-browser-smoke.mjs [--check] [--out DIR] [--chrome PATH] [--base-url URL] [--profile PROFILE_ID]');
      process.exit(0);
    }
  }
  return options;
}

// In-page probe: current runtime status plus the tier run receipt, which is set only
// when Start dispatches scenario.run and settlement completes.
const STATE_PROBE = `(() => {
  const receipt = window.__simulatteTierRunReceipt || null;
  const runtimeStatus = document.getElementById('runtime-status');
  const runtimeError = [...(window.__simulatteAutonomyRuntimeEvents || [])].reverse().find((row) => row.level === 'error');
  return {
    status: runtimeStatus ? runtimeStatus.textContent.trim() : '',
    statusKind: runtimeStatus ? runtimeStatus.dataset.kind || '' : '',
    error: window.__simulatteLastFailError?.message || runtimeError?.details?.message || '',
    receipt: receipt ? { actionStatus: receipt.actionResult && receipt.actionResult.status, obligations: (receipt.settlement && receipt.settlement[0] && receipt.settlement[0].obligationResults || []).length } : null,
  };
})()`;

async function waitFor(probe, predicate, label, timeoutMs) {
  const started = Date.now();
  for (;;) {
    const state = await probe();
    if (state.status === 'Stopped') throw new Error(`${label}: runtime error (${state.error || 'Stopped'})`);
    if (predicate(state)) return state;
    if (Date.now() - started > timeoutMs) throw new Error(`${label}: timeout after ${timeoutMs}ms (status=${state.status || 'unknown'})`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Boot a tier, wait for Ready, click Start, and require a settled run receipt.
async function auditTier(chromePath, baseUrl, item) {
  const report = { tier: item.tier, profileId: item.profileId, pluginId: item.pluginId, pass: false, status: null, receipt: null, profileProgram: null, errors: [] };
  let browser;
  try {
    browser = await launchBrowser({ chromePath, webgpu: true });
    const { client } = browser;
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    client.on('Runtime.exceptionThrown', (params) => report.errors.push(params?.exceptionDetails?.exception?.description || params?.exceptionDetails?.text || 'exception'));
    client.on('Runtime.consoleAPICalled', (params) => {
      if (params?.type !== 'error') return;
      report.errors.push((params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean).join(' '));
    });
    const url = new URL(baseUrl); url.pathname = `/${item.tier}/${item.profileId}`; url.search = '';
    await client.send('Page.navigate', { url: url.toString() });
    const probe = async () => (await client.send('Runtime.evaluate', { expression: STATE_PROBE, returnByValue: true })).result.value;
    await waitFor(probe, (state) => state.status === 'Ready', 'tier-ready', 45000);
    await client.send('Runtime.evaluate', { expression: `const b = document.getElementById('start-button'); b && b.click();` });
    const final = await waitFor(probe, (state) => Boolean(state.receipt) && state.status === 'Complete', 'tier-complete', 45000);
    report.status = final.status;
    report.receipt = final.receipt;
    if (final.receipt.actionStatus !== 'settled') throw new Error(`action status ${final.receipt.actionStatus}`);
    const profile = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data', 'application-profiles', `${item.profileId}.json`), 'utf8'));
    const programEvaluation = await client.send('Runtime.evaluate', {
      expression: profileProgramRoundTripExpression(profile.seeds || []),
      awaitPromise: true,
      returnByValue: true,
    });
    if (programEvaluation.exceptionDetails) {
      throw new Error(programEvaluation.exceptionDetails.exception?.description || programEvaluation.exceptionDetails.text);
    }
    report.profileProgram = programEvaluation.result.value;
    if (!report.profileProgram?.pass) throw new Error('profile program round trip failed');
    report.pass = report.errors.length === 0;
  } catch (error) {
    report.errors.unshift(error.message);
  } finally {
    await browser?.close();
  }
  return report;
}

async function runTierBrowserSmoke() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });

  const chromePath = findChrome(options.chromePath);
  const host = await createAuditHost({ publicRoot: PUBLIC, url: options.baseUrl });
  options.baseUrl = host.baseUrl;
  try {
  const reports = [];
  const selectedTiers = options.profileId ? TIERS.filter((row) => row.profileId === options.profileId) : TIERS;
  if (!selectedTiers.length) throw new Error(`Unknown profile ${options.profileId}`);
  for (const item of selectedTiers) {
    console.log(`TIER-SMOKE testing tier=${item.tier} profile=${item.profileId}...`);
    const report = await auditTier(chromePath, options.baseUrl, item);
    console.log(`TIER-SMOKE tier=${item.tier} status=${report.pass ? 'pass' : 'fail'}${report.pass ? ` obligations=${report.receipt.obligations} program=${report.profileProgram.verdict}` : ` reason=${report.errors[0] || 'unknown'}`}`);
    reports.push(report);
  }

  const passed = reports.filter((row) => row.pass).length;
  const allPass = passed === selectedTiers.length;
  fs.writeFileSync(path.join(options.outDir, 'report.json'), JSON.stringify({ timestamp: new Date().toISOString(), pass: allPass, totalTiers: selectedTiers.length, passedTiers: passed, reports }, null, 2));


  console.log(`TIER-SMOKE status=${allPass ? 'pass' : 'fail'} total=${selectedTiers.length} passed=${passed}`);
  process.exitCode = allPass ? 0 : 1;
  } finally { await host.close(); }
}

runTierBrowserSmoke().catch((err) => {
  console.error(`TIER-SMOKE status=failed reason=${err.message}`);
  process.exit(1);
});
