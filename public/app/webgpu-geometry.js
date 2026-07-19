(function attachAutonomyWebGpuGeometry(root, factory) {
  const actorGeometry = typeof module === 'object' && module.exports
    ? require('./webgpu-actor-geometry.js')
    : root.SimulatteAutonomyActorGeometry;
  const api = factory(actorGeometry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyGpuGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyWebGpuGeometry(actorGeometry) {
  const FLOATS_PER_VERTEX = actorGeometry.FLOATS_PER_VERTEX;
  const DEFAULT_MATERIAL = Object.freeze([0.02, 0.78]);
  const COLORS = Object.freeze({
    water: [0.014, 0.042, 0.078, 1],
    land: [0.052, 0.12, 0.125, 1],
    park: [0.035, 0.28, 0.17, 1],
    parkPerimeter: [0.25, 1, 0.58, 1],
    road: [0.16, 0.21, 0.25, 1],
    roadMajor: [0.23, 0.29, 0.33, 1],
    protected: [0.05, 0.9, 0.66, 1],
    shared: [0.22, 0.55, 0.65, 1],
    connector: [0.5, 0.52, 0.62, 1],
    route: [0.15, 0.93, 1, 1],
    trace: [0.98, 0.7, 0.12, 1],
    blocked: [1, 0.18, 0.22, 1],
    agent: [1, 0.83, 0.2, 1],
    runner: [0.98, 0.36, 0.78, 1],
    actor: [1, 0.22, 0.43, 1],
    destination: [0.58, 0.35, 1, 1],
    signalGreen: [0.15, 1, 0.53, 1],
    signalRed: [1, 0.18, 0.22, 1],
    prediction: [1, 0.25, 0.86, 0.72],
    sensor: [0.1, 0.7, 1, 0.14],
  });

  function createStaticGeometry(world) {
    const writer = createWriter();
    const bounds = world.coordinateSystem.bounds;
    addBox(writer, {
      minimum: [bounds.minimumX - 300, -5, -bounds.maximumY - 300],
      maximum: [bounds.maximumX + 300, -1, -bounds.minimumY + 300],
      color: COLORS.water,
      emissive: 0.08,
    });
    for (const row of world.renderGeometry.land) addFlatPolygon(writer, row.outerRing, 0, COLORS.land, 0.05);
    for (const park of world.renderGeometry.parks) {
      addFlatPolygon(writer, park.outerRing, 0.1, COLORS.park, 0.18);
      addRibbon(writer, park.outerRing, 3.2, 0.24, COLORS.parkPerimeter, 0.9);
    }
    for (const street of world.renderGeometry.streets) {
      addRibbon(writer, street.geometry, street.widthM, 0.06, isMajorStreet(street.highway) ? COLORS.roadMajor : COLORS.road, 0.03);
    }
    for (const facility of world.renderGeometry.bikeFacilities) {
      addRibbon(writer, facility.geometry, facility.laneType === 'protected' ? 2.1 : 1.35, 0.16, COLORS[facility.laneType] || COLORS.connector, 0.55);
    }
    for (const building of world.renderGeometry.buildings) addBuilding(writer, building);
    addGrid(writer, bounds, 100);
    return writer.finish();
  }

  function createDynamicGeometry(worldModel, snapshot, tickReceipt, tracePositions, reusableWriter = null) {
    const writer = reusableWriter || createWriter();
    writer.reset();
    const routeIds = snapshot.route?.segmentIds || [];
    routeIds.forEach((id) => addRibbon(writer, worldModel.segment(id).geometry, 9, 0.68, COLORS.route, 1.35));
    if (tracePositions.length > 1) addRibbon(writer, tracePositions, 7, 0.86, COLORS.trace, 1.25);
    worldModel.blockedSegmentIds(snapshot.state.tick).forEach((id) => addRibbon(writer, worldModel.segment(id).geometry, 4.5, 0.72, COLORS.blocked, 1.2));
    if (snapshot.state.taskType === 'delivery') {
      const destinationNodeId = routeIds.length
        ? worldModel.segment(routeIds.at(-1)).toNodeId
        : snapshot.state.currentNodeId;
      const destination = worldModel.node(destinationNodeId).position;
      addBeacon(writer, destination, COLORS.destination, 64, 4.5);
    }
    worldModel.signalRows(snapshot.state.tick).forEach((signal) => {
      const point = worldModel.node(signal.nodeId).position;
      addBeacon(writer, point, signal.state === 'green' ? COLORS.signalGreen : COLORS.signalRed, 28, 2.2);
    });
    worldModel.activeActors(snapshot.state.tick).forEach((actor, index) => {
      actorGeometry.addActor(writer, {
        kind: actor.type,
        point: actor.position,
        heading: actor.heading,
        motionPhase: snapshot.state.tick * 0.42 + index * 1.7,
      });
    });
    const heading = headingFor(snapshot.state.position, routeIds, worldModel, tracePositions);
    actorGeometry.addActor(writer, {
      kind: snapshot.state.embodimentKind || snapshot.state.renderProfile,
      point: snapshot.state.position,
      heading,
      motionPhase: snapshot.state.distanceTraveledM * 2.1,
      gait: snapshot.state.taskType === 'loop' ? snapshot.state.embodimentKind === 'pedestrian' ? 'run' : null : null,
      isPrimary: true,
    });
    addSensorCone(writer, snapshot.state.position, heading, snapshot.state.speedMps);
    const selected = tickReceipt?.bets?.find((row) => row.bet.id === tickReceipt.selectedBetId);
    if (selected) addRibbon(writer, [snapshot.state.position, selected.bet.prediction.endPosition], 0.85, 1.1, COLORS.prediction, 1.2);
    return writer.finish();
  }

  function createWriter(initialCapacity = 65536) {
    let values = new Float32Array(initialCapacity);
    let length = 0;
    const ensure = (additional) => {
      if (length + additional <= values.length) return;
      let capacity = values.length;
      while (capacity < length + additional) capacity *= 2;
      const grown = new Float32Array(capacity);
      grown.set(values.subarray(0, length));
      values = grown;
    };
    const vertex = (position, normal, color, emissive = 0, material = DEFAULT_MATERIAL) => {
      ensure(FLOATS_PER_VERTEX);
      values.set(position, length); length += 3;
      values.set(normal, length); length += 3;
      values.set(color, length); length += 4;
      values[length] = emissive; length += 1;
      values.set(material, length); length += 2;
    };
    const triangle = (a, b, c, normal, color, emissive = 0, material = DEFAULT_MATERIAL) => {
      vertex(a, normal, color, emissive, material);
      vertex(b, normal, color, emissive, material);
      vertex(c, normal, color, emissive, material);
    };
    return { get length() { return length; }, reset() { length = 0; }, vertex, triangle, finish: () => values.subarray(0, length) };
  }

  function addRibbon(writer, points, width, height, color, emissive = 0) {
    const half = width / 2;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (!length) continue;
      const nx = -(end.y - start.y) / length * half;
      const ny = (end.x - start.x) / length * half;
      const a = [start.x + nx, height, -start.y - ny];
      const b = [start.x - nx, height, -start.y + ny];
      const c = [end.x - nx, height, -end.y + ny];
      const d = [end.x + nx, height, -end.y - ny];
      writer.triangle(a, b, c, [0, 1, 0], color, emissive);
      writer.triangle(a, c, d, [0, 1, 0], color, emissive);
    }
  }

  function addFlatPolygon(writer, points, height, color, emissive = 0) {
    const vertices = openRing(points).map((point) => [point.x, height, -point.y]);
    triangulate(points).forEach(([a, b, c]) => writer.triangle(vertices[a], vertices[b], vertices[c], [0, 1, 0], color, emissive));
  }

  function addBuilding(writer, building) {
    const points = openRing(building.footprint);
    if (points.length < 3) return;
    const height = Number.isFinite(building.heightM) ? Math.max(3, building.heightM) : 3;
    const roofColor = buildingColor(height, true);
    const sideColor = buildingColor(height, false);
    const vertices = points.map((point) => [point.x, height, -point.y]);
    triangulate(points).forEach(([a, b, c]) => writer.triangle(vertices[a], vertices[b], vertices[c], [0, 1, 0], roofColor, 0.05));
    for (let index = 0; index < points.length; index += 1) {
      const next = (index + 1) % points.length;
      const a = [points[index].x, 0.12, -points[index].y];
      const b = [points[next].x, 0.12, -points[next].y];
      const c = [points[next].x, height, -points[next].y];
      const d = [points[index].x, height, -points[index].y];
      const normal = faceNormal(a, b, c);
      writer.triangle(a, b, c, normal, sideColor, 0.02);
      writer.triangle(a, c, d, normal, sideColor, 0.02);
    }
  }

  function addGrid(writer, bounds, spacing) {
    const color = [0.06, 0.36, 0.42, 0.32];
    for (let x = Math.ceil(bounds.minimumX / spacing) * spacing; x <= bounds.maximumX; x += spacing) {
      addRibbon(writer, [{ x, y: bounds.minimumY }, { x, y: bounds.maximumY }], 0.32, 0.09, color, 0.45);
    }
    for (let y = Math.ceil(bounds.minimumY / spacing) * spacing; y <= bounds.maximumY; y += spacing) {
      addRibbon(writer, [{ x: bounds.minimumX, y }, { x: bounds.maximumX, y }], 0.32, 0.09, color, 0.45);
    }
  }

  function addBox(writer, { minimum, maximum, color, emissive = 0 }) {
    const [x0, y0, z0] = minimum;
    const [x1, y1, z1] = maximum;
    const faces = [
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
    ];
    faces.forEach(([a, b, c, d, normal]) => {
      writer.triangle(a, b, c, normal, color, emissive);
      writer.triangle(a, c, d, normal, color, emissive);
    });
  }

  function addBeacon(writer, point, color, height, radius) {
    addBox(writer, {
      minimum: [point.x - radius, 0.2, -point.y - radius],
      maximum: [point.x + radius, height, -point.y + radius],
      color,
      emissive: 1.25,
    });
  }

  function addSensorCone(writer, point, heading, speedMps) {
    const length = 30 + speedMps * 5;
    const spread = 0.42;
    const origin = [point.x, 0.4, -point.y];
    const ray = (angle) => [point.x + Math.cos(angle) * length, 0.35, -point.y - Math.sin(angle) * length];
    writer.triangle(origin, ray(heading - spread), ray(heading + spread), [0, 1, 0], COLORS.sensor, 0.7);
  }

  function headingFor(position, routeIds, worldModel, tracePositions) {
    if (routeIds.length) {
      const segment = worldModel.segment(routeIds[0]);
      const target = segment.geometry[Math.min(1, segment.geometry.length - 1)];
      return Math.atan2(target.y - position.y, target.x - position.x);
    }
    if (tracePositions.length > 1) {
      const previous = tracePositions.at(-2);
      return Math.atan2(position.y - previous.y, position.x - previous.x);
    }
    return 0;
  }

  function triangulate(pointsWithClosure) {
    const points = openRing(pointsWithClosure);
    if (points.length < 3) return [];
    const indices = points.map((_, index) => index);
    if (signedArea(points) < 0) indices.reverse();
    const triangles = [];
    let guard = points.length * points.length;
    while (indices.length > 3 && guard-- > 0) {
      let earFound = false;
      for (let index = 0; index < indices.length; index += 1) {
        const previous = indices[(index + indices.length - 1) % indices.length];
        const current = indices[index];
        const next = indices[(index + 1) % indices.length];
        if (cross2(points[previous], points[current], points[next]) <= 1e-8) continue;
        const containsPoint = indices.some((candidate) => candidate !== previous && candidate !== current && candidate !== next && pointInTriangle(points[candidate], points[previous], points[current], points[next]));
        if (containsPoint) continue;
        triangles.push([previous, current, next]);
        indices.splice(index, 1);
        earFound = true;
        break;
      }
      if (!earFound) break;
    }
    if (indices.length === 3) triangles.push([indices[0], indices[1], indices[2]]);
    if (!triangles.length) {
      for (let index = 1; index < points.length - 1; index += 1) triangles.push([0, index, index + 1]);
    }
    return triangles;
  }

  function openRing(points) {
    if (points.length > 1 && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < 0.001) return points.slice(0, -1);
    return [...points];
  }

  function signedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      area += points[index].x * next.y - next.x * points[index].y;
    }
    return area / 2;
  }

  function cross2(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function pointInTriangle(point, a, b, c) {
    const one = cross2(point, a, b);
    const two = cross2(point, b, c);
    const three = cross2(point, c, a);
    return (one >= 0 && two >= 0 && three >= 0) || (one <= 0 && two <= 0 && three <= 0);
  }

  function faceNormal(a, b, c) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal) || 1;
    return normal.map((value) => value / length);
  }

  function buildingColor(height, roof) {
    const ratio = Math.min(1, height / 220);
    return roof
      ? [0.23 + ratio * 0.24, 0.4 + ratio * 0.2, 0.5 + ratio * 0.24, 1]
      : [0.1 + ratio * 0.14, 0.23 + ratio * 0.14, 0.3 + ratio * 0.2, 1];
  }

  function isMajorStreet(highway) {
    return ['motorway', 'trunk', 'primary', 'secondary'].includes(highway);
  }

  return {
    ACTOR_MESH_SCHEMA: actorGeometry.ACTOR_MESH_SCHEMA,
    COLORS,
    DEFAULT_MATERIAL,
    FLOATS_PER_VERTEX,
    MATERIAL_MODEL: actorGeometry.MATERIAL_MODEL,
    SUPPORTED_ACTOR_KINDS: actorGeometry.SUPPORTED_ACTOR_KINDS,
    addRibbon,
    createDynamicGeometry,
    createStaticGeometry,
    createWriter,
    triangulate,
  };
});
