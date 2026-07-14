import crypto from 'node:crypto';

const MODES = Object.freeze(['pedestrian', 'scooter', 'car']);
const ROUTED_HIGHWAYS = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'residential', 'unclassified', 'service', 'living_street', 'pedestrian', 'cycleway',
]);

function compileStreetRouteNetwork(overpass, { project, sourceContract, snapshotDate }) {
  const nodesByKey = new Map();
  const segments = [];
  const ways = (overpass.elements || []).filter((row) => {
    const tags = row.tags || {};
    const governedConnector = ['footway', 'path'].includes(tags.highway)
      && (/bridge/i.test(tags.name || '') || ['yes', 'designated'].includes(String(tags.bicycle || '').toLowerCase()));
    return row.type === 'way' && (ROUTED_HIGHWAYS.has(tags.highway) || governedConnector)
      && Array.isArray(row.geometry) && row.geometry.length > 1;
  }).sort((left, right) => left.id - right.id);
  const coordinateCounts = new Map();
  ways.forEach((way) => way.geometry.forEach((point) => {
    const key = coordinateKey(point);
    coordinateCounts.set(key, (coordinateCounts.get(key) || 0) + 1);
  }));
  const nodeFor = (point) => {
    const positionWgs84 = { longitude: roundCoordinate(point.lon), latitude: roundCoordinate(point.lat) };
    const key = `${positionWgs84.longitude.toFixed(7)},${positionWgs84.latitude.toFixed(7)}`;
    if (!nodesByKey.has(key)) {
      nodesByKey.set(key, {
        id: `street-node-${shortHash(`${sourceContract.id}:${snapshotDate}:${key}`, 12)}`,
        label: `Street node ${key}`,
        kind: 'intersection',
        position: project([positionWgs84.longitude, positionWgs84.latitude]),
        positionWgs84,
      });
    }
    return nodesByKey.get(key);
  };
  ways.forEach((way) => {
    const tags = way.tags || {};
    const forwardModes = streetModes(tags);
    if (!forwardModes.length) return;
    const isOneWay = ['yes', '1', 'true'].includes(String(tags.oneway || '').toLowerCase()) || tags.junction === 'roundabout';
    const isReverseOnly = String(tags.oneway || '').toLowerCase() === '-1';
    const forward = isReverseOnly ? ['pedestrian'].filter((mode) => forwardModes.includes(mode)) : forwardModes;
    const reverse = isOneWay ? ['pedestrian'].filter((mode) => forwardModes.includes(mode)) : forwardModes;
    splitWayAtJunctions(way.geometry, coordinateCounts).forEach((points, partIndex) => {
      const geometryWgs84 = points.map((point) => ({ longitude: roundCoordinate(point.lon), latitude: roundCoordinate(point.lat) }));
      const geometry = points.map((point) => project([point.lon, point.lat]));
      const from = nodeFor(points[0]);
      const to = nodeFor(points.at(-1));
      if (from.id === to.id || polylineLength(geometry) < 0.5) return;
      if (forward.length) segments.push(streetNetworkSegment({ way, partIndex, direction: 'ft', geometry, geometryWgs84, from, to, allowedModes: forward, sourceContract, snapshotDate }));
      if (reverse.length) segments.push(streetNetworkSegment({ way, partIndex, direction: 'tf', geometry: [...geometry].reverse(), geometryWgs84: [...geometryWgs84].reverse(), from: to, to: from, allowedModes: reverse, sourceContract, snapshotDate }));
    });
  });
  const nodes = [...nodesByKey.values()].sort(byId);
  segments.push(...compileBridgeTopologyConnectors(nodes, segments, { sourceContract, snapshotDate }));
  return { nodes, segments: segments.sort(byId), nodesById: new Map(nodes.map((row) => [row.id, row])) };
}

function labelStreetLandmarks(network, landmarks, project) {
  const outgoingModes = new Map(network.nodes.map((node) => [node.id, new Set()]));
  const incomingModes = new Map(network.nodes.map((node) => [node.id, new Set()]));
  network.segments.forEach((segment) => segment.allowedModes.forEach((mode) => {
    outgoingModes.get(segment.fromNodeId)?.add(mode);
    incomingModes.get(segment.toNodeId)?.add(mode);
  }));
  const coreNodesByMode = new Map(MODES.map((mode) => [mode, largestStrongComponent(network.nodes, network.segments, mode)]));
  const claimedByMode = new Map(MODES.map((mode) => [mode, new Set()]));
  landmarks.forEach((landmark) => {
    const target = project([landmark.longitude, landmark.latitude]);
    MODES.forEach((mode) => {
      const node = network.nodes.filter((row) => coreNodesByMode.get(mode).has(row.id)
        && outgoingModes.get(row.id)?.has(mode) && incomingModes.get(row.id)?.has(mode)
        && !claimedByMode.get(mode).has(row.id))
        .sort((left, right) => distance(left.position, target) - distance(right.position, target) || left.id.localeCompare(right.id))[0];
      if (!node) return;
      node.label = landmark.label;
      node.kind = landmark.kind;
      node.landmark = node.landmark || {
        requestedWgs84: { longitude: landmark.longitude, latitude: landmark.latitude },
        snapDistanceM: round(distance(node.position, target)),
        source: 'scenario_place_grounding',
        modes: [],
      };
      node.landmark.modes = [...new Set([...(node.landmark.modes || []), mode])].sort();
      claimedByMode.get(mode).add(node.id);
    });
  });
}

