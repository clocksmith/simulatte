#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const DATA_DIR = path.join(ROOT, 'public/data/autonomy');
const DEFAULT_CONFIG = path.join(TOOL_DIR, 'region-configs/nyc-core-v1.json');
const DEFAULT_WORLD = path.join(DATA_DIR, 'worlds/villages-williamsburg-delivery-bike-v1.json');
const DEFAULT_FEATURES = path.join(DATA_DIR, 'feature-cards-v1.json');
const DEFAULT_REGISTRY = path.join(DATA_DIR, 'regions/nyc-core-v1.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'autonomy-manifest.json');
const require = createRequire(import.meta.url);
const contracts = require('../../public/contracts/contract-validator.js');
const regionApi = require('../../public/world/region-pack-merger.js');

function parseArgs(argv) {
  const options = { config: DEFAULT_CONFIG, world: DEFAULT_WORLD, features: DEFAULT_FEATURES, registry: DEFAULT_REGISTRY, activate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => path.resolve(inline ?? argv[++index]);
    if (key === '--config') options.config = value();
    else if (key === '--world') options.world = value();
    else if (key === '--features') options.features = value();
    else if (key === '--registry') options.registry = value();
    else if (key === '--activate') options.activate = true;
    else throw new Error(`Unknown argument ${argv[index]}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = readJson(options.config);
  const world = readJson(options.world);
  const featureCatalog = readJson(options.features);
  contracts.validateWorld(world, featureCatalog);
  contracts.validateFeatureCatalog(featureCatalog);
  validateBuildConfig(config, world);
  const compilation = compileRegionPacks({ config, world, featureCatalog, worldPath: options.world, featurePath: options.features });
  const packDirectory = path.join(path.dirname(options.registry), 'packs');
  fs.mkdirSync(packDirectory, { recursive: true });
  const packReferences = compilation.packs.map((pack) => {
    const file = path.join(packDirectory, `${pack.id}.json`);
    const text = artifactText(pack);
    fs.writeFileSync(file, text);
    return {
      id: pack.id,
      path: `./packs/${pack.id}.json`,
      sha256: sha256(text),
      boundsWgs84: structuredClone(pack.boundsWgs84),
      neighborIds: [...pack.neighborIds],
      counts: structuredClone(pack.counts),
    };
  });
  const registry = buildRegistry({ ...compilation, config, world, featureCatalog, packReferences, worldPath: options.world, featurePath: options.features });
  contracts.validateRegionRegistry(registry);
  compilation.packs.forEach((pack) => contracts.validateRegionPack(pack, registry));
  const registryText = artifactText(registry);
  fs.writeFileSync(options.registry, registryText);
  const merged = regionApi.mergeRegionPacks(registry, compilation.packs);
  contracts.validateWorld(merged.world, merged.featureCatalog);
  contracts.validateFeatureCatalog(merged.featureCatalog);
  assertHash('world composition', registry.composition.worldSha256, sha256(artifactText(merged.world)));
  assertHash('feature composition', registry.composition.featureCatalogSha256, sha256(artifactText(merged.featureCatalog)));
  if (options.activate) {
    updateManifest({ config, registry, registryPath: options.registry, registrySha256: sha256(registryText), world, featureCatalog });
  }
  console.log(`AUTONOMY-REGIONS registry=${registry.id} packs=${compilation.packs.length} seams=${registry.composition.seamNodeIds.length} world=${world.id} activation=${options.activate ? 'active' : 'inactive'} status=verified`);
}

function compileRegionPacks({ config, world, featureCatalog, worldPath, featurePath }) {
  const packStates = new Map(config.packs.map((row) => [row.id, createPackState(row)]));
  const nodeById = new Map(world.nodes.map((row) => [row.id, row]));
  const nodeOwner = new Map(world.nodes.map((row) => [row.id, ownerForPoint(toWgs84(row.position, world), config).id]));
  const segmentOwner = assignRows(world.segments, (row) => geometryCenter(row.geometry), world, config);
  const streetOwner = assignRows(world.renderGeometry.streets, (row) => geometryCenter(row.geometry), world, config);
  const buildingOwner = assignRows(world.renderGeometry.buildings, (row) => geometryCenter(row.footprint), world, config);
  const facilityOwner = assignRows(world.renderGeometry.bikeFacilities, (row) => geometryCenter(row.geometry), world, config);
  world.nodes.forEach((row) => packStates.get(nodeOwner.get(row.id)).nodes.set(row.id, row));
  world.segments.forEach((row) => {
    const state = packStates.get(segmentOwner.get(row.id));
    state.segments.push(row);
    state.nodes.set(row.fromNodeId, requiredMapValue(nodeById, row.fromNodeId, `segment ${row.id} from-node`));
    state.nodes.set(row.toNodeId, requiredMapValue(nodeById, row.toNodeId, `segment ${row.id} to-node`));
  });
  const signalOwner = new Map();
  world.signals.forEach((row) => {
    const ownerId = segmentOwner.get(row.controlledOutgoingSegmentIds[0]) || nodeOwner.get(row.nodeId);
    signalOwner.set(row.id, ownerId);
    packStates.get(ownerId).signals.push(row);
  });
  const actorOwner = assignRows(world.actors, (row) => geometryCenter(row.path), world, config);
  world.actors.forEach((row) => packStates.get(actorOwner.get(row.id)).actors.push(row));
  const disruptionOwner = new Map();
  world.disruptions.forEach((row) => {
    const ownerId = segmentOwner.get(row.segmentId);
    disruptionOwner.set(row.id, ownerId);
    packStates.get(ownerId).disruptions.push(row);
  });
  world.renderGeometry.streets.forEach((row) => packStates.get(streetOwner.get(row.id)).renderGeometry.streets.push(row));
  world.renderGeometry.buildings.forEach((row) => packStates.get(buildingOwner.get(row.id)).renderGeometry.buildings.push(row));
  world.renderGeometry.bikeFacilities.forEach((row) => packStates.get(facilityOwner.get(row.id)).renderGeometry.bikeFacilities.push(row));
  const featureOwner = createFeatureOwner({ world, segmentOwner, streetOwner, buildingOwner, facilityOwner, signalOwner, actorOwner, disruptionOwner });
  const sharedFeatureCards = [];
  featureCatalog.cards.forEach((card) => {
    const ownerId = featureOwner(card);
    if (ownerId) packStates.get(ownerId).featureCards.push(card);
    else sharedFeatureCards.push(card);
  });
  const seamMembership = nodeMembership(packStates);
  const seamNodeIds = [...seamMembership.entries()].filter(([, ids]) => ids.length > 1).map(([id]) => id).sort();
  const packs = config.packs.map((definition) => finalizePack({
    config,
    definition,
    state: packStates.get(definition.id),
    seamMembership,
    featureCatalog,
    world,
    worldSha256: hashFile(worldPath),
    featureCatalogSha256: hashFile(featurePath),
  }));
  return {
    packs,
    seamNodeIds,
    sharedWorldRows: {
      nodes: [], segments: [], signals: [], actors: [], disruptions: [],
      renderGeometry: { land: structuredClone(world.renderGeometry.land), streets: [], buildings: [], bikeFacilities: [] },
    },
    sharedFeatureRows: { cards: sharedFeatureCards, index: filterFeatureIndex(featureCatalog.index, new Set(sharedFeatureCards.map((row) => row.id))) },
  };
}

function buildRegistry({ config, world, featureCatalog, packs, seamNodeIds, sharedWorldRows, sharedFeatureRows, packReferences, worldPath, featurePath }) {
  const { nodes, segments, signals, actors, disruptions, renderGeometry, ...worldRoot } = world;
  const { land, streets, buildings, bikeFacilities, ...renderTemplate } = renderGeometry;
  const { cards, index, ...featureRoot } = featureCatalog;
  const { tokenToCardIds, kindToCardIds, cardCount, ...indexTemplate } = index;
  const membership = nodeMembership(new Map(packs.map((pack) => [pack.id, { nodes: new Map(pack.nodes.map((row) => [row.id, row])) }])));
  const placeIndex = world.nodes.filter((row) => row.landmark).map((row) => ({
    id: `place-${row.id}`,
    label: row.label,
    nodeId: row.id,
    packIds: membership.get(row.id) || [],
  })).sort(byId);
  return {
    schema: 'simulatte.autonomyRegionRegistry.v1',
    id: config.registry.id,
    contentVersion: config.contentVersion,
    city: structuredClone(config.city),
    mergePolicy: {
      assignmentMethod: config.assignment.method,
      nodeIdentity: config.assignment.nodeIdentity,
      duplicatePolicy: config.assignment.duplicatePolicy,
      conflictPolicy: config.assignment.conflictPolicy,
      graphSeams: 'duplicate_boundary_nodes_with_exact_rows',
      rowOrder: 'id_ascending',
    },
    worldTemplate: { ...worldRoot, renderGeometry: renderTemplate },
    featureCatalogTemplate: { ...featureRoot, index: indexTemplate },
    sharedWorldRows,
    sharedFeatureRows,
    packs: packReferences,
    placeIndex,
    composition: {
      id: config.registry.compositionId,
      defaultPackIds: config.packs.map((row) => row.id),
      seamNodeIds,
      worldSha256: hashFile(worldPath),
      featureCatalogSha256: hashFile(featurePath),
      expectedCounts: compositionCounts(world, featureCatalog),
    },
    claimBoundary: 'The registry proves deterministic composition of frozen region packs. It does not make authored occurrences historical, establish map completeness, or authorize physical autonomy.',
  };
}

function finalizePack({ config, definition, state, seamMembership, featureCatalog, world, worldSha256, featureCatalogSha256 }) {
  const nodes = [...state.nodes.values()].sort(byId);
  const featureCards = [...state.featureCards].sort(byId);
  const seams = nodes.filter((row) => (seamMembership.get(row.id) || []).length > 1).map((row) => ({
    id: `seam-${row.id}`,
    nodeId: row.id,
    peerPackIds: seamMembership.get(row.id).filter((id) => id !== definition.id),
  })).sort(byId);
  const pack = {
    schema: 'simulatte.autonomyRegionPack.v1',
    id: definition.id,
    contentVersion: config.contentVersion,
    cityId: config.city.id,
    worldId: world.id,
    boundsWgs84: structuredClone(definition.boundsWgs84),
    neighborIds: [...definition.neighborIds],
    nodes,
    segments: state.segments.sort(byId),
    signals: state.signals.sort(byId),
    actors: state.actors.sort(byId),
    disruptions: state.disruptions.sort(byId),
    renderGeometry: {
      land: [],
      streets: state.renderGeometry.streets.sort(byId),
      buildings: state.renderGeometry.buildings.sort(byId),
      bikeFacilities: state.renderGeometry.bikeFacilities.sort(byId),
    },
    featureCards,
    featureIndex: filterFeatureIndex(featureCatalog.index, new Set(featureCards.map((row) => row.id))),
    seams,
    counts: {},
    provenance: {
      sourceKind: 'deterministic_partition_of_governed_world',
      worldSha256,
      featureCatalogSha256,
      buildConfigId: config.id,
      assignmentMethod: config.assignment.method,
      claimBoundary: 'Rows preserve their parent world facts exactly. Pack membership is a deterministic loading boundary, not an independent source claim.',
    },
  };
  pack.counts = packCounts(pack);
  return pack;
}

function createFeatureOwner({ world, segmentOwner, streetOwner, facilityOwner, signalOwner, actorOwner, disruptionOwner }) {
  const sourceOwners = new Map();
  world.segments.forEach((row) => sourceOwners.set(`compiled_network_segment:${row.id}`, segmentOwner.get(row.id)));
  world.renderGeometry.streets.forEach((row) => sourceOwners.set(`compiled_osm_way:${row.sourceWayId}`, streetOwner.get(row.id)));
  world.renderGeometry.bikeFacilities.forEach((row) => sourceOwners.set(`compiled_nyc_dot_bike_facility:${row.id}`, facilityOwner.get(row.id)));
  world.signals.forEach((row) => sourceOwners.set(`simulation_assumption:${row.id}`, signalOwner.get(row.id)));
  world.actors.forEach((row) => sourceOwners.set(`simulation_assumption:${row.id}`, actorOwner.get(row.id)));
  world.disruptions.forEach((row) => sourceOwners.set(`simulation_assumption:${row.id}`, disruptionOwner.get(row.id)));
  return (card) => {
    if (!card.provenance.worldId) return null;
    const ownerId = sourceOwners.get(`${card.provenance.sourceKind}:${card.provenance.sourceId}`);
    if (!ownerId) throw new Error(`World feature card ${card.id} has no region owner for ${card.provenance.sourceKind}:${card.provenance.sourceId}`);
    return ownerId;
  };
}

function createPackState(definition) {
  return {
    definition,
    nodes: new Map(), segments: [], signals: [], actors: [], disruptions: [], featureCards: [],
    renderGeometry: { streets: [], buildings: [], bikeFacilities: [] },
  };
}

function requiredMapValue(rows, id, label) {
  const value = rows.get(id);
  if (!value) throw new Error(`${label} references missing ID ${id}`);
  return value;
}

function assignRows(rows, pointForRow, world, config) {
  return new Map(rows.map((row) => [row.id, ownerForPoint(toWgs84(pointForRow(row), world), config).id]));
}

function ownerForPoint(point, config) {
  const matches = config.packs.filter((pack) => containsWgs84(pack.boundsWgs84, point));
  if (matches.length !== 1) throw new Error(`Point ${point.longitude},${point.latitude} expected one region owner, received ${matches.map((row) => row.id).join(', ') || 'none'}`);
  return matches[0];
}

function containsWgs84(bounds, point) {
  const eastMatch = bounds.includeEast ? point.longitude <= bounds.east : point.longitude < bounds.east;
  return point.longitude >= bounds.west && eastMatch && point.latitude >= bounds.south && point.latitude <= bounds.north;
}

function toWgs84(point, world) {
  const origin = world.coordinateSystem.originWgs84;
  const longitudeScale = Math.cos(origin.latitude * Math.PI / 180) * 111320;
  return {
    longitude: origin.longitude + point.x / longitudeScale,
    latitude: origin.latitude + point.y / 110540,
  };
}

function geometryCenter(points) {
  const rows = points.slice(0, points.length > 2 && samePoint(points[0], points.at(-1)) ? -1 : undefined);
  return {
    x: rows.reduce((sum, row) => sum + row.x, 0) / rows.length,
    y: rows.reduce((sum, row) => sum + row.y, 0) / rows.length,
  };
}

function samePoint(left, right) {
  return left && right && left.x === right.x && left.y === right.y;
}

function nodeMembership(packStates) {
  const membership = new Map();
  packStates.forEach((state, packId) => state.nodes.forEach((row) => {
    if (!membership.has(row.id)) membership.set(row.id, []);
    membership.get(row.id).push(packId);
  }));
  membership.forEach((ids) => ids.sort());
  return membership;
}

function filterFeatureIndex(index, cardIds) {
  return {
    tokenToCardIds: filterIndexMap(index.tokenToCardIds, cardIds),
    kindToCardIds: filterIndexMap(index.kindToCardIds, cardIds),
  };
}

function filterIndexMap(source, cardIds) {
  return Object.fromEntries(Object.entries(source).map(([key, ids]) => [key, ids.filter((id) => cardIds.has(id))])
    .filter(([, ids]) => ids.length));
}

function compositionCounts(world, featureCatalog) {
  return {
    nodes: world.nodes.length, segments: world.segments.length, signals: world.signals.length,
    actors: world.actors.length, disruptions: world.disruptions.length,
    land: world.renderGeometry.land.length, streets: world.renderGeometry.streets.length,
    buildings: world.renderGeometry.buildings.length, bikeFacilities: world.renderGeometry.bikeFacilities.length,
    featureCards: featureCatalog.cards.length,
  };
}

function packCounts(pack) {
  return {
    nodes: pack.nodes.length, segments: pack.segments.length, signals: pack.signals.length,
    actors: pack.actors.length, disruptions: pack.disruptions.length, streets: pack.renderGeometry.streets.length,
    buildings: pack.renderGeometry.buildings.length, bikeFacilities: pack.renderGeometry.bikeFacilities.length,
    featureCards: pack.featureCards.length, seams: pack.seams.length,
  };
}

function validateBuildConfig(config, world) {
  if (config.schema !== 'simulatte.autonomyRegionBuildConfig.v1') throw new Error(`Unexpected region build schema ${config.schema}`);
  ['id', 'contentVersion'].forEach((key) => requireConfigString(config[key], `config.${key}`));
  ['id', 'compositionId', 'manifestContentVersion']
    .forEach((key) => requireConfigString(config.registry?.[key], `config.registry.${key}`));
  requireConfigString(config.city?.id, 'config.city.id');
  if (config.city.coordinateOriginWgs84.longitude !== world.coordinateSystem.originWgs84.longitude
    || config.city.coordinateOriginWgs84.latitude !== world.coordinateSystem.originWgs84.latitude) {
    throw new Error('Region build city origin must equal the governed world origin');
  }
  const ids = new Set(config.packs.map((row) => row.id));
  if (ids.size !== config.packs.length) throw new Error('Region build pack IDs must be unique');
  config.packs.forEach((row) => row.neighborIds.forEach((id) => {
    if (!ids.has(id)) throw new Error(`Region ${row.id} references unknown neighbor ${id}`);
    const peer = config.packs.find((candidate) => candidate.id === id);
    if (!peer.neighborIds.includes(row.id)) throw new Error(`Region adjacency ${row.id} -> ${id} must be symmetric`);
  }));
}

function requireConfigString(value, pathName) {
  if (typeof value !== 'string' || !value) throw new Error(`${pathName} must be a non-empty string`);
}

function updateManifest({ config, registry, registryPath, registrySha256, world, featureCatalog }) {
  const manifest = readJson(MANIFEST_PATH);
  const registryRelativePath = path.relative(DATA_DIR, registryPath).split(path.sep).join('/');
  if (registryRelativePath === '..' || registryRelativePath.startsWith('../')) {
    throw new Error(`Activated region registry must be under ${DATA_DIR}, received ${registryPath}`);
  }
  manifest.schema = 'simulatte.autonomyDataManifest.v2';
  manifest.contentVersion = config.registry.manifestContentVersion;
  manifest.world.sha256 = sha256(artifactText(world));
  manifest.featureCatalog.sha256 = sha256(artifactText(featureCatalog));
  manifest.regionRegistry = {
    id: registry.id,
    path: `./${registryRelativePath}`,
    sha256: registrySha256,
  };
  manifest.runtime.worldLoadMode = 'verified_region_composition';
  manifest.runtime.entryPath = '/';
  manifest.claimBoundary = `This manifest governs one delivery-bike simulation assembled from independently hashed region packs for ${registry.city.label}. It does not claim live conditions, physical-world driving capability, or control of a real vehicle.`;
  fs.writeFileSync(MANIFEST_PATH, artifactText(manifest));
}

function artifactText(value) {
  return `${JSON.stringify(regionApi.sortValue(value), null, 2)}\n`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hashFile(file) {
  return sha256(fs.readFileSync(file));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function assertHash(label, expected, actual) {
  if (expected !== actual) throw new Error(`${label} SHA-256 expected ${expected}, received ${actual}`);
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack || error);
    process.exit(1);
  }
}

export { compileRegionPacks, containsWgs84, geometryCenter, ownerForPoint, toWgs84 };
