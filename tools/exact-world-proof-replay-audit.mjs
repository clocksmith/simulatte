import { waitForCondition } from './audit-runtime-wait.mjs';

const RECEIPT_SCHEMA = 'simulatte.exactWorldProofReplayAudit.v1';
const WORLD_SPEC_SCHEMA = 'simulatte.worldSpec.v1';

function replayStateExpression(prompt, action = 'read') {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
    const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
    const canvas = document.getElementById('physics-canvas');
    const button = document.getElementById('replay-world-spec');
    const parse = (value, fallback) => {
      try { return JSON.parse(value || ''); } catch (_error) { return fallback; }
    };
    const sourceMatches = spec && spec.source && spec.source.prompt === prompt;
    const beforeRenderInputSerial = Number(canvas && canvas.dataset.renderInputSerial || 0);
    const livePixelSamples = canvas && canvas.__simulattePixelSamples &&
      Array.isArray(canvas.__simulattePixelSamples.samples)
      ? canvas.__simulattePixelSamples.samples
      : [];
    if (${JSON.stringify(action)} === 'click' && button && !button.disabled && sourceMatches) button.click();
    const classes = parse(canvas && canvas.dataset.worldProofClassStatuses, {});
    return {
      ok: Boolean(spec && spec.schema === ${JSON.stringify(WORLD_SPEC_SCHEMA)} && sourceMatches && button && !button.disabled),
      buttonPresent: Boolean(button),
      buttonDisabled: button ? button.disabled : null,
      sourceMatches: Boolean(sourceMatches),
      beforeRenderInputSerial,
      worldSpec: spec ? {
        schema: spec.schema || '',
        id: spec.id || '',
        contentHash: spec.contentHash || '',
        revision: Number(spec.authorship && spec.authorship.revision || 0),
        prompt: spec.source && spec.source.prompt || '',
      } : null,
      worldProof: {
        verdict: canvas && canvas.dataset.worldProofVerdict || '',
        contentHash: canvas && canvas.dataset.worldProofContentHash || '',
        worldSpecContentHash: canvas && canvas.dataset.worldProofWorldSpecHash || '',
        classStatuses: classes,
        criticalFailures: parse(canvas && canvas.dataset.worldProofCriticalFailures, []),
        sceneProofVerdict: canvas && canvas.dataset.sceneProofVerdict || '',
        sceneProofRequiredFailures: parse(canvas && canvas.dataset.sceneProofRequiredFailures, []),
        phase7PixelProofStatus: canvas && canvas.dataset.phase7PixelProofStatus || '',
        phase7PixelAuditChecks: parse(canvas && canvas.dataset.phase7PixelAuditChecks, []),
        phase7VisualObligationProof: parse(canvas && canvas.dataset.phase7VisualObligationProof, []),
        phase7PixelSamples: livePixelSamples.map((row) => ({
          id: row && row.id || '',
          obligationId: row && row.obligationId || '',
          drawableId: row && row.drawableId || '',
          constructionRole: row && row.constructionRole || '',
          constructionPartId: row && row.constructionPartId || '',
          expectedValue: row && row.expectedValue || '',
          rgba: Array.isArray(row && row.rgba) ? row.rgba.slice(0, 4) : [],
          uv: Array.isArray(row && row.uv) ? row.uv.slice(0, 2) : [],
        })),
      },
      compilerDeterminism: {
        status: canvas && canvas.dataset.compilerDeterminismStatus || '',
        baselineContentHash: canvas && canvas.dataset.compilerDeterminismBaselineHash || '',
        recompiledContentHash: canvas && canvas.dataset.compilerDeterminismRecompiledHash || '',
      },
      simulationReproducibility: {
        status: canvas && canvas.dataset.simulationReproducibilityStatus || '',
        baselineStateHash: canvas && canvas.dataset.simulationReproducibilityBaselineHash || '',
        replayStateHash: canvas && canvas.dataset.simulationReproducibilityReplayHash || '',
        maxAbsoluteDelta: Number(canvas && canvas.dataset.simulationReproducibilityMaxDelta || 0),
      },
      interactionVisual: parse(canvas && canvas.dataset.phase7InteractionVisual, {}),
      interactionRuntimeSelection: canvas && canvas.dataset.interactionSelectedTarget || '',
      constructionSearch: {
        status: canvas && canvas.dataset.constructionSearchStatus || '',
        attemptCount: Number(canvas && canvas.dataset.constructionSearchAttemptCount || 0),
        decision: canvas && canvas.dataset.constructionSearchDecision || '',
      },
    };
  })()`;
}

function replayResultExpression(prompt, beforeRenderInputSerial) {
  return `(() => {
    const state = ${replayStateExpression(prompt)};
    const afterRenderInputSerial = Number(document.getElementById('physics-canvas')?.dataset.renderInputSerial || 0);
    const requiredClasses = Object.entries(state.worldProof.classStatuses || {})
      .filter(([, status]) => status !== 'not-applicable');
    return {
      ...state,
      ok: afterRenderInputSerial > ${Number(beforeRenderInputSerial)} &&
        state.worldProof.verdict === 'pass' &&
        state.worldProof.classStatuses.replay === 'pass' &&
        requiredClasses.every(([, status]) => status === 'pass'),
      afterRenderInputSerial,
    };
  })()`;
}

function controlExecutionExpression(prompt) {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
    const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
    const canvas = document.getElementById('physics-canvas');
    const packet = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase6 &&
      spec.phaseArtifacts.phase6.artifact && spec.phaseArtifacts.phase6.artifact.visualCompile &&
      spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
    const entity = packet && Array.isArray(packet.entities)
      ? packet.entities.find((row) => Array.isArray(row && row.collider && row.collider.bounds) && row.collider.bounds.length === 4)
      : null;
    const sourceMatches = spec && spec.source && spec.source.prompt === prompt;
    if (!canvas || !entity || !sourceMatches) {
      return { ok: false, sourceMatches: Boolean(sourceMatches), entityId: entity && entity.id || '' };
    }
    const bounds = entity.collider.bounds;
    const rect = canvas.getBoundingClientRect();
    const beforeRenderInputSerial = Number(canvas.dataset.renderInputSerial || 0);
    const clientX = rect.left + (bounds[0] + bounds[2] * 0.5) * rect.width;
    const clientY = rect.top + (bounds[1] + bounds[3] * 0.5) * rect.height;
    const pointerId = 71;
    const originalSetPointerCapture = canvas.setPointerCapture;
    const originalReleasePointerCapture = canvas.releasePointerCapture;
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId, button: 0, buttons: 1, clientX, clientY,
    }));
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId, button: 0, buttons: 0, clientX, clientY,
    }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'ArrowRight', key: 'ArrowRight',
    }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'ArrowLeft', key: 'ArrowLeft',
    }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'Escape', key: 'Escape',
    }));
    canvas.setPointerCapture = originalSetPointerCapture;
    canvas.releasePointerCapture = originalReleasePointerCapture;
    return {
      ok: true,
      sourceMatches: true,
      entityId: entity.id || '',
      beforeRenderInputSerial,
    };
  })()`;
}

