const canvas = document.getElementById('field');
const overlayCanvas = document.getElementById('field-overlay');
const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true });
const ctx = overlayCanvas.getContext('2d');

if (!gl) {
  throw new Error('WebGL not available');
}

const statusEl = document.getElementById('status');
const modeWorkLevelEl = document.getElementById('mode-level-work');
const modePlayLevelEl = document.getElementById('mode-level-play');
const modeMuseLevelEl = document.getElementById('mode-level-muse');
const detailEl = document.getElementById('detail');
const detailTitleEl = document.getElementById('detailTitle');
const detailCopyEl = document.getElementById('detailCopy');
const detailUrlEl = document.getElementById('detailUrl');
const detailLinkEl = document.getElementById('detailLink');

const alphaModeButtons = Array.from(document.querySelectorAll('[data-alpha-mode]'));
const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));
const jitterBtn = document.getElementById('jitter');
const resetBtn = document.getElementById('detailReset');
const mainResetBtn = document.getElementById('reset-energy');

const isMobilePortraitViewport =
  window.matchMedia('(pointer: coarse)').matches && window.innerHeight > window.innerWidth;
const defaultPitch = (isMobilePortraitViewport ? 3 : 2) * (Math.PI / 180);
const defaultCameraScale = isMobilePortraitViewport ? 0.12 : 0.16;

const anchorRadius = 6.75;
const anchorBaseAngle = -Math.PI / 2;
const anchorSpan = (Math.PI * 2) / 3;

const anchorPoints = {
  research: {
    x: anchorRadius * Math.cos(anchorBaseAngle),
    z: anchorRadius * Math.sin(anchorBaseAngle),
  },
  agents: {
    x: anchorRadius * Math.cos(anchorBaseAngle + anchorSpan),
    z: anchorRadius * Math.sin(anchorBaseAngle + anchorSpan),
  },
  infra: {
    x: anchorRadius * Math.cos(anchorBaseAngle + 2 * anchorSpan),
    z: anchorRadius * Math.sin(anchorBaseAngle + 2 * anchorSpan),
  },
};

const anchors = {
  research: {
    id: 'research',
    label: 'Research',
    url: 'https://research.d4da.com',
    copy: 'Research maps to systems design, language experiments, and core model exploration.',
    point: anchorPoints.research,
    depth: 1.8,
    spread: 1.62,
  },
  agents: {
    id: 'agents',
    label: 'Automation',
    url: 'https://replo.id',
    copy: 'Automation points to RSI tools, execution loops, and automation tooling where actions are modelable.',
    point: anchorPoints.agents,
    depth: 1.8,
    spread: 1.62,
  },
  infra: {
    id: 'infra',
    label: 'Structure',
    url: 'https://d4da.com',
    copy: 'Structure tracks the platform layer: libraries, infrastructure, and reusable primitives.',
    point: anchorPoints.infra,
    depth: 1.8,
    spread: 1.62,
  },
};

const modes = {
  work: { research: 1, infra: 1 },
  play: { agents: 1, infra: 1 },
  muse: { agents: 1, research: 1 },
};

const antiPatterns = {
  work: { label: 'VAPORWARE', point: { x: -1.03, z: 0.18 }, spread: 0.86, amp: 0.16 },
  play: { label: 'SHIMDRIFT', point: { x: 1.03, z: 0.18 }, spread: 0.86, amp: 0.16 },
  muse: { label: 'HALO DRIFT', point: { x: 0, z: -1.34 }, spread: 0.86, amp: 0.16 },
};

const antiPatternKeys = Object.keys(antiPatterns);
const holeCenters = Object.fromEntries(
  Object.keys(anchorPoints).map((name) => [name, { ...anchorPoints[name] }])
);

const terrainFeatures = [{ type: 'valley', point: { x: 0, z: 0 }, spread: 0.64, amp: 0.12 }];

const mesh = {
  spread: 0.62,
  settleDist: 0.09,
  settleSpeed: 0.03,
  baseModeBoost: 1,
  modeAttract: 0.04,
  lines: 128,
  horizonHalfRange: 28,
  horizonFade: 4.5,
  clipMode: true,
  clipMargin: 260,
  terrainScale: 0.58,
  anchorScale: 1.5,
  modeSpreadStep: 0.9,
  modeDepthGain: 0.9,
  modeSpreadMaxLevel: 3,
  antiPatternScale: 0.65,
  renderModeAware: false,
};

const modeBaseline = 1;

const terrain = {
  reliefScale: 6,
  centralAreaDepthMultiplier: 1.25,
  centralBlendWidth: 4.5,
  outsideNoise: {
    amp: 0.16,
    scale: 0.4,
    detailScale: 1.2,
    edgeStart: 2.8,
    edgeFade: 4.5,
  },
};

const idleCinematicConfig = {
  enabled: true,
  idleDelaySec: 0.0,
  blendInSec: 1.0,
  blendOutSec: 0.8,
  rotAmpRad: 4.0 * (Math.PI / 180),
  pitchAmpRad: 0.5 * (Math.PI / 180),
  scaleAmp: 0.02,
  rotFreq: 0.04,
  pitchFreq: 0.055,
  rotPhase: 0.0,
  pitchPhase: 0.33,
  scaleFreqA: 0.04,
};

