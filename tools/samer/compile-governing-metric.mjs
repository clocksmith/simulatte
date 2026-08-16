#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReceipt as assertWorldSpecEditorReceipt } from '../audit-world-spec-editor.mjs';
import { validateBrowserMemoryReceipt } from '../browser-memory-receipt.mjs';
import { evaluateGoldVisualResults } from './gold-visual-evaluator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_CONTRACT = path.join(ROOT, 'tools', 'samer', 'simulatte-public-governing-metric-v1.json');
const REQUIRED_DIMENSIONS = Object.freeze([
  'requirement-extraction-recall',
  'refusal-correctness',
  'unsupported-content-precision',
  'semantic-settlement',
  'dynamic-settlement',
  'interaction-settlement',
  'safety-settlement',
  'visual-settlement',
  'replay-success',
  'latency',
  'memory',
  'edit-to-success-cycles',
  'retained-human-satisfaction',
]);

export function loadGoverningMetricInputs(contractFile = DEFAULT_CONTRACT) {
  const contractPointer = readJsonPointer(contractFile);
  const contract = contractPointer.value;
  validateContract(contract);
  const resolvePointer = (relativePath) => readJsonPointer(path.resolve(ROOT, relativePath));
  const buildPointer = resolvePointer(contract.buildIdentityPath);
  const goldSetPointer = resolvePointer(contract.goldSetPath);
  const boundarySetPointer = resolvePointer(contract.boundarySetPath);
  return {
    contract,
    pointers: {
      contract: contractPointer,
      build: buildPointer,
      goldSet: goldSetPointer,
      boundarySet: boundarySetPointer,
      goldReports: contract.requiredViewports.map((viewport) => ({
        viewport,
        pointer: resolvePointer(viewport.goldReportPath),
      })),
      boundaryReports: contract.boundaryReports.map((binding) => ({
        binding: {
          ...binding,
          viewport: contract.requiredViewports.find((viewport) => viewport.id === binding.viewportId),
        },
        pointer: resolvePointer(binding.path),
      })),
      tooling: {
        compiler: readFilePointer(fileURLToPath(import.meta.url)),
        goldEvaluator: readFilePointer(path.join(ROOT, 'tools/samer/gold-visual-evaluator.mjs')),
        goldAudit: readFilePointer(path.join(ROOT, 'tools/audit-intent-scene-screenshots.mjs')),
        boundaryAudit: readFilePointer(path.join(ROOT, 'tools/audit-world-spec-editor.mjs')),
        browserMemory: readFilePointer(path.join(ROOT, 'tools/browser-memory-receipt.mjs')),
      },
    },
  };
}

export function buildGoverningMetricReport(input) {
  const { contract, pointers } = input || {};
  validateContract(contract);
  const buildId = String(pointers?.build?.value?.build || '');
  if (!buildId) throw new Error('Governing metric requires public/version.json build identity');
  const goldSet = pointers?.goldSet?.value;
  const boundarySet = pointers?.boundarySet?.value;
  validateGoldSet(goldSet);
  validateBoundarySet(boundarySet);
  validateEvidenceBindings(contract, boundarySet);
  if (!Array.isArray(pointers.goldReports) || pointers.goldReports.length !== contract.requiredViewports.length) {
    throw new Error('Governing metric requires one gold report for every declared viewport');
  }
  if (!Array.isArray(pointers.boundaryReports) || pointers.boundaryReports.length !== contract.boundaryReports.length) {
    throw new Error('Governing metric requires every declared boundary report');
  }

  const goldReports = (pointers.goldReports || []).map((source) => (
    evaluateGoldReport(source, goldSet, buildId)
  ));
  const boundaryReports = (pointers.boundaryReports || []).map((source) => (
    evaluateBoundaryReport(source, boundarySet, pointers.boundarySet.sha256, buildId)
  ));
  const goldRows = compileGoldRows(goldSet, contract.requiredViewports, goldReports);
  const boundaryRows = compileBoundaryRows(boundarySet, contract.requiredViewports, boundaryReports);
  const machineFailures = [
    ...goldRows.flatMap((row) => row.machineFailures),
    ...boundaryRows.flatMap((row) => row.failures),
  ];
  const machinePass = machineFailures.length === 0;
  const humanStatus = goldRows.every((row) => row.humanStatus === 'pass')
    ? 'pass'
    : goldRows.some((row) => row.humanStatus === 'fail')
      ? 'fail'
      : 'not-proven';
  const status = machinePass ? humanStatus : 'fail';
  const northStar = compileNorthStar(goldSet, goldRows, status);
  const dimensions = compileDimensions({
    contract,
    goldRows,
    goldReports,
    boundaryRows,
    boundaryReports,
    machinePass,
    humanStatus,
  });
  return {
    schema: 'simulatte.publicGoverningMetricReport.v1',
    contractId: contract.id,
    scope: {
      ...contract.scope,
      claim: 'public diagnostic evidence; not a sealed promotion result',
    },
    buildId,
    status,
    pass: status === 'pass',
    promotionStatus: 'not-authorized',
    machineGate: {
      status: machinePass ? 'pass' : 'fail',
      pass: machinePass,
      failureCount: machineFailures.length,
      failures: machineFailures,
    },
    humanGate: {
      status: humanStatus,
      pass: humanStatus === 'pass',
      scope: 'bound recognizability adjudication for the fixed gold population',
    },
    northStar,
    boundaryDiagnostics: {
      scope: 'declared public boundary rows only; no general open-world refusal claim',
      status: boundaryRows.every((row) => row.pass) ? 'pass' : 'fail',
      boundaryCount: boundaryRows.length,
      viewportExecutionCount: boundaryReports.length,
      passCount: boundaryRows.filter((row) => row.pass).length,
      rows: boundaryRows,
    },
    dimensions,
    sources: compileSources(contract, pointers, goldReports, boundaryReports),
  };
}