function controlResultExpression(prompt, beforeRenderInputSerial) {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
    const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
    const canvas = document.getElementById('physics-canvas');
    let classes = {};
    try { classes = JSON.parse(canvas && canvas.dataset.worldProofClassStatuses || '{}'); } catch (_error) {}
    const afterRenderInputSerial = Number(canvas && canvas.dataset.renderInputSerial || 0);
    return {
      ok: Boolean(spec && spec.source && spec.source.prompt === prompt &&
        afterRenderInputSerial >= ${Number(beforeRenderInputSerial)} && classes.interaction === 'pass'),
      afterRenderInputSerial,
      interactionStatus: classes.interaction || '',
      worldProofVerdict: canvas && canvas.dataset.worldProofVerdict || '',
    };
  })()`;
}

function validateExactWorldProofReplayReceipt(receipt, prompt) {
  const failures = [];
  if (receipt?.schema !== RECEIPT_SCHEMA) failures.push('receipt schema is invalid');
  if (receipt?.prompt !== prompt) failures.push('prompt binding is invalid');
  if (receipt?.worldSpec?.schema !== WORLD_SPEC_SCHEMA) failures.push('WorldSpec schema is invalid');
  if (receipt?.worldSpec?.prompt !== prompt) failures.push('WorldSpec prompt binding is invalid');
  if (!String(receipt?.worldSpec?.contentHash || '').startsWith('fnv1a32:')) failures.push('WorldSpec content hash is missing');
  if (receipt?.worldProof?.verdict !== 'pass') failures.push('WorldProof did not pass');
  if (!String(receipt?.worldProof?.contentHash || '').startsWith('fnv1a32:')) failures.push('WorldProof content hash is missing');
  if (receipt?.worldProof?.worldSpecContentHash !== receipt?.worldSpec?.contentHash) failures.push('WorldProof is rebound to another WorldSpec');
  if (receipt?.worldProof?.classStatuses?.replay !== 'pass') failures.push('replay proof did not pass');
  const failedRequiredClasses = Object.entries(receipt?.worldProof?.classStatuses || {})
    .filter(([, status]) => status !== 'not-applicable' && status !== 'pass')
    .map(([name]) => name);
  if (failedRequiredClasses.length) failures.push(`required WorldProof classes failed: ${failedRequiredClasses.join(', ')}`);
  if (receipt?.controlExecution?.required === true && receipt?.controlExecution?.executed !== true) {
    failures.push('declared control was not executed before replay');
  }
  if (receipt?.afterRenderInputSerial <= receipt?.beforeRenderInputSerial) failures.push('replay did not produce a new render input');
  if (receipt?.compilerDeterminism?.status !== 'pass') failures.push('compiler determinism did not pass');
  if (receipt?.compilerDeterminism?.baselineContentHash !== receipt?.compilerDeterminism?.recompiledContentHash) failures.push('independent compilation diverged');
  if (receipt?.simulationReproducibility?.status !== 'pass') failures.push('simulation reproducibility did not pass');
  if (receipt?.simulationReproducibility?.baselineStateHash !== receipt?.simulationReproducibility?.replayStateHash) failures.push('simulation replay diverged');
  if (failures.length) throw new Error(`Exact WorldProof replay failed: ${failures.join('; ')}`);
  return receipt;
}

async function captureExactWorldProofReplay({ cdp, evaluate, prompt, timeoutMs }) {
  const ready = await waitForCondition(
    `exact replay control for ${prompt}`,
    () => evaluate(cdp, replayStateExpression(prompt)),
    timeoutMs,
    { pollIntervalMs: 60 },
  );
  let controlExecution = { required: ready.worldProof.classStatuses.interaction !== 'not-applicable', executed: false };
  if (controlExecution.required) {
    const control = await evaluate(cdp, controlExecutionExpression(prompt));
    if (!control?.ok) throw new Error(`Exact WorldProof replay could not exercise a declared control for ${prompt}`);
    const controlSettled = await waitForCondition(
      `interaction proof for ${prompt}`,
      () => evaluate(cdp, controlResultExpression(prompt, control.beforeRenderInputSerial)),
      timeoutMs,
      {
        pollIntervalMs: 60,
        describeLast: (value) => ({
          interactionStatus: value?.interactionStatus || '',
          worldProofVerdict: value?.worldProofVerdict || '',
          beforeRenderInputSerial: control.beforeRenderInputSerial,
          afterRenderInputSerial: value?.afterRenderInputSerial || 0,
        }),
      },
    );
    controlExecution = {
      required: true,
      executed: true,
      entityId: control.entityId,
      beforeRenderInputSerial: control.beforeRenderInputSerial,
      afterRenderInputSerial: controlSettled.afterRenderInputSerial,
    };
  }
  const replayReady = await waitForCondition(
    `enabled exact replay control after interaction for ${prompt}`,
    () => evaluate(cdp, replayStateExpression(prompt)),
    timeoutMs,
    { pollIntervalMs: 60 },
  );
  const clicked = await evaluate(cdp, replayStateExpression(prompt, 'click'));
  const settled = await waitForCondition(
    `passing WorldProof replay for ${prompt}`,
    () => evaluate(cdp, replayResultExpression(prompt, clicked.beforeRenderInputSerial)),
    timeoutMs,
    {
      pollIntervalMs: 60,
      describeLast: (value) => ({
        verdict: value?.worldProof?.verdict || '',
        classStatuses: value?.worldProof?.classStatuses || {},
        criticalFailures: value?.worldProof?.criticalFailures || [],
        sceneProofVerdict: value?.worldProof?.sceneProofVerdict || '',
        sceneProofRequiredFailures: value?.worldProof?.sceneProofRequiredFailures || [],
        phase7PixelProofStatus: value?.worldProof?.phase7PixelProofStatus || '',
        phase7PixelAuditChecks: value?.worldProof?.phase7PixelAuditChecks || [],
        failedVisualObligations: (value?.worldProof?.phase7VisualObligationProof || [])
          .filter((row) => row && row.status !== 'pass'),
        failedVisualPixelSamples: (value?.worldProof?.phase7PixelSamples || [])
          .filter((sample) => (value?.worldProof?.phase7VisualObligationProof || [])
            .some((row) => row && row.status !== 'pass' &&
              (row.obligationId || row.id) === sample.obligationId)),
        interactionVisual: value?.interactionVisual || {},
        interactionRuntimeSelection: value?.interactionRuntimeSelection || '',
        constructionSearch: value?.constructionSearch || {},
        compilerDeterminism: value?.compilerDeterminism || {},
        beforeRenderInputSerial: clicked.beforeRenderInputSerial,
        afterRenderInputSerial: value?.afterRenderInputSerial || 0,
      }),
    },
  );
  return validateExactWorldProofReplayReceipt({
    schema: RECEIPT_SCHEMA,
    prompt,
    worldSpec: settled.worldSpec || ready.worldSpec,
    worldProof: settled.worldProof,
    controlExecution,
    compilerDeterminism: settled.compilerDeterminism,
    simulationReproducibility: settled.simulationReproducibility,
    beforeRenderInputSerial: clicked.beforeRenderInputSerial || replayReady.beforeRenderInputSerial,
    afterRenderInputSerial: settled.afterRenderInputSerial,
  }, prompt);
}

export {
  RECEIPT_SCHEMA,
  captureExactWorldProofReplay,
  replayResultExpression,
  replayStateExpression,
  controlExecutionExpression,
  controlResultExpression,
  validateExactWorldProofReplayReceipt,
};