const terrainPerturbationConfig = {
  enabled: true,
  amp: 0.16,
  spaceFreqA: 0.08,
  spaceFreqB: 0.1,
  timeFreqA: 0.12,
  timeFreqB: 0.17,
  boundaryFadeStart: 2.8,
  boundaryFadeWidth: 4.5,
  protectRadius: 2.4,
};

const dynamics = {
  damping: 1.55,
  speedScale: 1.95,
  forceScale: 5.2,
  modeLerp: 6.4,
  jitterMag: 0.58,
  jitterFade: 0.02,
  jitterPush: 0.7,
  maxSpeed: 2.05,
  normalSampleEps: 0.02,
  normalSmoothing: 12,
  renderSmoothing: 18,
};

const state = {
  x: 0,
  z: 0,
  vx: 0,
  vz: 0,
  rotation: 0.6,
  pitch: defaultPitch,
  isRotating: false,
  rotationPointerId: -1,
  rotationPointerX: 0,
  rotationPointerY: 0,
  mode: 'neutral',
  modeWeights: {},
  jitterTimer: 0,
  jitterDir: { x: 0, z: 0 },
  lastT: 0,
  phase: 'field',
  arrival: null,
  portalTarget: null,
  portalSettlePoint: null,
  portalTargetMetrics: null,
  portalFlight: null,
  portalRevealTimeout: null,
  marbleRenderX: NaN,
  marbleRenderY: NaN,
  marbleRenderDepth: NaN,
  marbleSlopeX: 0,
  marbleSlopeZ: 0,
  frameDt: 0.016,
  peakLevels: Object.fromEntries(antiPatternKeys.map((name) => [name, 0])),
  peakTargets: Object.fromEntries(antiPatternKeys.map((name) => [name, 0])),
  anchorSpreadTargets: Object.fromEntries(Object.keys(anchors).map((name) => [name, 1])),
  anchorSpreads: Object.fromEntries(Object.keys(anchors).map((name) => [name, 1])),
  modeVisualLevels: Object.fromEntries(Object.keys(modes).map((name) => [name, modeBaseline])),
  modeLevels: Object.fromEntries(Object.keys(modes).map((name) => [name, modeBaseline])),
};

const idleCinematic = {
  lastInputSec: performance.now() * 0.001,
  active: true,
  blend: 1,
  elapsed: performance.now() * 0.001,
  baseRotation: state.rotation,
  basePitch: state.pitch,
  baseCameraScale: defaultCameraScale,
};

const portalFlightConfig = {
  duration: 1.5,
  finalPitch: Math.PI / 2,
  finalCameraScale: 0.5,
  finalSlopeScale: 26,
  revealDelayMs: 300,
};

let terrainPerturbationTimeSec = performance.now() * 0.001;

let dpr = window.devicePixelRatio || 1;
const worldProjection = {
  cameraScale: defaultCameraScale,
  xScale: 210,
  yScale: 210,
  ySlopeScale: 64,
  yOffset: 0.56,
  xOffset: 0,
};
const baseWorldProjection = { ...worldProjection };

const initialAlphaModeBtn =
  alphaModeButtons.find((btn) => btn.getAttribute('aria-pressed') === 'true') || alphaModeButtons[0];
const initialTileAlpha = initialAlphaModeBtn
  ? Number(initialAlphaModeBtn.dataset.alphaMode || '1.0')
  : 1.0;

const renderSettings = {
  tileAlpha: clamp(Number.isFinite(initialTileAlpha) ? initialTileAlpha : 1.0, 0, 1),
  lineAlpha: 0.6,
};

const meshShader = { program: null, loc: {} };
const marbleShader = { program: null, loc: {} };
const marbleShadowShader = { program: null, loc: {}, buffer: null, data: null };
const meshRender = {
  count: 0,
  min: 0,
  step: 0,
  heightMin: 0,
  heightMax: 1,
  vertices: null,
  heights: null,
  vertexBuffer: null,
  triIndexBuffer: null,
  lineIndexBuffer: null,
  triIndexCount: 0,
  lineIndexCount: 0,
};

function width() {
  return canvas.width / dpr;
}

function height() {
  return canvas.height / dpr;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function normalizeAngle(angle) {
  const full = Math.PI * 2;
  const shifted = angle % full;
  return shifted < 0 ? shifted + full : shifted;
}

function lerpAngle(from, to, t) {
  const delta = normalizeAngle(to - from);
  const shortest = delta > Math.PI ? delta - Math.PI * 2 : delta;
  return from + shortest * t;
}

function hashNoise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function noise2D(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = x - x0;
  const sz = y - y0;
  const sx2 = sx * sx * (3 - 2 * sx);
  const sz2 = sz * sz * (3 - 2 * sz);

  const nx0 = hashNoise(x0, y0) + (hashNoise(x1, y0) - hashNoise(x0, y0)) * sx2;
  const nx1 = hashNoise(x0, y1) + (hashNoise(x1, y1) - hashNoise(x0, y1)) * sx2;
  return nx0 + (nx1 - nx0) * sz2;
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
  }
  return shader;
}

function createProgram(vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  }
  return program;
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  overlayCanvas.style.width = `${innerWidth}px`;
  overlayCanvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function markUserInteraction(nowMs = performance.now()) {
  idleCinematic.lastInputSec = nowMs * 0.001;
  if (!idleCinematic.active && idleCinematic.blend <= 0.0001) return;
  idleCinematic.active = false;
  idleCinematic.blend = 0;
  idleCinematic.elapsed = 0;
  idleCinematic.baseRotation = state.rotation;
  idleCinematic.basePitch = state.pitch;
  idleCinematic.baseCameraScale = worldProjection.cameraScale;
}

