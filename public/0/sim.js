'use strict';

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const RAF = window.requestAnimationFrame.bind(window);

const app = {
  canvas: null,
  ctx: null,
  dpr: window.devicePixelRatio || 1,
  width: 0,
  height: 0,
  lastTimestamp: performance.now(),
};

const physicsModes = {
  schrodinger: {
    key: 'schrodinger',
    label: 'Schrödinger',
    mass: 1,
    velocityRange: { min: -0.8, max: 0.8, step: 0.005 },
    dispersion(k, mass) {
      return 0.5 * k * k / mass;
    },
    groupVelocity(momentum, mass) {
      return momentum / mass;
    },
  },
  dirac: {
    key: 'dirac',
    label: 'Relativistic',
    mass: 1,
    velocityRange: { min: -0.99, max: 0.99, step: 0.0025 },
    dispersion(k, mass) {
      return Math.sqrt(mass * mass + k * k) - mass;
    },
    groupVelocity(momentum, mass) {
      const energy = Math.sqrt(momentum * momentum + mass * mass);
      return momentum / energy;
    },
  },
};

const sim = {
  mode: 'schrodinger',
  physics: physicsModes.schrodinger,
  gridSize: 512,
  xMin: -4,
  xMax: 4,
  dx: 0,
  dt: 0.002,
  timeScale: 1,
  time: 0,
  psiRe: null,
  psiIm: null,
  scratchRe: null,
  scratchIm: null,
  probability: null,
  phase: null,
  potential: null,
  kValues: null,
  dispersion: null,
  potentialPhase: null,
  kineticPhase: null,
  absorbMask: null,
  fftCache: null,
  barrier: {
    active: false,
    position: 0.5,
    width: 0.2,
    height: 0.8,
  },
  packet: {
    center: -1.2,
    sigma: 0.5,
    velocity: 0,
  },
  expectation: {
    position: 0,
    momentum: 0,
    sigmaX: 0,
    energy: 0,
    tunnel: 0,
    maxProb: 0,
    transmission: 0,
    reflection: 0,
  },
  metrics: {
    incidentFlux: 0,
    transmittedFlux: 0,
    reflectedFlux: 0,
  },
  xGrid: null,
  isEvolving: false,
  waveDirection: 1,
  flashIntensity: 0,
};

const fftState = {
  size: 0,
  levels: 0,
  bitReversed: null,
  trigCos: null,
  trigSin: null,
};

const interactionInfo = {
  'mode-select': {
    concept: 'Dynamics',
    principle: 'Hamiltonian Choice',
    describeMode: (mode) => (mode === 'dirac'
      ? 'Relativistic propagation with energy √(p² + m²) − m and β slider.'
      : 'Non-relativistic Schrödinger evolution with kinetic operator p²/2m.'),
  },
  'center-slider': {
    concept: 'Launch Point',
    principle: 'Initial Expectation',
    describeValue: (value) => `Wave packet seeded near x = ${value.toFixed(2)}.`,
  },
  'velocity-slider': {
    concept: 'Group Velocity',
    principle: 'Momentum Control',
    describeVelocity: (value) => `Group velocity set to ${value.toFixed(3)} in units of c.`,
  },
  'energy-slider': {
    concept: 'Uncertainty',
    principle: 'Δx · Δp ≥ ħ/2',
    describeSigma: (sigma) => `Gaussian width σ = ${sigma.toFixed(2)}.`,
  },
  'barrier-position-slider': {
    concept: 'Barrier Placement',
    principle: 'Potential Control',
    describe: (position) => `Barrier centre at x = ${position.toFixed(2)}.`,
  },
  'barrier-height-slider': {
    concept: 'Potential Energy',
    principle: 'Barrier Height',
    describe: (height) => `Barrier height V = ${height.toFixed(2)}.`,
  },
  'barrier-width-slider': {
    concept: 'Spatial Extent',
    principle: 'Barrier Width',
    describe: (width) => `Barrier width Δx = ${width.toFixed(2)}.`,
  },
  'time-scale-slider': {
    concept: 'Temporal Scaling',
    principle: 'Playback Rate',
    describeScale: (scale) => `Playback speed ×${scale.toFixed(2)}.`,
  },
  'add-barrier-btn': {
    concept: 'Barrier Toggle',
    principle: 'Potential Switch',
    describe: (active) => (active
      ? 'Barrier enabled. Observe reflection and transmission.'
      : 'Barrier disabled. Free propagation resumes.'),
  },
  'parity-flip-btn': {
    concept: 'Parity',
    principle: 'Spatial Symmetry',
    describe: () => 'Applied parity transformation ψ(x) → ψ(−x).',
  },
  'identity-evolve-btn': {
    concept: 'Evolution',
    principle: 'Unitary Flow',
    describe: (running) => (running ? 'Unitary evolution running.' : 'Evolution paused.'),
  },
  'reset-sim-btn': {
    concept: 'Reset',
    principle: 'Initial Conditions',
    describe: () => 'Simulation reset to launch state.',
  },
};