function evaluateGoldReport(source, goldSet, buildId) {
  const report = source.pointer.value;
  const viewport = source.viewport;
  if (report?.schema !== 'simulatte.intentSceneScreenshotAudit.v1') {
    throw new Error(`Gold report ${source.pointer.path} has invalid schema`);
  }
  if (report.target !== 'local-public' || report.intentMode !== 'local' || report.exactReplay !== true ||
      report.goldGate !== 'machine-phase8-pixel-and-scene-proof') {
    throw new Error(`Gold report ${source.pointer.path} is not the declared local exact-replay machine lane`);
  }
  const results = Array.isArray(report.results) ? report.results : [];
  const byId = uniqueIndex(results, 'goldRowId', `gold report ${viewport.id}`);
  if (byId.size !== goldSet.rows.length) {
    throw new Error(`Gold report ${viewport.id} expected ${goldSet.rows.length} rows, received ${byId.size}`);
  }
  for (const goldRow of goldSet.rows) {
    const row = byId.get(goldRow.id);
    if (!row || row.kind !== 'gold' || row.prompt !== goldRow.prompt) {
      throw new Error(`Gold report ${viewport.id} is missing exact row ${goldRow.id}`);
    }
    if (row.buildId !== buildId) throw new Error(`Gold report ${viewport.id}/${goldRow.id} has stale build ${row.buildId || '(missing)'}`);
    if (Number(row.viewportWidth) !== viewport.width || Number(row.viewportHeight) !== viewport.height) {
      throw new Error(`Gold report ${viewport.id}/${goldRow.id} has the wrong viewport`);
    }
  }
  for (const row of results) {
    verifyBoundFile(path.dirname(path.resolve(ROOT, source.pointer.path)), row.screenshot, row.screenshotHash,
      `Gold report ${viewport.id}/${row.goldRowId} page screenshot`);
    verifyBoundFile(path.dirname(path.resolve(ROOT, source.pointer.path)), row.canvasScreenshot, row.canvasScreenshotHash,
      `Gold report ${viewport.id}/${row.goldRowId} canvas screenshot`);
  }
  const evaluation = evaluateGoldVisualResults(results, goldSet, null);
  if (canonicalJson(evaluation) !== canonicalJson(report.summary?.goldEvaluation)) {
    throw new Error(`Gold report ${viewport.id} contains a stale or altered gold evaluation`);
  }
  return {
    viewportId: viewport.id,
    width: viewport.width,
    height: viewport.height,
    createdAt: String(report.createdAt || ''),
    source: source.pointer,
    evaluation,
    resultsById: byId,
    screenshotArtifactCount: results.length * 2,
  };
}

