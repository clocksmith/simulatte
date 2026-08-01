const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_URL = pathToFileURL(path.join(ROOT, 'tools/simulatte/profile-evidence-contract.mjs')).href;
const BROWSER_URL = pathToFileURL(path.join(ROOT, 'tools/simulatte/profile-evidence-browser.mjs')).href;
const RUNNER_URL = pathToFileURL(path.join(ROOT, 'tools/simulatte/run-profile-evidence.mjs')).href;
const INVENTORY_PATH = path.join(ROOT, 'public/data/application-profiles/profile-claim-inventory-v1.json');

function settledComparisonReceipt() {
  const branch = (role) => ({
    id: `branch:${role}`,
    role,
    status: 'terminal',
    simulationTimeMs: 10,
    stepCount: 1,
    metricIds: ['served'],
    evidenceIds: ['model:test'],
    timeline: { schema: 'simulatte.simulationTimelineReceipt.v4', id: `timeline:${role}`, eventCount: 1 },
  });
  const branchSettlement = {
    schema: 'simulatte.comparisonBranchSettlement.v4',
    status: 'settled',
    metrics: [],
    evidenceIds: ['model:test'],
  };
  return {
    schema: 'simulatte.comparisonExecutionReceipt.v4',
    id: 'comparison-1',
    synchronizationPolicy: 'lockstep',
    startingIdentity: { schema: 'simulatte.comparisonStartingIdentity.v4' },
    branchDefinitions: {
      baseline: { id: 'branch:baseline', role: 'baseline' },
      intervention: { id: 'branch:intervention', role: 'intervention' },
    },
    evidenceIds: ['model:test'],
    requiredEvidenceIds: ['model:test'],
    state: 'settled',
    positionMs: 10,
    cursor: 1,
    history: [{ schema: 'simulatte.comparisonOperation.v4', index: 0 }],
    branches: { baseline: branch('baseline'), intervention: branch('intervention') },
    fault: null,
    cancellation: null,
    settlement: {
      schema: 'simulatte.comparisonSettlement.v4',
      id: 'comparison-1:settlement',
      comparisonId: 'comparison-1',
      status: 'settled',
      branches: {
        baseline: structuredClone(branchSettlement),
        intervention: structuredClone(branchSettlement),
      },
      metricDeltas: [],
      evidenceClosure: { status: 'closed', requiredEvidenceIds: ['model:test'] },
    },
  };
}

function playbackReceipt(run) {
  return {
    schema: 'simulatte.pluginPlaybackRunReceipt.v1',
    ownerPluginId: run.pluginIds[0],
    scenario: { id: run.seedId, seed: run.seed },
    actionResult: { status: 'settled', currentStep: 30, totalSteps: 30 },
    settlements: [{
      obligationResults: [{ obligationId: 'month', status: 'settled' }],
    }],
    clock: {
      timeline: { id: `${run.profileId}:${run.seedId}`, eventCount: 30 },
      state: {
        timelineId: `${run.profileId}:${run.seedId}`,
        currentMs: 30,
        cursor: 30,
      },
    },
    runtime: { schema: 'simulatte.pluginRuntimeReceipt.v1' },
  };
}