function updateIdleCinematic(nowSec, dt) {
  if (!idleCinematicConfig.enabled) return;

  const canRun = state.phase === 'field' && !state.portalFlight && !state.isRotating;
  if (!canRun) {
    markUserInteraction(nowSec * 1000);
    return;
  }

  const idleFor = nowSec - idleCinematic.lastInputSec;
  const shouldRun = idleFor >= idleCinematicConfig.idleDelaySec;

  if (shouldRun && !idleCinematic.active) {
    idleCinematic.active = true;
    idleCinematic.elapsed = nowSec;
    idleCinematic.baseRotation = state.rotation;
    idleCinematic.basePitch = state.pitch;
    idleCinematic.baseCameraScale = worldProjection.cameraScale;
  }
  if (!shouldRun && idleCinematic.active) {
    idleCinematic.active = false;
  }

  if (shouldRun) {
    idleCinematic.blend = Math.min(1, idleCinematic.blend + dt / idleCinematicConfig.blendInSec);
    idleCinematic.elapsed += dt;
  } else {
    idleCinematic.blend = Math.max(0, idleCinematic.blend - dt / idleCinematicConfig.blendOutSec);
  }

  if (idleCinematic.blend <= 0.0001) return;

  const tau = Math.PI * 2;
  const t = idleCinematic.elapsed;
  const rotWave = Math.sin(tau * (idleCinematicConfig.rotFreq * t + idleCinematicConfig.rotPhase));
  const pitchWave = Math.sin(tau * (idleCinematicConfig.pitchFreq * t + idleCinematicConfig.pitchPhase));
  const scaleWave = Math.sin(tau * (idleCinematicConfig.scaleFreqA * t + 0.41));

  const activity = idleCinematic.blend * idleCinematic.blend * (3 - 2 * idleCinematic.blend);
  const rotOffset = idleCinematicConfig.rotAmpRad * activity * rotWave;
  const pitchOffset = idleCinematicConfig.pitchAmpRad * activity * pitchWave;
  const scaleOffset = idleCinematicConfig.scaleAmp * activity * scaleWave;

  const targetRotation = normalizeAngle(idleCinematic.baseRotation + rotOffset);
  const targetPitch = clamp(idleCinematic.basePitch + pitchOffset, -Math.PI / 4, Math.PI / 4);
  const targetScale = Math.max(0.06, idleCinematic.baseCameraScale * (1 + scaleOffset));
  const follow = clamp01(dt * 2.2);

  state.rotation = normalizeAngle(lerpAngle(state.rotation, targetRotation, follow));
  state.pitch = lerp(state.pitch, targetPitch, follow);
  worldProjection.cameraScale = lerp(worldProjection.cameraScale, targetScale, follow);
}

function modeOffset(level) {
  return (level ?? modeBaseline) - modeBaseline;
}

function applyModeButtons() {
  const max = mesh.modeSpreadMaxLevel;
  const min = -mesh.modeSpreadMaxLevel;
  modeButtons.forEach((button) => {
    const mode = button.dataset.mode;
    const step = Number(button.dataset.step || '1');
    const effective = modeOffset(state.modeLevels[mode] ?? modeBaseline);
    button.disabled = step > 0 ? effective >= max : effective <= min;
  });
}

function updateModeReadouts() {
  const levels = state.modeLevels || {};
  const w = modeOffset(levels.work);
  const p = modeOffset(levels.play);
  const m = modeOffset(levels.muse);
  modeWorkLevelEl.textContent = `Work: ${w > 0 ? '+' : ''}${w}`;
  modePlayLevelEl.textContent = `Play: ${p > 0 ? '+' : ''}${p}`;
  modeMuseLevelEl.textContent = `Muse: ${m > 0 ? '+' : ''}${m}`;
}

function refreshPeakTargets() {
  for (const key of antiPatternKeys) {
    const level = modeOffset(state.modeLevels[key] ?? modeBaseline);
    state.peakTargets[key] = level < 0 ? clamp01(Math.abs(level) / mesh.modeSpreadMaxLevel) : 0;
  }
}

function updateAnchorSpreadTargets() {
  Object.keys(state.anchorSpreadTargets).forEach((key) => {
    state.anchorSpreadTargets[key] = 1;
  });

  const levels = state.modeVisualLevels || {};
  for (const [mode, targets] of Object.entries(modes)) {
    if (!targets) continue;
    const level = modeOffset(levels[mode]);
    if (!level) continue;
    const boost = Math.abs(level) * mesh.modeSpreadStep;
    for (const anchorKey of Object.keys(targets)) {
      state.anchorSpreadTargets[anchorKey] += boost;
    }
  }
}

function updateAnchorSpreads(dt) {
  Object.keys(state.anchorSpreads).forEach((key) => {
    const current = state.anchorSpreads[key] || 1;
    const target = state.anchorSpreadTargets[key] || 1;
    const next = current + (target - current) * Math.min(1, dt * 2.4);
    state.anchorSpreads[key] = next;
  });
}

