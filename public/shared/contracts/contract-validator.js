(function attachAutonomyContractValidator(root, factory) {
  const dataContracts = typeof module === 'object' && module.exports
    ? require('./data-contract-validator.js')
    : root.SimulatteAutonomyDataContracts;
  const primitives = typeof module === 'object' && module.exports
    ? require('./contract-validation-primitives.js')
    : root.SimulatteAutonomyContractPrimitives;
  const runtimeContracts = typeof module === 'object' && module.exports
    ? require('./contract-runtime-validator.js')
    : root.SimulatteAutonomyRuntimeContracts;
  const api = factory(dataContracts, primitives, runtimeContracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyContractValidator(dataContracts, primitives, runtimeContracts) {
  const { ACTOR_TYPES, AutonomyContractError, requireObject, requireArray, requireString, requireFinite, requireInteger, requireBoolean, requireSchema, requireExactValue, requireExactStringSet, canonicalJson, uniqueRows, pointDistance, validatePointArray, validateCardReferences } = primitives;

  function validateManifest(manifest) {
    return dataContracts.validateManifest(manifest, AutonomyContractError);
  }
  function validatePlaceEmbeddingIndex(index, modelLock) {
    return dataContracts.validatePlaceEmbeddingIndex(index, modelLock, AutonomyContractError);
  }
  function validateAccessibilityIndex(index, world, worldSha256 = null) {
    return dataContracts.validateAccessibilityIndex(index, world, worldSha256, AutonomyContractError);
  }

  function validateRouteAmenityIndex(index, world, worldSha256 = null) {
    return dataContracts.validateRouteAmenityIndex(index, world, worldSha256, AutonomyContractError);
  }
  function validateSafetyHistoryIndex(index, world, worldSha256 = null) {
    return dataContracts.validateSafetyHistoryIndex(index, world, worldSha256, AutonomyContractError);
  }

  function validateCurriculum(curriculum, world) {
    return dataContracts.validateCurriculum(curriculum, world, AutonomyContractError);
  }
  function validateWorldSnapshotRegistry(registry, world) {
    return dataContracts.validateWorldSnapshotRegistry(registry, world, AutonomyContractError);
  }

  function validatePlaceResolutionEvidence(evidence, index, modelLock) {
    return dataContracts.validatePlaceResolutionEvidence(evidence, index, modelLock, AutonomyContractError);
  }
  function validatePolicyArenaEvidence(evidence) {
    return dataContracts.validatePolicyArenaEvidence(evidence, AutonomyContractError);
  }

  function validateModelRuntimeLock(lock) {
    return dataContracts.validateModelRuntimeLock(lock, AutonomyContractError);
  }

  function validateRegionRegistry(registry) {
    const contract = 'simulatte.autonomyRegionRegistry.v1';
    requireSchema(registry, contract, contract);
    requireString(registry.id, contract, '$.id');
    requireString(registry.contentVersion, contract, '$.contentVersion');
    const city = requireObject(registry.city, contract, '$.city');
    requireString(city.id, contract, '$.city.id');
    requireString(city.label, contract, '$.city.label');
    requireString(city.timeZone, contract, '$.city.timeZone');
    validateWgs84Point(city.coordinateOriginWgs84, contract, '$.city.coordinateOriginWgs84');
    const mergePolicy = requireObject(registry.mergePolicy, contract, '$.mergePolicy');
    ['assignmentMethod', 'nodeIdentity', 'duplicatePolicy', 'conflictPolicy', 'graphSeams', 'rowOrder']
      .forEach((key) => requireString(mergePolicy[key], contract, `$.mergePolicy.${key}`));
    const worldTemplate = requireObject(registry.worldTemplate, contract, '$.worldTemplate');
    if (worldTemplate.schema !== 'simulatte.autonomyWorld.v1') throw new AutonomyContractError(contract, '$.worldTemplate.schema', 'simulatte.autonomyWorld.v1', worldTemplate.schema);
    requireString(worldTemplate.id, contract, '$.worldTemplate.id');
    const featureTemplate = requireObject(registry.featureCatalogTemplate, contract, '$.featureCatalogTemplate');
    if (featureTemplate.schema !== 'simulatte.autonomyFeatureCatalog.v1') throw new AutonomyContractError(contract, '$.featureCatalogTemplate.schema', 'simulatte.autonomyFeatureCatalog.v1', featureTemplate.schema);
    requireString(featureTemplate.id, contract, '$.featureCatalogTemplate.id');
    requireObject(featureTemplate.index, contract, '$.featureCatalogTemplate.index');
    validateSharedRegionRows(registry.sharedWorldRows, registry.sharedFeatureRows, contract);
    const packs = requireArray(registry.packs, contract, '$.packs', 1);
    const packIds = uniqueRows(packs, contract, '$.packs');
    packs.forEach((pack, index) => {
      requireString(pack.path, contract, `$.packs[${index}].path`);
      requireSha256(pack.sha256, contract, `$.packs[${index}].sha256`);
      const geometry = requireObject(pack.geometry, contract, `$.packs[${index}].geometry`);
      requireString(geometry.path, contract, `$.packs[${index}].geometry.path`);
      requireSha256(geometry.sha256, contract, `$.packs[${index}].geometry.sha256`);
      validateBoundsWgs84(pack.boundsWgs84, contract, `$.packs[${index}].boundsWgs84`);
      requireExactStringSet(pack.neighborIds, [...new Set(pack.neighborIds || [])], contract, `$.packs[${index}].neighborIds`);
      Object.entries(requireObject(pack.counts, contract, `$.packs[${index}].counts`))
        .forEach(([key, value]) => requireInteger(value, contract, `$.packs[${index}].counts.${key}`));
    });
    packs.forEach((pack, index) => pack.neighborIds.forEach((id) => {
      if (!packIds.has(id)) throw new AutonomyContractError(contract, `$.packs[${index}].neighborIds`, 'known pack ID', id);
      const peer = packs.find((row) => row.id === id);
      if (!peer.neighborIds.includes(pack.id)) throw new AutonomyContractError(contract, `$.packs[${index}].neighborIds`, 'symmetric adjacency', id);
    }));
    const places = requireArray(registry.placeIndex, contract, '$.placeIndex', 1);
    uniqueRows(places, contract, '$.placeIndex');
    places.forEach((place, index) => {
      requireString(place.label, contract, `$.placeIndex[${index}].label`);
      requireString(place.nodeId, contract, `$.placeIndex[${index}].nodeId`);
      requireArray(place.packIds, contract, `$.placeIndex[${index}].packIds`, 1).forEach((id) => {
        if (!packIds.has(id)) throw new AutonomyContractError(contract, `$.placeIndex[${index}].packIds`, 'known pack ID', id);
      });
    });
    const composition = requireObject(registry.composition, contract, '$.composition');
    requireString(composition.id, contract, '$.composition.id');
    const defaultIds = requireArray(composition.defaultPackIds, contract, '$.composition.defaultPackIds', 1);
    if (new Set(defaultIds).size !== defaultIds.length || defaultIds.some((id) => !packIds.has(id))) {
      throw new AutonomyContractError(contract, '$.composition.defaultPackIds', 'unique known pack IDs', defaultIds);
    }
    requireArray(composition.seamNodeIds, contract, '$.composition.seamNodeIds').forEach((id, index) => requireString(id, contract, `$.composition.seamNodeIds[${index}]`));
    requireSha256(composition.worldSha256, contract, '$.composition.worldSha256');
    requireSha256(composition.featureCatalogSha256, contract, '$.composition.featureCatalogSha256');
    Object.entries(requireObject(composition.expectedCounts, contract, '$.composition.expectedCounts'))
      .forEach(([key, value]) => requireInteger(value, contract, `$.composition.expectedCounts.${key}`));
    requireString(registry.claimBoundary, contract, '$.claimBoundary');
    return registry;
  }

  function validateRegionPack(pack, registry = null) {
    const contract = 'simulatte.autonomyRegionPack.v1';
    requireSchema(pack, contract, contract);
    requireString(pack.id, contract, '$.id');
    requireString(pack.contentVersion, contract, '$.contentVersion');
    requireString(pack.cityId, contract, '$.cityId');
    requireString(pack.worldId, contract, '$.worldId');
    validateBoundsWgs84(pack.boundsWgs84, contract, '$.boundsWgs84');
    const knownPackIds = registry ? new Set(registry.packs.map((row) => row.id)) : null;
    const registryReference = registry ? registry.packs.find((row) => row.id === pack.id) : null;
    if (registry && !registryReference) throw new AutonomyContractError(contract, '$.id', 'pack ID declared by registry', pack.id);
    const neighborIds = requireExactStringSet(
      pack.neighborIds,
      registryReference ? registryReference.neighborIds : [...new Set(pack.neighborIds || [])],
      contract,
      '$.neighborIds'
    );
    neighborIds.forEach((id, index) => {
      if (knownPackIds && !knownPackIds.has(id)) throw new AutonomyContractError(contract, `$.neighborIds[${index}]`, 'known region pack ID', id);
      if (id === pack.id) throw new AutonomyContractError(contract, `$.neighborIds[${index}]`, 'peer region pack ID', id);
    });
    if (registryReference) {
      requireExactValue(pack.contentVersion, registry.contentVersion, contract, '$.contentVersion');
      requireExactValue(pack.cityId, registry.city.id, contract, '$.cityId');
      requireExactValue(pack.worldId, registry.worldTemplate.id, contract, '$.worldId');
      requireExactValue(pack.boundsWgs84, registryReference.boundsWgs84, contract, '$.boundsWgs84');
    }
    const nodes = requireArray(pack.nodes, contract, '$.nodes', 1);
    const nodeIds = uniqueRows(nodes, contract, '$.nodes');
    nodes.forEach((node, index) => {
      requireString(node.label, contract, `$.nodes[${index}].label`);
      validatePoint(node.position, contract, `$.nodes[${index}].position`);
      if (node.positionWgs84 !== undefined) validateWgs84Point(node.positionWgs84, contract, `$.nodes[${index}].positionWgs84`);
    });
    const segments = requireArray(pack.segments, contract, '$.segments');
    uniqueRows(segments, contract, '$.segments');
    segments.forEach((segment, index) => {
      if (!nodeIds.has(segment.fromNodeId) || !nodeIds.has(segment.toNodeId)) throw new AutonomyContractError(contract, `$.segments[${index}]`, 'endpoints included in pack nodes', segment);
      validatePointArray(segment.geometry, contract, `$.segments[${index}].geometry`, 2);
    });
    ['signals', 'actors', 'disruptions'].forEach((key) => uniqueRows(requireArray(pack[key], contract, `$.${key}`), contract, `$.${key}`));
    // Render geometry ships in a separate sidecar asset; a routing-only pack omits it.
    if (pack.renderGeometry !== undefined) {
      const render = requireObject(pack.renderGeometry, contract, '$.renderGeometry');
      ['land', 'parks', 'streets', 'buildings', 'bikeFacilities'].forEach((key) => uniqueRows(requireArray(render[key], contract, `$.renderGeometry.${key}`), contract, `$.renderGeometry.${key}`));
    }
    const cards = requireArray(pack.featureCards, contract, '$.featureCards');
    const cardIds = uniqueRows(cards, contract, '$.featureCards');
    const featureIndex = requireObject(pack.featureIndex, contract, '$.featureIndex');
    ['tokenToCardIds', 'kindToCardIds'].forEach((key) => Object.entries(requireObject(featureIndex[key], contract, `$.featureIndex.${key}`)).forEach(([name, ids]) => {
      requireArray(ids, contract, `$.featureIndex.${key}.${name}`, 1).forEach((id) => {
        if (!cardIds.has(id)) throw new AutonomyContractError(contract, `$.featureIndex.${key}.${name}`, 'card ID inside this pack', id);
      });
    }));
    const seams = requireArray(pack.seams, contract, '$.seams');
    uniqueRows(seams, contract, '$.seams');
    seams.forEach((seam, index) => {
      requireString(seam.id, contract, `$.seams[${index}].id`);
      if (!nodeIds.has(seam.nodeId)) throw new AutonomyContractError(contract, `$.seams[${index}].nodeId`, 'node included in pack', seam.nodeId);
      requireExactStringSet(seam.peerPackIds, [...new Set(seam.peerPackIds || [])], contract, `$.seams[${index}].peerPackIds`).forEach((id) => {
        if (knownPackIds && !knownPackIds.has(id)) throw new AutonomyContractError(contract, `$.seams[${index}].peerPackIds`, 'known region pack ID', id);
        if (!neighborIds.includes(id)) throw new AutonomyContractError(contract, `$.seams[${index}].peerPackIds`, 'declared neighbor pack ID', id);
      });
    });
    validateRegionPackCounts(pack, contract);
    if (registryReference) requireExactValue(pack.counts, registryReference.counts, contract, '$.counts');
    const provenance = requireObject(pack.provenance, contract, '$.provenance');
    requireString(provenance.sourceKind, contract, '$.provenance.sourceKind');
    requireSha256(provenance.worldSha256, contract, '$.provenance.worldSha256');
    requireSha256(provenance.featureCatalogSha256, contract, '$.provenance.featureCatalogSha256');
    requireString(provenance.claimBoundary, contract, '$.provenance.claimBoundary');
    if (registryReference) {
      requireExactValue(provenance.worldSha256, registry.composition.worldSha256, contract, '$.provenance.worldSha256');
      requireExactValue(provenance.featureCatalogSha256, registry.composition.featureCatalogSha256, contract, '$.provenance.featureCatalogSha256');
    }
    return pack;
  }

  function validateSharedRegionRows(worldRows, featureRows, contract) {
    const world = requireObject(worldRows, contract, '$.sharedWorldRows');
    ['nodes', 'segments', 'signals', 'actors', 'disruptions'].forEach((key) => requireArray(world[key], contract, `$.sharedWorldRows.${key}`));
    const render = requireObject(world.renderGeometry, contract, '$.sharedWorldRows.renderGeometry');
    ['land', 'parks', 'streets', 'buildings', 'bikeFacilities'].forEach((key) => requireArray(render[key], contract, `$.sharedWorldRows.renderGeometry.${key}`));
    const features = requireObject(featureRows, contract, '$.sharedFeatureRows');
    requireArray(features.cards, contract, '$.sharedFeatureRows.cards');
    const index = requireObject(features.index, contract, '$.sharedFeatureRows.index');
    requireObject(index.tokenToCardIds, contract, '$.sharedFeatureRows.index.tokenToCardIds');
    requireObject(index.kindToCardIds, contract, '$.sharedFeatureRows.index.kindToCardIds');
  }

  function validateRegionPackCounts(pack, contract) {
    const counts = requireObject(pack.counts, contract, '$.counts');
    const actual = {
      nodes: pack.nodes.length, segments: pack.segments.length, signals: pack.signals.length,
      actors: pack.actors.length, disruptions: pack.disruptions.length,
      featureCards: pack.featureCards.length, seams: pack.seams.length,
    };
    // Geometry counts are only self-checkable when the pack carries its render geometry;
    // for a routing-only pack the sidecar owns them and $.counts still pins the values.
    if (pack.renderGeometry !== undefined) {
      Object.assign(actual, {
        streets: pack.renderGeometry.streets.length, parks: pack.renderGeometry.parks.length,
        buildings: pack.renderGeometry.buildings.length, bikeFacilities: pack.renderGeometry.bikeFacilities.length,
      });
    }
    Object.entries(actual).forEach(([key, value]) => {
      requireInteger(counts[key], contract, `$.counts.${key}`);
      if (counts[key] !== value) throw new AutonomyContractError(contract, `$.counts.${key}`, `exact count ${value}`, counts[key]);
    });
  }

  function validateBoundsWgs84(bounds, contract, path) {
    const row = requireObject(bounds, contract, path);
    requireFinite(row.south, contract, `${path}.south`, -90);
    requireFinite(row.north, contract, `${path}.north`, -90);
    requireFinite(row.west, contract, `${path}.west`, -180);
    requireFinite(row.east, contract, `${path}.east`, -180);
    requireBoolean(row.includeEast, contract, `${path}.includeEast`);
    if (row.north <= row.south || row.east <= row.west || row.north > 90 || row.east > 180) throw new AutonomyContractError(contract, path, 'ordered WGS84 bounds', row);
  }

  function validateWgs84Point(point, contract, path) {
    const row = requireObject(point, contract, path);
    requireFinite(row.longitude, contract, `${path}.longitude`, -180);
    requireFinite(row.latitude, contract, `${path}.latitude`, -90);
    if (row.longitude > 180 || row.latitude > 90) throw new AutonomyContractError(contract, path, 'valid WGS84 point', row);
  }

  function validatePoint(point, contract, path) {
    const row = requireObject(point, contract, path);
    requireFinite(row.x, contract, `${path}.x`);
    requireFinite(row.y, contract, `${path}.y`);
  }

  function requireSha256(value, contract, path) {
    if (!/^[a-f0-9]{64}$/.test(value || '')) throw new AutonomyContractError(contract, path, '64-character lowercase SHA-256', value);
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
    return dataContracts.validateRerankerEvidence(evidence, featureCatalog, governedHashes, AutonomyContractError);
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
      if (node.positionWgs84 !== undefined) validateWgs84Point(node.positionWgs84, contract, `$.nodes[${index}].positionWgs84`);
      if (provenance.sourceKind === 'compiled_open_data_snapshot' && node.positionWgs84 === undefined) {
        throw new AutonomyContractError(contract, `$.nodes[${index}].positionWgs84`, 'WGS84 identity for compiled open-data node', node.positionWgs84);
      }
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
      if (provenance.sourceKind === 'compiled_open_data_snapshot') {
        requireString(segment.source?.sourceRevision, contract, `$.segments[${index}].source.sourceRevision`);
        requireSha256(segment.source?.geometryWgs84Sha256, contract, `$.segments[${index}].source.geometryWgs84Sha256`);
      }
      validateCardReferences(segment.cardIds, cardIds, contract, `$.segments[${index}].cardIds`);
    });
    const circuits = world.circuits === undefined ? [] : requireArray(world.circuits, contract, '$.circuits');
    uniqueRows(circuits, contract, '$.circuits');
    circuits.forEach((circuit, index) => {
      requireString(circuit.label, contract, `$.circuits[${index}].label`);
      requireString(circuit.mode, contract, `$.circuits[${index}].mode`);
      requireArray(circuit.aliases, contract, `$.circuits[${index}].aliases`, 1)
        .forEach((alias, aliasIndex) => requireString(alias, contract, `$.circuits[${index}].aliases[${aliasIndex}]`));
      const circuitNodeIds = requireArray(circuit.nodeIds, contract, `$.circuits[${index}].nodeIds`, 2);
      const circuitSegmentIds = requireArray(circuit.segmentIds, contract, `$.circuits[${index}].segmentIds`, 2);
      circuitNodeIds.forEach((id, nodeIndex) => {
        if (!nodeIds.has(id)) throw new AutonomyContractError(contract, `$.circuits[${index}].nodeIds[${nodeIndex}]`, 'known node ID', id);
      });
      circuitSegmentIds.forEach((id, segmentIndex) => {
        if (!segmentIds.has(id)) throw new AutonomyContractError(contract, `$.circuits[${index}].segmentIds[${segmentIndex}]`, 'known segment ID', id);
        const segment = segments.find((row) => row.id === id);
        if (!segment.allowedModes.includes(circuit.mode)) throw new AutonomyContractError(contract, `$.circuits[${index}].segmentIds[${segmentIndex}]`, `segment allowing ${circuit.mode}`, id);
        const expectedFrom = circuitNodeIds[segmentIndex];
        const expectedTo = circuitNodeIds[(segmentIndex + 1) % circuitNodeIds.length];
        if (segment.fromNodeId !== expectedFrom || segment.toNodeId !== expectedTo) {
          throw new AutonomyContractError(contract, `$.circuits[${index}].segmentIds[${segmentIndex}]`, `ordered edge ${expectedFrom} -> ${expectedTo}`, segment);
        }
      });
      if (circuitSegmentIds.length !== circuitNodeIds.length) throw new AutonomyContractError(contract, `$.circuits[${index}]`, 'one directed segment per circuit node', circuit);
      const computedLength = circuitSegmentIds.reduce((sum, id) => sum + segments.find((row) => row.id === id).lengthM, 0);
      requireFinite(circuit.lengthM, contract, `$.circuits[${index}].lengthM`, Number.MIN_VALUE);
      if (Math.abs(computedLength - circuit.lengthM) > 0.000001) throw new AutonomyContractError(contract, `$.circuits[${index}].lengthM`, `segment sum ${computedLength}`, circuit.lengthM);
      const source = requireObject(circuit.source, contract, `$.circuits[${index}].source`);
      requireString(source.datasetId, contract, `$.circuits[${index}].source.datasetId`);
      requireString(source.sourceRevision, contract, `$.circuits[${index}].source.sourceRevision`);
      requireString(source.propertyId, contract, `$.circuits[${index}].source.propertyId`);
      requireString(source.boundaryKind, contract, `$.circuits[${index}].source.boundaryKind`);
      requireString(source.surfaceClaim, contract, `$.circuits[${index}].source.surfaceClaim`);
      requireString(source.claimBoundary, contract, `$.circuits[${index}].source.claimBoundary`);
      requireSha256(source.geometryWgs84Sha256, contract, `$.circuits[${index}].source.geometryWgs84Sha256`);
      requireSha256(source.selectedRingWgs84Sha256, contract, `$.circuits[${index}].source.selectedRingWgs84Sha256`);
      requireInteger(source.memberCount, contract, `$.circuits[${index}].source.memberCount`, 1);
      requireInteger(source.selectedMemberIndex, contract, `$.circuits[${index}].source.selectedMemberIndex`);
      requireString(source.selectionMethod, contract, `$.circuits[${index}].source.selectionMethod`);
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
      if (!ACTOR_TYPES.includes(actor.type)) throw new AutonomyContractError(contract, `$.actors[${index}].type`, ACTOR_TYPES.join(' | '), actor.type);
      requireFinite(actor.radiusM, contract, `$.actors[${index}].radiusM`, Number.MIN_VALUE);
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
    if (world.renderGeometry !== undefined) dataContracts.validateRenderGeometry(world.renderGeometry, AutonomyContractError);
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
      if (scenario.timeZone !== undefined) {
        requireString(scenario.timeZone, contract, '$.scenario.timeZone');
        requireInteger(scenario.defaultStartLocalMinutes, contract, '$.scenario.defaultStartLocalMinutes');
        if (scenario.defaultStartLocalMinutes >= 1440) throw new AutonomyContractError(contract, '$.scenario.defaultStartLocalMinutes', 'minute in local day', scenario.defaultStartLocalMinutes);
        const daylight = requireArray(scenario.daylightWindowLocalMinutes, contract, '$.scenario.daylightWindowLocalMinutes', 2);
        if (daylight.length !== 2 || !daylight.every((row) => Number.isInteger(row) && row >= 0 && row < 1440) || daylight[0] >= daylight[1]) {
          throw new AutonomyContractError(contract, '$.scenario.daylightWindowLocalMinutes', 'ordered [sunrise,sunset] local minutes', daylight);
        }
        requireString(scenario.daylightMethod, contract, '$.scenario.daylightMethod');
      }
    }
    return world;
  }

  return {
    AutonomyContractError,
    validateManifest,
    validateModelRuntimeLock,
    validatePlaceEmbeddingIndex,
    validatePlaceResolutionEvidence,
    validatePolicyArenaEvidence,
    validateAccessibilityIndex,
    validateRouteAmenityIndex,
    validateSafetyHistoryIndex,
    validateCurriculum,
    validateWorldSnapshotRegistry,
    validateRegionRegistry,
    validateRegionPack,
    validateFeatureCatalog,
    validateOccurrenceCatalog,
    validateRerankerEvidence,
    validateWorld,
    validateEmbodiment: runtimeContracts.validateEmbodiment,
    validatePolicy: runtimeContracts.validatePolicy,
    validateMission: runtimeContracts.validateMission,
    validateObservation: runtimeContracts.validateObservation,
    validateOccurrenceReceipt: runtimeContracts.validateOccurrenceReceipt,
    validateBet: runtimeContracts.validateBet,
    validateSettlement: runtimeContracts.validateSettlement,
  };
});
