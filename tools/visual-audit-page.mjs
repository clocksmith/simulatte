import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { waitForCondition } from './audit-runtime-wait.mjs';
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const MODEL_CONSENT_STORAGE_KEY = 'simulatte.neuralModels.consent.v1';
const MODEL_SELECTION_STORAGE_KEY =
  'simulatte.modelSelection.simulatte-pipeline-model-selection-v1.blank';
const MODEL_SELECTION_VALUE = Object.freeze({
  schema: 'simulatte.pipelineModelSelectionState.v1',
  selections: Object.freeze({
    'bounded-classification': 'multinomial-nb-tfidf-head',
    'open-vocabulary-retrieval': 'qwen-embedding-retrieval',
    'candidate-reranking': 'deterministic-typed-reranking',
  }),
});
const require = createRequire(import.meta.url);
const neuralModelConsent = require('../public/neural-model-consent.js');
const MODEL_RUNTIME_LOCK = JSON.parse(await fs.readFile(path.join(PUBLIC_DIR, 'data/simulatte-embedder/model-runtime-lock.json'), 'utf8'));
const MODEL_RUNTIME_BUNDLE = neuralModelConsent.summarizeLock(MODEL_RUNTIME_LOCK);
const MODEL_CONSENT_GRANT = Object.freeze({
  schema: 'simulatte.neuralModelConsent.v1',
  enabled: true,
  bundleIdentity: MODEL_RUNTIME_BUNDLE.identity,
  lockId: MODEL_RUNTIME_BUNDLE.lockId,
  lockNumber: MODEL_RUNTIME_BUNDLE.lockNumber,
  grantedAt: 'audit-authorized',
});
const MODEL_RUNTIME_STALL_MS = 90000;
const MODEL_PROMPT_DEADLINE_MULTIPLIER = 2;
const CLEAN_CANVAS_CAPTURE_SELECTORS = Object.freeze([
  '.prompt-dock',
  '#loading-canvas',
]);

async function evaluate(cdp, expression, options = {}) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: options.awaitPromise === true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result ? result.result.value : undefined;
}

async function hideCanvasOverlays(cdp) {
  return evaluate(cdp, `(() => {
    const selectors = ${JSON.stringify(CLEAN_CANVAS_CAPTURE_SELECTORS)};
    const rows = Array.from(new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))));
    window.__simulatteAuditOverlayStyles = rows.map((node) => ({ node, cssText: node.style.cssText }));
    for (const node of rows) {
      node.style.setProperty('visibility', 'hidden', 'important');
      node.style.setProperty('pointer-events', 'none', 'important');
    }
    return rows.length;
  })()`);
}

async function restoreCanvasOverlays(cdp) {
  return evaluate(cdp, `(() => {
    const rows = Array.isArray(window.__simulatteAuditOverlayStyles)
      ? window.__simulatteAuditOverlayStyles
      : [];
    for (const row of rows) {
      if (row && row.node && row.node.style) row.node.style.cssText = row.cssText || '';
    }
    delete window.__simulatteAuditOverlayStyles;
    return rows.length;
  })()`);
}