function evaluateBoundaryReport(source, boundarySet, boundarySetSha256, buildId) {
  const report = source.pointer.value;
  const binding = source.binding;
  const boundary = boundarySet.rows.find((row) => row.id === binding.boundaryRowId);
  if (!boundary) throw new Error(`Boundary report references unknown row ${binding.boundaryRowId}`);
  const viewport = binding.viewport;
  if (report?.schema !== 'simulatte.worldSpecEditorBrowserAudit.v1') {
    throw new Error(`Boundary report ${source.pointer.path} has invalid schema`);
  }
  if (report.boundarySetId !== boundarySet.id || report.boundaryRowId !== boundary.id ||
      report.boundaryContractSha256 !== boundarySetSha256 || report.adHocPromptOverride !== false ||
      report.prompt !== boundary.prompt) {
    throw new Error(`Boundary report ${source.pointer.path} is not bound to ${boundarySet.id}/${boundary.id}`);
  }
  if (report.buildId !== buildId) throw new Error(`Boundary report ${binding.viewportId}/${boundary.id} has stale build ${report.buildId || '(missing)'}`);
  if (Number(report.viewport?.width) !== viewport.width || Number(report.viewport?.height) !== viewport.height) {
    throw new Error(`Boundary report ${binding.viewportId}/${boundary.id} has the wrong viewport`);
  }
  if (!isSha256(report.screenshotSha256)) throw new Error(`Boundary report ${binding.viewportId}/${boundary.id} lacks a screenshot hash`);
  verifyBoundFile(ROOT, report.screenshot, report.screenshotSha256,
    `Boundary report ${binding.viewportId}/${boundary.id} screenshot`);
  let failure = '';
  try {
    assertWorldSpecEditorReceipt(report, {
      ...boundary,
      boundarySetId: boundarySet.id,
      boundaryContractSha256: boundarySetSha256,
      maximumAuditDurationMs: Number(boundarySet.governingMetric.maximumAuditDurationMs),
      maximumObservedJsHeapBytes: Number(boundarySet.governingMetric.maximumObservedJsHeapBytes),
    });
  } catch (error) {
    failure = error && error.message || String(error);
  }
  return {
    boundaryRowId: boundary.id,
    viewportId: binding.viewportId,
    width: viewport.width,
    height: viewport.height,
    pass: !failure,
    failure,
    auditDurationMs: Number(report.auditTiming?.durationMs),
    revisionDelta: Number(report.after?.revision) - Number(report.before?.revision),
    classStatuses: report.worldProofClassStatuses || {},
    refusalCount: Number(report.intentProofRefusalCount || 0),
    refusalPass: Number(report.intentProofRefusalCount || 0) === Number(boundary.acceptance.refusedIntentCount) &&
      report.unsupportedNodeRemoved === true && Array.isArray(report.editedUnsupportedRequirements) &&
      report.editedUnsupportedRequirements.some((row) => textIncludes(row, boundary.unsupportedLabel)),
    unsupportedIdentified: Array.isArray(report.initialUnsupportedRequirements) &&
      report.initialUnsupportedRequirements.some((row) => textIncludes(row, boundary.unsupportedLabel)),
    latencyPass: Number(report.auditTiming?.durationMs) <= Number(boundarySet.governingMetric.maximumAuditDurationMs),
    browserMemory: validateBrowserMemoryReceipt(
      report.browserMemory,
      boundarySet.governingMetric.maximumObservedJsHeapBytes,
    ).observation,
    source: source.pointer,
  };
}

