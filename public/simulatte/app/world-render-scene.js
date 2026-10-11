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
  // Bounds come from the same vertex builders as the rendered object, including
  // its height and width. Scene anchor points alone cannot prove useful framing.
  function objectBounds(drawing, scene, sourceId, snapshot) {
    const focused = { ...scene, sun: null };
    let found = false;
    for (const key of ['actors','markers','paths','areas','geoMarkers','geoPaths','geoAreas','choropleths']) {
      focused[key] = (scene[key] || []).filter(row => row.id === sourceId || row.id.endsWith(':' + sourceId));
      found ||= focused[key].length > 0;
    }
    if (!found) return [];
    const vertices = [drawing.createPluginStaticGeometry(focused), drawing.createPluginOverlayGeometry(focused),
      drawing.createPluginDynamicGeometry(focused, snapshot, null, 0)];
    const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
    for (const data of vertices) for (let i = 0; i < data.length; i += drawing.FLOATS_PER_VERTEX) {
      for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis],data[i+axis]); max[axis] = Math.max(max[axis],data[i+axis]); }
    }
    if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return [];
    return Array.from({length:8},(_,i)=>min.map((v,axis)=>i & (1<<axis) ? max[axis] : v));
  }
  function fitObject(state, points, viewport, fit) {
    if (!points.length || ['follow','pov'].includes(state.mode)) return false;
    const usable = fit.usableViewport({...viewport,padding:0});
    if (!usable) return false;
    // The renderer frames its projection inside the unobstructed viewport.
    const padding = 24 * Math.max(viewport.width/(usable.right-usable.left),viewport.height/(usable.bottom-usable.top));
    const pitch = state.mode === 'top' ? Math.PI/2-.025 : state.mode === 'compare' ? Math.max(state.pitch,1.02) : state.pitch;
    const fov = (state.mode === 'top' ? 42 : state.mode === 'compare' ? 54 : 46)*Math.PI/180;
    const pose = fit.fitPerspective(points,{width:viewport.width,height:viewport.height,yaw:Math.PI/2-state.yaw,pitch,fov,padding});
    state.orbitTarget = pose.target; state.distance = pose.distance*Math.min(1,Math.max(.1,viewport.width/viewport.height))/(state.mode === 'compare' ? 1.16 : 1);
    state.isManualFrame = true;
    return true;
  }
  return Object.freeze({ create, objectBounds, fitObject });
});