async function fixture({ profileId = null } = {}) {
  const contract = await import(CONTRACT_URL);
  const plan = contract.buildEvidencePlan(ROOT);
  const inventory = contract.readJson(INVENTORY_PATH);
  const claims = contract.expandClaims(ROOT, inventory);
  const run = plan.runs.find((row) => profileId
    ? row.profileId === profileId
    : row.tier === 'city' && row.comparisonMode !== 'none');
  const buildIdentity = {
    buildId: 'test-build',
    commitSha: 'a'.repeat(40),
    worktreeSha256: 'b'.repeat(64),
  };
  const sourceIdentity = {
    schema: 'simulatte.profileEvidenceSourceIdentity.v1',
    build: buildIdentity,
    profile: {
      id: run.profileId,
      path: run.profilePath,
      sha256: run.profileSha256,
    },
    plugins: run.pluginIds.map((id) => ({
      id,
      sha256: 'c'.repeat(64),
      datasets: [{
        id: 'dataset:test',
        resolution: 'manifest-reference',
        sha256: 'd'.repeat(64),
      }],
    })),
  };
  const receipt = {
    schema: 'simulatte.profileEvidenceReceipt.v1',
    run: {
      id: run.id,
      profileId: run.profileId,
      seedId: run.seedId,
      seed: run.seed,
      viewportId: run.viewport.id,
      interactionPath: run.interactionPath,
      comparisonMode: run.comparisonMode,
    },
    sourceIdentity: structuredClone(sourceIdentity),
    browser: {
      product: 'Chrome/1',
      protocolVersion: '1',
      userAgent: 'test',
      gpu: { available: true, vendor: 'test' },
    },
    runtime: {
      path: 'native-v4',
      profileId: run.profileId,
      clockReceipt: { schema: 'simulatte.simulationClockReceipt.v4' },
      viewReceipt: {
        schema: 'simulatte.viewDirectorReceipt.v4',
        state: {
          decision: {
            source: run.pluginIds[0],
            intentId: `${run.pluginIds[0]}:overview`,
            mode: 'overview',
          },
        },
      },
      compositorReceipts: [{ schema: 'simulatte.compositorReceipt.v4' }],
      datasetEvidence: [{ id: 'dataset:test', artifactSha256s: ['d'.repeat(64)] }],
      contributionSources: run.pluginIds.map((pluginId) => ({ pluginId, source: 'native-v4' })),
    },
    evidence: {
      controls: [{ id: 'start-button' }],
      events: [{ id: 'event-1' }],
      progressiveStates: [{ phase: 'running' }, { phase: 'completed' }],
      comparisons: [settledComparisonReceipt()],
      settlements: [{ id: 'settlement-1', status: 'settled' }],
      replay: {
        attempted: true,
        beforeSha256: 'e'.repeat(64),
        afterSha256: 'e'.repeat(64),
        deterministic: true,
      },
      deployment: {
        status: 'pass',
        servedBuildId: buildIdentity.buildId,
        pageUrl: `http://127.0.0.1${run.route}`,
        route: run.route,
        versionUrl: 'http://127.0.0.1/version.json',
      },
      interactionCoverage: {
        expected: [...run.interactionPath],
        observed: [...run.interactionPath],
        missing: [],
      },
      console: [],
      consoleErrors: [],
      performance: {
        frameCount: 2,
        elapsedMs: 5,
        firstMeaningfulFrame: { status: 'pass', atMs: 1, frameCount: 1, contributionCount: 1, semanticLayerCount: 1, compositorReceiptCount: 1 },
        framePacing: { status: 'pass', sampleCount: 3, p50Ms: 16, p95Ms: 17, maxMs: 18, over50MsCount: 0 },
        memory: {
          status: 'pass',
          sampleCount: 2,
          initialUsedJsHeapBytes: 100,
          finalUsedJsHeapBytes: 110,
          peakUsedJsHeapBytes: 120,
          finalTotalJsHeapBytes: 200,
        },
      },
      screenshot: {
        sha256: 'c'.repeat(64),
        path: 'screenshots/c.png',
        buildId: buildIdentity.buildId,
        servedBuildId: buildIdentity.buildId,
        pageUrl: `http://127.0.0.1${run.route}`,
      },
      pixelReadback: { status: 'pass', sampleCount: 256, distinctColorCount: 4 },
      visual: {
        schema: 'simulatte.renderedEvidence.v1',
        canvas: { x: 0, y: 0, width: run.viewport.width, height: run.viewport.height },
        overlays: [],
        obstructionRatio: 0,
        largestOverlayRatio: 0,
        camera: {
          mode: 'overview',
          focusId: `plugin:${run.pluginIds[0]}:overview`,
          transition: 'settled',
          expectedFocusId: `plugin:${run.pluginIds[0]}:overview`,
        },
      },
      lifecycle: [...run.interactionPath],
      reload: {
        attempted: true,
        restored: true,
        kind: 'plugin-playback',
        beforeReceipt: playbackReceipt(run),
        afterReceipt: playbackReceipt(run),
      },
    },
    integrity: { status: 'pass', contradictions: [] },
    claims: claims
      .filter((claim) => claim.profileId === run.profileId && claim.seedId === run.seedId)
      .map((claim) => ({ id: claim.id, sentence: claim.sentence })),
  };
  return { buildIdentity, claims, contract, plan, receipt, run, sourceIdentity };
}