const ui = {
  elements: {},
  init() {
    const ids = [
      'mode-select',
      'mode-label',
      'center-slider',
      'velocity-slider',
      'energy-slider',
      'barrier-position-slider',
      'barrier-height-slider',
      'barrier-width-slider',
      'time-scale-slider',
      'velocity-value',
      'energy-value',
      'center-value',
      'barrier-position-value',
      'barrier-height-value',
      'barrier-width-value',
      'time-scale-value',
      'info-pos',
      'info-mom',
      'info-width',
      'info-gamma',
      'info-barrier',
      'info-evolving',
      'concept-title',
      'concept-context',
      'unity-title',
      'unity-link',
      'url-hash-display',
      'theme-toggle',
      'theme-label',
      'add-barrier-btn',
      'parity-flip-btn',
      'identity-evolve-btn',
      'reset-sim-btn',
    ];
    ids.forEach((id) => {
      this.elements[id] = document.getElementById(id);
    });

    const modeSelect = this.elements['mode-select'];
    if (modeSelect) {
      modeSelect.value = sim.mode;
      modeSelect.addEventListener('change', (event) => {
        setSimulationMode(event.target.value);
        handleInteraction('mode-select');
      });
      this.updateModeLabel();
    }

    const centerSlider = this.elements['center-slider'];
    centerSlider.addEventListener('input', (event) => {
      const value = clamp(parseFloat(event.target.value), sim.xMin + 0.5, sim.xMax - 0.5);
      sim.packet.center = value;
      this.updateSliderValue('center', sim.packet.center, 2);
      if (!sim.isEvolving) {
        rebuildWavePacket();
        renderWave();
        this.updateInfo();
      }
      handleInteraction('center-slider');
    });

    const velocitySlider = this.elements['velocity-slider'];
    this.syncVelocitySliderRange();
    velocitySlider.addEventListener('input', (event) => {
      const range = sim.physics.velocityRange;
      sim.packet.velocity = clamp(parseFloat(event.target.value), range.min, range.max);
      this.updateSliderValue('velocity', sim.packet.velocity, 3);
      rebuildWavePacket();
      renderWave();
      this.updateInfo();
      handleInteraction('velocity-slider');
    });

    const sigmaSlider = this.elements['energy-slider'];
    sigmaSlider.addEventListener('input', (event) => {
      sim.packet.sigma = clamp(parseFloat(event.target.value), 0.1, 1.5);
      this.updateSliderValue('energy', sim.packet.sigma, 2);
      rebuildWavePacket();
      renderWave();
      this.updateInfo();
      handleInteraction('energy-slider');
    });

    const posSlider = this.elements['barrier-position-slider'];
    posSlider.addEventListener('input', (event) => {
      sim.barrier.position = clamp(parseFloat(event.target.value), sim.xMin + 0.5, sim.xMax - 0.5);
      this.updateSliderValue('barrier-position', sim.barrier.position, 2);
      updatePotential();
      renderWave();
      handleInteraction('barrier-position-slider');
    });

    const heightSlider = this.elements['barrier-height-slider'];
    heightSlider.addEventListener('input', (event) => {
      sim.barrier.height = clamp(parseFloat(event.target.value), 0, 3);
      this.updateSliderValue('barrier-height', sim.barrier.height, 2);
      updatePotential();
      renderWave();
      handleInteraction('barrier-height-slider');
    });

    const widthSlider = this.elements['barrier-width-slider'];
    widthSlider.addEventListener('input', (event) => {
      sim.barrier.width = clamp(parseFloat(event.target.value), 0.05, 1.5);
      this.updateSliderValue('barrier-width', sim.barrier.width, 2);
      updatePotential();
      renderWave();
      handleInteraction('barrier-width-slider');
    });

    const timeScaleSlider = this.elements['time-scale-slider'];
    timeScaleSlider.addEventListener('input', (event) => {
      sim.timeScale = clamp(parseFloat(event.target.value), 0.01, 5.0);
      this.updateSliderValue('time-scale', sim.timeScale, 2);
      handleInteraction('time-scale-slider');
    });

    this.elements['add-barrier-btn'].addEventListener('click', () => {
      sim.barrier.active = !sim.barrier.active;
      this.elements['add-barrier-btn'].textContent = sim.barrier.active
        ? '[ − ] Remove Barrier'
        : '[ + ] Add Barrier';
      updatePotential();
      handleInteraction('add-barrier-btn');
    });

    this.elements['parity-flip-btn'].addEventListener('click', () => {
      applyParityTransform();
      renderWave();
      this.updateInfo();
      handleInteraction('parity-flip-btn');
    });

    const evolveBtn = this.elements['identity-evolve-btn'];
    evolveBtn.addEventListener('click', () => {
      sim.isEvolving = !sim.isEvolving;
      evolveBtn.textContent = sim.isEvolving ? '[ ⏸ Pause ] Time' : '[ ▶ Evolve ] Time';
      handleInteraction('identity-evolve-btn');
    });

    this.elements['reset-sim-btn'].addEventListener('click', () => {
      resetSimulation();
      handleInteraction('reset-sim-btn');
    });

    const themeToggle = this.elements['theme-toggle'];
    themeToggle.addEventListener('change', (event) => {
      this.toggleTheme(event.target.checked);
      flash();
    });

    this.toggleTheme(themeToggle.checked);
    this.updateSliderValue('center', sim.packet.center, 2);
    this.updateSliderValue('velocity', sim.packet.velocity, 3);
    this.updateSliderValue('energy', sim.packet.sigma, 2);
    this.updateSliderValue('barrier-position', sim.barrier.position, 2);
    this.updateSliderValue('barrier-height', sim.barrier.height, 2);
    this.updateSliderValue('barrier-width', sim.barrier.width, 2);
    this.updateSliderValue('time-scale', sim.timeScale, 2);
  },
  updateSliderValue(prefix, value, digits = 2) {
    const label = this.elements[`${prefix}-value`];
    if (label) label.textContent = value.toFixed(digits);
  },
  syncVelocitySliderRange() {
    const slider = this.elements['velocity-slider'];
    if (!slider) return;
    const range = sim.physics.velocityRange;
    slider.min = range.min.toString();
    slider.max = range.max.toString();
    slider.step = range.step.toString();
  },
  updateModeLabel() {
    const label = this.elements['mode-label'];
    if (label) {
      label.textContent = sim.physics.label;
    }
  },
  updateInfo() {
    const { position, momentum, sigmaX, tunnel, energy, transmission, reflection } = sim.expectation;
    this.elements['info-pos'].textContent = position.toFixed(3);
    this.elements['info-mom'].textContent = momentum.toFixed(3);
    this.elements['info-width'].textContent = sigmaX.toFixed(3);
    this.updateSliderValue('center', position, 2);

    const slider = this.elements['center-slider'];
    if (slider) slider.value = position.toFixed(4);

    if (sim.mode === 'dirac') {
      const beta = clamp(sim.physics.groupVelocity(momentum, sim.physics.mass), -0.999999, 0.999999);
      const gamma = 1 / Math.sqrt(1 - beta * beta);
      this.elements['info-gamma'].textContent = gamma.toFixed(3);
    } else {
      this.elements['info-gamma'].textContent = '—';
    }

    if (sim.barrier.active) {
      this.elements['info-barrier'].textContent = sim.metrics.incidentFlux > 1e-6
        ? `T=${(transmission * 100).toFixed(1)}% R=${(reflection * 100).toFixed(1)}%`
        : 'measuring…';
    } else {
      this.elements['info-barrier'].textContent = 'Inactive';
    }
    this.elements['info-evolving'].textContent = sim.isEvolving ? `Yes (E=${energy.toFixed(3)})` : 'No';
  },
  updateConcept(id) {
    const info = interactionInfo[id];
    if (!info) return;
    let detail = '';
    switch (id) {
      case 'mode-select':
        detail = info.describeMode(sim.mode);
        break;
      case 'center-slider':
        detail = info.describeValue(sim.packet.center);
        break;
      case 'velocity-slider':
        detail = info.describeVelocity(sim.packet.velocity);
        break;
      case 'energy-slider':
        detail = info.describeSigma(sim.packet.sigma);
        break;
      case 'barrier-position-slider':
        detail = info.describe(sim.barrier.position);
        break;
      case 'barrier-height-slider':
        detail = info.describe(sim.barrier.height);
        break;
      case 'barrier-width-slider':
        detail = info.describe(sim.barrier.width);
        break;
      case 'time-scale-slider':
        detail = info.describeScale(sim.timeScale);
        break;
      case 'add-barrier-btn':
        detail = info.describe(sim.barrier.active);
        break;
      case 'identity-evolve-btn':
        detail = info.describe(sim.isEvolving);
        break;
      default:
        detail = typeof info.describe === 'function' ? info.describe() : (info.describe || '');
    }
    this.elements['concept-title'].textContent = `Concept: ${info.concept}`;
    this.elements['concept-context'].innerHTML = `<p>${detail}</p>`;
    this.elements['unity-title'].textContent = info.principle;
    this.elements['unity-link'].innerHTML = '<a href="/1" target="_blank">X⁰ = 1</a>';
  },
  toggleTheme(light) {
    const container = document.getElementById('app-container');
    if (container) container.classList.toggle('light-theme', light);
    const label = this.elements['theme-label'];
    if (label) label.textContent = light ? '|1⟩' : '|0⟩';
  },
};

