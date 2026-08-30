#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  beginBrowserMemoryWindow,
  endBrowserMemoryWindow,
  validateBrowserMemoryReceipt,
} from './browser-memory-receipt.mjs';
import { CdpClient } from './simulatte/browser-harness.mjs';
import { createStaticSiteServer } from './simulatte/static-site-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'blank-world-spec-editor');
const DEFAULT_BOUNDARY_SET = path.join(ROOT, 'tools', 'samer', 'simulatte-public-boundary-v1.json');

function parseArgs(argv) {
  const options = {
    chromePath: process.env.CHROME_PATH || '',
    boundarySetPath: DEFAULT_BOUNDARY_SET,
    boundaryRowId: '',
    outDir: DEFAULT_OUT,
    prompt: '',
    url: '',
    viewport: { width: 1440, height: 1000 },
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inlineValue] = argv[index].split('=');
    const value = () => inlineValue ?? argv[++index];
    if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--boundary-set') options.boundarySetPath = path.resolve(value());
    else if (key === '--boundary-row') options.boundaryRowId = String(value() || '');
    else if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--prompt') options.prompt = String(value() || '');
    else if (key === '--url') options.url = new URL(value()).toString();
    else if (key === '--viewport') options.viewport = parseViewport(value());
    else if (key === '--help') {
      console.log('usage: node tools/audit-world-spec-editor.mjs [--boundary-set PATH] [--boundary-row ID] [--viewport WIDTHxHEIGHT] [--prompt TEXT] [--out DIR] [--chrome PATH] [--url URL]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

export function loadBoundary(options) {
  const source = fs.readFileSync(options.boundarySetPath);
  const set = JSON.parse(source.toString('utf8'));
  if (set.schema !== 'simulatte.promptBoundarySet.v1' || !set.id || !Array.isArray(set.rows) || !set.rows.length) {
    throw new Error(`Boundary set ${options.boundarySetPath} expected simulatte.promptBoundarySet.v1 with rows`);
  }
  if (set.governingMetric?.schema !== 'simulatte.promptBoundaryGoverningMetric.v1' ||
      set.governingMetric.everyBoundaryMustPass !== true ||
      !Number.isFinite(Number(set.governingMetric.maximumAuditDurationMs)) ||
      Number(set.governingMetric.maximumAuditDurationMs) < 0 ||
      !Number.isFinite(Number(set.governingMetric.maximumObservedJsHeapBytes)) ||
      Number(set.governingMetric.maximumObservedJsHeapBytes) <= 0) {
    throw new Error(`Boundary set ${set.id} requires a fail-closed governing metric`);
  }
  const ids = new Set();
  for (const row of set.rows) {
    if (!row?.id || ids.has(row.id)) throw new Error(`Boundary set ${set.id} has a duplicate or missing row identity`);
    ids.add(row.id);
  }
  const row = options.boundaryRowId
    ? set.rows.find((entry) => entry.id === options.boundaryRowId)
    : set.rows[0];
  if (!row) throw new Error(`Boundary set ${set.id} has no row ${options.boundaryRowId}`);
  const boundary = structuredClone(row);
  if (options.prompt) boundary.prompt = options.prompt;
  validateBoundaryRow(boundary);
  return {
    ...boundary,
    boundarySetId: set.id,
    boundarySetSchema: set.schema,
    boundaryContractSha256: crypto.createHash('sha256').update(source).digest('hex'),
    maximumAuditDurationMs: Number(set.governingMetric.maximumAuditDurationMs),
    maximumObservedJsHeapBytes: Number(set.governingMetric.maximumObservedJsHeapBytes),
    adHocPromptOverride: Boolean(options.prompt),
  };
}

function validateBoundaryRow(row) {
  const edit = row && row.edit || {};
  const acceptance = row && row.acceptance || {};
  if (row?.boundaryKind !== 'unsupported-edit-replay' || !row.prompt || !row.supportedEntityType ||
      !row.unsupportedLabel || !/^#[0-9a-f]{6}$/i.test(edit.originalColor || '') ||
      !/^#[0-9a-f]{6}$/i.test(edit.replacementColor || '') || !edit.rationale ||
      acceptance.initialSceneProofVerdict !== 'fail' || acceptance.finalSceneProofVerdict !== 'pass' ||
      acceptance.finalWorldProofVerdict !== 'pass' || acceptance.reconciliationRequired !== true ||
      acceptance.recompilationDecision !== 'preserve-overrides') {
    throw new Error(`Boundary row ${row?.id || '(missing)'} is incomplete`);
  }
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value || ''));
  if (!match) throw new Error(`Expected viewport WIDTHxHEIGHT, received ${value || 'missing'}`);
  const viewport = { width: Number(match[1]), height: Number(match[2]) };
  if (viewport.width < 320 || viewport.height < 480) {
    throw new Error(`Expected viewport at least 320x480, received ${value}`);
  }
  return viewport;
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
  throw new Error('WorldSpec editor audit requires Chrome or Chromium. Pass --chrome PATH.');
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
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve();
    });
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
    const detail = result.exceptionDetails.exception && result.exceptionDetails.exception.description ||
      result.exceptionDetails.text;
    throw new Error(detail || 'Browser evaluation failed');
  }
  return result.result && result.result.value;
}