function compileGoldRows(goldSet, viewports, reports) {
  return goldSet.rows.map((goldRow) => {
    const executions = viewports.map((viewport) => {
      const report = reports.find((row) => row.viewportId === viewport.id);
      const evaluated = report.evaluation.rows.find((row) => row.goldRowId === goldRow.id);
      const raw = report.resultsById.get(goldRow.id);
      const classes = raw.exactReplay?.worldProof?.classStatuses || {};
      return {
        viewportId: viewport.id,
        machineStatus: evaluated.machine.status,
        humanStatus: evaluated.human.status,
        extraction: evaluated.machine.observations.extraction || null,
        semanticStatus: classes.semantic || 'not-proven',
        simulationStatus: classes.simulation || 'not-proven',
        interactionStatus: classes.interaction || 'not-proven',
        safetyStatus: classes.safety || 'not-proven',
        visualMachineStatus: classes.visual || 'not-proven',
        replayStatus: classes.replay || 'not-proven',
        auditDurationMs: Number(evaluated.machine.observations.auditDurationMs),
        browserMemory: evaluated.machine.observations.browserMemory || { status: 'fail' },
        latencyStatus: Number(evaluated.machine.observations.auditDurationMs) <=
          Number(report.evaluation.governingMetric.maximumAuditDurationMs) ? 'pass' : 'fail',
        unexpectedEntityCount: Number(evaluated.machine.observations.unexpectedEntityCount),
        reportedUnsupportedCount: Number(evaluated.machine.observations.reportedUnsupportedCount),
        failures: evaluated.machine.failures,
      };
    });
    const machinePass = executions.every((row) => row.machineStatus === 'pass');
    const humanStatus = executions.every((row) => row.humanStatus === 'pass')
      ? 'pass'
      : executions.some((row) => row.humanStatus === 'fail') ? 'fail' : 'not-proven';
    return {
      goldRowId: goldRow.id,
      difficulty: goldRow.difficulty,
      machinePass,
      humanStatus,
      status: machinePass ? humanStatus : 'fail',
      machineFailures: executions.flatMap((row) => row.failures.map((failure) => ({
        population: 'gold',
        rowId: goldRow.id,
        viewportId: row.viewportId,
        id: failure.id,
        reason: failure.reason,
      }))),
      executions,
    };
  });
}

function compileBoundaryRows(boundarySet, viewports, reports) {
  return boundarySet.rows.map((boundary) => {
    const executions = viewports.map((viewport) => reports.find((row) => (
      row.boundaryRowId === boundary.id && row.viewportId === viewport.id
    )));
    const failures = executions.filter((row) => !row.pass).map((row) => ({
      population: 'boundary',
      rowId: boundary.id,
      viewportId: row.viewportId,
      id: 'boundary-contract',
      reason: row.failure,
    }));
    return {
      boundaryRowId: boundary.id,
      boundaryKind: boundary.boundaryKind,
      pass: failures.length === 0,
      failures,
      executions: executions.map(({ source, failure, ...row }) => row),
    };
  });
}

function compileNorthStar(goldSet, rows, status) {
  const machinePassCount = rows.filter((row) => row.machinePass).length;
  const humanPassCount = rows.filter((row) => row.humanStatus === 'pass').length;
  const gatedPassCount = rows.filter((row) => row.status === 'pass').length;
  return {
    populationKind: 'fixed difficulty-stratified public diagnostic; not a sealed promotion holdout',
    status,
    everyCriticalPromptMustPass: true,
    promptCount: rows.length,
    machinePassCount,
    humanPassCount,
    gatedPassCount,
    machinePassRate: rate(machinePassCount, rows.length),
    humanPassRate: rate(humanPassCount, rows.length),
    gatedPassRate: rate(gatedPassCount, rows.length),
    difficultySummaries: goldSet.governingMetric.difficulties.map((difficulty) => {
      const selected = rows.filter((row) => row.difficulty === difficulty);
      return {
        difficulty,
        promptCount: selected.length,
        machinePassCount: selected.filter((row) => row.machinePass).length,
        humanPassCount: selected.filter((row) => row.humanStatus === 'pass').length,
        gatedPassCount: selected.filter((row) => row.status === 'pass').length,
        pass: selected.length > 0 && selected.every((row) => row.status === 'pass'),
      };
    }),
    rows: rows.map(({ machineFailures, ...row }) => row),
  };
}