test('profile evidence plan enumerates eleven connected profiles, forty-seven seeds, and two required viewports', async () => {
  const { plan } = await fixture();
  assert.equal(plan.profileIds.length, 11);
  assert.equal(new Set(plan.runs.map((run) => `${run.profileId}:${run.seedId}`)).size, 47);
  assert.equal(plan.runCount, 94);
  assert.deepEqual([...new Set(plan.runs.map((run) => run.viewport.id))], [
    'desktop-1440x1000',
    'mobile-390x844',
  ]);
  assert.ok(plan.runs.every((run) => run.interactionPath.includes('settle')));
  assert.ok(plan.runs.every((run) => run.interactionPath.includes('replay')));
  assert.ok(plan.runs.every((run) => run.interactionPath.includes('reload')));
  assert.ok(plan.runs.filter((run) => run.tier === 'city').every((run) => run.interactionPath.includes('seek')));
  assert.ok(plan.runs.filter((run) => run.tier === 'city').every((run) => run.interactionPath.includes('terminal-preview')));
  assert.ok(plan.runs.filter((run) => run.tier === 'city').every((run) => run.interactionPath.includes('terminal-commit')));
});

test('release freeze binds registries, profiles, plugins, datasets, and browser build identity', async () => {
  const contract = await import(CONTRACT_URL);
  const identity = contract.currentReleaseIdentity(ROOT, {
    buildId: 'release-build',
    commitSha: 'a'.repeat(40),
    worktreeSha256: 'b'.repeat(64),
  });
  assert.equal(identity.schema, 'simulatte.profileEvidenceReleaseIdentity.v1');
  assert.equal(identity.build.buildId, 'release-build');
  assert.equal(identity.profiles.length, 11);
  assert.equal(identity.plugins.length, 11);
  assert.ok(identity.datasets.length >= 11);
  assert.deepEqual(identity.registries.map((row) => row.id), [
    'city-profile-registry',
    'tier-profile-registry',
    'profile-claim-inventory',
    'generated-artifact-inventory',
    'generated-plugin-registry',
  ]);
  [...identity.registries, ...identity.profiles, ...identity.plugins].forEach((row) => {
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
  });
  identity.datasets.filter((row) => row.resolution === 'manifest-reference').forEach((row) => {
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
  });
});

test('claim inventory assigns one stable claim ID to every published seed description', async () => {
  const { claims } = await fixture();
  assert.equal(claims.length, 47);
  assert.equal(new Set(claims.map((claim) => claim.id)).size, claims.length);
  assert.ok(claims.every((claim) => claim.sentence.length > 0));
  assert.ok(claims.every((claim) => claim.source.path.startsWith('public/data/application-profiles/')));
});

test('complete native browser evidence settles its profile claim', async () => {
  const { buildIdentity, claims, contract, receipt, run, sourceIdentity } = await fixture();
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims, buildIdentity });
  assert.equal(validation.pass, true);
  assert.deepEqual(validation.failures, []);
  assert.ok(validation.claimResults.every((row) => row.pass));
});