function editorProbeExpression(boundary) {
  return String.raw`(async () => {
    const auditStarted = performance.now();
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (label, read, timeoutMs = 20000) => {
      const started = performance.now();
      let value;
      while (!(value = read())) {
        if (performance.now() - started > timeoutMs) throw new Error('Timed out waiting for ' + label);
        await delay(40);
      }
      return value;
    };
    if (window.SimulatteStartPhysicsLab && !window.SimulattePhysicsLab?._browserLab) {
      window.SimulatteStartPhysicsLab();
    }
    const lab = await waitFor('Create lab', () => window.SimulattePhysicsLab?._browserLab);
    const boundary = ${JSON.stringify(boundary)};
    const prompt = boundary.prompt;
    const unsupportedLabel = String(boundary.unsupportedLabel || '').toLowerCase();
    const supportedEntityType = String(boundary.supportedEntityType || '').toLowerCase();
    const containsUnsupported = (value) => String(value || '').toLowerCase().includes(unsupportedLabel);
    const matchesSupportedEntity = (node) => [node && node.sourceLabel, node && node.label]
      .some((value) => String(value || '').toLowerCase().replace(/s$/, '') === supportedEntityType.replace(/s$/, ''));
    const promptInput = document.getElementById('build-prompt');
    const runButton = document.getElementById('build-lab');
    const canvas = document.getElementById('physics-canvas');
    if (!promptInput || !runButton || !canvas) throw new Error('Create controls are incomplete');
    promptInput.value = prompt;
    promptInput.dispatchEvent(new Event('input', { bubbles: true }));
    runButton.click();
    const compiled = await waitFor('compiled WorldSpec', () => {
      const spec = lab.getSpec();
      return spec?.schema === 'simulatte.worldSpec.v1' &&
        spec.source?.prompt === prompt && spec.phaseArtifacts?.phase6 ? spec : null;
    });
    await waitFor('initial Phase 7 frame', () => Number(canvas.dataset.renderCount || 0) > 0);
    await waitFor('initial critical proof failure', () => {
      const failures = JSON.parse(canvas.dataset.sceneProofRequiredFailures || '[]');
      return canvas.dataset.sceneProofFinal === 'true' &&
        canvas.dataset.sceneProofVerdict === 'fail' &&
        failures.some((row) => containsUnsupported(JSON.stringify(row)));
    });
    const failedSpec = lab.getSpec();
    const initialRequiredFailures = JSON.parse(canvas.dataset.sceneProofRequiredFailures || '[]');
    const before = {
      contentHash: failedSpec.contentHash,
      revision: failedSpec.authorship.revision,
      renderCount: Number(canvas.dataset.renderCount || 0),
      renderInputSerial: Number(canvas.dataset.renderInputSerial || 0),
      sceneProofVerdict: canvas.dataset.sceneProofVerdict || '',
      requiredFailures: initialRequiredFailures,
    };
    const advanced = document.getElementById('prompt-more-menu');
    const editorPanel = document.getElementById('world-spec-editor-panel');
    const editor = document.getElementById('world-spec-editor');
    const rationale = document.getElementById('world-spec-edit-rationale');
    const applyButton = document.getElementById('apply-world-spec');
    const replayButton = document.getElementById('replay-world-spec');
    const exportButton = document.getElementById('export-lab');
    const improvementExportButton = document.getElementById('export-improvement-record');
    const improvementStatus = document.getElementById('world-improvement-record-status');
    const importFile = document.getElementById('world-spec-import-file');
    const status = document.getElementById('world-spec-editor-status');
    if (!advanced || !editorPanel || !editor || !rationale || !applyButton || !replayButton ||
        !exportButton || !improvementExportButton || !improvementStatus || !importFile || !status) {
      throw new Error('WorldSpec editor surface is incomplete');
    }
    const improvementExportInitiallyDisabled = improvementExportButton.disabled === true;
    advanced.open = true;
    editorPanel.open = true;
    await waitFor('serialized WorldSpec editor value', () => editor.value && JSON.parse(editor.value));
    const draft = JSON.parse(editor.value);
    const unsupportedNode = draft.universeGraph.nodes.find((node) => containsUnsupported(node.label || ''));
    if (!unsupportedNode) throw new Error('Audit prompt did not compile the unsupported ' + boundary.unsupportedLabel + ' node');
    draft.universeGraph.nodes = draft.universeGraph.nodes
      .filter((node) => node.id !== unsupportedNode.id);
    draft.universeGraph.edges = draft.universeGraph.edges
      .filter((edge) => edge.from !== unsupportedNode.id && edge.to !== unsupportedNode.id);
    const nodeIndex = draft.universeGraph.nodes.findIndex(matchesSupportedEntity);
    if (nodeIndex < 0) throw new Error('Audit prompt did not compile a ' + boundary.supportedEntityType + ' node');
    const color = (draft.universeGraph.nodes[nodeIndex].properties || [])
      .find((row) => row.kind === 'color');
    if (!color) throw new Error('Audit prompt did not compile the supported entity color property');
    const originalColor = color.value;
    color.value = boundary.edit.replacementColor;
    draft.safety = {
      schema: 'simulatte.worldSpecSafety.v1',
      status: 'declared',
      rules: [{
        schema: 'simulatte.worldSpecSafetyRule.v1',
        id: 'safety:elapsed-time-bound',
        description: 'Keep the proof trajectory within one simulated second',
        statePath: '/t',
        operator: 'between',
        minimum: 0,
        maximum: 1,
        expected: null,
        tolerance: 1e-12,
        severity: 'block',
      }],
    };
    editor.value = JSON.stringify(draft, null, 2);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    rationale.value = boundary.edit.rationale;
    if (applyButton.disabled) throw new Error('WorldSpec apply control stayed disabled after an edit');
    applyButton.click();
    let edited = await waitFor('edited WorldSpec replay', () => {
      const spec = lab.getSpec();
      return spec?.authorship?.revision === before.revision + 1 && spec.contentHash !== before.contentHash
        ? spec : null;
    });
    await waitFor('edited Phase 7 frame', () => (
      Number(canvas.dataset.renderInputSerial || 0) > before.renderInputSerial &&
      Number(canvas.dataset.renderCount || 0) > before.renderCount
    ));
    let exportedBlob = null;
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      exportedBlob = blob;
      return createObjectURL(blob);
    };
    try {
      exportButton.click();
      await waitFor('WorldSpec export blob', () => exportedBlob);
    } finally {
      URL.createObjectURL = createObjectURL;
    }
    const exportedPayload = await exportedBlob.text();
    const exportedProgram = JSON.parse(exportedPayload);
    const beforeImportRenderInputSerial = Number(canvas.dataset.renderInputSerial || 0);
    const beforeImportRenderCount = Number(canvas.dataset.renderCount || 0);
    const transfer = new DataTransfer();
    transfer.items.add(new File([exportedPayload], 'round-trip.world.json', {
      type: 'application/json',
    }));
    importFile.files = transfer.files;
    importFile.dispatchEvent(new Event('change', { bubbles: true }));
    edited = await waitFor('imported executable WorldSpec', () => {
      const spec = lab.getSpec();
      return spec?.contentHash === exportedProgram.contentHash &&
        spec.authorship?.revision === exportedProgram.authorship?.revision &&
        spec.phaseArtifacts?.phase6?.artifact?.visualCompile &&
        spec.phaseArtifacts?.phase5?.receipts?.some((row) => (
          row.importAuthority === 'world-spec' && row.worldSpecContentHash === spec.contentHash
        )) ? spec : null;
    });
    await waitFor('imported Phase 7 frame', () => (
      Number(canvas.dataset.renderInputSerial || 0) > beforeImportRenderInputSerial &&
      Number(canvas.dataset.renderCount || 0) > beforeImportRenderCount
    ));
    const exchange = {
      schema: 'simulatte.worldSpecBrowserExchange.v1',
      exportedContentHash: exportedProgram.contentHash || '',
      exportedRevision: Number(exportedProgram.authorship?.revision || 0),
      exportedBytes: new TextEncoder().encode(exportedPayload).byteLength,
      compilerEvidenceOmitted: !Object.hasOwn(exportedProgram, 'phaseArtifacts') &&
        !Object.hasOwn(exportedProgram, 'intent'),
      importedContentHash: edited.contentHash,
      importedRevision: Number(edited.authorship?.revision || 0),
      importedPhaseSchemas: Object.values(edited.phaseArtifacts || {})
        .map((row) => row && row.schema || ''),
      importAuthority: edited.phaseArtifacts.phase5.receipts
        .find((row) => row.importAuthority === 'world-spec')?.importAuthority || '',
      sourcePrompt: edited.source?.prompt || '',
      beforeRenderInputSerial: beforeImportRenderInputSerial,
      renderInputSerial: Number(canvas.dataset.renderInputSerial || 0),
      beforeRenderCount: beforeImportRenderCount,
      renderCount: Number(canvas.dataset.renderCount || 0),
    };
    const acceptedNode = edited.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.nodes[nodeIndex];
    const visualNode = edited.phaseArtifacts.phase6.artifact.visualCompile.visualIR.entities
      .find(matchesSupportedEntity);
    const packetNode = edited.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket.entities
      .find(matchesSupportedEntity);
    const collider = packetNode?.collider?.bounds || [];
    if (collider.length !== 4) throw new Error('Edited supported entity has no interaction collider');
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + (collider[0] + collider[2] * 0.5) * rect.width;
    const clientY = rect.top + (collider[1] + collider[3] * 0.5) * rect.height;
    const originalSetPointerCapture = canvas.setPointerCapture;
    const originalReleasePointerCapture = canvas.releasePointerCapture;
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 7, button: 0, buttons: 1, clientX, clientY,
    }));
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId: 7, button: 0, buttons: 0, clientX, clientY,
    }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'ArrowRight', key: 'ArrowRight',
    }));
    try {
      await waitFor('interaction state proof', () => {
        const statuses = JSON.parse(canvas.dataset.worldProofClassStatuses || '{}');
        return statuses.interaction === 'pass';
      });
    } catch (error) {
      throw new Error(error.message + '; scene=' + (canvas.dataset.sceneProofVerdict || '') +
        '; sceneFailures=' + (canvas.dataset.sceneProofRequiredFailures || '[]') +
        '; world=' + (canvas.dataset.worldProofVerdict || '') +
        '; classes=' + (canvas.dataset.worldProofClassStatuses || '{}'));
    }
    canvas.setPointerCapture = originalSetPointerCapture;
    canvas.releasePointerCapture = originalReleasePointerCapture;
    await waitFor('independent compiler determinism proof', () => (
      canvas.dataset.compilerDeterminismStatus === 'pass' &&
      canvas.dataset.compilerDeterminismInputHash &&
      canvas.dataset.compilerDeterminismBaselineHash ===
        canvas.dataset.compilerDeterminismRecompiledHash
    ));
    await waitFor('bound intent proof', () => (
      canvas.dataset.intentProofStatus === 'pass' &&
      canvas.dataset.intentProofRequirementHash &&
      canvas.dataset.intentProofSettlementHash &&
      Number(canvas.dataset.intentProofLostCount || 0) === 0
    ));
    await waitFor('bound semantic provenance proof', () => (
      canvas.dataset.semanticProofStatus === 'pass' &&
      canvas.dataset.semanticProofLedgerHash &&
      canvas.dataset.semanticProofGraphHash &&
      Number(canvas.dataset.semanticProofBindingCount || 0) > 0 &&
      Number(canvas.dataset.semanticProofMissingCount || 0) === 0
    ));
    await waitFor('fixed-step simulation reproducibility proof', () => (
      canvas.dataset.simulationReproducibilityStatus === 'pass' &&
      canvas.dataset.simulationReproducibilityBaselineHash &&
      canvas.dataset.simulationReproducibilityBaselineHash ===
        canvas.dataset.simulationReproducibilityReplayHash
    ));
    await waitFor('reproducible safety-gate proof', () => (
      canvas.dataset.safetyProofStatus === 'pass' &&
      canvas.dataset.safetyProofDecision === 'allow' &&
      canvas.dataset.safetyProofRulesHash &&
      canvas.dataset.safetyProofBaselineHash === canvas.dataset.safetyProofReplayHash
    ));
    await waitFor('enabled exact replay control', () => replayButton.disabled === false);
    const replayInputSerial = Number(canvas.dataset.renderInputSerial || 0);
    replayButton.click();
    try {
      await waitFor('bound WorldProof replay', () => (
        Number(canvas.dataset.renderInputSerial || 0) > replayInputSerial &&
        canvas.dataset.worldProofVerdict === 'pass'
      ));
    } catch (error) {
      throw new Error(error.message + '; verdict=' + (canvas.dataset.worldProofVerdict || '') +
        '; classes=' + (canvas.dataset.worldProofClassStatuses || '{}') +
        '; failures=' + (canvas.dataset.worldProofCriticalFailures || '[]') +
        '; inputSerial=' + (canvas.dataset.renderInputSerial || '0'));
    }
    const provenCanvasDataset = { ...canvas.dataset };
    let improvementRecord;
    try {
      improvementRecord = await waitFor('governed improvement record', () => {
        const record = lab.getImprovementRecord && lab.getImprovementRecord();
        return record?.schema === 'simulatte.worldImprovementRecord.v1' &&
          record.status === 'successful-replay' ? record : null;
      });
    } catch (error) {
      const diagnostics = lab.getImprovementDiagnostics && lab.getImprovementDiagnostics();
      throw new Error(error.message + '; correctionSession=' + JSON.stringify(diagnostics || null));
    }
    let improvementBlob = null;
    const improvementCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      improvementBlob = blob;
      return improvementCreateObjectURL(blob);
    };
    try {
      improvementExportButton.click();
      await waitFor('improvement record export blob', () => improvementBlob);
    } finally {
      URL.createObjectURL = improvementCreateObjectURL;
    }
    const improvementPayload = await improvementBlob.text();
    const exportedImprovementRecord = JSON.parse(improvementPayload);
    const improvementRecordSummary = {
      schema: improvementRecord.schema,
      contentHash: improvementRecord.contentHash,
      status: improvementRecord.status,
      promptHash: improvementRecord.brief.promptHash,
      failureWorldSpecContentHash: improvementRecord.failureBoundary.worldSpec.contentHash,
      failureWorldProofContentHash: improvementRecord.failureBoundary.execution.worldProof.contentHash,
      failureWorldProofVerdict: improvementRecord.failureBoundary.execution.worldProof.verdict,
      failurePhaseCount: improvementRecord.failureBoundary.compilerTrace.phases.length,
      failurePhaseSchemas: improvementRecord.failureBoundary.compilerTrace.phases.map((row) => row.outputSchema),
      patchIds: improvementRecord.intervention.patchIds,
      affectedObligationIds: improvementRecord.intervention.affectedObligationIds,
      successWorldSpecContentHash: improvementRecord.successfulReplay.worldSpec.contentHash,
      successWorldProofContentHash: improvementRecord.successfulReplay.execution.worldProof.contentHash,
      successWorldProofVerdict: improvementRecord.successfulReplay.execution.worldProof.verdict,
      successReplayStatus: improvementRecord.successfulReplay.execution.worldProof.proofClasses.replay.status,
      successPhaseCount: improvementRecord.successfulReplay.compilerTrace.phases.length,
      earliestObservableDivergence: improvementRecord.diagnosis.earliestObservableDivergence,
      causalAttributionStatus: improvementRecord.diagnosis.causalAttribution.status,
      adjudicationStatus: improvementRecord.adjudication.status,
      populationPartition: improvementRecord.population.partition,
      generalizationStatus: improvementRecord.generalization.status,
      corpusDisposition: improvementRecord.corpusDisposition,
      exportInitiallyDisabled: improvementExportInitiallyDisabled,
      exportEnabled: improvementExportButton.disabled === false,
      exportStatus: improvementStatus.dataset.state,
      exportedBytes: new TextEncoder().encode(improvementPayload).byteLength,
      exportedSchema: exportedImprovementRecord.schema,
      exportedContentHash: exportedImprovementRecord.contentHash,
    };
    const reconciliationInputSerial = Number(canvas.dataset.renderInputSerial || 0);
    runButton.click();
    const reconciliationDialog = document.getElementById('world-spec-reconciliation-dialog');
    const preserveOverridesButton = document.getElementById('preserve-world-spec-overrides');
    const acceptRecompiledButton = document.getElementById('accept-recompiled-world-spec');
    const cancelReconciliationButton = document.getElementById('cancel-world-spec-reconciliation');
    const reconciliationFields = document.getElementById('world-spec-reconciliation-fields');
    if (!reconciliationDialog || !preserveOverridesButton || !acceptRecompiledButton ||
        !cancelReconciliationButton || !reconciliationFields) {
      throw new Error('WorldSpec reconciliation surface is incomplete');
    }
    await waitFor('explicit reconciliation decision', () => (
      reconciliationDialog.open && reconciliationDialog.dataset.state === 'pending' &&
      reconciliationDialog.dataset.planId
    ));
    const pendingRecompileSpec = lab.getSpec();
    const pendingPlanId = reconciliationDialog.dataset.planId;
    const reconciliationControlsFitViewport = [
      preserveOverridesButton, acceptRecompiledButton, cancelReconciliationButton,
    ].every((control) => {
      const bounds = control.getBoundingClientRect();
      return bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.top >= -1 && bounds.bottom <= innerHeight + 1;
    });
    const reconciliationFieldCount = reconciliationFields.children.length;
    preserveOverridesButton.click();
    const reconciled = await waitFor('reconciled WorldSpec execution', () => {
      const current = lab.getSpec();
      const reconciliation = current?.authorship?.reconciliations?.at(-1);
      return reconciliation?.decision === 'preserve-overrides' &&
        reconciliation.previousWorldSpec.contentHash === edited.contentHash &&
        current.contentHash !== edited.contentHash ? current : null;
    });
    await waitFor('reconciled Phase 7 frame', () => (
      Number(canvas.dataset.renderInputSerial || 0) > reconciliationInputSerial
    ));
    const reconciliationReceipt = JSON.parse(reconciliationDialog.dataset.receipt || '{}');
    const reconciliationRecord = reconciled.authorship.reconciliations.at(-1);
    const reconciledSupportedNode = reconciled.universeGraph.nodes.find(matchesSupportedEntity);
    const reconciledColor = reconciledSupportedNode?.properties?.find((row) => row.kind === 'color')?.value || '';
    const propertyObligations = edited.phaseArtifacts.phase6.artifact.visualCompile.compositionLedger.obligations
      .filter((row) => row.constraintKind === 'property' && row.targetNodeId === acceptedNode.id);
    const patch = edited.authorship.patches.find((row) => (
      row.revision === edited.authorship.revision && /\/properties\/\d+\/value$/.test(row.targetPath)
    ));
    const semanticPropertyBinding = edited.phaseArtifacts.phase4.artifact.semanticProvenance.bindings
      .find((row) => row.kind === 'property' && row.targetPath === patch?.targetPath.replace(/\/value$/, ''));
    const geometryProgram = packetNode?.geometry?.program || {};
    const geometryParts = geometryProgram.parts || [];
    const replacementColorParts = geometryParts.filter((part) => part.fill === boundary.edit.replacementColor);
    const controls = Array.from(document.querySelectorAll('#world-spec-editor-panel button'));
    const viewportFits = controls.every((control) => {
      const rect = control.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1;
    });
    const dock = document.querySelector('.prompt-dock');
    dock.scrollTop = Math.max(0, editorPanel.offsetTop - 18);
    await delay(120);
    return {
      schema: 'simulatte.worldSpecEditorBrowserAudit.v1',
      buildId: document.querySelector('meta[name="simulatte-build"]')?.content || '',
      boundarySetId: boundary.boundarySetId,
      boundaryRowId: boundary.id,
      boundaryKind: boundary.boundaryKind,
      boundaryContractSha256: boundary.boundaryContractSha256,
      adHocPromptOverride: boundary.adHocPromptOverride === true,
      viewport: { width: innerWidth, height: innerHeight },
      prompt,
      supportedEntityType: boundary.supportedEntityType,
      unsupportedLabel: boundary.unsupportedLabel,
      unsupportedNodeId: unsupportedNode.id,
      initialUnsupportedRequirements: compiled.unsupportedRequirements || [],
      editedUnsupportedRequirements: edited.unsupportedRequirements || [],
      unsupportedNodeRemoved: !edited.universeGraph.nodes.some((node) => node.id === unsupportedNode.id),
      initialSceneProofVerdict: before.sceneProofVerdict,
      initialRequiredFailures: before.requiredFailures,
      originalColor,
      editedColor: acceptedNode.properties.find((row) => row.kind === 'color')?.value || '',
      visualColor: visualNode?.properties?.find((row) => row.kind === 'color')?.value || '',
      replacementColorGeometryPartCount: replacementColorParts.length,
      constructionTopologyId: geometryProgram.constructionGraph?.topologyId || '',
      constructionTopologyTargetFit: geometryProgram.constructionReceipt?.topologyTargetFit === true,
      constructionPartIds: geometryParts.map((part) => part.id),
      propertyObligationIds: propertyObligations.map((row) => row.id),
      propertyObligationValues: propertyObligations.map((row) => row.expectedValue),
      propertyObligationStatuses: propertyObligations.map((row) => row.status),
      propertyObligationAuthorities: propertyObligations.map((row) => row.authorship?.authority || ''),
      patchAuthority: patch?.authority || '',
      propertyPatchId: patch?.id || '',
      patchAffectedObligationIds: patch?.affectedObligationIds || [],
      semanticPropertyAuthority: semanticPropertyBinding?.authority || '',
      semanticPropertyPatchIds: semanticPropertyBinding?.patchIds || [],
      improvementRecord: improvementRecordSummary,
      exchange,
      reconciliation: {
        pendingPlanId,
        pendingWorldSpecContentHash: pendingRecompileSpec.contentHash,
        acceptedPatchCount: edited.authorship.patches.length,
        fieldCount: reconciliationFieldCount,
        preserveControlEnabled: preserveOverridesButton.disabled === false,
        controlsFitViewport: reconciliationControlsFitViewport,
        receipt: reconciliationReceipt,
        record: reconciliationRecord,
        resultContentHash: reconciled.contentHash,
        resultRevision: reconciled.authorship.revision,
        resultColor: reconciledColor,
        unsupportedNodeRemoved: !reconciled.universeGraph.nodes.some((node) => node.id === unsupportedNode.id),
        beforeRenderInputSerial: reconciliationInputSerial,
        renderInputSerial: Number(canvas.dataset.renderInputSerial || 0),
        dialogState: reconciliationDialog.dataset.state,
        dialogOpen: reconciliationDialog.open,
      },
      before,
      after: {
        contentHash: edited.contentHash,
        revision: edited.authorship.revision,
        renderCount: Number(provenCanvasDataset.renderCount || 0),
        renderInputSerial: Number(provenCanvasDataset.renderInputSerial || 0),
      },
      editorStatus: status.dataset.state,
      sceneVisible: canvas.dataset.sceneVisible,
      renderer: canvas.dataset.renderer,
      rendererStatus: canvas.dataset.rendererStatus,
      sceneProofVerdict: provenCanvasDataset.sceneProofVerdict || '',
      sceneProofRequiredFailures: JSON.parse(provenCanvasDataset.sceneProofRequiredFailures || '[]'),
      worldProofVerdict: provenCanvasDataset.worldProofVerdict || '',
      worldProofContentHash: provenCanvasDataset.worldProofContentHash || '',
      worldProofWorldSpecHash: provenCanvasDataset.worldProofWorldSpecHash || '',
      worldProofCriticalFailures: JSON.parse(provenCanvasDataset.worldProofCriticalFailures || '[]'),
      worldProofClassStatuses: JSON.parse(provenCanvasDataset.worldProofClassStatuses || '{}'),
      intentProofStatus: provenCanvasDataset.intentProofStatus || '',
      intentProofRequirementHash: provenCanvasDataset.intentProofRequirementHash || '',
      intentProofSettlementHash: provenCanvasDataset.intentProofSettlementHash || '',
      intentProofAcceptedCount: Number(provenCanvasDataset.intentProofAcceptedCount || 0),
      intentProofRefusalCount: Number(provenCanvasDataset.intentProofRefusalCount || 0),
      intentProofUnresolvedCount: Number(provenCanvasDataset.intentProofUnresolvedCount || 0),
      intentProofLostCount: Number(provenCanvasDataset.intentProofLostCount || 0),
      semanticProofStatus: provenCanvasDataset.semanticProofStatus || '',
      semanticProofLedgerHash: provenCanvasDataset.semanticProofLedgerHash || '',
      semanticProofGraphHash: provenCanvasDataset.semanticProofGraphHash || '',
      semanticProofBindingCount: Number(provenCanvasDataset.semanticProofBindingCount || 0),
      semanticProofProvenCount: Number(provenCanvasDataset.semanticProofProvenCount || 0),
      semanticProofMissingCount: Number(provenCanvasDataset.semanticProofMissingCount || 0),
      compilerDeterminismStatus: provenCanvasDataset.compilerDeterminismStatus || '',
      compilerDeterminismInputHash: provenCanvasDataset.compilerDeterminismInputHash || '',
      compilerDeterminismBaselineHash: provenCanvasDataset.compilerDeterminismBaselineHash || '',
      compilerDeterminismRecompiledHash: provenCanvasDataset.compilerDeterminismRecompiledHash || '',
      compilerDeterminismLane: provenCanvasDataset.compilerDeterminismLane || '',
      simulationReproducibilityStatus: provenCanvasDataset.simulationReproducibilityStatus || '',
      simulationReproducibilityBaselineHash:
        provenCanvasDataset.simulationReproducibilityBaselineHash || '',
      simulationReproducibilityReplayHash:
        provenCanvasDataset.simulationReproducibilityReplayHash || '',
      simulationReproducibilityMaxDelta:
        Number(provenCanvasDataset.simulationReproducibilityMaxDelta || 0),
      interactionProofStatus: provenCanvasDataset.interactionProofStatus || '',
      interactionProofContentHash: provenCanvasDataset.interactionProofContentHash || '',
      interactionProofProgramHash: provenCanvasDataset.interactionProofProgramHash || '',
      interactionProofTransitionHash: provenCanvasDataset.interactionProofTransitionHash || '',
      interactionProofProvenTransitionCount:
        Number(provenCanvasDataset.interactionProofProvenTransitionCount || 0),
      interactionProofInvalidTransitionCount:
        Number(provenCanvasDataset.interactionProofInvalidTransitionCount || 0),
      interactionProofChangedChannelCount:
        Number(provenCanvasDataset.interactionProofChangedChannelCount || 0),
      safetyProofStatus: provenCanvasDataset.safetyProofStatus || '',
      safetyProofDecision: provenCanvasDataset.safetyProofDecision || '',
      safetyProofRulesHash: provenCanvasDataset.safetyProofRulesHash || '',
      safetyProofBaselineHash: provenCanvasDataset.safetyProofBaselineHash || '',
      safetyProofReplayHash: provenCanvasDataset.safetyProofReplayHash || '',
      auditTiming: {
        schema: 'simulatte.worldSpecEditorAuditTiming.v1',
        durationMs: Math.round(performance.now() - auditStarted),
      },
      documentFitsViewport: document.documentElement.scrollWidth <= innerWidth + 1,
      controlsFitViewport: viewportFits,
    };
  })()`;
}

