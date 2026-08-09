(function attachPluginPresentationCompiler(root, factory) {
  const geographyApi = typeof module === 'object' && module.exports
    ? require('../platform/plugin-host/plugin-geography.js')
    : root.SimulattePluginGeography;
  const compositorApi = typeof module === 'object' && module.exports
    ? require('../platform/render/semantic-compositor.js')
    : root.SimulatteSemanticCompositor;
  const api = factory(geographyApi, compositorApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginPresentationCompiler(geographyApi, compositorApi) {
  const SCHEMA = 'simulatte.compiledPluginPresentation.v1';
  const PROJECTION_CACHE = new WeakMap();
  const SEMANTIC_GEOMETRY_CACHE = new WeakMap();

  function projectionForWorld(worldModel) {
    if (!geographyApi || typeof geographyApi.createProjection !== 'function') return null;
    const world = worldModel && worldModel.world;
    const projection = world && world.coordinateSystem && world.coordinateSystem.projection;
    const projectionSource = projection || geographyApi.projectionFromWorld(world);
    if (projectionSource && typeof projectionSource === 'object') {
      const cached = PROJECTION_CACHE.get(projectionSource);
      if (cached) return cached;
      const created = geographyApi.createProjection(projectionSource);
      PROJECTION_CACHE.set(projectionSource, created);
      return created;
    }
    return geographyApi.createProjection(projectionSource);
  }

  function compile(contributions, worldModel, options = {}) {
    if (!worldModel || typeof worldModel.node !== 'function' || typeof worldModel.segment !== 'function') {
      throw presentationError('plugin_presentation_world_invalid', 'Presentation compiler expected a world model');
    }
    const rows = Array.isArray(contributions) ? contributions : [];
    const projection = projectionForWorld(worldModel);
    const compiled = {
      schema: SCHEMA,
      markers: [],
      paths: [],
      actors: [],
      areas: [],
      sun: null,
      cameraTargets: [],
      geoMarkers: [],
      geoPaths: [],
      geoAreas: [],
      choropleths: [],
      labels: [],
      compositorReceipts: [],
    };
    rows.forEach(({ pluginId, presentation }) => {
      const namespace = (id) => `plugin:${pluginId}:${id}`;
      if (presentation.schema === 'simulatte.pluginPresentation.v4') {
        compileSemantic(compiled, presentation, pluginId, namespace, projection, worldModel, options);
        return;
      }
      if (presentation.schema === 'simulatte.pluginPresentation.v3') {
        compileGeospatial(compiled, presentation, pluginId, namespace, projection);
      }
      presentation.markers.forEach((row) => compiled.markers.push(Object.freeze({
        ...row,
        id: namespace(row.id),
        pluginId,
        point: clonePoint(resolveNode(worldModel, pluginId, row.nodeId).position),
      })));
      presentation.paths.forEach((row) => compiled.paths.push(Object.freeze({
        ...row,
        id: namespace(row.id),
        pluginId,
        points: Object.freeze(pointsForSegments(worldModel, pluginId, row.segmentIds, row.id)),
      })));
      presentation.actors.forEach((row) => compiled.actors.push(Object.freeze({
        ...row,
        id: namespace(row.id),
        pluginId,
        points: Object.freeze(pointsForSegments(worldModel, pluginId, row.segmentIds, row.id)),
      })));
      (presentation.areas || []).forEach((row) => compiled.areas.push(Object.freeze({
        ...row,
        id: namespace(row.id),
        pluginId,
        points: Object.freeze(row.points.map((point) => Object.freeze(clonePoint(point)))),
      })));
      if (presentation.sun) {
        if (compiled.sun) throw presentationError('plugin_presentation_sun_conflict', `Plugins ${compiled.sun.pluginId} and ${pluginId} both declared solar lighting`);
        const anchorPoints = pointsForSegments(worldModel, pluginId, presentation.sun.anchorSegmentIds, presentation.sun.id);
        const center = centerForPoints(anchorPoints);
        const azimuth = presentation.sun.azimuthDegrees * Math.PI / 180;
        const elevation = presentation.sun.elevationDegrees * Math.PI / 180;
        const horizontal = Math.cos(elevation) * presentation.sun.distanceM;
        const directionToSun = Object.freeze([
          Math.sin(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          -Math.cos(azimuth) * Math.cos(elevation),
        ]);
        compiled.sun = Object.freeze({
          ...presentation.sun,
          id: namespace(presentation.sun.id),
          pluginId,
          directionToSun,
          worldPosition: Object.freeze([
            center[0] + Math.sin(azimuth) * horizontal,
            Math.max(presentation.sun.radiusM * 1.5, Math.sin(elevation) * presentation.sun.distanceM),
            center[2] - Math.cos(azimuth) * horizontal,
          ]),
        });
      }
      presentation.cameraTargets.forEach((row) => {
        const points = [
          ...row.nodeIds.map((id) => clonePoint(resolveNode(worldModel, pluginId, id).position)),
          ...(row.segmentIds.length ? pointsForSegments(worldModel, pluginId, row.segmentIds, row.id) : []),
        ];
        compiled.cameraTargets.push(Object.freeze({
          id: namespace(row.id),
          sourceId: row.id,
          pluginId,
          kind: 'plugin',
          label: row.label,
          target: Object.freeze(centerForPoints(points)),
          distance: row.distanceM,
        }));
      });
    });
    compiled.counts = Object.freeze({
      plugins: rows.length,
      markers: compiled.markers.length,
      paths: compiled.paths.length,
      actors: compiled.actors.length,
      areas: compiled.areas.length,
      suns: compiled.sun ? 1 : 0,
      cameraTargets: compiled.cameraTargets.length,
      geoMarkers: compiled.geoMarkers.length,
      geoPaths: compiled.geoPaths.length,
      geoAreas: compiled.geoAreas.length,
      choropleths: compiled.choropleths.length,
      labels: compiled.labels.length,
    });
    Object.keys(compiled).filter((key) => Array.isArray(compiled[key])).forEach((key) => Object.freeze(compiled[key]));
    return Object.freeze(compiled);
  }

  function compileSemantic(compiled, presentation, pluginId, namespace, projection, worldModel, options) {
    const layerPoints = new Map();
    const rawLayerPoints = new Map();
    presentation.layers.forEach((layer) => {
      const points = resolveSemanticGeometry(layer.geometry, worldModel, pluginId, projection, layer.id);
      rawLayerPoints.set(layer.id, points);
      layerPoints.set(
        layer.id,
        layer.kind === 'actor'
          ? [pointAlongPath(points, semanticActorProgress(layer.quantity))]
          : points
      );
    });
    const viewport = validViewport(options.viewport) ? options.viewport : { width: 1024, height: 768 };
    const allLayerPoints = [...layerPoints.values()].flat();
    const projectionBounds = boundsForPoints(allLayerPoints);
    const worldUnitsPerPixel = renderScaleForBounds(projectionBounds, viewport);
    const selectedIds = (options.selectedIds || [])
      .map((id) => id.startsWith(`plugin:${pluginId}:`) ? id.slice(`plugin:${pluginId}:`.length) : id)
      .filter((id) => presentation.layers.some((layer) => layer.id === id));
    const composition = compositorApi.createCompositor(options.compositorPolicy).compose(presentation, {
      simulationTimeMs: Number(options.simulationTimeMs || 0),
      selectedIds,
      viewport,
      provenanceReceipt: provenanceReceiptFor(options.provenanceReceipts, pluginId),
      project: (_source, _geometry, layer) => projectLayer(layerPoints.get(layer.id), projectionBounds, viewport),
    });
    compiled.compositorReceipts.push(Object.freeze({
      pluginId,
      ...composition.receipt,
    }));
    composition.labels.forEach((row) => {
      const point = centerPoint(layerPoints.get(row.id) || []);
      compiled.labels.push(Object.freeze({
        ...row,
        id: namespace(row.id),
        sourceId: row.id,
        pluginId,
        point: Object.freeze({ ...point, heightM: 1.8 }),
      }));
    });
    composition.primitives.forEach((primitive) => {
      const points = layerPoints.get(primitive.id)
        || resolveSemanticGeometry(primitive.geometry, worldModel, pluginId, projection, primitive.id);
      const style = primitive.style;
      const common = Object.freeze({
        id: namespace(primitive.id),
        sourceId: primitive.id,
        pluginId,
        label: primitive.label,
        tone: originTone(primitive.provenance.axes.origin),
        style,
        provenance: primitive.provenance,
        memberIds: primitive.memberIds,
        intensity: semanticIntensity(style),
        semanticKind: primitive.quantity?.kind || null,
      });
      if (['point', 'point-cluster', 'label'].includes(primitive.kind)) {
        const radiusM = screenPixelsToWorld(style.radiusPx || 4, worldUnitsPerPixel);
        const markerPoints = primitive.geometry.kind === 'point-cloud' ? points : [points[0]];
        markerPoints.forEach((point, index) => compiled.markers.push(Object.freeze({
          ...common,
          id: markerPoints.length === 1 ? common.id : `${common.id}:point-${index + 1}`,
          point,
          radiusM,
          heightM: radiusM * 3,
        })));
      } else if (primitive.kind === 'actor') {
        const actorKind = semanticActorKind(primitive.quantity?.kind);
        if (actorKind) {
          const progress = semanticActorProgress(primitive.quantity);
          const rawPoints = rawLayerPoints.get(primitive.sourceId || primitive.id) || points;
          const pathPoints = actorPathPoints(
            primitive.sourceId || primitive.id,
            primitive.quantity?.kind,
            rawPoints,
            presentation,
            rawLayerPoints,
          );
          const pathLength = polylineLength(pathPoints);
          compiled.actors.push(Object.freeze({
            ...common,
            points: Object.freeze(pathPoints),
            kind: actorKind,
            speedMps: pathLength > 0 ? pathLength * 0.24 : 0,
            phaseOffsetM: pathLength * progress,
            isSelected: true,
          }));
        } else {
          const radiusM = screenPixelsToWorld(style.radiusPx || 5, worldUnitsPerPixel);
          const progress = semanticActorProgress(primitive.quantity);
          compiled.markers.push(Object.freeze({
            ...common,
            point: pointAlongPath(points, progress),
            radiusM,
            heightM: radiusM * 2,
          }));
        }
      } else if (primitive.kind === 'path') {
        const pathParts = primitive.geometry.kind === 'segments'
          ? primitive.geometry.segmentIds.map((segmentId) => (
            resolveSegment(worldModel, pluginId, segmentId).geometry.map((point) => Object.freeze(clonePoint(point)))
          ))
          : [points];
        pathParts.forEach((pathPoints, index) => compiled.paths.push(Object.freeze({
          ...common,
          id: pathParts.length === 1 ? common.id : `${common.id}:part-${index + 1}`,
          points: Object.freeze(offsetPolyline(
            pathPoints,
            Number(style.laneOffsetPx || 0) * worldUnitsPerPixel
          )),
          widthM: screenPixelsToWorld(style.widthPx || 1, worldUnitsPerPixel),
        })));
      } else if (['area', 'field', 'volume'].includes(primitive.kind)) {
        const isVolume = primitive.kind === 'volume';
        compiled.areas.push(Object.freeze({
          ...common,
          points: Object.freeze(points),
          heightM: isVolume
            ? Math.max(0.35, Number(primitive.quantity?.value || 0))
            : primitive.quantity?.kind === 'occlusion.shadow-length' ? 0.4 : 0.35,
          isVolume,
        }));
      }
    });
    presentation.viewIntents.forEach((intent) => {
      const points = intent.targetIds.flatMap((id) => layerPoints.get(id) || []);
      if (!points.length) return;
      compiled.cameraTargets.push(Object.freeze({
        id: namespace(intent.id),
        sourceId: intent.id,
        pluginId,
        kind: 'plugin',
        label: cameraTargetLabel(presentation.layers, intent),
        target: Object.freeze(centerForPoints(points)),
        distance: distanceForPoints(points),
        viewMode: intent.mode,
        priority: intent.priority,
        reasonEventId: intent.reasonEventId,
      }));
      intent.targetIds.forEach((targetId) => {
        if (compiled.cameraTargets.some((row) => row.id === namespace(targetId))) return;
        const targetPoints = layerPoints.get(targetId) || [];
        if (!targetPoints.length) return;
        compiled.cameraTargets.push(Object.freeze({
          id: namespace(targetId),
          sourceId: targetId,
          pluginId,
          kind: 'plugin',
          label: presentation.layers.find((layer) => layer.id === targetId)?.label || targetId,
          target: Object.freeze(centerForPoints(targetPoints)),
          distance: distanceForPoints(targetPoints),
          viewMode: intent.mode,
          priority: intent.priority,
          reasonEventId: intent.reasonEventId,
        }));
      });
    });
    if (presentation.sun) {
      if (compiled.sun) throw presentationError('plugin_presentation_sun_conflict', `Plugins ${compiled.sun.pluginId} and ${pluginId} both declared solar lighting`);
      const anchorPoints = pointsForSegments(worldModel, pluginId, presentation.sun.anchorSegmentIds, presentation.sun.id);
      const center = centerForPoints(anchorPoints);
      const azimuth = presentation.sun.azimuthDegrees * Math.PI / 180;
      const elevation = presentation.sun.elevationDegrees * Math.PI / 180;
      const horizontal = Math.cos(elevation) * presentation.sun.distanceM;
      compiled.sun = Object.freeze({
        ...presentation.sun,
        id: namespace(presentation.sun.id),
        pluginId,
        directionToSun: Object.freeze([
          Math.sin(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          -Math.cos(azimuth) * Math.cos(elevation),
        ]),
        worldPosition: Object.freeze([
          center[0] + Math.sin(azimuth) * horizontal,
          Math.max(presentation.sun.radiusM * 1.5, Math.sin(elevation) * presentation.sun.distanceM),
          center[2] - Math.cos(azimuth) * horizontal,
        ]),
      });
    }
  }

  function offsetPolyline(points, distance) {
    if (!distance || points.length < 2) return points;
    return points.map((point, index) => {
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(points.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy);
      if (!length) return point;
      return Object.freeze({
        ...point,
        x: point.x - (dy / length) * distance,
        y: point.y + (dx / length) * distance,
      });
    });
  }

  function provenanceReceiptFor(receipts, pluginId) {
    return (Array.isArray(receipts) ? receipts : [])
      .find((receipt) => receipt?.pluginId === pluginId) || null;
  }

  function cameraTargetLabel(layers, intent) {
    if (intent.targetIds.length === 1) {
      const layer = layers.find((row) => row.id === intent.targetIds[0]);
      if (layer?.label) return layer.label;
    }
    return String(intent.id)
      .replace(/:[^:]+$/, '')
      .split(/[-_:]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function projectLayer(points, bounds, viewport) {
    const source = centerPoint(points || []);
    if (!bounds) return [viewport.width / 2, viewport.height / 2];
    const spanX = Math.max(1, bounds.maximumX - bounds.minimumX);
    const spanY = Math.max(1, bounds.maximumY - bounds.minimumY);
    const padding = Math.min(24, viewport.width / 8, viewport.height / 8);
    return [
      padding + ((source.x - bounds.minimumX) / spanX) * Math.max(1, viewport.width - padding * 2),
      padding + ((source.y - bounds.minimumY) / spanY) * Math.max(1, viewport.height - padding * 2),
    ];
  }

  function centerPoint(points) {
    if (!points.length) return { x: 0, y: 0 };
    return {
      x: points.reduce((sum, row) => sum + row.x, 0) / points.length,
      y: points.reduce((sum, row) => sum + row.y, 0) / points.length,
    };
  }

  function polylineLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    }
    return total;
  }

  function actorPathPoints(actorId, quantityKind, actorPoints, presentation, rawLayerPoints) {
    if (actorPoints.length > 1) return actorPoints;
    if (!/route-progress|shipment-progress|repair|packet|spacecraft|vessel|pedestrian/.test(String(quantityKind || ''))) return actorPoints;
    const pathLayers = presentation.layers.filter((layer) => layer.kind === 'path');
    if (!pathLayers.length) return actorPoints;
    const actor = String(actorId || '').toLowerCase();
    const preferred = pathLayers.find((layer) => {
      const id = String(layer.id || '').toLowerCase();
      if (actor.includes('screening-spacecraft')) return id.includes('transfer-trajectory');
      if (actor.includes('asteroid-active-clone')) return id.includes('representative-trajectory') || id.includes('clone-path');
      if (actor.includes('voyage:')) return id.startsWith('route:');
      if (actor.includes('sun-walker')) return id === 'shade-selected-route';
      if (actor.includes('shipment:')) return id.startsWith('corridor:');
      if (actor.includes('packet')) return id.startsWith('relay-link:');
      return false;
    });
    const candidates = preferred ? [preferred, ...pathLayers.filter((layer) => layer !== preferred)] : pathLayers;
    const selected = candidates
      .map((layer) => ({ layer, points: rawLayerPoints.get(layer.id) || [] }))
      .filter((row) => row.points.length > 1)
      .sort((left, right) => pathDistanceToPoint(left.points, actorPoints[0]) - pathDistanceToPoint(right.points, actorPoints[0]))[0];
    return selected?.points || actorPoints;
  }

  function pathDistanceToPoint(points, point) {
    if (!point || points.length < 2) return Number.POSITIVE_INFINITY;
    let best = Number.POSITIVE_INFINITY;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const denominator = dx * dx + dy * dy;
      const ratio = denominator ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator)) : 0;
      const x = start.x + dx * ratio;
      const y = start.y + dy * ratio;
      best = Math.min(best, Math.hypot(point.x - x, point.y - y));
    }
    return best;
  }

  function validViewport(value) {
    return value
      && Number.isFinite(value.width)
      && Number.isFinite(value.height)
      && value.width > 0
      && value.height > 0;
  }

  function boundsForPoints(points) {
    if (!points.length) return null;
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
    return Object.freeze({ minimumX, maximumX, minimumY, maximumY });
  }

  function renderScaleForBounds(bounds, viewport) {
    if (!bounds) return 1;
    const spanX = bounds.maximumX - bounds.minimumX;
    const spanY = bounds.maximumY - bounds.minimumY;
    const horizontalPixels = Math.max(1, viewport.width - Math.min(48, viewport.width / 4));
    const verticalPixels = Math.max(1, viewport.height - Math.min(48, viewport.height / 4));
    const perspectiveFitScale = Math.hypot(spanX, spanY) * 1.2 / verticalPixels;
    return Math.max(0.5, spanX / horizontalPixels, spanY / verticalPixels, perspectiveFitScale);
  }

  function screenPixelsToWorld(value, worldUnitsPerPixel) {
    return Math.max(0.5, Number(value) * worldUnitsPerPixel);
  }

  function semanticIntensity(style) {
    return Math.min(1.6, 0.7 + Number(style.strokeOpacity || 0));
  }

  function semanticActorKind(quantityKind) {
    const match = /^actor\.(pedestrian|bicycle|scooter|car|package)\./.exec(String(quantityKind || ''));
    return match?.[1] || null;
  }

  function semanticActorProgress(quantity) {
    if (!quantity || !Array.isArray(quantity.domain)) return 0;
    const [minimum, maximum] = quantity.domain;
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return 0;
    return Math.max(0, Math.min(1, (quantity.value - minimum) / (maximum - minimum)));
  }

  function pointAlongPath(points, progress) {
    if (points.length <= 1) return points[0];
    const lengths = [];
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      const left = points[index - 1];
      const right = points[index];
      const length = Math.hypot(right.x - left.x, right.y - left.y);
      lengths.push(length);
      total += length;
    }
    if (total <= 0) return points[0];
    let remaining = progress * total;
    for (let index = 0; index < lengths.length; index += 1) {
      if (remaining <= lengths[index] || index === lengths.length - 1) {
        const ratio = lengths[index] <= 0 ? 0 : remaining / lengths[index];
        const left = points[index];
        const right = points[index + 1];
        return Object.freeze({
          x: left.x + ((right.x - left.x) * ratio),
          y: left.y + ((right.y - left.y) * ratio),
        });
      }
      remaining -= lengths[index];
    }
    return points.at(-1);
  }

  function resolveSemanticGeometry(geometry, worldModel, pluginId, projection, layerId) {
    if (geometry.kind === 'node') return [Object.freeze(clonePoint(resolveNode(worldModel, pluginId, geometry.nodeIds[0]).position))];
    if (geometry.kind === 'node-path') return geometry.nodeIds.map((id) => Object.freeze(clonePoint(resolveNode(worldModel, pluginId, id).position)));
    if (geometry.kind === 'segments') return pointsForSegments(worldModel, pluginId, geometry.segmentIds, layerId);
    if (geometry.coordinateSystem === 'wgs84') {
      if (!projection) throw presentationError('plugin_presentation_projection_missing', `Plugin ${pluginId} emitted WGS84 semantic geometry without a world projection`);
      const coordinates = geometry.coordinates;
      if (coordinates && typeof coordinates === 'object') {
        const cached = SEMANTIC_GEOMETRY_CACHE.get(coordinates);
        if (cached && cached.projection === projection) return cached.points;
        const points = coordinates.map((coordinate) => {
          const point = projection.project({ longitude: coordinate[0], latitude: coordinate[1] });
          return Object.freeze({ x: point.x, y: point.y });
        });
        const value = Object.freeze({ projection, points: Object.freeze(points) });
        SEMANTIC_GEOMETRY_CACHE.set(coordinates, value);
        return value.points;
      }
      return geometry.coordinates.map((coordinate) => {
        const point = projection.project({ longitude: coordinate[0], latitude: coordinate[1] });
        return Object.freeze({ x: point.x, y: point.y });
      });
    }
    const coordinates = geometry.coordinates;
    if (coordinates && typeof coordinates === 'object') {
      const cached = SEMANTIC_GEOMETRY_CACHE.get(coordinates);
      if (cached && cached.projection === null) return cached.points;
      const points = coordinates.map((coordinate) => Object.freeze({ x: coordinate[0], y: coordinate[1] }));
      SEMANTIC_GEOMETRY_CACHE.set(coordinates, { projection: null, points: Object.freeze(points) });
      return points;
    }
    return geometry.coordinates.map((coordinate) => Object.freeze({ x: coordinate[0], y: coordinate[1] }));
  }

  function distanceForPoints(points) {
    const spanX = Math.max(...points.map((row) => row.x)) - Math.min(...points.map((row) => row.x));
    const spanY = Math.max(...points.map((row) => row.y)) - Math.min(...points.map((row) => row.y));
    return Math.max(150, Math.hypot(spanX, spanY) * 1.4);
  }

  function originTone(origin) {
    return {
      observed: 'green',
      derived: 'blue',
      modeled: 'violet',
      simulated: 'amber',
      scenario: 'magenta',
    }[origin] || 'muted';
  }

  // Project WGS84 geo primitives into planar world metres. cameraTargets/centerForPoints
  // use the [x, 0, -y] convention, so projected {x, y} points slot into the same scene.
  function compileGeospatial(compiled, presentation, pluginId, namespace, projection) {
    if (!projection) throw presentationError('plugin_presentation_projection_missing', `Plugin ${pluginId} emitted geospatial presentation but the active world has no projection`, { pluginId });
    const projectCoord = (coordinate) => { const point = projection.project(coordinate); return Object.freeze({ x: point.x, y: point.y }); };
    presentation.geoMarkers.forEach((row) => compiled.geoMarkers.push(Object.freeze({
      ...row, id: namespace(row.id), sourceId: row.id, pluginId, point: projectCoord(row),
    })));
    presentation.geoPaths.forEach((row) => compiled.geoPaths.push(Object.freeze({
      ...row, id: namespace(row.id), sourceId: row.id, pluginId,
      points: Object.freeze(row.coordinates.map(projectCoord)),
    })));
    presentation.geoAreas.forEach((row) => compiled.geoAreas.push(Object.freeze({
      ...row, id: namespace(row.id), sourceId: row.id, pluginId,
      points: Object.freeze(row.ring.map(projectCoord)),
    })));
    presentation.choropleths.forEach((row) => compiled.choropleths.push(Object.freeze({
      ...row, id: namespace(row.id), sourceId: row.id, pluginId,
      points: Object.freeze(row.ring.map(projectCoord)),
    })));
    presentation.geoCameraTargets.forEach((row) => compiled.cameraTargets.push(Object.freeze({
      id: namespace(row.id), sourceId: row.id, pluginId, kind: 'plugin', label: row.label,
      target: Object.freeze(centerForPoints([projectCoord(row)])), distance: row.distanceM,
    })));
  }

  function resolveNode(worldModel, pluginId, id) {
    try {
      return worldModel.node(id);
    } catch (error) {
      throw presentationError('plugin_presentation_node_missing', `Plugin ${pluginId} referenced missing node ${id}`, { pluginId, nodeId: id, cause: error?.code || error?.message || null });
    }
  }

  function resolveSegment(worldModel, pluginId, id) {
    try {
      return worldModel.segment(id);
    } catch (error) {
      throw presentationError('plugin_presentation_segment_missing', `Plugin ${pluginId} referenced missing segment ${id}`, { pluginId, segmentId: id, cause: error?.code || error?.message || null });
    }
  }

  function pointsForSegments(worldModel, pluginId, segmentIds, contributionId = null) {
    const points = [];
    segmentIds.forEach((id) => {
      resolveSegment(worldModel, pluginId, id).geometry.forEach((point) => {
        const previous = points.at(-1);
        if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(Object.freeze(clonePoint(point)));
      });
    });
    if (points.length < 2) throw presentationError('plugin_presentation_path_empty', `Plugin ${pluginId} presentation ${contributionId || 'path'} has no extent`, { pluginId, contributionId, segmentIds });
    return points;
  }

  function centerForPoints(points) {
    if (!points.length) throw presentationError('plugin_presentation_camera_empty', 'Camera target has no resolved anchors');
    const minimumX = Math.min(...points.map((row) => row.x));
    const maximumX = Math.max(...points.map((row) => row.x));
    const minimumY = Math.min(...points.map((row) => row.y));
    const maximumY = Math.max(...points.map((row) => row.y));
    return [(minimumX + maximumX) / 2, 0, -(minimumY + maximumY) / 2];
  }

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function presentationError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginPresentationError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { SCHEMA, compile, presentationError };
});
