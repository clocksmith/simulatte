const assert = require('node:assert/strict');
const test = require('node:test');

const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const builder = require('../public/shared/core/simulation/plugin-v4-builder.js');
const registryModule = require('../public/simulatte/platform/runtime/provenance-registry.js');
const compositorModule = require('../public/simulatte/platform/render/semantic-compositor.js');
const viewDirectorModule = require('../public/simulatte/platform/view/view-director.js');

const HASHES = Object.freeze({
  observed: 'a'.repeat(64),
  scenario: 'b'.repeat(64),
  derived: 'c'.repeat(64),
});
const MISSING_UNCERTAINTY = Object.freeze({
  kind: 'missing',
  value: { reason: 'test fixture has no quantified uncertainty' },
});

function envelope({
  id,
  kind,
  origin,
  hash,
  datasetId = `dataset:${origin}`,
  parentIds = [],
  rowIds = [],
  license = { required: false, identifier: null },
}) {
  return contracts.createProvenanceEnvelope({
    subjectId: id,
    subjectKind: kind,
    axes: {
      origin,
      temporalStatus: origin === 'observed' ? 'historical' : 'forecast',
      uncertainty: MISSING_UNCERTAINTY,
    },
    datasetIds: [datasetId],
    rowIds,
    artifactSha256: hash,
    parentIds,
    transformationChain: kind === 'transformation' ? [id] : [],
    modelReceiptId: kind === 'model' ? id : null,
    retrievalEpoch: origin === 'observed' ? '2026-07-25' : null,
    scenarioEpoch: origin === 'observed' ? null : 'scenario:test',
    contentVersion: 'test-v1',
    license,
  });
}

function record({
  id,
  kind,
  origin,
  hash,
  datasetId = `dataset:${origin}`,
  parentIds = [],
  rowId,
  license,
}) {
  return {
    schema: 'simulatte.provenanceRecord.v4',
    id,
    kind,
    datasetId,
    ...(rowId === undefined ? {} : { rowId }),
    contentHash: hash,
    parentIds,
    metadata: {},
    envelope: envelope({
      id,
      kind,
      origin,
      hash,
      datasetId,
      parentIds,
      rowIds: rowId === undefined ? [] : [rowId],
      license,
    }),
  };
}

function evidence(row) {
  return {
    id: row.id,
    datasetId: row.datasetId,
    ...(row.rowId === undefined ? {} : { rowId: row.rowId }),
    contentHash: row.contentHash,
    ...(row.kind === 'transformation' ? { transformationId: row.id } : {}),
    ...(row.kind === 'model' ? { modelReceiptId: row.id } : {}),
  };
}

function contribution(records, claim) {
  return {
    schema: 'simulatte.pluginContribution.v4',
    pluginId: 'provenance-test',
    presentation: {
      schema: 'simulatte.pluginPresentation.v4',
      pluginId: 'provenance-test',
      coordinateSystem: 'screen-px',
      epoch: null,
      layers: [{
        id: 'layer:test',
        kind: 'point',
        label: 'Test evidence',
        geometry: {
          kind: 'point',
          coordinateSystem: 'screen-px',
          coordinates: [[0, 0]],
        },
        quantity: null,
        role: 'primary',
        importance: 1,
        aggregationKey: null,
        temporal: null,
        provenance: claim,
      }],
      viewIntents: [],
    },
    events: [],
    controls: { schema: 'simulatte.pluginControls.v4', controls: [], comparisons: [] },
    state: null,
    inspections: [],
    provenanceRecords: records,
  };
}

test('canonical envelope supports every governed subject kind with independent truth axes', () => {
  contracts.PROVENANCE_SUBJECT_KINDS.forEach((kind) => {
    const value = envelope({
      id: `${kind}:test`,
      kind,
      origin: kind === 'dataset' ? 'observed' : 'derived',
      hash: HASHES.observed,
      license: kind === 'dataset'
        ? { required: true, identifier: 'test-open-data-license' }
        : { required: false, identifier: null },
    });
    assert.equal(contracts.validateProvenanceEnvelope(value), value);
    assert.equal(value.axes.uncertainty.kind, 'missing');
    assert.deepEqual(value.contentVersions, ['test-v1']);
  });
});