function initFFT(size) {
  const levels = Math.log2(size) | 0;
  if ((1 << levels) !== size) {
    throw new Error('Grid size must be a power of two for FFT evolution.');
  }
  if (fftState.size === size) return;
  fftState.size = size;
  fftState.levels = levels;
  fftState.bitReversed = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    fftState.bitReversed[i] = reverseBits(i, levels);
  }
  fftState.trigCos = new Float64Array(size / 2);
  fftState.trigSin = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    const angle = TWO_PI * i / size;
    fftState.trigCos[i] = Math.cos(angle);
    fftState.trigSin[i] = Math.sin(angle);
  }
}

function reverseBits(value, bits) {
  let reversed = 0;
  for (let i = 0; i < bits; i++) {
    reversed = (reversed << 1) | (value & 1);
    value >>= 1;
  }
  return reversed;
}

function fftTransform(re, im, inverse) {
  const { size, bitReversed, trigCos, trigSin } = fftState;
  for (let i = 0; i < size; i++) {
    const j = bitReversed[i];
    if (j > i) {
      const tempRe = re[i];
      const tempIm = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tempRe;
      im[j] = tempIm;
    }
  }

  for (let len = 2; len <= size; len <<= 1) {
    const halfLen = len >> 1;
    const step = size / len;
    for (let i = 0; i < size; i += len) {
      for (let j = 0; j < halfLen; j++) {
        const k = step * j;
        const cosVal = trigCos[k];
        const sinVal = inverse ? -trigSin[k] : trigSin[k];
        const idx1 = i + j;
        const idx2 = idx1 + halfLen;

        const tre = cosVal * re[idx2] - sinVal * im[idx2];
        const tim = cosVal * im[idx2] + sinVal * re[idx2];

        re[idx2] = re[idx1] - tre;
        im[idx2] = im[idx1] - tim;
        re[idx1] += tre;
        im[idx1] += tim;
      }
    }
  }

  if (inverse) {
    const invSize = 1 / size;
    for (let i = 0; i < size; i++) {
      re[i] *= invSize;
      im[i] *= invSize;
    }
  }
}