function compileBridgeTopologyConnectors(nodes, segments, { sourceContract, snapshotDate }) {
  const nodeById = new Map(nodes.map((row) => [row.id, row]));
  const rows = [];
  for (const mode of ['pedestrian', 'scooter']) {
    const component = weakComponents(nodes, segments, mode);
    const bridgeNodeIds = new Set(segments.filter((segment) => segment.allowedModes.includes(mode)
      && /williamsburg bridge/i.test(segment.source?.street || '')).flatMap((segment) => [segment.fromNodeId, segment.toNodeId]));
    const candidates = [];
    bridgeNodeIds.forEach((bridgeNodeId) => {
      const bridgeNode = nodeById.get(bridgeNodeId);
      nodes.forEach((node) => {
        if (node.id === bridgeNodeId || component.get(node.id) === component.get(bridgeNodeId)) return;
        const distanceM = distance(bridgeNode.position, node.position);
        if (distanceM <= 15) candidates.push({ bridgeNode, node, distanceM });
      });
    });
    candidates.sort((left, right) => left.distanceM - right.distanceM
      || left.bridgeNode.id.localeCompare(right.bridgeNode.id) || left.node.id.localeCompare(right.node.id));
    const roots = new Map([...new Set(component.values())].map((id) => [id, id]));
    const find = (id) => roots.get(id) === id ? id : (roots.set(id, find(roots.get(id))), roots.get(id));
    const selectedRows = [];
    for (const candidate of candidates) {
      const left = find(component.get(candidate.bridgeNode.id));
      const right = find(component.get(candidate.node.id));
      if (left === right) continue;
      roots.set(left < right ? right : left, left < right ? left : right);
      selectedRows.push(candidate);
      if (selectedRows.length === 8) break;
    }
    selectedRows.forEach((selected, selectedIndex) => ['ft', 'tf'].forEach((direction) => {
      const from = direction === 'ft' ? selected.bridgeNode : selected.node;
      const to = direction === 'ft' ? selected.node : selected.bridgeNode;
      const geometryWgs84 = [from.positionWgs84, to.positionWgs84];
      rows.push({
        id: `street-route-williamsburg-bridge-stitch-${mode}-${selectedIndex}-${direction}`,
        fromNodeId: from.id,
        toNodeId: to.id,
        geometry: [{ ...from.position }, { ...to.position }],
        lengthM: round(selected.distanceM),
        laneType: 'connector',
        allowedModes: [mode],
        speedLimitMps: mode === 'pedestrian' ? 2 : 5.5,
        riskScore: 0.12,
        cardIds: ['street.connector'],
        source: {
          datasetId: sourceContract.id,
          wayId: 'williamsburg-bridge-topology-stitch-v1',
          street: 'Williamsburg Bridge',
          highway: 'connector',
          direction,
          sourceRevision: snapshotDate,
          surface: null,
          sidewalk: null,
          accessPolicy: 'named_bridge_endpoint_snap_within_15m_v1',
          accessibilityProof: 'not_established_by_topology_stitch',
          geometryWgs84Sha256: sha256(Buffer.from(JSON.stringify(geometryWgs84))),
        },
      });
    }));
  }
  return rows;
}

function largestStrongComponent(nodes, segments, mode) {
  const eligible = new Set();
  const outgoing = new Map();
  const incoming = new Map();
  segments.filter((segment) => segment.allowedModes.includes(mode)).forEach((segment) => {
    eligible.add(segment.fromNodeId);
    eligible.add(segment.toNodeId);
    if (!outgoing.has(segment.fromNodeId)) outgoing.set(segment.fromNodeId, []);
    if (!incoming.has(segment.toNodeId)) incoming.set(segment.toNodeId, []);
    outgoing.get(segment.fromNodeId).push(segment.toNodeId);
    incoming.get(segment.toNodeId).push(segment.fromNodeId);
  });
  const visited = new Set();
  const order = [];
  [...eligible].sort().forEach((start) => {
    if (visited.has(start)) return;
    const stack = [[start, false]];
    while (stack.length) {
      const [id, closing] = stack.pop();
      if (closing) { order.push(id); continue; }
      if (visited.has(id)) continue;
      visited.add(id);
      stack.push([id, true]);
      [...(outgoing.get(id) || [])].sort().reverse().forEach((next) => {
        if (!visited.has(next)) stack.push([next, false]);
      });
    }
  });
  const assigned = new Set();
  const components = [];
  order.reverse().forEach((start) => {
    if (assigned.has(start)) return;
    const rows = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length) {
      const id = stack.pop();
      rows.push(id);
      (incoming.get(id) || []).forEach((next) => {
        if (!assigned.has(next)) { assigned.add(next); stack.push(next); }
      });
    }
    components.push(rows);
  });
  components.sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
  return new Set(components[0] || []);
}