function compileDimensions(context) {
  const { contract, goldRows, boundaryRows, goldReports, boundaryReports, humanStatus } = context;
  const allGoldExecutions = goldRows.flatMap((row) => row.executions);
  const allBoundaryExecutions = boundaryRows.flatMap((row) => row.executions);
  const goldAll = (field, allowed = ['pass']) => allGoldExecutions.every((row) => allowed.includes(row[field]));
  const extractionPass = allGoldExecutions.every((row) => row.extraction?.status === 'pass' && row.extraction.recall === 1);
  const boundaryPass = boundaryRows.every((row) => row.pass);
  const visualMachinePass = goldAll('visualMachineStatus') &&
    allBoundaryExecutions.every((row) => row.classStatuses.visual === 'pass');
  const dimensions = {
    'requirement-extraction-recall': dimension(extractionPass ? 'pass' : 'fail',
      'frozen Phase 2 expectations on every gold prompt and required viewport', {
        promptCount: goldRows.length,
        viewportExecutionCount: allGoldExecutions.length,
        passCount: goldRows.filter((row) => row.executions.every((item) => item.extraction?.status === 'pass')).length,
      }),
    'refusal-correctness': dimension(allBoundaryExecutions.every((row) => row.refusalPass) ? 'pass' : 'fail',
      'declared public unsupported/edit boundary rows only', {
        boundaryCount: boundaryRows.length,
        generalOpenWorldRefusalRecall: 'not-measured',
      }),
    'unsupported-content-precision': dimension(
      allGoldExecutions.every((row) => row.unexpectedEntityCount === 0 && row.reportedUnsupportedCount === 0) &&
        allBoundaryExecutions.every((row) => row.unsupportedIdentified) ? 'pass' : 'fail',
      'supported gold prompts plus declared unsupported boundary rows', {
        goldPromptCount: goldRows.length,
        boundaryCount: boundaryRows.length,
      }),
    'semantic-settlement': dimension(semanticBoundaryStatus(allGoldExecutions, allBoundaryExecutions),
      'WorldProof semantic class on every browser execution', {}),
    'dynamic-settlement': dimension(goldAll('simulationStatus') && allBoundaryExecutions.every((row) => row.classStatuses.simulation === 'pass') ? 'pass' : 'fail',
      'exact replay simulation class and edited-world fixed-step proof', {}),
    'interaction-settlement': dimension(goldAll('interactionStatus') && allBoundaryExecutions.every((row) => row.classStatuses.interaction === 'pass') ? 'pass' : 'fail',
      'executed control transitions in exact replay and edited-world proof', {}),
    'safety-settlement': dimension(allGoldExecutions.every((row) => ['pass', 'not-applicable'].includes(row.safetyStatus)) &&
      allBoundaryExecutions.every((row) => row.classStatuses.safety === 'pass') ? 'pass' : 'fail',
      'declared safety rules; gold prompts without rules remain not-applicable', {}),
    'visual-settlement': dimension(visualMachinePass ? humanStatus : 'fail',
      'machine pixel settlement gated by bound human recognizability adjudication', {
        machineStatus: visualMachinePass ? 'pass' : 'fail',
        humanStatus,
      }),
    'replay-success': dimension(goldAll('replayStatus') && allBoundaryExecutions.every((row) => row.classStatuses.replay === 'pass') ? 'pass' : 'fail',
      'exact WorldProof replay on every required viewport', {}),
    latency: dimension(allGoldExecutions.every((row) => row.latencyStatus === 'pass') &&
      allBoundaryExecutions.every((row) => row.latencyPass) ? 'pass' : 'fail',
      'bound browser audit durations under each source contract budget', {
        maximumObservedMs: Math.max(...allGoldExecutions.map((row) => row.auditDurationMs),
          ...allBoundaryExecutions.map((row) => row.auditDurationMs)),
      }),
    memory: compileMemoryDimension(allGoldExecutions, allBoundaryExecutions),
    'edit-to-success-cycles': dimension(boundaryPass && allBoundaryExecutions.every((row) => row.revisionDelta === 1) ? 'pass' : 'fail',
      'one explicit user patch from failed proof to successful replay on each declared boundary execution', {
        boundaryCount: boundaryRows.length,
        revisionDeltas: allBoundaryExecutions.map((row) => row.revisionDelta),
      }),
    'retained-human-satisfaction': dimension('not-measured',
      'recognizability adjudication is pending and no longitudinal satisfaction receipt is bound', {}),
  };
  if (goldReports.length !== contract.requiredViewports.length || boundaryReports.length !== contract.boundaryReports.length) {
    throw new Error('Governing metric source execution count changed during compilation');
  }
  return contract.reportedDimensions.map((id) => ({ id, ...dimensions[id] }));
}

function semanticBoundaryStatus(goldExecutions, boundaryExecutions) {
  return goldExecutions.every((row) => row.semanticStatus === 'pass') &&
    boundaryExecutions.every((row) => row.classStatuses.semantic === 'pass') ? 'pass' : 'fail';
}

