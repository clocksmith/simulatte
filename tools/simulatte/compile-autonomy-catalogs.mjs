import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const featureCardTypes = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, 'feature-card-types-v1.json'), 'utf8'));

export function compileFeatureCatalog(world, { snapshotDate }) {
  const cards = featureCardTypes.cards.map((row) => ({
    ...structuredClone(row),
    provenance: { sourceKind: 'hand_authored_behavior_contract', sourceId: row.id },
  }));
  world.segments.forEach((segment) => {
    if (segment.source?.datasetId === 'openstreetmap-highways') return;
    const cardId = `network.${segment.id}`;
    const modes = segment.allowedModes.join(' ');
    segment.cardIds = [...new Set([...segment.cardIds, cardId])].sort();
    cards.push({
      id: cardId,
      kind: 'street_segment',
      label: segment.source.street || `${segment.laneType} route segment`,
      searchTerms: uniqueText([segment.source.street, segment.laneType, modes, segment.fromNodeId, segment.toNodeId, `routable ${modes} segment`]),
      constraints: ['mode_eligible', 'network_contained', `${segment.laneType}_lane`, ...segment.allowedModes.map((mode) => `${mode}_eligible`)],
      validationObligations: ['source_segment_exists', 'endpoints_exist', 'geometry_has_two_points', 'positive_length'],
      provenance: { worldId: world.id, sourceKind: 'compiled_network_segment', sourceId: segment.id },
    });
  });
  world.renderGeometry.streets.forEach((street) => cards.push({
    id: `map.${street.id}`,
    kind: 'map_street',
    label: street.name || `${street.highway} ${street.sourceWayId}`,
    searchTerms: uniqueText([street.name, street.highway, `OSM way ${street.sourceWayId}`, 'map street']),
    constraints: ['render_context_only', `${street.highway}_classification`],
    validationObligations: ['source_way_exists', 'geometry_has_two_points', 'source_identity_present'],
    provenance: { worldId: world.id, sourceKind: 'compiled_osm_way', sourceId: street.sourceWayId },
  }));
  world.renderGeometry.bikeFacilities.forEach((facility) => cards.push({
    id: `facility.${facility.id}`,
    kind: 'bike_facility',
    label: facility.street || `${facility.laneType} bike facility`,
    searchTerms: uniqueText([facility.street, facility.laneType, facility.facilityClass, 'bike facility']),
    constraints: ['source_bound_facility', `${facility.laneType}_lane`],
    validationObligations: ['source_facility_exists', 'geometry_has_two_points', 'lane_type_declared'],
    provenance: { worldId: world.id, sourceKind: 'compiled_nyc_dot_bike_facility', sourceId: facility.id },
  }));
  addSignalCards(world, cards);
  addActorCards(world, cards);
  cards.sort(byId);
  return {
    schema: 'simulatte.autonomyFeatureCatalog.v1',
    id: 'autonomy-feature-cards-v1',
    contentVersion: `autonomy-feature-cards-${world.contentVersion}`,
    provenance: {
      sourceKind: 'compiled_world_feature_catalog',
      snapshotDate,
      worldId: world.id,
      compiler: 'tools/autonomy/build-nyc-autonomy-world.mjs',
      baseTypeCatalogId: featureCardTypes.id,
      claimBoundary: 'Cards identify governed world features and authored simulation assumptions. They do not assert live conditions or semantic embedding quality.',
    },
    rerankerPolicy: {
      id: 'typed-evidence-reranker-v1',
      weights: { kindMatch: 2, constraintMatch: 1.5, exactReference: 3 },
      control: 'lexical_overlap_plus_exact_reference',
      promotionRule: 'Retain only when the public diagnostic receipt improves mean reciprocal rank without reducing recall at five.',
    },
    cards,
    index: buildFeatureIndex(cards),
  };
}

function addSignalCards(world, cards) {
  world.signals.forEach((signal) => {
    const cardId = `signal.${signal.id}`;
    signal.cardIds = [...new Set([...signal.cardIds, cardId])].sort();
    cards.push({
      id: cardId,
      kind: 'behavior',
      label: `Assumed signal at ${world.nodes.find((row) => row.id === signal.nodeId).label}`,
      searchTerms: ['signal compliance', 'red green phase', signal.nodeId],
      constraints: ['red_blocks_entry', 'green_allows_entry'],
      validationObligations: ['signal_cycle_valid', 'outgoing_segment_exists', 'assumption_provenance_present'],
      provenance: { worldId: world.id, sourceKind: 'simulation_assumption', sourceId: signal.id },
    });
  });
}