function modeComboWeights(sequence) {
  const combined = {};
  for (const [mode, level] of Object.entries(sequence)) {
    const effective = modeOffset(level);
    if (!effective) continue;
    const targets = modes[mode] || {};
    for (const [anchorKey, weight] of Object.entries(targets)) {
      if (!combined[anchorKey]) combined[anchorKey] = 0;
      combined[anchorKey] += weight * effective;
    }
  }
  return combined;
}

function updateModeDynamics(dt) {
  const rate = Math.max(0, dynamics.modeLerp);
  if (!rate) {
    state.modeWeights = modeComboWeights(state.modeLevels);
    updateAnchorSpreadTargets();
    return;
  }

  const blend = Math.min(1, dt * rate);
  Object.keys(state.modeVisualLevels).forEach((mode) => {
    const target = state.modeLevels[mode] ?? modeBaseline;
    const current = state.modeVisualLevels[mode] ?? modeBaseline;
    state.modeVisualLevels[mode] = current + (target - current) * blend;
    if (
      Math.abs(modeOffset(state.modeVisualLevels[mode])) < 1e-4 &&
      Math.abs(modeOffset(target)) < 1e-4
    ) {
      state.modeVisualLevels[mode] = modeBaseline;
    }
  });

  state.modeWeights = modeComboWeights(state.modeVisualLevels);
  updateAnchorSpreadTargets();
}

function describeModeCombo(sequence) {
  return Object.entries(sequence)
    .filter(([, value]) => modeOffset(value))
    .map(([mode, value]) => {
      const effective = modeOffset(value);
      return `${mode.toUpperCase()} ${effective > 0 ? `+${effective}` : effective}`;
    })
    .join(', ');
}

function describeModeState(levels) {
  const parts = ['work', 'play', 'muse']
    .map((mode) => {
      const value = modeOffset(levels[mode]);
      if (!value) return '';
      return `${mode}: ${value > 0 ? `+${value}` : value}`;
    })
    .filter(Boolean);

  return parts.length ? parts.join(' / ') : 'neutral';
}

function getDestinationModeKeys() {
  return Object.keys(state.modeWeights).filter((key) => (state.modeWeights[key] || 0) > 1e-6);
}

function hasActivePeaks() {
  return Object.values(state.peakLevels).some((value) => value > 0.01);
}

function getModeControlForce() {
  if (state.mode === 'neutral') return { fx: 0, fz: 0 };
  const active = getDestinationModeKeys();
  if (!active.length) return { fx: 0, fz: 0 };

  let fx = 0;
  let fz = 0;
  for (const key of active) {
    const anchor = anchors[key];
    if (!anchor) continue;
    const level = state.modeWeights[key] || 0;
    if (!level) continue;
    const sign = level < 0 ? -1 : 1;
    const dx = anchor.point.x - state.x;
    const dz = anchor.point.z - state.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) continue;
    const weight = (Math.abs(level) / (0.35 + dist)) * sign;
    fx += (dx / dist) * weight;
    fz += (dz / dist) * weight;
  }

  const mag = Math.hypot(fx, fz);
  if (mag < 1e-6) return { fx: 0, fz: 0 };
  return { fx: (fx / mag) * mesh.modeAttract, fz: (fz / mag) * mesh.modeAttract };
}

function setMode(nextMode, step = 1) {
  if (state.phase === 'portal') return false;
  markUserInteraction();

  const direction = step >= 0 ? 1 : -1;
  const currentOffset = modeOffset(state.modeLevels[nextMode] ?? modeBaseline);
  const nextOffset = clamp(
    currentOffset + direction,
    -mesh.modeSpreadMaxLevel,
    mesh.modeSpreadMaxLevel
  );

  if (nextOffset === currentOffset) return false;

  state.modeLevels[nextMode] = modeBaseline + nextOffset;
  state.modeWeights = modeComboWeights(state.modeLevels);
  refreshPeakTargets();
  state.arrival = null;

  const activeCount = Object.values(state.modeLevels).filter((value) => modeOffset(value)).length;
  const levelLabel = nextOffset > 0 ? `+${nextOffset}` : `${nextOffset}`;
  const nextModeName = `${nextMode.toUpperCase()} ${levelLabel}`;

  if (activeCount === 0) {
    state.mode = 'neutral';
    statusEl.textContent = 'Mode reset to neutral.';
  } else if (activeCount === 1) {
    state.mode = nextMode;
    statusEl.textContent = `${nextModeName} active. Mesh channels: ${describeModeCombo(
      state.modeLevels
    )}.`;
  } else {
    state.mode = 'combo';
    statusEl.textContent = `Energy mix: ${describeModeState(state.modeLevels)}.`;
  }

  applyModeButtons();
  updateModeReadouts();
  return true;
}

function cancelPortalReveal() {
  if (state.portalRevealTimeout) {
    clearTimeout(state.portalRevealTimeout);
    state.portalRevealTimeout = null;
  }
}