function initializeArrays() {
  const size = sim.gridSize;
  const length = sim.xMax - sim.xMin;
  sim.dx = length / size;
  sim.psiRe = new Float64Array(size);
  sim.psiIm = new Float64Array(size);
  sim.scratchRe = new Float64Array(size);
  sim.scratchIm = new Float64Array(size);
  sim.probability = new Float64Array(size);
  sim.phase = new Float64Array(size);
  sim.potential = new Float64Array(size);
  sim.potentialPhase = new Float64Array(size);
  sim.kineticPhase = new Float64Array(size);
  sim.absorbMask = new Float64Array(size);
  sim.xGrid = new Float64Array(size);
  sim.kValues = new Float64Array(size);
  sim.dispersion = new Float64Array(size);

  initFFT(size);

  for (let i = 0; i < size; i++) {
    sim.xGrid[i] = sim.xMin + (i + 0.5) * sim.dx;
  }

  const dk = TWO_PI / length;
  for (let i = 0; i < size; i++) {
    const n = i <= size / 2 ? i : i - size;
    sim.kValues[i] = n * dk;
  }

  buildAbsorbMask();
  updateModeCoefficients();
  updatePotential();
  rebuildWavePacket();
}

function updateModeCoefficients() {
  const { mass } = sim.physics;
  for (let i = 0; i < sim.gridSize; i++) {
    sim.dispersion[i] = sim.physics.dispersion(sim.kValues[i], mass);
  }
  updateKineticPhase(sim.dt);
}

function updateKineticPhase(step) {
  for (let i = 0; i < sim.gridSize; i++) {
    const phase = -sim.dispersion[i] * step;
    sim.kineticPhase[i] = phase;
  }
}

function buildAbsorbMask() {
  const buffer = (sim.xMax - sim.xMin) * 0.25;
  for (let i = 0; i < sim.gridSize; i++) {
    const x = sim.xGrid[i];
    const distance = Math.min(Math.abs(x - sim.xMin), Math.abs(sim.xMax - x));
    const strength = distance < buffer ? Math.pow(1 - distance / buffer, 3) : 0;
    sim.absorbMask[i] = strength * 2.5;
  }
}