export function assertReceipt(receipt, boundary) {
  const acceptance = boundary.acceptance;
  const memory = validateBrowserMemoryReceipt(
    receipt.browserMemory,
    boundary.maximumObservedJsHeapBytes,
  );
  const forbiddenParts = (acceptance.forbiddenPartPatterns || []).filter((pattern) => (
    receipt.constructionPartIds.some((id) => String(id || '').includes(pattern))
  ));
  const expected = [
    [Boolean(receipt.buildId), 'receipt is missing the page build identity'],
    [receipt.boundarySetId === boundary.boundarySetId && receipt.boundaryRowId === boundary.id,
      'receipt is not bound to the frozen boundary row'],
    [receipt.boundaryContractSha256 === boundary.boundaryContractSha256,
      'receipt boundary-set hash does not match the loaded contract'],
    [receipt.originalColor === boundary.edit.originalColor, `expected original property ${boundary.edit.originalColor}, received ${receipt.originalColor}`],
    [receipt.initialSceneProofVerdict === acceptance.initialSceneProofVerdict, 'initial unsupported requirement did not produce a critical proof failure'],
    [receipt.initialRequiredFailures.some((row) => String(JSON.stringify(row)).toLowerCase().includes(boundary.unsupportedLabel.toLowerCase())),
      `initial proof failure did not identify ${boundary.unsupportedLabel}`],
    [receipt.initialUnsupportedRequirements.some((row) => String(JSON.stringify(row)).toLowerCase().includes(boundary.unsupportedLabel.toLowerCase())),
      `WorldSpec did not expose ${boundary.unsupportedLabel} as unsupported`],
    [receipt.editedUnsupportedRequirements.some((row) => String(JSON.stringify(row)).toLowerCase().includes(boundary.unsupportedLabel.toLowerCase())),
      'the edit erased immutable unsupported-content evidence'],
    [receipt.unsupportedNodeRemoved === true, 'the user patch did not remove the unsupported executable node'],
    [receipt.editedColor === boundary.edit.replacementColor, `Phase 4 retained ${receipt.editedColor || 'no color'}`],
    [receipt.visualColor === boundary.edit.replacementColor, `Phase 6 retained ${receipt.visualColor || 'no color'}`],
    [receipt.replacementColorGeometryPartCount > 0, 'scene packet has no replacement-color geometry parts'],
    [receipt.constructionTopologyId === acceptance.expectedTopologyId,
      `expected ${acceptance.expectedTopologyId} topology, received ${receipt.constructionTopologyId || 'missing'}`],
    [receipt.constructionTopologyTargetFit, 'construction was not bound to the supported identity'],
    [(acceptance.requiredPartIds || []).every((id) => receipt.constructionPartIds.includes(id)),
      'construction omitted required visible parts'],
    [forbiddenParts.length === 0, `construction retained forbidden parts: ${forbiddenParts.join(', ')}`],
    [receipt.propertyObligationValues.length === 1 && receipt.propertyObligationValues[0] === boundary.edit.replacementColor, 'Phase 6 proof retained a stale property obligation'],
    [receipt.propertyObligationStatuses[0] === 'preserved', 'edited property obligation was not preserved'],
    [receipt.propertyObligationAuthorities[0] === 'userOverride', 'edited property obligation lost user authority'],
    [receipt.patchAuthority === 'userOverride', 'edit patch lost user authority'],
    [receipt.patchAffectedObligationIds.includes(acceptance.supersededObligationId), 'edit patch did not identify the superseded prompt obligation'],
    [receipt.after.renderInputSerial > receipt.before.renderInputSerial, 'Phase 7 did not accept a new render input'],
    [receipt.after.renderCount > receipt.before.renderCount, 'Phase 7 did not render the edited world'],
    [receipt.after.revision === receipt.before.revision + 1, 'the user edit did not create exactly one append-only revision'],
    [receipt.exchange?.schema === 'simulatte.worldSpecBrowserExchange.v1', 'browser WorldSpec exchange receipt is missing'],
    [receipt.exchange?.exportedContentHash === receipt.after.contentHash &&
      receipt.exchange?.importedContentHash === receipt.after.contentHash,
      'export/import changed the edited WorldSpec identity'],
    [receipt.exchange?.exportedRevision === receipt.after.revision &&
      receipt.exchange?.importedRevision === receipt.after.revision,
      'export/import changed the authored revision'],
    [receipt.exchange?.exportedBytes > 0 && receipt.exchange?.compilerEvidenceOmitted === true,
      'export did not produce the canonical evidence-free WorldSpec program'],
    [receipt.exchange?.importedPhaseSchemas.join(',') === [
      'simulatte.phase1.output.v1', 'simulatte.phase2.output.v1',
      'simulatte.phase3.output.v2', 'simulatte.phase4.output.v2',
      'simulatte.phase5.output.v2', 'simulatte.phase6.output.v2',
    ].join(','), 'import did not reconstruct the typed compiler phase chain'],
    [receipt.exchange?.importAuthority === 'world-spec', 'imported phase evidence lost WorldSpec authority'],
    [receipt.exchange?.sourcePrompt === receipt.prompt, 'imported WorldSpec lost its exact source prompt'],
    [receipt.exchange?.renderInputSerial > receipt.exchange?.beforeRenderInputSerial &&
      receipt.exchange?.renderCount > receipt.exchange?.beforeRenderCount,
      'Phase 7 did not execute the re-imported WorldSpec'],
    [receipt.reconciliation.pendingPlanId.startsWith('reconciliation-plan:'), 'recompile did not expose a bound reconciliation plan'],
    [receipt.reconciliation.pendingWorldSpecContentHash === receipt.after.contentHash, 'accepted edits changed before the user reconciliation decision'],
    [receipt.reconciliation.acceptedPatchCount > 0 && receipt.reconciliation.fieldCount > 0, 'reconciliation omitted accepted edit fields'],
    [receipt.reconciliation.preserveControlEnabled === true, 'valid accepted edits could not be preserved'],
    [receipt.reconciliation.controlsFitViewport === true, 'reconciliation controls overflow the viewport'],
    [receipt.reconciliation.receipt?.schema === 'simulatte.worldSpecReconciliationReceipt.v1', 'reconciliation decision receipt is missing'],
    [receipt.reconciliation.receipt?.decision === acceptance.recompilationDecision, 'browser recompile did not apply the required reconciliation decision'],
    [receipt.reconciliation.receipt?.previousWorldSpecContentHash === receipt.after.contentHash, 'decision receipt lost the edited WorldSpec identity'],
    [receipt.reconciliation.receipt?.compiledWorldSpecContentHash === receipt.before.contentHash, 'decision receipt lost the fresh compiler baseline identity'],
    [receipt.reconciliation.receipt?.resultWorldSpecContentHash === receipt.reconciliation.resultContentHash, 'decision receipt does not bind the executed result'],
    [receipt.reconciliation.record?.id === receipt.reconciliation.receipt?.id, 'WorldSpec authoring graph does not contain the decision receipt'],
    [receipt.reconciliation.record?.decision === acceptance.recompilationDecision, 'WorldSpec recorded the wrong reconciliation decision'],
    [receipt.reconciliation.record?.previousWorldSpec?.contentHash === receipt.after.contentHash, 'WorldSpec reconciliation history lost the prior artifact'],
    [receipt.reconciliation.record?.compiledWorldSpec?.contentHash === receipt.before.contentHash, 'WorldSpec reconciliation history lost the compiler baseline'],
    [receipt.reconciliation.resultRevision === receipt.after.revision, 'recompiled edits lost their authored revision'],
    [receipt.reconciliation.resultColor === boundary.edit.replacementColor, 'recompiled world discarded the accepted property override'],
    [receipt.reconciliation.unsupportedNodeRemoved === true, 'recompiled world restored an explicitly refused node'],
    [receipt.reconciliation.renderInputSerial > receipt.reconciliation.beforeRenderInputSerial, 'Phase 7 did not execute the reconciled WorldSpec'],
    [receipt.reconciliation.dialogState === 'preserve-overrides' && receipt.reconciliation.dialogOpen === false, 'reconciliation dialog did not settle after the decision'],
    [receipt.editorStatus !== 'error', 'editor reported an error'],
    [receipt.sceneVisible === 'true', 'edited scene is not visible'],
    [receipt.renderer === 'webgpu', `expected WebGPU renderer, received ${receipt.renderer || 'missing'}`],
    [receipt.sceneProofVerdict === acceptance.finalSceneProofVerdict, `Phase 8 returned ${receipt.sceneProofVerdict || 'no verdict'}`],
    [receipt.sceneProofRequiredFailures.length === 0, 'Phase 8 retained required failures after the edit'],
    [receipt.worldProofVerdict === acceptance.finalWorldProofVerdict, `expected complete WorldProof after replay, received ${receipt.worldProofVerdict || 'missing'}`],
    [receipt.worldProofContentHash.startsWith('fnv1a32:'), 'WorldProof is not content addressed'],
    [receipt.worldProofWorldSpecHash === receipt.after.contentHash, 'WorldProof is not bound to the edited WorldSpec hash'],
    [receipt.intentProofStatus === 'pass', 'typed intent proof did not pass'],
    [receipt.intentProofRequirementHash.startsWith('fnv1a32:'), 'intent proof does not bind Phase 2 requirements'],
    [receipt.intentProofSettlementHash.startsWith('fnv1a32:'), 'intent proof does not bind Phase 4 settlement'],
    [receipt.intentProofAcceptedCount === acceptance.acceptedIntentCount, `expected ${acceptance.acceptedIntentCount} accepted intent requirements, received ${receipt.intentProofAcceptedCount}`],
    [receipt.intentProofRefusalCount === acceptance.refusedIntentCount, `expected ${acceptance.refusedIntentCount} explicit intent refusals, received ${receipt.intentProofRefusalCount}`],
    [receipt.intentProofUnresolvedCount === acceptance.unresolvedIntentCount, 'intent proof retained unresolved requirements'],
    [receipt.intentProofLostCount === acceptance.lostIntentCount, 'intent proof lost a critical requirement'],
    [receipt.worldProofClassStatuses.intent === 'pass', 'WorldProof did not bind typed intent evidence'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'intent'), 'WorldProof retained a critical intent failure'],
    [receipt.semanticProofStatus === 'pass', 'typed semantic provenance proof did not pass'],
    [receipt.semanticProofLedgerHash.startsWith('fnv1a32:'), 'semantic proof does not bind the Phase 4 provenance ledger'],
    [receipt.semanticProofGraphHash.startsWith('fnv1a32:'), 'semantic proof does not bind the accepted graph projection'],
    [receipt.semanticProofBindingCount > 0, 'semantic proof contains no accepted fact bindings'],
    [receipt.semanticProofProvenCount === receipt.semanticProofBindingCount, 'semantic proof did not prove every accepted fact'],
    [receipt.semanticProofMissingCount === 0, 'semantic proof retained missing provenance'],
    [receipt.semanticPropertyAuthority === 'userOverride', 'edited semantic property did not bind user authority'],
    [receipt.semanticPropertyPatchIds.includes(receipt.propertyPatchId), 'edited semantic property has no patch provenance'],
    [receipt.worldProofClassStatuses.semantic === 'pass', 'WorldProof did not bind typed semantic evidence'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'semantic'), 'WorldProof retained a critical semantic failure'],
    [receipt.compilerDeterminismStatus === 'pass', 'independent compiler determinism did not pass'],
    [receipt.compilerDeterminismInputHash.startsWith('fnv1a32:'), 'compiler proof does not bind declared inputs'],
    [receipt.compilerDeterminismBaselineHash === receipt.before.contentHash, 'compiler proof baseline does not match the pre-edit WorldSpec'],
    [receipt.compilerDeterminismRecompiledHash === receipt.before.contentHash, 'independent compilation did not reproduce the pre-edit WorldSpec'],
    [receipt.compilerDeterminismLane === 'pipeline-worker', `expected pipeline-worker compiler proof, received ${receipt.compilerDeterminismLane || 'missing'}`],
    [receipt.simulationReproducibilityStatus === 'pass', 'fixed-step simulation reproducibility did not pass'],
    [receipt.simulationReproducibilityBaselineHash.startsWith('fnv1a32:'), 'simulation proof does not bind the baseline state'],
    [receipt.simulationReproducibilityReplayHash === receipt.simulationReproducibilityBaselineHash, 'independent simulation execution produced a different state hash'],
    [receipt.simulationReproducibilityMaxDelta <= 1e-9, 'simulation replay exceeded the declared tolerance'],
    [receipt.safetyProofStatus === 'pass', 'declared safety gates did not pass'],
    [receipt.safetyProofDecision === 'allow', `expected allowing safety decision, received ${receipt.safetyProofDecision || 'missing'}`],
    [receipt.safetyProofRulesHash.startsWith('fnv1a32:'), 'safety proof does not bind the declared rules'],
    [receipt.safetyProofBaselineHash.startsWith('fnv1a32:'), 'safety proof does not bind a decision trace'],
    [receipt.safetyProofReplayHash === receipt.safetyProofBaselineHash, 'independent safety-gate decisions diverged'],
    [receipt.worldProofClassStatuses.simulation === 'pass', 'WorldProof did not bind live solver execution evidence'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'simulation'), 'WorldProof retained a simulation failure after live solver execution'],
    [receipt.interactionProofStatus === 'pass', 'typed interaction transition proof did not pass'],
    [receipt.interactionProofContentHash.startsWith('fnv1a32:'), 'interaction proof is not content addressed'],
    [receipt.interactionProofProgramHash.startsWith('fnv1a32:'), 'interaction proof does not bind the authored InteractionIR'],
    [receipt.interactionProofTransitionHash.startsWith('fnv1a32:'), 'interaction proof does not bind before and after state'],
    [receipt.interactionProofProvenTransitionCount > 0, 'interaction proof contains no proven transition'],
    [receipt.interactionProofInvalidTransitionCount === 0, 'interaction proof retained an invalid transition'],
    [receipt.interactionProofChangedChannelCount > 0, 'interaction proof retained no changed simulation channel'],
    [receipt.worldProofClassStatuses.interaction === 'pass', 'WorldProof did not bind an executed control transition'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'interaction'), 'WorldProof retained an interaction failure after the control changed state'],
    [receipt.worldProofClassStatuses.safety === 'pass', 'WorldProof did not bind reproducible safety-gate evidence'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'safety'), 'WorldProof retained a safety failure after an allowing gate decision'],
    [receipt.worldProofClassStatuses.replay === 'pass', 'WorldProof did not bind the independent replay comparison'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'replay'), 'WorldProof retained a replay failure after identical outcomes'],
    [receipt.improvementRecord?.schema === 'simulatte.worldImprovementRecord.v1' &&
      receipt.improvementRecord?.status === 'successful-replay',
      'Create did not produce a governed correction record'],
    [receipt.improvementRecord?.failureWorldSpecContentHash === receipt.before.contentHash &&
      receipt.improvementRecord?.successWorldSpecContentHash === receipt.after.contentHash,
      'correction record does not bind the failed and successful WorldSpec identities'],
    [receipt.improvementRecord?.failureWorldProofVerdict === 'fail' &&
      receipt.improvementRecord?.successWorldProofVerdict === 'pass' &&
      receipt.improvementRecord?.successReplayStatus === 'pass',
      'correction record does not bind the failed proof to passing exact replay'],
    [receipt.improvementRecord?.failurePhaseCount === 6 &&
      receipt.improvementRecord?.successPhaseCount === 6,
      'correction record does not retain both exact compiler traces'],
    [receipt.improvementRecord?.patchIds.includes(receipt.propertyPatchId) &&
      receipt.improvementRecord?.affectedObligationIds.includes(acceptance.supersededObligationId),
      'correction record does not bind the repairing user patch and affected obligation'],
    [receipt.improvementRecord?.earliestObservableDivergence?.status === 'fail' &&
      receipt.improvementRecord?.causalAttributionStatus === 'not-attributed',
      'correction record conflates observable divergence with causal ownership'],
    [receipt.improvementRecord?.adjudicationStatus === 'pending' &&
      receipt.improvementRecord?.corpusDisposition === 'diagnostic-only' &&
      receipt.improvementRecord?.populationPartition === 'unassigned' &&
      receipt.improvementRecord?.generalizationStatus === 'not-evaluated',
      'machine-only correction record overclaims human, population, or generalization authority'],
    [receipt.improvementRecord?.exportInitiallyDisabled === true &&
      receipt.improvementRecord?.exportEnabled === true &&
      receipt.improvementRecord?.exportStatus === 'ready',
      'correction record export control did not follow proof state'],
    [receipt.improvementRecord?.exportedBytes > 0 &&
      receipt.improvementRecord?.exportedSchema === receipt.improvementRecord?.schema &&
      receipt.improvementRecord?.exportedContentHash === receipt.improvementRecord?.contentHash,
      'exported correction record changed its validated identity'],
    [receipt.auditTiming?.schema === 'simulatte.worldSpecEditorAuditTiming.v1' &&
      Number.isFinite(Number(receipt.auditTiming.durationMs)) && Number(receipt.auditTiming.durationMs) >= 0,
      'editor audit timing receipt is missing'],
    [Number(receipt.auditTiming?.durationMs) <= boundary.maximumAuditDurationMs,
      `editor audit exceeded ${boundary.maximumAuditDurationMs}ms`],
    [memory.pass, `editor memory receipt failed: ${memory.failures.join(', ')}`],
    [receipt.documentFitsViewport, 'document overflows the viewport horizontally'],
    [receipt.controlsFitViewport, 'editor controls overflow the viewport horizontally'],
  ];
  const failures = expected.filter(([passes]) => !passes).map(([, message]) => message);
  if (failures.length) throw new Error(`WorldSpec editor browser audit failed: ${failures.join('; ')}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const boundary = loadBoundary(options);
  const chromePath = findChrome(options.chromePath);
  const staticServer = options.url ? null : createStaticSiteServer({ publicRoot: PUBLIC });
  if (staticServer) {
    await new Promise((resolve, reject) => staticServer.listen(0, '127.0.0.1', resolve).once('error', reject));
  }
  const targetUrl = options.url || `http://127.0.0.1:${staticServer.address().port}/blank/?auditNoInitial=1`;
  const debugPort = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-world-spec-editor-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--enable-precise-memory-info',
    '--enable-unsafe-webgpu',
    ...(process.platform === 'linux' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'] : []),
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${options.viewport.width},${options.viewport.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let client = null;
  try {
    const page = await waitForDevtools(debugPort, chrome);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    const errors = [];
    client.on('Runtime.exceptionThrown', (params) => errors.push(
      params.exceptionDetails.exception?.description || params.exceptionDetails.text || 'browser exception'
    ));
    await Promise.all([
      client.send('Runtime.enable'),
      client.send('Page.enable'),
      client.send('Log.enable'),
      client.send('Network.enable'),
    ]);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewport.width,
      height: options.viewport.height,
      deviceScaleFactor: 1,
      mobile: options.viewport.width < 600,
    });
    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: targetUrl });
    await loaded;
    await beginBrowserMemoryWindow(client, evaluate);
    let receipt;
    try {
      receipt = await evaluate(client, editorProbeExpression(boundary));
    } catch (error) {
      const browserDetail = errors.length ? `; browser exceptions: ${errors.join(' | ')}` : '';
      throw new Error(`${error.message}${browserDetail}`);
    }
    const browserMemory = await endBrowserMemoryWindow(client, evaluate);
    const boundReceipt = { ...receipt, browserMemory };
    if (errors.length) throw new Error(`Browser exceptions: ${errors.join(' | ')}`);
    assertReceipt(boundReceipt, boundary);
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
    });
    fs.mkdirSync(options.outDir, { recursive: true });
    const screenshotPath = path.join(options.outDir, `${options.viewport.width}x${options.viewport.height}.png`);
    const screenshotBytes = Buffer.from(screenshot.data, 'base64');
    fs.writeFileSync(screenshotPath, screenshotBytes);
    const report = {
      ...boundReceipt,
      screenshot: path.relative(ROOT, screenshotPath),
      screenshotSha256: crypto.createHash('sha256').update(screenshotBytes).digest('hex'),
    };
    const reportPath = path.join(options.outDir, `${options.viewport.width}x${options.viewport.height}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, report: reportPath, screenshot: screenshotPath, receipt: boundReceipt }, null, 2));
  } finally {
    await client?.close();
    await stopChrome(chrome);
    if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}