test('builder migration makes legacy record inputs explicit instead of weakening validation', () => {
  const migrated = builder.datasetRecord('dataset:legacy', { sha256: HASHES.derived }, {});
  assert.equal(migrated.envelope.axes.origin, 'derived');
  assert.equal(migrated.envelope.axes.uncertainty.kind, 'missing');
  assert.deepEqual(migrated.envelope.contentVersions, [`sha256:${HASHES.derived}`]);
  assert.match(migrated.envelope.retrievalEpochs[0], /^content-version:/);

  const observed = builder.datasetRecord('dataset:observed', {
    sha256: HASHES.observed,
    contentVersion: '2026-07-25',
    retrievalAt: '2026-07-25T00:00:00Z',
    license: 'test-open-data-license',
    truth: {
      origin: 'observed',
      temporalStatus: 'historical',
      uncertainty: { kind: 'confidence', value: { level: 0.95 } },
    },
  });
  const row = builder.rowRecord(observed, 'row-1');
  assert.equal(row.envelope.axes.origin, 'observed');
  assert.deepEqual(row.envelope.licenseIdentifiers, ['test-open-data-license']);
  assert.deepEqual(row.envelope.parentIds, [observed.id]);
  assert.throws(
    () => builder.datasetRecord('dataset:unlicensed-observation', {
      sha256: HASHES.observed,
      truth: {
        origin: 'observed',
        temporalStatus: 'historical',
        uncertainty: MISSING_UNCERTAINTY,
      },
    }),
    { code: 'plugin_v4_provenance_license_missing' },
  );
});

test('canonical envelope fails closed on missing hashes, uncertainty, versions, epochs, and required licenses', () => {
  const base = {
    subjectId: 'dataset:test',
    subjectKind: 'dataset',
    axes: {
      origin: 'observed',
      temporalStatus: 'historical',
      uncertainty: MISSING_UNCERTAINTY,
    },
    datasetIds: ['dataset:test'],
    artifactSha256: HASHES.observed,
    retrievalEpoch: '2026-07-25',
    contentVersion: 'test-v1',
    license: { required: true, identifier: 'test-open-data-license' },
  };
  assert.throws(
    () => contracts.createProvenanceEnvelope({ ...base, artifactSha256: 'bad-hash' }),
    { code: 'plugin_v4_provenance_sha256_invalid' },
  );
  assert.throws(
    () => contracts.createProvenanceEnvelope({ ...base, axes: { ...base.axes, uncertainty: null } }),
    { code: 'plugin_v4_provenance_uncertainty_missing' },
  );
  assert.throws(
    () => contracts.createProvenanceEnvelope({ ...base, contentVersion: undefined }),
    { code: 'plugin_v4_provenance_content_version_missing' },
  );
  assert.throws(
    () => contracts.createProvenanceEnvelope({ ...base, retrievalEpoch: null, scenarioEpoch: null }),
    { code: 'plugin_v4_provenance_epoch_missing' },
  );
  assert.throws(
    () => contracts.createProvenanceEnvelope({ ...base, license: { required: true, identifier: null } }),
    { code: 'plugin_v4_provenance_license_missing' },
  );
});

test('mixed observed and scenario evidence must be classified as derived', () => {
  const observed = record({
    id: 'dataset:observed',
    kind: 'dataset',
    origin: 'observed',
    hash: HASHES.observed,
    license: { required: true, identifier: 'test-open-data-license' },
  });
  const scenario = record({
    id: 'dataset:scenario',
    kind: 'dataset',
    origin: 'scenario',
    hash: HASHES.scenario,
  });
  const mixedRefs = [evidence(observed), evidence(scenario)];
  const invalidClaim = contracts.createProvenance({
    origin: 'simulated',
    temporalStatus: 'forecast',
    uncertainty: MISSING_UNCERTAINTY,
    evidenceRefs: mixedRefs,
  });
  assert.throws(
    () => contracts.validateContribution(contribution([observed, scenario], invalidClaim)),
    { code: 'plugin_v4_mixed_lineage_not_derived' },
  );
  const derivedClaim = contracts.createProvenance({
    origin: 'derived',
    temporalStatus: 'forecast',
    uncertainty: MISSING_UNCERTAINTY,
    evidenceRefs: mixedRefs,
  });
  assert.equal(
    contracts.validateContribution(contribution([observed, scenario], derivedClaim)).schema,
    'simulatte.pluginContribution.v4',
  );
  assert.throws(
    () => registryModule.createContributionProvenanceReceipt(
      contribution([observed, scenario], derivedClaim),
      { settlements: [{ id: 'settlement:mixed', provenance: invalidClaim }] },
    ),
    { code: 'provenance_subject_mixed_lineage_not_derived' },
  );
});

