(function attachSimulatteWebGpuRenderer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteWebGpuRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWebGpuRendererApi() {
  const SCENE_IDS = Object.freeze({
    'thermal-plume': 0,
    fire: 0,
    'weather-atmosphere': 1,
    watershed: 2,
    ocean: 2,
    'mechanical-fluid': 3,
    mechanical: 3,
    'structural-mechanics': 3,
    ferrofluid: 4,
    optics: 5,
    'optics-thermal': 5,
    acoustic: 6,
    biology: 7,
    ecology: 7,
    'restoration-water': 7,
    'agro-waste-loop': 20,
    'chemistry-lab': 8,
    cryosphere: 9,
    'ocean-cryosphere': 9,
    'planetary-space': 10,
    'digital-network': 11,
    city: 11,
    'civic-market': 11,
    'venue-crowd': 11,
    'advanced-energy': 12,
    'grid-energy': 16,
    'molecular-biology': 13,
    'clinical-control': 14,
    'particle-instrument': 15,
    'quantum-instrument': 19,
    'robotics-control': 17,
    'manufacturing-line': 18,
    'sport-motion': 21,
    'cultural-material': 22,
    'hazard-atmosphere': 1,
    'space-instrument': 15,
  });

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
    instrument: ['#ffffff', '#22d3ee', '#111827', '#f59e0b'],
    grid: ['#f8fafc', '#facc15', '#111827', '#ef4444'],
    robot: ['#f9fafb', '#38bdf8', '#1f2937', '#f97316'],
    factory: ['#fff7ed', '#94a3b8', '#1e293b', '#fb7185'],
    quantum: ['#f8fafc', '#a78bfa', '#020617', '#22d3ee'],
    agro: ['#f7fee7', '#84cc16', '#14532d', '#f97316'],
    sport: ['#f8fafc', '#60a5fa', '#111827', '#f59e0b'],
    cultural: ['#fffbeb', '#d97706', '#1f2937', '#14b8a6'],
  });

  const FEATURE_TRIGGERS = Object.freeze([
    ['lava-rain', 'phase-flash', 'volcanic basin'],
    ['rain-cools', 'cooling-front', 'crust plates'],
    ['steam-buoyancy', 'thermal-rise', 'volumetric-steam'],
    ['wind-advects', 'ash-shear', 'advected-tracers'],
    ['river-erodes', 'sediment fan', 'erosion-cuts'],
    ['turbine-extracts', 'torque rings', 'rotor-ghosts'],
    ['magnet-deflects-ferrofluid', 'magnetic-spikes', 'spike-growth'],
    ['laser-heats-metal', 'laser-line-scan', 'hotspot-sweep'],
    ['lens-refracts', 'caustic', 'ray-bundles'],
    ['impact-fractures', 'crack-propagation', 'shock-ring'],
    ['speaker-drives', 'wavefront-expansion', 'standing-wave'],
    ['nutrients-grow-algae', 'growth-front', 'biofilm'],
    ['chemical-diffuses', 'concentration-front', 'reaction-cloud'],
    ['arrivals-create-queue', 'queue-waves', 'bottleneck'],
    ['gravity-curves-orbit', 'density-wave', 'orbit-trails'],
    ['cooling-freezes', 'ice-front', 'frost-dendrites'],
    ['heating-melts', 'melt-drips', 'phase-boundary'],
    ['controller-adjusts', 'feedback-arrows', 'valve-angle'],
    ['combustion-heats-smoke', 'soot-vortex', 'thermal-rise-plumes'],
    ['root-network-stabilizes', 'root-growth', 'root-fiber'],
    ['acid-rain-corrodes', 'corrosion-front', 'pitted-corrosion'],
    ['battery-heat-runaway', 'runaway-front', 'vent-pulse'],
    ['supersaturation-crystallizes', 'facet-growth', 'crystal-facets'],
    ['hydrophobic-collapse', 'fold-collapse', 'molecular-ribbon'],
    ['synapse-triggers', 'action-potential', 'vesicle-release'],
    ['pressure-drives-blood', 'pulse-wave', 'translucent-vessel'],
    ['warming-calves', 'calving-fall', 'ice cliff'],
    ['wind-shear-forms-vortex', 'vortex-spin', 'volumetric-funnel'],
    ['solar-wind-drives-aurora', 'emissive-curtains', 'magnetosphere'],
    ['current-heats-chip', 'thermal-map', 'circuit-traces'],
    ['data-center-cooling-feedback', 'blue-airflow-ribbons', 'rack-led-grid'],
    ['query-loads-index', 'ranked-lines', 'query-pulses'],
    ['delay-amplifies-supply', 'bullwhip', 'amplified-waves'],
    ['narrow-exit-jams', 'density-pulse', 'stop-go-waves'],
    ['wind-excites-bridge', 'modal-oscillation', 'cable tension'],
    ['wind-drives-upwelling', 'ekman-spiral', 'nutrient plume'],
    ['heat-bleaches-coral', 'bleach-front', 'polyp-fade'],
    ['magnetic-field-confines-plasma', 'tokamak', 'field-twist'],
    ['robot-applies-contact-force', 'force-cone', 'servo-arc'],
    ['wind-loads-fabric', 'flutter-modes', 'tension-pulses'],
    ['inverter-stabilizes-grid', 'transformer-overload', 'frequency-control'],
    ['robot-sorts-parcels', 'warehouse-robot', 'pick-and-place'],
    ['mold-cools-plastic', 'injection-molding', 'steel-tooling'],
    ['qubit-resonator-readout', 'microwave-resonator', 'phase-readout'],
    ['compost-feeds-greenhouse', 'nutrient-loop', 'oxygen-water-loop'],
  ]);

  function create(canvas, options = {}) {
    if (!canvas || typeof navigator === 'undefined' || !navigator.gpu) return null;
    const context = canvas.getContext('webgpu');
    if (!context) return null;
    return new WebGpuRenderer(canvas, context, options);
  }

  class WebGpuRenderer {
    constructor(canvas, context, options = {}) {
      this.canvas = canvas;
      this.context = context;
      this.canvas.dataset.renderer = 'webgpu-required';
      this.maxDpr = Number(options.maxDpr || 1.5);
      this.quality = 1;
      this.ready = false;
      this.status = 'initializing WebGPU renderer';
      this.sceneKind = 'mechanical';
      this.sceneId = 3;
      this.loading = { active: false, progress: 0, stage: 'idle' };
      this.uniforms = new Float32Array(72);
      this.features = new Float32Array(40);
      this.palette = paletteToVec4(PALETTES.machine);
      this.metrics = { heat: 0.35, flow: 0.45, density: 0.48, bloom: 0.56, motion: 0.42 };
      this.seed = 1;
      this.lastSizeKey = '';
      this.lastFrameMs = 16;
      this.renderCount = 0;
      this.errorLog = [];
      this.initPromise = this.init();
    }

    async init() {
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error('WebGPU adapter unavailable');
        this.device = await adapter.requestDevice();
        this.device.addEventListener('uncapturederror', (event) => {
          const message = event && event.error && event.error.message
            ? event.error.message
            : 'uncaptured WebGPU error';
          this.status = message;
          this.errorLog.push(message);
          this.canvas.dataset.rendererStatus = this.errorLog.slice(-4).join(' | ');
        });
        this.device.pushErrorScope('validation');
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
          device: this.device,
          format: this.format,
          alphaMode: 'opaque',
        });
        this.uniformBuffer = this.device.createBuffer({
          size: this.uniforms.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.bindGroupLayout = this.device.createBindGroupLayout({
          entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
        });
        const shader = this.device.createShaderModule({ code: WEBGPU_SHADER });
        this.pipeline = this.device.createRenderPipeline({
          layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
          vertex: { module: shader, entryPoint: 'vs' },
          fragment: { module: shader, entryPoint: 'fs', targets: [{ format: this.format }] },
          primitive: { topology: 'triangle-list' },
        });
        this.bindGroup = this.device.createBindGroup({
          layout: this.bindGroupLayout,
          entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
        });
        const pipelineError = await this.device.popErrorScope();
        if (pipelineError) throw new Error(pipelineError.message || 'WebGPU pipeline validation failed');
        this.device.lost.then((info) => {
          this.ready = false;
          this.status = `WebGPU device lost: ${info && info.message ? info.message : 'unknown'}`;
          this.canvas.dataset.rendererStatus = this.status;
        });
        this.ready = true;
        this.status = 'WebGPU renderer ready';
        this.canvas.dataset.renderer = 'webgpu';
        this.canvas.dataset.rendererStatus = this.status;
      } catch (err) {
        this.ready = false;
        this.status = err && err.message ? err.message : 'WebGPU renderer failed';
        this.canvas.dataset.renderer = 'webgpu-unavailable';
        this.canvas.dataset.rendererStatus = this.status;
      }
    }

    isReady() {
      return this.ready;
    }

    setLoading(active, percent, stage) {
      this.loading = {
        active: Boolean(active),
        progress: clamp(Number(percent || 0) / 100, 0, 1),
        stage: String(stage || 'loading'),
      };
    }

    setSpec(spec) {
      this.sceneKind = sceneKindFromSpec(spec);
      this.sceneId = SCENE_IDS[this.sceneKind] ?? 3;
      this.canvas.dataset.sceneKind = this.sceneKind;
      this.canvas.dataset.sceneId = String(this.sceneId);
      const text = visualTextFromSpec(spec);
      this.features = mergeFeatureVectors(featureVector(text), graphicsAtomFeatureVector(spec));
      this.palette = paletteForScene(this.sceneKind, text);
      this.metrics = metricsForSpec(spec, text);
      this.seed = seedForSpec(spec);
    }

    render(state, spec, nowMs) {
      if (!this.ready || !this.device || !this.pipeline) return false;
      const started = typeof performance !== 'undefined' ? performance.now() : nowMs;
      this.resize();
      this.writeUniforms(state, spec, nowMs || 0);
      this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniforms);
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.98, g: 0.98, b: 1, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      if (typeof performance !== 'undefined') {
        this.lastFrameMs = performance.now() - started;
        this.adaptQuality();
      }
      this.renderCount += 1;
      this.canvas.dataset.renderCount = String(this.renderCount);
      this.canvas.dataset.lastFrameMs = String(Number(this.lastFrameMs || 0).toFixed(3));
      return true;
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(this.maxDpr, window.devicePixelRatio || 1)) * this.quality;
      const width = Math.max(2, Math.floor(rect.width * dpr));
      const height = Math.max(2, Math.floor(rect.height * dpr));
      const key = `${width}x${height}`;
      if (key === this.lastSizeKey) return;
      this.canvas.width = width;
      this.canvas.height = height;
      this.lastSizeKey = key;
    }

    writeUniforms(state, spec, nowMs) {
      const u = this.uniforms;
      u[0] = this.canvas.width;
      u[1] = this.canvas.height;
      u[2] = nowMs * 0.001;
      u[3] = this.sceneId;
      u[4] = dynamicMetric(this.metrics.heat, state, 'heat');
      u[5] = dynamicMetric(this.metrics.flow, state, 'motion');
      u[6] = dynamicMetric(this.metrics.density, state, 'matter');
      u[7] = this.metrics.bloom;
      u[8] = this.metrics.motion;
      u[9] = this.quality;
      u[10] = this.seed;
      u[11] = this.seed;
      u[12] = this.loading.active ? 1 : 0;
      u[13] = this.loading.progress;
      u[14] = spec && spec.templateId === 'blank-world' ? 1 : 0;
      u[15] = featureStrength(this.features);
      let offset = 16;
      for (const color of this.palette) {
        u.set(color, offset);
        offset += 4;
      }
      for (let i = 0; i < 40; i += 1) {
        u[offset + i] = this.features[i] || 0;
      }
    }

    adaptQuality() {
      if (this.lastFrameMs > 18 && this.quality > 0.62) this.quality *= 0.965;
      else if (this.lastFrameMs < 10 && this.quality < 1) this.quality = Math.min(1, this.quality * 1.01 + 0.002);
    }
  }

  function sceneKindFromSpec(spec) {
    return spec && spec.renderProgram && spec.renderProgram.visualIR && spec.renderProgram.visualIR.sceneKind ||
      spec && spec.renderProgram && spec.renderProgram.rendererPlan && spec.renderProgram.rendererPlan.sceneKind ||
      'mechanical';
  }

  function visualTextFromSpec(spec) {
    const renderProgram = spec && spec.renderProgram || {};
    const visualIR = renderProgram.visualIR || {};
    const rendererPlan = renderProgram.rendererPlan || {};
    const visualRecipe = rendererPlan.visualRecipe || {};
    const renderIR = renderProgram.renderIR || spec && spec.renderIR || {};
    return [
      sceneKindFromSpec(spec),
      rendererPlan.sceneKind,
      rendererPlan.painterKind,
      visualRecipe.sceneKind,
      visualRecipe.painterKind,
      renderIR.sceneHint,
      ...((renderIR.objects || []).map((row) => `${row.id || ''} ${row.label || ''} ${row.glyph || ''} ${row.materialId || ''} ${row.visualRegime || ''}`)),
      ...((renderIR.fields || []).map((row) => `${row.id || ''} ${row.name || ''} ${row.channel || ''} ${row.domainId || ''}`)),
      ...((renderIR.causalAffordances || []).map((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        (row.shaderHints || []).join(' '),
        (row.motionHints || []).join(' '),
      ].join(' '))),
      ...((visualIR.geometry || []).map((row) => row.description || row.primitive || row.label || '')),
      ...((visualIR.materials || []).map((row) => `${row.id || ''} ${row.family || ''} ${row.shader || ''}`)),
      ...((visualIR.processes || []).map((row) => `${row.id || ''} ${row.family || ''} ${row.motion || ''}`)),
      ...((visualIR.causalAffordances || []).map((row) => `${row.id || ''} ${row.causalRelationId || ''} ${row.geometry || ''} ${(row.shaderHints || []).join(' ')} ${(row.motionHints || []).join(' ')}`)),
      ...graphicsAtomTextRows(visualIR.graphicsAtoms),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function graphicsAtomTextRows(graphicsAtoms = {}) {
    return [
      graphicsAtoms.atlasId,
      ...((graphicsAtoms.mappings || []).map((row) => `${row.id || ''} ${(row.matchedTerms || []).join(' ')} ${row.receiptText || ''}`)),
      ...((graphicsAtoms.geometry || []).map((row) => `${row.id || ''} ${row.label || ''}`)),
      ...((graphicsAtoms.fields || []).map((row) => `${row.id || ''} ${row.label || ''}`)),
      ...((graphicsAtoms.materials || []).map((row) => `${row.id || ''} ${row.label || ''}`)),
      ...((graphicsAtoms.processes || []).map((row) => `${row.id || ''} ${row.label || ''}`)),
      ...((graphicsAtoms.motion || []).map((row) => `${row.id || ''} ${row.label || ''}`)),
      ...((graphicsAtoms.camera || []).map((row) => `${row.id || ''} ${row.label || ''}`)),
    ];
  }

  function featureVector(text) {
    const vector = new Float32Array(40);
    FEATURE_TRIGGERS.forEach((triggers, index) => {
      let score = 0;
      for (const trigger of triggers) {
        if (text.includes(trigger)) score += 1 / triggers.length;
      }
      vector[index] = Math.min(1, score);
    });
    return vector;
  }

  function graphicsAtomFeatureVector(spec) {
    const vector = new Float32Array(40);
    const atoms = spec && spec.renderProgram && spec.renderProgram.visualIR &&
      spec.renderProgram.visualIR.graphicsAtoms || {};
    const text = [
      ...((atoms.mappings || []).map((row) => row.id)),
      ...((atoms.geometry || []).map((row) => row.id)),
      ...((atoms.fields || []).map((row) => row.id)),
      ...((atoms.materials || []).map((row) => row.id)),
      ...((atoms.processes || []).map((row) => row.id)),
      ...((atoms.motion || []).map((row) => row.id)),
      ...((atoms.camera || []).map((row) => row.id)),
    ].join(' ').toLowerCase();
    const push = (indices, pattern, strength = 0.78) => {
      if (!pattern.test(text)) return;
      indices.forEach((index) => {
        vector[index] = Math.max(vector[index] || 0, strength);
      });
    };
    push([0, 16, 17], /thermal|heat|flame|phase|vapor|hot/);
    push([2, 3, 35], /fluid|flow|pressure|stream|coolant|ribbon/);
    push([7, 8], /optical|ray|caustic|phase-front|spectral|lens/);
    push([10, 34], /acoustic|wave|pressure-ring|resonator|standing/);
    push([11, 19, 23, 36], /bio|cell|growth|organic|membrane|protein|root/);
    push([13, 30, 31], /network|queue|parcel|agent|feedback|control|routing/);
    push([14, 28], /orbit|gravity|trajectory|barycenter|astral/);
    push([4, 29, 37], /magnetic|flux|charge|coil|plasma|electric/);
    push([12, 24], /stress|fracture|contact|impulse|deformation|crack/);
    return vector;
  }

  function mergeFeatureVectors(a, b) {
    const vector = new Float32Array(40);
    for (let i = 0; i < vector.length; i += 1) {
      vector[i] = Math.max(a && a[i] || 0, b && b[i] || 0);
    }
    return vector;
  }

  function featureStrength(features) {
    let total = 0;
    for (const value of features || []) total += value;
    return clamp(total / 4, 0, 1);
  }

  function metricsForSpec(spec, text) {
    const params = spec && spec.params || {};
    return {
      heat: clamp01(Number(params.heat || 0.35) + (/heat|thermal|lava|fire|chip|plasma/.test(text) ? 0.34 : 0)),
      flow: clamp01(Number(params.flow || params.air || 0.42) + (/flow|wind|river|water|queue|signal/.test(text) ? 0.24 : 0)),
      density: clamp01(Number(params.density || params.mass || 0.46) + (/crowd|particle|soil|material|molecular|network/.test(text) ? 0.18 : 0)),
      bloom: /laser|plasma|aurora|thermal|glow|signal|circuit/.test(text) ? 0.82 : 0.58,
      motion: /wave|orbit|spin|feedback|flow|vortex|pulse/.test(text) ? 0.76 : 0.42,
    };
  }

  function paletteForScene(sceneKind, text) {
    if (/lava|fire|thermal|heat|plume/.test(text) || sceneKind === 'thermal-plume') return paletteToVec4(PALETTES.thermal);
    if (/storm|weather|wind|vortex|tornado/.test(text)) return paletteToVec4(PALETTES.weather);
    if (/river|ocean|water|watershed|upwelling|glacier|ice/.test(text)) return paletteToVec4(/ice|glacier|cryosphere/.test(text) ? PALETTES.ice : PALETTES.water);
    if (/ferrofluid|magnet|field/.test(text)) return paletteToVec4(PALETTES.magnet);
    if (/optics|laser|lens|light|caustic/.test(text)) return paletteToVec4(PALETTES.optics);
    if (/acoustic|speaker|wave|sound/.test(text)) return paletteToVec4(PALETTES.acoustic);
    if (/bio|algae|root|coral|protein|neuron/.test(text)) return paletteToVec4(/protein|molecular/.test(text) ? PALETTES.molecular : PALETTES.bio);
    if (/chem|crystal|gel|acid|battery/.test(text)) return paletteToVec4(PALETTES.chemistry);
    if (/space|orbit|aurora|planet|ring/.test(text)) return paletteToVec4(PALETTES.space);
    if (/network|data center|server|queue|chip|shard|supply|crowd/.test(text)) return paletteToVec4(PALETTES.network);
    if (/plasma|fusion|tokamak/.test(text)) return paletteToVec4(PALETTES.plasma);
    if (/microgrid|inverter|transformer|frequency control|voltage/.test(text) || sceneKind === 'grid-energy') return paletteToVec4(PALETTES.grid);
    if (/robot|gripper|servo|warehouse/.test(text) || sceneKind === 'robotics-control') return paletteToVec4(PALETTES.robot);
    if (/injection molding|factory|steel tooling|conveyor/.test(text) || sceneKind === 'manufacturing-line') return paletteToVec4(PALETTES.factory);
    if (/qubit|quantum|resonator|superconducting/.test(text) || sceneKind === 'quantum-instrument') return paletteToVec4(PALETTES.quantum);
    if (/compost|greenhouse|nutrient|organic waste/.test(text) || sceneKind === 'agro-waste-loop') return paletteToVec4(PALETTES.agro);
    if (/skateboard|sport|bowl|friction/.test(text) || sceneKind === 'sport-motion') return paletteToVec4(PALETTES.sport);
    if (/museum|pigment|archive|varnish/.test(text) || sceneKind === 'cultural-material') return paletteToVec4(PALETTES.cultural);
    if (/clinical|blood|vessel|patient/.test(text)) return paletteToVec4(PALETTES.clinical);
    if (/instrument|detector|particle/.test(text)) return paletteToVec4(PALETTES.instrument);
    return paletteToVec4(PALETTES.machine);
  }

  function paletteToVec4(colors) {
    return colors.map((color) => {
      const rgb = hexToRgb(color);
      return new Float32Array([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1]);
    });
  }

  function hexToRgb(hex) {
    const normalized = String(hex || '#ffffff').replace('#', '');
    const value = Number.parseInt(normalized.length === 3
      ? normalized.split('').map((c) => `${c}${c}`).join('')
      : normalized, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function dynamicMetric(base, state, key) {
    const fields = state && state.fields || {};
    const fieldValue = Number(fields[key] || fields.temperature || fields.pressure || 0);
    return clamp01(Number(base || 0) * 0.76 + clamp01(fieldValue) * 0.24);
  }

  function seedForSpec(spec) {
    const text = visualTextFromSpec(spec) || sceneKindFromSpec(spec);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clamp01(value) {
    return clamp(Number(value || 0), 0, 1);
  }

  const WEBGPU_SHADER = `
struct Uniforms {
  viewport: vec4f,
  params: vec4f,
  motion: vec4f,
  loading: vec4f,
  palette0: vec4f,
  palette1: vec4f,
  palette2: vec4f,
  palette3: vec4f,
  features0: vec4f,
  features1: vec4f,
  features2: vec4f,
  features3: vec4f,
  features4: vec4f,
  features5: vec4f,
  features6: vec4f,
  features7: vec4f,
  features8: vec4f,
  features9: vec4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VsOut {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VsOut;
  out.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  out.uv = pos[vertexIndex] * 0.5 + vec2f(0.5);
  return out;
}

fn stripe(v: f32, width: f32) -> f32 {
  return 1.0 - smoothstep(width, width + 0.012, abs(fract(v) - 0.5));
}

fn rot(p: vec2f, a: f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
}

fn featureAt(index: i32) -> f32 {
  if (index < 4) { return u.features0[index]; }
  if (index < 8) { return u.features1[index - 4]; }
  if (index < 12) { return u.features2[index - 8]; }
  if (index < 16) { return u.features3[index - 12]; }
  if (index < 20) { return u.features4[index - 16]; }
  if (index < 24) { return u.features5[index - 20]; }
  if (index < 28) { return u.features6[index - 24]; }
  if (index < 32) { return u.features7[index - 28]; }
  if (index < 36) { return u.features8[index - 32]; }
  return u.features9[index - 36];
}

fn sceneField(p: vec2f, t: f32, scene: f32) -> vec3f {
  let heat = u.params.x;
  let flow = u.params.y;
  let density = u.params.z;
  let bloom = u.params.w;
  let motion = u.motion.x;
  var color = mix(u.palette0.rgb, u.palette2.rgb, smoothstep(-0.9, 0.9, p.y));
  let rings = stripe(length(p) * (3.0 + density * 5.0) - t * (0.12 + motion * 0.26), 0.035);
  let waves = stripe(p.x * (3.0 + flow * 4.0) + sin(p.y * 4.0 + t) * 0.12, 0.04);
  let orbit = stripe(atan2(p.y, p.x) / 6.28318 * (5.0 + floor(scene % 7.0)) + length(p) * 1.2 - t * 0.12, 0.035);
  let plume = exp(-abs(p.x + sin(p.y * 4.0 + t * 0.8) * 0.12) * 8.0) * smoothstep(-0.9, 0.72, p.y);
  let grid = max(stripe(p.x * 7.0 + t * 0.04, 0.025), stripe(p.y * 7.0 - t * 0.05, 0.025));
  let beam = exp(-abs(rot(p, 0.38 + sin(t * 0.2) * 0.16).y) * 42.0) * smoothstep(-0.8, 0.7, p.x);
  let branch = exp(-abs(sin(p.x * 7.0 + sin(p.y * 5.0 + t * 0.2))) * 5.0) * smoothstep(0.85, -0.4, length(p));
  let sceneGroup = floor(scene);
  if (sceneGroup == 0.0) {
    color = mix(color, u.palette1.rgb, plume * (0.55 + heat * 0.45));
    color += u.palette3.rgb * rings * 0.18;
  } else if (sceneGroup == 1.0) {
    color = mix(color, u.palette1.rgb, waves * 0.42 + plume * 0.24);
    color += u.palette3.rgb * orbit * 0.16;
  } else if (sceneGroup == 2.0) {
    color = mix(color, u.palette1.rgb, max(waves, branch * 0.7) * 0.44);
    color += u.palette3.rgb * rings * 0.12;
  } else if (sceneGroup == 5.0) {
    color = mix(color, u.palette1.rgb, beam * bloom);
    color += u.palette3.rgb * rings * 0.24;
  } else if (sceneGroup == 7.0 || sceneGroup == 13.0 || sceneGroup == 14.0) {
    color = mix(color, u.palette1.rgb, branch * 0.46);
    color += u.palette3.rgb * rings * 0.12;
  } else if (sceneGroup == 10.0) {
    color = mix(color, u.palette1.rgb, max(rings, orbit) * 0.54);
    color += u.palette3.rgb * exp(-length(p) * 4.0) * 0.26;
  } else if (sceneGroup == 11.0) {
    color = mix(color, u.palette1.rgb, grid * 0.42 + waves * 0.16);
    color += u.palette3.rgb * stripe((p.x + p.y) * 5.0 - t * 0.3, 0.026) * 0.18;
  } else if (sceneGroup == 16.0) {
    let bus = max(stripe(p.x * 7.0 + t * 0.08, 0.05), stripe(p.y * 4.0 - t * 0.05, 0.052));
    let pulse = stripe((p.x + p.y) * 5.0 - t * (0.55 + motion), 0.046);
    let nodeA = exp(-dot(p - vec2f(-0.58, -0.18), p - vec2f(-0.58, -0.18)) * 34.0);
    let nodeB = exp(-dot(p - vec2f(0.36, 0.12), p - vec2f(0.36, 0.12)) * 42.0);
    let nodeC = exp(-dot(p - vec2f(-0.08, 0.48), p - vec2f(-0.08, 0.48)) * 28.0);
    let overload = exp(-abs(length(p - vec2f(0.58, -0.36)) - 0.2) * 20.0);
    let voltageField = 0.5 + 0.5 * sin(p.x * 4.0 + t * 0.22) * cos(p.y * 5.0 - t * 0.18);
    color = mix(vec3f(0.035, 0.055, 0.07), vec3f(0.84, 0.62, 0.12), 0.16 + voltageField * 0.36);
    color = mix(color, vec3f(1.0, 0.82, 0.18), bus * 0.72 + nodeA * 0.78 + nodeB * 0.74 + nodeC * 0.64);
    color += vec3f(1.0, 0.1, 0.035) * (pulse * 0.42 + overload * (0.36 + heat * 0.44));
  } else if (sceneGroup == 17.0) {
    let conveyor = smoothstep(0.2, 0.16, abs(p.y + 0.46)) * max(stripe(p.x * 12.0 - t * 0.42, 0.04), 0.28);
    let shoulder = exp(-abs(length(p - vec2f(-0.36, -0.02)) - 0.28) * 28.0);
    let elbow = exp(-abs(length(p - vec2f(0.08, 0.0)) - 0.24) * 34.0);
    let gripper = exp(-dot(p - vec2f(0.46 + sin(t) * 0.05, -0.12), p - vec2f(0.46 + sin(t) * 0.05, -0.12)) * 58.0);
    color = mix(color, u.palette1.rgb, conveyor * 0.35 + shoulder * 0.34 + elbow * 0.3);
    color += u.palette3.rgb * (gripper * 0.42 + stripe(atan2(p.y + 0.02, p.x + 0.36) + t * 0.5, 0.04) * 0.14);
  } else if (sceneGroup == 18.0) {
    let belt = smoothstep(0.28, 0.2, abs(p.y + 0.42));
    let cadence = max(stripe(p.x * 8.0 - t * 0.28, 0.05), stripe((p.x + p.y) * 5.0, 0.03));
    let die = smoothstep(0.45, 0.0, abs(p.x + 0.18)) * smoothstep(0.26, 0.0, abs(p.y - 0.06));
    let cooling = exp(-abs(p.y - 0.18 - sin(p.x * 8.0 + t) * 0.04) * 16.0);
    color = mix(color, u.palette1.rgb, belt * 0.24 + die * 0.42 + cadence * 0.18);
    color += u.palette3.rgb * cooling * 0.28;
  } else if (sceneGroup == 19.0) {
    let resonator = max(
      exp(-abs(length((p - vec2f(-0.2, 0.0)) * vec2f(1.3, 0.8)) - 0.36) * 24.0),
      exp(-abs(length((p - vec2f(0.28, 0.04)) * vec2f(1.1, 0.9)) - 0.22) * 28.0)
    );
    let fringes = stripe(p.x * 14.0 + sin(p.y * 7.0 + t * 0.4), 0.028);
    let readout = exp(-abs(rot(p, -0.32).y + 0.1) * 48.0) * smoothstep(-0.85, 0.7, p.x);
    color = mix(u.palette2.rgb, u.palette1.rgb, resonator * 0.48 + fringes * 0.12);
    color += u.palette3.rgb * readout * (0.2 + bloom * 0.18);
  } else if (sceneGroup == 20.0) {
    let rows = max(stripe(p.x * 8.0 + sin(p.y * 5.0), 0.035), stripe((p.x - p.y) * 5.0, 0.028));
    let nutrientLoop = exp(-abs(length((p - vec2f(0.06, 0.04)) * vec2f(1.1, 0.72)) - 0.45) * 18.0);
    let compost = exp(-dot(p - vec2f(-0.52, 0.32), p - vec2f(-0.52, 0.32)) * 18.0);
    color = mix(color, u.palette1.rgb, rows * 0.28 + nutrientLoop * 0.32);
    color += u.palette3.rgb * compost * (0.18 + heat * 0.28);
  } else if (sceneGroup == 21.0) {
    let bowl = exp(-abs(p.y - (0.42 * p.x * p.x - 0.42)) * 22.0);
    let trajectory = exp(-abs(length((p - vec2f(sin(t * 0.4) * 0.42, -0.1 + cos(t * 0.4) * 0.16)) * vec2f(1.2, 1.8)) - 0.18) * 24.0);
    let friction = stripe(p.x * 9.0 + p.y * 3.0 + t * 0.25, 0.03);
    color = mix(color, u.palette1.rgb, bowl * 0.5 + trajectory * 0.42);
    color += u.palette3.rgb * friction * smoothstep(0.8, 0.05, abs(p.y + 0.48)) * 0.18;
  } else if (sceneGroup == 22.0) {
    let strata = max(stripe(p.y * 9.0 + sin(p.x * 3.0) * 0.08, 0.045), stripe((p.x - p.y) * 4.0, 0.03));
    let cracks = exp(-abs(sin(p.x * 10.0 + p.y * 6.0 + t * 0.08)) * 8.0);
    color = mix(color, u.palette1.rgb, strata * 0.34);
    color += u.palette3.rgb * cracks * 0.16;
  } else {
    color = mix(color, u.palette1.rgb, max(rings * 0.36, grid * 0.24));
    color += u.palette3.rgb * waves * 0.16;
  }
  return color;
}

fn affordanceOverlays(p: vec2f, t: f32, base: vec3f) -> vec3f {
  var color = base;
  let f = u.loading.w;
  let laser = featureAt(7) + featureAt(8);
  let network = featureAt(13) + featureAt(30) + featureAt(31);
  let orbit = featureAt(14) + featureAt(28);
  let bio = featureAt(11) + featureAt(19) + featureAt(23) + featureAt(36);
  let wave = featureAt(10) + featureAt(34);
  color += u.palette3.rgb * laser * exp(-abs(rot(p, 0.18).y) * 54.0) * 0.28;
  color += u.palette1.rgb * network * max(stripe(p.x * 9.0 + t * 0.24, 0.022), stripe(p.y * 7.0 - t * 0.18, 0.022)) * 0.16;
  color += u.palette3.rgb * orbit * stripe(length(p) * 4.2 - t * 0.15, 0.026) * 0.2;
  color += u.palette1.rgb * bio * exp(-abs(sin(p.x * 6.0 + p.y * 3.0 + t * 0.12)) * 5.0) * 0.1;
  color += u.palette3.rgb * wave * stripe(length(p) * 6.0 - t * 0.55, 0.024) * 0.17;
  return mix(base, color, clamp(f + 0.24, 0.0, 1.0));
}

fn loadingWrapDistance(a: f32, b: f32, span: f32) -> f32 {
  let d = abs(a - b);
  return min(d, span - d);
}

fn loadingSnakeMask(gridUv: vec2f, cells: vec2f, t: f32, progress: f32, rowFrac: f32, speed: f32, phase: f32) -> vec2f {
  let headX = fract(t * speed + progress * 0.58 + phase) * cells.x;
  let row = floor(cells.y * rowFrac + sin(t * (0.55 + speed) + phase * 6.28318) * 1.65);
  let dx = loadingWrapDistance(gridUv.x, headX, cells.x);
  let dy = abs(gridUv.y - row);
  let trail = fract((headX - gridUv.x) / cells.x);
  let tail = smoothstep(0.012, 0.045, trail) * (1.0 - smoothstep(0.08, 0.38, trail));
  let cellMask = (1.0 - smoothstep(0.22, 0.48, abs(fract(gridUv.x) - 0.5))) *
    (1.0 - smoothstep(0.22, 0.48, abs(fract(gridUv.y) - 0.5)));
  let body = (1.0 - smoothstep(0.14, 0.72, dy)) * tail * cellMask;
  let head = 1.0 - smoothstep(0.08, 0.82, length(vec2f(dx, dy)));
  return vec2f(body, head);
}

fn loadingGrid(uv: vec2f, t: f32, progress: f32) -> vec3f {
  let cells = vec2f(34.0, 20.0);
  let gridUv = uv * cells;
  let line = max(1.0 - smoothstep(0.018, 0.036, abs(fract(gridUv.x) - 0.5)), 1.0 - smoothstep(0.018, 0.036, abs(fract(gridUv.y) - 0.5)));
  let snakeA = loadingSnakeMask(gridUv, cells, t, progress, 0.24, 0.18, 0.03);
  let snakeB = loadingSnakeMask(gridUv, cells, t, progress, 0.42, 0.24, 0.31);
  let snakeC = loadingSnakeMask(gridUv, cells, t, progress, 0.62, 0.21, 0.57);
  let snakeD = loadingSnakeMask(gridUv, cells, t, progress, 0.78, 0.16, 0.81);
  let snakeBody = max(max(snakeA.x, snakeB.x), max(snakeC.x, snakeD.x));
  let snakeHeads = max(max(snakeA.y, snakeB.y), max(snakeC.y, snakeD.y));
  let crossingGlow = max(min(snakeA.x + snakeC.x, 1.0), min(snakeB.x + snakeD.x, 1.0));
  var color = vec3f(0.985, 0.984, 1.0);
  color = mix(color, vec3f(0.34, 0.42, 0.58), line * 0.08);
  color = mix(color, u.palette1.rgb, snakeBody * 0.62);
  color += u.palette3.rgb * snakeHeads * 0.48;
  color += u.palette2.rgb * crossingGlow * 0.18;
  return color;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4f {
  let resolution = max(u.viewport.xy, vec2f(1.0));
  let uv = input.uv;
  let aspect = resolution.x / resolution.y;
  var p = uv * 2.0 - vec2f(1.0);
  p.x *= aspect;
  let t = u.viewport.z;
  let scene = u.viewport.w;
  var color = sceneField(p, t, scene);
  color = affordanceOverlays(p, t, color);
  let vignette = smoothstep(1.45, 0.18, length(p));
  color = mix(color * 0.78, color, vignette);
  if (u.loading.x > 0.5) {
    let loader = loadingGrid(uv, t, u.loading.y);
    color = mix(color, loader, 0.86);
  }
  if (u.loading.z > 0.5) {
    color = mix(color, vec3f(0.985, 0.985, 1.0), 0.5);
  }
  color = pow(max(color, vec3f(0.0)), vec3f(0.92));
  return vec4f(color, 1.0);
}
`;

  return { create };
});