function weakComponents(nodes, segments, mode) {
  const parent = new Map(nodes.map((node) => [node.id, node.id]));
  const find = (id) => parent.get(id) === id ? id : (parent.set(id, find(parent.get(id))), parent.get(id));
  const join = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  };
  segments.filter((segment) => segment.allowedModes.includes(mode)).forEach((segment) => join(segment.fromNodeId, segment.toNodeId));
  return new Map(nodes.map((node) => [node.id, find(node.id)]));
}

function splitWayAtJunctions(points, coordinateCounts) {
  const rows = [];
  let start = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    if ((coordinateCounts.get(coordinateKey(points[index])) || 0) < 2) continue;
    rows.push(points.slice(start, index + 1));
    start = index;
  }
  rows.push(points.slice(start));
  return rows.filter((row) => row.length > 1);
}

function streetModes(tags) {
  const highway = tags.highway;
  const access = String(tags.access || '').toLowerCase();
  const foot = String(tags.foot || '').toLowerCase();
  const bicycle = String(tags.bicycle || '').toLowerCase();
  const motor = String(tags.motor_vehicle || tags.vehicle || '').toLowerCase();
  const modes = [];
  if (!['motorway', 'trunk'].includes(highway) && access !== 'no' && foot !== 'no') modes.push('pedestrian');
  if (['cycleway', 'footway', 'path', 'living_street', 'residential', 'service', 'unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link'].includes(highway)
    && access !== 'no' && bicycle !== 'no') modes.push('scooter');
  if (!['pedestrian', 'cycleway'].includes(highway) && access !== 'no' && motor !== 'no') modes.push('car');
  return modes;
}

function streetNetworkSegment({ way, partIndex, direction, geometry: sourceGeometry, geometryWgs84, from, to, allowedModes, sourceContract, snapshotDate }) {
  const geometry = sourceGeometry.map((point) => ({ ...point }));
  geometry[0] = { ...from.position };
  geometry[geometry.length - 1] = { ...to.position };
  const highway = way.tags?.highway || 'unclassified';
  const laneType = ['cycleway', 'footway', 'path'].includes(highway) ? 'protected' : highway === 'pedestrian' ? 'connector' : 'shared';
  return {
    id: `street-route-${way.id}-${partIndex}-${direction}`,
    fromNodeId: from.id,
    toNodeId: to.id,
    geometry,
    lengthM: round(polylineLength(geometry)),
    laneType,
    allowedModes: [...allowedModes].sort(),
    speedLimitMps: streetRouteSpeed(highway, way.tags?.maxspeed),
    riskScore: streetRouteRisk(highway),
    cardIds: [laneType === 'protected' ? 'street.protected-lane' : laneType === 'shared' ? 'street.shared-lane' : 'street.connector'],
    source: {
      datasetId: sourceContract.id,
      wayId: String(way.id),
      partIndex,
      street: way.tags?.name || null,
      highway,
      direction,
      sourceRevision: snapshotDate,
      surface: way.tags?.surface || null,
      sidewalk: way.tags?.sidewalk || null,
      accessPolicy: 'mode_rules_from_pinned_osm_tags_v1',
      accessibilityProof: 'not_established_by_street_centerline',
      geometryWgs84Sha256: sha256(Buffer.from(JSON.stringify(geometryWgs84))),
    },
  };
}

function streetRouteSpeed(highway, explicit) {
  const parsed = Number.parseFloat(String(explicit || '').replace(/[^0-9.].*$/, ''));
  if (Number.isFinite(parsed) && parsed > 0) return round(Math.min(parsed * 0.44704, 15));
  return ({ motorway: 15, trunk: 13, primary: 11, secondary: 10, tertiary: 9, residential: 8, unclassified: 7, service: 5, living_street: 4, pedestrian: 2, cycleway: 6 })[highway] || 6;
}

function streetRouteRisk(highway) {
  return ({ motorway: 0.9, trunk: 0.8, primary: 0.65, secondary: 0.5, tertiary: 0.38, residential: 0.22, unclassified: 0.3, service: 0.2, living_street: 0.12, pedestrian: 0.05, cycleway: 0.07 })[highway] || 0.4;
}

function coordinateKey(point) {
  return `${roundCoordinate(point.lon).toFixed(7)},${roundCoordinate(point.lat).toFixed(7)}`;
}

function polylineLength(points) {
  return points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function round(value) {
  return Number(Number(value).toFixed(6));
}

function roundCoordinate(value) {
  return Number(Number(value).toFixed(7));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function shortHash(value, length) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}

export { compileStreetRouteNetwork, labelStreetLandmarks, largestStrongComponent, streetModes };