test('browser evidence replaces repeated simulation payloads with content-addressed references', async () => {
  const browser = await import(BROWSER_URL);
  const contract = await import(CONTRACT_URL);
  const trajectory = Array.from({ length: 4_000 }, (_, index) => ({
    index,
    x: index * 0.125,
    y: index * -0.25,
    covariance: [1, 0, 0, 1],
  }));
  const event = {
    schema: 'simulatte.asteroidDefenseEvent.v1',
    id: 'scenario-computed',
    pluginId: 'asteroid-defense',
    kind: 'asteroid-defense.scenario-computed',
    sequence: 0,
    simulationTimeMs: 0,
    result: {
      schema: 'simulatte.asteroidDefenseResult.v1',
      scenarioId: 'test-scenario',
      seed: 'test-seed',
      status: 'settled',
      trajectory,
    },
  };
  const runReceipt = {
    schema: 'simulatte.tierRunReceipt.v1',
    profileId: 'asteroid-defense-v1',
    tier: 'solar-system',
    scenario: { id: 'test-scenario', seed: 'test-seed' },
    actionResult: { status: 'settled', scenarioIdentity: 'scenario:test' },
    pluginRuntime: {
      events: [event],
      pluginReceipts: [{ schema: 'simulatte.pluginReceipt.v4' }],
    },
  };
  const raw = {
    runtime: { runReceipt },
    evidence: { events: [structuredClone(event)] },
  };
  const compacted = browser.compactCapturedEvidence(raw);
  const rawBytes = Buffer.byteLength(JSON.stringify(raw));
  const compactedBytes = Buffer.byteLength(JSON.stringify(compacted));

  assert.ok(compactedBytes < rawBytes / 20, `${compactedBytes} should be much smaller than ${rawBytes}`);
  assert.equal(compacted.runtime.runReceipt.schema, 'simulatte.profileEvidenceRunReceiptRef.v1');
  assert.equal(compacted.runtime.runReceipt.originalSchema, runReceipt.schema);
  assert.equal(compacted.runtime.runReceipt.eventCount, 1);
  assert.equal(
    compacted.runtime.runReceipt.contentSha256,
    contract.sha256Bytes(JSON.stringify(runReceipt)),
  );
  assert.equal(compacted.evidence.events[0].schema, 'simulatte.profileEvidenceEventRef.v1');
  assert.equal(compacted.evidence.events[0].kind, event.kind);
  assert.equal(compacted.evidence.events[0].result.scenarioId, 'test-scenario');
  assert.equal(
    compacted.evidence.events[0].contentSha256,
    contract.sha256Bytes(JSON.stringify(event)),
  );
  assert.equal(raw.runtime.runReceipt.pluginRuntime.events[0].result.trajectory.length, 4_000);
});

test('content-addressed playback references prove reload without embedding both receipts', async () => {
  const browser = await import(BROWSER_URL);
  const { contract, run } = await fixture();
  const beforeReceipt = browser.compactRunReceiptReference(playbackReceipt(run));
  const afterReceipt = browser.compactRunReceiptReference(playbackReceipt(run));
  const reload = {
    attempted: true,
    restored: true,
    kind: 'plugin-playback',
    beforeReceipt,
    afterReceipt,
  };

  assert.equal(contract.isRestoredRunEvidence(reload, run), true);
  reload.afterReceipt = {
    ...afterReceipt,
    restorationIdentitySha256: '0'.repeat(64),
  };
  assert.equal(contract.isRestoredRunEvidence(reload, run), false);
});

test('profile evidence fails closed when a receipt exceeds its storage budget', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.evidence.unboundedRuntimePayload = 'x'.repeat(contract.MAX_PROFILE_EVIDENCE_RECEIPT_BYTES);
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('receipt_size_budget_exceeded'));
});

test('rendered evidence fails closed on missing visuals, dominant overlays, and camera mismatch', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.evidence.visual = null;
  let validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('visual_evidence_missing'));

  receipt.evidence.visual = {
    schema: 'simulatte.renderedEvidence.v1',
    canvas: { x: 0, y: 0, width: run.viewport.width, height: run.viewport.height },
    overlays: [],
    obstructionRatio: 0.6,
    largestOverlayRatio: 0.4,
    camera: {
      mode: 'bird',
      focusId: 'plugin:cable-trader:wrong-target',
      transition: 'settled',
      expectedFocusId: `plugin:${run.pluginIds[0]}:overview`,
    },
  };
  validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('plugin_overlay_obstruction_excessive'));
  assert.ok(validation.failures.includes('plugin_overlay_dominant'));
  assert.ok(validation.failures.includes('visual_camera_intent_mismatch'));
  assert.ok(validation.failures.includes('visual_camera_mode_mismatch'));
});

