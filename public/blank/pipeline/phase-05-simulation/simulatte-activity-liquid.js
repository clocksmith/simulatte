(function registerActivityLiquid(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  // Conservative depth-averaged Euler flux in a rectangular moving container.
  function liquidFlux(left, right, gravity) {
    const flux = ([h, q]) => [q, h > 0 ? q * q / h + gravity * h * h / 2 : 0];
    const speed = ([h, q]) => (h > 0 ? Math.abs(q / h) : 0) + Math.sqrt(gravity * h);
    const a = Math.max(speed(left), speed(right)), l = flux(left), r = flux(right);
    return l.map((v, i) => (v + r[i] - a * (right[i] - left[i])) / 2);
  }
  function createActivityLiquid(container, cells) {
    const height = container.heightMeters * container.fillFraction;
    return { schema: 'simulatte.activityLiquid.v1', depthMeters: Array(cells).fill(height),
      dischargeSquareMetersPerSecond: Array(cells).fill(0),
      initialVolumeCubicMeters: container.widthMeters * container.depthMeters * height,
      remainingVolumeCubicMeters: container.widthMeters * container.depthMeters * height,
      consumedVolumeCubicMeters: 0, spilledVolumeCubicMeters: 0,
      outflowMomentumKgMetersPerSecond: [0, 0], outflowAngularMomentumKgSquareMetersPerSecond: 0,
      consumedMomentumKgMetersPerSecond: [0, 0], consumedAngularMomentumKgSquareMetersPerSecond: 0, transferEvents: [],
      stepCount: 0, maxCfl: 0, minDepthMeters: height };
  }
  function stepActivityLiquid(input, container, environment, seconds, policy) {
    if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(environment.angleRadians) ||
        !environment.acceleration.every(Number.isFinite)) throw new Error('Invalid liquid integration input');
    const state = { ...input, depthMeters: input.depthMeters.slice(),
      dischargeSquareMetersPerSecond: input.dischargeSquareMetersPerSecond.slice(),
      outflowMomentumKgMetersPerSecond: [0, 0], outflowAngularMomentumKgSquareMetersPerSecond: 0,
      consumedMomentumKgMetersPerSecond: [0, 0], consumedAngularMomentumKgSquareMetersPerSecond: 0, transferEvents: [] };
    const n = state.depthMeters.length, dx = container.widthMeters / n;
    const c = Math.cos(environment.angleRadians), s = Math.sin(environment.angleRadians);
    const gx = -environment.acceleration[0], gy = -policy.gravityMetersPerSecondSquared - environment.acceleration[1];
    const tangent = gx * c + gy * s, baseNormal = -(gy * c - gx * s);
    const omega = environment.angularVelocity, alpha = environment.angularAcceleration;
    if (!Number.isFinite(omega) || !Number.isFinite(alpha)) throw new Error('Liquid requires finite angular state');
    let elapsed = 0, steps = 0;
    while (elapsed < seconds - 1e-12) {
      if (++steps > policy.maxLiquidSubsteps) throw new Error('Liquid integration resource bound exceeded');
      const h = state.depthMeters, q = state.dischargeSquareMetersPerSecond;
      const accelerations = h.map((v, i) => {
        const x = (i + 0.5) * dx - container.widthMeters / 2, y = (v - container.heightMeters) / 2;
        const u = v > policy.dryDepthMeters ? q[i] / v : 0;
        return { tangent: tangent + alpha * y + omega * omega * x,
          normal: baseNormal + alpha * x - omega * omega * y + 2 * omega * u };
      });
      if (accelerations.some((a, i) => h[i] > policy.dryDepthMeters && a.normal <= 0)) throw new Error('Liquid depth model requires positive effective normal gravity');
      const normals = accelerations.map(a => Math.max(0, a.normal));
      const maxSpeed = Math.max(...h.map((v, i) => (v > policy.dryDepthMeters ? Math.abs(q[i] / v) : 0) + Math.sqrt(normals[i] * v)));
      const dt = Math.min(seconds - elapsed, policy.maxStepSeconds,
        maxSpeed > 0 ? policy.cfl * dx / maxSpeed : policy.maxStepSeconds);
      const faces = Array(n + 1);
      faces[0] = liquidFlux([h[0], -q[0]], [h[0], q[0]], normals[0]);
      faces[n] = liquidFlux([h[n - 1], q[n - 1]], [h[n - 1], -q[n - 1]], normals[n - 1]);
      for (let i = 1; i < n; i++) faces[i] = liquidFlux([h[i - 1], q[i - 1]], [h[i], q[i]], (normals[i - 1] + normals[i]) / 2);
      const nextH = [], nextQ = [];
      for (let i = 0; i < n; i++) {
        const depth = h[i] - dt / dx * (faces[i + 1][0] - faces[i][0]);
        if (depth < -1e-12 || !Number.isFinite(depth)) throw new Error('Liquid positivity/stability failure');
        nextH[i] = Math.max(0, depth);
        nextQ[i] = (q[i] - dt / dx * (faces[i + 1][1] - faces[i][1]) + dt * accelerations[i].tangent * (h[i] + nextH[i]) / 2)
          * Math.exp(-policy.liquidDragPerSecond * dt);
        if (nextH[i] <= policy.dryDepthMeters) nextQ[i] = 0;
        if (nextH[i] > container.heightMeters) {
          const overflow = nextH[i] - container.heightMeters, volume = overflow * dx * container.depthMeters;
          const x = (i + 0.5) * dx - container.widthMeters / 2, y = container.heightMeters / 2;
          const outlet = [environment.position[0] + c * x - s * y, environment.position[1] + s * x + c * y];
          const mouthContact = environment.mouth && Math.hypot(outlet[0] - environment.mouth[0], outlet[1] - environment.mouth[1]) <= policy.mouthCaptureRadiusMeters;
          state[mouthContact ? 'consumedVolumeCubicMeters' : 'spilledVolumeCubicMeters'] += volume;
          const u = nextQ[i] / nextH[i], velocity = [environment.velocity[0] + c * u - environment.angularVelocity * (s * x + c * y),
            environment.velocity[1] + s * u + environment.angularVelocity * (c * x - s * y)];
          for (let j = 0; j < 2; j++) state.outflowMomentumKgMetersPerSecond[j] += volume * policy.liquidDensityKgPerCubicMeter * velocity[j];
          state.outflowAngularMomentumKgSquareMetersPerSecond += volume * policy.liquidDensityKgPerCubicMeter * (outlet[0] * velocity[1] - outlet[1] * velocity[0]);
          if (mouthContact) {
            for (let j = 0; j < 2; j++) state.consumedMomentumKgMetersPerSecond[j] += volume * policy.liquidDensityKgPerCubicMeter * velocity[j];
            state.consumedAngularMomentumKgSquareMetersPerSecond += volume * policy.liquidDensityKgPerCubicMeter * (outlet[0] * velocity[1] - outlet[1] * velocity[0]);
          }
          state.transferEvents.push({ cellIndex: i, volumeCubicMeters: volume, outlet, containerAngleRadians: environment.angleRadians,
            disposition: mouthContact ? 'consumed' : 'spilled' });
          nextQ[i] *= container.heightMeters / nextH[i]; nextH[i] = container.heightMeters;
        }
      }
      state.depthMeters = nextH; state.dischargeSquareMetersPerSecond = nextQ;
      state.maxCfl = Math.max(state.maxCfl, maxSpeed * dt / dx);
      state.minDepthMeters = Math.min(state.minDepthMeters, ...nextH);
      elapsed += dt; state.stepCount++;
    }
    state.remainingVolumeCubicMeters = state.depthMeters.reduce((a, b) => a + b, 0) * dx * container.depthMeters;
    return state;
  }
  registry.define('physicsModel', 'simulatte-activity-liquid.js', { liquidFlux, createActivityLiquid, stepActivityLiquid });
})(typeof globalThis !== 'undefined' ? globalThis : window);
