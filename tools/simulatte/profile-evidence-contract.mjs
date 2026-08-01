import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop-1440x1000', width: 1440, height: 1000 }),
  Object.freeze({ id: 'mobile-390x844', width: 390, height: 844 }),
]);

const PROFILE_IDS = Object.freeze([
  'asteroid-defense-v1',
  'cable-trader-pickup-v1',
  'food-recall-us-v1',
  'grid-resilience-us-v1',
  'interstellar-relay-network-v1',
  'maritime-trade-global-v1',
  'neighborhood-bulk-pool-v1',
  'nyc-development-atlas-v1',
  'orbital-transfer-planner-v1',
  'subsea-network-global-v1',
  'sun-walker-v1',
]);

const CITY_INTERACTIONS = Object.freeze([
  'boot',
  'select-seed',
  'start',
  'pause',
  'step',
  'resume',
  'seek',
  'terminal-preview',
  'terminal-commit',
  'settle',
  'replay',
  'reload',
]);

const TIER_INTERACTIONS = Object.freeze([
  'boot',
  'select-seed',
  'start',
  'settle',
  'replay',
  'reload',
]);

const MAX_PROFILE_EVIDENCE_RECEIPT_BYTES = 8 * 1024 * 1024;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function sha256Value(value) {
  return sha256Bytes(canonicalJson(value));
}

function sha384File(filePath) {
  return crypto.createHash('sha384').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assert(condition, code, message, evidence = null) {
  if (condition) return;
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.evidence = evidence;
  throw error;
}

function profileFiles(root) {
  const directory = path.join(root, 'public/data/application-profiles');
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith('.json') && name !== 'profile-claim-inventory-v1.json')
    .map((name) => path.join(directory, name))
    .filter((filePath) => PROFILE_IDS.includes(readJson(filePath).id))
    .sort();
}

function loadProfiles(root) {
  const rows = profileFiles(root).map((filePath) => ({
    filePath,
    relativePath: path.relative(root, filePath),
    sha256: sha256File(filePath),
    value: readJson(filePath),
  }));
  assert(
    rows.length === PROFILE_IDS.length
      && rows.every((row, index) => row.value.id === PROFILE_IDS[index]),
    'profile_evidence_profile_inventory_invalid',
    `Expected the eleven connected public profiles in canonical order`,
    { actualIds: rows.map((row) => row.value.id), expectedIds: PROFILE_IDS }
  );
  return rows;
}

function interactionsFor(profile) {
  return profile.schema === 'simulatte.applicationProfile.v3'
    ? TIER_INTERACTIONS
    : CITY_INTERACTIONS;
}

function routeFor(profile) {
  return profile.tier ? `/${profile.tier}/${profile.id}` : `/city/${profile.id}`;
}

function buildEvidencePlan(root) {
  const profiles = loadProfiles(root);
  const runs = profiles.flatMap((row) => row.value.seeds.flatMap((seed) => VIEWPORTS.map((viewport) => {
    const interactionPath = interactionsFor(row.value);
    const comparisonMode = row.value.experience?.comparisonMode;
    assert(
      typeof comparisonMode === 'string' && comparisonMode.length > 0,
      'profile_evidence_comparison_policy_missing',
      `Profile ${row.value.id} must declare an experience comparison mode`
    );
    const identity = {
      profileId: row.value.id,
      seedId: seed.id,
      seed: seed.seed,
      viewportId: viewport.id,
      interactionPath,
      comparisonMode,
    };
    return Object.freeze({
      id: `run-${sha256Value(identity).slice(0, 20)}`,
      profileId: row.value.id,
      profilePath: row.relativePath,
      profileSha256: row.sha256,
      seedId: seed.id,
      seed: seed.seed,
      route: routeFor(row.value),
      tier: row.value.tier || 'city',
      pluginIds: row.value.plugins.map((plugin) => plugin.id),
      viewport,
      interactionPath,
      comparisonMode,
    });
  })));
  return Object.freeze({
    schema: 'simulatte.profileEvidencePlan.v1',
    profileIds: PROFILE_IDS,
    viewports: VIEWPORTS,
    runCount: runs.length,
    runs,
  });
}