async function captureCleanCanvasScreenshot(cdp, clip) {
  await hideCanvasOverlays(cdp);
  try {
    return await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
      clip,
    });
  } finally {
    await restoreCanvasOverlays(cdp);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function promptDeadlineMs(options = {}) {
  if (Number(options.promptTimeoutMs || 0) > 0) return Number(options.promptTimeoutMs);
  if (options.intentMode === 'model') {
    return Number(options.timeoutMs || 0) + MODEL_RUNTIME_STALL_MS * MODEL_PROMPT_DEADLINE_MULTIPLIER;
  }
  return Number(options.timeoutMs || 0) * 4;
}

async function setupPage(cdp, url, width, height, timeoutMs, intentMode) {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (intentMode === 'model') {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: [
        `localStorage.setItem(${JSON.stringify(MODEL_CONSENT_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(MODEL_CONSENT_GRANT))});`,
        `localStorage.setItem(${JSON.stringify(MODEL_SELECTION_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(MODEL_SELECTION_VALUE))});`,
      ].join('\n'),
    });
  }
  const loaded = cdp.waitForEvent('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await loaded;
  await waitForCondition('Simulatte UI ready', () => evaluate(cdp, `(() => {
    if (window.SimulatteStartPhysicsLab && window.SimulattePhysicsLab && !window.SimulattePhysicsLab._browserLab) {
      window.SimulatteStartPhysicsLab();
    }
    const run = document.getElementById('build-lab');
    const runtime = document.getElementById('intent-runtime');
    const health = window.SimulatteIntentRuntimeHealth || (() => {
      try { return runtime && runtime.dataset.health ? JSON.parse(runtime.dataset.health) : null; }
      catch (_err) { return null; }
    })();
    const runtimeEvents = (window.__simulatteIntentRuntimeEvents || []).slice(-8);
    const blocking = runtime && runtime.dataset.blocking === 'true';
    const retrieval = document.querySelector('[data-model-slot="open-vocabulary-retrieval"]');
    const neuralConsent = document.getElementById('blank-neural-models');
    const modelLaneReady = ${JSON.stringify(intentMode)} !== 'model' || (
      retrieval &&
      retrieval.value === 'qwen-embedding-retrieval' &&
      neuralConsent &&
      neuralConsent.checked === true &&
      neuralConsent.getAttribute('aria-checked') === 'true'
    );
    return {
      ok: document.readyState === 'complete' &&
        !!document.getElementById('build-prompt') &&
        !!document.getElementById('physics-canvas') &&
        !!(window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab) &&
        modelLaneReady &&
        (!run || run.disabled === false || !blocking),
      labReady: !!(window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab),
      modelLaneReady,
      retrievalSelection: retrieval && retrieval.value,
      neuralConsent: neuralConsent && neuralConsent.checked,
      runDisabled: run && run.disabled,
      runtimeState: runtime && runtime.dataset.state,
      runtimeBlocking: runtime && runtime.dataset.blocking,
      runtimePassive: runtime && runtime.dataset.passive,
      runtimeStage: runtime && runtime.dataset.stage,
      runtimeLastStage: runtime && runtime.dataset.lastStage,
      runtimeDetail: runtime && runtime.dataset.detail,
      runtimeHealth: health,
      runtimeEvents,
    };
  })()`), timeoutMs, {
    extendOnProgress: intentMode === 'model',
    stallTimeoutMs: MODEL_RUNTIME_STALL_MS,
  });
  await delay(300);
}

async function auditFailureState(cdp) {
  if (!cdp) return null;
  try {
    return await evaluate(cdp, `(() => {
      const runtime = document.getElementById('intent-runtime');
      const canvas = document.getElementById('physics-canvas');
      const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
      const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
      const artifacts = spec && spec.phaseArtifacts || {};
      const phase6 = artifacts.phase6 && artifacts.phase6.artifact || {};
      const visualCompile = phase6.visualCompile || {};
      const canvasDiagnostics = canvas && canvas.dataset
        ? Object.fromEntries(Object.entries(canvas.dataset).filter(([key]) =>
          /^(?:renderer|renderCount|scene|phase7|phase8|webgpu|audit|error|failed)/i.test(key)))
        : {};
      return {
        url: location.href,
        runtime: runtime && runtime.dataset ? { ...runtime.dataset } : {},
        canvas: canvasDiagnostics,
        labReady: Boolean(lab),
        spec: spec ? {
          name: spec.name || '',
          templateId: spec.templateId || '',
          phaseSchemas: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, value && value.schema || ''])),
          phase6SceneKind: visualCompile.sceneRenderPacket && visualCompile.sceneRenderPacket.sceneKind || '',
          phase6RenderPacketSchema: visualCompile.sceneRenderPacket && visualCompile.sceneRenderPacket.schema || '',
        } : null,
      };
    })()`);
  } catch (error) {
    return { captureError: error && error.message ? error.message : String(error) };
  }
}


export { setupPage, auditFailureState, evaluate, captureCleanCanvasScreenshot, delay, promptDeadlineMs, MODEL_RUNTIME_STALL_MS };
export async function inspectPhaseRail(cdp) {
  return evaluate(cdp, `(() => {
    const menu = document.getElementById('run-details-menu');
    const rail = document.querySelector('.phase-rail-shell');
    const panel = document.querySelector('.physics-panel');
    if (!menu || !rail || !panel) return null;
    const wasOpen = menu.open;
    const scrollTop = panel.scrollTop;
    try {
      if (!wasOpen) menu.querySelector('summary').click();
      rail.scrollIntoView({ block: 'nearest' });
      const rect = rail.getBoundingClientRect();
      const canvas = document.getElementById('physics-canvas').getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(rect.right, canvas.right) - Math.max(rect.left, canvas.left));
      const overlapHeight = Math.max(0, Math.min(rect.bottom, canvas.bottom) - Math.max(rect.top, canvas.top));
      return {
        inspected: menu.open, visible: rail.checkVisibility(),
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        canvasOverlapRatio: overlapWidth * overlapHeight / Math.max(1, canvas.width * canvas.height),
        buttonCount: rail.querySelectorAll('.phase-rail-step').length,
        detail: document.getElementById('phase-details')?.textContent || '',
      };
    } finally {
      if (!wasOpen) menu.querySelector('summary').click();
      panel.scrollTop = scrollTop;
    }
  })()`);
}