function updatePotential() {
  const { active, position, width, height } = sim.barrier;
  const left = position - width / 2;
  const right = position + width / 2;
  let activeCells = 0;
  for (let i = 0; i < sim.gridSize; i++) {
    const x = sim.xGrid[i];
    const potential = active && x >= left && x <= right ? height : 0;
    sim.potential[i] = potential;
    if (potential !== 0) activeCells++;
  }
  updatePotentialPhase(sim.dt);
  resetFluxMetrics();
  console.log(`[QZS] Potential updated: barrier ${active ? 'active' : 'inactive'} cells=${activeCells}`);
}

function updatePotentialPhase(step) {
  for (let i = 0; i < sim.gridSize; i++) {
    sim.potentialPhase[i] = -sim.potential[i] * step * 0.5;
  }
}

function rebuildWavePacket() {
  const size = sim.gridSize;
  const { center, sigma } = sim.packet;
  let velocity = clamp(sim.packet.velocity, sim.physics.velocityRange.min, sim.physics.velocityRange.max);
  sim.packet.velocity = velocity;
  const mass = sim.physics.mass;

  let momentum;
  if (sim.mode === 'dirac') {
    const beta = velocity;
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    momentum = gamma * mass * beta;
  } else {
    momentum = velocity * mass;
  }

  for (let i = 0; i < size; i++) {
    const x = sim.xGrid[i];
    const envelope = Math.exp(-((x - center) * (x - center)) / (2 * sigma * sigma));
    const phase = momentum * (x - center);
    sim.psiRe[i] = envelope * Math.cos(phase);
    sim.psiIm[i] = envelope * Math.sin(phase);
  }

  normalizeWavefunction();
  resetFluxMetrics();
  updateObservables();
}

function normalizeWavefunction() {
  let norm = 0;
  for (let i = 0; i < sim.gridSize; i++) {
    const re = sim.psiRe[i];
    const im = sim.psiIm[i];
    norm += re * re + im * im;
  }
  norm = Math.sqrt(norm * sim.dx);
  if (!Number.isFinite(norm) || norm === 0) {
    console.warn('[QZS] Wavefunction norm invalid, resetting.');
    rebuildWavePacket();
    return;
  }
  const inv = 1 / norm;
  for (let i = 0; i < sim.gridSize; i++) {
    sim.psiRe[i] *= inv;
    sim.psiIm[i] *= inv;
  }
}

function resetFluxMetrics() {
  sim.metrics.incidentFlux = 0;
  sim.metrics.transmittedFlux = 0;
  sim.metrics.reflectedFlux = 0;
}

function applyPotentialHalfStep(step) {
  updatePotentialPhase(step);
  for (let i = 0; i < sim.gridSize; i++) {
    const phase = sim.potentialPhase[i];
    const cosPhase = Math.cos(phase);
    const sinPhase = Math.sin(phase);
    const re = sim.psiRe[i];
    const im = sim.psiIm[i];
    sim.psiRe[i] = re * cosPhase - im * sinPhase;
    sim.psiIm[i] = re * sinPhase + im * cosPhase;
  }
}

function applyKineticStep(step) {
  updateKineticPhase(step);
  fftTransform(sim.psiRe, sim.psiIm, false);
  for (let i = 0; i < sim.gridSize; i++) {
    const phase = sim.kineticPhase[i];
    const cosPhase = Math.cos(phase);
    const sinPhase = Math.sin(phase);
    const re = sim.psiRe[i];
    const im = sim.psiIm[i];
    sim.psiRe[i] = re * cosPhase - im * sinPhase;
    sim.psiIm[i] = re * sinPhase + im * cosPhase;
  }
  fftTransform(sim.psiRe, sim.psiIm, true);
}

function applyAbsorbingBoundary(step) {
  const factor = step;
  for (let i = 0; i < sim.gridSize; i++) {
    const damp = Math.exp(-sim.absorbMask[i] * factor);
    sim.psiRe[i] *= damp;
    sim.psiIm[i] *= damp;
  }
}

function accumulateFlux(step) {
  if (!sim.barrier.active) return;
  const size = sim.gridSize;
  const width = sim.barrier.width;
  const center = sim.barrier.position;
  const padding = Math.max(0.15, width * 0.5 + 3 * sim.dx);
  const leftX = center - width / 2 - padding;
  const rightX = center + width / 2 + padding;
  const leftIndex = clamp(Math.round((leftX - sim.xMin) / sim.dx), 1, size - 2);
  const rightIndex = clamp(Math.round((rightX - sim.xMin) / sim.dx), 1, size - 2);
  const leftCurrent = probabilityCurrent(leftIndex);
  const rightCurrent = probabilityCurrent(rightIndex);
  const direction = sim.waveDirection >= 0 ? 1 : -1;
  if (direction >= 0) {
    if (leftCurrent > 0) sim.metrics.incidentFlux += leftCurrent * step;
    else sim.metrics.reflectedFlux += (-leftCurrent) * step;
    if (rightCurrent > 0) sim.metrics.transmittedFlux += rightCurrent * step;
  } else {
    if (rightCurrent < 0) sim.metrics.incidentFlux += (-rightCurrent) * step;
    else if (rightCurrent > 0) sim.metrics.reflectedFlux += rightCurrent * step;
    if (leftCurrent < 0) sim.metrics.transmittedFlux += (-leftCurrent) * step;
  }
}