test('contribution provenance receipt binds every claim subject to strict envelopes', () => {
  const source = record({
    id: 'dataset:scenario',
    kind: 'dataset',
    origin: 'scenario',
    hash: HASHES.scenario,
  });
  const claim = contracts.createProvenance({
    origin: 'derived',
    temporalStatus: 'forecast',
    uncertainty: MISSING_UNCERTAINTY,
    evidenceRefs: [evidence(source)],
  });
  const value = contribution([source], claim);
  value.events.push({
    schema: 'simulatte.pluginEvent.v4',
    id: 'event:test',
    pluginId: value.pluginId,
    sequence: 0,
    simulationTimeMs: 0,
    kind: 'test.started',
    causationIds: [],
    correlationId: 'run:test',
    payload: {},
    provenance: claim,
  });
  value.controls.controls.push({
    id: 'parameter:test',
    label: 'Test parameter',
    kind: 'number',
    value: 1,
    options: null,
    minimum: 0,
    maximum: 2,
    step: 1,
    provenance: claim,
  });
  value.state = {
    schema: 'simulatte.progressiveState.v4',
    id: 'state:test',
    pluginId: value.pluginId,
    simulationTimeMs: 0,
    status: 'settled',
    previousStateId: null,
    eventIds: ['event:test'],
    measures: [{ kind: 'served', value: 1, unit: 'requests', domain: null }],
    provenance: claim,
  };
  value.inspections.push({
    id: 'inspection:test',
    label: 'Test inspection',
    targetIds: ['layer:test'],
    fields: [{
      id: 'field:test',
      label: 'Field',
      value: 1,
      unit: 'requests',
      provenance: claim,
    }],
  });
  const receipt = registryModule.createContributionProvenanceReceipt(value, {
    settlements: [{ id: 'settlement:test', provenance: claim }],
  });
  const kinds = new Set(receipt.envelopes.map((row) => row.subjectKind));
  [
    'dataset',
    'parameter',
    'event',
    'state',
    'semanticObject',
    'metric',
    'inspection',
    'settlement',
  ].forEach((kind) => assert.equal(kinds.has(kind), true, `missing ${kind} envelope`));
  assert.equal(receipt.coverageMatrix.subjectCount, receipt.envelopes.length);
  assert.equal(receipt.envelopes.every((row) => row.artifactSha256s.includes(HASHES.scenario)), true);
  const platformReceipt = registryModule.createPlatformProvenanceReceipt([receipt]);
  assert.deepEqual(platformReceipt.pluginIds, ['provenance-test']);
  assert.equal(platformReceipt.coverageMatrix.subjectCount, receipt.envelopes.length);
});

test('compositor and View Director resolve canonical envelopes without accepting plugin styles', () => {
  const source = record({
    id: 'dataset:scenario',
    kind: 'dataset',
    origin: 'scenario',
    hash: HASHES.scenario,
  });
  const claim = contracts.createProvenance({
    origin: 'derived',
    temporalStatus: 'forecast',
    uncertainty: MISSING_UNCERTAINTY,
    evidenceRefs: [evidence(source)],
  });
  const value = contribution([source], claim);
  value.presentation.layers = [0, 1, 2].map((index) => ({
    ...value.presentation.layers[0],
    id: `site:${index}`,
    label: `Site ${index}`,
    geometry: {
      kind: 'point',
      coordinateSystem: 'screen-px',
      coordinates: [[20 + index, 20 + index]],
    },
    aggregationKey: 'sites',
  }));
  const provenanceReceipt = registryModule.createContributionProvenanceReceipt(value);
  const composition = compositorModule.createCompositor().compose(value.presentation, {
    viewport: { width: 400, height: 300 },
    provenanceReceipt,
  });
  const cluster = composition.primitives[0];
  assert.equal(cluster.kind, 'point-cluster');
  assert.equal(cluster.provenanceEnvelope.axes.origin, 'derived');
  assert.deepEqual(cluster.provenanceEnvelope.parentIds, ['site:0', 'site:1', 'site:2']);
  assert.equal(composition.receipt.provenance.isCanonical, true);
  assert.equal(composition.receipt.provenance.renderedEnvelopeCount, 1);
  assert.equal(Object.hasOwn(cluster.provenanceEnvelope, 'style'), false);

  const director = viewDirectorModule.createViewDirector({ provenanceReceipts: [provenanceReceipt] });
  director.submit({
    schema: 'simulatte.viewIntent.v4',
    id: 'focus-site',
    mode: 'follow',
    targetIds: ['site:1'],
    reasonEventId: null,
    priority: 50,
    transition: 'ease',
  });
  assert.deepEqual(director.receipt().provenance.resolvedTargetIds, ['site:1']);
  assert.equal(director.receipt().provenance.byOrigin.derived, 1);
  assert.throws(
    () => director.submit({
      schema: 'simulatte.viewIntent.v4',
      id: 'missing-site',
      mode: 'follow',
      targetIds: ['site:missing'],
      reasonEventId: null,
      priority: 60,
      transition: 'ease',
    }),
    { code: 'view_director_target_provenance_missing' },
  );
});