function compileMemoryDimension(goldExecutions, boundaryExecutions) {
  const observations = [
    ...goldExecutions.map((row) => row.browserMemory),
    ...boundaryExecutions.map((row) => row.browserMemory),
  ];
  const pass = observations.length > 0 && observations.every((row) => row?.status === 'pass');
  const peaks = observations.map((row) => Number(row?.observedPeakUsedJsHeapBytes)).filter(Number.isFinite);
  const retained = observations.map((row) => Number(row?.retainedDeltaBytes)).filter(Number.isFinite);
  return dimension(pass ? 'pass' : 'fail',
    'forced-GC browser JavaScript heap boundaries plus periodic observed peaks; physical GPU allocation memory is not exposed by WebGPU', {
      executionCount: observations.length,
      passCount: observations.filter((row) => row?.status === 'pass').length,
      maximumObservedJsHeapBytes: peaks.length ? Math.max(...peaks) : null,
      maximumRetainedDeltaBytes: retained.length ? Math.max(...retained) : null,
      physicalGpuMemoryStatus: 'not-measured',
    });
}

function dimension(status, scope, observations) {
  return { status, pass: status === 'pass', scope, observations };
}

function compileSources(contract, pointers, goldReports, boundaryReports) {
  return {
    contract: publicPointer(pointers.contract),
    buildIdentity: publicPointer(pointers.build),
    goldSet: { ...publicPointer(pointers.goldSet), id: pointers.goldSet.value.id, rowCount: pointers.goldSet.value.rows.length },
    boundarySet: { ...publicPointer(pointers.boundarySet), id: pointers.boundarySet.value.id, rowCount: pointers.boundarySet.value.rows.length },
    goldReports: goldReports.map((row) => ({
      viewportId: row.viewportId,
      createdAt: row.createdAt,
      ...publicPointer(row.source),
      screenshotArtifactCount: row.screenshotArtifactCount,
    })),
    boundaryReports: boundaryReports.map((row) => ({
      viewportId: row.viewportId,
      boundaryRowId: row.boundaryRowId,
      ...publicPointer(row.source),
    })),
    tooling: Object.fromEntries(Object.entries(pointers.tooling || {}).map(([id, pointer]) => (
      [id, publicPointer(pointer)]
    ))),
    requiredViewportIds: contract.requiredViewports.map((row) => row.id),
  };
}

function validateContract(contract) {
  if (contract?.schema !== 'simulatte.publicGoverningMetricContract.v1' || !contract.id) {
    throw new Error('Governing metric contract is missing or invalid');
  }
  if (contract.scope?.kind !== 'public-diagnostic' || contract.scope.sealedHoldout !== false ||
      contract.scope.promotionAuthority !== false) {
    throw new Error('Governing metric contract must remain a non-promoting public diagnostic');
  }
  for (const field of ['buildIdentityPath', 'goldSetPath', 'boundarySetPath', 'outputPath']) {
    if (!String(contract[field] || '')) throw new Error(`Governing metric contract requires ${field}`);
  }
  const viewports = Array.isArray(contract.requiredViewports) ? contract.requiredViewports : [];
  if (viewports.length < 2 || new Set(viewports.map((row) => row.id)).size !== viewports.length ||
      viewports.some((row) => !row.id || !(row.width >= 320) || !(row.height >= 480) || !row.goldReportPath)) {
    throw new Error('Governing metric contract requires unique desktop and mobile viewport evidence');
  }
  if (canonicalJson(contract.reportedDimensions) !== canonicalJson(REQUIRED_DIMENSIONS)) {
    throw new Error('Governing metric contract must report every GOALS.md dimension in canonical order');
  }
}

function validateGoldSet(goldSet) {
  if (goldSet?.schema !== 'simulatte.promptGoldSet.v1' || !goldSet.id || !Array.isArray(goldSet.rows) || !goldSet.rows.length) {
    throw new Error('Governing metric gold set is missing or invalid');
  }
  evaluateGoldVisualResults([], goldSet, null);
}

