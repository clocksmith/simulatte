(function attachAutonomyCameraController(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyCamera = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyCameraController() {
  const CAMERA_MODES = Object.freeze(['follow', 'bird', 'top']);
  const CAMERA_TRANSITION_MS = 850;
  const CAMERA_RESPONSE_PER_SECOND = 10;
  const DEFAULT_YAW = -0.72;
  const DEFAULT_PITCH = 0.84;
  const TOP_PITCH = Math.PI / 2 - 0.025;
  const MIN_DISTANCE = 140;
  const MAX_DISTANCE = 9000;

  function createCameraState(world, worldModel, regionRegistry = null, regionPacks = []) {
    const targets = createCameraTargets(world, worldModel, regionRegistry, regionPacks);
    const route = targets.find((row) => row.id === 'route');
    return {
      mode: 'bird',
      yaw: DEFAULT_YAW,
      pitch: DEFAULT_PITCH,
      distance: route.distance,
      orbitTarget: [...route.target],
      focusId: route.id,
      targets,
      pose: null,
      transition: null,
      transitionProgress: 1,
      lastFrameAt: null,
    };
  }

  function createCameraTargets(world, worldModel, regionRegistry = null, regionPacks = []) {
    const routeBounds = boundsForSegmentIds(world.scenario.defaultRoute.segmentIds, worldModel);
    const routeDistance = routeCameraDistance(world);
    const targets = [{
      id: 'route',
      kind: 'route',
      label: 'Full route',
      target: centerForBounds(routeBounds),
      distance: routeDistance,
    }];
    if (!regionRegistry) return targets;
    const packById = new Map(regionPacks.map((pack) => [pack.id, pack]));
    regionRegistry.packs.forEach((reference) => {
      const pack = packById.get(reference.id);
      const bounds = pack?.nodes?.length
        ? boundsForPoints(pack.nodes.map((row) => row.position))
        : localBoundsForWgs84(reference.boundsWgs84, world.coordinateSystem.originWgs84);
      targets.push({
        id: `region:${reference.id}`,
        kind: 'region',
        label: humanizeId(reference.id),
        target: centerForBounds(bounds),
        distance: clamp(Math.max(bounds.maximumX - bounds.minimumX, bounds.maximumY - bounds.minimumY) * 1.05, 720, routeDistance),
      });
    });
    regionRegistry.placeIndex.forEach((place) => {
      const point = worldModel.node(place.nodeId).position;
      targets.push({
        id: `place:${place.id}`,
        kind: 'place',
        label: place.label,
        target: [point.x, 0, -point.y],
        distance: clamp(routeDistance * 0.14, 520, 1100),
      });
    });
    return targets;
  }

  function updateRouteTarget(state, segmentIds, worldModel, world, timestamp) {
    const target = state.targets.find((row) => row.id === 'route');
    const bounds = boundsForSegmentIds(segmentIds, worldModel);
    target.target = centerForBounds(bounds);
    target.distance = distanceForBounds(bounds, world);
    if (state.focusId !== 'route') return;
    state.orbitTarget = [...target.target];
    state.distance = target.distance;
    beginTransition(state, timestamp);
  }

  function setCameraMode(state, mode, timestamp) {
    if (!CAMERA_MODES.includes(mode)) throw cameraError('camera_mode_invalid', `Expected ${CAMERA_MODES.join(', ')}; received ${mode}`);
    if (state.mode === mode) return mode;
    state.mode = mode;
    beginTransition(state, timestamp);
    return mode;
  }

  function focusCameraTarget(state, targetId, timestamp) {
    const target = state.targets.find((row) => row.id === targetId);
    if (!target) throw cameraError('camera_focus_invalid', `Expected a declared camera target; received ${targetId}`);
    state.focusId = target.id;
    state.orbitTarget = [...target.target];
    state.distance = target.distance;
    if (state.mode === 'follow') state.mode = 'bird';
    beginTransition(state, timestamp);
    return state.mode;
  }

  function orbitCamera(state, deltaX, deltaY) {
    if (state.mode !== 'bird') return false;
    state.yaw -= deltaX * 0.006;
    state.pitch = clamp(state.pitch + deltaY * 0.004, 0.35, 1.25);
    cancelTransition(state);
    return true;
  }

  function panCamera(state, deltaX, deltaY, viewportHeight) {
    if (state.mode === 'follow') return false;
    const scale = state.distance * 1.35 / Math.max(240, viewportHeight || 0);
    const right = state.mode === 'top'
      ? [1, 0, 0]
      : [Math.sin(state.yaw), 0, -Math.cos(state.yaw)];
    const forward = state.mode === 'top'
      ? [0, 0, -1]
      : [-Math.cos(state.yaw), 0, -Math.sin(state.yaw)];
    state.orbitTarget = state.orbitTarget.map((value, index) => value
      - right[index] * deltaX * scale
      + forward[index] * deltaY * scale);
    state.focusId = 'custom';
    cancelTransition(state);
    return true;
  }

  function zoomCamera(state, deltaY) {
    if (state.mode === 'follow') return false;
    state.distance = clamp(state.distance * Math.exp(deltaY * 0.001), MIN_DISTANCE, MAX_DISTANCE);
    cancelTransition(state);
    return true;
  }

  function advanceCamera(state, snapshot, worldModel, aspect, timestamp) {
    const safeTimestamp = Number.isFinite(timestamp) ? timestamp : 0;
    const desired = cameraPoseFor(state, snapshot, worldModel);
    const deltaSeconds = state.lastFrameAt === null
      ? 0
      : clamp((safeTimestamp - state.lastFrameAt) / 1000, 0, 0.1);
    state.lastFrameAt = safeTimestamp;
    if (!state.pose) state.pose = clonePose(desired);
    if (state.transition) {
      const ratio = clamp((safeTimestamp - state.transition.startedAt) / state.transition.durationMs, 0, 1);
      state.transitionProgress = ratio;
      state.pose = interpolatePose(state.transition.from, desired, smoothStep(ratio));
      if (ratio >= 1) {
        state.pose = clonePose(desired);
        state.transition = null;
        state.transitionProgress = 1;
      }
    } else if (deltaSeconds > 0) {
      const amount = 1 - Math.exp(-CAMERA_RESPONSE_PER_SECOND * deltaSeconds);
      state.pose = interpolatePose(state.pose, desired, amount);
      state.transitionProgress = 1;
    }
    return {
      ...clonePose(state.pose),
      aspect,
      mode: state.mode,
      focusId: state.focusId,
      transitionState: state.transition ? 'active' : 'settled',
      transitionProgress: state.transitionProgress,
    };
  }

  function cameraPoseFor(state, snapshot, worldModel) {
    if (state.mode === 'follow') {
      const point = snapshot.state.position;
      const heading = routeHeading(snapshot, worldModel);
      return {
        eye: [point.x - Math.cos(heading) * 62, 44, -point.y + Math.sin(heading) * 62],
        target: [point.x + Math.cos(heading) * 42, 4, -point.y - Math.sin(heading) * 42],
        fieldOfViewRadians: 52 * Math.PI / 180,
        near: 0.4,
        far: 20000,
      };
    }
    const pitch = state.mode === 'top' ? TOP_PITCH : state.pitch;
    const horizontal = state.distance * Math.cos(pitch);
    const eye = [
      state.orbitTarget[0] + Math.cos(state.yaw) * horizontal,
      Math.max(80, state.distance * Math.sin(pitch)),
      state.orbitTarget[2] + Math.sin(state.yaw) * horizontal,
    ];
    return {
      eye,
      target: [...state.orbitTarget],
      fieldOfViewRadians: (state.mode === 'top' ? 42 : 46) * Math.PI / 180,
      near: 1,
      far: 20000,
    };
  }

  function beginTransition(state, timestamp) {
    state.transition = state.pose ? {
      from: clonePose(state.pose),
      startedAt: Number.isFinite(timestamp) ? timestamp : state.lastFrameAt || 0,
      durationMs: CAMERA_TRANSITION_MS,
    } : null;
    state.transitionProgress = state.transition ? 0 : 1;
  }

  function cancelTransition(state) {
    state.transition = null;
    state.transitionProgress = 1;
  }

  function interpolatePose(from, to, amount) {
    return {
      eye: interpolateVector(from.eye, to.eye, amount),
      target: interpolateVector(from.target, to.target, amount),
      fieldOfViewRadians: interpolateNumber(from.fieldOfViewRadians, to.fieldOfViewRadians, amount),
      near: interpolateNumber(from.near, to.near, amount),
      far: interpolateNumber(from.far, to.far, amount),
    };
  }

  function interpolateVector(from, to, amount) {
    return from.map((value, index) => interpolateNumber(value, to[index], amount));
  }

  function interpolateNumber(from, to, amount) {
    return from + (to - from) * clamp(amount, 0, 1);
  }

  function clonePose(pose) {
    return { ...pose, eye: [...pose.eye], target: [...pose.target] };
  }

  function smoothStep(value) {
    const ratio = clamp(value, 0, 1);
    return ratio * ratio * (3 - 2 * ratio);
  }

  function boundsForSegmentIds(segmentIds, worldModel) {
    return boundsForPoints(segmentIds.flatMap((id) => worldModel.segment(id).geometry));
  }

  function boundsForPoints(points) {
    if (!points.length) throw cameraError('camera_bounds_empty', 'Expected at least one point for a camera target');
    return {
      minimumX: Math.min(...points.map((row) => row.x)),
      maximumX: Math.max(...points.map((row) => row.x)),
      minimumY: Math.min(...points.map((row) => row.y)),
      maximumY: Math.max(...points.map((row) => row.y)),
    };
  }

  function localBoundsForWgs84(bounds, origin) {
    const longitudeScale = Math.cos(origin.latitude * Math.PI / 180) * 111320;
    return {
      minimumX: (bounds.west - origin.longitude) * longitudeScale,
      maximumX: (bounds.east - origin.longitude) * longitudeScale,
      minimumY: (bounds.south - origin.latitude) * 110540,
      maximumY: (bounds.north - origin.latitude) * 110540,
    };
  }

  function centerForBounds(bounds) {
    return [
      (bounds.minimumX + bounds.maximumX) / 2,
      0,
      -(bounds.minimumY + bounds.maximumY) / 2,
    ];
  }

  function distanceForBounds(bounds, world) {
    const span = Math.max(bounds.maximumX - bounds.minimumX, bounds.maximumY - bounds.minimumY);
    return clamp(span * 0.98, 620, routeCameraDistance(world));
  }

  function routeCameraDistance(world) {
    const bounds = world.coordinateSystem.bounds;
    const worldSpan = Math.max(bounds.maximumX - bounds.minimumX, bounds.maximumY - bounds.minimumY);
    return clamp(worldSpan * 0.98, 620, 8200);
  }

  function routeHeading(snapshot, worldModel) {
    const segmentId = snapshot.state.currentSegmentId || snapshot.route?.segmentIds?.[0];
    if (!segmentId) return 0;
    const geometry = worldModel.segment(segmentId).geometry;
    const start = geometry[0];
    const end = geometry[Math.min(1, geometry.length - 1)];
    return Math.atan2(end.y - start.y, end.x - start.x);
  }

  function humanizeId(id) {
    return id.replace(/-v\d+$/, '').split('-').map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function cameraError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyCameraError';
    error.code = code;
    return error;
  }

  return {
    CAMERA_MODES,
    CAMERA_TRANSITION_MS,
    advanceCamera,
    cameraError,
    createCameraState,
    createCameraTargets,
    focusCameraTarget,
    orbitCamera,
    panCamera,
    setCameraMode,
    updateRouteTarget,
    zoomCamera,
  };
});