test('performance, replay, interaction, and deployment screenshot evidence fail closed independently', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.evidence.performance.firstMeaningfulFrame.status = 'fail';
  receipt.evidence.performance.framePacing.status = 'fail';
  receipt.evidence.performance.memory.status = 'fail';
  receipt.evidence.replay.deterministic = false;
  receipt.evidence.interactionCoverage.missing = ['replay'];
  receipt.evidence.deployment.servedBuildId = 'different-build';
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('first_meaningful_frame_invalid'));
  assert.ok(validation.failures.includes('frame_pacing_evidence_invalid'));
  assert.ok(validation.failures.includes('memory_evidence_invalid'));
  assert.ok(validation.failures.includes('deterministic_replay_invalid'));
  assert.ok(validation.failures.includes('interaction_coverage_invalid'));
  assert.ok(validation.failures.includes('deployment_screenshot_binding_invalid'));
  assert.ok(validation.failures.includes('claim_evidence_unresolved'));
});

test('declared profile performance budgets fail closed on latency, pacing, and heap regressions', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  const budgetedRun = {
    ...run,
    performanceBudget: {
      firstMeaningfulFrameMs: 0.5,
      p95FrameMs: 16,
      peakHeapMiB: 0.0001,
    },
  };
  const validation = contract.validateReceipt({
    receipt,
    run: budgetedRun,
    sourceIdentity,
    claims,
  });
  assert.ok(validation.failures.includes('first_meaningful_frame_budget_exceeded'));
  assert.ok(validation.failures.includes('frame_pacing_budget_exceeded'));
  assert.ok(validation.failures.includes('memory_budget_exceeded'));
});

test('declared performance budgets preserve named evidence failures for missing measurements', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  const validation = contract.validateReceipt({
    receipt: { ...receipt, evidence: { ...receipt.evidence, performance: null } },
    run: {
      ...run,
      performanceBudget: {
        firstMeaningfulFrameMs: 4000,
        p95FrameMs: 350,
        peakHeapMiB: 384,
      },
    },
    sourceIdentity,
    claims,
  });
  assert.ok(validation.failures.includes('first_meaningful_frame_invalid'));
  assert.ok(validation.failures.includes('frame_pacing_evidence_invalid'));
  assert.ok(validation.failures.includes('memory_evidence_invalid'));
});

test('comparison evidence requires an executed settled receipt, never definition metadata', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  assert.equal(contract.isSettledComparisonExecutionReceipt(receipt.evidence.comparisons[0]), true);
  receipt.evidence.comparisons = [{
    schema: 'simulatte.comparisonDefinition.v4',
    id: 'definition-only',
    baselineScenarioId: 'baseline',
    variantScenarioId: 'intervention',
    synchronizedClock: true,
  }];
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.equal(validation.pass, false);
  assert.ok(validation.failures.includes('comparison_execution_receipt_invalid'));
  assert.deepEqual(validation.claimResults[0].missing, ['comparison-settled']);
});

test('comparison evidence refuses completed, failed, and unsettled executions', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  for (const mutation of [
    (value) => { value.state = 'completed'; value.settlement = null; },
    (value) => { value.state = 'failed'; value.fault = { code: 'clock_drift' }; },
    (value) => { value.settlement.evidenceClosure.status = 'open'; },
  ]) {
    const candidate = settledComparisonReceipt();
    mutation(candidate);
    receipt.evidence.comparisons = [candidate];
    const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
    assert.ok(validation.failures.includes('comparison_execution_receipt_invalid'));
  }
});

test('comparison evidence proves a profile-declared none policy with no execution receipts', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture({ profileId: 'cable-trader-pickup-v1' });
  assert.equal(run.comparisonMode, 'none');
  receipt.evidence.comparisons = [];
  let validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.equal(validation.pass, true);
  receipt.evidence.comparisons = [settledComparisonReceipt()];
  validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('comparison_policy_none_violated'));
});