function probabilityCurrent(index) {
  const forwardRe = sim.psiRe[index + 1];
  const forwardIm = sim.psiIm[index + 1];
  const backRe = sim.psiRe[index - 1];
  const backIm = sim.psiIm[index - 1];
  const dRe = (forwardRe - backRe) / (2 * sim.dx);
  const dIm = (forwardIm - backIm) / (2 * sim.dx);
  const re = sim.psiRe[index];
  const im = sim.psiIm[index];
  return re * dIm - im * dRe;
}

function updateObservables() {
  const size = sim.gridSize;
  let meanX = 0;
  let meanX2 = 0;
  let maxProb = 0;
  let tunnel = 0;
  let momentum = 0;

  const leftBarrier = sim.barrier.position - sim.barrier.width / 2;
  const rightBarrier = sim.barrier.position + sim.barrier.width / 2;

  for (let i = 0; i < size; i++) {
    const re = sim.psiRe[i];
    const im = sim.psiIm[i];
    const prob = re * re + im * im;
    sim.probability[i] = prob;
    sim.phase[i] = Math.atan2(im, re);
    if (prob > maxProb) maxProb = prob;
    const x = sim.xGrid[i];
    meanX += prob * x;
    meanX2 += prob * x * x;
    if (sim.barrier.active && x > rightBarrier) tunnel += prob;
  }

  for (let i = 1; i < size - 1; i++) {
    const dRe = (sim.psiRe[i + 1] - sim.psiRe[i - 1]) / (2 * sim.dx);
    const dIm = (sim.psiIm[i + 1] - sim.psiIm[i - 1]) / (2 * sim.dx);
    const re = sim.psiRe[i];
    const im = sim.psiIm[i];
    momentum += re * dIm - im * dRe;
  }

  meanX *= sim.dx;
  meanX2 *= sim.dx;
  tunnel *= sim.dx;
  momentum *= sim.dx;

  // Momentum expectation via FFT
  if (Math.abs(momentum) > 1e-4) {
    sim.waveDirection = momentum >= 0 ? 1 : -1;
  }

  const variance = Math.max(1e-10, meanX2 - meanX * meanX);
  sim.expectation.position = meanX;
  sim.expectation.sigmaX = Math.sqrt(variance);
  sim.expectation.momentum = momentum;
  sim.expectation.tunnel = tunnel;
  sim.expectation.maxProb = maxProb;

  // Energy expectation: kinetic from dispersion + potential
  let energy = 0;
  let normK = 0;
  sim.scratchRe.set(sim.psiRe);
  sim.scratchIm.set(sim.psiIm);
  fftTransform(sim.scratchRe, sim.scratchIm, false);
  for (let i = 0; i < size; i++) {
    const re = sim.scratchRe[i];
    const im = sim.scratchIm[i];
    const probK = re * re + im * im;
    energy += sim.dispersion[i] * probK;
    normK += probK;
  }
  energy = normK > 1e-12 ? energy / normK : 0;
  let potentialEnergy = 0;
  for (let i = 0; i < size; i++) {
    potentialEnergy += sim.probability[i] * sim.potential[i];
  }
  potentialEnergy *= sim.dx;
  sim.expectation.energy = energy + potentialEnergy;

  if (sim.metrics.incidentFlux > 1e-9) {
    sim.expectation.transmission = clamp(sim.metrics.transmittedFlux / sim.metrics.incidentFlux, 0, 1);
    sim.expectation.reflection = clamp(sim.metrics.reflectedFlux / sim.metrics.incidentFlux, 0, 1);
  } else {
    sim.expectation.transmission = 0;
    sim.expectation.reflection = 0;
  }
}

function evolve(step) {
  applyPotentialHalfStep(step);
  applyKineticStep(step);
  applyPotentialHalfStep(step);
  applyAbsorbingBoundary(step);
  accumulateFlux(step);
  normalizeWavefunction();
  updateObservables();
}

function stepSimulation(deltaTime) {
  let remaining = deltaTime;
  const maxStep = sim.dt;
  while (remaining > 1e-7) {
    const step = Math.min(maxStep, remaining);
    evolve(step);
    remaining -= step;
  }
}

