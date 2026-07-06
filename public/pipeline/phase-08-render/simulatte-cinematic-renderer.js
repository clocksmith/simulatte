(function attachSimulatteCinematicRenderer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteCinematicRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCinematicRendererApi() {
  const SCENE_IDS = Object.freeze({
    'thermal-plume': 0,
    fire: 0,
    'weather-atmosphere': 1,
    watershed: 2,
    ocean: 2,
    'mechanical-fluid': 3,
    mechanical: 3,
    ferrofluid: 4,
    optics: 5,
    'optics-thermal': 5,
    acoustic: 6,
    biology: 7,
    ecology: 7,
    'restoration-water': 7,
    'chemistry-lab': 8,
    cryosphere: 9,
    'planetary-space': 10,
    'digital-network': 11,
    city: 11,
    'civic-market': 11,
    'venue-crowd': 11,
    'advanced-energy': 12,
    'molecular-biology': 13,
    'clinical-control': 14,
  });
  const RENDER_EXECUTION_INPUT_SCHEMA = 'simulatte.renderExecutionInput.v1';
  const PHASE7_OUTPUT_SCHEMA = 'simulatte.phase7.output.v1';

  const PALETTES = Object.freeze({
    thermal: ['#fff7ed', '#ff3d16', '#17100d', '#7dd3fc'],
    weather: ['#f8fafc', '#67e8f9', '#1e293b', '#a78bfa'],
    water: ['#f8fafc', '#0ea5e9', '#0f172a', '#22c55e'],
    machine: ['#f9fafb', '#94a3b8', '#0f172a', '#ef4444'],
    magnet: ['#f8fafc', '#111827', '#2563eb', '#db2777'],
    optics: ['#ffffff', '#60a5fa', '#ef4444', '#facc15'],
    acoustic: ['#f8fafc', '#38bdf8', '#334155', '#a78bfa'],
    bio: ['#f7fee7', '#22c55e', '#052e16', '#fde047'],
    chemistry: ['#ffffff', '#14b8a6', '#164e63', '#f97316'],
    ice: ['#ffffff', '#7dd3fc', '#1e3a8a', '#c084fc'],
    space: ['#ffffff', '#38bdf8', '#020617', '#f59e0b'],
    network: ['#ffffff', '#2563eb', '#0f172a', '#ef4444'],
    plasma: ['#ffffff', '#a855f7', '#020617', '#22d3ee'],
    molecular: ['#ffffff', '#a3e635', '#1e1b4b', '#fb7185'],
    clinical: ['#ffffff', '#ef4444', '#172554', '#22d3ee'],
  });

  const AFFORDANCE_FEATURES = Object.freeze([
    feature('lavaRainSteam', ['lava-rain', 'lava heats rain', 'droplet-fall', 'phase-flash', 'volcanic basin']),
    feature('rainCrustQuench', ['rain-cools', 'quenching lava', 'cooling-front', 'crust plates']),
    feature('steamPlume', ['steam-buoyancy', 'steam plume', 'thermal-rise', 'volumetric-steam']),
    feature('windSmokeShear', ['wind-advects', 'wind shearing', 'ash-shear', 'advected-tracers']),
    feature('erosionDelta', ['river-erodes', 'sediment fan', 'erosion-cuts', 'heightfield channel']),
    feature('turbineTorque', ['turbine-extracts', 'flow spinning turbine', 'torque rings', 'rotor-ghosts']),
    feature('ferrofluidSpikes', ['magnet-deflects-ferrofluid', 'ferrofluid', 'magnetic-spikes', 'spike-growth']),
    feature('laserMetalHeat', ['laser-heats-metal', 'laser heating metal', 'laser-line-scan', 'hotspot-sweep']),
    feature('lensCaustic', ['lens-refracts', 'lens refracting beam', 'caustic', 'ray-bundles']),
    feature('impactFracture', ['impact-fractures', 'fracture web', 'crack-propagation', 'shock-ring']),
    feature('speakerWave', ['speaker-drives', 'pressure wave', 'wavefront-expansion', 'standing-wave']),
    feature('algaeGrowth', ['nutrients-grow-algae', 'algae growth', 'growth-front', 'biofilm']),
    feature('gelDiffusion', ['chemical-diffuses', 'diffusion through gel', 'concentration-front', 'reaction-cloud']),
    feature('queueBacklog', ['arrivals-create-queue', 'queue backlog', 'queue-waves', 'bottleneck']),
    feature('orbitResonance', ['gravity-curves-orbit', 'orbital resonance', 'density-wave', 'orbit-trails']),
    feature('freezingFront', ['cooling-freezes', 'freezing front', 'ice-front', 'frost-dendrites']),
    feature('meltingFront', ['heating-melts', 'melting front', 'melt-drips', 'phase-boundary']),
    feature('feedbackValve', ['controller-adjusts', 'feedback-valve', 'valve-angle', 'feedback-arrows']),
    feature('combustionSmoke', ['combustion-heats-smoke', 'combustion smoke', 'thermal-rise-plumes', 'soot-vortex']),
    feature('rootSoil', ['root-network-stabilizes', 'roots stabilizing soil', 'root-growth', 'root-fiber']),
    feature('acidCorrosion', ['acid-rain-corrodes', 'acid rain corroding', 'corrosion-front', 'pitted-corrosion']),
    feature('batteryRunaway', ['battery-heat-runaway', 'battery runaway', 'runaway-front', 'vent-pulse']),
    feature('crystalGrowth', ['supersaturation-crystallizes', 'crystal growth', 'facet-growth', 'crystal-facets']),
    feature('proteinFold', ['hydrophobic-collapse', 'protein hydrophobic', 'fold-collapse', 'molecular-ribbon']),
    feature('neuronPulse', ['synapse-triggers', 'neuron pulse', 'action-potential', 'vesicle-release']),
    feature('bloodPressure', ['pressure-drives-blood', 'blood flow', 'pulse-wave', 'translucent-vessel']),
    feature('glacierCalving', ['warming-calves', 'glacier calving', 'calving-fall', 'ice cliff']),
    feature('tornadoVortex', ['wind-shear-forms-vortex', 'tornado', 'vortex-spin', 'volumetric-funnel']),
    feature('auroraCurtain', ['solar-wind-drives-aurora', 'aurora', 'emissive-curtains', 'magnetosphere']),
    feature('chipThermal', ['current-heats-chip', 'chip current', 'thermal-map', 'circuit-traces']),
    feature('queryShards', ['query-loads-index', 'query loading index', 'ranked-lines', 'query-pulses']),
    feature('supplyBullwhip', ['delay-amplifies-supply', 'supply chain', 'bullwhip', 'amplified-waves']),
    feature('crowdBottleneck', ['narrow-exit-jams', 'crowd bottleneck', 'density-pulse', 'stop-go-waves']),
    feature('bridgeResonance', ['wind-excites-bridge', 'bridge resonance', 'modal-oscillation', 'cable tension']),
    feature('oceanUpwelling', ['wind-drives-upwelling', 'ocean upwelling', 'ekman-spiral', 'nutrient plume']),
    feature('coralBleaching', ['heat-bleaches-coral', 'coral bleaching', 'bleach-front', 'polyp-fade']),
    feature('plasmaConfinement', ['magnetic-field-confines-plasma', 'plasma confinement', 'tokamak', 'field-twist']),
    feature('robotContact', ['robot-applies-contact-force', 'robot contact', 'force-cone', 'servo-arc']),
    feature('fabricWindLoad', ['wind-loads-fabric', 'wind loaded fabric', 'flutter-modes', 'tension-pulses']),
    feature('microfluidicSplit', ['pressure-splits-droplet', 'droplet split', 'meniscus-crawl', 'microfluidic']),
  ]);

  function feature(id, triggers) {
    return { id, triggers };
  }

  function create(anchorCanvas, options = {}) {
    if (!anchorCanvas || typeof document === 'undefined') return null;
    const host = anchorCanvas.parentElement || document.body;
    const canvas = document.createElement('canvas');
    canvas.className = 'simulatte-cinematic-renderer';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '4',
      opacity: '0',
      mixBlendMode: 'normal',
      transition: 'opacity 220ms ease',
    });
    const computedPosition = typeof getComputedStyle === 'function' ? getComputedStyle(host).position : '';
    if (!computedPosition || computedPosition === 'static') host.style.position = 'relative';
    host.appendChild(canvas);
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      canvas.remove();
      return null;
    }
    return new CinematicRenderer(gl, canvas, anchorCanvas, options);
  }

  class CinematicRenderer {
    constructor(gl, canvas, anchorCanvas, options = {}) {
      this.gl = gl;
      this.canvas = canvas;
      this.anchorCanvas = anchorCanvas;
      this.maxDpr = Number(options.maxDpr || 1.5);
      this.quality = 1;
      this.lastFrameMs = 16;
      this.sceneId = 3;
      this.sceneKind = 'mechanical';
      this.palette = paletteToVec4(PALETTES.machine);
      this.affordanceText = '';
      this.featuresPacked = new Float32Array(40);
      this.featureStrength = 0;
      this.metrics = { heat: 0.4, flow: 0.5, density: 0.5, bloom: 0.65, motion: 0.5 };
      this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      this.uniforms = uniformLocations(gl, this.program, [
        'uResolution', 'uTime', 'uScene', 'uPalette0', 'uPalette1', 'uPalette2', 'uPalette3',
        'uHeat', 'uFlow', 'uDensity', 'uBloom', 'uMotion', 'uQuality', 'uSeed', 'uFeatureStrength',
      ]);
      this.uniforms.uFeatures = gl.getUniformLocation(this.program, 'uFeatures[0]');
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    setRenderExecutionInput(renderExecutionInput) {
      const packet = sceneRenderPacketFromExecutionInput(renderExecutionInput);
      const visual = visualSignalsFromScenePacket(packet);
      this.renderExecutionInput = renderExecutionInput && renderExecutionInput.schema === 'simulatte.renderExecutionInput.v1'
        ? renderExecutionInput
        : null;
      this.sceneRenderPacket = packet || null;
      this.sceneKind = visual.sceneKind || 'mechanical';
      this.sceneId = SCENE_IDS[this.sceneKind] ?? 3;
      this.affordanceText = visual.text;
      this.featuresPacked = featureVectorForVisual(visual, this.affordanceText);
      this.featureStrength = featureStrength(this.featuresPacked);
      this.palette = paletteForScene(this.sceneKind, this.affordanceText);
      this.metrics = metricsForScenePacket(packet, this.affordanceText);
      this.canvas.style.opacity = packet ? '0.92' : '0';
    }

    setSpec(renderExecutionInput) {
      this.setRenderExecutionInput(renderExecutionInput);
    }

    render(renderExecutionInput, nowMs) {
      if (renderExecutionInput && renderExecutionInput !== this.renderExecutionInput) {
        this.setRenderExecutionInput(renderExecutionInput);
      }
      if (!this.renderExecutionInput || !this.sceneRenderPacket) {
        this.canvas.style.opacity = '0';
        return;
      }
      const state = this.renderExecutionInput.simulationState || {};
      const started = typeof performance !== 'undefined' ? performance.now() : nowMs;
      this.resize();
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uniforms.uTime, (nowMs || 0) * 0.001);
      gl.uniform1i(this.uniforms.uScene, this.sceneId);
      gl.uniform4fv(this.uniforms.uPalette0, this.palette[0]);
      gl.uniform4fv(this.uniforms.uPalette1, this.palette[1]);
      gl.uniform4fv(this.uniforms.uPalette2, this.palette[2]);
      gl.uniform4fv(this.uniforms.uPalette3, this.palette[3]);
      gl.uniform1f(this.uniforms.uHeat, dynamicMetric(this.metrics.heat, state, 'heat'));
      gl.uniform1f(this.uniforms.uFlow, dynamicMetric(this.metrics.flow, state, 'motion'));
      gl.uniform1f(this.uniforms.uDensity, dynamicMetric(this.metrics.density, state, 'matter'));
      gl.uniform1f(this.uniforms.uBloom, this.metrics.bloom);
      gl.uniform1f(this.uniforms.uMotion, this.metrics.motion);
      gl.uniform1f(this.uniforms.uQuality, this.quality);
      gl.uniform1f(this.uniforms.uSeed, seedForRenderExecutionInput(this.renderExecutionInput));
      gl.uniform1f(this.uniforms.uFeatureStrength, this.featureStrength);
      gl.uniform4fv(this.uniforms.uFeatures, this.featuresPacked);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      if (typeof performance !== 'undefined') {
        this.lastFrameMs = performance.now() - started;
        this.adaptQuality();
      }
    }

    resize() {
      const rect = this.anchorCanvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(this.maxDpr, window.devicePixelRatio || 1)) * this.quality;
      const width = Math.max(2, Math.floor(rect.width * dpr));
      const height = Math.max(2, Math.floor(rect.height * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
    }

    adaptQuality() {
      if (this.lastFrameMs > 22 && this.quality > 0.68) this.quality *= 0.96;
      else if (this.lastFrameMs < 12 && this.quality < 1) this.quality = Math.min(1, this.quality * 1.01 + 0.002);
    }
  }

  function sceneRenderPacketFromExecutionInput(renderExecutionInput) {
    if (!renderExecutionInput) return null;
    if (renderExecutionInput.schema === 'simulatte.sceneRenderPacket.v1') {
      throw new Error('Phase 8 expected simulatte.renderExecutionInput.v1, received bare simulatte.sceneRenderPacket.v1');
    }
    if (renderExecutionInput.schema !== RENDER_EXECUTION_INPUT_SCHEMA) {
      throw new Error(`Phase 8 expected ${RENDER_EXECUTION_INPUT_SCHEMA}, received ${renderExecutionInput.schema || typeof renderExecutionInput}`);
    }
    if (renderExecutionInput.inputSchema !== PHASE7_OUTPUT_SCHEMA) {
      throw new Error(`Phase 8 expected inputSchema ${PHASE7_OUTPUT_SCHEMA}, received ${renderExecutionInput.inputSchema || 'missing'}`);
    }
    const packet = renderExecutionInput && renderExecutionInput.sceneRenderPacket || null;
    if (!packet || packet.schema !== 'simulatte.sceneRenderPacket.v1') {
      throw new Error(`Phase 8 expected sceneRenderPacket simulatte.sceneRenderPacket.v1, received ${packet && packet.schema || 'missing'}`);
    }
    return packet;
  }

  function visualSignalsFromScenePacket(packet = null) {
    const rows = [
      ...(packet && packet.entities || []),
      ...(packet && packet.fields || []),
      ...(packet && packet.effects || []),
    ];
    const text = rows.map((row) => [
      row.id,
      row.label,
      row.layerSlot,
      row.packetKind,
      row.identity && row.identity.type,
      row.identity && row.identity.category,
      row.identity && row.identity.renderClass,
      row.geometry && row.geometry.kind,
      row.material && row.material.kind,
      row.animation && row.animation.kind,
    ].filter(Boolean).join(' ')).join(' ').toLowerCase();
    return {
      sceneKind: packet && packet.sceneKind || sceneKindFromScenePacketText(text),
      geometry: text,
      shaderHints: [],
      motionHints: rows.map((row) => row.animation && row.animation.kind).filter(Boolean),
      affordances: rows,
      text,
    };
  }

  function sceneKindFromScenePacketText(text = '') {
    if (/lava|fire|thermal|smoke|combust/.test(text)) return 'thermal-plume';
    if (/storm|tornado|wind|aurora/.test(text)) return 'weather-atmosphere';
    if (/river|ocean|water|sediment|glacier|coral|upwelling/.test(text)) return 'watershed';
    if (/magnet|ferrofluid/.test(text)) return 'ferrofluid';
    if (/lens|laser|optics|beam|glass/.test(text)) return 'optics';
    if (/sound|speaker|acoustic|wave/.test(text)) return 'acoustic';
    if (/bio|cell|algae|root|protein/.test(text)) return 'biology';
    if (/chem|acid|crystal|droplet|microfluidic/.test(text)) return 'chemistry-lab';
    if (/orbit|planet|moon|space|aurora/.test(text)) return 'planetary-space';
    if (/queue|network|chip|query|market|crowd/.test(text)) return 'digital-network';
    if (/plasma|tokamak|battery|fusion/.test(text)) return 'advanced-energy';
    if (/blood|neuron|synapse|clinical/.test(text)) return 'clinical-control';
    return 'mechanical';
  }

  function paletteForScene(sceneKind, text) {
    if (/lava|fire|thermal|smoke|melt/.test(`${sceneKind} ${text}`)) return paletteToVec4(PALETTES.thermal);
    if (/weather|storm|tornado|wind|aurora/.test(sceneKind)) return paletteToVec4(PALETTES.weather);
    if (/water|watershed|ocean|restoration/.test(sceneKind)) return paletteToVec4(PALETTES.water);
    if (/ferrofluid|magnet/.test(sceneKind)) return paletteToVec4(PALETTES.magnet);
    if (/optic/.test(sceneKind)) return paletteToVec4(PALETTES.optics);
    if (/acoustic/.test(sceneKind)) return paletteToVec4(PALETTES.acoustic);
    if (/biology|ecology|restoration/.test(sceneKind)) return paletteToVec4(PALETTES.bio);
    if (/chemistry/.test(sceneKind)) return paletteToVec4(PALETTES.chemistry);
    if (/cryo|ice|glacier/.test(sceneKind)) return paletteToVec4(PALETTES.ice);
    if (/space|planet/.test(sceneKind)) return paletteToVec4(PALETTES.space);
    if (/network|city|market|crowd/.test(sceneKind)) return paletteToVec4(PALETTES.network);
    if (/energy|plasma/.test(sceneKind)) return paletteToVec4(PALETTES.plasma);
    if (/molecular/.test(sceneKind)) return paletteToVec4(PALETTES.molecular);
    if (/clinical/.test(sceneKind)) return paletteToVec4(PALETTES.clinical);
    return paletteToVec4(PALETTES.machine);
  }

  function metricsForScenePacket(packet, text) {
    const uniforms = packet && packet.uniforms || {};
    const sceneMix = Array.isArray(uniforms.sceneMix) ? uniforms.sceneMix : [];
    const read = (index, fallback) => Number.isFinite(Number(sceneMix[index])) ? Number(sceneMix[index]) : fallback;
    return {
      heat: clamp01(read(0, /thermal|heat|lava|fire|battery|chip/.test(text) ? 0.82 : 0.38)),
      flow: clamp01(read(1, /flow|wind|water|plume|droplet|pressure/.test(text) ? 0.78 : 0.46)),
      density: clamp01(read(6, /crowd|bio|smoke|plume|particles|network/.test(text) ? 0.76 : 0.48)),
      bloom: clamp01(/emission|laser|plasma|aurora|thermal|glow/.test(text) ? 0.92 : 0.62),
      motion: clamp01(/pulse|spin|wave|vortex|flow|orbit|query|queue/.test(text) ? 0.84 : 0.52),
    };
  }

  function featureVectorForVisual(visual, text) {
    const source = [
      text,
      visual && visual.sceneKind,
      visual && visual.geometry,
      ...(visual && visual.shaderHints || []),
      ...(visual && visual.motionHints || []),
      ...((visual && visual.affordances || []).flatMap((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        ...(row.shaderHints || []),
        ...(row.motionHints || []),
      ])),
    ].filter(Boolean).join(' ').toLowerCase();
    const out = new Float32Array(40);
    AFFORDANCE_FEATURES.forEach((item, index) => {
      let score = 0;
      for (const trigger of item.triggers) {
        if (source.includes(String(trigger).toLowerCase())) score += 0.34;
      }
      out[index] = Math.max(0, Math.min(1, score));
    });
    return out;
  }

  function featureStrength(values) {
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) sum += values[index];
    return Math.max(0, Math.min(1, sum / 4));
  }

  function dynamicMetric(base, state, channel) {
    const summary = state && state.solverState && state.solverState.summary || {};
    const value = Number(summary[channel]);
    return clamp01(base * 0.82 + (Number.isFinite(value) ? value * 0.18 : 0));
  }

  function seedForRenderExecutionInput(renderExecutionInput) {
    const packet = renderExecutionInput && renderExecutionInput.sceneRenderPacket || {};
    const text = [
      renderExecutionInput && renderExecutionInput.runtimeReceiptId,
      packet.sceneKind,
      ...(packet.entities || []).map((row) => row.id),
      ...(packet.fields || []).map((row) => row.id),
      ...(packet.effects || []).map((row) => row.id),
    ].filter(Boolean).join(':');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 100000) / 100000;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`cinematic renderer link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return program;
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`cinematic renderer shader failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  function uniformLocations(gl, program, names) {
    return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
  }

  function paletteToVec4(colors) {
    return colors.map((hex) => {
      const rgb = parseHex(hex);
      return new Float32Array([rgb[0], rgb[1], rgb[2], 1]);
    });
  }

  function parseHex(hex) {
    const clean = String(hex || '#ffffff').replace('#', '');
    const value = Number.parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  const VERTEX_SHADER = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }`;

  const FRAGMENT_SHADER = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 outColor;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform int uScene;
  uniform vec4 uPalette0;
  uniform vec4 uPalette1;
  uniform vec4 uPalette2;
  uniform vec4 uPalette3;
  uniform float uHeat;
  uniform float uFlow;
  uniform float uDensity;
  uniform float uBloom;
  uniform float uMotion;
  uniform float uQuality;
  uniform float uSeed;
  uniform float uFeatureStrength;
  uniform vec4 uFeatures[10];

  mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
  }

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
    return n;
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += noise(p) * a;
      p = p * 2.03 + 0.13;
      a *= 0.5;
    }
    return v;
  }

  float sdSphere(vec3 p, float r) { return length(p) - r; }
  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }
  float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
  }
  float lineField(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return exp(-pow(length(pa - ba * h) / r, 2.0));
  }
  float shell(float d, float w) { return exp(-abs(d) / max(w, 0.0001)); }
  float featureAt(int i) {
    int bank = i / 4;
    int lane = i - bank * 4;
    vec4 row = vec4(0.0);
    if (bank == 0) row = uFeatures[0];
    else if (bank == 1) row = uFeatures[1];
    else if (bank == 2) row = uFeatures[2];
    else if (bank == 3) row = uFeatures[3];
    else if (bank == 4) row = uFeatures[4];
    else if (bank == 5) row = uFeatures[5];
    else if (bank == 6) row = uFeatures[6];
    else if (bank == 7) row = uFeatures[7];
    else if (bank == 8) row = uFeatures[8];
    else if (bank == 9) row = uFeatures[9];
    if (lane == 0) return row.x;
    if (lane == 1) return row.y;
    if (lane == 2) return row.z;
    return row.w;
  }

  struct Hit { float d; vec3 color; float glow; float alpha; };

  void applyAffordanceOverlays(vec3 p, inout Hit h) {
    float t = uTime * (0.32 + uMotion * 0.35) + uSeed * 9.0;
    float f0 = featureAt(0);
    if (f0 > 0.01) {
      float rain = 0.0;
      for (int i = 0; i < 7; i++) {
        vec2 c = vec2(-0.75 + float(i) * 0.25, fract(t * 0.35 + float(i) * 0.173) * 1.9 - 0.95);
        rain += shell(length(p.xz - c) - 0.012, 0.018);
      }
      float steam = exp(-length((p - vec3(-0.18, 0.18, 0.15)) * vec3(1.2, 0.42, 1.2)) * 2.2) * fbm(p * 4.0 + t);
      h.glow += f0 * (rain * 0.34 + steam * 0.58);
      h.color = mix(h.color, mix(uPalette1.rgb, uPalette0.rgb, steam), f0 * 0.22);
      h.alpha += f0 * steam * 0.16;
    }
    float f1 = featureAt(1);
    if (f1 > 0.01) {
      float crust = shell(p.y + 0.50 + sin(p.x * 8.0 + p.z * 4.0) * 0.018, 0.035);
      h.color = mix(h.color, vec3(0.025, 0.021, 0.018), f1 * crust * 0.52);
      h.glow += f1 * crust * uHeat * 0.18;
    }
    float f2 = max(max(featureAt(2), featureAt(3)), max(featureAt(18), featureAt(27)));
    if (f2 > 0.01) {
      float plume = exp(-length((p - vec3(0.28, 0.22, 0.0)) * vec3(1.6, 0.35, 1.0)) * 1.8) * fbm(p * 5.0 + vec3(t, t * 0.2, 0.0));
      h.color = mix(h.color, uPalette2.rgb * 0.8 + uPalette1.rgb * 0.2, f2 * plume * 0.24);
      h.glow += plume * f2 * 0.42;
      h.alpha += plume * f2 * 0.18;
    }
    float f3 = max(featureAt(4), max(featureAt(19), featureAt(34)));
    if (f3 > 0.01) {
      float cut = shell(abs(p.x + sin(p.z * 3.0) * 0.22) - 0.18, 0.035) * smoothstep(-0.65, 0.25, -p.y);
      h.color = mix(h.color, uPalette1.rgb, f3 * cut * 0.3);
      h.glow += f3 * cut * 0.2;
    }
    float f4 = max(featureAt(5), featureAt(37));
    if (f4 > 0.01) {
      vec3 q = p;
      q.xz *= rot(t * 2.1);
      float arc = shell(sdTorus(q, vec2(0.68, 0.018)), 0.06);
      h.glow += f4 * arc * 0.68;
      h.color = mix(h.color, uPalette3.rgb, f4 * arc * 0.34);
    }
    float f5 = featureAt(6);
    if (f5 > 0.01) {
      float field = 0.0;
      for (int i = 0; i < 5; i++) {
        float a = float(i) * 1.256 + t * 0.2;
        field += lineField(p, vec3(cos(a) * 0.75, -0.2, sin(a) * 0.75), vec3(cos(a + 1.2) * 0.22, 0.46, sin(a + 1.2) * 0.22), 0.026);
      }
      h.glow += f5 * field * 0.9;
      h.color = mix(h.color, mix(uPalette2.rgb, uPalette3.rgb, 0.5), f5 * field * 0.3);
    }
    float f6 = max(featureAt(7), featureAt(8));
    if (f6 > 0.01) {
      float beam = lineField(p, vec3(-1.1, 0.24, -0.18), vec3(1.1, -0.04, 0.24), 0.016);
      float caustic = lineField(p, vec3(-0.2, 0.0, -0.34), vec3(0.9, -0.18, 0.38), 0.025);
      h.glow += f6 * (beam * 1.7 + caustic * 1.0);
      h.color = mix(h.color, mix(uPalette1.rgb, uPalette3.rgb, caustic), f6 * (beam + caustic) * 0.4);
    }
    float f7 = max(featureAt(9), max(featureAt(26), featureAt(33)));
    if (f7 > 0.01) {
      float cracks = 0.0;
      for (int i = 0; i < 9; i++) {
        float a = float(i) * 0.698 + uSeed;
        cracks += lineField(p, vec3(0.0), vec3(cos(a), sin(a * 1.7) * 0.45, sin(a)) * 0.8, 0.015);
      }
      h.glow += f7 * cracks * 0.58;
      h.color = mix(h.color, uPalette0.rgb, f7 * cracks * 0.24);
    }
    float f8 = max(featureAt(10), featureAt(14));
    if (f8 > 0.01) {
      float rings = 0.0;
      for (int i = 0; i < 5; i++) rings += shell(length(p - vec3(-0.3, 0.0, 0.0)) - (0.2 + float(i) * 0.16 + fract(t * 0.2) * 0.12), 0.018);
      h.glow += f8 * rings * 0.7;
      h.color = mix(h.color, uPalette1.rgb, f8 * rings * 0.28);
    }
    float f9 = max(featureAt(11), max(featureAt(19), max(featureAt(23), max(featureAt(24), featureAt(35)))));
    if (f9 > 0.01) {
      float branching = 0.0;
      for (int i = 0; i < 11; i++) {
        float a = float(i) * 2.399;
        vec3 root = vec3(sin(a) * 0.5, -0.2 + sin(a * 1.3) * 0.18, cos(a) * 0.5);
        branching += lineField(p, root * 0.25, root, 0.025);
      }
      h.color = mix(h.color, uPalette1.rgb, f9 * branching * 0.3);
      h.glow += f9 * branching * 0.26;
    }
    float f10 = max(featureAt(12), max(featureAt(20), max(featureAt(21), featureAt(39))));
    if (f10 > 0.01) {
      float cloud = exp(-length(p * vec3(1.1, 0.8, 1.1)) * 2.1) * fbm(p * 6.0 + t);
      h.color = mix(h.color, uPalette3.rgb, f10 * cloud * 0.34);
      h.glow += f10 * cloud * 0.55;
      h.alpha += f10 * cloud * 0.16;
    }
    float f11 = max(featureAt(13), max(featureAt(29), max(featureAt(30), max(featureAt(31), featureAt(32)))));
    if (f11 > 0.01) {
      float grid = 0.0;
      for (int i = 0; i < 7; i++) {
        float x = -0.75 + float(i) * 0.25;
        grid += lineField(p, vec3(x, -0.45, -0.65), vec3(x + sin(t + float(i)) * 0.12, 0.45, 0.65), 0.018);
        grid += lineField(p, vec3(-0.8, -0.35 + float(i) * 0.12, 0.2), vec3(0.8, -0.28 + float(i) * 0.1, -0.2), 0.014);
      }
      h.glow += f11 * grid * 0.65;
      h.color = mix(h.color, uPalette1.rgb, f11 * grid * 0.32);
    }
    float f12 = max(featureAt(15), max(featureAt(16), featureAt(25)));
    if (f12 > 0.01) {
      float front = shell(p.y + 0.08 + sin(p.x * 6.0 + t) * 0.05, 0.04);
      h.color = mix(h.color, mix(uPalette0.rgb, uPalette1.rgb, featureAt(16)), f12 * front * 0.38);
      h.glow += f12 * front * 0.34;
    }
    float f13 = max(featureAt(17), max(featureAt(22), featureAt(28)));
    if (f13 > 0.01) {
      float cut = sdBox(p, vec3(0.72, 0.42, 0.34));
      float lines = fbm(p * 12.0 + t) * shell(cut, 0.06);
      h.glow += f13 * lines * 0.72;
      h.color = mix(h.color, mix(uPalette1.rgb, uPalette3.rgb, 0.5), f13 * lines * 0.28);
    }
    float f14 = max(featureAt(28), featureAt(36));
    if (f14 > 0.01) {
      float curtain = 0.0;
      for (int i = 0; i < 6; i++) {
        float x = -0.7 + float(i) * 0.28;
        curtain += lineField(p, vec3(x, -0.55, -0.2), vec3(x + sin(t + float(i)) * 0.18, 0.72, 0.2), 0.035);
      }
      h.glow += f14 * curtain * 1.0;
      h.color = mix(h.color, uPalette3.rgb, f14 * curtain * 0.4);
    }
    float f15 = max(featureAt(38), featureAt(39));
    if (f15 > 0.01) {
      float membrane = shell(sdBox(p - vec3(0.0, 0.0, 0.0), vec3(0.55, 0.03 + sin(p.x * 6.0 + t) * 0.02, 0.42)), 0.04);
      h.color = mix(h.color, uPalette1.rgb, f15 * membrane * 0.22);
      h.glow += f15 * membrane * 0.35;
    }
  }

  Hit sceneMap(vec3 p) {
    float t = uTime * (0.18 + uMotion * 0.42) + uSeed * 8.0;
    vec3 p0 = p;
    Hit h;
    h.d = 8.0;
    h.color = uPalette1.rgb;
    h.glow = 0.0;
    h.alpha = 0.0;

    if (uScene == 0) {
      float ground = p.y + 0.62 + fbm(vec3(p.xz * 1.6, 0.0)) * 0.1;
      float channel = abs(p.x + sin(p.z * 2.1 + t) * 0.18) - 0.24;
      float lava = max(ground, channel);
      float cone = max(length(p.xz - vec2(-0.75, 0.4)) - (1.0 - p.y) * 0.55, p.y - 0.55);
      float plume = exp(-length((p - vec3(-0.55, 0.1, 0.25)) * vec3(1.4, 0.35, 1.4)) * 2.0) * (0.55 + fbm(p * 2.2 + t) * 0.7);
      h.d = min(lava, cone);
      h.color = mix(uPalette2.rgb, uPalette1.rgb, shell(lava, 0.08) * uHeat);
      h.glow = shell(lava, 0.04) * (1.1 + uBloom) + plume * 0.45;
      h.alpha = 0.48 + plume * 0.38;
    } else if (uScene == 1) {
      p.xz *= rot(t * 0.32);
      float funnel = abs(length(p.xz) - (0.12 + (p.y + 0.55) * 0.28)) - 0.04;
      float cloud = sdSphere((p - vec3(0.0, 0.7, 0.0)) * vec3(1.0, 0.45, 1.0), 0.9);
      float streaks = fbm(p * 5.0 + vec3(0.0, t * 2.0, 0.0));
      h.d = min(funnel, cloud);
      h.color = mix(uPalette2.rgb, uPalette1.rgb, streaks);
      h.glow = shell(funnel, 0.05) * 0.9 + shell(cloud, 0.2) * 0.25;
      h.alpha = 0.35 + uDensity * 0.35;
    } else if (uScene == 2) {
      float terrain = p.y + 0.45 + fbm(vec3(p.xz * 2.4, 0.0)) * 0.18;
      float river = abs(p.x + sin(p.z * 2.7 + t) * 0.22) - 0.13 - uFlow * 0.08;
      float bank = max(terrain, river);
      h.d = min(bank, terrain + 0.08);
      h.color = mix(uPalette2.rgb, uPalette1.rgb, shell(river, 0.09));
      h.glow = shell(river, 0.05) * 0.55 + fbm(p * 8.0 + t) * 0.08;
      h.alpha = 0.52;
    } else if (uScene == 3) {
      vec3 q = p;
      q.xz *= rot(t * 1.4);
      float rotor = sdTorus(q, vec2(0.5, 0.035));
      float hub = sdSphere(q, 0.16);
      float blade = min(sdBox(q - vec3(0.34, 0, 0), vec3(0.33, 0.035, 0.055)), sdBox(q - vec3(0, 0, 0.34), vec3(0.055, 0.035, 0.33)));
      float flow = lineField(p, vec3(-1.2, -0.1, -0.55), vec3(1.2, 0.12, 0.55), 0.18 + uFlow * 0.08);
      h.d = min(min(rotor, hub), blade);
      h.color = mix(uPalette1.rgb, uPalette3.rgb, flow);
      h.glow = shell(rotor, 0.03) * 0.38 + flow * 0.48;
      h.alpha = 0.66;
    } else if (uScene == 4) {
      float pool = p.y + 0.42;
      float spikes = 10.0;
      for (int i = 0; i < 9; i++) {
        float a = float(i) * 6.28318 / 9.0 + t * 0.2;
        vec2 c = vec2(cos(a), sin(a)) * (0.16 + float(i % 3) * 0.12);
        float cone = max(length(p.xz - c) - (0.38 - p.y) * 0.16, p.y - 0.42 - sin(t + float(i)) * 0.04);
        spikes = min(spikes, cone);
      }
      float field = shell(sdTorus(p.xzy, vec2(0.58, 0.02)), 0.08);
      h.d = min(pool, spikes);
      h.color = mix(uPalette1.rgb, uPalette3.rgb, field);
      h.glow = field * 0.82 + shell(spikes, 0.04) * 0.35;
      h.alpha = 0.72;
    } else if (uScene == 5) {
      float lens = sdSphere((p - vec3(0.0, 0.0, 0.1)) * vec3(0.45, 1.0, 1.0), 0.34);
      float rays = 0.0;
      for (int i = -3; i <= 3; i++) {
        float y = float(i) * 0.095;
        rays += lineField(p, vec3(-1.4, y, -0.15), vec3(1.2, y * 0.22, 0.35), 0.012);
      }
      h.d = lens;
      h.color = mix(uPalette1.rgb, uPalette3.rgb, rays);
      h.glow = rays * 1.8 + shell(lens, 0.04) * 0.22;
      h.alpha = 0.58;
    } else if (uScene == 6) {
      float waves = 0.0;
      for (int i = 0; i < 6; i++) {
        float r = 0.18 + float(i) * 0.16 + fract(t * 0.25) * 0.12;
        waves += shell(length(p - vec3(-0.55, 0.0, 0.0)) - r, 0.018);
      }
      float cone = sdSphere((p - vec3(-0.78, 0.0, 0.0)) * vec3(1.0, 1.0, 0.55), 0.18);
      h.d = cone;
      h.color = mix(uPalette2.rgb, uPalette1.rgb, waves);
      h.glow = waves * 0.9;
      h.alpha = 0.5 + waves * 0.2;
    } else if (uScene == 7) {
      float colonies = 8.0;
      for (int i = 0; i < 10; i++) {
        vec2 c = vec2(sin(float(i) * 12.13), cos(float(i) * 7.91)) * 0.55;
        float r = 0.08 + 0.05 * sin(t + float(i));
        colonies = min(colonies, sdSphere(p - vec3(c.x, -0.08 + 0.04 * sin(float(i)), c.y), r));
      }
      float nutrient = fbm(p * 3.0 + t) * uDensity;
      h.d = colonies;
      h.color = mix(uPalette2.rgb, uPalette1.rgb, nutrient);
      h.glow = shell(colonies, 0.04) * 0.45 + nutrient * 0.25;
      h.alpha = 0.62;
    } else if (uScene == 8) {
      float vessel = abs(sdBox(p, vec3(0.75, 0.4, 0.36))) - 0.025;
      float cloud = exp(-length(p * vec3(1.3, 1.0, 1.3)) * 2.0) * fbm(p * 4.0 + t);
      h.d = vessel;
      h.color = mix(uPalette1.rgb, uPalette3.rgb, cloud);
      h.glow = cloud * 0.82 + shell(vessel, 0.04) * 0.2;
      h.alpha = 0.48 + cloud * 0.22;
    } else if (uScene == 9) {
      float ice = sdBox(p - vec3(-0.15, 0.0, 0.0), vec3(0.72, 0.36, 0.32));
      float cracks = fbm(p * 12.0) * shell(ice, 0.08);
      float water = p.y + 0.42 + sin(p.x * 6.0 + t) * 0.02;
      h.d = min(ice, water);
      h.color = mix(uPalette1.rgb, uPalette2.rgb, cracks);
      h.glow = cracks * 0.55 + shell(water, 0.04) * 0.22;
      h.alpha = 0.62;
    } else if (uScene == 10) {
      float planet = sdSphere(p - vec3(-0.25, 0.0, 0.0), 0.38);
      float rings = sdTorus((p - vec3(-0.25, 0.0, 0.0)).xzy, vec2(0.7, 0.018));
      float stars = pow(noise(normalize(p0 + vec3(uSeed)) * 80.0), 24.0);
      h.d = min(planet, rings);
      h.color = mix(uPalette2.rgb, uPalette1.rgb, shell(rings, 0.03) + stars);
      h.glow = shell(rings, 0.035) * 0.85 + stars * 1.4;
      h.alpha = 0.72;
    } else if (uScene == 11) {
      float net = 0.0;
      float nodes = 8.0;
      for (int i = 0; i < 11; i++) {
        vec3 c = vec3(sin(float(i) * 2.17), sin(float(i) * 5.31) * 0.45, cos(float(i) * 2.41)) * 0.62;
        nodes = min(nodes, sdSphere(p - c, 0.045 + 0.02 * sin(t + float(i))));
        net += lineField(p, c, vec3(c.z, -c.y, c.x), 0.018);
      }
      h.d = nodes;
      h.color = mix(uPalette2.rgb, uPalette1.rgb, net);
      h.glow = net * 0.75 + shell(nodes, 0.04) * 0.7;
      h.alpha = 0.64;
    } else if (uScene == 12) {
      float torus = sdTorus(p.xzy, vec2(0.52, 0.055 + 0.02 * sin(t)));
      float field = shell(sdTorus((p * vec3(1.0, 1.4, 1.0)).xzy, vec2(0.7, 0.018)), 0.08);
      h.d = torus;
      h.color = mix(uPalette3.rgb, uPalette1.rgb, field);
      h.glow = shell(torus, 0.08) * 1.1 + field * 0.8;
      h.alpha = 0.7;
    } else if (uScene == 13) {
      float chain = 8.0;
      vec3 prev = vec3(-0.72, 0.0, 0.0);
      for (int i = 0; i < 13; i++) {
        float f = float(i) / 12.0;
        vec3 c = vec3(mix(-0.72, 0.72, f), sin(f * 9.0 + t) * 0.18, cos(f * 8.0 + t) * 0.22);
        chain = min(chain, sdSphere(p - c, 0.045));
        chain = min(chain, 1.0 / max(0.0001, lineField(p, prev, c, 0.028)) * 0.001 - 0.012);
        prev = c;
      }
      h.d = chain;
      h.color = mix(uPalette1.rgb, uPalette3.rgb, fbm(p * 6.0));
      h.glow = shell(chain, 0.035) * 0.7;
      h.alpha = 0.66;
    } else {
      float vessel = sdTorus(p.xzy, vec2(0.48, 0.07));
      float pulse = shell(abs(length(p.xz) - fract(t * 0.55) * 0.8), 0.04);
      h.d = vessel;
      h.color = mix(uPalette2.rgb, uPalette1.rgb, pulse);
      h.glow = pulse * 0.9 + shell(vessel, 0.05) * 0.35;
      h.alpha = 0.64;
    }
    applyAffordanceOverlays(p0, h);
    h.glow += uFeatureStrength * 0.12;
    return h;
  }

  vec3 shade(vec3 ro, vec3 rd) {
    vec3 accum = vec3(0.0);
    float alpha = 0.0;
    float depthGlow = 0.0;
    float t = 0.0;
    int steps = int(mix(38.0, 64.0, uQuality));
    for (int i = 0; i < 72; i++) {
      if (i >= steps) break;
      vec3 p = ro + rd * t;
      Hit h = sceneMap(p);
      float fog = exp(-t * 0.22);
      float surface = shell(h.d, 0.045 + (1.0 - uQuality) * 0.04);
      float density = surface * h.alpha + h.glow * 0.08;
      vec3 lit = h.color * (0.42 + surface * 0.9) + h.glow * uPalette0.rgb * uBloom;
      accum += (1.0 - alpha) * lit * density * fog;
      alpha += (1.0 - alpha) * density * 0.34;
      depthGlow += h.glow * 0.015;
      t += clamp(h.d * 0.44 + 0.035, 0.025, 0.12);
      if (alpha > 0.96 || t > 5.2) break;
    }
    vec3 bg = mix(uPalette0.rgb, uPalette2.rgb, smoothstep(-0.4, 0.9, rd.y));
    bg += pow(max(0.0, dot(rd, normalize(vec3(-0.35, 0.55, 0.74)))), 12.0) * uPalette3.rgb * 0.32;
    vec3 color = mix(bg, accum + depthGlow * uPalette1.rgb, clamp(alpha, 0.0, 1.0));
    color += pow(max(color.r, max(color.g, color.b)), 3.0) * uBloom * 0.14;
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(0.82));
    return color;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / max(uResolution.x, uResolution.y);
    float time = uTime * 0.12 + uSeed * 6.28318;
    vec3 ro = vec3(sin(time) * 1.35, 0.34 + sin(time * 0.7) * 0.12, cos(time) * 1.85);
    vec3 ta = vec3(0.0, 0.02, 0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uu * uv.x + vv * uv.y + ww * 1.35);
    vec3 color = shade(ro, rd);
    float vignette = smoothstep(1.35, 0.22, length(uv));
    color *= 0.62 + vignette * 0.48;
    outColor = vec4(color, 0.88);
  }`;

  return { create, SCENE_IDS };
});
