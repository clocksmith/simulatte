(function (root, factory) {
  const signal = typeof module === 'object' && module.exports ? require('./signal.js') : root.MotorcycleSignal;
  const api = factory(signal);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotorcycleSensing = api;
})(globalThis, function (signal) {
  const microphones = () => [3, 4.5].flatMap(y => [-3, -1, 1, 3].map(x => [x, y, 1.5]));
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  function localize(signals, positions, sampleRate, soundSpeed) {
    if (signals.length !== positions.length || signals.length < 3 || signals.some(s => s.length !== signals[0].length)) throw new Error('Microphone observations and geometry must match');
    const length = signal.size(signals[0].length * 2), spectra = signals.map(s => signal.spectrum(s, length));
    const correlations = spectra.slice(1).map(s => {
      const real = new Float64Array(length), imaginary = new Float64Array(length);
      for (let k = 0; k < length; k++) {
        const re = s.real[k] * spectra[0].real[k] + s.imaginary[k] * spectra[0].imaginary[k];
        const im = s.imaginary[k] * spectra[0].real[k] - s.real[k] * spectra[0].imaginary[k], magnitude = Math.hypot(re, im);
        if (magnitude > 1e-12) { real[k] = re / magnitude; imaginary[k] = im / magnitude; }
      }
      signal.fft(real, imaginary, true); return real;
    });
    const rows = [];
    for (let x = -18; x <= 18; x += 1) for (let y = -2; y <= 2; y += 1) {
      const point = [x, y, 0.7], referenceDistance = distance(point, positions[0]);
      let score = 0;
      for (let m = 1; m < positions.length; m++) {
        const lag = (distance(point, positions[m]) - referenceDistance) * sampleRate / soundSpeed;
        const index = (lag + length) % length, lo = Math.floor(index), fraction = index - lo;
        score += correlations[m - 1][lo] * (1 - fraction) + correlations[m - 1][(lo + 1) % length] * fraction;
      }
      rows.push({ point, score: score / correlations.length });
    }
    rows.sort((a, b) => b.score - a.score);
    const best = rows[0], alternative = rows.find(row => distance(row.point, best.point) > 3);
    const margin = best.score > 0 ? (best.score - alternative.score) / best.score : 0;
    const resolved = best.score > 0.025 && margin > 0.18;
    return { method: 'SRP-GCC-PHAT-grid-v1', status: resolved ? 'located' : 'unresolved',
      point: resolved ? best.point : null, hypotheses: [best, alternative], margin,
      claim: 'Correlation scores are not calibrated probabilities; multiple sources may remain unresolved.' };
  }
  function associate(location, tracks, microphone, soundSpeed) {
    if (!location.point) return { status: 'unresolved', trackId: null, alternatives: tracks.map(row => row.id) };
    const delay = distance(location.point, microphone) / soundSpeed;
    const candidates = tracks.map(row => ({ id: row.id,
      distance: distance(location.point, [row.position[0] - row.velocity[0] * delay, row.position[1] - row.velocity[1] * delay, row.position[2]])
    })).sort((a, b) => a.distance - b.distance);
    const accepted = candidates[0]?.distance < 2.5 && (!candidates[1] || candidates[1].distance - candidates[0].distance > 1.5);
    return { status: accepted ? 'associated' : 'unresolved', trackId: accepted ? candidates[0].id : null, alternatives: candidates };
  }
  // Synthetic numeric plates use a fixed, inspectable 3x5 glyph alphabet.
  const GLYPHS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];
  function plateImage(text) {
    if (!/^\d{6}$/.test(text)) throw new Error('Synthetic plate must contain six digits');
    const width = 24, height = 7, pixels = new Float64Array(width * height).fill(1);
    for (let c = 0; c < 6; c++) for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) pixels[(y + 1) * width + c * 4 + x] = GLYPHS[Number(text[c])][y * 3 + x] === '1' ? 0 : 1;
    return { width, height, pixels };
  }
  function degradePlate(image, { platePixels, plateBlur, plateNoise, seed }) {
    const width = platePixels, height = Math.max(2, Math.round(width * image.height / image.width)), pixels = new Float64Array(width * height), rng = signal.random(seed);
    // Pixel-area averaging captures loss of character information below native resolution.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const u = Math.min(image.width - 1, Math.floor((x + (sx + 0.5) / 4) * image.width / width));
        const v = Math.min(image.height - 1, Math.floor((y + (sy + 0.5) / 4) * image.height / height));
        sum += image.pixels[v * image.width + u];
      }
      pixels[y * width + x] = sum / 16;
    }
    const blurred = new Float64Array(pixels.length), radius = Math.round(plateBlur);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += pixels[y * width + Math.max(0, Math.min(width - 1, x + k))];
      blurred[y * width + x] = Math.max(0, Math.min(1, sum / (2 * radius + 1) + (rng() * 2 - 1) * plateNoise));
    }
    return { width, height, pixels: blurred };
  }
  function readPlate(image) {
    if (image.width < 48 || image.height < 10) return { status: 'unreadable', text: null, characters: [] };
    const characters = [];
    for (let c = 0; c < 6; c++) {
      const values = [];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
        const u = Math.min(image.width - 1, Math.floor((c * 4 + x + 0.5) / 24 * image.width));
        const v = Math.min(image.height - 1, Math.floor((y + 1.5) / 7 * image.height));
        values.push(image.pixels[v * image.width + u]);
      }
      const scores = GLYPHS.map((glyph, digit) => ({ digit: String(digit), error: values.reduce((sum, v, i) => sum + (v - (glyph[i] === '1' ? 0 : 1)) ** 2, 0) / 15 })).sort((a, b) => a.error - b.error);
      characters.push(scores[0].error < 0.08 && scores[1].error - scores[0].error > 0.025 ? scores[0].digit : '?');
    }
    return { status: characters.includes('?') ? 'unreadable' : 'read', text: characters.includes('?') ? null : characters.join(''), characters };
  }
  return { microphones, localize, associate, plateImage, degradePlate, readPlate };
});
