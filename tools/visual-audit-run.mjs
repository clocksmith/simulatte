import fs from 'node:fs/promises';
import path from 'node:path';
import { waitForCondition } from './audit-runtime-wait.mjs';
import { captureExactWorldProofReplay } from './exact-world-proof-replay-audit.mjs';
import { evaluate, captureCleanCanvasScreenshot, inspectPhaseRail, delay, MODEL_RUNTIME_STALL_MS } from './visual-audit-page.mjs';
import { sha256Hex, pngVisualStats, sampledFrameDifference } from './visual-audit-pixels.mjs';
import { visualRubricForResult } from './visual-audit-report.mjs';
import { diagnosticsExpression } from './visual-audit-diagnostics.mjs';

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'intent';
}

async function runPrompt(cdp, entry, index, outDir, options) {
  const timeoutMs = options.timeoutMs;
  const frameDelayMs = options.frameDelayMs;
  const prompt = entry.prompt;
  const label = `${String(index + 1).padStart(2, '0')}-${entry.kind}-${slug(prompt)}`;
  const auditStartedAt = Date.now();
  const auditStages = [];
  let activeStage = { id: 'configure', startedAt: auditStartedAt };
  const markStage = (id) => {
    const now = Date.now();
    auditStages.push({ id: activeStage.id, durationMs: now - activeStage.startedAt });
    activeStage = { id, startedAt: now };
    options.onAuditStage?.({
      schema: 'simulatte.visualAuditProgress.v1',
      promptIndex: index + 1,
      promptCount: options.promptCount || 0,
      prompt,
      stage: id,
      elapsedMs: now - auditStartedAt,
    });
  };
  let expectedRenderInputSerial = 0;
  let consentDeclinedBeforeRun = false;
  await evaluate(cdp, `(() => {
    const canvas = document.getElementById('physics-canvas');
    if (canvas && canvas.dataset) {
      canvas.dataset.auditRequirePixelProof = 'true';
      canvas.dataset.auditFreezeFrame = 'false';
    }
    return Boolean(canvas);
  })()`);
  markStage('runtime-wait');
  if (options.intentMode !== 'model' && index === 0) {
    await waitForCondition('Blank Qwen consent control ready', () => evaluate(cdp, `(() => {
      const toggle = document.getElementById('blank-neural-models');
      const dialog = document.getElementById('neural-model-dialog');
      return {
        ok: !!toggle && !!dialog && !toggle.checked && toggle.getAttribute('aria-checked') === 'false',
        checked: toggle && toggle.checked,
        ariaChecked: toggle && toggle.getAttribute('aria-checked'),
        dialogOpen: dialog && dialog.open,
      };
    })()`), timeoutMs);
    await evaluate(cdp, `(() => {
      document.getElementById('blank-neural-models').click();
      return true;
    })()`);
    await waitForCondition('Blank Qwen consent dialog open', () => evaluate(cdp, `(() => {
      const dialog = document.getElementById('neural-model-dialog');
      return { ok: !!dialog && dialog.open, dialogOpen: dialog && dialog.open };
    })()`), timeoutMs);
    await evaluate(cdp, `(() => {
      const cancel = document.querySelector('#neural-model-dialog [data-neural-consent="cancel"]');
      if (!cancel) return false;
      cancel.click();
      return true;
    })()`);
    await waitForCondition('Blank deterministic mode retained after declining Qwen', () => evaluate(cdp, `(() => {
      const toggle = document.getElementById('blank-neural-models');
      const dialog = document.getElementById('neural-model-dialog');
      return {
        ok: !!toggle && !!dialog && !dialog.open && !toggle.checked && toggle.getAttribute('aria-checked') === 'false',
        checked: toggle && toggle.checked,
        ariaChecked: toggle && toggle.getAttribute('aria-checked'),
        dialogOpen: dialog && dialog.open,
      };
    })()`), timeoutMs);
    consentDeclinedBeforeRun = true;
  }
  const promptBaseline = await evaluate(cdp, `(() => {
      const input = document.getElementById('build-prompt');
      if (!input) return { ok: false, reason: 'missing prompt input' };
      const canvas = document.getElementById('physics-canvas');
      const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
      const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
      const phase2 = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase2 || null;
      input.value = ${JSON.stringify(prompt)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        ok: true,
        sceneId: canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '',
        renderInputSerial: Number(canvas && canvas.dataset && canvas.dataset.renderInputSerial || 0),
        compiledPrompt: phase2 && phase2.artifact && phase2.artifact.languageGraph &&
          phase2.artifact.languageGraph.sourceText || '',
      };
    })()`);
    await waitForCondition(`run button ready for ${label}`, () => evaluate(cdp, `(() => {
      const run = document.getElementById('build-lab');
      const node = document.getElementById('intent-runtime');
      const health = window.SimulatteIntentRuntimeHealth || (() => {
        try { return node && node.dataset.health ? JSON.parse(node.dataset.health) : null; }
        catch (_err) { return null; }
      })();
      return {
        ok: !!run && run.disabled === false && (!node || node.dataset.blocking !== 'true'),
        state: node && node.dataset.state,
        stageId: node && node.dataset.stage,
        lastStage: node && node.dataset.lastStage,
        pipelineStep: node && node.dataset.pipelineStep,
        progress: node && node.dataset.progress,
        detail: node && node.dataset.detail,
        blocking: node && node.dataset.blocking,
        passive: node && node.dataset.passive,
        disabled: run && run.disabled,
        runtimeHealth: health,
        runtimeEvents: (window.__simulatteIntentRuntimeEvents || []).slice(-8),
      };
    })()`), timeoutMs, { extendOnProgress: true, stallTimeoutMs: MODEL_RUNTIME_STALL_MS });
    await evaluate(cdp, `(() => {
      const run = document.getElementById('build-lab');
      if (!run) return { ok: false, reason: 'missing run control' };
      run.click();
      return { ok: true };
    })()`);
    markStage('intent-compile');
    const readyState = await waitForCondition(`intent ready for ${label}`, () => evaluate(cdp, `(() => {
      const node = document.getElementById('intent-runtime');
      const run = document.getElementById('build-lab');
      const message = document.getElementById('intent-runtime-message');
      const stage = document.getElementById('intent-runtime-stage');
      const canvas = document.getElementById('physics-canvas');
      const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
      const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
      const phase2 = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase2 || null;
      const phase6 = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase6 || null;
      const phase6Ready = phase6 && phase6.schema === 'simulatte.phase6.output.v2';
      const sceneVisible = canvas && canvas.dataset && canvas.dataset.sceneVisible === 'true';
      const sceneId = canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '';
      const renderInputSerial = Number(canvas && canvas.dataset && canvas.dataset.renderInputSerial || 0);
      const compiledPrompt = phase2 && phase2.artifact && phase2.artifact.languageGraph &&
        phase2.artifact.languageGraph.sourceText || '';
      const normalizePrompt = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const promptMatches = normalizePrompt(compiledPrompt) === normalizePrompt(${JSON.stringify(prompt)});
      const renderInputAdvanced = renderInputSerial > ${Number(promptBaseline && promptBaseline.renderInputSerial || 0)};
      const health = window.SimulatteIntentRuntimeHealth || (() => {
        try { return node && node.dataset.health ? JSON.parse(node.dataset.health) : null; }
        catch (_err) { return null; }
      })();
      return {
        ok: !!node && node.dataset.state === 'ready' && (!run || run.disabled === false) &&
          phase6Ready && sceneVisible && promptMatches && renderInputAdvanced,
        state: node && node.dataset.state,
        stageId: node && node.dataset.stage,
        lastStage: node && node.dataset.lastStage,
        pipelineStep: node && node.dataset.pipelineStep,
        progress: node && node.dataset.progress,
        detail: node && node.dataset.detail,
        blocking: node && node.dataset.blocking,
        passive: node && node.dataset.passive,
        modelId: node && node.dataset.modelId,
        cacheMode: node && node.dataset.cacheMode,
        cacheWorker: node && node.dataset.cacheWorker,
        resourceKind: node && node.dataset.resourceKind,
        resourceFile: node && node.dataset.resourceFile,
        completedBytes: node && node.dataset.completedBytes,
        totalBytes: node && node.dataset.totalBytes,
        traceId: node && node.dataset.traceId,
        rankId: node && node.dataset.rankId,
        providerReady: node && node.dataset.providerReady,
        reuse: node && node.dataset.reuse,
        cacheHitCount: node && node.dataset.cacheHitCount,
        cacheMissCount: node && node.dataset.cacheMissCount,
        message: message && message.textContent,
        phaseLabel: stage && stage.textContent,
        renderer: canvas && canvas.dataset && canvas.dataset.renderer,
        rendererStatus: canvas && canvas.dataset && canvas.dataset.rendererStatus,
        sceneVisible,
        sceneId,
        renderInputSerial,
        renderInputAdvanced,
        compiledPrompt,
        promptMatches,
        phase6Schema: phase6 && phase6.schema || '',
        compiledSpecName: spec && spec.name || '',
        disabled: run && run.disabled,
        runtimeHealth: health,
        runtimeEvents: (window.__simulatteIntentRuntimeEvents || []).slice(-8),
      };
    })()`), timeoutMs, { extendOnProgress: true, stallTimeoutMs: MODEL_RUNTIME_STALL_MS });
  expectedRenderInputSerial = Number(readyState && readyState.renderInputSerial || 0);
  markStage('scene-proof');
  await delay(frameDelayMs);
  const settledProof = await waitForCondition(`pixel and scene proof settled for ${label}`, () => evaluate(cdp, `(() => {
    const canvas = document.getElementById('physics-canvas');
    const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
    const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
    const phase2 = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase2 || null;
    const compiledPrompt = phase2 && phase2.artifact && phase2.artifact.languageGraph &&
      phase2.artifact.languageGraph.sourceText || '';
    const normalizePrompt = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const promptMatches = normalizePrompt(compiledPrompt) === normalizePrompt(${JSON.stringify(prompt)});
    const sceneId = canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '';
    const renderInputSerial = Number(canvas && canvas.dataset && canvas.dataset.renderInputSerial || 0);
    const renderInputMatches = ${expectedRenderInputSerial} ? renderInputSerial >= ${expectedRenderInputSerial} : true;
    const sceneProofVerdict = canvas && canvas.dataset ? canvas.dataset.sceneProofVerdict || '' : '';
    const pixelReadback = canvas && canvas.dataset ? canvas.dataset.phase7PixelReadback || '' : '';
    const pixelProof = canvas && canvas.dataset ? canvas.dataset.phase7PixelProofStatus || '' : '';
    const rendered = Number(canvas && canvas.dataset && canvas.dataset.renderCount || 0);
    const terminalSceneProof = ['pass', 'fail', 'not-proven', 'error'].includes(sceneProofVerdict);
    const terminalPixelReadback = ['pass', 'fail', 'not-proven', 'error'].includes(pixelReadback);
    const terminalPixelProof = ['pass', 'fail', 'not-proven', 'error'].includes(pixelProof);
    const required = Number(canvas && canvas.dataset && canvas.dataset.phase7PixelRequiredObligationCount || 0);
    const sampled = Number(canvas && canvas.dataset && canvas.dataset.phase7PixelSampledObligationCount || 0);
    const semanticAbsence = Number(canvas && canvas.dataset && canvas.dataset.phase7SemanticAbsenceObligationCount || 0);
    const settled = Number(canvas && canvas.dataset && canvas.dataset.phase7PixelSettledObligationCount || 0);
    return {
      ok: promptMatches && renderInputMatches && rendered >= 3 && terminalSceneProof &&
        terminalPixelReadback && terminalPixelProof && required >= 1,
      renderCount: rendered,
      sceneId,
      renderInputSerial,
      expectedRenderInputSerial: ${expectedRenderInputSerial},
      renderInputMatches,
      compiledPrompt,
      promptMatches,
      sceneProofVerdict,
      phase7PixelReadback: pixelReadback,
      phase7PixelProofStatus: pixelProof,
      phase7PixelRequiredObligationCount: required,
      phase7PixelSampledObligationCount: sampled,
      phase7SemanticAbsenceObligationCount: semanticAbsence,
      phase7PixelSettledObligationCount: settled,
      phase7PixelVisibleSampleCount: Number(canvas && canvas.dataset && canvas.dataset.phase7PixelVisibleSampleCount || 0),
      phase7PixelMinContrast: Number(canvas && canvas.dataset && canvas.dataset.phase7PixelMinContrast || 0),
      phase7VisualObligationProof: canvas && canvas.dataset && canvas.dataset.phase7VisualObligationProof || '',
      phase7PassedVisualObligationIds: canvas && canvas.dataset &&
        canvas.dataset.phase7PassedVisualObligationIds || '',
      phase7PixelAuditChecks: canvas && canvas.dataset && canvas.dataset.phase7PixelAuditChecks || '',
    };
  })()`), timeoutMs, {
    extendOnProgress: true,
    stallTimeoutMs: MODEL_RUNTIME_STALL_MS,
    progressSignature: (value) => JSON.stringify({
      sceneProofVerdict: value && value.sceneProofVerdict || '',
      phase7PixelReadback: value && value.phase7PixelReadback || '',
      phase7PixelProofStatus: value && value.phase7PixelProofStatus || '',
      settled: value && value.phase7PixelSettledObligationCount || 0,
    }),
    describeLast: (value) => ({
      renderCount: value && value.renderCount || 0,
      sceneId: value && value.sceneId || '',
      renderInputMatches: value && value.renderInputMatches === true,
      renderInputSerial: value && value.renderInputSerial || 0,
      expectedRenderInputSerial: value && value.expectedRenderInputSerial || 0,
      promptMatches: value && value.promptMatches === true,
      sceneProofVerdict: value && value.sceneProofVerdict || '',
      phase7PixelReadback: value && value.phase7PixelReadback || '',
      phase7PixelProofStatus: value && value.phase7PixelProofStatus || '',
      requiredObligations: value && value.phase7PixelRequiredObligationCount || 0,
      sampledObligations: value && value.phase7PixelSampledObligationCount || 0,
      semanticAbsenceObligations: value && value.phase7SemanticAbsenceObligationCount || 0,
      settledObligations: value && value.phase7PixelSettledObligationCount || 0,
    }),
  });
  let exactReplay = null;
  if (options.exactReplay) {
    markStage('exact-replay');
    exactReplay = await captureExactWorldProofReplay({
      cdp,
      evaluate,
      prompt,
      timeoutMs,
    });
  }
  markStage('diagnostics');
  const diagnostics = await evaluate(cdp, diagnosticsExpression(prompt));
  diagnostics.phaseRailLayout = await inspectPhaseRail(cdp);
  markStage('viewport-screenshot');
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  const file = `${label}.png`;
  const bytes = Buffer.from(screenshot.data, 'base64');
  await fs.writeFile(path.join(outDir, file), bytes);
  let canvasScreenshot = '';
  let canvasScreenshotLater = '';
  let canvasStats = null;
  let canvasStatsLater = null;
  let canvasScreenshotHash = '';
  let canvasScreenshotLaterHash = '';
  let canvasPerceptualHash = '';
  let canvasPerceptualHashLater = '';
  let canvasDiversityScreenshot = '';
  let canvasDiversityScreenshotLater = '';
  let canvasDiversityPerceptualHash = '';
  let canvasDiversityPerceptualHashLater = '';
  if (diagnostics.canvasRect && diagnostics.canvasRect.width > 0 && diagnostics.canvasRect.height > 0) {
    markStage('temporal-canvas-capture');
    try {
      const clip = {
        x: Math.max(0, diagnostics.canvasRect.x),
        y: Math.max(0, diagnostics.canvasRect.y),
        width: Math.max(1, diagnostics.canvasRect.width),
        height: Math.max(1, diagnostics.canvasRect.height),
        scale: 1,
      };
      const clipped = await captureCleanCanvasScreenshot(cdp, clip);
      const clipBytes = Buffer.from(clipped.data, 'base64');
      canvasScreenshot = `${label}.canvas.png`;
      await fs.writeFile(path.join(outDir, canvasScreenshot), clipBytes);
      canvasStats = pngVisualStats(clipBytes);
      canvasScreenshotHash = sha256Hex(clipBytes);
      await delay(frameDelayMs);
      const clippedLater = await captureCleanCanvasScreenshot(cdp, clip);
      const clipBytesLater = Buffer.from(clippedLater.data, 'base64');
      canvasScreenshotLater = `${label}.canvas-late.png`;
      await fs.writeFile(path.join(outDir, canvasScreenshotLater), clipBytesLater);
      canvasStatsLater = pngVisualStats(clipBytesLater);
      canvasScreenshotLaterHash = sha256Hex(clipBytesLater);
      canvasPerceptualHash = canvasStats && canvasStats.perceptualHash || '';
      canvasPerceptualHashLater = canvasStatsLater && canvasStatsLater.perceptualHash || '';
    } catch (_err) {
      canvasStats = null;
      canvasStatsLater = null;
    }
  }
  if (diagnostics.canvasRect && diagnostics.canvasRect.width > 0 && diagnostics.canvasRect.height > 0) {
    markStage('frozen-canvas-capture');
    try {
      await evaluate(cdp, `(() => {
        const canvas = document.getElementById('physics-canvas');
        if (!canvas || !canvas.dataset) return false;
        canvas.dataset.auditFreezeFrame = 'true';
        return true;
      })()`);
      await delay(Math.max(80, Math.min(frameDelayMs, 240)));
      const clip = {
        x: Math.max(0, diagnostics.canvasRect.x),
        y: Math.max(0, diagnostics.canvasRect.y),
        width: Math.max(1, diagnostics.canvasRect.width),
        height: Math.max(1, diagnostics.canvasRect.height),
        scale: 1,
      };
      const frozen = await captureCleanCanvasScreenshot(cdp, clip);
      const frozenBytes = Buffer.from(frozen.data, 'base64');
      canvasDiversityScreenshot = `${label}.canvas-diversity.png`;
      await fs.writeFile(path.join(outDir, canvasDiversityScreenshot), frozenBytes);
      canvasDiversityPerceptualHash = pngVisualStats(frozenBytes)?.perceptualHash || '';
      await delay(Math.max(80, Math.min(frameDelayMs, 240)));
      const frozenLater = await captureCleanCanvasScreenshot(cdp, clip);
      const frozenLaterBytes = Buffer.from(frozenLater.data, 'base64');
      canvasDiversityScreenshotLater = `${label}.canvas-diversity-late.png`;
      await fs.writeFile(path.join(outDir, canvasDiversityScreenshotLater), frozenLaterBytes);
      canvasDiversityPerceptualHashLater = pngVisualStats(frozenLaterBytes)?.perceptualHash || '';
    } catch (_err) {
      canvasDiversityPerceptualHash = '';
      canvasDiversityPerceptualHashLater = '';
    } finally {
      await evaluate(cdp, `(() => {
        const canvas = document.getElementById('physics-canvas');
        if (canvas && canvas.dataset) canvas.dataset.auditFreezeFrame = 'false';
      })()`);
    }
  }
  markStage('analyze');
  const sceneRenderPacketCanonicalJson = diagnostics.sceneRenderPacketCanonicalJson || '';
  delete diagnostics.sceneRenderPacketCanonicalJson;
  const finalDiagnostics = { ...diagnostics, ...settledProof };
  finalDiagnostics.exactReplay = exactReplay;
  finalDiagnostics.promptSha256 = sha256Hex(prompt);
  finalDiagnostics.sceneRenderPacketSha256 = sceneRenderPacketCanonicalJson
    ? sha256Hex(sceneRenderPacketCanonicalJson)
    : '';
  finalDiagnostics.sceneRenderPacketHashKind = 'sha256:canonical-json-recursive-key-sort-v1';
  if (!finalDiagnostics.sampleCount && canvasStats && canvasStats.sampleCount) {
    finalDiagnostics.sampleSource = 'canvas-screenshot';
    finalDiagnostics.sampleCount = canvasStats.sampleCount;
    finalDiagnostics.lumaMean = canvasStats.lumaMean;
    finalDiagnostics.lumaStd = canvasStats.lumaStd;
    finalDiagnostics.coloredRatio = canvasStats.coloredRatio;
    finalDiagnostics.canvasHash = canvasStats.hash;
  }
  finalDiagnostics.readableCanvasSampleCount = diagnostics.sampleCount;
  finalDiagnostics.canvasScreenshot = canvasScreenshot;
  finalDiagnostics.canvasScreenshotLater = canvasScreenshotLater;
  finalDiagnostics.canvasScreenshotHash = canvasScreenshotHash;
  finalDiagnostics.canvasScreenshotLaterHash = canvasScreenshotLaterHash;
  finalDiagnostics.canvasPerceptualHash = canvasPerceptualHash;
  finalDiagnostics.canvasPerceptualHashLater = canvasPerceptualHashLater;
  finalDiagnostics.canvasDiversityScreenshot = canvasDiversityScreenshot;
  finalDiagnostics.canvasDiversityScreenshotLater = canvasDiversityScreenshotLater;
  finalDiagnostics.canvasDiversityPerceptualHash = canvasDiversityPerceptualHash;
  finalDiagnostics.canvasDiversityPerceptualHashLater = canvasDiversityPerceptualHashLater;
  finalDiagnostics.canvasDiversityHashKind = 'audit:visual-clean-canvas-dhash-64';
  finalDiagnostics.consentDeclinedBeforeRun = consentDeclinedBeforeRun;
  finalDiagnostics.canvasDiversityFrameStable = Boolean(canvasDiversityPerceptualHash &&
    canvasDiversityPerceptualHash === canvasDiversityPerceptualHashLater);
  finalDiagnostics.canvasFrameHashChanged = Boolean(canvasScreenshotHash && canvasScreenshotLaterHash && canvasScreenshotHash !== canvasScreenshotLaterHash);
  if (canvasStats) {
    finalDiagnostics.canvasScreenshotWidth = canvasStats.width;
    finalDiagnostics.canvasScreenshotHeight = canvasStats.height;
    finalDiagnostics.canvasScreenshotLumaStd = canvasStats.lumaStd;
    finalDiagnostics.canvasScreenshotColoredRatio = canvasStats.coloredRatio;
    finalDiagnostics.canvasScreenshotSampleCount = canvasStats.sampleCount;
    finalDiagnostics.canvasScreenshotNearWhiteRatio = canvasStats.nearWhiteRatio;
    finalDiagnostics.canvasScreenshotStrongEdgeRatio = canvasStats.strongEdgeRatio;
  }
  if (canvasStats && canvasStatsLater) {
    const frameDifference = sampledFrameDifference(canvasStats, canvasStatsLater);
    finalDiagnostics.canvasFrameSampleHashChanged = canvasStats.hash !== canvasStatsLater.hash;
    finalDiagnostics.canvasFrameLumaMeanDelta = Number(Math.abs(canvasStats.lumaMean - canvasStatsLater.lumaMean).toFixed(3));
    finalDiagnostics.canvasFrameLumaStdDelta = Number(Math.abs(canvasStats.lumaStd - canvasStatsLater.lumaStd).toFixed(3));
    finalDiagnostics.canvasFrameColoredRatioDelta = Number(Math.abs(canvasStats.coloredRatio - canvasStatsLater.coloredRatio).toFixed(4));
    finalDiagnostics.canvasFrameMeanAbsolutePixelDelta = frameDifference.meanAbsoluteDelta;
    finalDiagnostics.canvasFrameChangedPixelRatio = frameDifference.changedPixelRatio;
  }
  finalDiagnostics.visualRubric = visualRubricForResult(finalDiagnostics, prompt);
  markStage('complete');
  const auditCompletedAt = Date.now();
  const auditTiming = {
    schema: 'simulatte.visualAuditTiming.v1',
    durationMs: auditCompletedAt - auditStartedAt,
    stages: [...auditStages, { id: activeStage.id, durationMs: auditCompletedAt - activeStage.startedAt }],
  };
  return {
    index: index + 1,
    kind: entry.kind,
    goldRowId: entry.goldRowId || '',
    prompt,
    screenshot: file,
    screenshotHash: sha256Hex(bytes),
    auditTiming,
    ...finalDiagnostics,
  };
}


export { runPrompt };
