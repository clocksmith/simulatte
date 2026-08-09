(function attachAutonomyWebGpuGeometry(root, factory) {
  const actorGeometry = typeof module === 'object' && module.exports
    ? require('./webgpu-actor-geometry.js')
    : root.SimulatteAutonomyActorGeometry;
  const api = factory(actorGeometry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyGpuGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyWebGpuGeometry(actorGeometry) {
  const FLOATS_PER_VERTEX = actorGeometry.FLOATS_PER_VERTEX;
  const DENSE_PLUGIN_ACTOR_THRESHOLD = 12;
  const PLUGIN_TRANSITION_SECONDS = 0.72;
  const PATH_METRICS_CACHE = new WeakMap();
  const TRIANGULATION_CACHE = new WeakMap();
  const DEFAULT_MATERIAL = Object.freeze([0.02, 0.78]);
  // Overview cameras expose depth-buffer precision limits. Keep every map
  // surface in an explicit band so thin layers do not fight while panning.
  const SURFACE_LAYERS = Object.freeze({
    land: 0,
    park: 0.08,
    street: 0.18,
    facility: 0.28,
    grid: 0.38,
    overlay: 0.46,
  });
  const COLORS = Object.freeze({
    water: [0.014, 0.042, 0.078, 1],
    land: [0.052, 0.12, 0.125, 1],
    park: [0.035, 0.28, 0.17, 1],
    parkPerimeter: [0.25, 1, 0.58, 1],
    road: [0.22, 0.28, 0.32, 1],
    roadMajor: [0.31, 0.38, 0.43, 1],
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
    sun: [1, 0.72, 0.16, 1],
    bulkCoverage: [0.02, 0.16, 0.24, 0.42],
  });
  const PLUGIN_TONES = Object.freeze({
    cyan: [0.14, 0.94, 1, 0.96],
    green: [0.18, 1, 0.55, 0.96],
    amber: [1, 0.7, 0.12, 0.96],
    red: [1, 0.2, 0.24, 0.96],
    magenta: [1, 0.28, 0.78, 0.96],
    violet: [0.62, 0.4, 1, 0.96],
    blue: [0.18, 0.55, 1, 0.96],
    shade: [0.2, 0.17, 0.56, 0.72],
    muted: [0.48, 0.62, 0.66, 0.72],
  });

  function createStaticGeometry(world, { detail = 'full' } = {}) {
    const writer = createWriter();
    if (world.renderGeometry.surfaceOwner === 'plugin') return writer.finish();
    const bounds = world.coordinateSystem.bounds;
    addBox(writer, {
      minimum: [bounds.minimumX - 300, -5, -bounds.maximumY - 300],
      maximum: [bounds.maximumX + 300, -1, -bounds.minimumY + 300],
      color: COLORS.water,
      emissive: 0.08,
    });
    for (const row of world.renderGeometry.land) addFlatPolygon(writer, row.outerRing, SURFACE_LAYERS.land, COLORS.land, 0.05);
    for (const park of world.renderGeometry.parks) {
      addFlatPolygon(writer, park.outerRing, SURFACE_LAYERS.park, COLORS.park, 0.18);
      addRibbon(writer, park.outerRing, 3.2, 0.24, COLORS.parkPerimeter, 0.9);
    }
    for (const street of world.renderGeometry.streets) {
      addRibbon(writer, street.geometry, street.widthM, SURFACE_LAYERS.street, isMajorStreet(street.highway) ? COLORS.roadMajor : COLORS.road, 0.03);
    }
    for (const facility of world.renderGeometry.bikeFacilities) {
      addRibbon(writer, facility.geometry, facility.laneType === 'protected' ? 2.1 : 1.35, SURFACE_LAYERS.facility, COLORS[facility.laneType] || COLORS.connector, 0.55);
    }
    if (detail === 'overview') addOverviewBuildingMasses(writer, world.renderGeometry.buildings);
    else for (const building of world.renderGeometry.buildings) addBuilding(writer, building, detail);
    return writer.finish();
  }

  function createGroundOverlayGeometry(world, reusableWriter = null) {
    const writer = reusableWriter || createWriter();
    writer.reset();
    if (world.renderGeometry.surfaceOwner === 'plugin') return writer.finish();
    addGrid(writer, world.coordinateSystem.bounds, 100, SURFACE_LAYERS.grid);
    return writer.finish();
  }

  function createDynamicGeometry(worldModel, snapshot, tickReceipt, tracePositions, reusableWriter = null, pluginScene = null) {
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
    addPluginPresentation(writer, pluginScene, snapshot);
    worldModel.activeActors(snapshot.state.tick).forEach((actor, index) => {
      actorGeometry.addActor(writer, {
        kind: actor.type,
        point: actor.position,
        heading: actor.heading,
        motionPhase: snapshot.state.tick * 0.42 + index * 1.7,
      });
    });
    const heading = headingFor(snapshot.state.position, routeIds, worldModel, tracePositions);
    if (!snapshot.state.suppressPrimaryActor) {
      actorGeometry.addActor(writer, {
        kind: snapshot.state.embodimentKind || snapshot.state.renderProfile,
        point: snapshot.state.position,
        heading,
        motionPhase: snapshot.state.distanceTraveledM * 2.1,
        gait: snapshot.state.taskType === 'loop' ? snapshot.state.embodimentKind === 'pedestrian' ? 'run' : null : null,
        isPrimary: true,
      });
      addSensorCone(writer, snapshot.state.position, heading, snapshot.state.speedMps);
    }
    const selected = tickReceipt?.bets?.find((row) => row.bet.id === tickReceipt.selectedBetId);
    if (selected) addRibbon(writer, [snapshot.state.position, selected.bet.prediction.endPosition], 0.85, 1.1, COLORS.prediction, 1.2);
    return writer.finish();
  }

  function createPluginStaticGeometry(scene, reusableWriter = null, options = {}) {
    const writer = reusableWriter || createWriter();
    writer.reset();
    addPluginStaticPresentation(writer, scene, options);
    return writer.finish();
  }

  function createPluginOverlayGeometry(scene, reusableWriter = null) {
    const writer = reusableWriter || createWriter();
    writer.reset();
    addPluginOverlayPresentation(writer, scene);
    return writer.finish();
  }

  function createPluginShadowGeometry(scene, reusableWriter = null) {
    const writer = reusableWriter || createWriter();
    writer.reset();
    addPluginShadowPresentation(writer, scene);
    return writer.finish();
  }

  function createPluginDynamicGeometry(scene, snapshot, reusableWriter = null, animationTimeSeconds = null, transitionActors = null) {
    const writer = reusableWriter || createWriter();
    writer.reset();
    addPluginDynamicPresentation(writer, scene, snapshot, animationTimeSeconds, transitionActors);
    return writer.finish();
  }

  function addPluginPresentation(writer, scene, snapshot) {
    addPluginStaticPresentation(writer, scene);
    addPluginDynamicPresentation(writer, scene, snapshot);
  }

  function addPluginStaticPresentation(writer, scene, { excludeShadows = false, excludeAreas = false } = {}) {
    if (!scene) return;
    scene.areas.forEach((row) => {
      if (excludeShadows && row.semanticKind === 'occlusion.shadow-length') return;
      if (excludeAreas && row.semanticKind !== 'occlusion.shadow-length') return;
      if (row.isVolume) {
        addExtrudedPolygon(writer, row.points, row.heightM, semanticColor(row, 'fill'), row.intensity);
      } else {
        const fillColor = row.semanticKind === 'occlusion.shadow-length'
          ? withAlpha(semanticColor(row, 'fill'), 0.22)
          : semanticColor(row, 'fill');
        addFlatPolygon(writer, row.points, row.heightM, fillColor, row.intensity);
        if (row.semanticKind === 'occlusion.shadow-length' && row.points.length > 2) {
          addRibbon(
            writer,
            [...row.points, row.points[0]],
            2.2,
            row.heightM + 0.03,
            withAlpha(semanticColor(row), 0.38),
            0.18
          );
        }
      }
    });
    scene.paths.forEach((row) => addRibbon(writer, row.points, row.widthM, 0.92, semanticColor(row), row.intensity));
    scene.markers.forEach((row) => {
      if (row.semanticKind === 'person-residences') {
        addTinyNode(writer, row.point, semanticColor(row), row.radiusM, row.intensity);
        return;
      }
      addBeacon(writer, row.point, semanticColor(row), row.heightM, row.radiusM, row.intensity);
    });
    // Geospatial (v3) primitives are already projected into planar scene points by the
    // presentation compiler, so they draw with the same beacon/ribbon/polygon builders.
    (scene.choropleths || []).forEach((row) => addFlatPolygon(writer, row.points, 3, semanticColor(row, 'fill'), row.intensity));
    (scene.geoAreas || []).forEach((row) => addFlatPolygon(writer, row.points, row.heightM, semanticColor(row, 'fill'), row.intensity));
    (scene.geoPaths || []).forEach((row) => addRibbon(writer, row.points, row.widthM, 0.92, semanticColor(row), row.intensity));
    (scene.geoMarkers || []).forEach((row) => addBeacon(writer, row.point, semanticColor(row), row.heightM, row.radiusM, row.intensity));
    if (scene.sun) addOrb(writer, scene.sun.worldPosition, scene.sun.radiusM, COLORS.sun, scene.sun.intensity);
  }

  function addPluginOverlayPresentation(writer, scene) {
    if (!scene) return;
    const addOverlay = (row) => {
      if (row.isVolume || row.semanticKind === 'occlusion.shadow-length') return;
      if (row.semanticKind === 'scenario-coverage-area') {
        if (row.points.length > 2) {
          addFlatPolygon(writer, row.points, SURFACE_LAYERS.overlay, COLORS.bulkCoverage, 0.1);
          addRibbon(
            writer,
            [...row.points, row.points[0]],
            4.5,
            SURFACE_LAYERS.overlay + 0.012,
            withAlpha(semanticColor(row, 'fill'), 0.52),
            0.08,
          );
        }
        return;
      }
      addFlatPolygon(
        writer,
        row.points,
        Math.max(SURFACE_LAYERS.overlay, row.heightM || 0.4),
        withAlpha(semanticColor(row, 'fill'), 0.3),
        Math.min(0.28, row.intensity || 0),
      );
    };
    scene.areas.forEach(addOverlay);
    (scene.choropleths || []).forEach(addOverlay);
    (scene.geoAreas || []).forEach(addOverlay);
  }

  function addPluginShadowPresentation(writer, scene) {
    if (!scene) return;
    scene.areas.forEach((row) => {
      if (row.semanticKind !== 'occlusion.shadow-length' || row.points.length <= 2) return;
      const fillColor = withAlpha(semanticColor(row, 'fill'), 0.28);
      addFlatPolygon(writer, row.points, Math.max(SURFACE_LAYERS.grid + 0.012, row.heightM || 0.4), fillColor, Math.max(0.22, row.intensity || 0));
      addRibbon(
        writer,
        [...row.points, row.points[0]],
        2.2,
        Math.max(SURFACE_LAYERS.grid + 0.014, (row.heightM || 0.4) + 0.03),
        withAlpha(semanticColor(row), 0.48),
        0.22,
      );
    });
  }

  function addPluginDynamicPresentation(writer, scene, snapshot, animationTimeSeconds = null, transitionActors = null) {
    if (!scene) return;
    const elapsedSeconds = Number.isFinite(animationTimeSeconds)
      ? Math.max(0, animationTimeSeconds)
      : Number(snapshot.state.simulatedTimeSeconds || 0);
    const usesDenseActorSignals = scene.actors.length > DENSE_PLUGIN_ACTOR_THRESHOLD;
    scene.actors.forEach((row, index) => {
      const totalPathM = pathMetrics(row.points).total;
      const visualSpeedMps = totalPathM > 0
        ? Math.max(Math.abs(Number(row.speedMps) || 0), totalPathM * 0.24)
        : 0;
      const transitionFrom = transitionActors?.get(row.id);
      const pose = transitionFrom && row.points.length === 1
        ? poseBetweenPoints(transitionFrom, row.points[0], Math.min(1, elapsedSeconds / PLUGIN_TRANSITION_SECONDS))
        : poseAlongPath(row.points, row.phaseOffsetM + elapsedSeconds * visualSpeedMps);
      if (row.kind !== 'pedestrian') {
        addBeacon(writer, pose.point, semanticColor(row), row.isSelected ? 12 : 5, row.isSelected ? 3.2 : 1.8, row.isSelected ? 1.2 : 0.72);
      }
      if (usesDenseActorSignals && !row.isSelected) return;
      actorGeometry.addActor(writer, {
        kind: row.kind,
        point: pose.point,
        heading: pose.heading,
        motionPhase: elapsedSeconds * 3.2 + index * 1.7,
        isPrimary: row.isSelected,
      });
    });
  }

  function poseAlongPath(points, distanceM) {
    const metrics = pathMetrics(points);
    const { lengths, total } = metrics;
    let remaining = total ? ((distanceM % total) + total) % total : 0;
    for (let index = 0; index < lengths.length; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (remaining <= lengths[index] || index === lengths.length - 1) {
        const ratio = lengths[index] ? remaining / lengths[index] : 0;
        return {
          point: { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio },
          heading: Math.atan2(end.y - start.y, end.x - start.x),
        };
      }
      remaining -= lengths[index];
    }
    return { point: { ...points[0] }, heading: 0 };
  }

  function poseBetweenPoints(from, to, progress) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return {
      point: { x: from.x + dx * progress, y: from.y + dy * progress },
      heading: Math.atan2(dy, dx),
    };
  }

  function pathMetrics(points) {
    if (points && typeof points === 'object') {
      const cached = PATH_METRICS_CACHE.get(points);
      if (cached) return cached;
    }
    const lengths = [];
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      lengths.push(length);
      total += length;
    }
    const metrics = Object.freeze({ lengths: Object.freeze(lengths), total });
    if (points && typeof points === 'object') PATH_METRICS_CACHE.set(points, metrics);
    return metrics;
  }

  function tone(id) {
    return PLUGIN_TONES[id] || PLUGIN_TONES.muted;
  }

  function semanticColor(row, opacity = 'stroke') {
    const value = row.style?.color;
    if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value)) return tone(row.tone);
    return Object.freeze([
      Number.parseInt(value.slice(1, 3), 16) / 255,
      Number.parseInt(value.slice(3, 5), 16) / 255,
      Number.parseInt(value.slice(5, 7), 16) / 255,
      Number(opacity === 'fill' ? row.style.fillOpacity ?? 1 : row.style.strokeOpacity ?? 1),
    ]);
  }

  function withAlpha(color, alpha) {
    return [color[0], color[1], color[2], Math.max(0, Math.min(1, alpha))];
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
    const source = [...points];
    if (source.length < 2) return;
    const closed = source.length > 2 && distance2(source[0], source.at(-1)) < 0.001;
    const path = closed ? source.slice(0, -1) : openRing(source);
    if (path.length < 2) return;
    const half = width / 2;
    const left = [];
    const right = [];
    for (let index = 0; index < path.length; index += 1) {
      const point = path[index];
      const previous = path[(index + path.length - 1) % path.length];
      const next = path[(index + 1) % path.length];
      const incoming = normalize2(point.x - previous.x, point.y - previous.y);
      const outgoing = normalize2(next.x - point.x, next.y - point.y);
      const startTangent = closed || index > 0 ? incoming : outgoing;
      const endTangent = closed || index < path.length - 1 ? outgoing : incoming;
      const startNormal = { x: -startTangent.y, y: startTangent.x };
      const endNormal = { x: -endTangent.y, y: endTangent.x };
      const miter = normalize2(startNormal.x + endNormal.x, startNormal.y + endNormal.y, endNormal);
      const scale = clamp2(half / dot2(miter, endNormal), -half * 4, half * 4);
      left.push({ x: point.x + miter.x * scale, y: point.y + miter.y * scale });
      right.push({ x: point.x - miter.x * scale, y: point.y - miter.y * scale });
    }
    const segmentCount = closed ? path.length : path.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const nextIndex = (index + 1) % path.length;
      const aPoint = left[index];
      const bPoint = right[index];
      const cPoint = right[nextIndex];
      const dPoint = left[nextIndex];
      const a = [aPoint.x, height, -aPoint.y];
      const b = [bPoint.x, height, -bPoint.y];
      const c = [cPoint.x, height, -cPoint.y];
      const d = [dPoint.x, height, -dPoint.y];
      writer.triangle(a, b, c, [0, 1, 0], color, emissive);
      writer.triangle(a, c, d, [0, 1, 0], color, emissive);
    }
  }

  function addFlatPolygon(writer, points, height, color, emissive = 0) {
    const vertices = openRing(points).map((point) => [point.x, height, -point.y]);
    triangulate(points).forEach(([a, b, c]) => writer.triangle(vertices[a], vertices[b], vertices[c], [0, 1, 0], color, emissive));
  }

  function addExtrudedPolygon(writer, sourcePoints, sourceHeight, color, emissive = 0) {
    const points = openRing(sourcePoints);
    if (points.length < 3) return;
    const height = Number.isFinite(sourceHeight) ? Math.max(0.35, sourceHeight) : 0.35;
    const roofVertices = points.map((point) => [point.x, height, -point.y]);
    triangulate(points).forEach(([a, b, c]) => (
      writer.triangle(roofVertices[a], roofVertices[b], roofVertices[c], [0, 1, 0], color, emissive)
    ));
    const sideColor = [
      color[0] * 0.58,
      color[1] * 0.58,
      color[2] * 0.58,
      color[3],
    ];
    for (let index = 0; index < points.length; index += 1) {
      const next = (index + 1) % points.length;
      const a = [points[index].x, 0.02, -points[index].y];
      const b = [points[next].x, 0.02, -points[next].y];
      const c = [points[next].x, height, -points[next].y];
      const d = [points[index].x, height, -points[index].y];
      const normal = faceNormal(a, b, c);
      writer.triangle(a, b, c, normal, sideColor, emissive * 0.65);
      writer.triangle(a, c, d, normal, sideColor, emissive * 0.65);
    }
  }

  function addBuilding(writer, building, detail = 'full') {
    const sourcePoints = openRing(building.footprint);
    const points = detail === 'overview' ? overviewBuildingFootprint(sourcePoints) : sourcePoints;
    if (points.length < 3) return;
    const height = Number.isFinite(building.heightM) ? Math.max(3, building.heightM) : 3;
    const roofColor = buildingColor(height, true);
    const sideColor = buildingColor(height, false);
    if (detail === 'overview') {
      // At city scale the roof silhouette carries the useful signal. Omitting
      // parcel walls removes the hidden-face overdraw that otherwise dominates
      // the overview pass; POV remains full-fidelity below.
      addFlatPolygon(writer, points, height, roofColor, 0.05);
      return;
    }
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

  // Individual parcel edges are below pixel resolution at overview distance.
  // Preserve each building's extent, height, and material contrast while
  // collapsing irregular footprints to four corners. Close cameras keep the
  // exact source footprint.
  function overviewBuildingFootprint(points) {
    if (points.length <= 4) return points;
    let minimumX = Infinity;
    let maximumX = -Infinity;
    let minimumY = Infinity;
    let maximumY = -Infinity;
    points.forEach((point) => {
      minimumX = Math.min(minimumX, point.x);
      maximumX = Math.max(maximumX, point.x);
      minimumY = Math.min(minimumY, point.y);
      maximumY = Math.max(maximumY, point.y);
    });
    return [
      { x: minimumX, y: minimumY },
      { x: maximumX, y: minimumY },
      { x: maximumX, y: maximumY },
      { x: minimumX, y: maximumY },
    ];
  }

  function addOverviewBuildingMasses(writer, buildings) {
    const CELL_SIZE_M = 42;
    const cells = new Map();
    buildings.forEach((building) => {
      const points = openRing(building.footprint);
      if (points.length < 3) return;
      let minimumX = Infinity;
      let maximumX = -Infinity;
      let minimumY = Infinity;
      let maximumY = -Infinity;
      points.forEach((point) => {
        minimumX = Math.min(minimumX, point.x);
        maximumX = Math.max(maximumX, point.x);
        minimumY = Math.min(minimumY, point.y);
        maximumY = Math.max(maximumY, point.y);
      });
      const centerX = (minimumX + maximumX) / 2;
      const centerY = (minimumY + maximumY) / 2;
      const key = `${Math.floor(centerX / CELL_SIZE_M)}:${Math.floor(centerY / CELL_SIZE_M)}`;
      const cell = cells.get(key) || {
        minimumX: centerX,
        maximumX: centerX,
        minimumY: centerY,
        maximumY: centerY,
        heightM: 3,
      };
      cell.minimumX = Math.min(cell.minimumX, minimumX);
      cell.maximumX = Math.max(cell.maximumX, maximumX);
      cell.minimumY = Math.min(cell.minimumY, minimumY);
      cell.maximumY = Math.max(cell.maximumY, maximumY);
      cell.heightM = Math.max(cell.heightM, Number(building.heightM) || 3);
      cells.set(key, cell);
    });
    cells.forEach((cell) => {
      const points = [
        { x: cell.minimumX, y: cell.minimumY },
        { x: cell.maximumX, y: cell.minimumY },
        { x: cell.maximumX, y: cell.maximumY },
        { x: cell.minimumX, y: cell.maximumY },
      ];
      addFlatPolygon(writer, points, cell.heightM, buildingColor(cell.heightM, true), 0.05);
    });
  }

  function addGrid(writer, bounds, spacing, height = SURFACE_LAYERS.grid) {
    // World-space subpixel ribbons shimmer under perspective cameras. A
    // slightly wider, quieter overlay remains legible without competing with
    // the opaque road/building depth pass.
    const color = [0.06, 0.36, 0.42, 0.24];
    const width = 1.1;
    for (let x = Math.ceil(bounds.minimumX / spacing) * spacing; x <= bounds.maximumX; x += spacing) {
      addRibbon(writer, [{ x, y: bounds.minimumY }, { x, y: bounds.maximumY }], width, height, color, 0.18);
    }
    for (let y = Math.ceil(bounds.minimumY / spacing) * spacing; y <= bounds.maximumY; y += spacing) {
      addRibbon(writer, [{ x: bounds.minimumX, y }, { x: bounds.maximumX, y }], width, height, color, 0.18);
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

  function addBeacon(writer, point, color, height, radius, emissive = 1.25) {
    addBox(writer, {
      minimum: [point.x - radius, 0.2, -point.y - radius],
      maximum: [point.x + radius, height, -point.y + radius],
      color,
      emissive,
    });
  }

  function addTinyNode(writer, point, color, radius, emissive = 0.25) {
    const x = point.x;
    const z = -point.y;
    const y = 0.32;
    const normal = [0, 1, 0];
    writer.triangle(
      [x, y, z - radius],
      [x + radius, y, z],
      [x, y, z + radius],
      normal,
      color,
      emissive
    );
    writer.triangle(
      [x, y, z - radius],
      [x, y, z + radius],
      [x - radius, y, z],
      normal,
      color,
      emissive
    );
  }

  function addOrb(writer, center, radius, color, emissive = 1.8) {
    const [x, y, z] = center;
    const points = [
      [x + radius, y, z], [x - radius, y, z],
      [x, y + radius, z], [x, y - radius, z],
      [x, y, z + radius], [x, y, z - radius],
    ];
    const faces = [
      [2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0],
      [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5],
    ];
    faces.forEach(([a, b, c]) => writer.triangle(points[a], points[b], points[c], faceNormal(points[a], points[b], points[c]), color, emissive, [0, 0.18]));
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
    if (pointsWithClosure && typeof pointsWithClosure === 'object') {
      const cached = TRIANGULATION_CACHE.get(pointsWithClosure);
      if (cached) return cached;
    }
    const points = openRing(pointsWithClosure);
    if (points.length < 3) return cacheTriangulation(pointsWithClosure, []);
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
    return cacheTriangulation(pointsWithClosure, triangles);
  }

  function cacheTriangulation(points, triangles) {
    const value = Object.freeze(triangles.map((row) => Object.freeze(row)));
    if (points && typeof points === 'object') TRIANGULATION_CACHE.set(points, value);
    return value;
  }

  function openRing(points) {
    if (points.length > 1 && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < 0.001) return points.slice(0, -1);
    return [...points];
  }

  function distance2(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function normalize2(x, y, fallback = { x: 1, y: 0 }) {
    const length = Math.hypot(x, y);
    return length > 1e-9 ? { x: x / length, y: y / length } : fallback;
  }

  function dot2(left, right) {
    return left.x * right.x + left.y * right.y;
  }

  function clamp2(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
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
    PLUGIN_TONES,
    SURFACE_LAYERS,
    SUPPORTED_ACTOR_KINDS: actorGeometry.SUPPORTED_ACTOR_KINDS,
    addExtrudedPolygon,
    addRibbon,
    createDynamicGeometry,
    createPluginDynamicGeometry,
    pathMetrics,
    createPluginStaticGeometry,
    createPluginOverlayGeometry,
    createPluginShadowGeometry,
    createGroundOverlayGeometry,
    createStaticGeometry,
    createWriter,
    poseAlongPath,
    triangulate,
  };
});
