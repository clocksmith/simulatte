(function attachAutonomyContractValidator(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyContractValidator() {
  class AutonomyContractError extends Error {
    constructor(contract, path, expected, received) {
      super(`${contract} contract at ${path} expected ${expected}, received ${describe(received)}`);
      this.name = 'AutonomyContractError';
      this.contract = contract;
      this.path = path;
      this.expected = expected;
      this.received = received;
    }
  }

  function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === 'string') return JSON.stringify(value);
    return typeof value;
  }

  function requireObject(value, contract, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AutonomyContractError(contract, path, 'object', value);
    }
    return value;
  }

  function requireArray(value, contract, path, minimum = 0) {
    if (!Array.isArray(value) || value.length < minimum) {
      throw new AutonomyContractError(contract, path, `array with at least ${minimum} row(s)`, value);
    }
    return value;
  }

  function requireString(value, contract, path) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new AutonomyContractError(contract, path, 'non-empty string', value);
    }
    return value;
  }

  function requireFinite(value, contract, path, minimum = -Infinity) {
    if (!Number.isFinite(value) || value < minimum) {
      throw new AutonomyContractError(contract, path, `finite number >= ${minimum}`, value);
    }
    return value;
  }

  function requireInteger(value, contract, path, minimum = 0) {
    if (!Number.isInteger(value) || value < minimum) {
      throw new AutonomyContractError(contract, path, `integer >= ${minimum}`, value);
    }
    return value;
  }

  function requireBoolean(value, contract, path) {
    if (typeof value !== 'boolean') {
      throw new AutonomyContractError(contract, path, 'boolean', value);
    }
    return value;
  }

  function requireSchema(value, expected, contract) {
    requireObject(value, contract, '$');
    if (value.schema !== expected) {
      throw new AutonomyContractError(contract, '$.schema', expected, value.schema);
    }
  }

  function uniqueRows(rows, contract, path) {
    const seen = new Set();
    rows.forEach((row, index) => {
      const id = requireString(row && row.id, contract, `${path}[${index}].id`);
      if (seen.has(id)) throw new AutonomyContractError(contract, `${path}[${index}].id`, 'unique id', id);
      seen.add(id);
    });
    return seen;
  }

  function validateManifest(manifest) {
    const contract = 'simulatte.autonomyDataManifest.v1';
    requireSchema(manifest, contract, contract);
    requireString(manifest.id, contract, '$.id');
    requireString(manifest.contentVersion, contract, '$.contentVersion');
    requireString(manifest.defaultMissionText, contract, '$.defaultMissionText');
    ['world', 'embodiment', 'policy', 'featureCatalog'].forEach((key) => {
      const ref = requireObject(manifest[key], contract, `$.${key}`);
      requireString(ref.id, contract, `$.${key}.id`);
      requireString(ref.path, contract, `$.${key}.path`);
      if (!/^[a-f0-9]{64}$/.test(ref.sha256 || '')) {
        throw new AutonomyContractError(contract, `$.${key}.sha256`, '64-character lowercase SHA-256', ref.sha256);
      }
    });
    requireString(manifest.claimBoundary, contract, '$.claimBoundary');
    return manifest;
  }

  function validateFeatureCatalog(catalog) {
    const contract = 'simulatte.autonomyFeatureCatalog.v1';
    requireSchema(catalog, contract, contract);
    const cards = requireArray(catalog.cards, contract, '$.cards', 1);
    uniqueRows(cards, contract, '$.cards');
    cards.forEach((card, index) => {
      requireString(card.kind, contract, `$.cards[${index}].kind`);
      requireArray(card.constraints, contract, `$.cards[${index}].constraints`, 1);
      requireArray(card.validationObligations, contract, `$.cards[${index}].validationObligations`, 1);
    });
    return catalog;
  }

  function validateWorld(world, catalog) {
    const contract = 'simulatte.autonomyWorld.v1';
    requireSchema(world, contract, contract);
    requireString(world.id, contract, '$.id');
    requireString(world.contentVersion, contract, '$.contentVersion');
    const nodes = requireArray(world.nodes, contract, '$.nodes', 2);
    const segments = requireArray(world.segments, contract, '$.segments', 1);
    const nodeIds = uniqueRows(nodes, contract, '$.nodes');
    const segmentIds = uniqueRows(segments, contract, '$.segments');
    const cardIds = catalog ? uniqueRows(catalog.cards, contract, '$.featureCatalog.cards') : null;
    nodes.forEach((node, index) => {
      requireString(node.label, contract, `$.nodes[${index}].label`);
      const position = requireObject(node.position, contract, `$.nodes[${index}].position`);
      requireFinite(position.x, contract, `$.nodes[${index}].position.x`);
      requireFinite(position.y, contract, `$.nodes[${index}].position.y`);
    });
    segments.forEach((segment, index) => {
      if (!nodeIds.has(segment.fromNodeId) || !nodeIds.has(segment.toNodeId)) {
        throw new AutonomyContractError(contract, `$.segments[${index}]`, 'existing endpoint node IDs', segment);
      }
      const geometry = requireArray(segment.geometry, contract, `$.segments[${index}].geometry`, 2);
      geometry.forEach((point, pointIndex) => {
        requireFinite(point && point.x, contract, `$.segments[${index}].geometry[${pointIndex}].x`);
        requireFinite(point && point.y, contract, `$.segments[${index}].geometry[${pointIndex}].y`);
      });
      const fromPosition = nodes.find((row) => row.id === segment.fromNodeId).position;
      const toPosition = nodes.find((row) => row.id === segment.toNodeId).position;
      if (pointDistance(geometry[0], fromPosition) > 0.001 || pointDistance(geometry.at(-1), toPosition) > 0.001) {
        throw new AutonomyContractError(contract, `$.segments[${index}].geometry`, 'geometry endpoints matching referenced node positions', geometry);
      }
      requireFinite(segment.lengthM, contract, `$.segments[${index}].lengthM`, Number.MIN_VALUE);
      requireFinite(segment.speedLimitMps, contract, `$.segments[${index}].speedLimitMps`, Number.MIN_VALUE);
      requireArray(segment.allowedModes, contract, `$.segments[${index}].allowedModes`, 1);
      validateCardReferences(segment.cardIds, cardIds, contract, `$.segments[${index}].cardIds`);
    });
    const signals = requireArray(world.signals, contract, '$.signals');
    uniqueRows(signals, contract, '$.signals');
    signals.forEach((signal, index) => {
      requireString(signal.id, contract, `$.signals[${index}].id`);
      if (!nodeIds.has(signal.nodeId)) throw new AutonomyContractError(contract, `$.signals[${index}].nodeId`, 'existing node ID', signal.nodeId);
      requireInteger(signal.cycleTicks, contract, `$.signals[${index}].cycleTicks`, 1);
      requireInteger(signal.greenTickCount, contract, `$.signals[${index}].greenTickCount`, 1);
      if (signal.greenTickCount >= signal.cycleTicks) {
        throw new AutonomyContractError(contract, `$.signals[${index}].greenTickCount`, 'less than cycleTicks', signal.greenTickCount);
      }
      requireArray(signal.controlledOutgoingSegmentIds, contract, `$.signals[${index}].controlledOutgoingSegmentIds`, 1)
        .forEach((id) => {
          if (!segmentIds.has(id)) throw new AutonomyContractError(contract, `$.signals[${index}]`, 'existing segment ID', id);
        });
      validateCardReferences(signal.cardIds, cardIds, contract, `$.signals[${index}].cardIds`);
    });
    const actors = requireArray(world.actors, contract, '$.actors');
    uniqueRows(actors, contract, '$.actors');
    actors.forEach((actor, index) => {
      requireString(actor.id, contract, `$.actors[${index}].id`);
      requireInteger(actor.activeFromTick, contract, `$.actors[${index}].activeFromTick`);
      requireInteger(actor.activeUntilTick, contract, `$.actors[${index}].activeUntilTick`);
      if (actor.activeUntilTick <= actor.activeFromTick) {
        throw new AutonomyContractError(contract, `$.actors[${index}]`, 'activeUntilTick greater than activeFromTick', actor);
      }
      requireArray(actor.path, contract, `$.actors[${index}].path`, 2).forEach((point, pointIndex) => {
        requireFinite(point && point.x, contract, `$.actors[${index}].path[${pointIndex}].x`);
        requireFinite(point && point.y, contract, `$.actors[${index}].path[${pointIndex}].y`);
      });
      validateCardReferences(actor.cardIds, cardIds, contract, `$.actors[${index}].cardIds`);
    });
    const disruptions = requireArray(world.disruptions, contract, '$.disruptions');
    uniqueRows(disruptions, contract, '$.disruptions');
    disruptions.forEach((row, index) => {
      requireString(row.id, contract, `$.disruptions[${index}].id`);
      if (!segmentIds.has(row.segmentId)) throw new AutonomyContractError(contract, `$.disruptions[${index}].segmentId`, 'existing segment ID', row.segmentId);
      requireInteger(row.activeFromTick, contract, `$.disruptions[${index}].activeFromTick`);
      requireInteger(row.activeUntilTick, contract, `$.disruptions[${index}].activeUntilTick`);
      validateCardReferences(row.cardIds, cardIds, contract, `$.disruptions[${index}].cardIds`);
    });
    return world;
  }

  function pointDistance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function validateCardReferences(rows, cardIds, contract, path) {
    requireArray(rows, contract, path, 1).forEach((id, index) => {
      requireString(id, contract, `${path}[${index}]`);
      if (cardIds && !cardIds.has(id)) throw new AutonomyContractError(contract, `${path}[${index}]`, 'known feature card ID', id);
    });
  }

  function validateEmbodiment(embodiment) {
    const contract = 'simulatte.autonomyEmbodiment.v1';
    requireSchema(embodiment, contract, contract);
    if (embodiment.id !== 'delivery-bike-v1' || embodiment.mode !== 'delivery_bike') {
      throw new AutonomyContractError(contract, '$.id/mode', 'delivery-bike-v1/delivery_bike', `${embodiment.id}/${embodiment.mode}`);
    }
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
    const contract = 'simulatte.autonomyMission.v1';
    requireSchema(mission, contract, contract);
    requireString(mission.id, contract, '$.id');
    requireString(mission.sourceText, contract, '$.sourceText');
    if (mission.embodimentId !== embodiment.id) throw new AutonomyContractError(contract, '$.embodimentId', embodiment.id, mission.embodimentId);
    const nodeIds = new Set(world.nodes.map((row) => row.id));
    if (!nodeIds.has(mission.originNodeId)) throw new AutonomyContractError(contract, '$.originNodeId', 'known world node', mission.originNodeId);
    if (!nodeIds.has(mission.destinationNodeId)) throw new AutonomyContractError(contract, '$.destinationNodeId', 'known world node', mission.destinationNodeId);
    requireObject(mission.constraints, contract, '$.constraints');
    requireBoolean(mission.constraints.mustYieldToPedestrians, contract, '$.constraints.mustYieldToPedestrians');
    requireBoolean(mission.constraints.mustObeySignals, contract, '$.constraints.mustObeySignals');
    requireFinite(mission.constraints.maximumSpeedMps, contract, '$.constraints.maximumSpeedMps', Number.MIN_VALUE);
    requireArray(mission.obligations, contract, '$.obligations', 1);
    requireInteger(mission.seed, contract, '$.seed');
    return mission;
  }

  function validateObservation(observation) {
    const contract = 'simulatte.autonomyObservation.v1';
    requireSchema(observation, contract, contract);
    requireInteger(observation.tick, contract, '$.tick');
    requireObject(observation.agent, contract, '$.agent');
    requireObject(observation.route, contract, '$.route');
    requireArray(observation.route.segmentIds, contract, '$.route.segmentIds');
    requireArray(observation.signals, contract, '$.signals');
    requireArray(observation.nearbyActors, contract, '$.nearbyActors');
    requireArray(observation.blockedSegmentIds, contract, '$.blockedSegmentIds');
    requireObject(observation.policyMemory, contract, '$.policyMemory');
    return observation;
  }

  function validateBet(bet) {
    const contract = 'simulatte.autonomyActionBet.v1';
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

  return {
    AutonomyContractError,
    validateManifest,
    validateFeatureCatalog,
    validateWorld,
    validateEmbodiment,
    validatePolicy,
    validateMission,
    validateObservation,
    validateBet,
    validateSettlement,
  };
});
