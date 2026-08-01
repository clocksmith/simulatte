#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CdpClient, findChrome } from './run-browser-smoke.mjs';
import { createStaticSiteServer } from './static-site-server.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const PROFILES = [
  ['city', 'cable-trader-pickup-v1'],
  ['city', 'neighborhood-bulk-pool-v1'],
  ['city', 'sun-walker-v1'],
  ['country', 'food-recall-us-v1'],
  ['country', 'grid-resilience-us-v1'],
  ['world', 'maritime-trade-global-v1'],
  ['world', 'subsea-network-global-v1'],
  ['solar-system', 'orbital-transfer-planner-v1'],
  ['solar-system', 'asteroid-defense-v1'],
  ['star-chart', 'interstellar-relay-network-v1'],
];

function selectedProfiles(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--profile');
  if (index < 0) return PROFILES;
  const profileId = argv[index + 1];
  const selected = PROFILES.filter((row) => row[1] === profileId);
  if (!selected.length) throw new Error(`Unknown experience UI profile ${profileId || 'missing'}`);
  return selected;
}

function selectedViewport(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--viewport');
  if (index < 0) return { width: 1440, height: 1000 };
  const match = /^(\d+)x(\d+)$/.exec(argv[index + 1] || '');
  if (!match) throw new Error('Experience UI viewport must use WIDTHxHEIGHT');
  return { width: Number(match[1]), height: Number(match[2]) };
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForPage(port, chrome) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with ${chrome.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        const page = (await response.json()).find((row) => row.type === 'page');
        if (page) return page;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Chrome DevTools did not start');
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

async function waitForReady(client, profileId) {
  const started = Date.now();
  for (;;) {
    const state = await evaluate(client, `(() => ({
      phase: document.body?.dataset.journeyPhase || '',
      status: document.getElementById('runtime-status')?.textContent?.trim() || '',
      profileId: document.getElementById('application-profile')?.value || '',
      error: globalThis.__simulatteLastFailError?.message || '',
    }))()`);
    if (state.status === 'Stopped' || state.phase === 'failed') {
      throw new Error(`${profileId} stopped: ${state.error || 'unknown error'}`);
    }
    if (state.phase === 'ready' && state.status === 'Ready' && state.profileId === profileId) return;
    if (Date.now() - started > 60000) throw new Error(`${profileId} did not become ready: ${JSON.stringify(state)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function exercisePlayback(client, minimumStep = 4, {
  intervene = false,
  settle = false,
  compare = false,
} = {}) {
  await evaluate(client, `document.getElementById('start-button')?.click()`);
  const started = Date.now();
  for (;;) {
    const state = await evaluate(client, `(() => ({
      phase: document.body?.dataset.journeyPhase || '',
      current: Number(document.getElementById('playback-timeline')?.value || 0),
      canPause: !document.getElementById('pause-button')?.hidden,
      failed: globalThis.__simulatteLastFailError?.message || '',
    }))()`);
    if (state.failed || state.phase === 'failed') throw new Error(state.failed || 'Playback failed');
    if (state.canPause || state.phase === 'completed') break;
    if (Date.now() - started > 30000) throw new Error('Playback did not become pausable');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await evaluate(client, `document.getElementById('pause-button')?.click()`);
  while (true) {
    const current = await evaluate(client, `Number(document.getElementById('playback-timeline')?.value || 0)`);
    if (current >= minimumStep) break;
    await evaluate(client, `document.getElementById('step-button')?.click()`);
    const before = current;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const next = await evaluate(client, `Number(document.getElementById('playback-timeline')?.value || 0)`);
      if (next > before) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (intervene) {
    const applied = await evaluate(client, `(() => {
      const button = [...document.querySelectorAll('#plugin-map-ui button')]
        .find((row) => row.textContent.trim() === 'Release depot reserves');
      button?.click();
      return Boolean(button);
    })()`);
    if (!applied) throw new Error('Cable intervention action was not available during playback');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (settle) {
    await evaluate(client, `document.getElementById('start-button')?.click()`);
    const resumed = Date.now();
    for (;;) {
      const state = await evaluate(client, `(() => ({
        phase: document.body?.dataset.journeyPhase || '',
        status: document.getElementById('runtime-status')?.textContent?.trim() || '',
        failed: globalThis.__simulatteLastFailError?.message || '',
      }))()`);
      if (state.failed || state.phase === 'failed') throw new Error(state.failed || 'Playback failed');
      if (state.phase === 'completed') break;
      if (Date.now() - resumed > 30000) throw new Error(`Playback did not settle: ${JSON.stringify(state)}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  if (compare) {
    const selected = await evaluate(client, `(() => {
      const button = document.getElementById('camera-compare');
      if (!button || button.disabled || button.hidden) return false;
      button.click();
      return true;
    })()`);
    if (!selected) throw new Error('Compare camera was unavailable');
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

async function exerciseControl(client, profileId) {
  const mutation = await evaluate(client, `(() => {
    const platform = globalThis.__simulattePluginPlatformV4;
    const controls = new Map((platform?.contributions || []).flatMap((contribution) =>
      (contribution.controls?.controls || []).map((control) => [
        contribution.pluginId + ':' + control.id,
        { pluginId: contribution.pluginId, ...control },
      ])
    ));
    const inputs = [...document.querySelectorAll('[data-plugin-control]')];
    for (const input of inputs) {
      const pluginId = input.closest('[data-plugin-id]')?.dataset.pluginId || '';
      const control = controls.get(pluginId + ':' + input.dataset.pluginControl);
      if (!control) continue;
      const before = control.value;
      if (input.type === 'checkbox') {
        input.checked = !input.checked;
      } else if (input.tagName === 'SELECT' && input.multiple) {
        const current = [...input.selectedOptions].map((option) => option.value);
        const alternate = [...input.options].find((option) => !current.includes(option.value));
        if (!alternate) continue;
        [...input.options].forEach((option) => { option.selected = option === alternate; });
      } else if (input.tagName === 'SELECT') {
        if (input.options.length < 2) continue;
        input.selectedIndex = (input.selectedIndex + 1) % input.options.length;
      } else if (['number', 'range'].includes(input.type)) {
        const current = Number(input.value);
        const minimum = input.min === '' ? -Infinity : Number(input.min);
        const maximum = input.max === '' ? Infinity : Number(input.max);
        const step = input.step === '' || input.step === 'any' ? 1 : Number(input.step);
        const candidate = current + step <= maximum ? current + step : current - step;
        if (!Number.isFinite(candidate) || candidate < minimum || candidate === current) continue;
        input.value = String(candidate);
      } else {
        continue;
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        pluginId,
        controlId: input.dataset.pluginControl,
        before,
      };
    }
    return null;
  })()`);
  if (!mutation) throw new Error(`${profileId} had no mutable control`);
  const started = Date.now();
  for (;;) {
    const state = await evaluate(client, `(() => {
      const mutation = ${JSON.stringify(mutation)};
      const contribution = (globalThis.__simulattePluginPlatformV4?.contributions || [])
        .find((row) => row.pluginId === mutation.pluginId);
      const control = contribution?.controls?.controls?.find((row) => row.id === mutation.controlId);
      const input = [...document.querySelectorAll('[data-plugin-control]')]
        .find((row) => row.dataset.pluginControl === mutation.controlId
          && row.closest('[data-plugin-id]')?.dataset.pluginId === mutation.pluginId);
      const normalize = (value) => Array.isArray(value)
        ? value.map(String).sort().join('|')
        : String(value);
      const domValue = !input
        ? null
        : input.type === 'checkbox'
          ? input.checked
          : input.multiple
            ? [...input.selectedOptions].map((option) => option.value)
            : input.value;
      return {
        phase: document.body?.dataset.journeyPhase || '',
        status: document.getElementById('runtime-status')?.textContent?.trim() || '',
        error: globalThis.__simulatteLastFailError?.message || '',
        contributionValue: control?.value,
        changed: Boolean(control) && normalize(control.value) !== normalize(mutation.before),
        domMatches: Boolean(input) && normalize(domValue) === normalize(control?.value),
      };
    })()`);
    if (state.error || state.phase === 'failed') throw new Error(`${profileId} control failed: ${state.error || 'unknown error'}`);
    if (state.phase === 'ready' && state.status === 'Ready' && state.changed && state.domMatches) {
      return { ...mutation, after: state.contributionValue, pass: true };
    }
    if (Date.now() - started > 60000) {
      throw new Error(`${profileId} control did not apply immediately: ${JSON.stringify(state)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function probe(client) {
  return evaluate(client, `(() => {
    const platform = globalThis.__simulattePluginPlatformV4;
    const expected = (platform?.contributions || []).flatMap((contribution) =>
      (contribution.controls?.controls || []).map((control) => ({
        pluginId: contribution.pluginId,
        controlId: control.id,
        value: control.value,
      }))
    );
    const rendered = [...document.querySelectorAll('[data-plugin-control]')].map((input) => ({
      pluginId: input.closest('[data-plugin-id]')?.dataset.pluginId || null,
      controlId: input.dataset.pluginControl,
      value: input.type === 'checkbox' ? input.checked : input.value,
    }));
    const mapCards = [...document.querySelectorAll('#plugin-map-ui [data-plugin-id]')].map((card) => ({
      pluginId: card.dataset.pluginId,
      text: card.innerText.replace(/\\s+/g, ' ').trim(),
    }));
    const isVisible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
    };
    return {
      profileId: document.getElementById('application-profile')?.value || null,
      label: document.getElementById('application-profile-label')?.textContent?.trim() || null,
      expected,
      rendered,
      mapCards,
      contributionStates: (platform?.contributions || []).map((contribution) => ({
        pluginId: contribution.pluginId,
        status: contribution.state?.status || null,
        measures: contribution.state?.measures || [],
        inspectionFields: (contribution.inspections || []).flatMap((inspection) => inspection.fields)
          .slice(0, 6)
          .map((field) => ({ id: field.id, label: field.label, value: field.value, unit: field.unit })),
      })),
      comparisonLayerKinds: (platform?.contributions || []).flatMap((contribution) => (
        contribution.presentation?.layers || []
      )).filter((layer) => layer.role === 'comparison').map((layer) => layer.quantity?.kind),
      shadowLayerCount: (platform?.contributions || []).flatMap((contribution) => (
        contribution.presentation?.layers || []
      )).filter((layer) => layer.quantity?.kind === 'occlusion.shadow-length').length,
      pedestrianActorCount: (platform?.contributions || []).flatMap((contribution) => (
        contribution.presentation?.layers || []
      )).filter((layer) => layer.quantity?.kind === 'actor.pedestrian.route-progress').length,
      activeViewModes: (platform?.contributions || []).flatMap((contribution) => (
        contribution.presentation?.viewIntents || []
      )).map((intent) => intent.mode),
      compareSelected: document.getElementById('camera-compare')?.getAttribute('aria-pressed') === 'true',
      controlsButtonVisible: isVisible(document.getElementById('decisions-button')),
      missionDockVisible: isVisible(document.querySelector('.mission-dock')),
      experienceSummary: (() => {
        const row = document.getElementById('experience-summary');
        return {
          experienceId: row?.dataset.experienceId || null,
          visible: isVisible(row),
          text: row?.innerText.replace(/\\s+/g, ' ').trim() || '',
          now: document.getElementById('experience-summary-event')?.textContent?.trim() || '',
          why: document.getElementById('experience-summary-narrative')?.textContent?.trim() || '',
          metricCount: row?.querySelectorAll('dl > div').length || 0,
        };
      })(),
      pluginHudSurfacePresent: Boolean(document.getElementById('plugin-hud-ui')),
      pluginHudCardCount: document.querySelectorAll('.plugin-hud-card').length,
      firstInspectorControlCount: document.querySelector('#plugin-inspector > [data-control-count]')?.dataset.controlCount || null,
      inspectorText: document.getElementById('plugin-inspector')?.innerText.replace(/\\s+/g, ' ').trim() || '',
    };
  })()`);
}

async function main() {
  const chromePath = findChrome('');
  const sitePort = await availablePort();
  const debugPort = await availablePort();
  const viewport = selectedViewport();
  const server = createStaticSiteServer({ publicRoot: PUBLIC });
  await new Promise((resolve) => server.listen(sitePort, '127.0.0.1', resolve));
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-ui-probe-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--enable-unsafe-webgpu',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDirectory}`,
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${viewport.width},${viewport.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  let client;
  try {
    const page = await waitForPage(debugPort, chrome);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const results = [];
    const filteredRun = process.argv.includes('--profile');
    const exerciseControls = process.argv.includes('--exercise-controls');
    for (const [tier, profileId] of selectedProfiles()) {
      await client.send('Page.navigate', { url: `http://127.0.0.1:${sitePort}/${tier}/${profileId}` });
      await waitForReady(client, profileId);
      if (process.argv.includes('--exercise')) {
        await exercisePlayback(client, 4, {
          intervene: process.argv.includes('--intervene'),
          settle: process.argv.includes('--settle'),
          compare: process.argv.includes('--compare'),
        });
      }
      const controlExercise = exerciseControls ? await exerciseControl(client, profileId) : null;
      results.push({ ...(await probe(client)), controlExercise });
    }
    let switchResult = null;
    if (!filteredRun) {
      await client.send('Page.navigate', { url: `http://127.0.0.1:${sitePort}/country/food-recall-us-v1` });
      await waitForReady(client, 'food-recall-us-v1');
      await evaluate(client, `(() => {
        const select = document.getElementById('application-profile');
        select.value = 'grid-resilience-us-v1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitForReady(client, 'grid-resilience-us-v1');
      switchResult = await evaluate(client, `(() => ({
      summaryCount: document.querySelectorAll('#experience-summary').length,
      summaryExperienceId: document.getElementById('experience-summary')?.dataset.experienceId || null,
      summaryText: document.getElementById('experience-summary')?.innerText.replace(/\\s+/g, ' ').trim() || '',
      mapOwners: [...document.querySelectorAll('#plugin-map-ui [data-plugin-id]')].map((row) => row.dataset.pluginId),
      controlOwners: [...document.querySelectorAll('[data-plugin-control]')].map((row) => row.closest('[data-plugin-id]')?.dataset.pluginId),
      }))()`);
      await evaluate(client, `document.getElementById('decisions-button').click()`);
      switchResult.drawerOpen = await evaluate(client, `document.getElementById('decisions-drawer').classList.contains('is-open')`);
    }
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshotPath = path.join(os.tmpdir(), 'simulatte-experience-ui-probe.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    const failures = results.flatMap((row) => {
      const expectedIds = row.expected.map((control) => `${control.pluginId}:${control.controlId}`).sort();
      const renderedIds = row.rendered.map((control) => `${control.pluginId}:${control.controlId}`).sort();
      return [
        ...(JSON.stringify(expectedIds) === JSON.stringify(renderedIds) ? [] : [`${row.profileId}: control contract did not match DOM`]),
        ...(row.expected.length ? [] : [`${row.profileId}: no experiment controls`]),
        ...(row.controlsButtonVisible ? [] : [`${row.profileId}: Controls button hidden`]),
        ...(row.missionDockVisible ? [] : [`${row.profileId}: mission dock hidden`]),
        ...(row.experienceSummary.visible
          && row.experienceSummary.experienceId === row.profileId
          && row.experienceSummary.now
          && row.experienceSummary.why
          && row.experienceSummary.metricCount > 0
          ? []
          : [`${row.profileId}: shared experience summary is incomplete or bound to the wrong profile`]),
        ...(!row.pluginHudSurfacePresent && row.pluginHudCardCount === 0
          ? []
          : [`${row.profileId}: duplicate plugin HUD surface rendered`]),
        ...(Number(row.firstInspectorControlCount) === row.expected.length ? [] : [`${row.profileId}: parameters were not first in the inspector`]),
        ...(!exerciseControls || row.controlExercise?.pass ? [] : [`${row.profileId}: control did not apply immediately`]),
        ...(row.profileId !== 'sun-walker-v1'
          || (row.shadowLayerCount > 0
            && row.pedestrianActorCount === 1
            && !row.activeViewModes.includes('pov'))
          ? []
          : [`${row.profileId}: expected visible shadow layers, one walker, and no POV intent`]),
      ];
    });
    if (switchResult?.summaryCount !== undefined && switchResult.summaryCount !== 1) failures.push(`experience switch left ${switchResult.summaryCount} shared summaries`);
    if (switchResult && switchResult.summaryExperienceId !== 'grid-resilience-us-v1') failures.push('experience summary did not bind Grid Resilience');
    if (switchResult && !switchResult.controlOwners.every((id) => id === 'grid-resilience-us')) failures.push('stale control owner remained after switch');
    if (switchResult && !switchResult.drawerOpen) failures.push('Controls button did not open the parameter drawer');
    const report = {
      pass: failures.length === 0,
      failures,
      profiles: results.map((row) => ({
        profileId: row.profileId,
        expectedControls: row.expected.length,
        renderedControls: row.rendered.length,
        contributionStates: row.contributionStates.length,
        sideMetrics: row.experienceSummary.text || null,
        pluginHudCards: row.pluginHudCardCount,
        comparisonLayerKinds: row.comparisonLayerKinds,
        shadowLayerCount: row.shadowLayerCount,
        pedestrianActorCount: row.pedestrianActorCount,
        activeViewModes: row.activeViewModes,
        compareSelected: row.compareSelected,
        controlExercise: row.controlExercise,
      })),
      switchResult,
      screenshotPath,
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await client?.close();
    chrome.kill();
    server.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
