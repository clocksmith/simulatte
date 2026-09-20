(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./scene.js') : root.MotorcycleScene, node ? require('./signal.js') : root.MotorcycleSignal,
    node ? require('./propagation.js') : root.MotorcyclePropagation, node ? require('./control.js') : root.MotorcycleControl,
    node ? require('./sensing.js') : root.MotorcycleSensing);
  if (node) module.exports = api; else root.MotorcycleSimulation = api;
})(globalThis, function (scene, signal, propagation, control, sensing) {
  const ASSUMPTIONS = Object.freeze([
    'Synthetic four-stroke pulses; 1 m stationary free-field reference in dB Z, not measured motorcycle recordings.',
    'Calm air; prescribed straight trajectories and independently prescribed RPM. No validated traffic dynamics.',
    'Point sources with a 0.25 m near-field exclusion; omnidirectional radiation. Finite image reflections from infinite parallel facades plus direct ground reflection.',
    'Frequency-dependent losses use declared low-pass approximations. A barrier replaces only an obstructed direct path with a top-edge detour and a 500 Hz Fresnel approximation; not full wave diffraction.',
    'A-weighting is applied offline to pressure; Fast integration is 125 ms. Finite sample bandwidth excludes higher motorcycle harmonics.',
    'Microphone timing, noise and clipping are modeled. Localization and plate recognition can abstain; estimator scores are not calibrated confidence.',
    'A signature authenticates a simulated record, not calibration, identity or a real violation.'
  ]);
  function run(spec, progress = () => {}) {
    scene.validate(spec);
    const p = spec.params, sources = spec.objects, waves = sources.map(source => propagation.emissions(source, p));
    const baseline = propagation.receive(sources, waves, p.receiver, p), secondary = propagation.secondaryTaps(p.receiver, p);
    let result, controller = null;
    if (p.mitigation === 'active') {
      const reference = propagation.receive(sources, waves, p.reference, p);
      controller = p.controller === 'causal' ? control.causal(reference, baseline, secondary, p) : control.ideal(baseline, secondary, p);
      result = controller.residual;
    } else result = p.mitigation === 'none' ? baseline.slice() : propagation.receive(sources, waves, p.receiver, p, p.mitigation);
    const baselineMetric = signal.measure(baseline, p.sampleRate), resultMetric = signal.measure(result, p.sampleRate), grid = [];
    progress({ fraction: 0.1, phase: 'Measuring the street' });
    for (let y = 0; y < p.gridRows; y++) for (let x = 0; x < p.gridColumns; x++) {
      const point = [-20 + 40 * x / (p.gridColumns - 1), -p.streetHalfWidth + 0.5 + (2 * p.streetHalfWidth - 1) * y / (p.gridRows - 1), p.receiver[2]];
      const incident = propagation.receive(sources, waves, point, p);
      let residual;
      if (controller) {
        const emitted = signal.convolve(controller.command, propagation.secondaryTaps(point, p));
        residual = Float64Array.from(incident, (v, i) => v + emitted[i]);
      } else residual = p.mitigation === 'none' ? incident : propagation.receive(sources, waves, point, p, p.mitigation);
      const before = signal.measure(incident, p.sampleRate).laeq;
      const after = residual === incident ? before : signal.measure(residual, p.sampleRate).laeq;
      grid.push({ point, baseline: before, result: after, attenuation: before - after });
      if (x === p.gridColumns - 1) progress({ fraction: 0.1 + 0.75 * (y + 1) / p.gridRows, phase: 'Measuring the street' });
    }
    const localGrid = [];
    if (controller) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const point = [p.receiver[0] + x * .25, p.receiver[1] + y * .25, p.receiver[2]];
      if (propagation.distance(point, p.speaker) < .25 || Math.abs(point[1]) >= p.streetHalfWidth) continue;
      const incident = propagation.receive(sources, waves, point, p), emitted = signal.convolve(controller.command, propagation.secondaryTaps(point, p));
      const residual = Float64Array.from(incident, (v, i) => v + emitted[i]);
      const before = signal.measure(incident, p.sampleRate).laeq, after = signal.measure(residual, p.sampleRate).laeq;
      localGrid.push({ point, baseline: before, result: after, attenuation: before - after });
      if (x === 4) progress({ fraction: .85 + .1 * (y + 5) / 9, phase: 'Measuring the local control zone' });
    }
    progress({ fraction: 0.96, phase: 'Checking simulated sensors' });
    const microphones = sensing.microphones(), observationTime = p.duration / 2;
    const end = Math.floor(observationTime * p.sampleRate), window = Math.min(1024, end);
    const microphoneSignals = microphones.map((point, i) => {
      const wave = control.sensor(propagation.receive(sources, waves, point, p), p, p.seed + 1000 + i);
      const offset = (i % 2 ? 1 : -1) * p.clockSkewMs * p.sampleRate / 1000;
      return Float64Array.from({ length: window }, (_, k) => signal.sample(wave, end - window + k + offset));
    });
    const localization = sensing.localize(microphoneSignals, microphones, p.sampleRate, p.soundSpeed);
    const captureTime = observationTime - window / p.sampleRate / 2 + p.cameraOffsetMs / 1000;
    const tracks = sources.map(row => ({ id: `camera-${row.id}`, position: scene.position(row, captureTime), velocity: [row.speed + row.acceleration * captureTime, 0, 0] }));
    const association = sensing.associate(localization, tracks, microphones[0], p.soundSpeed);
    const plateTruth = String((p.seed * 7919) % 1000000).padStart(6, '0');
    const original = sensing.plateImage(plateTruth), degraded = sensing.degradePlate(original, p), recognition = sensing.readPlate(degraded);
    const seen = new Set(), offTarget = [...grid, ...localGrid].filter(row => {
      const key = row.point.join(',');
      if (seen.has(key) || propagation.distance(row.point, p.receiver) < .01) return false;
      seen.add(key); return true;
    });
    const record = { schema: 'simulatte.motorcycleNoiseResult.v1', modelId: scene.MODEL, worldSpecHash: spec.contentHash,
      units: { position: 'm', time: 's', pressure: 'Pa', levels: 'dB re 20 uPa', rpm: 'rev/min' }, seed: p.seed,
      sampleRate: p.sampleRate, interval: [0, p.duration], receiver: p.receiver, solver: { pathStepSamples: p.pathStepSamples, reflectionOrder: p.reflectionOrder,
        retardedTimeIterations: 6, measurement: 'offline frequency-domain A-weighting; 125 ms Fast integration', secondaryTailSamples: 24, tolerance: 1e-8 },
      parameters: p, assumptions: ASSUMPTIONS, validation: 'Analytical/reference-case checks; no independent field validation',
      baseline: baselineMetric, result: resultMetric, attenuation: baselineMetric.laeq - resultMetric.laeq,
      offTarget: { improved: offTarget.filter(row => row.attenuation > 0.5).length, unchanged: offTarget.filter(row => Math.abs(row.attenuation) <= 0.5).length,
        worsened: offTarget.filter(row => row.attenuation < -0.5).length, largestIncreaseDb: Math.max(0, ...offTarget.map(row => -row.attenuation)) },
      controller: controller ? { kind: controller.kind, futureSamples: controller.futureSamples, clippedSamples: controller.clipped,
        reference: p.reference, speaker: p.speaker } : null, grid, localGrid,
      sensing: { observationTime, windowSeconds: window / p.sampleRate, localization, association, recognition,
        evaluation: { syntheticPlateTruth: plateTruth, charactersCorrect: recognition.characters.filter((c, i) => c === plateTruth[i]).length,
          truthAccess: 'Estimator receives degraded pixels only; evaluator retains synthetic truth.' } } };
    progress({ fraction: 1, phase: 'Ready' });
    return { record, baseline, residual: result, originalPlate: original, degradedPlate: degraded };
  }
  return { ASSUMPTIONS, run };
});