function updateAlphaModeButtons() {
  for (const button of alphaModeButtons) {
    const value = Number(button.dataset.alphaMode || '1.0');
    const isActive = Math.abs(value - renderSettings.tileAlpha) < 1e-6;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

function setTileAlphaMode(next) {
  markUserInteraction();
  const parsed = Number(next);
  renderSettings.tileAlpha = Number.isFinite(parsed) ? clamp(parsed, 0, 1) : 1;
  updateAlphaModeButtons();
}

function reset() {
  state.x = 0;
  state.z = 0;
  state.vx = 0;
  state.vz = 0;
  state.rotation = 0.6;
  state.pitch = defaultPitch;
  state.mode = 'neutral';
  state.modeWeights = {};
  state.jitterTimer = 0;
  state.arrival = null;
  state.phase = 'field';
  state.portalTarget = null;
  state.portalSettlePoint = null;
  state.portalTargetMetrics = null;
  state.portalFlight = null;
  state.marbleRenderX = NaN;
  state.marbleRenderY = NaN;
  state.marbleRenderDepth = NaN;
  state.marbleSlopeX = 0;
  state.marbleSlopeZ = 0;
  state.lastT = performance.now();
  state.peakLevels = Object.fromEntries(antiPatternKeys.map((name) => [name, 0]));
  state.peakTargets = Object.fromEntries(antiPatternKeys.map((name) => [name, 0]));
  state.anchorSpreadTargets = Object.fromEntries(Object.keys(anchors).map((name) => [name, 1]));
  state.anchorSpreads = Object.fromEntries(Object.keys(anchors).map((name) => [name, 1]));
  state.modeVisualLevels = Object.fromEntries(Object.keys(modes).map((name) => [name, modeBaseline]));
  state.modeLevels = Object.fromEntries(Object.keys(modes).map((name) => [name, modeBaseline]));

  cancelPortalReveal();
  worldProjection.cameraScale = baseWorldProjection.cameraScale;
  worldProjection.ySlopeScale = baseWorldProjection.ySlopeScale;
  worldProjection.xOffset = baseWorldProjection.xOffset;
  worldProjection.yOffset = baseWorldProjection.yOffset;

  detailEl.hidden = true;
  detailEl.classList.remove('visible');
  detailTitleEl.textContent = '';
  detailCopyEl.textContent = '';
  detailLinkEl.href = '#';
  detailLinkEl.textContent = 'Open destination';
  detailLinkEl.title = '';
  detailUrlEl.textContent = '';

  applyModeButtons();
  updateModeReadouts();

  statusEl.textContent =
    'Balance Work, Play, and Muse to shape the energy field and navigate the three destinations.';
  markUserInteraction(state.lastT);
}

function updatePeaks(dt) {
  for (const name of Object.keys(state.peakTargets)) {
    const target = state.peakTargets[name];
    const current = state.peakLevels[name] || 0;
    const next = current + (target - current) * dt * 3.5;
    state.peakLevels[name] = Math.min(1, next);
  }
}

function jitter() {
  markUserInteraction();
  const angle = Math.random() * Math.PI * 2;
  const mag = dynamics.jitterMag * (0.7 + Math.random() * 0.3);
  state.vx += Math.cos(angle) * mag;
  state.vz += Math.sin(angle) * mag;
  state.jitterTimer = 1;
  state.jitterDir = { x: Math.cos(angle), z: Math.sin(angle) };
  statusEl.textContent =
    state.mode === 'neutral'
      ? 'Jitter fired. The marble receives a random perturbation.'
      : `Jitter fired during ${state.mode.toUpperCase()}.`;
}

function triSign(px, pz, ax, az, bx, bz) {
  return (px - bx) * (az - bz) - (pz - bz) * (ax - bx);
}

function isInsideMainTriangle(x, z) {
  const a = anchorPoints.research;
  const b = anchorPoints.agents;
  const c = anchorPoints.infra;
  const s1 = triSign(x, z, a.x, a.z, b.x, b.z);
  const s2 = triSign(x, z, b.x, b.z, c.x, c.z);
  const s3 = triSign(x, z, c.x, c.z, a.x, a.z);
  const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
  const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
  return !(hasNeg && hasPos);
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const denom = vx * vx + vz * vz || 1;
  let t = (wx * vx + wz * vz) / denom;
  t = clamp01(t);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

function distanceToTriangleEdge(x, z) {
  const a = anchorPoints.research;
  const b = anchorPoints.agents;
  const c = anchorPoints.infra;
  return Math.min(
    distanceToSegment(x, z, a.x, a.z, b.x, b.z),
    distanceToSegment(x, z, b.x, b.z, c.x, c.z),
    distanceToSegment(x, z, c.x, c.z, a.x, a.z)
  );
}

function gaussian(cx, cz, x, z, spread = mesh.spread) {
  const dx = x - cx;
  const dz = z - cz;
  const spread2 = spread * spread;
  return Math.exp(-(dx * dx + dz * dz) / Math.max(2 * spread2, 1e-6));
}

function terrainPerturbationDelta(x, z) {
  if (!terrainPerturbationConfig.enabled) return 0;
  const radial = Math.hypot(x, z);
  const edge01 = clamp01(
    (radial - terrainPerturbationConfig.boundaryFadeStart) /
      terrainPerturbationConfig.boundaryFadeWidth
  );
  const edgeMask = edge01 * edge01 * (3 - 2 * edge01);
  const centerGuard = clamp01(1 - radial / terrainPerturbationConfig.protectRadius);
  let anchorGuard = 0;
  for (const point of Object.values(anchorPoints)) {
    const dist = Math.hypot(x - point.x, z - point.z);
    anchorGuard = Math.max(anchorGuard, clamp01(1 - dist / terrainPerturbationConfig.protectRadius));
  }
  const mask = edgeMask * (1 - Math.max(centerGuard, anchorGuard));
  if (mask <= 0.0001) return 0;

  const t = terrainPerturbationTimeSec;
  const tau = Math.PI * 2;
  const waveA = Math.sin(
    tau *
      (x * terrainPerturbationConfig.spaceFreqA +
        z * terrainPerturbationConfig.spaceFreqB +
        t * terrainPerturbationConfig.timeFreqA)
  );
  const waveB = Math.cos(
    tau *
      (x * terrainPerturbationConfig.spaceFreqB -
        z * terrainPerturbationConfig.spaceFreqA -
        t * terrainPerturbationConfig.timeFreqB)
  );
  return terrainPerturbationConfig.amp * mask * (0.72 * waveA + 0.28 * waveB);
}

function outsideTriangleNoise(x, z) {
  if (isInsideMainTriangle(x, z)) return 0;
  const edgeDist = distanceToTriangleEdge(x, z);
  const blend = clamp01((edgeDist - terrain.outsideNoise.edgeStart) / terrain.outsideNoise.edgeFade);
  if (!blend) return 0;

  const base = (noise2D(x * terrain.outsideNoise.scale, z * terrain.outsideNoise.scale) - 0.5) * 2;
  const detail =
    (noise2D(
      x * terrain.outsideNoise.scale * terrain.outsideNoise.detailScale,
      z * terrain.outsideNoise.scale * terrain.outsideNoise.detailScale
    ) -
      0.5) *
    2;
  const profile = base * 0.9 + detail * 0.1;
  return profile * terrain.outsideNoise.amp * blend;
}

function terrainBias(x, z) {
  let total = 0;
  for (const feature of terrainFeatures) {
    const sample = gaussian(feature.point.x, feature.point.z, x, z, feature.spread);
    total += feature.type === 'peak' ? sample * feature.amp : -sample * feature.amp;
  }
  total += outsideTriangleNoise(x, z);
  return total * terrain.reliefScale;
}

function fieldLandscapeCore(x, z, { modeAware = false, includePeaks = false } = {}) {
  const edgeDist = distanceToTriangleEdge(x, z);
  const centralBlend = clamp01(1 - edgeDist / terrain.centralBlendWidth);
  const centralMultiplier = 1 + (terrain.centralAreaDepthMultiplier - 1) * centralBlend;
  let h = terrainBias(x, z) * mesh.terrainScale * centralMultiplier;
  h += terrainPerturbationDelta(x, z);

  for (const [key, value] of Object.entries(anchors)) {
    const modeBoost = modeAware ? (state.modeWeights[key] || 0) * mesh.baseModeBoost : 0;
    let depthScale = 1 + modeBoost * mesh.modeDepthGain;
    if (modeBoost < -2) {
      const peakLerp = Math.min(1, (-modeBoost - 2) / 2);
      depthScale = -1.15 * peakLerp;
    } else {
      depthScale = Math.max(0, depthScale);
    }
    const totalDepth = value.depth * depthScale * mesh.anchorScale * centralMultiplier;
    const spread = value.spread * (state.anchorSpreads[key] || 1);
    h -= totalDepth * gaussian(value.point.x, value.point.z, x, z, spread);
  }

  if (includePeaks) {
    for (const [key, config] of Object.entries(antiPatterns)) {
      const level = state.peakLevels[key] || 0;
      if (!level) continue;
      h +=
        mesh.antiPatternScale *
        config.amp *
        level *
        gaussian(config.point.x, config.point.z, x, z, config.spread);
    }
  }
  return h;
}

function fieldHeightStatic(x, z) {
  return fieldLandscapeCore(x, z, { modeAware: true, includePeaks: hasActivePeaks() });
}

function staticHeightGradient(x, z, overrideEps) {
  const eps = overrideEps || 0.002;
  const right = fieldHeightStatic(x + eps, z);
  const left = fieldHeightStatic(x - eps, z);
  const up = fieldHeightStatic(x, z + eps);
  const down = fieldHeightStatic(x, z - eps);
  return {
    x: (right - left) / (2 * eps),
    z: (up - down) / (2 * eps),
  };
}

function horizonFade(x, z) {
  const dist = Math.hypot(x, z);
  const inner = Math.max(0, mesh.horizonHalfRange - mesh.horizonFade);
  if (dist <= inner) return 1;
  if (dist >= mesh.horizonHalfRange) return 0;
  return 1 - (dist - inner) / mesh.horizonFade;
}

function fieldGradient(x, z) {
  const slope = staticHeightGradient(x, z);
  let fx = -slope.x;
  let fz = -slope.z;

  const modeForce = getModeControlForce();
  fx += modeForce.fx;
  fz += modeForce.fz;

  if (state.jitterTimer > 0) {
    const fade = state.jitterTimer;
    fx += state.jitterDir.x * fade * dynamics.jitterPush;
    fz += state.jitterDir.z * fade * dynamics.jitterPush;
    state.jitterTimer = Math.max(0, state.jitterTimer - dynamics.jitterFade);
  }
  return { fx, fz };
}

function projectScreenTerms(x, z, h, rotation, pitch, cameraScale, slopeScale) {
  const cx = x * Math.cos(rotation) - z * Math.sin(rotation);
  const cy = x * Math.sin(rotation) + z * Math.cos(rotation);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cyTilted = cy * cp - h * sp;
  const hTilted = h * cp + cy * sp;

  const perspective = 1 / Math.max(1 + 0.06 * cyTilted + 0.05, 0.28);
  const xTerm = cx * worldProjection.xScale * cameraScale * perspective;
  const yTerm =
    -hTilted * worldProjection.yScale * cameraScale +
    (-cyTilted * slopeScale * cameraScale) * perspective;
  const depth = 0.5 + cyTilted * 0.012;
  return { x: xTerm, y: yTerm, scale: perspective, depth };
}

function toScreen(x, z, h) {
  const terms = projectScreenTerms(
    x,
    z,
    h,
    state.rotation,
    state.pitch,
    worldProjection.cameraScale,
    worldProjection.ySlopeScale
  );
  const sx = width() * 0.5 + worldProjection.xOffset + terms.x;
  const sy = height() * worldProjection.yOffset + terms.y;
  return { x: sx, y: sy, scale: terms.scale };
}

function startRotation(event) {
  if (state.phase === 'portal' || state.isRotating) return;
  if (event.cancelable) event.preventDefault();
  markUserInteraction();

  state.isRotating = true;
  state.rotationPointerId = event.pointerId;
  state.rotationPointerX = event.clientX;
  state.rotationPointerY = event.clientY;
  statusEl.textContent = 'Drag to rotate the mesh.';
  canvas.style.cursor = 'grabbing';

  if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
}

function updateRotation(event) {
  if (!state.isRotating || event.pointerId !== state.rotationPointerId) return;
  if (event.cancelable) event.preventDefault();

  const dx = event.clientX - state.rotationPointerX;
  const dy = event.clientY - state.rotationPointerY;
  state.rotationPointerX = event.clientX;
  state.rotationPointerY = event.clientY;

  state.rotation = normalizeAngle(state.rotation + -dx * 0.004);
  const nextPitch = state.pitch + dy * 0.004;
  state.pitch = clamp(nextPitch, -Math.PI / 4, Math.PI / 4);
}

function endRotation(event) {
  if (!state.isRotating || (event && event.pointerId !== state.rotationPointerId)) return;
  if (event && event.cancelable) event.preventDefault();

  state.isRotating = false;
  state.rotationPointerId = -1;
  canvas.style.cursor = 'grab';

  if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function nearestDestinationTarget(x, z) {
  const active = getDestinationModeKeys();
  if (!active.length) return null;

  let nearest = Infinity;
  let target = null;
  let targetKey = null;

  for (const key of active) {
    const anchor = anchors[key];
    if (!anchor) continue;
    const dist = Math.hypot(x - anchor.point.x, z - anchor.point.z);
    if (dist < nearest) {
      nearest = dist;
      target = anchor.point;
      targetKey = key;
    }
  }
  return { key: targetKey, point: target, dist: nearest };
}

function pickArrivalAnchor() {
  const active = getDestinationModeKeys();
  if (!active.length) return null;

  let winner = active[0];
  let winnerScore = -Infinity;
  const localForce = fieldGradient(state.x, state.z);

  for (const key of active) {
    const weight = Math.abs(state.modeWeights[key] || 0);
    const point = anchors[key].point;
    const dx = point.x - state.x;
    const dz = point.z - state.z;
    const dist = Math.hypot(dx, dz);
    const towardsForce = localForce.fx * dx + localForce.fz * dz;
    const score = -dist + 0.24 * weight + 0.45 * Math.tanh(towardsForce);
    if (score > winnerScore) {
      winner = key;
      winnerScore = score;
    }
  }
  return winner;
}

function beginPortalTravel(key, targetPoint) {
  const marker =
    targetPoint && Number.isFinite(targetPoint.x) && Number.isFinite(targetPoint.z)
      ? targetPoint
      : anchors[key]?.point || { x: state.x, z: state.z };

  state.vx = 0;
  state.vz = 0;

  const targetScale = portalFlightConfig.finalCameraScale;
  const targetSlopeScale = portalFlightConfig.finalSlopeScale;
  const targetPitch = portalFlightConfig.finalPitch;
  const targetRotation = normalizeAngle(Math.atan2(marker.x, marker.z));
  const targetHeight = fieldHeightStatic(marker.x, marker.z);

  const terms = projectScreenTerms(
    marker.x,
    marker.z,
    targetHeight,
    targetRotation,
    targetPitch,
    targetScale,
    targetSlopeScale
  );

  state.portalFlight = {
    targetX: marker.x,
    targetZ: marker.z,
    targetHeight,
    fromRotation: state.rotation,
    fromPitch: state.pitch,
    fromCameraScale: worldProjection.cameraScale,
    fromSlopeScale: worldProjection.ySlopeScale,
    fromXOffset: worldProjection.xOffset,
    fromYOffset: worldProjection.yOffset,
    finalRotation: targetRotation,
    finalXOffset: -terms.x,
    finalYOffset: clamp01(0.5 - terms.y / height()),
    elapsed: 0,
  };
}

function updatePortalFlight(dt) {
  const flight = state.portalFlight;
  if (!flight) return;

  flight.elapsed += dt;
  const t = clamp01(flight.elapsed / portalFlightConfig.duration);
  const travelEase = easeOutCubic(t);

  state.rotation = lerpAngle(flight.fromRotation, flight.finalRotation, travelEase);
  state.pitch = lerp(flight.fromPitch, portalFlightConfig.finalPitch, travelEase);
  worldProjection.cameraScale = lerp(
    flight.fromCameraScale,
    portalFlightConfig.finalCameraScale,
    travelEase
  );
  worldProjection.ySlopeScale = lerp(
    flight.fromSlopeScale,
    portalFlightConfig.finalSlopeScale,
    travelEase
  );
  worldProjection.xOffset = lerp(flight.fromXOffset, flight.finalXOffset, travelEase);
  worldProjection.yOffset = lerp(flight.fromYOffset, flight.finalYOffset, travelEase);

  if (t >= 1) {
    state.portalFlight = null;
    worldProjection.cameraScale = portalFlightConfig.finalCameraScale;
    worldProjection.ySlopeScale = portalFlightConfig.finalSlopeScale;
    worldProjection.xOffset = flight.finalXOffset;
    worldProjection.yOffset = flight.finalYOffset;
    state.rotation = flight.finalRotation;
    state.pitch = portalFlightConfig.finalPitch;

    cancelPortalReveal();
    state.portalRevealTimeout = setTimeout(() => {
      if (state.phase !== 'portal' || !state.arrival) return;
      const anchor = anchors[state.arrival];
      detailTitleEl.textContent = anchor.label;
      detailCopyEl.textContent = anchor.copy;
      detailLinkEl.href = anchor.url;
      detailLinkEl.textContent = 'Open destination';
      detailLinkEl.title = anchor.url;
      detailUrlEl.textContent = anchor.url;
      detailEl.hidden = false;
      requestAnimationFrame(() => {
        detailEl.classList.add('visible');
      });
    }, portalFlightConfig.revealDelayMs);
  }
}

function syncArrivalDetailPosition() {
  const marker = state.portalTarget || anchors[state.arrival]?.point || { x: state.x, z: state.z };
  const h = fieldHeightStatic(marker.x, marker.z);
  const p = toScreen(marker.x, marker.z, h);
  detailEl.style.left = `${p.x}px`;
  detailEl.style.top = `${p.y + 20}px`;
}

function engageArrival(key, point) {
  const fallbackPoint = anchors[key] ? anchors[key].point : null;
  const settled =
    point && Number.isFinite(point.x) && Number.isFinite(point.z)
      ? point
      : fallbackPoint || { x: state.x, z: state.z };

  const clamped = { x: settled.x, z: settled.z };
  const settledHeight = fieldHeightStatic(clamped.x, clamped.z);
  const settledSlope = staticHeightGradient(clamped.x, clamped.z, dynamics.normalSampleEps);
  const settledTerms = projectScreenTerms(
    clamped.x,
    clamped.z,
    settledHeight,
    state.rotation,
    state.pitch,
    worldProjection.cameraScale,
    worldProjection.ySlopeScale
  );
  const settledCameraScale = Math.max(
    0.12,
    worldProjection.cameraScale / baseWorldProjection.cameraScale
  );
  const settledRadius = 6.7 * settledTerms.scale * settledCameraScale * 3;
  const settledLiftedTerms = projectScreenTerms(
    clamped.x,
    clamped.z,
    settledHeight + 0.25,
    state.rotation,
    state.pitch,
    worldProjection.cameraScale,
    worldProjection.ySlopeScale
  );
  const settledDepth = clamp(2.0 * (settledLiftedTerms.depth - 0.0011) - 1.0, -1.0, 0.995);

  state.phase = 'portal';
  state.arrival = key;
  state.portalTarget = clamped;
  state.portalSettlePoint = { x: clamped.x, z: clamped.z, h: settledHeight };
  state.portalTargetMetrics = {
    h: settledHeight,
    slopeX: settledSlope.x,
    slopeZ: settledSlope.z,
    radius: settledRadius,
    depth: settledDepth,
  };

  state.x = clamped.x;
  state.z = clamped.z;
  state.vx = 0;
  state.vz = 0;
  state.marbleSlopeX = settledSlope.x;
  state.marbleSlopeZ = settledSlope.z;
  state.marbleRenderX = NaN;

  cancelPortalReveal();
  detailEl.classList.remove('visible');
  detailEl.hidden = true;

  beginPortalTravel(key, settled);
  syncArrivalDetailPosition();

  statusEl.textContent = `Arrival locked. Showing ${anchors[key].label}.`;
}

function maybeArrive() {
  if (state.mode === 'neutral' || state.phase !== 'field') return;
  const nearest = nearestDestinationTarget(state.x, state.z);
  if (!nearest) return;

  const selected = nearest.key || pickArrivalAnchor();
  const point = nearest.point;
  const closest = nearest.dist;
  const speed = Math.hypot(state.vx, state.vz);

  const arriveDist = mesh.settleDist * 2.0;
  const arriveSpeed = mesh.settleSpeed * 2.5;

  if (closest < arriveDist && speed < arriveSpeed) {
    engageArrival(selected, point);
  }
}

function stepPhysics(dt) {
  const force = fieldGradient(state.x, state.z);
  state.vx += force.fx * dt * dynamics.forceScale;
  state.vz += force.fz * dt * dynamics.forceScale;
  state.vx *= 1 - dt * dynamics.damping;
  state.vz *= 1 - dt * dynamics.damping;

  const speed = Math.hypot(state.vx, state.vz);
  if (speed > dynamics.maxSpeed) {
    const scale = dynamics.maxSpeed / speed;
    state.vx *= scale;
    state.vz *= scale;
  }

  state.x += state.vx * dt * dynamics.speedScale;
  state.z += state.vz * dt * dynamics.speedScale;
}
