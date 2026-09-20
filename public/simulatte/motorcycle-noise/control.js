(function (root, factory) {
  const signal = typeof module === 'object' && module.exports ? require('./signal.js') : root.MotorcycleSignal;
  const api = factory(signal);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotorcycleControl = api;
})(globalThis, function (signal) {
  const clip = (v, limit) => Math.max(-limit, Math.min(limit, v));
  function sensor(input, p, seed) {
    const rng = signal.random(seed);
    return Float64Array.from(input, value => clip(value + (rng() * 2 - 1) * p.sensorNoisePa, p.sensorClipPa));
  }
  function causal(reference, incident, taps, p) {
    const observed = sensor(reference, p, p.seed + 800), noise = signal.random(p.seed + 900);
    const n = reference.length, command = new Float64Array(n), residual = new Float64Array(n);
    const latency = Math.ceil(p.latencyMs * p.sampleRate / 1000), weights = new Float64Array(p.controllerTaps);
    const filtered = signal.convolve(observed, taps);
    let clipped = 0;
    for (let i = 0; i < n; i++) {
      let output = 0;
      for (let k = 0; k < weights.length; k++) output += weights[k] * (observed[i - latency - k] || 0);
      command[i] = clip(output, p.speakerLimitPa);
      if (command[i] !== output) clipped++;
      let secondary = 0;
      for (const tap of taps) secondary += tap.gain * signal.sample(command, i - tap.delay);
      residual[i] = incident[i] + secondary;
      const error = clip(residual[i] + (noise() * 2 - 1) * p.sensorNoisePa, p.sensorClipPa);
      let power = 1e-6;
      for (let k = 0; k < weights.length; k++) power += (filtered[i - latency - k] || 0) ** 2;
      for (let k = 0; k < weights.length; k++) weights[k] -= p.controllerStep * error * (filtered[i - latency - k] || 0) / power;
    }
    return { command, residual, clipped, kind: 'causal-fxlms', futureSamples: false };
  }
  function ideal(incident, taps, p) {
    const maxDelay = Math.ceil(Math.max(...taps.map(tap => tap.delay))) + 2;
    const length = signal.size((incident.length + maxDelay) * 2), impulse = new Float64Array(length);
    for (const tap of taps) {
      const low = Math.floor(tap.delay), fraction = tap.delay - low;
      impulse[low] += tap.gain * (1 - fraction); impulse[low + 1] += tap.gain * fraction;
    }
    const h = signal.spectrum(impulse, length), d = signal.spectrum(incident, length);
    for (let k = 0; k < length; k++) {
      const denominator = h.real[k] ** 2 + h.imaginary[k] ** 2 + 1e-5;
      const real = -(d.real[k] * h.real[k] + d.imaginary[k] * h.imaginary[k]) / denominator;
      d.imaginary[k] = -(d.imaginary[k] * h.real[k] - d.real[k] * h.imaginary[k]) / denominator; d.real[k] = real;
    }
    signal.fft(d.real, d.imaginary, true);
    let clipped = 0;
    const command = Float64Array.from(d.real.slice(0, incident.length), value => { const bounded = clip(value, p.speakerLimitPa); if (bounded !== value) clipped++; return bounded; });
    const secondary = signal.convolve(command, taps);
    return { command, residual: Float64Array.from(incident, (v, i) => v + secondary[i]), clipped,
      kind: 'ideal-offline-inverse', futureSamples: true };
  }
  return { causal, ideal, sensor };
});
