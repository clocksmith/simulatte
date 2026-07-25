(function attachAutonomyRuntimeContracts(root, factory) {
  const primitives = typeof module === 'object' && module.exports
    ? require('./contract-validation-primitives.js')
    : root.SimulatteAutonomyContractPrimitives;
  const streetNames = typeof module === 'object' && module.exports
    ? require('../streets/street-name.js')
    : root.SimulatteStreetNames;
  const api = factory(primitives, streetNames);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyRuntimeContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyRuntimeContracts(primitives, streetNames) {
  const {
    ACTOR_TYPES,
    AutonomyContractError,
    requireObject,
    requireArray,
    requireString,
    requireFinite,
    requireInteger,
    requireBoolean,
    requireSchema,
    requireExactValue,
    requireExactStringSet,
  } = primitives;
  const normalizeStreetName = streetNames.normalizeStreetName;
  function validateEmbodiment(embodiment) {
    const contract = 'simulatte.autonomyEmbodiment.v2';
    requireSchema(embodiment, contract, contract);
    requireString(embodiment.id, contract, '$.id');
    requireString(embodiment.contentVersion, contract, '$.contentVersion');
    requireString(embodiment.label, contract, '$.label');
    requireString(embodiment.mode, contract, '$.mode');
    if (!['pedestrian', 'bicycle', 'scooter', 'car'].includes(embodiment.kind)) throw new AutonomyContractError(contract, '$.kind', 'pedestrian, bicycle, scooter, or car', embodiment.kind);
    if (!['runner', 'cycle', 'scooter', 'car'].includes(embodiment.renderProfile)) throw new AutonomyContractError(contract, '$.renderProfile', 'registered shared renderer profile', embodiment.renderProfile);
    const supportedTaskTypes = requireArray(embodiment.supportedTaskTypes, contract, '$.supportedTaskTypes', 1);
    requireExactStringSet(supportedTaskTypes, [...new Set(supportedTaskTypes)], contract, '$.supportedTaskTypes');
    supportedTaskTypes.forEach((task, index) => {
      if (!['delivery', 'point_to_point', 'loop'].includes(task)) throw new AutonomyContractError(contract, `$.supportedTaskTypes[${index}]`, 'registered task type', task);
    });
    const dimensions = requireObject(embodiment.dimensions, contract, '$.dimensions');
    const dynamics = requireObject(embodiment.dynamics, contract, '$.dynamics');
    ['lengthM', 'widthM', 'collisionRadiusM'].forEach((key) => requireFinite(dimensions[key], contract, `$.dimensions.${key}`, Number.MIN_VALUE));
    ['maximumSpeedMps', 'normalAccelerationMps2', 'strongAccelerationMps2', 'comfortableDecelerationMps2', 'emergencyDecelerationMps2', 'integrationStepSeconds']
      .forEach((key) => requireFinite(dynamics[key], contract, `$.dynamics.${key}`, Number.MIN_VALUE));
    requireArray(embodiment.requiredCapabilities, contract, '$.requiredCapabilities', 1);
    requireString(embodiment.claimBoundary, contract, '$.claimBoundary');
    return embodiment;
  }

  function validatePolicy(policy) {
    const contract = 'simulatte.autonomyPolicy.v1';
    requireSchema(policy, contract, contract);
    requireString(policy.id, contract, '$.id');
    requireArray(policy.candidateManeuvers, contract, '$.candidateManeuvers', 5);
    const requiredObjects = ['selection', 'rollout', 'route', 'safety', 'utility', 'confidence', 'settlement', 'runtime'];
    requiredObjects.forEach((key) => requireObject(policy[key], contract, `$.${key}`));
    if (!['evidence_scored', 'progress_only', 'seeded_eligible'].includes(policy.selection.approach)) {
      throw new AutonomyContractError(contract, '$.selection.approach', 'registered selection approach', policy.selection.approach);
    }
    requireInteger(policy.selection.seed, contract, '$.selection.seed');
    requireInteger(policy.rollout.horizonTicks, contract, '$.rollout.horizonTicks', 1);
    requireInteger(policy.runtime.maximumTicks, contract, '$.runtime.maximumTicks', 1);
    requireInteger(policy.runtime.maximumCandidatesPerTick, contract, '$.runtime.maximumCandidatesPerTick', 1);
    ['minimumPedestrianClearanceM', 'nearbyActorRadiusM', 'maximumSpeedToleranceMps']
      .forEach((key) => requireFinite(policy.safety[key], contract, `$.safety.${key}`, 0));
    requireInteger(policy.safety.lookaheadTicks, contract, '$.safety.lookaheadTicks', 1);
    ['requiresSignalCompliance', 'requiresModeEligibility', 'requiresNetworkContainment']
      .forEach((key) => requireBoolean(policy.safety[key], contract, `$.safety.${key}`));
    requireString(policy.claimBoundary, contract, '$.claimBoundary');
    return policy;
  }

  function validateMission(mission, world, embodiment) {
    const contract = 'simulatte.autonomyMission.v3';
    requireSchema(mission, contract, contract);
    requireString(mission.id, contract, '$.id');
    requireString(mission.sourceText, contract, '$.sourceText');
    if (mission.embodimentId !== embodiment.id) throw new AutonomyContractError(contract, '$.embodimentId', embodiment.id, mission.embodimentId);
    const nodeIds = new Set(world.nodes.map((row) => row.id));
    if (!nodeIds.has(mission.originNodeId)) throw new AutonomyContractError(contract, '$.originNodeId', 'known world node', mission.originNodeId);
    const task = requireObject(mission.task, contract, '$.task');
    if (!['delivery', 'point_to_point', 'loop'].includes(task.type)) throw new AutonomyContractError(contract, '$.task.type', 'delivery, point_to_point, or loop', task.type);
    if (!embodiment.supportedTaskTypes.includes(task.type)) throw new AutonomyContractError(contract, '$.task.type', `task supported by ${embodiment.id}`, task.type);
    const capability = requireObject(mission.capability, contract, '$.capability');
    requireExactValue(capability.schema, 'simulatte.autonomyCapabilityReceipt.v1', contract, '$.capability.schema');
    requireExactValue(capability.matrixSchema, 'simulatte.autonomyCapabilityMatrix.v1', contract, '$.capability.matrixSchema');
    requireExactValue(capability.embodimentId, embodiment.id, contract, '$.capability.embodimentId');
    requireExactValue(capability.embodimentKind, embodiment.kind, contract, '$.capability.embodimentKind');
    requireArray(capability.artifactIds, contract, '$.capability.artifactIds', 1);
    if (!capability.artifactIds.includes(embodiment.id)) throw new AutonomyContractError(contract, '$.capability.artifactIds', `include ${embodiment.id}`, capability.artifactIds);
    if (task.type !== 'loop') {
      requireExactValue(capability.missionFamily, task.type, contract, '$.capability.missionFamily');
      requireExactValue(capability.terminationKind, 'arrival', contract, '$.capability.terminationKind');
      requireExactValue(capability.circuitId, null, contract, '$.capability.circuitId');
      if (task.type === 'delivery') requireString(task.payloadId, contract, '$.task.payloadId');
      if (!nodeIds.has(mission.destinationNodeId)) throw new AutonomyContractError(contract, '$.destinationNodeId', 'known world node', mission.destinationNodeId);
      const stopNodeIds = requireArray(task.stopNodeIds, contract, '$.task.stopNodeIds', 1);
      if (stopNodeIds.some((id) => !nodeIds.has(id)) || stopNodeIds.at(-1) !== mission.destinationNodeId || stopNodeIds.some((id, index) => index > 0 && id === stopNodeIds[index - 1])) {
        throw new AutonomyContractError(contract, '$.task.stopNodeIds', 'known non-consecutive ordered stops ending at destination', stopNodeIds);
      }
      if (mission.grounding !== null) throw new AutonomyContractError(contract, '$.grounding', `null for ${task.type}`, mission.grounding);
    } else {
      requireExactValue(capability.missionFamily, 'closed_circuit', contract, '$.capability.missionFamily');
      if (mission.destinationNodeId !== null) throw new AutonomyContractError(contract, '$.destinationNodeId', 'null for loop', mission.destinationNodeId);
      requireString(task.circuitId, contract, '$.task.circuitId');
      if (!['run', 'walk', 'ride'].includes(task.gait)) throw new AutonomyContractError(contract, '$.task.gait', 'run, walk, or ride', task.gait);
      const circuit = (world.circuits || []).find((row) => row.id === task.circuitId);
      if (!circuit) throw new AutonomyContractError(contract, '$.task.circuitId', 'known world circuit', task.circuitId);
      requireExactValue(capability.circuitId, circuit.id, contract, '$.capability.circuitId');
      if (!capability.artifactIds.includes(circuit.id)) throw new AutonomyContractError(contract, '$.capability.artifactIds', `include ${circuit.id}`, capability.artifactIds);
      const termination = requireObject(task.termination, contract, '$.task.termination');
      if (!['distance', 'laps', 'duration'].includes(termination.kind)) throw new AutonomyContractError(contract, '$.task.termination.kind', 'distance, laps, or duration', termination.kind);
      requireExactValue(capability.terminationKind, termination.kind, contract, '$.capability.terminationKind');
      validateLoopTermination(termination, circuit, contract);
      const grounding = requireObject(mission.grounding, contract, '$.grounding');
      requireExactValue(grounding.circuitId, circuit.id, contract, '$.grounding.circuitId');
      requireExactValue(grounding.nodeIds, circuit.nodeIds, contract, '$.grounding.nodeIds');
      requireExactValue(grounding.segmentIds, circuit.segmentIds, contract, '$.grounding.segmentIds');
      requireExactValue(grounding.circuitLengthM, circuit.lengthM, contract, '$.grounding.circuitLengthM');
      requireExactValue(grounding.source, circuit.source, contract, '$.grounding.source');
      if (mission.originNodeId !== circuit.nodeIds[0]) throw new AutonomyContractError(contract, '$.originNodeId', circuit.nodeIds[0], mission.originNodeId);
      if (embodiment.mode !== circuit.mode) throw new AutonomyContractError(contract, '$.embodimentId', `mode ${circuit.mode}`, embodiment.mode);
    }
    const parser = requireObject(mission.parser, contract, '$.parser');
    if (!['deterministic_grounded_lexical', 'governed_hybrid_place_resolution'].includes(parser.kind)) {
      throw new AutonomyContractError(contract, '$.parser.kind', 'registered mission parser kind', parser.kind);
    }
    if (!['simulatte.autonomyMissionParser.v3', 'simulatte.autonomyMissionParser.v4'].includes(parser.version)) {
      throw new AutonomyContractError(contract, '$.parser.version', 'registered mission parser version', parser.version);
    }
    requireArray(parser.evidence, contract, '$.parser.evidence', 1).forEach((row, index) => {
      requireString(row.field, contract, `$.parser.evidence[${index}].field`);
      requireString(row.value, contract, `$.parser.evidence[${index}].value`);
      requireInteger(row.start, contract, `$.parser.evidence[${index}].start`);
      requireInteger(row.end, contract, `$.parser.evidence[${index}].end`, 1);
      requireString(row.method, contract, `$.parser.evidence[${index}].method`);
      requireInteger(row.editDistance, contract, `$.parser.evidence[${index}].editDistance`);
      if (mission.sourceText.slice(row.start, row.end) !== row.value) throw new AutonomyContractError(contract, `$.parser.evidence[${index}]`, 'exact source interval', row);
    });
    if (mission.placeResolution === null) {
      if (parser.kind !== 'deterministic_grounded_lexical') throw new AutonomyContractError(contract, '$.parser.kind', 'deterministic parser when placeResolution is null', parser.kind);
    } else {
      const resolution = requireObject(mission.placeResolution, contract, '$.placeResolution');
      requireExactValue(resolution.schema, 'simulatte.missionPlaceResolution.v1', contract, '$.placeResolution.schema');
      requireString(resolution.resolverId, contract, '$.placeResolution.resolverId');
      requireExactValue(resolution.lane, 'hybrid_lexical_extended_typo_qwen_embedding', contract, '$.placeResolution.lane');
      requireBoolean(resolution.modelExecution, contract, '$.placeResolution.modelExecution');
      requireArray(resolution.roles, contract, '$.placeResolution.roles', 1).forEach((row, index) => {
        if (!['origin', 'destination'].includes(row.role)) throw new AutonomyContractError(contract, `$.placeResolution.roles[${index}].role`, 'origin or destination', row.role);
        requireExactValue(row.outcome, 'resolve', contract, `$.placeResolution.roles[${index}].outcome`);
        if (!nodeIds.has(row.nodeId)) throw new AutonomyContractError(contract, `$.placeResolution.roles[${index}].nodeId`, 'known world node', row.nodeId);
        requireObject(row.evidence, contract, `$.placeResolution.roles[${index}].evidence`);
      });
      if (parser.kind !== 'governed_hybrid_place_resolution' || parser.version !== 'simulatte.autonomyMissionParser.v4') {
        throw new AutonomyContractError(contract, '$.parser', 'v4 governed hybrid parser for place resolution', parser);
      }
    }
    requireObject(mission.constraints, contract, '$.constraints');
    const avoidStreetNames = requireArray(mission.constraints.avoidStreetNames, contract, '$.constraints.avoidStreetNames');
    const governedStreetNames = new Set([
      ...world.segments.map((segment) => segment.source && segment.source.street),
      ...(world.renderGeometry?.streets || []).map((street) => street.name),
    ].filter(Boolean).map(normalizeStreetName));
    avoidStreetNames.forEach((name, index) => {
      requireString(name, contract, `$.constraints.avoidStreetNames[${index}]`);
      if (!governedStreetNames.has(normalizeStreetName(name))) throw new AutonomyContractError(contract, `$.constraints.avoidStreetNames[${index}]`, 'street in governed route or display geometry', name);
    });
    requireBoolean(mission.constraints.mustYieldToPedestrians, contract, '$.constraints.mustYieldToPedestrians');
    requireBoolean(mission.constraints.mustObeySignals, contract, '$.constraints.mustObeySignals');
    requireBoolean(mission.constraints.mustStayOnCircuit, contract, '$.constraints.mustStayOnCircuit');
    requireFinite(mission.constraints.maximumSpeedMps, contract, '$.constraints.maximumSpeedMps', Number.MIN_VALUE);
    if (mission.constraints.maximumDurationSeconds !== null) requireFinite(mission.constraints.maximumDurationSeconds, contract, '$.constraints.maximumDurationSeconds', Number.MIN_VALUE);
    requireInteger(mission.constraints.departureLocalMinutes, contract, '$.constraints.departureLocalMinutes');
    if (mission.constraints.departureLocalMinutes >= 1440) throw new AutonomyContractError(contract, '$.constraints.departureLocalMinutes', 'minute in local day', mission.constraints.departureLocalMinutes);
    if (mission.constraints.arrivalDeadlineLocalMinutes !== null) {
      requireInteger(mission.constraints.arrivalDeadlineLocalMinutes, contract, '$.constraints.arrivalDeadlineLocalMinutes');
      if (mission.constraints.arrivalDeadlineLocalMinutes >= 1440 || mission.constraints.arrivalDeadlineLocalMinutes <= mission.constraints.departureLocalMinutes) {
        throw new AutonomyContractError(contract, '$.constraints.arrivalDeadlineLocalMinutes', 'later minute in same local day', mission.constraints.arrivalDeadlineLocalMinutes);
      }
    }
    requireBoolean(mission.constraints.daylightOnly, contract, '$.constraints.daylightOnly');
    const daylightWindow = requireArray(mission.constraints.daylightWindowLocalMinutes, contract, '$.constraints.daylightWindowLocalMinutes', 2);
    if (daylightWindow.length !== 2 || !daylightWindow.every((row) => Number.isInteger(row) && row >= 0 && row < 1440) || daylightWindow[0] >= daylightWindow[1]) {
      throw new AutonomyContractError(contract, '$.constraints.daylightWindowLocalMinutes', 'ordered [sunrise,sunset] local minutes', daylightWindow);
    }
    requireArray(mission.obligations, contract, '$.obligations', 1);
    if (mission.economics !== null) {
      const economics = requireObject(mission.economics, contract, '$.economics');
      requireExactValue(economics.schema, 'simulatte.missionEconomics.v1', contract, '$.economics.schema');
      requireExactValue(economics.currency, 'USD', contract, '$.economics.currency');
      requireInteger(economics.amountCents, contract, '$.economics.amountCents', 1);
      requireString(economics.claimBoundary, contract, '$.economics.claimBoundary');
      if (task.type !== 'delivery') throw new AutonomyContractError(contract, '$.economics', 'null outside delivery tasks', economics);
    }
    requireInteger(mission.seed, contract, '$.seed');
    return mission;
  }

  function validateLoopTermination(termination, circuit, contract) {
    if (termination.kind === 'distance') {
      requireFinite(termination.targetDistanceM, contract, '$.task.termination.targetDistanceM', Number.MIN_VALUE);
      const requested = requireObject(termination.requestedDistance, contract, '$.task.termination.requestedDistance');
      requireFinite(requested.value, contract, '$.task.termination.requestedDistance.value', Number.MIN_VALUE);
      requireFinite(requested.metersPerUnit, contract, '$.task.termination.requestedDistance.metersPerUnit', Number.MIN_VALUE);
      requireFinite(requested.convertedMeters, contract, '$.task.termination.requestedDistance.convertedMeters', Number.MIN_VALUE);
      if (Math.abs(requested.value * requested.metersPerUnit - requested.convertedMeters) > 0.000001 || requested.convertedMeters !== termination.targetDistanceM) {
        throw new AutonomyContractError(contract, '$.task.termination.requestedDistance', 'exact conversion to targetDistanceM', requested);
      }
      return;
    }
    if (termination.kind === 'laps') {
      requireInteger(termination.targetLaps, contract, '$.task.termination.targetLaps', 1);
      requireFinite(termination.targetDistanceM, contract, '$.task.termination.targetDistanceM', Number.MIN_VALUE);
      if (Math.abs(termination.targetLaps * circuit.lengthM - termination.targetDistanceM) > 0.000001) {
        throw new AutonomyContractError(contract, '$.task.termination.targetDistanceM', 'targetLaps multiplied by circuit length', termination.targetDistanceM);
      }
      return;
    }
    requireFinite(termination.targetDurationSeconds, contract, '$.task.termination.targetDurationSeconds', Number.MIN_VALUE);
    const requested = requireObject(termination.requestedDuration, contract, '$.task.termination.requestedDuration');
    requireFinite(requested.value, contract, '$.task.termination.requestedDuration.value', Number.MIN_VALUE);
    requireFinite(requested.secondsPerUnit, contract, '$.task.termination.requestedDuration.secondsPerUnit', Number.MIN_VALUE);
    requireFinite(requested.convertedSeconds, contract, '$.task.termination.requestedDuration.convertedSeconds', Number.MIN_VALUE);
    if (Math.abs(requested.value * requested.secondsPerUnit - requested.convertedSeconds) > 0.000001 || requested.convertedSeconds !== termination.targetDurationSeconds) {
      throw new AutonomyContractError(contract, '$.task.termination.requestedDuration', 'exact conversion to targetDurationSeconds', requested);
    }
  }

  function validateObservation(observation) {
    const contract = 'simulatte.autonomyObservation.v2';
    requireSchema(observation, contract, contract);
    requireInteger(observation.tick, contract, '$.tick');
    requireObject(observation.agent, contract, '$.agent');
    requireObject(observation.route, contract, '$.route');
    requireArray(observation.route.segmentIds, contract, '$.route.segmentIds');
    requireArray(observation.signals, contract, '$.signals');
    requireArray(observation.nearbyActors, contract, '$.nearbyActors');
    requireArray(observation.blockedSegmentIds, contract, '$.blockedSegmentIds');
    requireObject(observation.policyMemory, contract, '$.policyMemory');
    const retrieval = requireObject(observation.featureRetrieval, contract, '$.featureRetrieval');
    if (retrieval.schema !== 'simulatte.autonomyFeatureRetrieval.v2') {
      throw new AutonomyContractError(contract, '$.featureRetrieval.schema', 'simulatte.autonomyFeatureRetrieval.v2', retrieval.schema);
    }
    requireExactValue(retrieval.method, 'deterministic_lexical_inverted_scan_v1', contract, '$.featureRetrieval.method');
    requireExactValue(retrieval.reranker, 'typed_evidence_reranker_v1', contract, '$.featureRetrieval.reranker');
    const modelExecution = requireObject(retrieval.modelExecution, contract, '$.featureRetrieval.modelExecution');
    const embeddingExecution = requireObject(modelExecution.embedding, contract, '$.featureRetrieval.modelExecution.embedding');
    const rerankerExecution = requireObject(modelExecution.neuralReranker, contract, '$.featureRetrieval.modelExecution.neuralReranker');
    requireExactValue(embeddingExecution.executed, false, contract, '$.featureRetrieval.modelExecution.embedding.executed');
    requireExactValue(embeddingExecution.modelId, null, contract, '$.featureRetrieval.modelExecution.embedding.modelId');
    requireExactValue(rerankerExecution.executed, false, contract, '$.featureRetrieval.modelExecution.neuralReranker.executed');
    requireExactValue(rerankerExecution.modelId, null, contract, '$.featureRetrieval.modelExecution.neuralReranker.modelId');
    requireExactValue(modelExecution.sharedModelRegistryPath, '/data/simulatte-embedder/model-runtime-lock.json', contract, '$.featureRetrieval.modelExecution.sharedModelRegistryPath');
    requireExactValue(modelExecution.registryScope, 'blank_compiler_only', contract, '$.featureRetrieval.modelExecution.registryScope');
    requireString(modelExecution.claimBoundary, contract, '$.featureRetrieval.modelExecution.claimBoundary');
    requireArray(retrieval.queryRows, contract, '$.featureRetrieval.queryRows', 1);
    requireArray(retrieval.retrievedRows, contract, '$.featureRetrieval.retrievedRows', 1);
    requireArray(retrieval.rerankedRows, contract, '$.featureRetrieval.rerankedRows', 1);
    requireArray(retrieval.selectedCardIds, contract, '$.featureRetrieval.selectedCardIds', 1);
    validateOccurrenceReceipt(observation.occurrenceReceipt);
    return observation;
  }

  function validateOccurrenceReceipt(receipt) {
    const contract = 'simulatte.autonomyOccurrenceReceipt.v1';
    requireSchema(receipt, contract, contract);
    if (receipt.catalogId !== null) requireString(receipt.catalogId, contract, '$.catalogId');
    requireInteger(receipt.tick, contract, '$.tick');
    requireInteger(receipt.eventCount, contract, '$.eventCount');
    requireArray(receipt.activePatternIds, contract, '$.activePatternIds');
    requireArray(receipt.evaluations, contract, '$.evaluations');
    const effects = requireObject(receipt.effects, contract, '$.effects');
    ['signalStates', 'actorStates', 'activeActorIds', 'controlledActorIds', 'blockedSegmentIds', 'annotations']
      .forEach((key) => requireArray(effects[key], contract, `$.effects.${key}`));
    requireArray(receipt.conflicts, contract, '$.conflicts');
    requireString(receipt.resolutionRule, contract, '$.resolutionRule');
    return receipt;
  }

  function validateBet(bet) {
    const contract = 'simulatte.autonomyActionBet.v2';
    requireSchema(bet, contract, contract);
    requireString(bet.id, contract, '$.id');
    requireInteger(bet.tick, contract, '$.tick');
    requireObject(bet.action, contract, '$.action');
    requireObject(bet.prediction, contract, '$.prediction');
    requireFinite(bet.confidence, contract, '$.confidence', 0);
    if (bet.confidence > 1) throw new AutonomyContractError(contract, '$.confidence', 'number <= 1', bet.confidence);
    requireObject(bet.scoreStake, contract, '$.scoreStake');
    return bet;
  }

  function validateSettlement(settlement) {
    const contract = 'simulatte.autonomyBetSettlement.v1';
    requireSchema(settlement, contract, contract);
    requireString(settlement.betId, contract, '$.betId');
    requireInteger(settlement.tick, contract, '$.tick');
    requireObject(settlement.prediction, contract, '$.prediction');
    requireObject(settlement.observed, contract, '$.observed');
    requireObject(settlement.errors, contract, '$.errors');
    if (!['won', 'lost', 'void'].includes(settlement.verdict)) {
      throw new AutonomyContractError(contract, '$.verdict', 'won, lost, or void', settlement.verdict);
    }
    return settlement;
  }


  return Object.freeze({
    validateEmbodiment,
    validatePolicy,
    validateMission,
    validateObservation,
    validateOccurrenceReceipt,
    validateBet,
    validateSettlement,
  });
});