test('City reload evidence requires the same settled plugin playback identity', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  assert.equal(contract.isRestoredRunEvidence(receipt.evidence.reload, run), true);
  receipt.evidence.reload.afterReceipt.scenario.seed = 'different-seed';
  let validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('plugin_playback_reload_not_restored'));
  receipt.evidence.reload.afterReceipt = playbackReceipt(run);
  receipt.evidence.reload.afterReceipt.settlements[0].obligationResults[0].status = 'unmet';
  validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('plugin_playback_reload_not_restored'));
});

test('missing controls, unavailable comparison evidence, and incomplete lifecycle fail closed', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.evidence.controls = [];
  receipt.evidence.comparisons = [];
  receipt.evidence.lifecycle = ['boot', 'select-seed', 'start', 'settle'];
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.equal(validation.pass, false);
  assert.ok(validation.failures.includes('comparison_execution_receipt_missing'));
  assert.ok(validation.failures.includes('claim_evidence_unresolved'));
  assert.deepEqual(validation.claimResults[0].missing, [
    'controls-captured',
    'comparison-settled',
    'interaction-path-complete',
  ]);
});

test('legacy-only and different runtime paths cannot satisfy native evidence claims', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.runtime.path = 'legacy-adapter';
  let validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('legacy_only_evidence'));
  receipt.runtime.path = 'metadata-only';
  validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('runtime_path_mismatch'));
});

test('clock, view, and compositor proof must come from the shared v4 platform', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.runtime.clockReceipt.schema = 'simulatte.legacyClockReceipt.v3';
  receipt.runtime.viewReceipt = null;
  receipt.runtime.compositorReceipts = [{ schema: 'simulatte.decorativeLayer.v1' }];
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('platform_clock_receipt_invalid'));
  assert.ok(validation.failures.includes('platform_view_receipt_invalid'));
  assert.ok(validation.failures.includes('platform_compositor_receipt_invalid'));
  assert.deepEqual(validation.claimResults[0].missing, [
    'shared-clock-receipt',
    'view-director-receipt',
    'semantic-compositor-receipts',
  ]);
});

test('settlement evidence must be an actual settled receipt, never rendered summary text', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  assert.equal(contract.isSettledEvidenceReceipt(receipt.evidence.settlements[0]), true);
  receipt.evidence.settlements = [{ summary: 'Settled' }];
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('settlement_receipt_invalid'));
  assert.deepEqual(validation.claimResults[0].missing, ['settlement-captured']);
});

test('runtime-catalog datasets require hashed browser provenance evidence', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  sourceIdentity.plugins[0].datasets = [{
    id: 'world.buildings.v1',
    required: true,
    resolution: 'runtime-catalog',
  }];
  receipt.sourceIdentity = structuredClone(sourceIdentity);
  receipt.runtime.datasetEvidence = [];
  let validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes(`runtime_dataset_identity_missing:${run.pluginIds[0]}:world.buildings.v1`));
  receipt.runtime.datasetEvidence = [{
    id: 'world.buildings.v1',
    artifactSha256s: ['e'.repeat(64)],
  }];
  validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.equal(validation.failures.some((failure) => failure.startsWith('runtime_dataset_identity_missing:')), false);
});

test('stale profile, plugin, dataset, commit, and worktree identities fail source closure', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.sourceIdentity.profile.sha256 = '0'.repeat(64);
  receipt.sourceIdentity.plugins[0].sha256 = '1'.repeat(64);
  receipt.sourceIdentity.plugins[0].datasets[0].sha256 = '2'.repeat(64);
  receipt.sourceIdentity.build.commitSha = '3'.repeat(40);
  receipt.sourceIdentity.build.worktreeSha256 = '4'.repeat(64);
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('profile_hash_stale'));
  assert.ok(validation.failures.some((failure) => failure.startsWith('plugin_manifest_stale:')));
  assert.ok(validation.failures.some((failure) => failure.startsWith('dataset_identity_stale:')));
  assert.ok(validation.failures.includes('commit_identity_mismatch'));
  assert.ok(validation.failures.includes('worktree_identity_mismatch'));
});