function validateBoundarySet(boundarySet) {
  const metric = boundarySet?.governingMetric;
  if (boundarySet?.schema !== 'simulatte.promptBoundarySet.v1' || !boundarySet.id ||
      !Array.isArray(boundarySet.rows) || !boundarySet.rows.length ||
      metric?.schema !== 'simulatte.promptBoundaryGoverningMetric.v1' || metric.everyBoundaryMustPass !== true ||
      !Number.isFinite(Number(metric.maximumAuditDurationMs)) || Number(metric.maximumAuditDurationMs) < 0 ||
      !Number.isFinite(Number(metric.maximumObservedJsHeapBytes)) || Number(metric.maximumObservedJsHeapBytes) <= 0) {
    throw new Error('Governing metric boundary set is missing or invalid');
  }
  uniqueIndex(boundarySet.rows, 'id', 'boundary set');
}

function validateEvidenceBindings(contract, boundarySet) {
  const viewportById = new Map(contract.requiredViewports.map((row) => [row.id, row]));
  const expected = new Set(boundarySet.rows.flatMap((row) => (
    contract.requiredViewports.map((viewport) => `${row.id}:${viewport.id}`)
  )));
  const seen = new Set();
  for (const binding of contract.boundaryReports || []) {
    const key = `${binding.boundaryRowId}:${binding.viewportId}`;
    if (!expected.has(key) || seen.has(key) || !binding.path) throw new Error(`Invalid boundary report binding ${key}`);
    seen.add(key);
    if (!viewportById.get(binding.viewportId)) throw new Error(`Boundary report binding ${key} has no viewport`);
  }
  if (seen.size !== expected.size) {
    const missing = [...expected].filter((key) => !seen.has(key));
    throw new Error(`Governing metric boundary evidence is incomplete: ${missing.join(', ')}`);
  }
}

function uniqueIndex(rows, field, label) {
  const index = new Map();
  for (const row of rows || []) {
    const id = String(row && row[field] || '');
    if (!id || index.has(id)) throw new Error(`${label} has duplicate or missing ${field} ${id || '(missing)'}`);
    index.set(id, row);
  }
  return index;
}

function readJsonPointer(file) {
  const bytes = fs.readFileSync(file);
  return {
    path: path.relative(ROOT, file).split(path.sep).join('/'),
    sha256: digest(bytes),
    value: JSON.parse(bytes.toString('utf8')),
  };
}

function readFilePointer(file) {
  const bytes = fs.readFileSync(file);
  return {
    path: path.relative(ROOT, file).split(path.sep).join('/'),
    sha256: digest(bytes),
  };
}

function publicPointer(pointer) {
  return { path: pointer.path, sha256: pointer.sha256 };
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function rate(count, total) {
  return total ? Number((count / total).toFixed(4)) : 0;
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ''));
}

function textIncludes(value, text) {
  return String(JSON.stringify(value)).toLowerCase().includes(String(text || '').toLowerCase());
}

function verifyBoundFile(baseDirectory, relativePath, expectedSha256, label) {
  const normalized = path.normalize(String(relativePath || ''));
  if (!relativePath || path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} has an invalid path`);
  }
  const file = path.resolve(baseDirectory, normalized);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`${label} is missing`);
  if (!isSha256(expectedSha256) || digest(fs.readFileSync(file)) !== expectedSha256) {
    throw new Error(`${label} bytes do not match the receipt hash`);
  }
}

function parseArgs(argv) {
  const options = { contractFile: DEFAULT_CONTRACT, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--contract') options.contractFile = path.resolve(value());
    else if (key === '--check') options.check = true;
    else if (key === '--help') {
      console.log('usage: node tools/samer/compile-governing-metric.mjs [--contract PATH] [--check]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const input = loadGoverningMetricInputs(options.contractFile);
  const report = buildGoverningMetricReport(input);
  const outFile = path.resolve(ROOT, input.contract.outputPath);
  const bytes = `${JSON.stringify(report, null, 2)}\n`;
  if (options.check) {
    if (!fs.existsSync(outFile) || fs.readFileSync(outFile, 'utf8') !== bytes) {
      throw new Error(`Governing metric report is stale: ${path.relative(ROOT, outFile)}`);
    }
  } else {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, bytes);
  }
  console.log(JSON.stringify({
    ok: report.machineGate.pass,
    status: report.status,
    promotionStatus: report.promotionStatus,
    machinePassRate: report.northStar.machinePassRate,
    gatedPassRate: report.northStar.gatedPassRate,
    output: path.relative(ROOT, outFile),
  }, null, 2));
  if (!report.machineGate.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }
}
