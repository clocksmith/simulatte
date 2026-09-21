'use strict';
importScripts('./signal.js', './control.js', './city-paths.js?v=city-controls-v7', './traffic-motion.js?v=city-controls-v7', './reflection-model.js?v=city-controls-v7', './acoustic-field.js');
self.onmessage = ({ data }) => {
  const { id, scene, time, mapHash } = data;
  const M = self.MotorcycleReflection, S = self.MotorcycleSignal;
  try {
    M.validate(scene.config);
    const rate = M.C.rate, duration = M.C.duration;
    const length = Math.round(rate * duration), start = Math.max(0, time - duration);
    const report = (fraction, phase) => self.postMessage({ id, type: 'progress', fraction, phase });
    report(0.02, 'Preparing traffic emissions and propagation paths');
    const solver = self.MotorcycleAcousticField.create(scene, start, length, rate);
    const receive = (point, seed = 0) => solver.receive(point, seed);
    const listener = receive(scene.receiver), reference = receive(scene.reference, 1);
    const parameters = { seed: scene.config.seed, sampleRate: rate, sensorNoisePa: .001, sensorClipPa: 8, latencyMs: scene.config.latencyMs, controllerTaps: 64, speakerLimitPa: .5, controllerStep: .015 };
    const controller = scene.config.cancellation
      ? self.MotorcycleControl.causal(reference.primary, listener.primary, M.secondary(scene.receiver, scene), parameters)
      : null;
    const total = controller ? controller.residual : listener.primary;
    function measure(point, name) {
      const field = receive(point, 7);
      const secondary = controller ? S.convolve(controller.command, M.secondary(point, scene)) : new Float64Array(length);
      const combined = Float64Array.from(field.primary, (value, i) => value + (secondary[i] || 0));
      const baseline = S.measure(field.free, rate).laeq;
      const withSurface = S.measure(field.primary, rate).laeq;
      const final = S.measure(combined, rate).laeq;
      return { point, name, baseline, withSurface, total: final, returned: S.measure(field.returned, rate).laeq, change: final - baseline };
    }
    const geometry = self.MotorcycleCityPaths.create(scene.buildings);
    const points = [], local = [];
    let excludedIndoorPoints = 0;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      const point = { x: scene.receiver.x + x * 12, y: scene.receiver.y + y * 12, z: scene.receiver.z };
      if (geometry.occupied(point)) excludedIndoorPoints++;
      else points.push(measure(point, `Street sample ${x}, ${y}`));
      report(.12 + .6 * ((y + 2) * 5 + x + 3) / 25, 'Calculating street sound map');
    }
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const point = { x: scene.receiver.x + x * .25, y: scene.receiver.y + y * .25, z: scene.receiver.z };
      if (!geometry.occupied(point)) local.push(measure(point, `Listener offset ${x * .25}, ${y * .25} m`));
    }
    report(.78, 'Comparing listeners and returning sound');
    const observers = scene.observers.map((observer, index) => measure(observer.point || observer, observer.name || `Observer ${index + 1}`));
    const selected = scene.sources.find(source => source.kind === 'motorcycle');
    if (selected) {
      const returning = solver.receive(null, 0, selected, true).returned;
      observers.push({ name: 'First motorcycle: own returned sound', point: M.position(selected, time), baseline: null, withSurface: null, total: null, returned: S.measure(returning, rate).laeq, change: null });
    }
    const ledger = M.ledger(scene, time);
    const activeJoules = controller ? 4 * Math.PI * S.energy(controller.command) * duration / (M.C.rho * M.soundSpeed(scene.config)) : 0;
    const readings = { baseline: S.measure(listener.free, rate), withSurface: S.measure(listener.primary, rate), returned: S.measure(listener.returned, rate), total: S.measure(total, rate) };
    const spectrum = S.spectrum(reference.primary.slice(-4096), rate);
    const bins = Array.isArray(spectrum) ? spectrum : (spectrum.bins || []);
    const candidates = bins.filter(bin => (bin.hz ?? bin.frequency) >= 40 && (bin.hz ?? bin.frequency) <= 1500).sort((a, b) => (b.power ?? b.amplitude ?? 0) - (a.power ?? a.amplitude ?? 0));
    const strongest = candidates[0];
    const observation = { dominantHz: strongest ? (strongest.hz ?? strongest.frequency) : null, status: strongest ? 'Spectral peak observed' : 'Unresolved mixture', claim: 'Microphone mixture only. A spectral peak does not identify a rider, vehicle, or muffler.' };
    const counts = Object.fromEntries(['motorcycle', 'car', 'pedestrian'].map(kind => [kind, scene.sources.filter(source => source.kind === kind).length]));
    const record = {
      schema: 'simulatte.nycNoiseComparison.v4', mapHash,
      scene: { config: scene.config, panel: scene.panel, receiver: scene.receiver, reference: scene.reference, speaker: scene.speaker, center: scene.center, observers: scene.observers, requestedCounts: scene.requestedCounts },
      time, interval: [start, start + duration], sampleRate: rate, readings, points, local, observers, ledger,
      poweredEmitter: { enabled: !!controller, energyJ: activeJoules, clippedSamples: controller ? controller.clipped : 0 },
      observation, counts, excludedIndoorPoints, geometryStepSeconds: solver.geometryStepSeconds,
      assumptions: [
        'Street and building geometry comes from the packaged NYC snapshot; traffic demand, lane direction, junction phases, and source levels are synthetic.',
        'Vehicles follow smoothed street paths with headway, acceleration, junction reservations, and modeled signals. This is not calibrated NYC traffic.',
        'Acoustic paths include finite travel time, up to twelve nearby first-order facade candidates, and approximate roof diffraction. Facade pressure reflection is assumed to be 0.55.',
        'Propagation paths update every 20 milliseconds and interpolate between updates. Audio is synthesized at 8 kHz, not a full-band recording.',
        'The surface uses an idealized finite-aperture directional model. Returned sound follows emission geometry, not the moving source position.',
        'The ledger accounts for modeled source energy and direct panel interception, not a complete canyon flux integral. Powered output is separate.',
        'The causal controller is evaluated at multiple points; no cancellation amount or scene-wide benefit is guaranteed.',
        'Street-map samples are 12 meters apart; local listener samples are 0.25 meters apart. Neither resolves the complete interference field.'
      ], qualification: 'Unvalidated NYC integration'
    };
    report(.98, 'Preparing comparison');
    const audio = { baseline: listener.free, redirected: listener.returned, total };
    self.postMessage({ id, type: 'result', record, audio, spectrum }, [audio.baseline.buffer, audio.redirected.buffer, audio.total.buffer]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error.message });
  }
};