function pluginSourceIdentities(root, profile) {
  return profile.plugins.map((selection) => {
    const manifestPath = path.join(root, 'public/shared/plugins', selection.id, 'plugin.json');
    const manifest = readJson(manifestPath);
    const pluginDirectory = path.dirname(manifestPath);
    const verifyResource = (resource, kind) => {
      const filePath = path.resolve(pluginDirectory, resource.path);
      assert(fs.existsSync(filePath), 'profile_evidence_plugin_resource_missing', `Plugin ${selection.id} ${kind} ${resource.path} is missing`);
      const actualIntegrity = `sha384-${sha384File(filePath)}`;
      assert(
        actualIntegrity === resource.integrity,
        'profile_evidence_plugin_resource_integrity_mismatch',
        `Plugin ${selection.id} ${kind} ${resource.path} does not match its manifest`,
        { expected: resource.integrity, actual: actualIntegrity }
      );
      return {
        path: resource.path,
        integrity: actualIntegrity,
        sha384: actualIntegrity.slice('sha384-'.length),
      };
    };
    const entry = verifyResource(manifest.entry, 'entry');
    const resources = manifest.resources.map((resource) => verifyResource(resource, 'resource'));
    const configPath = path.resolve(pluginDirectory, manifest.defaultConfig);
    assert(fs.existsSync(configPath), 'profile_evidence_plugin_config_missing', `Plugin ${selection.id} default config is missing`);
    const datasets = manifest.datasets.map((dataset) => {
      if (!dataset.reference) {
        return {
          id: dataset.id,
          required: dataset.required === true,
          resolution: 'runtime-catalog',
        };
      }
      const datasetPath = path.resolve(pluginDirectory, dataset.reference.path);
      assert(
        fs.existsSync(datasetPath),
        'profile_evidence_dataset_missing',
        `Plugin ${selection.id} dataset ${dataset.id} is missing`,
        { datasetId: dataset.id, path: path.relative(root, datasetPath) }
      );
      const actualSha256 = sha256File(datasetPath);
      assert(
        actualSha256 === dataset.reference.sha256,
        'profile_evidence_dataset_hash_mismatch',
        `Plugin ${selection.id} dataset ${dataset.id} does not match its manifest`,
        { datasetId: dataset.id, expected: dataset.reference.sha256, actual: actualSha256 }
      );
      return {
        id: dataset.id,
        required: dataset.required === true,
        resolution: 'manifest-reference',
        path: path.relative(root, datasetPath),
        schemaId: dataset.reference.schemaId,
        declaredSha256: dataset.reference.sha256,
        sha256: actualSha256,
      };
    });
    return {
      id: selection.id,
      configId: selection.configId,
      path: path.relative(root, manifestPath),
      sha256: sha256File(manifestPath),
      version: manifest.version,
      entry,
      config: {
        path: path.relative(root, configPath),
        sha256: sha256File(configPath),
      },
      resources,
      datasets,
    };
  });
}

function currentSourceIdentity(root, run, buildIdentity = {}) {
  const profilePath = path.join(root, run.profilePath);
  const profile = readJson(profilePath);
  return {
    schema: 'simulatte.profileEvidenceSourceIdentity.v1',
    build: {
      buildId: buildIdentity.buildId || readJson(path.join(root, 'public/version.json')).build,
      commitSha: buildIdentity.commitSha || null,
      worktreeSha256: buildIdentity.worktreeSha256 || null,
    },
    profile: {
      id: profile.id,
      path: run.profilePath,
      sha256: sha256File(profilePath),
    },
    plugins: pluginSourceIdentities(root, profile),
  };
}

function claimId(profileId, seedId) {
  return `${profileId}.seed.${seedId}.description`;
}