test('compositor fails closed when a canonical receipt omits or changes a rendered parent binding', () => {
  const source = record({
    id: 'dataset:scenario',
    kind: 'dataset',
    origin: 'scenario',
    hash: HASHES.scenario,
  });
  const claim = contracts.createProvenance({
    origin: 'derived',
    temporalStatus: 'forecast',
    uncertainty: MISSING_UNCERTAINTY,
    evidenceRefs: [evidence(source)],
  });
  const value = contribution([source], claim);
  const receipt = registryModule.createContributionProvenanceReceipt(value);
  const missing = structuredClone(receipt);
  missing.envelopes = missing.envelopes.filter((row) => row.subjectKind !== 'semanticObject');
  assert.throws(
    () => compositorModule.createCompositor().compose(value.presentation, {
      viewport: { width: 400, height: 300 },
      provenanceReceipt: missing,
    }),
    { code: 'semantic_compositor_provenance_missing' },
  );
  const changed = structuredClone(receipt);
  changed.envelopes.find((row) => row.subjectKind === 'semanticObject').parentIds = ['wrong-parent'];
  assert.throws(
    () => compositorModule.createCompositor().compose(value.presentation, {
      viewport: { width: 400, height: 300 },
      provenanceReceipt: changed,
    }),
    { code: 'semantic_compositor_provenance_parent_mismatch' },
  );
});

test('lineage mutations fail for missing parents and changed evidence identities', () => {
  const source = record({
    id: 'dataset:source',
    kind: 'dataset',
    origin: 'scenario',
    hash: HASHES.scenario,
  });
  const derived = record({
    id: 'transformation:derived',
    kind: 'transformation',
    origin: 'derived',
    hash: HASHES.derived,
    datasetId: source.datasetId,
    parentIds: [source.id],
  });
  const claim = contracts.createProvenance({
    origin: 'derived',
    temporalStatus: 'forecast',
    uncertainty: MISSING_UNCERTAINTY,
    evidenceRefs: [evidence(derived)],
  });
  assert.throws(
    () => contracts.validateContribution(contribution([derived], claim)),
    { code: 'plugin_v4_contribution_parent_missing' },
  );
  const changed = structuredClone(claim);
  changed.evidenceRefs[0].contentHash = HASHES.observed;
  assert.throws(
    () => contracts.validateContribution(contribution([source, derived], changed)),
    { code: 'plugin_v4_evidence_identity_mismatch' },
  );
});

test('coverage matrix reports each truth dimension and registry receipts bind it', () => {
  const observed = record({
    id: 'dataset:observed',
    kind: 'dataset',
    origin: 'observed',
    hash: HASHES.observed,
    license: { required: true, identifier: 'test-open-data-license' },
  });
  const scenario = record({
    id: 'dataset:scenario',
    kind: 'dataset',
    origin: 'scenario',
    hash: HASHES.scenario,
  });
  const matrix = contracts.createCoverageMatrix([observed, scenario]);
  assert.equal(matrix.byOrigin.observed, 1);
  assert.equal(matrix.byOrigin.scenario, 1);
  assert.deepEqual(matrix.gaps.hypotheticalRecordIds, ['dataset:scenario']);
  assert.equal(matrix.bySubjectKind.dataset.observed, 1);
  const claim = contracts.createProvenance({
    origin: 'derived',
    temporalStatus: 'forecast',
    uncertainty: MISSING_UNCERTAINTY,
    evidenceRefs: [evidence(observed), evidence(scenario)],
  });
  const contributionMatrix = registryModule.createContributionProvenanceReceipt(
    contribution([observed, scenario], claim),
  ).coverageMatrix;
  assert.equal(contributionMatrix.bySubjectKind.semanticObject.derived, 1);
  assert.equal(contributionMatrix.subjectCount, 3);
  assert.deepEqual(contributionMatrix.gaps.hypotheticalSubjectIds, ['dataset:scenario']);

  const registry = registryModule.createProvenanceRegistry();
  registry.register(observed);
  registry.register(scenario);
  const receipt = registry.receipt();
  assert.deepEqual(receipt.coverageMatrix, matrix);
  assert.equal(Object.isFrozen(receipt.coverageMatrix), true);
});
