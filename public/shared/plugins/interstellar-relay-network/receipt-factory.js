(function attachInterstellarReceiptFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarReceiptFactory = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarReceiptFactory() {
  function createDataReceipts({
    sdk,
    starsData,
    hardwareData,
    scenariosData,
    modelsData,
    operationsData,
    advancedData,
    hygData,
    stellarStates,
  }) {
    const activeHygRowIds = (stellarStates || [])
      .filter((row) => row.sourceId.startsWith('hyg:'))
      .flatMap((row) => row.sourceRowIds);
    return Object.freeze([
      dataReceipt(sdk, 'gaia.dr3.nearby-stars.v2', starsData, starsData.provenance, starsData.stars.map((row) => row.sourceRowId)),
      ...(activeHygRowIds.length
        ? [dataReceipt(sdk, 'hyg.visible-stars.v1', hygData, hygData.provenance, activeHygRowIds)]
        : []),
      dataReceipt(sdk, 'relay.hardware.archetypes.v2', hardwareData, hardwareData.provenance, Object.keys(hardwareData.archetypes).map((id) => `relay.hardware.archetypes.v2:${id}`)),
      dataReceipt(sdk, 'interstellar.scenario.network.v2', scenariosData, scenariosData.provenance, scenariosData.scenarios.map((row) => `interstellar.scenario.network.v2:${row.id}`)),
      dataReceipt(sdk, 'interstellar.relay.models.v1', modelsData, {
        ...modelsData.provenance,
        truth: truth('modeled', 'Catalog of declared equations'),
      }, modelsData.models.map((row) => `interstellar.relay.models.v1:${row.id}`)),
      dataReceipt(sdk, 'interstellar.operations.models.v1', operationsData, operationsData.provenance, operationsData.profiles.map((row) => `interstellar.operations.models.v1:${row.id}`)),
      dataReceipt(sdk, 'interstellar.advanced.channels.v1', advancedData, advancedData.provenance, advancedData.channels.map((row) => `interstellar.advanced.channels.v1:${row.id}`)),
    ]);
  }

  function dataReceipt(sdk, datasetId, dataset, provenance, sourceRowIds) {
    const hostReceipt = sdk.datasets.receipt(datasetId);
    return Object.freeze({
      schema: 'simulatte.dataReceipt.v1',
      datasetId,
      contentVersion: dataset.contentVersion,
      sha256: hostReceipt?.sha256 || null,
      sourceRowIds: Object.freeze(sourceRowIds),
      retrievalAt: provenance?.retrievalAt || null,
      license: provenance?.license || null,
      coverage: provenance?.coverage || null,
      sourceArtifacts: Object.freeze([
        ...(provenance?.sourceArtifact ? [provenance.sourceArtifact] : []),
        ...(provenance?.sourceArtifacts || []),
      ].map((row) => Object.freeze({ ...row }))),
      immutableSourceHashes: Object.freeze([
        ...(hostReceipt?.sha256 ? [{ kind: 'governed-output', sha256: hostReceipt.sha256 }] : []),
        ...(provenance?.sourceArtifact?.sha256 ? [{ kind: 'source-artifact', sha256: provenance.sourceArtifact.sha256 }] : []),
        ...(provenance?.sourceArtifacts || []).filter((row) => row.sha256).map((row) => ({
          kind: `source-artifact:${row.id}`,
          sha256: row.sha256,
        })),
      ].map((row) => Object.freeze(row))),
      truth: provenance?.truth || truth(
        datasetId.startsWith('gaia.') ? 'observed' : 'scenario',
        datasetId.startsWith('gaia.') ? 'Catalog-reported standard errors' : 'Scenario artifact',
      ),
    });
  }

  function createModelReceipts(dataset, controls, transceiverId) {
    const usedIds = new Set([
      'linear-space-motion-v2',
      'finite-light-time-v2',
      'diffraction-photon-budget-v2',
      'deterministic-store-forward-v2',
    ]);
    return Object.freeze(dataset.models.filter((row) => usedIds.has(row.id)).map((row) => Object.freeze({
      schema: 'simulatte.modelReceipt.v1',
      modelId: row.id,
      equation: row.equation,
      citation: row.citation,
      parameters: Object.freeze({
        targetEpochYear: controls.targetEpochYear,
        startEpochIso: controls.startEpochIso,
        processingDelayHours: controls.processingDelayHours,
        packetBytes: controls.packetBytes,
        transceiverId,
      }),
      assumptions: Object.freeze(row.assumptions.slice()),
      omissions: resolveOmissions(dataset, row),
      reliabilityScope: row.id === 'diffraction-photon-budget-v2' || row.id === 'deterministic-store-forward-v2'
        ? Object.freeze({
          conditionalOn: Object.freeze(dataset.reliabilityScope.conditionalOn.slice()),
          excludes: Object.freeze(dataset.reliabilityScope.excludes.slice()),
        })
        : null,
      validation: row.validation,
      truth: row.truth,
    })));
  }

  function resolveOmissions(dataset, model) {
    return Object.freeze((model.omissionIds || []).map((id) => {
      const omission = dataset.omissions.find((candidate) => candidate.id === id);
      if (!omission) throw new Error(`interstellar_model_omission_missing: ${model.id}:${id}`);
      return Object.freeze({ ...omission });
    }));
  }

  function operationsModelReceipt(controls, operations) {
    return Object.freeze({
      schema: 'simulatte.modelReceipt.v1',
      modelId: 'seeded-interstellar-operations-ensemble-v1',
      equation: 'Seeded acquisition + availability + maintenance + exponential failure/repair + bounded retry ensemble',
      citation: 'interstellar.operations.models.v1',
      parameters: Object.freeze({
        operationsProfileId: controls.operationsProfileId,
        ensembleSize: controls.ensembleSize,
        retryLimit: controls.retryLimit,
        dustExtinctionMagPerPc: controls.dustExtinctionMagPerPc,
        plasmaLossDbPerPc: controls.plasmaLossDbPerPc,
        detectorNoiseScale: controls.detectorNoiseScale,
      }),
      assumptions: Object.freeze(['independent-seeded-draws', 'profile-parameters-are-scenarios']),
      omissions: operations.remainingLimitations,
      reliabilityScope: Object.freeze({
        conditionalOn: Object.freeze(['declared-operational-profile', 'infrastructure-not-observed']),
        excludes: Object.freeze([]),
      }),
      validation: Object.freeze({ id: 'deterministic-seed-and-quantile-v1' }),
      truth: operations.truth,
    });
  }

  function advancedChannelModelReceipt(controls, channelReceipts) {
    const unsupported = channelReceipts.filter((row) => row.constructibilityStatus.startsWith('unsupported'));
    return Object.freeze({
      schema: 'simulatte.modelReceipt.v1',
      modelId: `interstellar-channel:${controls.channelMode}`,
      equation: channelEquation(controls.channelMode),
      citation: channelReceipts[0]?.citations || [],
      parameters: Object.freeze({ channelMode: controls.channelMode }),
      assumptions: Object.freeze(channelReceipts.map((row) => row.claimBoundary)),
      omissions: Object.freeze(unsupported.map((row) => ({
        id: `${row.mode}-constructibility-unsupported`,
        label: `${row.label} constructibility`,
        effect: row.claimBoundary,
        affects: ['latency', 'causality', 'engineering-feasibility'],
      }))),
      reliabilityScope: Object.freeze({
        conditionalOn: Object.freeze(['declared-channel-parameters']),
        excludes: Object.freeze(unsupported.length ? ['unproven-constructibility'] : []),
      }),
      validation: Object.freeze({ id: 'channel-constraint-receipt-v1' }),
      truth: channelReceipts[0]?.truth || truth('modeled', 'Channel model unavailable'),
    });
  }

  function channelEquation(mode) {
    if (mode === 'quantum-assisted') return 'Classical light-time + memory survival + declared entanglement-assisted capacity factor';
    if (mode === 'traversable-wormhole') return 'Declared Morris-Thorne metric constraint screen';
    if (mode === 'alcubierre-warp') return 'Declared Alcubierre metric constraint screen';
    return 'Finite light-time diffraction-limited optical link';
  }

  function scenarioReceipt(result) {
    return Object.freeze({
      schema: 'simulatte.plugin.interstellarScenarioReceipt.v3',
      scenarioId: result.scenarioId,
      datasetScenarioId: result.datasetScenarioId,
      seed: result.seed,
      relayPath: result.scenario.relayHops,
      routeSelection: result.routeSelection,
      channelMode: result.controls.channelMode,
      operations: operationsSummary(result.operations),
      dataReceipts: result.dataReceipts,
      modelReceiptIds: result.modelReceipts.map((row) => row.modelId),
      eventCount: result.schedule.trace.length,
      controls: result.controls,
      omissionIds: result.omissions.map((row) => row.id),
      reliabilityScope: result.reliabilityScope,
      claimBoundary: result.claimBoundary,
    });
  }

  function runReceipt(result) {
    return Object.freeze({
      schema: 'simulatte.plugin.interstellarRunReceipt.v3',
      scenarioId: result.scenarioId,
      packetId: result.packet.packetId,
      eventIds: result.schedule.trace.map((event) => event.id),
      causalEdges: result.schedule.trace.flatMap((event) => (
        event.causalParentIds.map((parentId) => ({ parentId, childId: event.id }))
      )),
      scheduler: result.schedule.schedulerReceipt,
      routeSelection: result.routeSelection,
      channelReceipts: result.channelReceipts,
      operations: operationsSummary(result.operations),
      representativeOperationalPlan: result.operations.representative,
      metrics: result.metrics,
      omissions: result.omissions,
      reliabilityScope: result.reliabilityScope,
      terminalVerification: result.packet.terminalVerification,
      truth: result.truth,
      claimBoundary: result.claimBoundary,
    });
  }

  function truth(origin, reason) {
    return Object.freeze({
      origin,
      temporalStatus: origin === 'observed' ? 'historical' : 'forecast',
      uncertainty: Object.freeze(origin === 'observed'
        ? { kind: 'distribution', value: Object.freeze({ family: 'catalog-reported-standard-errors' }) }
        : { kind: 'missing', value: Object.freeze({ reason }) }),
    });
  }

  function operationsSummary(value) {
    return Object.freeze({
      schema: value.schema,
      seed: value.seed,
      ensembleSize: value.ensembleSize,
      deliveredCount: value.deliveredCount,
      deliveryProbability: value.deliveryProbability,
      latencySeconds: value.latencySeconds,
      meanRetryCount: value.meanRetryCount,
      meanOutageCount: value.meanOutageCount,
      meanMaintenanceCount: value.meanMaintenanceCount,
      meanAcquisitionDelayHours: value.meanAcquisitionDelayHours,
      modeledEffectIds: value.modeledEffectIds,
      remainingLimitations: value.remainingLimitations,
      truth: value.truth,
    });
  }

  return Object.freeze({
    advancedChannelModelReceipt,
    createDataReceipts,
    createModelReceipts,
    operationsModelReceipt,
    runReceipt,
    scenarioReceipt,
  });
});
