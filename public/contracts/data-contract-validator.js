(function attachAutonomyDataContractValidator(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyDataContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyDataContractValidator() {
  class DataContractError extends Error {
    constructor(contract, path, expected, received) {
      super(`${contract} contract at ${path} expected ${expected}, received ${describe(received)}`);
      this.name = 'AutonomyContractError';
      this.contract = contract;
      this.path = path;
      this.expected = expected;
      this.received = received;
    }
  }

  function validator(ErrorType, contract) {
    const fail = (path, expected, received) => { throw new ErrorType(contract, path, expected, received); };
    const object = (value, path) => value && typeof value === 'object' && !Array.isArray(value) ? value : fail(path, 'object', value);
    const array = (value, path, minimum = 0) => Array.isArray(value) && value.length >= minimum ? value : fail(path, `array with at least ${minimum} row(s)`, value);
    const string = (value, path) => typeof value === 'string' && value.length ? value : fail(path, 'non-empty string', value);
    const integer = (value, path, minimum = 0) => Number.isInteger(value) && value >= minimum ? value : fail(path, `integer >= ${minimum}`, value);
    const finite = (value, path, minimum = -Infinity) => Number.isFinite(value) && value >= minimum ? value : fail(path, `finite number >= ${minimum}`, value);
    const exact = (value, expected, path) => canonical(value) === canonical(expected) ? value : fail(path, `exact registry value ${canonical(expected)}`, value);
    const sha = (value, path) => /^[a-f0-9]{64}$/.test(value || '') ? value : fail(path, '64-character lowercase SHA-256', value);
    const schema = (value) => {
      object(value, '$');
      exact(value.schema, contract, '$.schema');
    };
    return { array, exact, fail, finite, integer, object, schema, sha, string };
  }

  function validateModelRuntimeLock(lock, ErrorType = DataContractError) {
    const contract = 'simulatte.modelRuntimeLock.v1';
    const v = validator(ErrorType, contract);
    v.schema(lock);
    v.string(lock.id, '$.id');
    v.integer(lock.number, '$.number', 1);
    const embedding = v.object(lock.embedding, '$.embedding');
    v.string(embedding.id, '$.embedding.id');
    v.integer(embedding.dimensions, '$.embedding.dimensions', 1);
    v.integer(embedding.source?.sizeBytes, '$.embedding.source.sizeBytes', 1);
    v.sha(embedding.manifestHash?.hex, '$.embedding.manifestHash.hex');
    return lock;
  }

  function validateManifest(manifest, ErrorType = DataContractError) {
    const contract = 'simulatte.autonomyDataManifest.v3';
    const v = validator(ErrorType, contract);
    v.schema(manifest);
    ['id', 'contentVersion', 'defaultMissionText', 'claimBoundary'].forEach((key) => v.string(manifest[key], `$.${key}`));
    const examples = v.array(manifest.missionExamples, '$.missionExamples', 4);
    examples.forEach((row, index) => v.string(row, `$.missionExamples[${index}]`));
    if (new Set(examples).size !== examples.length) v.fail('$.missionExamples', 'unique mission strings', examples);
    if (!examples.includes(manifest.defaultMissionText)) v.fail('$.missionExamples', 'defaultMissionText member', manifest.defaultMissionText);
    const keys = ['world', 'policy', 'featureCatalog', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry', 'placeEmbeddingIndex', 'placeResolutionEvidence', 'modelRuntimeLock', 'accessibilityIndex', 'routeAmenityIndex', 'safetyHistoryIndex', 'curriculum', 'worldSnapshotRegistry', 'policyArenaEvidence'];
    keys.forEach((key) => {
      const ref = v.object(manifest[key], `$.${key}`);
      v.string(ref.id, `$.${key}.id`);
      v.string(ref.path, `$.${key}.path`);
      v.sha(ref.sha256, `$.${key}.sha256`);
    });
    const embodiments = v.array(manifest.embodiments, '$.embodiments', 2);
    uniqueRows(embodiments, 'id', '$.embodiments', v);
    embodiments.forEach((ref, index) => {
      v.string(ref.path, `$.embodiments[${index}].path`);
      v.sha(ref.sha256, `$.embodiments[${index}].sha256`);
    });
    if (!embodiments.some((row) => row.id === manifest.defaultEmbodimentId)) v.fail('$.defaultEmbodimentId', 'declared embodiment ID', manifest.defaultEmbodimentId);
    const resolution = v.object(manifest.placeResolution, '$.placeResolution');
    if (!['lexical', 'qwen_embedding'].includes(resolution.defaultLane)) v.fail('$.placeResolution.defaultLane', 'lexical or qwen_embedding', resolution.defaultLane);
    const lanes = v.array(resolution.lanes, '$.placeResolution.lanes', 2);
    v.exact([...lanes].sort(), ['lexical', 'qwen_embedding'], '$.placeResolution.lanes');
    v.integer(resolution.neuralDownloadBytes, '$.placeResolution.neuralDownloadBytes', 1);
    v.string(resolution.claimBoundary, '$.placeResolution.claimBoundary');
    return manifest;
  }

  function validateRerankerEvidence(evidence, featureCatalog, governedHashes = null, ErrorType = DataContractError) {
    const contract = 'simulatte.autonomyRerankerEvaluation.v1';
    const v = validator(ErrorType, contract);
    v.schema(evidence);
    ['id', 'contentVersion'].forEach((key) => v.string(evidence[key], `$.${key}`));
    v.exact(evidence.population?.promotionEligible, false, '$.population.promotionEligible');
    const weights = v.object(evidence.intervention?.weights, '$.intervention.weights');
    Object.entries(featureCatalog.rerankerPolicy.weights).forEach(([key, value]) => v.exact(weights[key], value, `$.intervention.weights.${key}`));
    if (governedHashes) Object.entries(governedHashes).forEach(([key, hash]) => v.exact(evidence.identities?.[key]?.sha256, hash, `$.identities.${key}.sha256`));
    const metric = (row, path) => {
      row = v.object(row, path);
      v.integer(row.judgmentCount, `${path}.judgmentCount`, 1);
      v.finite(row.meanReciprocalRank, `${path}.meanReciprocalRank`, 0);
      v.finite(row.recallAt5, `${path}.recallAt5`, 0);
      if (row.meanReciprocalRank > 1 || row.recallAt5 > 1) v.fail(path, 'ranking metrics between zero and one', row);
      return row;
    };
    const control = metric(evidence.control, '$.control');
    const challenger = metric(evidence.challenger, '$.challenger');
    if (!evidence.accepted || challenger.meanReciprocalRank <= control.meanReciprocalRank || challenger.recallAt5 < control.recallAt5) v.fail('$', 'accepted MRR improvement with Recall@5 non-regression', evidence);
    v.array(evidence.judgments, '$.judgments', 1);
    v.string(evidence.claimBoundary, '$.claimBoundary');
    return evidence;
  }

  function validatePolicyArenaEvidence(evidence, ErrorType = DataContractError) {
    const contract = 'simulatte.samerAutonomyReport.v1';
    const v = validator(ErrorType, contract);
    v.schema(evidence);
    v.string(evidence.id, '$.id');
    v.string(evidence.contentVersion, '$.contentVersion');
    v.sha(evidence.contractHash, '$.contractHash');
    v.sha(evidence.scenarioSetHash, '$.scenarioSetHash');
    const lanes = v.array(evidence.lanes, '$.lanes', 3);
    uniqueRows(lanes, 'id', '$.lanes', v);
    lanes.forEach((lane, index) => {
      v.object(lane.guardrails, `$.lanes[${index}].guardrails`);
      v.finite(lane.metrics?.safetyAdjustedCompletionScore, `$.lanes[${index}].metrics.safetyAdjustedCompletionScore`, 0);
    });
    v.exact(evidence.promotion?.status, 'blocked', '$.promotion.status');
    v.exact(evidence.diagnosticSelection?.status, 'diagnostic_leader_only', '$.diagnosticSelection.status');
    v.string(evidence.claimBoundary, '$.claimBoundary');
    return evidence;
  }

  function validatePlaceEmbeddingIndex(index, modelLock, ErrorType = DataContractError) {
    const contract = 'simulatte.autonomyPlaceEmbeddingIndex.v1';
    const v = validator(ErrorType, contract);
    v.schema(index);
    v.string(index.id, '$.id');
    v.integer(index.documentCount, '$.documentCount', 1);
    v.integer(index.embeddingDim, '$.embeddingDim', 1);
    const model = v.object(index.model, '$.model');
    v.exact(model.id, modelLock.embedding.id, '$.model.id');
    v.exact(model.manifestSha256, modelLock.embedding.manifestHash.hex, '$.model.manifestSha256');
    v.exact(index.embeddingDim, modelLock.embedding.dimensions, '$.embeddingDim');
    const documents = v.array(index.documents, '$.documents', 1);
    v.exact(index.documentCount, documents.length, '$.documentCount');
    uniqueRows(documents, 'placeId', '$.documents', v);
    documents.forEach((row, rowIndex) => {
      ['placeId', 'nodeId', 'label', 'candidateText'].forEach((key) => v.string(row[key], `$.documents[${rowIndex}].${key}`));
      v.sha(row.textSha256, `$.documents[${rowIndex}].textSha256`);
    });
    v.sha(index.embeddingsSha256, '$.embeddingsSha256');
    v.sha(index.indexSha256, '$.indexSha256');
    v.string(index.claimBoundary, '$.claimBoundary');
    return index;
  }

  function validateAccessibilityIndex(index, world, worldSha256 = null, ErrorType = DataContractError) {
    const contract = 'simulatte.autonomyAccessibilityIndex.v1';
    const v = validator(ErrorType, contract);
    validateWorldIdentity(index, world, worldSha256, v);
    const source = sourceIdentity(index, v, true);
    const policy = v.object(index.policy, '$.policy');
    v.string(policy.id, '$.policy.id');
    ['maximumSnapDistanceM', 'maximumCurbRevealInches', 'maximumRunningSlopePercent', 'maximumCrossSlopePercent'].forEach((key) => v.finite(policy[key], `$.policy.${key}`, 0));
    const worldNodeIds = new Set(world.nodes.map((row) => row.id));
    const rows = v.array(index.nodeRows, '$.nodeRows');
    uniqueRows(rows, 'nodeId', '$.nodeRows', v);
    const statuses = new Set(['meets_simulation_thresholds', 'fails_simulation_thresholds', 'insufficient_measurements']);
    rows.forEach((row, rowIndex) => {
      if (!worldNodeIds.has(row.nodeId)) v.fail(`$.nodeRows[${rowIndex}].nodeId`, 'known world node ID', row.nodeId);
      v.string(row.rampId, `$.nodeRows[${rowIndex}].rampId`);
      v.finite(row.snapDistanceM, `$.nodeRows[${rowIndex}].snapDistanceM`, 0);
      if (!statuses.has(row.status)) v.fail(`$.nodeRows[${rowIndex}].status`, 'registered threshold status', row.status);
      v.array(row.failures, `$.nodeRows[${rowIndex}].failures`);
    });
    const counts = v.object(index.counts, '$.counts');
    v.exact(counts.sourceRamps, source.sourceFeatureCount, '$.counts.sourceRamps');
    v.exact(counts.nodesWithRampEvidence, rows.length, '$.counts.nodesWithRampEvidence');
    v.exact(counts.nodesWithRampEvidence + counts.nodesWithoutRampEvidence, counts.streetNodes, '$.counts.streetNodes');
    v.string(index.claimBoundary, '$.claimBoundary');
    return index;
  }

  function validateRouteAmenityIndex(index, world, worldSha256 = null, ErrorType = DataContractError) {
    const contract = 'simulatte.autonomyRouteAmenityIndex.v1';
    const v = validator(ErrorType, contract);
    validateWorldIdentity(index, world, worldSha256, v);
    sourceIdentity(index, v, true);
    const segmentIds = new Set(world.segments.map((row) => row.id));
    const rows = v.array(index.segmentRows, '$.segmentRows', 1);
    uniqueRows(rows, 'segmentId', '$.segmentRows', v);
    rows.forEach((row, rowIndex) => {
      if (!segmentIds.has(row.segmentId)) v.fail(`$.segmentRows[${rowIndex}].segmentId`, 'known world segment', row.segmentId);
      v.integer(row.sampleCount, `$.segmentRows[${rowIndex}].sampleCount`, 2);
      if (row.maximumNearestRackDistanceM !== null) v.finite(row.maximumNearestRackDistanceM, `$.segmentRows[${rowIndex}].maximumNearestRackDistanceM`, 0);
    });
    v.exact(rows.length, world.segments.length, '$.segmentRows.length');
    v.string(index.claimBoundary, '$.claimBoundary');
    return index;
  }

  function validateSafetyHistoryIndex(index, world, worldSha256 = null, ErrorType = DataContractError) {
    const contract = 'simulatte.autonomySafetyHistoryIndex.v1';
    const v = validator(ErrorType, contract);
    validateWorldIdentity(index, world, worldSha256, v);
    const source = sourceIdentity(index, v, false);
    v.string(source.periodStart, '$.source.periodStart');
    v.string(source.periodEndExclusive, '$.source.periodEndExclusive');
    Object.entries(v.object(source.sourceFileSha256, '$.source.sourceFileSha256')).forEach(([file, hash]) => {
      v.string(file, '$.source.sourceFileSha256 key');
      v.sha(hash, `$.source.sourceFileSha256.${file}`);
    });
    const method = v.object(index.method, '$.method');
    v.string(method.id, '$.method.id');
    v.finite(method.maximumJoinDistanceM, '$.method.maximumJoinDistanceM', 0);
    v.exact(method.exposureDenominator, null, '$.method.exposureDenominator');
    const segmentIds = new Set(world.segments.map((row) => row.id));
    const rows = v.array(index.segmentRows, '$.segmentRows');
    uniqueRows(rows, 'segmentId', '$.segmentRows', v);
    rows.forEach((row, rowIndex) => {
      if (!segmentIds.has(row.segmentId)) v.fail(`$.segmentRows[${rowIndex}].segmentId`, 'known world segment ID', row.segmentId);
      v.string(row.physicalKey, `$.segmentRows[${rowIndex}].physicalKey`);
      ['crashCount', 'injuryCount', 'fatalityCount', 'historicalObservationScore'].forEach((key) => v.integer(row[key], `$.segmentRows[${rowIndex}].${key}`));
      v.array(row.collisionIds, `$.segmentRows[${rowIndex}].collisionIds`).forEach((id, index) => v.string(id, `$.segmentRows[${rowIndex}].collisionIds[${index}]`));
    });
    const counts = v.object(index.counts, '$.counts');
    ['sourceCrashes', 'joinedCrashes', 'unjoinedCrashes', 'physicalRouteSegments', 'physicalSegmentsWithHistory', 'directedSegmentsWithHistory', 'personsInjured', 'personsKilled'].forEach((key) => v.integer(counts[key], `$.counts.${key}`));
    v.exact(counts.joinedCrashes + counts.unjoinedCrashes, counts.sourceCrashes, '$.counts');
    v.exact(counts.directedSegmentsWithHistory, rows.length, '$.counts.directedSegmentsWithHistory');
    v.array(index.monthlyCounts, '$.monthlyCounts', 1);
    v.array(index.hourOfWeekCounts, '$.hourOfWeekCounts', 168);
    v.string(index.claimBoundary, '$.claimBoundary');
    return index;
  }

  function validateCurriculum(curriculum, world, ErrorType = DataContractError) {
    const contract = 'simulatte.autonomyCurriculum.v1';
    const v = validator(ErrorType, contract);
    v.schema(curriculum);
    ['id', 'contentVersion', 'title'].forEach((key) => v.string(curriculum[key], `$.${key}`));
    const missions = v.array(curriculum.missions, '$.missions', 1);
    uniqueRows(missions, 'id', '$.missions', v);
    uniqueRows(missions, 'sourceText', '$.missions', v);
    const embodimentIds = new Set(['delivery-bike-v1', 'pedestrian-v1', 'scooter-v1', 'car-v1']);
    missions.forEach((mission, index) => {
      v.string(mission.sourceText, `$.missions[${index}].sourceText`);
      if (!['delivery', 'point_to_point', 'loop'].includes(mission.requiredTaskType)) v.fail(`$.missions[${index}].requiredTaskType`, 'registered task type', mission.requiredTaskType);
      if (!embodimentIds.has(mission.requiredEmbodimentId)) v.fail(`$.missions[${index}].requiredEmbodimentId`, 'registered embodiment ID', mission.requiredEmbodimentId);
    });
    v.object(curriculum.completionRule, '$.completionRule');
    v.string(curriculum.claimBoundary, '$.claimBoundary');
    if (!world?.id) v.fail('$.world', 'loaded governed world', world);
    return curriculum;
  }

  function validateWorldSnapshotRegistry(registry, world, ErrorType = DataContractError) {
    const contract = 'simulatte.autonomyWorldSnapshotRegistry.v1';
    const v = validator(ErrorType, contract);
    v.schema(registry);
    ['id', 'contentVersion'].forEach((key) => v.string(registry[key], `$.${key}`));
    const snapshots = v.array(registry.snapshots, '$.snapshots', 1);
    uniqueRows(snapshots, 'snapshotDate', '$.snapshots', v);
    snapshots.forEach((row, index) => {
      v.exact(row.status, 'executable', `$.snapshots[${index}].status`);
      v.string(row.worldId, `$.snapshots[${index}].worldId`);
      v.string(row.worldContentVersion, `$.snapshots[${index}].worldContentVersion`);
    });
    if (!snapshots.some((row) => row.worldId === world.id && row.worldContentVersion === world.contentVersion)) v.fail('$.snapshots', 'entry for loaded world identity', snapshots);
    v.array(registry.unavailableComparisons, '$.unavailableComparisons');
    v.string(registry.claimBoundary, '$.claimBoundary');
    return registry;
  }

  function validatePlaceResolutionEvidence(evidence, index, modelLock, ErrorType = DataContractError) {
    const contract = 'simulatte.placeResolutionEvaluation.v2';
    const v = validator(ErrorType, contract);
    v.schema(evidence);
    v.exact(evidence.schema, contract, '$.schema');
    v.string(evidence.id, '$.id');
    v.exact(evidence.population?.promotionEligible, false, '$.population.promotionEligible');
    v.exact(evidence.accepted, true, '$.accepted');
    const control = v.object(evidence.lanes?.control, '$.lanes.control');
    const challenger = v.object(evidence.lanes?.challenger, '$.lanes.challenger');
    v.integer(control.metrics?.correct, '$.lanes.control.metrics.correct');
    v.integer(challenger.metrics?.correct, '$.lanes.challenger.metrics.correct');
    if (challenger.metrics.correct <= control.metrics.correct) v.fail('$.lanes.challenger.metrics.correct', `greater than ${control.metrics.correct}`, challenger.metrics.correct);
    v.exact(challenger.metrics.wrongPlace, 0, '$.lanes.challenger.metrics.wrongPlace');
    v.exact(challenger.guardrails?.mustRefuseViolations, 0, '$.lanes.challenger.guardrails.mustRefuseViolations');
    v.exact(challenger.guardrails?.floorMisses, 0, '$.lanes.challenger.guardrails.floorMisses');
    const modelCandidate = v.object(evidence.lanes?.modelCandidate, '$.lanes.modelCandidate');
    v.exact(modelCandidate.metrics?.wrongPlace, 0, '$.lanes.modelCandidate.metrics.wrongPlace');
    v.exact(modelCandidate.guardrails?.mustRefuseViolations, 0, '$.lanes.modelCandidate.guardrails.mustRefuseViolations');
    v.exact(modelCandidate.guardrails?.floorMisses, 0, '$.lanes.modelCandidate.guardrails.floorMisses');
    v.exact(evidence.modelSelection?.status, 'rejected_no_incremental_gain', '$.modelSelection.status');
    v.exact(evidence.modelSelection?.incrementalCorrect, 0, '$.modelSelection.incrementalCorrect');
    v.exact(evidence.identities?.modelCandidateAssets?.placeEmbeddingIndex?.id, index.id, '$.identities.modelCandidateAssets.placeEmbeddingIndex.id');
    v.exact(evidence.identities?.modelCandidateAssets?.placeEmbeddingIndex?.indexSha256, index.indexSha256, '$.identities.modelCandidateAssets.placeEmbeddingIndex.indexSha256');
    v.exact(evidence.identities?.modelCandidateAssets?.modelRuntimeLock?.id, modelLock.id, '$.identities.modelCandidateAssets.modelRuntimeLock.id');
    v.exact(evidence.identities?.modelCandidateAssets?.model?.id, modelLock.embedding.id, '$.identities.modelCandidateAssets.model.id');
    v.string(evidence.claimBoundary, '$.claimBoundary');
    return evidence;
  }

  function validateWorldIdentity(index, world, worldSha256, v) {
    v.schema(index);
    v.string(index.id, '$.id');
    v.string(index.contentVersion, '$.contentVersion');
    v.exact(index.world?.id, world.id, '$.world.id');
    v.exact(index.world?.contentVersion, world.contentVersion, '$.world.contentVersion');
    v.sha(index.world?.sha256, '$.world.sha256');
    if (worldSha256) v.exact(index.world.sha256, worldSha256, '$.world.sha256');
  }

  function sourceIdentity(index, v, featureCount) {
    const source = v.object(index.source, '$.source');
    v.string(source.datasetId, '$.source.datasetId');
    v.string(source.authority, '$.source.authority');
    v.sha(source.sourceReceiptSha256, '$.source.sourceReceiptSha256');
    if (featureCount) {
      v.sha(source.sourceBytesSha256, '$.source.sourceBytesSha256');
      v.integer(source.sourceFeatureCount, '$.source.sourceFeatureCount', 1);
    }
    return source;
  }

  function uniqueRows(rows, key, path, v) {
    const seen = new Set();
    rows.forEach((row, index) => {
      const value = v.string(row?.[key], `${path}[${index}].${key}`);
      if (seen.has(value)) v.fail(`${path}[${index}].${key}`, `unique ${key}`, value);
      seen.add(value);
    });
  }

  function canonical(value) {
    return JSON.stringify(sortValue(value));
  }

  function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }

  function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === 'string') return JSON.stringify(value);
    return typeof value;
  }

  return {
    DataContractError,
    validateAccessibilityIndex,
    validateCurriculum,
    validateManifest,
    validateModelRuntimeLock,
    validatePlaceEmbeddingIndex,
    validatePlaceResolutionEvidence,
    validatePolicyArenaEvidence,
    validateRerankerEvidence,
    validateRouteAmenityIndex,
    validateSafetyHistoryIndex,
    validateWorldSnapshotRegistry,
  };
});