function expandClaims(root, inventory) {
  assert(inventory.schema === 'simulatte.profileClaimInventory.v1', 'profile_claim_inventory_schema_invalid', 'Claim inventory schema is invalid');
  const configuredIds = inventory.profileIds || [];
  assert(
    configuredIds.length === PROFILE_IDS.length && configuredIds.every((id, index) => id === PROFILE_IDS[index]),
    'profile_claim_inventory_scope_invalid',
    'Claim inventory must name all eleven connected public profiles in canonical order'
  );
  const claims = loadProfiles(root).flatMap(({ value: profile, relativePath }) => profile.seeds.map((seed) => ({
    id: claimId(profile.id, seed.id),
    profileId: profile.id,
    seedId: seed.id,
    sentence: seed.description,
    source: { path: relativePath, jsonPointer: `/seeds/${profile.seeds.indexOf(seed)}/description` },
    requiredSelectors: inventory.seedDescriptionClaim.requiredSelectors,
    contradictorySelectors: inventory.seedDescriptionClaim.contradictorySelectors,
  })));
  const ids = claims.map((claim) => claim.id);
  assert(new Set(ids).size === ids.length, 'profile_claim_inventory_duplicate', 'Expanded claim IDs must be unique');
  assert(claims.every((claim) => claim.sentence.trim()), 'profile_claim_sentence_missing', 'Every published seed description must contain a sentence');
  return claims;
}