function addActorCards(world, cards) {
  world.actors.forEach((actor) => {
    const cardId = `actor.${actor.id}`;
    actor.cardIds = [...new Set([...actor.cardIds, cardId])].sort();
    cards.push({
      id: cardId,
      kind: 'behavior',
      label: `Assumed ${actor.type} occurrence`,
      searchTerms: [actor.type, 'yield clearance', actor.id],
      constraints: ['minimum_clearance_hard_gate', 'occurrence_controlled'],
      validationObligations: ['actor_path_valid', 'occurrence_pattern_exists', 'assumption_provenance_present'],
      provenance: { worldId: world.id, sourceKind: 'simulation_assumption', sourceId: actor.id },
    });
  });
}

export function compileOccurrenceCatalog(world) {
  const signal = world.signals[0];
  const timedActor = world.actors.find((row) => row.id === 'assumed-pedestrian-route-1');
  const eventActor = world.actors.find((row) => row.id === 'assumed-pedestrian-route-2');
  return {
    schema: 'simulatte.autonomyOccurrenceCatalog.v1',
    id: 'nyc-replay-patterns-v1',
    contentVersion: `nyc-replay-patterns-${world.contentVersion}`,
    plugins: [
      { id: 'time.periodic-phase.v1', triggerKind: 'time', description: 'Repeating ordered phases' },
      { id: 'time.window.v1', triggerKind: 'time', description: 'Inclusive deterministic tick window' },
      { id: 'event.window.v1', triggerKind: 'event', description: 'Window opened by a typed simulation event' },
    ],
    patterns: [
      {
        id: 'route-signal-cycle',
        pluginId: 'time.periodic-phase.v1',
        priority: 100,
        trigger: {
          phaseOffsetTicks: signal.phaseOffsetTicks,
          phases: [
            { id: 'green', value: 'green', durationTicks: signal.greenTickCount },
            { id: 'red', value: 'red', durationTicks: signal.cycleTicks - signal.greenTickCount },
          ],
        },
        effect: { type: 'signal_state', targetId: signal.id, valueSource: 'phase' },
        provenance: { kind: 'simulation_assumption', source: 'scenario authoring', isObservedHistory: false },
      },
      {
        id: 'pedestrian-crossing-time-window',
        pluginId: 'time.window.v1',
        priority: 80,
        trigger: { startTick: timedActor.activeFromTick, endTickInclusive: timedActor.activeUntilTick },
        effect: { type: 'actor_active', targetId: timedActor.id, value: true },
        provenance: { kind: 'simulation_assumption', source: 'scenario authoring', isObservedHistory: false },
      },
      {
        id: 'pedestrian-crossing-node-event',
        pluginId: 'event.window.v1',
        priority: 70,
        trigger: {
          eventKind: 'node_reached',
          sourceId: world.scenario.eventActorTriggerNodeId,
          durationTicks: world.scenario.eventActorDurationTicks,
          delayTicks: 0,
          occurrenceIndex: 0,
        },
        effect: { type: 'actor_active', targetId: eventActor.id, value: true },
        provenance: { kind: 'simulation_assumption', source: 'scenario authoring', isObservedHistory: false },
      },
    ],
    resolution: {
      rule: 'priority_descending_then_pattern_id_ascending',
      unknownPluginBehavior: 'fail_closed',
      conflictBehavior: 'highest_priority_wins_with_receipt',
    },
    claimBoundary: 'These patterns drive deterministic authored occurrences. They are not claims about live or historical NYC signal timing, pedestrian presence, or disruptions.',
  };
}

function buildFeatureIndex(cards) {
  const tokenToCardIds = {};
  const kindToCardIds = {};
  cards.forEach((card) => {
    if (!kindToCardIds[card.kind]) kindToCardIds[card.kind] = [];
    kindToCardIds[card.kind].push(card.id);
    const terms = uniqueText([card.label, ...(card.searchTerms || []), ...(card.constraints || [])]);
    new Set(tokenizeIndexTerms(terms.join(' '))).forEach((token) => {
      if (!tokenToCardIds[token]) tokenToCardIds[token] = [];
      tokenToCardIds[token].push(card.id);
    });
  });
  Object.values(tokenToCardIds).forEach((rows) => rows.sort());
  Object.values(kindToCardIds).forEach((rows) => rows.sort());
  return {
    schema: 'simulatte.autonomyFeatureIndex.v1',
    cardCount: cards.length,
    method: 'deterministic_token_inverted_index_v1',
    stopwordPolicy: 'navigation_common_terms_v1',
    tokenToCardIds,
    kindToCardIds,
  };
}

function tokenizeIndexTerms(value) {
  const stopwords = new Set(['and', 'bike', 'card', 'exists', 'geometry', 'map', 'mode', 'route', 'segment', 'source', 'street', 'the', 'way']);
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function uniqueText(values) {
  const rows = [...new Set(values.filter((value) => value !== null && value !== undefined).map((value) => String(value).trim()).filter(Boolean))];
  while (rows.length < 2) rows.push(`feature term ${rows.length + 1}`);
  return rows;
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}