function applyParityTransform() {
  const size = sim.gridSize;
  const half = Math.floor(size / 2);
  for (let i = 0; i < half; i++) {
    const j = size - 1 - i;
    const re = sim.psiRe[i];
    const im = sim.psiIm[i];
    sim.psiRe[i] = sim.psiRe[j];
    sim.psiIm[i] = sim.psiIm[j];
    sim.psiRe[j] = re;
    sim.psiIm[j] = im;
  }
  sim.packet.velocity *= -1;
  sim.packet.center *= -1;
  normalizeWavefunction();
  updateObservables();
  resetFluxMetrics();
}

function setSimulationMode(modeKey) {
  if (!physicsModes[modeKey]) modeKey = 'schrodinger';
  if (sim.mode === modeKey) return;
  sim.mode = modeKey;
  sim.physics = physicsModes[modeKey];
  sim.dt = modeKey === 'dirac' ? 0.001 : 0.002;
  if (ui.elements['mode-select']) ui.elements['mode-select'].value = modeKey;
  ui.syncVelocitySliderRange();
  ui.updateModeLabel();
  updateModeCoefficients();
  rebuildWavePacket();
  if (ui.elements['velocity-slider']) {
    ui.elements['velocity-slider'].value = sim.packet.velocity.toString();
    ui.updateSliderValue('velocity', sim.packet.velocity, 3);
  }
  if (ui.elements['center-slider']) {
    ui.elements['center-slider'].value = sim.packet.center.toString();
    ui.updateSliderValue('center', sim.packet.center, 2);
  }
  renderWave();
  ui.updateInfo();
}

function resetSimulation() {
  sim.packet.center = -1.2;
  sim.packet.velocity = 0;
  sim.packet.sigma = 0.5;
  sim.barrier.active = false;
  sim.barrier.position = 0.5;
  sim.barrier.width = 0.2;
  sim.barrier.height = 0.8;
  sim.time = 0;
  sim.isEvolving = false;
  if (ui.elements['identity-evolve-btn']) {
    ui.elements['identity-evolve-btn'].textContent = '[ ▶ Evolve ] Time';
  }
  if (ui.elements['add-barrier-btn']) {
    ui.elements['add-barrier-btn'].textContent = '[ + ] Add Barrier';
  }
  initializeArrays();
  renderWave();
  ui.updateInfo();
}

function resizeCanvas() {
  if (!app.canvas) return;
  const rect = app.canvas.getBoundingClientRect();
  app.width = rect.width;
  app.height = rect.height;
  const dpr = app.dpr;
  app.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  app.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  if (app.ctx) app.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderWave();
}

function renderWave() {
  const ctx = app.ctx;
  if (!ctx || app.width === 0 || app.height === 0) return;
  const width = app.width;
  const height = app.height;

  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.7);
  gradient.addColorStop(0, '#060606');
  gradient.addColorStop(1, '#000000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const probBaseline = height * 0.65;
  const probAmp = height * 0.35;
  const phaseBaseline = height * 0.88;
  const phaseAmp = height * 0.08;

  drawPhaseField(ctx, width, height);
  drawBarrier(ctx, probBaseline, probAmp);
  drawWaveComponents(ctx, probBaseline, probAmp);
  drawProbability(ctx, probBaseline, probAmp);
  drawPhaseCurve(ctx, phaseBaseline, phaseAmp);
  drawAxis(ctx, probBaseline, width);
  drawLegend(ctx);
  drawVelocityIndicator(ctx, width, height);
  drawTunnellingIndicator(ctx, width, height);
  drawFlash(ctx, width, height);
}

function drawLegend(ctx) {
  ctx.save();
  ctx.translate(15, 15);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, 190, 105);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(0, 0, 190, 105);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('WAVE VISUALIZATION', 10, 18);
  ctx.font = '10px monospace';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(10, 36);
  ctx.lineTo(35, 36);
  ctx.stroke();
  ctx.fillText('|ψ|²', 45, 40);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, 51);
  ctx.lineTo(35, 51);
  ctx.stroke();
  ctx.fillText('Re(ψ)', 45, 55);
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, 66);
  ctx.lineTo(35, 66);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('Im(ψ)', 45, 70);
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, 81);
  ctx.lineTo(35, 81);
  ctx.stroke();
  ctx.fillText('arg(ψ)', 45, 85);
  ctx.restore();
}

function drawPhaseField(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  const bandWidth = width / sim.gridSize * 6;
  for (let i = 0; i < sim.gridSize; i += 6) {
    const x = (i / sim.gridSize) * width;
    const phase = sim.phase[i] || 0;
    const value = Math.floor(((phase + Math.PI) / TWO_PI) * 60 + 20);
    ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
    ctx.fillRect(x, 0, bandWidth, height);
  }
  ctx.restore();
}