function valueAtPath(value, selectorPath) {
  const segments = String(selectorPath || '').split('.').filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if (current === null || current === undefined || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function expectedValue(selector, context) {
  if (Object.hasOwn(selector, 'value')) return selector.value;
  if (selector.contextPath) return valueAtPath(context, selector.contextPath);
  return undefined;
}

function isSettledComparisonExecutionReceipt(value) {
  if (!value || value.schema !== 'simulatte.comparisonExecutionReceipt.v4') return false;
  if (value.state !== 'settled' || value.fault !== null || value.cancellation !== null) return false;
  if (!Array.isArray(value.history) || value.history.length < 1) return false;
  if (value.cursor !== value.history.length) return false;
  const branches = value.branches;
  if (!branches || !['baseline', 'intervention'].every((role) => (
    branches[role]?.role === role
    && branches[role]?.status === 'terminal'
    && Number.isInteger(branches[role]?.stepCount)
    && branches[role].stepCount >= 1
    && branches[role]?.timeline
  ))) return false;
  const settlement = value.settlement;
  if (!settlement
    || settlement.schema !== 'simulatte.comparisonSettlement.v4'
    || settlement.comparisonId !== value.id
    || settlement.status !== 'settled'
    || settlement.evidenceClosure?.status !== 'closed'
    || !Array.isArray(settlement.metricDeltas)) return false;
  return ['baseline', 'intervention'].every((role) => (
    settlement.branches?.[role]?.schema === 'simulatte.comparisonBranchSettlement.v4'
    && settlement.branches[role].status === 'settled'
  ));
}

function isSettledEvidenceReceipt(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.status === 'settled') return true;
  return Array.isArray(value.obligationResults)
    && value.obligationResults.length > 0
    && value.obligationResults.every((result) => result?.status === 'settled');
}

function pluginPlaybackIdentity(value) {
  if (!value
    || value.schema !== 'simulatte.pluginPlaybackRunReceipt.v1'
    || value.actionResult?.status !== 'settled'
    || !value.ownerPluginId
    || !value.scenario?.id
    || !value.scenario?.seed
    || !Array.isArray(value.settlements)
    || value.settlements.length < 1) return null;
  if (!value.settlements.every((row) => (
    Array.isArray(row.obligationResults)
    && row.obligationResults.length > 0
    && row.obligationResults.every((result) => result.status === 'settled')
  ))) return null;
  return {
    ownerPluginId: value.ownerPluginId,
    scenarioId: value.scenario.id,
    seed: value.scenario.seed,
    currentStep: value.actionResult.currentStep,
    totalSteps: value.actionResult.totalSteps,
    settlementSha256: sha256Value(value.settlements),
    clock: {
      timelineId: value.clock?.state?.timelineId || null,
      timelineEventCount: value.clock?.timeline?.eventCount ?? null,
      currentMs: value.clock?.state?.currentMs ?? null,
      cursor: value.clock?.state?.cursor ?? null,
    },
  };
}

function isContentAddressedReference(value, schema) {
  return value?.schema === schema
    && /^[a-f0-9]{64}$/i.test(value.contentSha256 || '')
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength > 0;
}

function isRestoredRunEvidence(value, run) {
  if (!value || value.attempted !== true || value.restored !== true) return false;
  if (run.tier === 'city') {
    if (
      isContentAddressedReference(value.beforeReceipt, 'simulatte.profileEvidenceRunReceiptRef.v1')
      && isContentAddressedReference(value.afterReceipt, 'simulatte.profileEvidenceRunReceiptRef.v1')
    ) {
      const before = value.beforeReceipt;
      const after = value.afterReceipt;
      return Boolean(
        before.originalSchema === 'simulatte.pluginPlaybackRunReceipt.v1'
        && after.originalSchema === 'simulatte.pluginPlaybackRunReceipt.v1'
        && before.status === 'settled'
        && after.status === 'settled'
        && before.scenario?.id === run.seedId
        && after.scenario?.id === run.seedId
        && before.scenario?.seed === run.seed
        && after.scenario?.seed === run.seed
        && before.restorationIdentitySha256
        && before.restorationIdentitySha256 === after.restorationIdentitySha256
      );
    }
    const before = pluginPlaybackIdentity(value.beforeReceipt);
    const after = pluginPlaybackIdentity(value.afterReceipt);
    return Boolean(before
      && after
      && canonicalJson(before) === canonicalJson(after)
      && before.scenarioId === run.seedId
      && before.seed === run.seed);
  }
  return value.beforeScenarioId === run.seedId
    && value.afterScenarioId === run.seedId
    && value.beforeSeed === run.seed
    && value.afterSeed === run.seed;
}

function selectorResult(receipt, selector, context) {
  const actual = valueAtPath(receipt, selector.path);
  const expected = expectedValue(selector, context);
  if (selector.operator === 'present') return actual !== undefined && actual !== null;
  if (selector.operator === 'equals') return actual === expected;
  if (selector.operator === 'non-empty') return Array.isArray(actual) ? actual.length > 0 : Boolean(String(actual || '').trim());
  if (selector.operator === 'gte') return Number.isFinite(actual) && actual >= expected;
  if (selector.operator === 'empty') return Array.isArray(actual) && actual.length === 0;
  if (selector.operator === 'includes') return Array.isArray(actual) && actual.includes(expected);
  if (selector.operator === 'includes-all') return Array.isArray(actual)
    && Array.isArray(expected)
    && expected.every((row) => actual.includes(row));
  if (selector.operator === 'all-schema') return Array.isArray(actual)
    && actual.length > 0
    && actual.every((row) => row?.schema === expected);
  if (selector.operator === 'settled-execution-receipts') return Array.isArray(actual)
    && actual.length > 0
    && actual.every(isSettledComparisonExecutionReceipt);
  if (selector.operator === 'comparison-policy-satisfied') return Array.isArray(actual)
    && (expected === 'none'
      ? actual.length === 0
      : actual.length > 0 && actual.every(isSettledComparisonExecutionReceipt));
  if (selector.operator === 'settled-receipts') return Array.isArray(actual)
    && actual.length > 0
    && actual.every(isSettledEvidenceReceipt);
  if (selector.operator === 'complete-performance-evidence') return actual?.firstMeaningfulFrame?.status === 'pass'
    && actual?.framePacing?.status === 'pass'
    && actual?.memory?.status === 'pass';
  if (selector.operator === 'deterministic-replay') return actual?.attempted === true
    && actual?.deterministic === true
    && /^[a-f0-9]{64}$/i.test(actual?.beforeSha256 || '')
    && actual.beforeSha256 === actual.afterSha256;
  if (selector.operator === 'complete-interaction-coverage') return Array.isArray(actual?.observed)
    && Array.isArray(actual?.missing)
    && actual.missing.length === 0
    && Array.isArray(expected)
    && expected.every((step) => actual.observed.includes(step));
  if (selector.operator === 'deployment-bound-screenshot') return actual?.status === 'pass'
    && actual.servedBuildId === receipt.sourceIdentity?.build?.buildId
    && receipt.evidence?.screenshot?.buildId === actual.servedBuildId
    && receipt.evidence?.screenshot?.servedBuildId === actual.servedBuildId
    && receipt.evidence?.screenshot?.pageUrl === actual.pageUrl;
  if (selector.operator === 'restored-run') return isRestoredRunEvidence(actual, context.run);
  throw new Error(`profile_claim_selector_operator_invalid: Unknown selector operator ${selector.operator}`);
}

function validateSourceIdentity(receipt, expectedSource) {
  const failures = [];
  const actual = receipt.sourceIdentity;
  if (!actual) return ['source_identity_missing'];
  if (actual.profile?.sha256 !== expectedSource.profile.sha256) failures.push('profile_hash_stale');
  if (actual.build?.buildId !== expectedSource.build.buildId) failures.push('build_identity_mismatch');
  if (actual.build?.commitSha !== expectedSource.build.commitSha) failures.push('commit_identity_mismatch');
  if (actual.build?.worktreeSha256 !== expectedSource.build.worktreeSha256) failures.push('worktree_identity_mismatch');
  const actualPlugins = new Map((actual.plugins || []).map((row) => [row.id, row]));
  expectedSource.plugins.forEach((plugin) => {
    const captured = actualPlugins.get(plugin.id);
    if (!captured) failures.push(`plugin_manifest_missing:${plugin.id}`);
    else if (captured.sha256 !== plugin.sha256) failures.push(`plugin_manifest_stale:${plugin.id}`);
    const capturedDatasets = new Map((captured?.datasets || []).map((row) => [row.id, row]));
    plugin.datasets.forEach((dataset) => {
      const capturedDataset = capturedDatasets.get(dataset.id);
      if (!capturedDataset) {
        failures.push(`dataset_identity_missing:${plugin.id}:${dataset.id}`);
      } else if (dataset.resolution === 'manifest-reference' && capturedDataset.sha256 !== dataset.sha256) {
        failures.push(`dataset_identity_stale:${plugin.id}:${dataset.id}`);
      } else if (dataset.resolution === 'runtime-catalog') {
        const runtimeEvidence = (receipt.runtime?.datasetEvidence || []).find((row) => (
          row.id === dataset.id
          && Array.isArray(row.artifactSha256s)
          && row.artifactSha256s.some((hash) => /^[a-f0-9]{64}$/i.test(hash))
        ));
        if (!runtimeEvidence) failures.push(`runtime_dataset_identity_missing:${plugin.id}:${dataset.id}`);
      }
    });
  });
  return failures;
}

function validateReceipt({ receipt, run, sourceIdentity, claims }) {
  const failures = [];
  const receiptByteLength = Buffer.byteLength(canonicalJson(receipt));
  if (receiptByteLength > MAX_PROFILE_EVIDENCE_RECEIPT_BYTES) {
    failures.push('receipt_size_budget_exceeded');
  }
  if (receipt.schema !== 'simulatte.profileEvidenceReceipt.v1') failures.push('receipt_schema_invalid');
  if (receipt.run?.id !== run.id) failures.push('run_identity_mismatch');
  if (receipt.run?.profileId !== run.profileId) failures.push('profile_identity_mismatch');
  if (receipt.run?.seedId !== run.seedId || receipt.run?.seed !== run.seed) failures.push('seed_identity_mismatch');
  if (receipt.run?.viewportId !== run.viewport.id) failures.push('viewport_identity_mismatch');
  if (receipt.run?.comparisonMode !== run.comparisonMode) failures.push('comparison_policy_mismatch');
  if (receipt.runtime?.path !== 'native-v4') failures.push(receipt.runtime?.path === 'legacy-adapter' ? 'legacy_only_evidence' : 'runtime_path_mismatch');
  if (receipt.runtime?.clockReceipt?.schema !== 'simulatte.simulationClockReceipt.v4') {
    failures.push('platform_clock_receipt_invalid');
  }
  if (receipt.runtime?.viewReceipt?.schema !== 'simulatte.viewDirectorReceipt.v4') {
    failures.push('platform_view_receipt_invalid');
  }
  if (!Array.isArray(receipt.runtime?.compositorReceipts) || !receipt.runtime.compositorReceipts.length) {
    failures.push('platform_compositor_receipt_missing');
  } else if (!receipt.runtime.compositorReceipts.every((row) => row?.schema === 'simulatte.compositorReceipt.v4')) {
    failures.push('platform_compositor_receipt_invalid');
  }
  const visual = receipt.evidence?.visual;
  if (
    visual?.schema !== 'simulatte.renderedEvidence.v1'
    || !(visual.canvas?.width > 0)
    || !(visual.canvas?.height > 0)
  ) {
    failures.push('visual_evidence_missing');
  } else {
    if (!(visual.obstructionRatio >= 0) || visual.obstructionRatio > 0.5) {
      failures.push('plugin_overlay_obstruction_excessive');
    }
    if (!(visual.largestOverlayRatio >= 0) || visual.largestOverlayRatio > 0.36) {
      failures.push('plugin_overlay_dominant');
    }
    if (
      visual.camera?.expectedFocusId
      && visual.camera.focusId !== visual.camera.expectedFocusId
    ) {
      failures.push('visual_camera_intent_mismatch');
    }
    const decidedCameraMode = receipt.runtime?.viewReceipt?.state?.decision?.mode;
    if (
      run.tier === 'city'
      && ['overview', 'compare'].includes(decidedCameraMode)
      && visual.camera?.mode !== decidedCameraMode
    ) {
      failures.push('visual_camera_mode_mismatch');
    }
    if (run.tier === 'city' && visual.camera?.transition !== 'settled') {
      failures.push('visual_camera_transition_unsettled');
    }
  }
  const performanceEvidence = receipt.evidence?.performance;
  if (
    performanceEvidence?.firstMeaningfulFrame?.status !== 'pass'
    || !Number.isFinite(performanceEvidence.firstMeaningfulFrame.atMs)
    || performanceEvidence.firstMeaningfulFrame.atMs < 0
    || !(
      performanceEvidence.firstMeaningfulFrame.frameCount >= 1
      || performanceEvidence.firstMeaningfulFrame.compositorReceiptCount >= 1
    )
    || !(performanceEvidence.firstMeaningfulFrame.contributionCount >= 1)
  ) failures.push('first_meaningful_frame_invalid');
  if (
    performanceEvidence?.framePacing?.status !== 'pass'
    || !(performanceEvidence.framePacing.sampleCount >= 2)
    || !Number.isFinite(performanceEvidence.framePacing.p50Ms)
    || !Number.isFinite(performanceEvidence.framePacing.p95Ms)
    || !Number.isFinite(performanceEvidence.framePacing.maxMs)
  ) failures.push('frame_pacing_evidence_invalid');
  if (
    performanceEvidence?.memory?.status !== 'pass'
    || !(performanceEvidence.memory.sampleCount >= 1)
    || !Number.isFinite(performanceEvidence.memory.initialUsedJsHeapBytes)
    || !Number.isFinite(performanceEvidence.memory.finalUsedJsHeapBytes)
    || !Number.isFinite(performanceEvidence.memory.peakUsedJsHeapBytes)
    || performanceEvidence.memory.peakUsedJsHeapBytes < performanceEvidence.memory.initialUsedJsHeapBytes
  ) failures.push('memory_evidence_invalid');
  const replay = receipt.evidence?.replay;
  if (
    replay?.attempted !== true
    || replay.deterministic !== true
    || !/^[a-f0-9]{64}$/i.test(replay.beforeSha256 || '')
    || replay.beforeSha256 !== replay.afterSha256
  ) failures.push('deterministic_replay_invalid');
  const interactionCoverage = receipt.evidence?.interactionCoverage;
  if (
    !Array.isArray(interactionCoverage?.expected)
    || !Array.isArray(interactionCoverage?.observed)
    || !Array.isArray(interactionCoverage?.missing)
    || interactionCoverage.missing.length > 0
    || run.interactionPath.some((step) => !interactionCoverage.observed.includes(step))
  ) failures.push('interaction_coverage_invalid');
  const deployment = receipt.evidence?.deployment;
  const screenshot = receipt.evidence?.screenshot;
  if (
    deployment?.status !== 'pass'
    || deployment.servedBuildId !== sourceIdentity.build.buildId
    || deployment.route !== run.route
    || screenshot?.buildId !== sourceIdentity.build.buildId
    || screenshot?.servedBuildId !== deployment.servedBuildId
    || screenshot?.pageUrl !== deployment.pageUrl
  ) failures.push('deployment_screenshot_binding_invalid');
  if (run.comparisonMode === 'none') {
    if (!Array.isArray(receipt.evidence?.comparisons) || receipt.evidence.comparisons.length) {
      failures.push('comparison_policy_none_violated');
    }
  } else if (!Array.isArray(receipt.evidence?.comparisons) || !receipt.evidence.comparisons.length) {
    failures.push('comparison_execution_receipt_missing');
  } else if (!receipt.evidence.comparisons.every(isSettledComparisonExecutionReceipt)) {
    failures.push('comparison_execution_receipt_invalid');
  }
  if (!Array.isArray(receipt.evidence?.settlements) || !receipt.evidence.settlements.length) {
    failures.push('settlement_receipt_missing');
  } else if (!receipt.evidence.settlements.every(isSettledEvidenceReceipt)) {
    failures.push('settlement_receipt_invalid');
  }
  const eventReferences = (receipt.evidence?.events || []).filter((event) => (
    event?.schema === 'simulatte.profileEvidenceEventRef.v1'
  ));
  if (eventReferences.some((event) => !isContentAddressedReference(event, 'simulatte.profileEvidenceEventRef.v1'))) {
    failures.push('event_reference_invalid');
  }
  if (
    receipt.runtime?.runReceipt?.schema === 'simulatte.profileEvidenceRunReceiptRef.v1'
    && !isContentAddressedReference(receipt.runtime.runReceipt, 'simulatte.profileEvidenceRunReceiptRef.v1')
  ) {
    failures.push('run_receipt_reference_invalid');
  }
  if (!isRestoredRunEvidence(receipt.evidence?.reload, run)) {
    failures.push(run.tier === 'city' ? 'plugin_playback_reload_not_restored' : 'run_reload_not_restored');
  }
  failures.push(...validateSourceIdentity(receipt, sourceIdentity));
  const runClaims = claims.filter((claim) => claim.profileId === run.profileId && claim.seedId === run.seedId);
  if (!runClaims.length) failures.push('claim_inventory_missing');
  const claimResults = runClaims.map((claim) => {
    const context = { run, claim };
    const missing = claim.requiredSelectors.filter((selector) => !selectorResult(receipt, selector, context)).map((selector) => selector.id);
    const contradictory = claim.contradictorySelectors.filter((selector) => selectorResult(receipt, selector, context)).map((selector) => selector.id);
    return { claimId: claim.id, pass: missing.length === 0 && contradictory.length === 0, missing, contradictory };
  });
  if (claimResults.some((row) => !row.pass)) failures.push('claim_evidence_unresolved');
  if (receipt.integrity?.contradictions?.length) failures.push('receipt_contradictory');
  return {
    schema: 'simulatte.profileEvidenceValidation.v1',
    runId: run.id,
    pass: failures.length === 0,
    failures: [...new Set(failures)],
    claimResults,
  };
}

function addressReceipt(receipt) {
  const content = canonicalJson(receipt);
  return { sha256: sha256Bytes(content), content };
}

function storeReceipt(storeDirectory, receipt) {
  const addressed = addressReceipt(receipt);
  const directory = path.join(storeDirectory, 'sha256');
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `${addressed.sha256}.json`);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, addressed.content);
  return { sha256: addressed.sha256, path: filePath };
}

export {
  MAX_PROFILE_EVIDENCE_RECEIPT_BYTES,
  PROFILE_IDS,
  VIEWPORTS,
  addressReceipt,
  buildEvidencePlan,
  canonicalJson,
  claimId,
  currentSourceIdentity,
  expandClaims,
  isRestoredRunEvidence,
  isContentAddressedReference,
  isSettledEvidenceReceipt,
  isSettledComparisonExecutionReceipt,
  loadProfiles,
  pluginPlaybackIdentity,
  readJson,
  sha256Bytes,
  sha256File,
  storeReceipt,
  validateReceipt,
  valueAtPath,
};
