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

  function projectionForWorld(worldModel) {
    if (!geographyApi || typeof geographyApi.createProjection !== 'function') return null;
    const world = worldModel && worldModel.world;
    const projection = world && world.coordinateSystem && world.coordinateSystem.projection;
    return geographyApi.createProjection(projection || geographyApi.projectionFromWorld(world));
  }

  function compile(contributions, worldModel) {
    if (!worldModel || typeof worldModel.node !== 'function' || typeof worldModel.segment !== 'function') {
      throw presentationError('plugin_presentation_world_invalid', 'Presentation compiler expected a world model');
    }
    const rows = Array.isArray(contributions) ? contributions : [];
    const projection = projectionForWorld(worldModel);
    const compiled = { schema: SCHEMA, markers: [], paths: [], actors: [], areas: [], sun: null, cameraTargets: [], geoMarkers: [], geoPaths: [], geoAreas: [], choropleths: [] };
    rows.forEach(({ pluginId, presentation }) => {
      const namespace = (id) => `plugin:${pluginId}:${id}`;
      if (presentation.schema === 'simulatte.pluginPresentation.v4') {
        compileSemantic(compiled, presentation, pluginId, namespace, projection, worldModel);
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
    });
    Object.keys(compiled).filter((key) => Array.isArray(compiled[key])).forEach((key) => Object.freeze(compiled[key]));
    return Object.freeze(compiled);
  }

  function compileSemantic(compiled, presentation, pluginId, namespace, projection, worldModel) {
    const layerPoints = new Map();
    presentation.layers.forEach((layer) => {
      const points = resolveSemanticGeometry(layer.geometry, worldModel, pluginId, projection, layer.id);
      layerPoints.set(layer.id, points);
      const style = compositorApi.styleForLayer(layer);
      const common = Object.freeze({
        id: namespace(layer.id),
        sourceId: layer.id,
        pluginId,
        label: layer.label,
        tone: originTone(layer.provenance.axes.origin),
        style,
        provenance: layer.provenance,
        intensity: style.strokeOpacity,
      });
      if (['point', 'label'].includes(layer.kind)) {
        compiled.markers.push(Object.freeze({
          ...common,
          point: points[0],
          radiusM: style.radiusPx || 4,
          heightM: style.radiusPx ? style.radiusPx * 2 : 8,
        }));
      } else if (layer.kind === 'actor') {
        compiled.markers.push(Object.freeze({
          ...common,
          point: points[0],
          radiusM: style.radiusPx || 5,
          heightM: 10,
        }));
      } else if (layer.kind === 'path') {
        compiled.paths.push(Object.freeze({
          ...common,
          points: Object.freeze(points),
          widthM: style.widthPx || 1,
        }));
      } else if (['area', 'field'].includes(layer.kind)) {
        compiled.areas.push(Object.freeze({
          ...common,
          points: Object.freeze(points),
          heightM: 0.35,
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
        label: intent.id,
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
  }

  function resolveSemanticGeometry(geometry, worldModel, pluginId, projection, layerId) {
    if (geometry.kind === 'node') return [Object.freeze(clonePoint(resolveNode(worldModel, pluginId, geometry.nodeIds[0]).position))];
    if (geometry.kind === 'node-path') return geometry.nodeIds.map((id) => Object.freeze(clonePoint(resolveNode(worldModel, pluginId, id).position)));
    if (geometry.kind === 'segments') return pointsForSegments(worldModel, pluginId, geometry.segmentIds, layerId);
    if (geometry.coordinateSystem === 'wgs84') {
      if (!projection) throw presentationError('plugin_presentation_projection_missing', `Plugin ${pluginId} emitted WGS84 semantic geometry without a world projection`);
      return geometry.coordinates.map((coordinate) => {
        const point = projection.project({ longitude: coordinate[0], latitude: coordinate[1] });
        return Object.freeze({ x: point.x, y: point.y });
      });
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