test('contradictory evidence prevents a polished claim result', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.integrity = { status: 'contradictory', contradictions: ['branch_clock_drift'] };
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.equal(validation.pass, false);
  assert.ok(validation.failures.includes('receipt_contradictory'));
  assert.deepEqual(validation.claimResults[0].contradictory, ['runtime-errors-recorded']);
});

test('content-addressed receipts are canonical and immutable by identity', async () => {
  const { contract, receipt } = await fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-profile-evidence-'));
  try {
    const first = contract.storeReceipt(directory, receipt);
    const second = contract.storeReceipt(directory, structuredClone(receipt));
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.path, second.path);
    assert.equal(path.basename(first.path), `${first.sha256}.json`);
    assert.equal(contract.sha256Bytes(fs.readFileSync(first.path)), first.sha256);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('capture preparation removes only managed evidence outputs', async () => {
  const runner = await import(RUNNER_URL);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-profile-evidence-cleanup-'));
  try {
    fs.mkdirSync(path.join(directory, 'receipts', 'sha256'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'screenshots', 'sha256'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'receipts', 'sha256', 'stale.json'), '{}');
    fs.writeFileSync(path.join(directory, 'screenshots', 'sha256', 'stale.png'), 'stale');
    fs.writeFileSync(path.join(directory, 'index.json'), '{}');
    fs.writeFileSync(path.join(directory, 'summary.md'), 'stale');
    fs.writeFileSync(path.join(directory, 'keep.txt'), 'preserved');

    runner.prepareCaptureDirectory(directory);

    assert.equal(fs.existsSync(path.join(directory, 'receipts')), false);
    assert.equal(fs.existsSync(path.join(directory, 'screenshots')), false);
    assert.equal(fs.existsSync(path.join(directory, 'index.json')), false);
    assert.equal(fs.existsSync(path.join(directory, 'summary.md')), false);
    assert.equal(fs.readFileSync(path.join(directory, 'keep.txt'), 'utf8'), 'preserved');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('source identity preflight failures are preserved without aborting the remaining evidence plan', async () => {
  const runner = await import(RUNNER_URL);
  const failure = new Error('resource hash drift');
  failure.code = 'profile_evidence_plugin_resource_integrity_mismatch';
  failure.evidence = { pluginId: 'example' };
  const attempt = runner.attemptSourceIdentity(() => { throw failure; });
  assert.equal(attempt.sourceIdentity, null);
  assert.equal(attempt.error, failure);
  const success = runner.attemptSourceIdentity(() => ({ schema: 'identity' }));
  assert.deepEqual(success, { sourceIdentity: { schema: 'identity' }, error: null });
});

test('release evidence reports a profile closure matrix with exact failure counts', async () => {
  const runner = await import(RUNNER_URL);
  const matrix = runner.profileClosureMatrix([
    { profileId: 'one', pass: true, failures: [] },
    { profileId: 'one', pass: false, failures: ['comparison_execution_receipt_missing'] },
    { profileId: 'two', pass: false, failures: ['run_reload_not_restored', 'settlement_receipt_missing'] },
  ]);
  assert.deepEqual(matrix, [
    {
      profileId: 'one',
      totalRuns: 2,
      passedRuns: 1,
      failureCounts: { comparison_execution_receipt_missing: 1 },
    },
    {
      profileId: 'two',
      totalRuns: 1,
      passedRuns: 0,
      failureCounts: {
        run_reload_not_restored: 1,
        settlement_receipt_missing: 1,
      },
    },
  ]);
});

test('targeted evidence distinguishes passing captures from incomplete release coverage', async () => {
  const runner = await import(RUNNER_URL);
  assert.equal(runner.evidenceReportStatus({ capturePass: true, coverageComplete: false }), 'partial-pass');
  assert.equal(runner.evidenceReportStatus({ capturePass: true, coverageComplete: true }), 'pass');
  assert.equal(runner.evidenceReportStatus({ capturePass: false, coverageComplete: false }), 'fail');
});

test('browser capture searches executed comparison receipts and preserves City playback receipts across reload', async () => {
  const browser = await import(BROWSER_URL);
  const { run } = await fixture();
  const expression = browser.browserProbeExpression(run, 0);
  assert.ok(
    expression.indexOf('const previous = seedText()') < expression.indexOf("document.getElementById('shuffle-button').click()"),
    'seed evidence must capture the previous value before the synchronous shuffle action',
  );
  assert.match(expression, /scenario-controls-ready/);
  assert.match(expression, /previousClockCursor/);
  assert.match(expression, /previousTierStepCount/);
  assert.match(expression, /commitTimelineTerminal/);
  assert.match(expression, /terminal-preview/);
  assert.match(expression, /terminal-commit/);
  assert.match(expression, /simulatte\.comparisonExecutionReceipt\.v4/);
  assert.doesNotMatch(expression, /controls\?\.comparisons|comparisonDefinition/);
  assert.match(expression, /runtimeReceipt\?\.pluginReceipts/);
  assert.doesNotMatch(expression, /metric-settlement/);
  assert.match(expression, /platformReceipt\?\.provenanceReceipts/);
  assert.match(expression, /Array\.isArray\(tierReceipt\.settlement\) \? tierReceipt\.settlement\.flat\(\)/);
  assert.match(expression, /clockReceipt: platform\?\.clock/);
  assert.match(expression, /viewReceipt: platform\?\.view/);
  assert.match(expression, /compositorReceipts: Array\.isArray\(platform\?\.compositor\)/);
  assert.match(expression, /const compactRunReceipt = async/);
  assert.match(expression, /runReceipt: compactedRunReceipt/);
  assert.match(expression, /platformReceipt: platformReceipt \? \{/);
  const source = fs.readFileSync(path.join(ROOT, 'tools/simulatte/profile-evidence-browser.mjs'), 'utf8');
  assert.match(source, /__simulattePluginRunReceipt/);
  assert.match(source, /beforeReceipt: isPluginPlayback \? beforeReceipt/);
  assert.match(source, /afterReceipt: isPluginPlayback \? afterReceipt/);
  assert.doesNotMatch(source, /readyAt/);
  assert.match(source, /withTimeout\(client\.send\('Runtime\.evaluate'/);
  assert.match(source, /180000, 'browser-probe'/);
  assert.match(source, /if \(client\) await client\.close\(\)/);
});

test('release scripts and CI consume the same public profile claim evidence runner', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['audit:simulatte:evidence'],
    'node tools/simulatte/run-profile-evidence.mjs --capture --check'
  );
  assert.match(packageJson.scripts['release:audit'], /npm run audit:simulatte:evidence/);
  assert.match(packageJson.scripts['check:release'], /npm run audit:simulatte:evidence/);
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/release-audit.yml'), 'utf8');
  assert.match(workflow, /npm run audit:simulatte:evidence -- --chrome \/usr\/bin\/google-chrome-stable/);
  const runner = fs.readFileSync(path.join(ROOT, 'tools/simulatte/run-profile-evidence.mjs'), 'utf8');
  assert.match(runner, /profile-claim-inventory-v1\.json/);
  assert.match(runner, /closeAllConnections/);
  assert.match(runner, /process\.exit\(process\.exitCode \|\| 0\)/);
});

test('source identity excludes generated audit output without excluding source files', () => {
  const source = fs.readFileSync(path.join(ROOT, 'tools/simulatte/run-profile-evidence.mjs'), 'utf8');
  assert.match(source, /!relativePath\.startsWith\('artifacts\/'\)/);
  assert.match(source, /:\(exclude\)artifacts\/\*\*/);
  assert.doesNotMatch(source, /!relativePath\.startsWith\('public\/'\)/);
  assert.doesNotMatch(source, /!relativePath\.startsWith\('tests\/'\)/);
  assert.doesNotMatch(source, /!relativePath\.startsWith\('tools\/'\)/);
});
