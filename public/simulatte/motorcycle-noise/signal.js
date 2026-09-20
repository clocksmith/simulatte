(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotorcycleSignal = api;
})(globalThis, function () {
  const P0 = 20e-6;
  function fft(real, imaginary, inverse = false) {
    const n = real.length;
    if (n < 2 || (n & (n - 1)) || imaginary.length !== n) throw new Error('FFT requires equal power-of-two arrays');
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]]; }
    }
    for (let length = 2; length <= n; length *= 2) {
      const angle = (inverse ? 2 : -2) * Math.PI / length, c = Math.cos(angle), s = Math.sin(angle);
      for (let start = 0; start < n; start += length) {
        let wr = 1, wi = 0;
        for (let j = 0; j < length / 2; j++) {
          const a = start + j, b = a + length / 2;
          const tr = wr * real[b] - wi * imaginary[b], ti = wr * imaginary[b] + wi * real[b];
          real[b] = real[a] - tr; imaginary[b] = imaginary[a] - ti; real[a] += tr; imaginary[a] += ti;
          const next = wr * c - wi * s; wi = wr * s + wi * c; wr = next;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { real[i] /= n; imaginary[i] /= n; }
    return { real, imaginary };
  }
  const size = n => 2 ** Math.ceil(Math.log2(Math.max(2, n)));
  function spectrum(samples, length = size(samples.length)) {
    const real = new Float64Array(length), imaginary = new Float64Array(length);
    real.set(samples); return fft(real, imaginary);
  }
  const energy = samples => samples.reduce((sum, p) => sum + p * p, 0) / samples.length;
  const level = meanSquare => meanSquare > 0 ? 10 * Math.log10(meanSquare / (P0 * P0)) : -120;
  const combineLevels = values => 10 * Math.log10(values.reduce((sum, db) => sum + 10 ** (db / 10), 0));
  function aWeight(f) {
    if (f <= 0) return 0;
    const f2 = f * f;
    return 10 ** (2 / 20) * (12194 ** 2 * f2 * f2) /
      ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  }
  function measure(samples, sampleRate) {
    const { real, imaginary } = spectrum(samples, size(samples.length * 2));
    const bands = [63, 125, 250, 500, 1000, 2000, 3150].map(f => ({ hz: f, square: 0 }));
    for (let i = 0; i < real.length; i++) {
      const frequency = Math.min(i, real.length - i) * sampleRate / real.length;
      for (const band of bands) if (frequency >= band.hz / Math.SQRT2 && frequency < band.hz * Math.SQRT2) {
        band.square += (real[i] ** 2 + imaginary[i] ** 2) / (real.length * samples.length);
      }
      const weight = aWeight(frequency); real[i] *= weight; imaginary[i] *= weight;
    }
    fft(real, imaginary, true);
    let sum = 0, fast = 0, peak = 0;
    const memory = Math.exp(-1 / (0.125 * sampleRate));
    for (let i = 0; i < samples.length; i++) {
      const square = real[i] ** 2;
      sum += square; fast = memory * fast + (1 - memory) * square; peak = Math.max(peak, fast);
    }
    return { laeq: level(sum / samples.length), lafmax: level(peak), lzEq: level(energy(samples)),
      duration: samples.length / sampleRate, spectrum: bands.map(row => ({ hz: row.hz, dbZ: level(row.square) })) };
  }
  function sample(signal, index) {
    if (index < 0 || index >= signal.length) return 0;
    const lo = Math.floor(index), fraction = index - lo;
    return signal[lo] * (1 - fraction) + (signal[lo + 1] || 0) * fraction;
  }
  function convolve(signal, taps) {
    const result = new Float64Array(signal.length);
    for (let i = 0; i < result.length; i++) for (const tap of taps) result[i] += tap.gain * sample(signal, i - tap.delay);
    return result;
  }
  function random(seed) {
    let value = seed >>> 0 || 1;
    return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
  }
  return { P0, fft, size, spectrum, energy, level, combineLevels, aWeight, measure, sample, convolve, random };
});
