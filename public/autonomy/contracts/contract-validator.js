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
    ['world', 'embodiment', 'policy', 'featureCatalog', 'occurrenceCatalog', 'rerankerEvidence'].forEach((key) => {
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
      requireArray(card.searchTerms, contract, `$.cards[${index}].searchTerms`, 2)
        .forEach((term, termIndex) => requireString(term, contract, `$.cards[${index}].searchTerms[${termIndex}]`));
      const provenance = requireObject(card.provenance, contract, `$.cards[${index}].provenance`);
      requireString(provenance.sourceKind, contract, `$.cards[${index}].provenance.sourceKind`);
      requireString(provenance.sourceId, contract, `$.cards[${index}].provenance.sourceId`);
    });
    const cardIds = new Set(cards.map((row) => row.id));
    const index = requireObject(catalog.index, contract, '$.index');
    if (index.schema !== 'simulatte.autonomyFeatureIndex.v1') throw new AutonomyContractError(contract, '$.index.schema', 'simulatte.autonomyFeatureIndex.v1', index.schema);
    if (index.cardCount !== cards.length) throw new AutonomyContractError(contract, '$.index.cardCount', `exact card count ${cards.length}`, index.cardCount);
    requireString(index.method, contract, '$.index.method');
    requireObject(index.tokenToCardIds, contract, '$.index.tokenToCardIds');
    requireObject(index.kindToCardIds, contract, '$.index.kindToCardIds');
    Object.entries(index.tokenToCardIds).forEach(([token, ids]) => validateIndexIds(token, ids, cardIds, contract, '$.index.tokenToCardIds'));
    Object.entries(index.kindToCardIds).forEach(([kind, ids]) => validateIndexIds(kind, ids, cardIds, contract, '$.index.kindToCardIds'));
    const reranker = requireObject(catalog.rerankerPolicy, contract, '$.rerankerPolicy');
    requireString(reranker.id, contract, '$.rerankerPolicy.id');
    const weights = requireObject(reranker.weights, contract, '$.rerankerPolicy.weights');
    ['kindMatch', 'constraintMatch', 'exactReference'].forEach((key) => requireFinite(weights[key], contract, `$.rerankerPolicy.weights.${key}`, 0));
    requireString(reranker.control, contract, '$.rerankerPolicy.control');
    requireString(reranker.promotionRule, contract, '$.rerankerPolicy.promotionRule');
    return catalog;
  }

  function validateIndexIds(key, ids, cardIds, contract, path) {
    requireString(key, contract, `${path} key`);
    requireArray(ids, contract, `${path}.${key}`, 1).forEach((id, index) => {
      if (!cardIds.has(id)) throw new AutonomyContractError(contract, `${path}.${key}[${index}]`, 'known feature card ID', id);
    });
  }

  function validateOccurrenceCatalog(catalog, world) {
    const contract = 'simulatte.autonomyOccurrenceCatalog.v1';
    requireSchema(catalog, contract, contract);
    requireString(catalog.id, contract, '$.id');
    requireString(catalog.contentVersion, contract, '$.contentVersion');
    const plugins = requireArray(catalog.plugins, contract, '$.plugins', 1);
    const pluginIds = uniqueRows(plugins, contract, '$.plugins');
    const supportedPluginIds = new Set(['time.periodic-phase.v1', 'time.window.v1', 'event.window.v1']);
    plugins.forEach((plugin, index) => {
      if (!supportedPluginIds.has(plugin.id)) throw new AutonomyContractError(contract, `$.plugins[${index}].id`, 'supported occurrence plugin ID', plugin.id);
      requireString(plugin.triggerKind, contract, `$.plugins[${index}].triggerKind`);
      requireString(plugin.description, contract, `$.plugins[${index}].description`);
    });
    const signalIds = new Set((world?.signals || []).map((row) => row.id));
    const actorIds = new Set((world?.actors || []).map((row) => row.id));
    const segmentIds = new Set((world?.segments || []).map((row) => row.id));
    const patterns = requireArray(catalog.patterns, contract, '$.patterns', 1);
    uniqueRows(patterns, contract, '$.patterns');
    patterns.forEach((pattern, index) => {
      if (!pluginIds.has(pattern.pluginId)) throw new AutonomyContractError(contract, `$.patterns[${index}].pluginId`, 'declared plugin ID', pattern.pluginId);
      requireInteger(pattern.priority, contract, `$.patterns[${index}].priority`);
      const trigger = requireObject(pattern.trigger, contract, `$.patterns[${index}].trigger`);
      validateOccurrenceTrigger(pattern.pluginId, trigger, contract, `$.patterns[${index}].trigger`);
      const effect = requireObject(pattern.effect, contract, `$.patterns[${index}].effect`);
      validateOccurrenceEffect(effect, { signalIds, actorIds, segmentIds }, contract, `$.patterns[${index}].effect`);
      const provenance = requireObject(pattern.provenance, contract, `$.patterns[${index}].provenance`);
      requireString(provenance.kind, contract, `$.patterns[${index}].provenance.kind`);
      requireString(provenance.source, contract, `$.patterns[${index}].provenance.source`);
      requireBoolean(provenance.isObservedHistory, contract, `$.patterns[${index}].provenance.isObservedHistory`);
    });
    const resolution = requireObject(catalog.resolution, contract, '$.resolution');
    requireString(resolution.rule, contract, '$.resolution.rule');
    requireString(resolution.unknownPluginBehavior, contract, '$.resolution.unknownPluginBehavior');
    requireString(resolution.conflictBehavior, contract, '$.resolution.conflictBehavior');
    requireString(catalog.claimBoundary, contract, '$.claimBoundary');
    return catalog;
  }

  function validateRerankerEvidence(evidence, featureCatalog, governedHashes = null) {
    const contract = 'simulatte.autonomyRerankerEvaluation.v1';
    requireSchema(evidence, contract, contract);
    requireString(evidence.id, contract, '$.id');
    requireString(evidence.contentVersion, contract, '$.contentVersion');
    const population = requireObject(evidence.population, contract, '$.population');
    requireBoolean(population.promotionEligible, contract, '$.population.promotionEligible');
    if (population.promotionEligible) throw new AutonomyContractError(contract, '$.population.promotionEligible', 'false for public diagnostic evidence', true);
    const intervention = requireObject(evidence.intervention, contract, '$.intervention');
    const weights = requireObject(intervention.weights, contract, '$.intervention.weights');
    Object.entries(featureCatalog.rerankerPolicy.weights).forEach(([key, value]) => {
      if (weights[key] !== value) throw new AutonomyContractError(contract, `$.intervention.weights.${key}`, `catalog value ${value}`, weights[key]);
    });
    if (governedHashes) {
      const identities = requireObject(evidence.identities, contract, '$.identities');
      Object.entries(governedHashes).forEach(([key, expectedHash]) => {
        const identity = requireObject(identities[key], contract, `$.identities.${key}`);
        if (identity.sha256 !== expectedHash) throw new AutonomyContractError(contract, `$.identities.${key}.sha256`, expectedHash, identity.sha256);
      });
    }
    const control = validateRankingMetrics(evidence.control, contract, '$.control');
    const challenger = validateRankingMetrics(evidence.challenger, contract, '$.challenger');
    requireBoolean(evidence.accepted, contract, '$.accepted');
    if (!evidence.accepted || challenger.meanReciprocalRank <= control.meanReciprocalRank || challenger.recallAt5 < control.recallAt5) {
      throw new AutonomyContractError(contract, '$', 'accepted MRR improvement with Recall@5 non-regression', evidence);
    }
    requireArray(evidence.judgments, contract, '$.judgments', 1);
    requireString(evidence.claimBoundary, contract, '$.claimBoundary');
    return evidence;
  }

  function validateRankingMetrics(metrics, contract, path) {
    const row = requireObject(metrics, contract, path);
    requireInteger(row.judgmentCount, contract, `${path}.judgmentCount`, 1);
    requireFinite(row.meanReciprocalRank, contract, `${path}.meanReciprocalRank`, 0);
    requireFinite(row.recallAt5, contract, `${path}.recallAt5`, 0);
    if (row.meanReciprocalRank > 1 || row.recallAt5 > 1) throw new AutonomyContractError(contract, path, 'ranking metrics between zero and one', row);
    return row;
  }

  function validateOccurrenceTrigger(pluginId, trigger, contract, path) {
    if (pluginId === 'time.periodic-phase.v1') {
      requireInteger(trigger.phaseOffsetTicks, contract, `${path}.phaseOffsetTicks`);
      requireArray(trigger.phases, contract, `${path}.phases`, 2).forEach((phase, index) => {
        requireString(phase && phase.id, contract, `${path}.phases[${index}].id`);
        requireString(phase && phase.value, contract, `${path}.phases[${index}].value`);
        requireInteger(phase && phase.durationTicks, contract, `${path}.phases[${index}].durationTicks`, 1);
      });
    } else if (pluginId === 'time.window.v1') {
      requireInteger(trigger.startTick, contract, `${path}.startTick`);
      requireInteger(trigger.endTickInclusive, contract, `${path}.endTickInclusive`);
      if (trigger.endTickInclusive < trigger.startTick) throw new AutonomyContractError(contract, path, 'end tick at or after start tick', trigger);
    } else if (pluginId === 'event.window.v1') {
      requireString(trigger.eventKind, contract, `${path}.eventKind`);
      requireInteger(trigger.durationTicks, contract, `${path}.durationTicks`, 1);
      requireInteger(trigger.delayTicks, contract, `${path}.delayTicks`);
      requireInteger(trigger.occurrenceIndex, contract, `${path}.occurrenceIndex`);
      if (trigger.sourceId !== undefined && trigger.sourceId !== null) requireString(trigger.sourceId, contract, `${path}.sourceId`);
    }
  }

  function validateOccurrenceEffect(effect, identities, contract, path) {
    const effectTypes = new Set(['signal_state', 'actor_active', 'blocked_segment', 'annotation']);
    if (!effectTypes.has(effect.type)) throw new AutonomyContractError(contract, `${path}.type`, 'supported occurrence effect', effect.type);
    if (effect.type === 'signal_state' && !identities.signalIds.has(effect.targetId)) {
      throw new AutonomyContractError(contract, `${path}.targetId`, 'known world signal ID', effect.targetId);
    }
    if (effect.type === 'actor_active' && !identities.actorIds.has(effect.targetId)) {
      throw new AutonomyContractError(contract, `${path}.targetId`, 'known world actor ID', effect.targetId);
    }
    if (effect.type === 'actor_active' && effect.value !== true) {
      throw new AutonomyContractError(contract, `${path}.value`, 'true for actor activation', effect.value);
    }
    if (effect.type === 'blocked_segment' && !identities.segmentIds.has(effect.targetId)) {
      throw new AutonomyContractError(contract, `${path}.targetId`, 'known world segment ID', effect.targetId);
    }
    if (effect.type === 'annotation') requireString(effect.value, contract, `${path}.value`);
  }

  function validateWorld(world, catalog) {
    const contract = 'simulatte.autonomyWorld.v1';
    requireSchema(world, contract, contract);
    requireString(world.id, contract, '$.id');
    requireString(world.contentVersion, contract, '$.contentVersion');
    const provenance = requireObject(world.provenance, contract, '$.provenance');
    requireString(provenance.sourceKind, contract, '$.provenance.sourceKind');
    requireString(provenance.snapshotDate, contract, '$.provenance.snapshotDate');
    requireString(provenance.claimBoundary, contract, '$.provenance.claimBoundary');
    if (provenance.sources !== undefined) {
      const sources = requireObject(provenance.sources, contract, '$.provenance.sources');
      Object.entries(sources).forEach(([key, source]) => {
        requireString(source.id, contract, `$.provenance.sources.${key}.id`);
        requireString(source.authority, contract, `$.provenance.sources.${key}.authority`);
        if (!/^[a-f0-9]{64}$/.test(source.rawSha256 || '')) throw new AutonomyContractError(contract, `$.provenance.sources.${key}.rawSha256`, '64-character lowercase SHA-256', source.rawSha256);
        requireInteger(source.rawByteCount, contract, `$.provenance.sources.${key}.rawByteCount`, 1);
      });
    }
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
    if (world.renderGeometry !== undefined) validateRenderGeometry(world.renderGeometry, contract);
    if (world.scenario !== undefined) {
      const scenario = requireObject(world.scenario, contract, '$.scenario');
      requireString(scenario.defaultMissionText, contract, '$.scenario.defaultMissionText');
      const defaultRoute = requireObject(scenario.defaultRoute, contract, '$.scenario.defaultRoute');
      requireArray(defaultRoute.nodeIds, contract, '$.scenario.defaultRoute.nodeIds', 2).forEach((id, index) => {
        if (!nodeIds.has(id)) throw new AutonomyContractError(contract, `$.scenario.defaultRoute.nodeIds[${index}]`, 'known node ID', id);
      });
      requireArray(defaultRoute.segmentIds, contract, '$.scenario.defaultRoute.segmentIds', 1).forEach((id, index) => {
        if (!segmentIds.has(id)) throw new AutonomyContractError(contract, `$.scenario.defaultRoute.segmentIds[${index}]`, 'known segment ID', id);
      });
      requireFinite(defaultRoute.distanceM, contract, '$.scenario.defaultRoute.distanceM', Number.MIN_VALUE);
    }
    return world;
  }

  function validateRenderGeometry(renderGeometry, contract) {
    requireObject(renderGeometry, contract, '$.renderGeometry');
    if (renderGeometry.schema !== 'simulatte.autonomyRenderGeometry.v1') {
      throw new AutonomyContractError(contract, '$.renderGeometry.schema', 'simulatte.autonomyRenderGeometry.v1', renderGeometry.schema);
    }
    const land = requireArray(renderGeometry.land, contract, '$.renderGeometry.land', 1);
    const streets = requireArray(renderGeometry.streets, contract, '$.renderGeometry.streets', 1);
    const buildings = requireArray(renderGeometry.buildings, contract, '$.renderGeometry.buildings', 1);
    const facilities = requireArray(renderGeometry.bikeFacilities, contract, '$.renderGeometry.bikeFacilities', 1);
    uniqueRows(land, contract, '$.renderGeometry.land');
    uniqueRows(streets, contract, '$.renderGeometry.streets');
    uniqueRows(buildings, contract, '$.renderGeometry.buildings');
    uniqueRows(facilities, contract, '$.renderGeometry.bikeFacilities');
    land.forEach((row, index) => validatePointArray(row.outerRing, contract, `$.renderGeometry.land[${index}].outerRing`, 4));
    streets.forEach((row, index) => {
      requireFinite(row.widthM, contract, `$.renderGeometry.streets[${index}].widthM`, Number.MIN_VALUE);
      validatePointArray(row.geometry, contract, `$.renderGeometry.streets[${index}].geometry`, 2);
    });
    facilities.forEach((row, index) => validatePointArray(row.geometry, contract, `$.renderGeometry.bikeFacilities[${index}].geometry`, 2));
    buildings.forEach((row, index) => {
      requireFinite(row.heightM, contract, `$.renderGeometry.buildings[${index}].heightM`, Number.MIN_VALUE);
      validatePointArray(row.footprint, contract, `$.renderGeometry.buildings[${index}].footprint`, 4);
    });
    if (renderGeometry.buildingLodReceipt !== undefined) {
      const lod = requireObject(renderGeometry.buildingLodReceipt, contract, '$.renderGeometry.buildingLodReceipt');
      requireInteger(lod.sourceFeatureCount, contract, '$.renderGeometry.buildingLodReceipt.sourceFeatureCount', 1);
      requireInteger(lod.retainedFeatureCount, contract, '$.renderGeometry.buildingLodReceipt.retainedFeatureCount', 1);
      requireInteger(lod.omittedFeatureCount, contract, '$.renderGeometry.buildingLodReceipt.omittedFeatureCount');
      requireBoolean(lod.fullCoverageClaim, contract, '$.renderGeometry.buildingLodReceipt.fullCoverageClaim');
      if (lod.retainedFeatureCount !== buildings.length || lod.sourceFeatureCount !== lod.retainedFeatureCount + lod.omittedFeatureCount) {
        throw new AutonomyContractError(contract, '$.renderGeometry.buildingLodReceipt', 'counts matching retained geometry and source total', lod);
      }
    }
    requireString(renderGeometry.claimBoundary, contract, '$.renderGeometry.claimBoundary');
  }

  function validatePointArray(points, contract, path, minimum) {
    requireArray(points, contract, path, minimum).forEach((point, index) => {
      requireFinite(point && point.x, contract, `${path}[${index}].x`);
      requireFinite(point && point.y, contract, `${path}[${index}].y`);
    });
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
    const retrieval = requireObject(observation.featureRetrieval, contract, '$.featureRetrieval');
    if (retrieval.schema !== 'simulatte.autonomyFeatureRetrieval.v1') {
      throw new AutonomyContractError(contract, '$.featureRetrieval.schema', 'simulatte.autonomyFeatureRetrieval.v1', retrieval.schema);
    }
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
    validateOccurrenceCatalog,
    validateRerankerEvidence,
    validateWorld,
    validateEmbodiment,
    validatePolicy,
    validateMission,
    validateObservation,
    validateOccurrenceReceipt,
    validateBet,
    validateSettlement,
  };
});
