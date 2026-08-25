(function attachRecursiveWorldView(root, factory) {
  const sceneApi = typeof module === 'object' && module.exports
    ? require('./recursive-world-scene.js')
    : root.SimulatteRecursiveWorldScene;
  const api = factory(sceneApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRecursiveWorldView = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRecursiveWorldViewApi(sceneApi) {
  function createViewController(scene, options = {}) {
    const targets = new Map(scene.renderProgram.cameraTargets.map((target) => [target.id, target]));
    let currentId = options.initialTargetId || scene.renderProgram.cameraTargets[0].id;
    if (!targets.has(currentId)) throw new Error(`recursive_view_target_unknown: Unknown target ${currentId}`);
    let transition = null;

    function focus(targetId, { startedAtMs = 0, durationMs = 650 } = {}) {
      if (!targets.has(targetId)) throw new Error(`recursive_view_target_unknown: Unknown target ${targetId}`);
      if (!Number.isFinite(startedAtMs) || !Number.isFinite(durationMs) || durationMs < 0) {
        throw new Error('recursive_view_transition_invalid: Transition timing must be finite and non-negative');
      }
      transition = { fromId: currentId, toId: targetId, startedAtMs, durationMs };
      if (durationMs === 0) {
        currentId = targetId;
        transition = null;
      }
    }

    function sample({ nowMs = 0, aspect = 1, fieldOfViewRadians = Math.PI / 3 } = {}) {
      const from = worldTarget(targets.get(transition?.fromId || currentId));
      const to = worldTarget(targets.get(transition?.toId || currentId));
      const raw = transition ? (nowMs - transition.startedAtMs) / Math.max(transition.durationMs, 1) : 1;
      const amount = smoothstep(clamp(raw, 0, 1));
      const origin = interpolateVector(from.position, to.position, amount);
      const distance = Math.exp(interpolate(Math.log(from.distanceMeters), Math.log(to.distanceMeters), amount));
      if (transition && raw >= 1) {
        currentId = transition.toId;
        transition = null;
      }
      const eye = [distance * 0.72, -distance * 0.72, distance * 0.46];
      const view = lookAt(eye, [0, 0, 0], [0, 0, 1]);
      const near = Math.max(distance / 100000, 0.001);
      const far = Math.max(distance * 6, near + 1);
      const projection = perspective(fieldOfViewRadians, aspect, near, far);
      return Object.freeze({
        schema: 'simulatte.recursive-world-camera-sample/v1',
        targetId: currentId,
        floatingOrigin: Object.freeze(origin),
        distanceMeters: distance,
        nearMeters: near,
        farMeters: far,
        transitionAmount: amount,
        viewProjection: new Float32Array(sceneApi.multiplyMatrix(projection, view)),
      });
    }

    function worldTarget(target) {
      const frame = scene.frameTransforms[target.coordinateFrameId];
      return { position: sceneApi.transformPoint(frame, target.position), distanceMeters: target.distanceMeters };
    }

    return Object.freeze({ focus, sample, snapshot: () => Object.freeze({ currentId, transition: transition && Object.freeze({ ...transition }) }) });
  }

  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const range = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * range, -1, 0, 0, near * far * range, 0];
  }

  function lookAt(eye, center, up) {
    const z = normalize(subtract(eye, center));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }

  function interpolateVector(left, right, amount) { return left.map((value, index) => interpolate(value, right[index], amount)); }
  function interpolate(left, right, amount) { return left + (right - left) * amount; }
  function smoothstep(value) { return value * value * (3 - 2 * value); }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function subtract(left, right) { return left.map((value, index) => value - right[index]); }
  function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
  function cross(left, right) { return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]; }
  function normalize(value) { const length = Math.hypot(...value); return value.map((row) => row / length); }

  return Object.freeze({ createViewController, lookAt, perspective });
});
