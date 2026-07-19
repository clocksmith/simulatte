(function attachPluginPresentationCompiler(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginPresentationCompiler() {
  const SCHEMA = 'simulatte.compiledPluginPresentation.v1';

  function compile(contributions, worldModel) {
    if (!worldModel || typeof worldModel.node !== 'function' || typeof worldModel.segment !== 'function') {
      throw presentationError('plugin_presentation_world_invalid', 'Presentation compiler expected a world model');
    }
    const rows = Array.isArray(contributions) ? contributions : [];
    const compiled = { schema: SCHEMA, markers: [], paths: [], actors: [], cameraTargets: [] };
    rows.forEach(({ pluginId, presentation }) => {
      const namespace = (id) => `plugin:${pluginId}:${id}`;
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
      cameraTargets: compiled.cameraTargets.length,
    });
    Object.keys(compiled).filter((key) => Array.isArray(compiled[key])).forEach((key) => Object.freeze(compiled[key]));
    return Object.freeze(compiled);
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
