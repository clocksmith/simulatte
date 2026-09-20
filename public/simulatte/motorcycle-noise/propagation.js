(function (root, factory) {
  const scene = typeof module === 'object' && module.exports ? require('./scene.js') : root.MotorcycleScene;
  const signal = typeof module === 'object' && module.exports ? require('./signal.js') : root.MotorcycleSignal;
  const api = factory(scene, signal);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotorcyclePropagation = api;
})(globalThis, function (scene, signal) {
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  function emissions(source, p) {
    const n = Math.round(p.duration * p.sampleRate), output = new Float64Array(n), rng = signal.random(source.seed);
    let exhaust = 0, intake = 0, mean = 0;
    const smooth = 1 - Math.exp(-2 * Math.PI * source.exhaustCutoffHz / p.sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / p.sampleRate, angle = (source.phase + t * source.rpm * 6) % 720;
      let pulse = 0;
      for (const firing of source.firingAngles) {
        const delta = ((angle - firing + 1080) % 720) - 360;
        pulse += Math.exp(-0.5 * (delta / 15) ** 2);
      }
      exhaust += smooth * (pulse - exhaust);
      intake += 0.35 * ((rng() * 2 - 1) - intake);
      output[i] = exhaust + 0.07 * intake + 0.025 * Math.sin(t * source.rpm / 60 * 2 * Math.PI + source.phase);
      mean += output[i];
    }
    mean /= n;
    for (let i = 0; i < n; i++) output[i] -= mean;
    const rms = Math.sqrt(signal.energy(output)), desired = signal.P0 * 10 ** (p.referenceDbZ / 20);
    for (let i = 0; i < n; i++) output[i] *= desired / rms;
    return output;
  }
  function definitions(p) {
    const paths = [{ id: 'direct', wallCount: 0, ground: false, mirrors: [] }];
    if (p.groundReflection > 0) paths.push({ id: 'ground', wallCount: 0, ground: true, mirrors: [] });
    for (let order = 1; order <= p.reflectionOrder; order++) for (const side of [-1, 1]) {
      paths.push({ id: `wall-${side}-${order}`, wallCount: order, ground: false,
        mirrors: Array.from({ length: order }, (_, i) => side * (i % 2 ? -1 : 1) * p.streetHalfWidth) });
    }
    return paths;
  }
  function imagePoint(point, path) {
    const next = [...point];
    if (path.ground) next[2] *= -1;
    for (const y of path.mirrors) next[1] = 2 * y - next[1];
    return next;
  }
  function barrierDetour(source, receiver, height) {
    const fraction = (6 - source[1]) / (receiver[1] - source[1]);
    if (!(fraction > 0 && fraction < 1)) return null;
    const x = source[0] + fraction * (receiver[0] - source[0]), z = source[2] + fraction * (receiver[2] - source[2]);
    if (Math.abs(x) > 10 || z >= height) return null;
    const edge = [x, 6, height];
    return distance(source, edge) + distance(edge, receiver);
  }
  function pathAt(source, receiver, time, path, p, mitigation) {
    let emissionTime = time, pathLength = 0, excess = 0;
    for (let iteration = 0; iteration < 6; iteration++) {
      const point = scene.position(source, emissionTime), image = imagePoint(point, path);
      const directLength = distance(image, receiver);
      const detour = mitigation === 'barrier' && path.id === 'direct' ? barrierDetour(point, receiver, p.barrierHeight) : null;
      pathLength = detour === null ? directLength : detour;
      excess = detour === null ? 0 : detour - directLength;
      emissionTime = time - pathLength / p.soundSpeed;
    }
    // Impedance/air losses are declared low-pass approximations, not calibrated materials.
    const reflection = (path.ground ? p.groundReflection : 1) * p.wallReflection ** path.wallCount
      * (mitigation === 'facade' ? (Math.sqrt(1 - p.facadeAbsorption)) ** path.wallCount : 1);
    const diffraction = excess > 0 ? 1 / Math.sqrt(3 + 40 * excess * 500 / p.soundSpeed) : 1;
    const cutoff = 3500 / (1 + p.airLoss * pathLength + path.wallCount * 0.3 + excess * 3);
    return { delay: pathLength / p.soundSpeed * p.sampleRate,
      gain: reflection * diffraction / Math.max(0.25, pathLength), lowpass: 1 - Math.exp(-2 * Math.PI * cutoff / p.sampleRate),
      distance: pathLength, emissionTime };
  }
  function receive(sources, waves, receiver, p, mitigation = 'none') {
    const n = waves[0].length, result = new Float64Array(n), paths = definitions(p), step = p.pathStepSamples;
    for (let s = 0; s < sources.length; s++) for (const path of paths) {
      let filtered = 0;
      let left = pathAt(sources[s], receiver, 0, path, p, mitigation);
      for (let start = 0; start < n; start += step) {
        const right = pathAt(sources[s], receiver, (start + step) / p.sampleRate, path, p, mitigation);
        for (let i = start; i < Math.min(n, start + step); i++) {
          const mix = (i - start) / step, delay = left.delay + mix * (right.delay - left.delay);
          const gain = left.gain + mix * (right.gain - left.gain), alpha = left.lowpass + mix * (right.lowpass - left.lowpass);
          const input = signal.sample(waves[s], i - delay);
          filtered += alpha * (input - filtered); result[i] += gain * filtered;
        }
        left = right;
      }
    }
    return result;
  }
  function secondaryTaps(receiver, p) {
    // Fixed speaker path uses the same images and loss model, expanded to an impulse response.
    const source = { x: p.speaker[0], y: p.speaker[1], z: p.speaker[2], speed: 0, acceleration: 0 };
    const result = [];
    for (const definition of definitions(p)) {
      const path = pathAt(source, receiver, 0, definition, p, 'none');
      for (let i = 0; i < 24; i++) result.push({ delay: path.delay + i, gain: path.gain * path.lowpass * (1 - path.lowpass) ** i });
    }
    return result;
  }
  return { distance, emissions, definitions, imagePoint, barrierDetour, pathAt, receive, secondaryTaps };
});
