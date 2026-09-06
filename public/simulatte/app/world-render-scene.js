(function attachWorldRenderScene(root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(
    common ? require('./webgpu-geometry.js') : root.SimulatteAutonomyGpuGeometry,
    common ? require('./camera-controller.js') : root.SimulatteAutonomyCamera,
    common ? require('./plugin-presentation.js') : root.SimulattePluginPresentation
  );
  if (common) module.exports = api;
  root.SimulatteWorldRenderScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldRenderSceneApi(geometry, camera, presentations) {
  // World semantics stop here. GPU execution consumes this explicit scene source.
  function create(worldModel, options = {}) {
    const drawing = options.meshes ? geometry.create(options.meshes) : geometry;
    const world = worldModel?.world;
    if (!world?.renderGeometry) throw Object.assign(new Error('World requires compiled renderGeometry'), { code: 'render_geometry_missing' });
    const ambient = worldModel.ambientCompilation;
    const metadata = Object.freeze({
      worldId: world.id,
      ...(options.meshes ? { meshAssets: drawing.meshAssets } : {}),
      worldSurfaceOwner: world.renderGeometry.surfaceOwner || 'core',
      buildingCount: world.renderGeometry.buildings.length,
      streetCount: world.renderGeometry.streets.length,
      parkCount: world.renderGeometry.parks.length,
      circuitCount: world.circuits.length,
      bikeFacilityCount: world.renderGeometry.bikeFacilities.length,
      ambientTraffic: {
        schema: ambient.schema, actorCount: ambient.actors.length,
        counts: structuredClone(ambient.counts), interactionModel: ambient.interactionModel,
        animationModel: ambient.animationModel, sourceGeometryIds: [...ambient.sourceGeometryIds],
        claimBoundary: ambient.claimBoundary,
      },
    });
    return Object.freeze({
      geometry: drawing,
      metadata,
      staticGeometry: () => geometry.createStaticGeometry(world, { detail: 'full' }),
      overviewGeometry: () => geometry.createStaticGeometry(world, { detail: 'overview' }),
      groundGeometry: () => geometry.createGroundOverlayGeometry(world),
      dynamicGeometry: (snapshot, receipt, trace, writer) => drawing.createDynamicGeometry(worldModel, snapshot, receipt, trace, writer),
      compilePresentations: (rows, settings) => presentations.compile(rows, worldModel, settings),
      createCameraState: () => camera.createCameraState(world, worldModel, options.regionRegistry, options.regionPacks),
      advanceCamera: (state, snapshot, aspect, time) => camera.advanceCamera(state, snapshot, worldModel, aspect, time),
      updateSnapshot(state, snapshot, time) {
        if (!state.routeIdentity && snapshot.route?.segmentIds?.length) {
          state.routeIdentity = snapshot.route.segmentIds.join('|');
          camera.updateRouteTarget(state, snapshot.route.segmentIds, worldModel, world, time);
        }
        const position = snapshot.state.position;
        const last = state.tracePositions.at(-1);
        if (position && (!last || Math.hypot(position.x - last.x, position.y - last.y) > 0.15)) state.tracePositions.push({ ...position });
      },
    });
  }
  return Object.freeze({ create });
});