function drawBarrier(ctx, baselineY, amplitude) {
  if (!sim.barrier.active) return;
  const leftNorm = (sim.barrier.position - sim.barrier.width / 2 - sim.xMin) / (sim.xMax - sim.xMin);
  const rightNorm = (sim.barrier.position + sim.barrier.width / 2 - sim.xMin) / (sim.xMax - sim.xMin);
  const left = leftNorm * app.width;
  const right = rightNorm * app.width;
  const top = baselineY - clamp(sim.barrier.height / 2, 0, 1) * amplitude;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(left, top, Math.max(2, right - left), baselineY - top);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, Math.max(2, right - left), baselineY - top);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('BARRIER', (left + right) / 2, top - 6);
  ctx.restore();
}

function drawWaveComponents(ctx, baselineY, amplitude) {
  const maxAmp = Math.sqrt(Math.max(sim.expectation.maxProb, 1e-6));
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < sim.gridSize; i++) {
    const x = (i / (sim.gridSize - 1)) * app.width;
    const y = baselineY - (sim.psiRe[i] / maxAmp) * amplitude * 0.6;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.setLineDash([3, 5]);
  for (let i = 0; i < sim.gridSize; i++) {
    const x = (i / (sim.gridSize - 1)) * app.width;
    const y = baselineY - (sim.psiIm[i] / maxAmp) * amplitude * 0.6;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

function drawProbability(ctx, baselineY, amplitude) {
  const maxProb = Math.max(sim.expectation.maxProb, 1e-6);
  ctx.save();
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < sim.gridSize; i++) {
    const x = (i / (sim.gridSize - 1)) * app.width;
    const y = baselineY - (sim.probability[i] / maxProb) * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();
}

function drawPhaseCurve(ctx, baselineY, amplitude) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < sim.gridSize; i++) {
    const x = (i / (sim.gridSize - 1)) * app.width;
    const y = baselineY + (sim.phase[i] / Math.PI) * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.restore();
}

function drawAxis(ctx, baselineY, width) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(0, baselineY);
  ctx.lineTo(width, baselineY);
  ctx.stroke();
  ctx.restore();
}

function drawVelocityIndicator(ctx, width, height) {
  const velocity = sim.packet.velocity;
  if (Math.abs(velocity) < 0.01) return;
  const centerX = width - 110;
  const centerY = 110;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(centerX - 70, centerY - 40, 140, 80);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(centerX - 70, centerY - 40, 140, 80);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WAVE MOTION', centerX, centerY - 20);
  const direction = velocity > 0 ? 1 : -1;
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX - 30 * direction, centerY);
  ctx.lineTo(centerX + 30 * direction, centerY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerX + 30 * direction, centerY);
  ctx.lineTo(centerX + 20 * direction, centerY - 8);
  ctx.lineTo(centerX + 20 * direction, centerY + 8);
  ctx.closePath();
  ctx.fillStyle = '#0f0';
  ctx.fill();
  ctx.font = '9px monospace';
  ctx.fillStyle = '#aaa';
  if (sim.mode === 'dirac') {
    ctx.fillText(`β = ${velocity.toFixed(3)}`, centerX, centerY + 18);
  } else {
    ctx.fillText(`v = ${velocity.toFixed(3)}c`, centerX, centerY + 18);
  }
  ctx.restore();
}

function drawTunnellingIndicator(ctx, width, height) {
  if (!sim.barrier.active || sim.metrics.incidentFlux <= 1e-6) return;
  ctx.save();
  ctx.fillStyle = '#ccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`T = ${(sim.expectation.transmission * 100).toFixed(1)}%`, width - 15, height - 50);
  ctx.fillText(`R = ${(sim.expectation.reflection * 100).toFixed(1)}%`, width - 15, height - 34);
  ctx.restore();
}

function drawFlash(ctx, width, height) {
  if (sim.flashIntensity <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${sim.flashIntensity * 0.25})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function flash() {
  sim.flashIntensity = 1;
}

function handleInteraction(id) {
  ui.updateConcept(id);
  flash();
}

function loop(timestamp) {
  RAF(loop);
  const deltaMs = timestamp - app.lastTimestamp;
  app.lastTimestamp = timestamp;
  const deltaTime = clamp(deltaMs / 1000, 0, 0.05) * sim.timeScale;
  if (sim.isEvolving) {
    stepSimulation(deltaTime);
    sim.time += deltaTime;
  }
  sim.flashIntensity = Math.max(0, sim.flashIntensity - deltaTime * 2.5);
  renderWave();
  ui.updateInfo();
}

function bootstrap() {
  app.canvas = document.getElementById('gl-canvas');
  if (!app.canvas) return;
  app.ctx = app.canvas.getContext('2d', { alpha: false, desynchronized: true });
  ui.init();
  initializeArrays();
  resizeCanvas();
  renderWave();
  ui.updateInfo();
  app.lastTimestamp = performance.now();
  RAF(loop);
}

document.addEventListener('DOMContentLoaded', bootstrap);
window.addEventListener('resize', resizeCanvas);
