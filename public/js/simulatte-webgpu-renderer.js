(function attachSimulatteWebGpuRenderer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteWebGpuRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWebGpuRendererApi() {
  const SCENE_IDS = Object.freeze({
    'thermal-plume': 0,
    fire: 33,
    'weather-atmosphere': 1,
    watershed: 2,
    ocean: 23,
    'mechanical-fluid': 3,
    mechanical: 3,
    'structural-mechanics': 24,
    ferrofluid: 4,
    'magnetic-machine': 4,
    optics: 5,
    'optics-thermal': 5,
    'thin-film': 34,
    acoustic: 6,
    biology: 7,
    ecology: 25,
    'evolution-ecology': 25,
    'restoration-water': 26,
    'agro-waste-loop': 20,
    'chemistry-lab': 8,
    'material-tray': 8,
    cryosphere: 9,
    'ocean-cryosphere': 27,
    'planetary-space': 10,
    'digital-network': 11,
    city: 28,
    'civic-market': 29,
    'venue-crowd': 30,
    'advanced-energy': 12,
    'grid-energy': 16,
    'molecular-biology': 13,
    'clinical-control': 14,
    'particle-instrument': 15,
    'quantum-instrument': 19,
    atomic: 19,
    'robotics-control': 17,
    'manufacturing-line': 18,
    granular: 22,
    'sport-motion': 21,
    'cultural-material': 22,
    'hazard-atmosphere': 31,
    'space-instrument': 32,
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
    ['lens-refracts', 'caustic', 'ray-bundles', 'thin-film-interference', 'iridescent-fringes', 'soap-film'],
    ['impact-fractures', 'crack-propagation', 'shock-ring'],
    ['speaker-drives', 'wavefront-expansion', 'standing-wave', 'pressure-waves', 'acoustic-levitator', 'waveguide'],
    ['nutrients-grow-algae', 'growth-front', 'biofilm', 'fermentation-bubbles', 'gluten-strands'],
    ['chemical-diffuses', 'concentration-front', 'reaction-cloud', 'acidity-gradient', 'gas-pocket-growth'],
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
    ['particle-collider', 'muon-tracks', 'detector-slice'],
    ['zoning-parcel-pressure', 'housing-market', 'civic-grid'],
    ['hazard-restoration', 'storm-surge', 'evacuation-field'],
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
      this.maxDpr = Number(options.maxDpr || 2);
      this.quality = 1;
      this.ready = false;
      this.status = 'initializing WebGPU renderer';
      this.sceneKind = 'mechanical';
      this.sceneId = 3;
      this.uniforms = new Float32Array(104);
      this.features = new Float32Array(48);
      this.atomUniforms = new Float32Array(24);
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
        this.canvas.dataset.visualTier = 'webgpu-cinematic-3d';
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
      this.canvas.dataset.loadingIgnored = active ? `${Number(percent || 0)}:${stage || ''}` : '';
    }

    setSpec(spec) {
      const baseSceneKind = sceneKindFromSpec(spec);
      const text = visualTextFromSpec(spec);
      this.sceneKind = refineSceneKindFromText(baseSceneKind, text);
      this.sceneId = SCENE_IDS[this.sceneKind] ?? 3;
      this.canvas.dataset.sceneKind = this.sceneKind;
      this.canvas.dataset.sceneId = String(this.sceneId);
      this.features = mergeFeatureVectors(featureVector(text), graphicsAtomFeatureVector(spec));
      this.atomUniforms = graphicsAtomUniformVector(spec);
      this.palette = paletteForScene(this.sceneKind, text, this.atomUniforms);
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
      u[12] = 0;
      u[13] = 1;
      u[14] = 0;
      u[15] = featureStrength(this.features);
      let offset = 16;
      for (const color of this.palette) {
        u.set(color, offset);
        offset += 4;
      }
      for (let i = 0; i < 48; i += 1) {
        u[offset + i] = this.features[i] || 0;
      }
      offset += 48;
      for (let i = 0; i < 24; i += 1) {
        u[offset + i] = this.atomUniforms[i] || 0;
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

  function refineSceneKindFromText(sceneKind, text) {
    if (isCompiledSpecificScene(sceneKind)) return sceneKind;
    const value = String(text || '').toLowerCase();
    if (/\b(thin film|thin-film|soap film|wire loop|wire-loop|iridescent|surface tension)\b/.test(value)) return 'thin-film';
    if (/\b(qubit|quantum|superconducting|microwave resonator|phase readout|ion trap|spin lattice)\b/.test(value)) return 'quantum-instrument';
    if (/\b(muon|neutrino|particle collider|calorimeter|detector slice|phototube|cherenkov|particle track)\b/.test(value)) return 'particle-instrument';
    if (/\b(acoustic|sound|standing wave|standing waves|pressure wave|pressure waves|waveguide|resonance|levitator|brass tube)\b/.test(value)) return 'acoustic';
    if (/\b(microgrid|battery inverter|transformer overload|substation|frequency control|voltage sag|power flow)\b/.test(value)) return 'grid-energy';
    if (/\b(robot|robotic|servo|gripper|pick and place|warehouse arm|drone stabiliz)\b/.test(value)) return 'robotics-control';
    if (/\b(injection molding|steel tooling|factory line|conveyor|cnc|extruder|cooling die)\b/.test(value)) return 'manufacturing-line';
    if (/\b(data center|server rack|cooling aisle|query|index shard|packet|compiler|database|service graph)\b/.test(value)) return 'digital-network';
    if (/\b(zoning|parcel|housing|market pressure|bullwhip|supply chain|dispatch|policy|carbon credit)\b/.test(value)) return 'civic-market';
    if (/\b(crowd|venue|stadium|festival|elevator|platform|restaurant queue|order queue)\b/.test(value)) return 'venue-crowd';
    if (/\b(glacier|ice shelf|iceberg|fjord|sea ice|thermocline|internal ocean wave|kelp canopy)\b/.test(value)) return 'ocean-cryosphere';
    if (/\b(mangrove|oyster reef|peatland|aquifer|rewetting|living breakwater|water treatment|restoration)\b/.test(value)) return 'restoration-water';
    if (/\b(coral|microbiome|pollinator|predator|prey|fish school|bird flock|population genetics|succession)\b/.test(value)) return 'evolution-ecology';
    if (/\b(bridge resonance|vortex shedding|aeroelastic|modal vibration|structural mode|cable tension|truss)\b/.test(value)) return 'structural-mechanics';
    if (/\b(hurricane|earthquake|tsunami|wildfire|evacuation|air quality|urban heat|hazard|mine ventilation)\b/.test(value)) return 'hazard-atmosphere';
    if (/\b(fusion|tokamak|stellarator|plasma ribbon|electrolyzer|fuel cell|molten salt|nuclear waste)\b/.test(value)) return 'advanced-energy';
    if (/\b(protein|ribosome|enzyme|ligand|amino acid|molecular chain|bond constraint|fermentation|sourdough|gluten|dough matrix|yeast)\b/.test(value)) return 'molecular-biology';
    if (/\b(vaccine|patient|clinical|blood|neuron|synapse|hospital|prosthetic|tissue)\b/.test(value)) return 'clinical-control';
    if (/\b(skate|skateboard|ski|surf|sailing|archery|mountain bike|rider)\b/.test(value)) return 'sport-motion';
    if (/\b(museum|archive|pigment|varnish|ceramic glaze|conservation|artwork)\b/.test(value)) return 'cultural-material';
    if (/\b(compost|greenhouse|anaerobic digester|organic waste|nutrient loop|algae bioreactor)\b/.test(value)) return 'agro-waste-loop';
    if (/\b(planet|orbital|orbit|asteroid|comet|galaxy|radio telescope|deep space|black hole|shepherd moon)\b/.test(value)) return 'planetary-space';
    return sceneKind;
  }

  function isCompiledSpecificScene(sceneKind) {
    const value = String(sceneKind || '');
    return Boolean(value && value !== 'mechanical' && value !== 'mechanical-fluid' && value !== 'custom-world');
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
      visualIR.sceneKind,
      visualIR.scale,
      visualIR.camera && `${visualIR.camera.mode || ''} ${visualIR.camera.lens || ''} ${visualIR.camera.angle || ''}`,
      visualIR.lighting && `${visualIR.lighting.key || ''} ${visualIR.lighting.fill || ''} ${visualIR.lighting.atmosphere || ''}`,
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
      ...((graphicsAtoms.languageSignals || []).map((row) => `${row.id || ''} ${row.kind || ''} ${row.text || ''} ${(row.slots || []).join(' ')}`)),
    ];
  }

  function featureVector(text) {
    const vector = new Float32Array(48);
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
    const vector = new Float32Array(48);
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
      ...((atoms.languageSignals || []).map((row) => `${row.id || ''} ${row.kind || ''} ${row.text || ''} ${(row.slots || []).join(' ')}`)),
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
    push([7, 8], /thin-film|thin film|soap|wire-loop|wire loop|iridescent|interference-bubble|surface-tension/, 0.9);
    push([10, 34], /acoustic|wave|pressure-ring|pressure wave|pressure waves|resonator|standing|levitator|waveguide|brass-tube|brass tube/);
    push([11, 19, 23, 36], /bio|cell|grow|growth|organic|membrane|protein|root|ferment|sourdough|dough|gluten|yeast|porous/);
    push([11, 12, 19, 23, 36], /fermentation|ferment|sourdough|gluten|dough|gas-pocket|bubble-expansion|acidity-gradient|carbon-dioxide/, 0.9);
    push([13, 30, 31], /network|queue|parcel|agent|routing|market|graph|index|supply|crowd/);
    push([17], /feedback|control|controller|setpoint|sensor|actuator|valve/);
    push([14, 28], /orbit|gravity|trajectory|barycenter|astral/);
    push([4, 29, 37], /magnetic|flux|charge|coil|plasma|electric/);
    push([12, 24], /stress|fracture|contact|impulse|deformation|crack/);
    push([12, 24], /bridge|cable|tension|vortex-shedding|vortex shedding|structural-resonance|modal/, 0.82);
    push([38, 41], /robot|servo|gripper|workcell|pick|place/);
    push([9, 17], /skate|skateboard|rider|bowl|friction|centripetal|trajectory|wheel|carv/);
    push([26, 35], /cryosphere|glacier|iceberg|fjord|calving|ice shelf|ice cliff|meltwater|internal ocean/);
    push([45], /particle|detector|muon|neutrino|calorimeter|cherenkov/);
    push([46], /parcel|zoning|housing|market|policy|supply|dispatch|bullwhip/);
    push([47], /hazard|storm|surge|evacuation|restoration|mangrove|aquifer|wildfire|tsunami/);
    return vector;
  }

  const ATOM_UNIFORM_SLOTS = Object.freeze([
    'thermal',
    'fluid',
    'stress',
    'feedback',
    'orbital',
    'electromagnetic',
    'optical',
    'quantum',
    'acoustic',
    'biological',
    'chemical',
    'network',
    'granular',
    'instrument',
    'combustion',
    'phase',
    'robotic',
    'measurement',
    'motion',
    'density',
    'emission',
    'constraint',
    'signal',
    'surface',
  ]);

  function graphicsAtomUniformVector(spec) {
    const vector = new Float32Array(24);
    const atoms = spec && spec.renderProgram && spec.renderProgram.visualIR &&
      spec.renderProgram.visualIR.graphicsAtoms || {};
    const values = atoms && atoms.uniforms && Array.isArray(atoms.uniforms.values)
      ? atoms.uniforms.values
      : [];
    if (values.length) {
      for (let i = 0; i < Math.min(vector.length, values.length); i += 1) {
        vector[i] = clamp01(values[i]);
      }
      return compressAtomUniformVector(vector);
    }
    const text = graphicsAtomTextRows(atoms).join(' ').toLowerCase();
    const set = (slot, pattern, strength = 0.7) => {
      const index = ATOM_UNIFORM_SLOTS.indexOf(slot);
      if (index >= 0 && pattern.test(text)) vector[index] = Math.max(vector[index], strength);
    };
    set('thermal', /thermal|heat|vapor|flame|combustion/);
    set('fluid', /fluid|flow|pressure|stream|coolant|gas-pocket|bubble/);
    set('stress', /stress|fracture|crack|contact|constraint/);
    set('feedback', /feedback|controller|setpoint|control/);
    set('orbital', /orbit|gravity|trajectory|barycenter/);
    set('electromagnetic', /magnetic|flux|charge|coil|electric/);
    set('optical', /optical|ray|caustic|lens|spectral|thin-film|thin film|soap film|iridescent|interference/);
    set('quantum', /quantum|qubit|superconducting|resonator/);
    set('acoustic', /acoustic|sound|wave|resonance|frequency|pressure-ring|pressure wave|pressure waves|levitator|waveguide|brass tube/);
    set('biological', /biological|bio|cell|grow|growth|organic|membrane|protein|root|fermentation|sourdough|gluten|dough|yeast/);
    set('chemical', /chemical|reaction|diffusion|acid|acidity|crystal|concentration|reagent|fermentation/);
    set('network', /network|queue|parcel|agent|routing/);
    set('granular', /granular|grain|sand|sediment|erosion|terrain|powder|bead/);
    set('instrument', /instrument|detector|sensor|readout|probe|meter|measurement/);
    set('combustion', /combustion|fire|flame|smoke|ember|soot|burn/);
    set('phase', /phase|melt|freeze|vapor|boil|solidify|latent/);
    set('robotic', /robot|servo|gripper|workcell/);
    set('measurement', /measurement|readout|sample|uncertainty|probe/);
    set('motion', /motion|pulse|trail|wave|ribbon|trajectory|vortex|bubble-expansion|strand-deformation/);
    set('density', /density|crowd|particle|grain|nutrient|concentration|dough|gluten|porous/);
    set('emission', /emission|glow|emissive|plasma|laser|signal/);
    set('constraint', /constraint|setpoint|contact|force|boundary|control/);
    set('signal', /signal|packet|pulse|current|voltage|telemetry/);
    set('surface', /surface|membrane|terrain|map|skin|boundary|phase|gluten|dough|thin-film|thin film|soap film|wire-loop/);
    return compressAtomUniformVector(vector);
  }

  function compressAtomUniformVector(input) {
    const vector = new Float32Array(24);
    const ranked = Array.from(input || []).map((value, index) => ({
      index,
      value: clamp01(value),
    })).sort((a, b) => b.value - a.value || a.index - b.index);
    ranked.slice(0, 10).forEach((entry, rank) => {
      const gain = rank === 0 ? 1.2 : rank === 1 ? 1.06 : rank === 2 ? 0.94 : rank < 6 ? 0.72 : 0.5;
      vector[entry.index] = clamp01(entry.value * gain);
    });
    ranked.slice(10).forEach((entry) => {
      if (entry.value > 0.24) vector[entry.index] = clamp01(0.07 + entry.value * 0.22);
    });
    return vector;
  }

  function mergeFeatureVectors(a, b) {
    const vector = new Float32Array(48);
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
      heat: clamp01(Number(params.heat || 0.35) + (/heat|thermal|cool|cools|cooled|cooling|lava|fire|chip|plasma/.test(text) ? 0.34 : 0)),
      flow: clamp01(Number(params.flow || params.air || 0.42) + (/flow|wind|river|water|queue|signal|gas|bubble|bubbles|pressure-pocket/.test(text) ? 0.24 : 0)),
      density: clamp01(Number(params.density || params.mass || 0.46) + (/crowd|particle|soil|material|molecular|network|dough|gluten|porous|matrix/.test(text) ? 0.18 : 0)),
      bloom: /laser|plasma|aurora|thermal|heat|cool|cooling|glow|signal|circuit|fermentation|acidity|iridescent|thin-film|thin film/.test(text) ? 0.82 : 0.58,
      motion: /wave|orbit|spin|feedback|flow|vortex|pulse|skate|rider|carv|centripetal|trajectory|friction|bubble-expansion|fermentation|gas-pocket|strand-deformation|surface-tension|levitator/.test(text) ? 0.76 : 0.42,
    };
  }

  function paletteForScene(sceneKind, text, atoms) {
    const dominant = dominantAtomSlot(atoms);
    if (dominant === 'quantum') return paletteToVec4(PALETTES.quantum);
    if (dominant === 'robotic') return paletteToVec4(PALETTES.robot);
    if (dominant === 'network' || dominant === 'feedback') return paletteToVec4(PALETTES.network);
    if (dominant === 'optical') return paletteToVec4(PALETTES.optics);
    if (dominant === 'orbital') return paletteToVec4(PALETTES.space);
    if (dominant === 'chemical') return paletteToVec4(PALETTES.chemistry);
    if (dominant === 'biological') return paletteToVec4(PALETTES.bio);
    if (dominant === 'acoustic') return paletteToVec4(PALETTES.acoustic);
    if (dominant === 'granular') return paletteToVec4(PALETTES.cultural);
    if (dominant === 'thermal' || dominant === 'combustion') return paletteToVec4(PALETTES.thermal);
    if (dominant === 'fluid') return paletteToVec4(PALETTES.water);
    if (dominant === 'stress') return paletteToVec4(PALETTES.factory);
    if (dominant === 'electromagnetic') return paletteToVec4(PALETTES.magnet);
    if (sceneKind === 'thin-film') return paletteToVec4(PALETTES.optics);
    if (sceneKind === 'magnetic-machine') return paletteToVec4(PALETTES.magnet);
    if (sceneKind === 'fire') return paletteToVec4(PALETTES.thermal);
    if (sceneKind === 'ocean' || sceneKind === 'ocean-cryosphere') return paletteToVec4(PALETTES.water);
    if (sceneKind === 'structural-mechanics') return paletteToVec4(PALETTES.factory);
    if (sceneKind === 'evolution-ecology' || sceneKind === 'restoration-water') return paletteToVec4(PALETTES.bio);
    if (sceneKind === 'city' || sceneKind === 'civic-market' || sceneKind === 'venue-crowd') return paletteToVec4(PALETTES.network);
    if (sceneKind === 'particle-instrument' || sceneKind === 'space-instrument') return paletteToVec4(PALETTES.instrument);
    if (sceneKind === 'hazard-atmosphere') return paletteToVec4(PALETTES.weather);
    if (sceneKind === 'advanced-energy') return paletteToVec4(PALETTES.plasma);
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

  function dominantAtomSlot(atoms) {
    if (!atoms || !atoms.length) return '';
    let best = { index: -1, value: 0 };
    for (let i = 0; i < atoms.length; i += 1) {
      if (atoms[i] > best.value) best = { index: i, value: atoms[i] };
    }
    if (best.value < 0.18) return '';
    return ATOM_UNIFORM_SLOTS[best.index] || '';
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
  features10: vec4f,
  features11: vec4f,
  atoms0: vec4f,
  atoms1: vec4f,
  atoms2: vec4f,
  atoms3: vec4f,
  atoms4: vec4f,
  atoms5: vec4f,
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
  if (index < 40) { return u.features9[index - 36]; }
  if (index < 44) { return u.features10[index - 40]; }
  if (index < 48) { return u.features11[index - 44]; }
  return 0.0;
}

fn atomAt(index: i32) -> f32 {
  if (index < 4) { return u.atoms0[index]; }
  if (index < 8) { return u.atoms1[index - 4]; }
  if (index < 12) { return u.atoms2[index - 8]; }
  if (index < 16) { return u.atoms3[index - 12]; }
  if (index < 20) { return u.atoms4[index - 16]; }
  return u.atoms5[index - 20];
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
  let grid = 0.0;
  let beam = exp(-abs(rot(p, 0.38 + sin(t * 0.2) * 0.16).y) * 42.0) * smoothstep(-0.8, 0.7, p.x);
  let branch = exp(-abs(sin(p.x * 7.0 + sin(p.y * 5.0 + t * 0.2))) * 5.0) * smoothstep(0.85, -0.4, length(p));
  let sceneGroup = floor(scene);
  let atomSpecific = clamp(max(max(max(atomAt(16), atomAt(7)), max(atomAt(10), atomAt(12))), max(max(atomAt(6), atomAt(9)), atomAt(4))), 0.0, 1.0);
  let commonGain = 1.0 - atomSpecific * 0.46;
  if (sceneGroup == 0.0) {
    color = mix(color, u.palette1.rgb, plume * (0.55 + heat * 0.45));
    color += u.palette3.rgb * rings * 0.18 * commonGain;
  } else if (sceneGroup == 1.0) {
    color = mix(color, u.palette1.rgb, waves * 0.42 + plume * 0.24);
    color += u.palette3.rgb * orbit * 0.16 * commonGain;
  } else if (sceneGroup == 2.0) {
    color = mix(color, u.palette1.rgb, max(waves, branch * 0.7) * 0.44);
    color += u.palette3.rgb * rings * 0.12 * commonGain;
  } else if (sceneGroup == 4.0) {
    let flux = stripe(atan2(p.y, p.x) * 4.0 + length(p) * 3.1 - t * (0.16 + motion * 0.18), 0.034);
    let coil = ellipseRing(p, vec2f(-0.32, -0.05), vec2f(1.45, 0.8), 0.34, 0.045);
    let spikes = pow(max(0.0, sin(atan2(p.y, p.x) * 12.0 + t * 0.7)), 5.0) * smoothstep(0.74, 0.1, length(p));
    color = mix(color, u.palette2.rgb, 0.28);
    color += u.palette1.rgb * flux * (0.24 + bloom * 0.18);
    color += u.palette3.rgb * max(coil, spikes) * 0.5;
  } else if (sceneGroup == 5.0) {
    color = mix(color, u.palette1.rgb, beam * bloom);
    color += u.palette3.rgb * rings * 0.24 * commonGain;
  } else if (sceneGroup == 6.0) {
    let tube = smoothstep(0.34, 0.28, abs(p.y + sin(p.x * 3.8) * 0.04));
    let pressure = stripe(length((p - vec2f(-0.1, 0.0)) * vec2f(1.0, 0.68)) * 7.0 - t * (0.7 + motion * 0.45), 0.028);
    let nodes = stripe(p.x * 7.0 + sin(p.y * 4.0), 0.032) * tube;
    color = mix(color, u.palette2.rgb, 0.22);
    color += u.palette1.rgb * tube * 0.28;
    color += u.palette3.rgb * max(pressure, nodes) * (0.22 + bloom * 0.18);
  } else if (sceneGroup == 7.0 || sceneGroup == 13.0 || sceneGroup == 14.0) {
    color = mix(color, u.palette1.rgb, branch * 0.46);
    color += u.palette3.rgb * rings * 0.12 * commonGain;
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
    let fluidSignal = atomAt(1);
    let feedbackSignal = atomAt(3);
    let signalSignal = atomAt(22);
    let loopUv = (p - vec2f(0.06, 0.04)) * vec2f(1.1, 0.72);
    let loopRadius = length(loopUv);
    let loopAngle = atan2(loopUv.y, loopUv.x);
    let rows = max(
      stripe(p.x * 8.0 + sin(p.y * 5.0 + t * 0.72) * 0.22, 0.035),
      stripe((p.x - p.y) * 5.0 - t * 0.38, 0.028)
    );
    let nutrientLoop = exp(-abs(loopRadius - 0.45) * 18.0);
    let loopPulse = stripe(loopAngle * 3.0 + t * (0.92 + motion * 0.38), 0.05) * nutrientLoop;
    let waterLane = stripe(loopAngle * 5.0 - t * (1.28 + fluidSignal * 0.34), 0.038) * nutrientLoop;
    let compostCenter = vec2f(-0.52 + sin(t * 0.54) * 0.025, 0.32 + cos(t * 0.46) * 0.02);
    let compost = exp(-dot(p - compostCenter, p - compostCenter) * 18.0);
    let heatBreath = 0.52 + 0.48 * sin(t * 1.18 + p.y * 4.0);
    let gasBubbles = starParticleField(p + vec2f(0.0, t * 0.09), t, 0.12 + fluidSignal * 0.16) * smoothstep(0.68, 0.05, length(p - compostCenter));
    color = mix(color, u.palette1.rgb, rows * 0.3 + nutrientLoop * 0.24 + loopPulse * 0.38);
    color += vec3f(0.18, 0.74, 1.0) * waterLane * (0.3 + fluidSignal * 0.42);
    color += u.palette3.rgb * compost * (0.14 + heat * (0.22 + heatBreath * 0.36));
    color += vec3f(0.9, 1.0, 0.38) * gasBubbles * (0.18 + signalSignal * 0.34);
    color += vec3f(0.2, 0.95, 0.42) * atomFeedbackArcs(p + vec2f(sin(t * 0.42) * 0.08, cos(t * 0.36) * 0.05), t) * max(feedbackSignal, 0.24) * 0.26;
  } else if (sceneGroup == 21.0) {
    let bowl = exp(-abs(p.y - (0.42 * p.x * p.x - 0.42)) * 22.0);
    let trajectory = exp(-abs(length((p - vec2f(sin(t * 0.4) * 0.42, -0.1 + cos(t * 0.4) * 0.16)) * vec2f(1.2, 1.8)) - 0.18) * 24.0);
    let friction = stripe(p.x * 9.0 + p.y * 3.0 + t * 0.25, 0.03);
    color = mix(color, u.palette1.rgb, bowl * 0.5 + trajectory * 0.42);
    color += u.palette3.rgb * friction * smoothstep(0.8, 0.05, abs(p.y + 0.48)) * 0.18;
  } else if (sceneGroup == 22.0) {
    let strata = max(stripe(p.y * 9.0 + sin(p.x * 3.0) * 0.08, 0.045), stripe((p.x - p.y) * 4.0, 0.03));
    let cracks = exp(-abs(sin(p.x * 10.0 + p.y * 6.0 + t * 0.08)) * 8.0);
    color = mix(color, u.palette1.rgb, strata * 0.035);
    color += u.palette3.rgb * cracks * 0.035;
  } else if (sceneGroup == 33.0) {
    let flame = atomThermalPlume(p * vec2f(0.82, 1.08) + vec2f(sin(t * 0.38) * 0.08, -0.1), t);
    let soot = stripe(p.y * 6.0 + sin(p.x * 5.0 + t * 0.25) * 0.5 - t * 0.18, 0.036) * smoothstep(-0.85, 0.65, p.y);
    let ember = starParticleField(p + vec2f(0.0, t * 0.1), t, 0.12 + heat * 0.2);
    color = mix(vec3f(0.08, 0.035, 0.02), u.palette2.rgb, smoothstep(0.2, 0.95, p.y) * 0.5);
    color += vec3f(1.0, 0.22, 0.04) * flame * (0.5 + heat * 0.44);
    color += vec3f(0.95, 0.58, 0.12) * ember * 0.36;
    color = mix(color, vec3f(0.025, 0.025, 0.03), soot * 0.28);
  } else if (sceneGroup == 34.0) {
    let loopA = ellipseRing(p, vec2f(-0.26, 0.04), vec2f(0.85, 1.36), 0.42, 0.034);
    let loopB = ellipseRing(p, vec2f(0.36, -0.08), vec2f(1.2, 0.82), 0.33, 0.028);
    let film = smoothstep(0.72, 0.08, length((p - vec2f(0.02, -0.02)) * vec2f(0.74, 1.05)));
    let phaseBands = 0.5 + 0.5 * sin((p.x * 11.0 + p.y * 7.0) + sin(p.y * 6.0 + t * 0.35) * 1.4);
    let rainbow = vec3f(
      0.56 + 0.44 * sin(phaseBands * 6.28318 + 0.0),
      0.56 + 0.44 * sin(phaseBands * 6.28318 + 2.09),
      0.56 + 0.44 * sin(phaseBands * 6.28318 + 4.18)
    );
    let bubbles = max(
      ellipseRing(p, vec2f(-0.34, -0.18 + sin(t * 0.5) * 0.03), vec2f(1.0), 0.12, 0.025),
      ellipseRing(p, vec2f(0.28, 0.2 + cos(t * 0.42) * 0.035), vec2f(0.9, 1.2), 0.095, 0.022)
    );
    color = mix(vec3f(0.98, 0.98, 1.0), rainbow, film * (0.36 + bloom * 0.24));
    color += vec3f(0.1, 0.12, 0.16) * max(loopA, loopB) * 0.78;
    color += u.palette3.rgb * bubbles * 0.52;
  } else {
    color = mix(color, u.palette1.rgb, max(rings * 0.12, waves * 0.1) * commonGain);
    color += u.palette3.rgb * plume * 0.06 * commonGain;
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
  color += u.palette1.rgb * network * atomNetworkPressure(p, t) * 0.14;
  color += u.palette3.rgb * orbit * stripe(length(p) * 4.2 - t * 0.15, 0.026) * 0.2;
  color += u.palette1.rgb * bio * exp(-abs(sin(p.x * 6.0 + p.y * 3.0 + t * 0.12)) * 5.0) * 0.1;
  color += u.palette3.rgb * wave * stripe(length(p) * 6.0 - t * 0.55, 0.024) * 0.17;
  return mix(base, color, clamp(f + 0.24, 0.0, 1.0));
}

fn atomThermalPlume(p: vec2f, t: f32) -> f32 {
  let plume = exp(-abs(p.x + sin(p.y * 5.5 + t * 0.65) * 0.12) * 9.0);
  return plume * smoothstep(-0.9, 0.7, p.y);
}

fn atomFluidRibbons(p: vec2f, t: f32) -> f32 {
  return stripe(p.x * 6.0 + sin(p.y * 5.0 + t * 0.42) * 0.55, 0.035);
}

fn atomStressCracks(p: vec2f, t: f32) -> f32 {
  let branch = abs(sin(p.x * 11.0 + p.y * 7.0 + sin(p.y * 4.0 + t * 0.1)));
  return (1.0 - smoothstep(0.02, 0.18, branch)) * smoothstep(0.95, 0.08, length(p));
}

fn atomFeedbackArcs(p: vec2f, t: f32) -> f32 {
  let a = atan2(p.y, p.x) / 6.28318;
  let ring = 1.0 - smoothstep(0.02, 0.06, abs(length(p) - 0.62));
  return ring * stripe(a * 5.0 - t * 0.18, 0.045);
}

fn atomQuantumFringes(p: vec2f, t: f32) -> f32 {
  let fringe = sin(p.x * 18.0 + sin(p.y * 9.0 + t * 0.35) * 1.2);
  return (0.5 + 0.5 * fringe) * smoothstep(0.92, 0.05, length(p * vec2f(1.2, 0.8)));
}

fn atomNetworkPressure(p: vec2f, t: f32) -> f32 {
  let road = max(capsuleLine(p, vec2f(-0.84, -0.32), vec2f(0.76, 0.24), 0.026),
    capsuleLine(p, vec2f(-0.62, 0.38), vec2f(0.72, -0.2), 0.022));
  let pulse = stripe((p.x + p.y) * 5.0 - t * 0.72, 0.03);
  let node = max(exp(-dot(p - vec2f(-0.48, -0.14), p - vec2f(-0.48, -0.14)) * 38.0),
    exp(-dot(p - vec2f(0.44, 0.2), p - vec2f(0.44, 0.2)) * 34.0));
  return max(road * (0.45 + pulse * 0.42), node * (0.82 + pulse * 0.18));
}

fn diskMask(p: vec2f, c: vec2f, r: f32) -> f32 {
  return 1.0 - smoothstep(r, r + 0.035, length(p - c));
}

fn rectMask(p: vec2f, c: vec2f, s: vec2f) -> f32 {
  let d = abs(p - c) - s;
  return 1.0 - smoothstep(0.0, 0.035, max(d.x, d.y));
}

fn capsuleLine(p: vec2f, a: vec2f, b: vec2f, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return 1.0 - smoothstep(r, r + 0.025, length(pa - ba * h));
}

fn hash11(x: f32) -> f32 {
  return fract(sin(x * 127.1 + u.motion.z * 311.7) * 43758.5453123);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p + vec2f(u.motion.z, u.motion.w), vec2f(127.1, 311.7))) * 43758.5453123);
}

fn filmNoise(p: vec2f, t: f32) -> f32 {
  let a = sin(p.x * 81.0 + p.y * 37.0 + t * 0.7);
  let b = sin(p.x * 19.0 - p.y * 61.0 + t * 0.37);
  return 0.5 + 0.25 * a + 0.25 * b;
}

fn orb3d(p: vec2f, c: vec2f, r: f32, albedo: vec3f, emissive: vec3f, roughness: f32) -> vec4f {
  let q = (p - c) / max(r, 0.001);
  let d = dot(q, q);
  if (d > 1.0) { return vec4f(0.0); }
  let z = sqrt(max(0.0, 1.0 - d));
  let n = normalize(vec3f(q.x, q.y, z));
  let light = normalize(vec3f(-0.42, 0.58, 0.72));
  let fill = normalize(vec3f(0.58, -0.32, 0.48));
  let view = vec3f(0.0, 0.0, 1.0);
  let key = max(dot(n, light), 0.0);
  let rim = pow(clamp(1.0 - max(dot(n, view), 0.0), 0.0, 1.0), 2.2);
  let spec = pow(max(dot(reflect(-light, n), view), 0.0), mix(18.0, 72.0, clamp(1.0 - roughness, 0.0, 1.0)));
  let fillLight = max(dot(n, fill), 0.0) * 0.24;
  let shade = albedo * (0.18 + key * 0.86 + fillLight) + vec3f(1.0) * spec * 0.38 + u.palette3.rgb * rim * 0.22 + emissive;
  let mask = 1.0 - smoothstep(0.94, 1.0, d);
  return vec4f(shade, mask);
}

fn panel3d(p: vec2f, c: vec2f, s: vec2f, albedo: vec3f, glow: vec3f) -> vec4f {
  let q = (p - c) / max(s, vec2f(0.001));
  let d = max(abs(q.x), abs(q.y));
  let mask = 1.0 - smoothstep(0.96, 1.02, d);
  let bevel = 1.0 - smoothstep(0.72, 1.0, d);
  let line = max(stripe((q.x + 1.0) * 6.0, 0.028), stripe((q.y + 1.0) * 4.0, 0.028));
  let shade = albedo * (0.36 + bevel * 0.42) + glow * line * 0.42 + vec3f(1.0) * pow(max(0.0, 1.0 - d), 3.0) * 0.08;
  return vec4f(shade, mask);
}

fn blendLayer(base: vec3f, layer: vec4f) -> vec3f {
  return mix(base, layer.rgb, clamp(layer.a, 0.0, 1.0));
}

fn perspectiveFloor(p: vec2f, t: f32) -> f32 {
  let horizon = p.y + 0.92;
  let depth = 1.0 / max(0.09, horizon);
  let xLine = stripe(p.x * depth * 1.8 + t * 0.018, 0.016);
  let zLine = stripe(depth * 0.72 - t * 0.035, 0.014);
  let fade = smoothstep(0.34, -0.84, p.y) * smoothstep(-1.08, -0.28, p.y);
  return max(xLine, zLine) * fade;
}

fn ellipseRing(p: vec2f, c: vec2f, s: vec2f, radius: f32, width: f32) -> f32 {
  let q = (p - c) * s;
  return 1.0 - smoothstep(width, width + 0.035, abs(length(q) - radius));
}

fn starParticleField(p: vec2f, t: f32, amount: f32) -> f32 {
  let cell = floor((p + vec2f(1.4, 1.0)) * vec2f(22.0, 16.0));
  let local = fract((p + vec2f(1.4, 1.0)) * vec2f(22.0, 16.0)) - vec2f(0.5);
  let rnd = hash21(cell);
  let sparkle = 1.0 - smoothstep(0.015, 0.09, length(local + vec2f(sin(rnd * 8.0), cos(rnd * 11.0)) * 0.13));
  return sparkle * step(1.0 - amount, rnd) * (0.55 + 0.45 * sin(t * (1.2 + rnd) + rnd * 6.28318));
}

fn cinematic3dScene(p: vec2f, t: f32, scene: f32, base: vec3f) -> vec3f {
  let sceneGroup = floor(scene);
  let heat = u.params.x;
  let flow = u.params.y;
  let density = u.params.z;
  let bloom = u.params.w;
  let motion = u.motion.x;
  let variant = hash11(sceneGroup + floor(u.motion.z * 997.0));
  let floorGlow = perspectiveFloor(p, t);
  let fog = filmNoise(p * (1.4 + variant), t) * smoothstep(1.45, 0.12, length(p));
  var color = base;
  color = mix(color, mix(u.palette2.rgb, u.palette0.rgb, 0.18), 0.18 + fog * 0.08);

  let thermal = max(atomAt(0), atomAt(14));
  let fluid = atomAt(1);
  let stress = atomAt(2);
  let feedback = atomAt(3);
  let orbital = atomAt(4);
  let em = atomAt(5);
  let optical = atomAt(6);
  let quantum = atomAt(7);
  let acoustic = atomAt(8);
  let bio = atomAt(9);
  let chemical = atomAt(10);
  let network = atomAt(11);
  let granular = atomAt(12);
  let instrument = max(atomAt(13), atomAt(17));
  let phase = atomAt(15);
  let robot = atomAt(16);
  let constraint = atomAt(21);
  let signal = atomAt(22);
  let gridFeature = featureAt(40);
  let robotFeature = max(featureAt(38), featureAt(41));
  let factoryFeature = featureAt(42);
  let quantumFeature = featureAt(43);
  let agroFeature = featureAt(44);
  let particleFeature = featureAt(45);
  let civicFeature = featureAt(46);
  let hazardFeature = featureAt(47);
  let atomSpecific = clamp(max(max(max(robot, quantum), max(chemical, granular)), max(max(network, optical), max(bio, orbital))), 0.0, 1.0);
  let networkLocal = network * (1.0 - clamp(max(max(robot, chemical), max(granular, fluid)) * 0.82, 0.0, 0.92));
  let literalScene = 0.0;
  let commonOverlay = 1.0 - literalScene;
  color += u.palette1.rgb * floorGlow * (0.025 + flow * 0.06) * (1.0 - atomSpecific * 0.78);

  if (sceneGroup == 10.0 || orbital > 0.36) {
    color = mix(color, vec3f(0.015, 0.022, 0.06), 0.42);
    color += vec3f(0.8, 0.94, 1.0) * starParticleField(p, t, 0.16 + density * 0.18) * 0.72;
    color = blendLayer(color, orb3d(p, vec2f(-0.28, -0.04), 0.36, u.palette1.rgb * 0.72, u.palette3.rgb * 0.02, 0.44));
    color = blendLayer(color, orb3d(p, vec2f(0.52, 0.2), 0.12, u.palette0.rgb * 0.8, u.palette3.rgb * 0.04, 0.32));
    color += u.palette3.rgb * ellipseRing(rot(p - vec2f(-0.28, -0.04), 0.18), vec2f(0.0), vec2f(0.75, 2.8), 0.58, 0.035) * 0.56;
  } else if (sceneGroup == 4.0) {
    color = mix(color, vec3f(0.012, 0.018, 0.036), 0.52);
    let dish = smoothstep(0.7, 0.08, length((p - vec2f(0.02, -0.08)) * vec2f(0.9, 1.25)));
    let coilA = ellipseRing(p, vec2f(-0.46, -0.08), vec2f(1.2, 0.74), 0.22, 0.035);
    let coilB = ellipseRing(p, vec2f(0.48, -0.08), vec2f(1.2, 0.74), 0.22, 0.035);
    let fluxA = stripe(atan2(p.y + 0.08, p.x) * 5.0 + length(p) * 3.5 - t * (0.22 + motion * 0.16), 0.028) * dish;
    let spikes = pow(max(0.0, sin(atan2(p.y + 0.06, p.x - 0.02) * 18.0 + t * 0.85)), 7.0) *
      smoothstep(0.62, 0.06, length((p - vec2f(0.02, -0.05)) * vec2f(1.0, 0.76)));
    color += vec3f(0.05, 0.1, 0.16) * dish * 0.48;
    color += vec3f(0.32, 0.62, 1.0) * fluxA * (0.32 + em * 0.44);
    color += vec3f(0.95, 0.18, 0.82) * spikes * (0.38 + bloom * 0.24);
    color += vec3f(0.98, 0.75, 0.36) * max(coilA, coilB) * 0.68;
  } else if (sceneGroup == 12.0) {
    color = mix(color, vec3f(0.015, 0.018, 0.04), 0.44);
    color += vec3f(0.86, 0.2, 1.0) * ellipseRing(p, vec2f(0.0, 0.02), vec2f(1.2, 0.72), 0.52, 0.04) * 0.72;
    color += vec3f(0.18, 0.92, 1.0) * stripe(atan2(p.y, p.x) * 4.0 + length(p) * 3.0 - t * 0.28, 0.032) * smoothstep(0.95, 0.08, length(p)) * 0.42;
    color = blendLayer(color, panel3d(p, vec2f(0.0, -0.5), vec2f(0.72, 0.12), vec3f(0.06, 0.08, 0.12), u.palette1.rgb));
  } else if (sceneGroup == 15.0 || sceneGroup == 32.0 || particleFeature > 0.18) {
    color = mix(color, vec3f(0.006, 0.04, 0.055), 0.68);
    let tank = diskMask(p, vec2f(0.0, -0.02), 0.62);
    let wall = ellipseRing(p, vec2f(0.0, -0.02), vec2f(0.72, 1.12), 0.62, 0.035);
    let track = capsuleLine(p, vec2f(-0.78, 0.28), vec2f(0.72, -0.22), 0.018);
    let trackPhase = t * (0.7 + motion * 0.46);
    let muonTrackA = capsuleLine(
      p,
      vec2f(-0.86, -0.34 + sin(trackPhase) * 0.18),
      vec2f(0.86, 0.3 + cos(trackPhase * 0.84) * 0.18),
      0.025
    );
    let muonTrackB = capsuleLine(
      p,
      vec2f(-0.76, 0.38 + cos(trackPhase * 0.72) * 0.14),
      vec2f(0.68, -0.42 + sin(trackPhase * 0.9) * 0.12),
      0.018
    );
    let fieldSweep = stripe(atan2(p.y, p.x) * 4.0 + length(p) * 3.2 - t * (0.92 + em * 0.36), 0.028) *
      smoothstep(0.78, 0.12, length(p));
    let hitCenter = vec2f(-0.7 + fract(t * (0.52 + motion * 0.32)) * 1.4, 0.24 + sin(t * 1.18) * 0.2);
    let travellingHit = diskMask(p, hitCenter, 0.075);
    let calorimeterPulse = stripe(p.x * 9.0 + t * (1.2 + heat * 0.44), 0.044) *
      smoothstep(0.72, 0.28, abs(p.y + 0.52));
    let coneA = exp(-abs(rot(p - vec2f(-0.14, 0.08), 0.34).y) * 20.0) *
      smoothstep(0.62, -0.08, length(p - vec2f(-0.14, 0.08)));
    let coneB = exp(-abs(rot(p - vec2f(0.12, -0.02), -0.48).y) * 18.0) *
      smoothstep(0.58, -0.06, length(p - vec2f(0.12, -0.02)));
    let pmt = max(max(max(
      diskMask(p, vec2f(-0.5, 0.38), 0.045),
      diskMask(p, vec2f(-0.24, 0.51), 0.045)),
      max(diskMask(p, vec2f(0.08, 0.54), 0.045), diskMask(p, vec2f(0.4, 0.42), 0.045))),
      max(diskMask(p, vec2f(-0.52, -0.38), 0.045), diskMask(p, vec2f(0.52, -0.32), 0.045)));
    color = mix(color, vec3f(0.03, 0.22, 0.26), tank * 0.34);
    color += vec3f(0.42, 0.96, 1.0) * wall * 0.66;
    color += vec3f(0.78, 1.0, 0.96) * max(coneA, coneB) * 0.28;
    color += vec3f(0.92, 1.0, 0.9) * track * 0.82;
    color += vec3f(0.74, 1.0, 0.98) * max(muonTrackA, muonTrackB) * (0.52 + instrument * 0.36);
    color += vec3f(0.22, 0.88, 1.0) * fieldSweep * (0.24 + em * 0.44);
    color += vec3f(1.0, 0.32, 0.08) * calorimeterPulse * (0.16 + thermal * 0.38);
    color += vec3f(1.0, 0.95, 0.5) * travellingHit * (0.46 + signal * 0.42);
    color += vec3f(0.18, 0.82, 1.0) * pmt * (0.54 + stripe(t + length(p) * 3.0, 0.05) * 0.28);
  } else if (sceneGroup == 23.0 || sceneGroup == 27.0) {
    let shelfEdge = p.y + 0.18 + sin(p.x * 2.5 + t * 0.18) * 0.08;
    let shelf = smoothstep(0.07, 0.0, abs(shelfEdge));
    let waterColumn = smoothstep(-0.98, -0.12, p.y) * (1.0 - smoothstep(0.44, 0.82, p.y));
    let waveBands = stripe(p.y * 8.5 + sin(p.x * 4.2 + t * 1.25) * 0.62 - t * 1.1, 0.036) * waterColumn;
    let foamBands = stripe((p.x - p.y) * 6.0 + sin(p.y * 5.0 - t * 1.6) - t * 0.74, 0.028) * waterColumn;
    let icebergA = rectMask(rot(p - vec2f(-0.38 + sin(t * 0.62) * 0.08, -0.05 + cos(t * 0.41) * 0.04), -0.18), vec2f(0.0), vec2f(0.16, 0.08));
    let icebergB = rectMask(rot(p - vec2f(0.32 - sin(t * 0.52) * 0.1, -0.28 + sin(t * 0.46) * 0.05), 0.24), vec2f(0.0), vec2f(0.13, 0.07));
    let calvingShard = rectMask(rot(p - vec2f(0.04 + sin(t * 0.9) * 0.16, 0.05 - fract(t * 0.2) * 0.54), 0.52), vec2f(0.0), vec2f(0.075, 0.05));
    color = mix(color, vec3f(0.02, 0.18, 0.32), waterColumn * 0.48);
    color += vec3f(0.35, 0.8, 1.0) * atomFluidRibbons(p, t) * 0.34;
    color += vec3f(0.36, 0.92, 1.0) * waveBands * (0.28 + max(acoustic, fluid) * 0.38);
    color += vec3f(0.92, 0.98, 1.0) * foamBands * (0.18 + acoustic * 0.34);
    color += vec3f(0.92, 0.98, 1.0) * shelf * 0.62;
    color += vec3f(0.88, 0.97, 1.0) * max(max(icebergA, icebergB), calvingShard) * 0.72;
    color += vec3f(0.55, 0.92, 1.0) * starParticleField(p + vec2f(t * 0.08, -t * 0.05), t, 0.1 + acoustic * 0.14) * waterColumn * 0.3;
    color += vec3f(0.2, 1.0, 0.58) * branchWeb(p + vec2f(0.18, -0.24), t) * 0.14;
  } else if (sceneGroup == 24.0) {
    color = blendLayer(color, panel3d(p, vec2f(0.0, -0.08), vec2f(0.86, 0.14), vec3f(0.11, 0.12, 0.13), u.palette1.rgb));
    color += vec3f(0.8, 0.9, 1.0) * capsuleLine(p, vec2f(-0.82, 0.22), vec2f(0.82, 0.22 + sin(t * 0.4) * 0.04), 0.035) * 0.52;
    color += vec3f(1.0, 0.54, 0.18) * atomStressCracks(p, t) * 0.42;
    color += vec3f(0.32, 0.74, 1.0) * stripe(p.x * 10.0 + sin(p.y * 8.0 + t * 0.32), 0.025) * smoothstep(0.82, 0.12, abs(p.y)) * 0.18;
  } else if (sceneGroup == 6.0) {
    color = mix(color, vec3f(0.018, 0.045, 0.07), 0.46);
    let tube = capsuleLine(p, vec2f(-0.82, -0.02), vec2f(0.82, -0.02 + sin(t * 0.2) * 0.03), 0.09);
    let mouthA = ellipseRing(p, vec2f(-0.72, -0.02), vec2f(1.0, 0.68), 0.16, 0.03);
    let mouthB = ellipseRing(p, vec2f(0.72, -0.02), vec2f(1.0, 0.68), 0.16, 0.03);
    let ringA = stripe(length((p - vec2f(-0.36, 0.02)) * vec2f(1.0, 0.72)) * 8.5 - t * (1.1 + motion * 0.36), 0.026);
    let ringB = stripe(length((p - vec2f(0.28, 0.0)) * vec2f(1.0, 0.72)) * 8.0 - t * (1.0 + motion * 0.3), 0.026);
    let levitatedDust = starParticleField(p + vec2f(sin(t * 0.24) * 0.04, 0.0), t, 0.12 + acoustic * 0.2) *
      smoothstep(0.34, 0.02, abs(p.y + sin(p.x * 5.0 + t * 0.5) * 0.04));
    color += vec3f(0.36, 0.74, 1.0) * tube * 0.48;
    color += vec3f(0.82, 0.92, 1.0) * max(mouthA, mouthB) * 0.58;
    color += u.palette3.rgb * max(ringA, ringB) * (0.24 + acoustic * 0.46);
    color += vec3f(1.0, 0.9, 0.42) * levitatedDust * 0.5;
  } else if (sceneGroup == 13.0) {
    color = mix(color, vec3f(0.025, 0.055, 0.035), 0.58);
    let energy = stripe(p.y * 5.2 + sin(p.x * 4.8 + t * 0.12) * 0.48, 0.026) *
      smoothstep(1.0, 0.08, length(p * vec2f(0.85, 1.15)));
    let bondA = capsuleLine(p, vec2f(-0.56, 0.18), vec2f(-0.24, -0.08), 0.035);
    let bondB = capsuleLine(p, vec2f(-0.24, -0.08), vec2f(0.08, 0.14), 0.035);
    let bondC = capsuleLine(p, vec2f(0.08, 0.14), vec2f(0.38, -0.1), 0.035);
    let bondD = capsuleLine(p, vec2f(0.38, -0.1), vec2f(0.62, 0.18), 0.032);
    let chain = max(max(bondA, bondB), max(bondC, bondD));
    color += vec3f(0.2, 0.95, 0.42) * energy * 0.26;
    color += vec3f(0.78, 0.95, 0.86) * chain * 0.72;
    color = blendLayer(color, orb3d(p, vec2f(-0.56, 0.18), 0.09, vec3f(0.5, 0.95, 0.36), u.palette3.rgb * 0.02, 0.58));
    color = blendLayer(color, orb3d(p, vec2f(-0.24, -0.08), 0.105, vec3f(0.75, 0.95, 0.58), u.palette3.rgb * 0.02, 0.5));
    color = blendLayer(color, orb3d(p, vec2f(0.08, 0.14), 0.095, vec3f(0.98, 0.78, 0.42), u.palette3.rgb * 0.03, 0.42));
    color = blendLayer(color, orb3d(p, vec2f(0.38, -0.1), 0.1, vec3f(0.62, 0.82, 1.0), u.palette3.rgb * 0.02, 0.46));
    color = blendLayer(color, orb3d(p, vec2f(0.62, 0.18), 0.08, vec3f(0.96, 0.55, 0.74), u.palette3.rgb * 0.03, 0.5));
    color += vec3f(1.0, 0.82, 0.26) * max(max(ellipseRing(p, vec2f(-0.24, -0.08), vec2f(1.0), 0.18, 0.02),
      ellipseRing(p, vec2f(0.38, -0.1), vec2f(1.0), 0.16, 0.02)), chain * stress * 0.24) * 0.32;
  } else if (sceneGroup == 25.0 || sceneGroup == 26.0) {
    let terrain = smoothstep(0.09, 0.0, abs(p.y + 0.42 + sin(p.x * 3.0) * 0.09));
    color = mix(color, vec3f(0.04, 0.18, 0.08), (1.0 - smoothstep(-0.74, -0.1, p.y)) * 0.38);
    color += vec3f(0.18, 0.72, 0.32) * branchWeb(p + vec2f(0.12, 0.18), t) * 0.42;
    color += vec3f(0.1, 0.58, 0.95) * atomFluidRibbons(p - vec2f(0.0, 0.2), t) * 0.24;
    color += vec3f(0.78, 0.56, 0.22) * terrain * 0.46;
  } else if (sceneGroup == 28.0 || sceneGroup == 29.0 || sceneGroup == 30.0 || civicFeature > 0.18) {
    color = vec3f(0.035, 0.048, 0.058);
    let roadA = capsuleLine(p, vec2f(-0.86, -0.18), vec2f(0.84, 0.24), 0.026);
    let roadB = capsuleLine(p, vec2f(-0.5, 0.58), vec2f(0.44, -0.54), 0.023);
    let pressure = smoothstep(0.86, 0.06, length((p - vec2f(0.18, 0.05)) * vec2f(0.9, 1.2)));
    let parcelA = rectMask(p, vec2f(-0.54, 0.24), vec2f(0.18, 0.16));
    let parcelB = rectMask(p, vec2f(-0.12, 0.16), vec2f(0.17, 0.14));
    let parcelC = rectMask(p, vec2f(0.32, 0.22), vec2f(0.2, 0.15));
    let parcelD = rectMask(p, vec2f(-0.38, -0.3), vec2f(0.2, 0.15));
    let parcelE = rectMask(p, vec2f(0.14, -0.28), vec2f(0.18, 0.16));
    let parcels = max(max(parcelA, parcelB), max(max(parcelC, parcelD), parcelE));
    let agents = max(max(diskMask(p, vec2f(-0.2, -0.02), 0.035), diskMask(p, vec2f(0.46, -0.12), 0.035)),
      max(diskMask(p, vec2f(-0.62, -0.05), 0.035), diskMask(p, vec2f(0.08, 0.42), 0.035)));
    color += vec3f(0.08, 0.16, 0.22) * parcels * 0.74;
    color += vec3f(0.95, 0.2, 0.16) * pressure * parcels * 0.36;
    color += vec3f(0.2, 0.58, 1.0) * max(roadA, roadB) * 0.58;
    color += vec3f(1.0, 0.78, 0.18) * agents * 0.86;
    color += vec3f(0.92, 0.22, 0.18) * atomFeedbackArcs(p * vec2f(1.2, 0.9), t) * networkLocal * 0.22;
  } else if (sceneGroup == 31.0 || hazardFeature > 0.18) {
    let front = smoothstep(0.05, 0.0, abs(p.y - sin(p.x * 3.2 + t * 0.2) * 0.22));
    let exposure = stripe(length(p - vec2f(-0.22, -0.1)) * 5.2 - t * 0.24, 0.035);
    color = mix(color, vec3f(0.18, 0.05, 0.035), 0.28);
    color += vec3f(1.0, 0.22, 0.05) * front * 0.48;
    color += vec3f(0.2, 0.72, 1.0) * exposure * 0.3;
    color += vec3f(0.02, 0.02, 0.025) * starParticleField(p, t, 0.18) * 0.34;
  } else if (sceneGroup == 17.0 || robot > 0.34 || robotFeature > 0.18) {
    let base = panel3d(p, vec2f(0.0, -0.04), vec2f(0.82, 0.56), vec3f(0.055, 0.065, 0.075), u.palette1.rgb);
    let conveyor = panel3d(p, vec2f(0.02, -0.52), vec2f(0.86, 0.11), vec3f(0.09, 0.1, 0.11), u.palette3.rgb);
    color = blendLayer(color, base);
    color = blendLayer(color, conveyor);
    color += vec3f(0.9, 0.95, 1.0) * capsuleLine(p, vec2f(-0.5, 0.24), vec2f(0.04, -0.02), 0.058) * 0.54;
    color += vec3f(0.9, 0.95, 1.0) * capsuleLine(p, vec2f(0.04, -0.02), vec2f(0.52, 0.18 + sin(t) * 0.04), 0.048) * 0.56;
    color += u.palette3.rgb * diskMask(p, vec2f(0.56, 0.18 + sin(t) * 0.04), 0.085) * 0.58;
    color += vec3f(1.0, 0.46, 0.16) * max(rectMask(p, vec2f(-0.42, -0.5), vec2f(0.11, 0.075)), rectMask(p, vec2f(0.34, -0.49), vec2f(0.13, 0.085))) * 0.52;
  } else if (sceneGroup == 33.0) {
    color = mix(color, vec3f(0.085, 0.035, 0.02), 0.54);
    let fuelBed = panel3d(p, vec2f(0.0, -0.58), vec2f(0.84, 0.12), vec3f(0.16, 0.06, 0.025), vec3f(1.0, 0.18, 0.04));
    let flameA = atomThermalPlume(p * vec2f(0.84, 1.1) + vec2f(-0.18 + sin(t * 0.42) * 0.08, -0.18), t);
    let flameB = atomThermalPlume(p * vec2f(1.05, 0.96) + vec2f(0.18 + cos(t * 0.37) * 0.08, -0.1), t + 1.7);
    let smoke = stripe(p.y * 5.5 + sin(p.x * 4.2 + t * 0.18) * 0.75 - t * 0.16, 0.03) *
      smoothstep(-0.18, 0.82, p.y);
    let embers = starParticleField(p + vec2f(0.0, t * 0.1), t, 0.14 + thermal * 0.2);
    color = blendLayer(color, fuelBed);
    color += vec3f(1.0, 0.18, 0.035) * max(flameA, flameB) * (0.52 + heat * 0.42);
    color += vec3f(1.0, 0.68, 0.14) * embers * 0.42;
    color = mix(color, vec3f(0.025, 0.027, 0.032), smoke * 0.3);
  } else if (sceneGroup == 19.0 || quantum > 0.3 || quantumFeature > 0.18) {
    color = blendLayer(color, panel3d(p, vec2f(0.0, -0.02), vec2f(0.72, 0.42), vec3f(0.1, 0.08, 0.22), u.palette1.rgb));
    color += u.palette3.rgb * atomQuantumFringes(p, t) * (0.4 + bloom * 0.26);
    color += u.palette1.rgb * ellipseRing(p, vec2f(-0.2, 0.02), vec2f(1.4, 0.82), 0.36, 0.025) * 0.52;
    color += vec3f(1.0, 0.65, 0.95) * exp(-abs(rot(p, -0.26).y) * 64.0) * 0.28;
  } else if (sceneGroup == 34.0) {
    color = mix(color, vec3f(0.96, 0.98, 1.0), 0.32);
    let filmBody = smoothstep(0.78, 0.08, length((p - vec2f(0.02, -0.02)) * vec2f(0.68, 1.04)));
    let wireA = ellipseRing(p, vec2f(-0.28, 0.02), vec2f(0.82, 1.28), 0.42, 0.034);
    let wireB = ellipseRing(p, vec2f(0.38, -0.1), vec2f(1.14, 0.82), 0.34, 0.028);
    let phaseField = p.x * 9.0 + p.y * 6.0 + sin(p.y * 8.0 + t * 0.38) * 1.2 + t * 0.12;
    let band = 0.5 + 0.5 * sin(phaseField);
    let spectral = vec3f(
      0.58 + 0.42 * sin(phaseField + 0.0),
      0.58 + 0.42 * sin(phaseField + 2.09),
      0.58 + 0.42 * sin(phaseField + 4.18)
    );
    let bubbleA = ellipseRing(p, vec2f(-0.36, -0.18 + sin(t * 0.48) * 0.04), vec2f(1.0, 1.0), 0.13, 0.026);
    let bubbleB = ellipseRing(p, vec2f(0.22, 0.2 + cos(t * 0.42) * 0.04), vec2f(0.86, 1.18), 0.1, 0.023);
    let caustic = exp(-abs(rot(p, 0.32).y) * 46.0) * smoothstep(-0.7, 0.7, p.x);
    color = mix(color, spectral, filmBody * (0.34 + optical * 0.38 + phase * 0.24));
    color += vec3f(0.08, 0.1, 0.14) * max(wireA, wireB) * 0.86;
    color += vec3f(1.0, 0.96, 0.82) * caustic * 0.22;
    color += u.palette3.rgb * max(bubbleA, bubbleB) * (0.42 + band * 0.18);
  } else if (sceneGroup == 5.0 || optical > 0.34) {
    color = mix(color, vec3f(0.02, 0.035, 0.065), 0.38);
    color = blendLayer(color, orb3d(p, vec2f(0.08, -0.02), 0.28, vec3f(0.72, 0.88, 1.0), u.palette3.rgb * 0.03, 0.12));
    color += vec3f(1.0, 0.96, 0.78) * exp(-abs(rot(p, 0.17).y) * 70.0) * 0.46;
    color += u.palette3.rgb * ellipseRing(rot(p - vec2f(0.12, -0.02), 0.28), vec2f(0.0), vec2f(1.0, 1.8), 0.48, 0.03) * 0.44;
  } else if (sceneGroup == 8.0 || chemical > 0.32 || (fluid > 0.56 && instrument > 0.16)) {
    color = mix(color, vec3f(0.012, 0.115, 0.13), 0.46);
    let channel = max(capsuleLine(p, vec2f(-0.78, -0.08), vec2f(0.78, -0.08), 0.07),
      capsuleLine(p, vec2f(-0.2, -0.54), vec2f(0.36, 0.48), 0.055));
    color += vec3f(0.18, 0.98, 0.88) * channel * (0.28 + fluid * 0.42);
    color = blendLayer(color, orb3d(p, vec2f(-0.34, -0.08), 0.095, u.palette1.rgb * 0.76, u.palette3.rgb * 0.04, 0.18));
    color = blendLayer(color, orb3d(p, vec2f(0.16, -0.08), 0.085, u.palette3.rgb * 0.72, u.palette1.rgb * 0.03, 0.22));
    color += u.palette3.rgb * stripe(length(p - vec2f(0.18, -0.08)) * 8.0 + t * 0.18, 0.028) * smoothstep(0.66, 0.08, length(p - vec2f(0.18, -0.08))) * 0.34;
  } else if (sceneGroup == 2.0 || (fluid > 0.52 && granular > 0.24)) {
    color = mix(color, vec3f(0.055, 0.095, 0.065), 0.36);
    let valley = smoothstep(0.08, 0.0, abs(p.y + 0.1 + sin(p.x * 3.4 + t * 0.08) * 0.16));
    let ridge = max(stripe(p.y * 7.0 + sin(p.x * 3.0) * 0.2, 0.035), stripe((p.x - p.y) * 4.0, 0.03));
    let sediment = smoothstep(0.44, 0.03, length((p - vec2f(0.42, -0.34)) * vec2f(1.2, 0.72)));
    color += vec3f(0.05, 0.55, 0.95) * valley * (0.32 + flow * 0.3);
    color += vec3f(0.44, 0.32, 0.14) * ridge * max(granular, 0.28) * 0.08;
    color += vec3f(0.76, 0.52, 0.22) * sediment * max(granular, 0.18) * 0.36;
  } else if (sceneGroup == 21.0) {
    let bowlLip = exp(-abs(p.y - (0.48 * p.x * p.x - 0.44)) * 26.0);
    let bowlDeck = smoothstep(0.06, 0.0, abs(p.y + 0.52 - abs(p.x) * 0.06)) * smoothstep(0.95, 0.1, abs(p.x));
    let riderCenter = vec2f(sin(t * 0.64) * 0.48, -0.17 + cos(t * 0.64) * 0.18);
    let path = ellipseRing((p - vec2f(0.0, -0.2)), vec2f(0.0), vec2f(1.0, 1.72), 0.46, 0.026);
    let board = capsuleLine(rot(p - riderCenter, sin(t * 0.64) * 0.42), vec2f(-0.16, 0.0), vec2f(0.16, 0.0), 0.035);
    let rider = diskMask(p, riderCenter + vec2f(0.0, 0.12), 0.07);
    let wheelA = diskMask(rot(p - riderCenter, sin(t * 0.64) * 0.42), vec2f(-0.14, -0.035), 0.026);
    let wheelB = diskMask(rot(p - riderCenter, sin(t * 0.64) * 0.42), vec2f(0.14, -0.035), 0.026);
    let skid = stripe((p.x + p.y) * 9.0 - t * 0.72, 0.02) * smoothstep(0.34, 0.03, length(p - riderCenter));
    color = mix(color, vec3f(0.055, 0.065, 0.075), 0.42);
    color += vec3f(0.62, 0.68, 0.76) * max(bowlLip, bowlDeck) * 0.66;
    color += u.palette1.rgb * path * (0.28 + motion * 0.34);
    color += vec3f(1.0, 0.8, 0.24) * skid * (0.16 + max(stress, constraint) * 0.42);
    color += vec3f(0.08, 0.09, 0.1) * board * 0.78;
    color += u.palette3.rgb * max(wheelA, wheelB) * 0.76;
    color += vec3f(0.95, 0.98, 1.0) * rider * 0.62;
    color += vec3f(0.3, 0.72, 1.0) * atomFeedbackArcs(p - riderCenter, t) * max(motion, 0.28) * 0.18;
  } else if (sceneGroup == 22.0 || granular > 0.34) {
    color = mix(color, vec3f(0.14, 0.09, 0.045), 0.42);
    let walls = max(rectMask(p, vec2f(-0.55, 0.02), vec2f(0.04, 0.68)), rectMask(p, vec2f(0.55, 0.02), vec2f(0.04, 0.68)));
    let pile = smoothstep(0.1, 0.0, abs(p.y + 0.56 - abs(p.x) * 0.36)) * smoothstep(0.8, 0.03, abs(p.x));
    color += vec3f(0.64, 0.46, 0.22) * max(walls, pile) * 0.7;
    color += vec3f(1.0, 0.62, 0.18) * starParticleField(p + vec2f(0.0, t * 0.04), t, 0.12 + density * 0.16) * 0.28;
  } else if (sceneGroup == 11.0 || sceneGroup == 16.0 || networkLocal > 0.34 || gridFeature > 0.18) {
    let rackA = panel3d(p, vec2f(-0.45, 0.03), vec2f(0.22, 0.46), vec3f(0.05, 0.08, 0.12), u.palette1.rgb);
    let rackB = panel3d(p, vec2f(0.08, -0.02), vec2f(0.2, 0.4), vec3f(0.06, 0.075, 0.1), u.palette3.rgb);
    let rackC = panel3d(p, vec2f(0.52, 0.08), vec2f(0.18, 0.34), vec3f(0.07, 0.08, 0.1), u.palette1.rgb);
    let rackMask = max(max(rackA.a, rackB.a), rackC.a);
    color = blendLayer(color, rackA);
    color = blendLayer(color, rackB);
    color = blendLayer(color, rackC);
    let bus = max(capsuleLine(p, vec2f(-0.72, -0.48), vec2f(0.72, 0.34), 0.035), capsuleLine(p, vec2f(-0.68, 0.44), vec2f(0.78, -0.28), 0.028));
    let pulse = stripe((p.x + p.y) * 5.0 - t * (0.7 + motion), 0.042);
    let aisleFlow = max(
      stripe(p.y * 5.0 + sin(p.x * 2.5 + t * 0.9) * 0.18 - t * (0.82 + motion * 0.36), 0.044) * smoothstep(0.88, 0.08, abs(p.x)),
      stripe(p.x * 6.0 + p.y * 2.0 - t * (1.05 + motion * 0.28), 0.034) * smoothstep(0.74, 0.02, abs(p.y + 0.08))
    );
    let ledScan = stripe(p.y * 10.0 - t * (1.35 + motion), 0.038) * rackMask;
    let heatWash = atomThermalPlume(p * vec2f(0.72, 1.0) + vec2f(sin(t * 0.38) * 0.12, -0.12), t);
    color += u.palette1.rgb * bus * (0.3 + pulse * 0.52);
    color += vec3f(0.18, 0.78, 1.0) * aisleFlow * (0.22 + networkLocal * 0.42 + feedback * 0.24);
    color += vec3f(1.0, 0.28, 0.06) * heatWash * thermal * 0.36;
    color += vec3f(0.72, 1.0, 0.92) * ledScan * (0.22 + signal * 0.38);
    color += u.palette3.rgb * atomFeedbackArcs(p, t) * max(feedback, 0.28) * 0.62;
  } else if (sceneGroup == 0.0 || sceneGroup == 1.0 || thermal > 0.35 || phase > 0.32) {
    let basin = panel3d(p, vec2f(0.0, -0.55), vec2f(0.86, 0.2), vec3f(0.18, 0.05, 0.025), vec3f(1.0, 0.28, 0.04));
    color = blendLayer(color, basin);
    color += vec3f(1.0, 0.24, 0.05) * atomThermalPlume(p, t) * (0.45 + heat * 0.44);
    color += u.palette3.rgb * starParticleField(p + vec2f(0.0, t * 0.03), t, 0.08 + thermal * 0.2) * 0.38;
    color = blendLayer(color, orb3d(p, vec2f(-0.48, 0.28), 0.08, u.palette0.rgb, vec3f(1.0, 0.22, 0.05) * phase * 0.18, 0.22));
  } else if (sceneGroup == 7.0 || sceneGroup == 13.0 || sceneGroup == 14.0 || bio > 0.32 || agroFeature > 0.18) {
    color = blendLayer(color, orb3d(p, vec2f(-0.32, 0.02), 0.24, u.palette1.rgb * 0.75, u.palette3.rgb * 0.03, 0.72));
    color = blendLayer(color, orb3d(p, vec2f(0.22, -0.04), 0.18, u.palette3.rgb * 0.68, u.palette1.rgb * 0.02, 0.68));
    color += vec3f(0.28, 0.9, 0.42) * branchWeb(p, t) * 0.36;
    color += u.palette0.rgb * capsuleLine(p, vec2f(-0.68, -0.42), vec2f(0.64, 0.34), 0.028) * 0.24;
  } else if (sceneGroup == 8.0 || chemical > 0.32) {
    color = blendLayer(color, orb3d(p, vec2f(0.0, -0.02), 0.36, u.palette1.rgb * 0.52, u.palette3.rgb * 0.04, 0.18));
    color += u.palette3.rgb * stripe(length(p) * 7.0 + t * 0.18, 0.028) * smoothstep(0.72, 0.12, length(p)) * 0.38;
    color += u.palette0.rgb * capsuleLine(p, vec2f(-0.38, 0.46), vec2f(0.38, 0.46), 0.045) * 0.38;
  } else {
    let shaft = capsuleLine(p, vec2f(-0.72, -0.18), vec2f(0.64, 0.18), 0.075);
    let rotor = ellipseRing(p, vec2f(0.2, 0.04), vec2f(1.0, 1.0), 0.28, 0.035);
    color += u.palette1.rgb * shaft * 0.4;
    color += u.palette3.rgb * rotor * (0.32 + motion * 0.22);
    color = blendLayer(color, orb3d(p, vec2f(-0.42, -0.12), 0.14, u.palette0.rgb * 0.72, u.palette3.rgb * 0.02, 0.26));
  }

  color += vec3f(1.0, 0.96, 0.9) * optical * exp(-abs(rot(p, 0.2 + variant * 0.4).y) * 62.0) * 0.22 * commonOverlay;
  color += vec3f(0.45, 0.75, 1.0) * acoustic * stripe(length(p) * (7.0 + density * 3.0) - t * 0.46, 0.023) * 0.16 * commonOverlay;
  color += vec3f(0.7, 0.85, 1.0) * em * stripe(atan2(p.y, p.x) * 3.5 + length(p) * 2.2 - t * 0.15, 0.028) * 0.18 * commonOverlay;
  color += vec3f(0.9, 0.7, 0.42) * granular * perspectiveFloor(p + vec2f(0.0, 0.15), t) * 0.12 * commonOverlay;
  color += vec3f(0.95, 0.76, 0.38) * gridFeature * atomFeedbackArcs(p, t) * 0.28 * commonOverlay;
  color += vec3f(0.9, 0.94, 1.0) * max(robot, robotFeature) * capsuleLine(p, vec2f(-0.42, 0.2), vec2f(0.46, -0.08 + sin(t) * 0.05), 0.046) * 0.34 * commonOverlay;
  color += vec3f(0.72, 0.82, 0.94) * factoryFeature * panel3d(p, vec2f(0.38, -0.38), vec2f(0.38, 0.1), vec3f(0.13, 0.14, 0.15), u.palette1.rgb).w * 0.32 * commonOverlay;
  color += vec3f(0.42, 1.0, 0.48) * agroFeature * branchWeb(p + vec2f(0.08, 0.12), t) * 0.18 * commonOverlay;
  color += vec3f(0.22, 0.9, 1.0) * particleFeature * ellipseRing(p, vec2f(0.0), vec2f(1.0, 1.0), 0.56, 0.022) * 0.16;
  color += vec3f(1.0, 0.68, 0.18) * civicFeature * max(stripe(p.x * 5.5, 0.022), stripe(p.y * 4.5, 0.022)) * 0.04;
  color += vec3f(1.0, 0.22, 0.06) * hazardFeature * stripe(length(p) * 5.8 - t * 0.3, 0.03) * 0.16 * commonOverlay;
  color += vec3f(0.14, 0.9, 1.0) * max(instrument, signal) * panel3d(p, vec2f(0.0, 0.58), vec2f(0.82, 0.1), vec3f(0.02, 0.06, 0.09), u.palette3.rgb).w * 0.36 * commonOverlay;
  color = mix(color, color * (0.86 + fog * 0.08) + u.palette0.rgb * 0.04, 0.32);
  return color;
}

fn branchWeb(p: vec2f, t: f32) -> f32 {
  let trunk = capsuleLine(p, vec2f(-0.72, -0.48), vec2f(0.18, 0.24), 0.028);
  let a = capsuleLine(p, vec2f(-0.18, -0.06), vec2f(0.55, 0.38), 0.02);
  let b = capsuleLine(p, vec2f(-0.04, 0.1), vec2f(0.48, -0.34), 0.018);
  let vein = exp(-abs(sin(p.x * 9.0 + p.y * 5.0 + t * 0.12)) * 5.5) * smoothstep(0.88, 0.1, length(p));
  return max(max(trunk, a), max(b, vein * 0.42));
}

fn atomStructuralScene(p: vec2f, t: f32, base: vec3f) -> vec3f {
  let sceneGroup = floor(u.viewport.w);
  let thermal = max(atomAt(0), atomAt(14));
  let fluid = atomAt(1);
  let stress = atomAt(2);
  let feedback = atomAt(3);
  let orbit = atomAt(4);
  let em = atomAt(5);
  let optical = atomAt(6);
  let quantum = atomAt(7);
  let acoustic = atomAt(8);
  let bio = atomAt(9);
  let chemical = atomAt(10);
  let network = atomAt(11);
  let granular = atomAt(12);
  let instrument = max(atomAt(13), atomAt(17));
  let phase = atomAt(15);
  let robot = atomAt(16);
  let measurement = atomAt(17);
  let motion = atomAt(18);
  let density = atomAt(19);
  let signal = atomAt(22);
  let surface = atomAt(23);
  let specific = max(max(max(robot, quantum), max(chemical, granular)), max(max(network, optical), max(bio, orbit)));
  let literalScene = 0.0;
  let thermalLocal = thermal * (1.0 - clamp(specific * 0.62, 0.0, 0.78));
  let networkLocal = network * (1.0 - clamp(max(max(robot, chemical), max(granular, fluid)) * 0.76, 0.0, 0.9));
  let microfluidic = clamp(max(chemical, instrument), 0.0, 1.0);
  let terrainFluid = clamp(fluid * max(granular, surface), 0.0, 1.0);
  let bioFluid = clamp(fluid * max(bio, 0.32), 0.0, 1.0);
  let fermentationCue = clamp(max(featureAt(11), featureAt(12)) * max(min(bio, chemical), 0.28) * max(max(fluid, density), 0.24), 0.0, 1.0);
  let fluidLocal = fluid * (1.0 - clamp(max(max(robot, networkLocal), terrainFluid) * 0.28, 0.0, 0.45));
  let total = clamp(thermal + fluid + stress + feedback + orbit + em + optical + quantum +
    acoustic + bio + chemical + network + granular + instrument + phase + robot, 0.0, 3.0) / 3.0;
  var color = base * (0.28 + (1.0 - specific) * 0.16) + u.palette2.rgb * (0.14 + specific * 0.16);
  color = mix(color, vec3f(0.015, 0.12, 0.16), clamp(max(fluid, chemical) * 0.46, 0.0, 0.58));
  color = mix(color, vec3f(0.16, 0.11, 0.055), clamp(granular * 0.5, 0.0, 0.6));
  color = mix(color, vec3f(0.045, 0.06, 0.075), clamp(robot * 0.48, 0.0, 0.58));
  color = mix(color, vec3f(0.035, 0.055, 0.1), clamp(networkLocal * 0.34, 0.0, 0.46));
  color = mix(color, vec3f(0.015, 0.025, 0.065), clamp(max(orbit, quantum) * 0.45, 0.0, 0.58));
  let floorBand = smoothstep(0.06, 0.0, abs(p.y + 0.58));
  let thermalBasin = smoothstep(0.5, 0.0, abs(p.y + 0.52)) * smoothstep(0.82, 0.05, abs(p.x));
  color += vec3f(1.0, 0.2, 0.04) * thermalLocal * thermalBasin * (0.3 + atomThermalPlume(p, t) * 0.7);
  color += vec3f(1.0, 0.78, 0.24) * phase * floorBand * stripe(p.x * 5.0 + t * 0.1, 0.035) * 0.62;
  let tubeA = capsuleLine(p, vec2f(-0.9, -0.35), vec2f(0.78, 0.28), 0.055);
  let tubeB = capsuleLine(p, vec2f(-0.72, 0.42), vec2f(0.72, -0.18), 0.04);
  let channelCross = max(
    capsuleLine(p, vec2f(-0.82, -0.02), vec2f(0.82, -0.02), 0.042),
    capsuleLine(p, vec2f(-0.18, -0.54), vec2f(0.38, 0.48), 0.036)
  );
  let dropletTrain = max(max(
    diskMask(p, vec2f(-0.42 + sin(t * 0.55) * 0.04, -0.02), 0.075),
    diskMask(p, vec2f(0.04 + sin(t * 0.45) * 0.04, -0.02), 0.064)),
    diskMask(p, vec2f(0.46 + sin(t * 0.52) * 0.04, -0.02), 0.07));
  color += vec3f(0.0, 0.55, 1.0) * fluidLocal * max(tubeA, tubeB) * (0.12 + microfluidic * 0.42) * (0.34 + atomFluidRibbons(p, t) * 0.28);
  color = mix(color, vec3f(0.02, 0.26, 0.32), max(fluid, chemical) * microfluidic * channelCross * 0.44);
  color += vec3f(0.35, 1.0, 0.84) * max(fluid, chemical) * microfluidic * dropletTrain * 0.58;
  let riverPath = smoothstep(0.065, 0.0, abs(p.y + 0.08 + sin(p.x * 3.2 + t * 0.08) * 0.15));
  let sedimentFan = smoothstep(0.5, 0.04, length((p - vec2f(0.46, -0.36)) * vec2f(1.2, 0.7)));
  let airflow = atomFluidRibbons(p + vec2f(0.0, sin(t * 0.2) * 0.05), t);
  color += vec3f(0.05, 0.5, 0.95) * terrainFluid * riverPath * 0.58;
  color += vec3f(0.72, 0.5, 0.2) * terrainFluid * sedimentFan * 0.32;
  color += vec3f(0.58, 0.86, 1.0) * bioFluid * airflow * 0.24;
  let slab = rectMask(p, vec2f(0.0, -0.08), vec2f(0.72, 0.26));
  color = mix(color, vec3f(0.32, 0.34, 0.38), stress * slab * 0.62);
  color += vec3f(1.0, 0.86, 0.2) * stress * atomStressCracks(p, t) * 0.72;
  let graph = atomNetworkPressure(p, t);
  color += vec3f(0.16, 0.48, 1.0) * networkLocal * graph * 0.78;
  let parcelFlow = fract(t * 0.42);
  let movingParcelA = vec2f(-0.76 + parcelFlow * 1.52, -0.28 + sin(t * 0.7) * 0.025);
  let movingParcelB = vec2f(-0.32 + fract(parcelFlow + 0.34) * 1.28, 0.2 + cos(t * 0.62) * 0.02);
  let movingParcelC = vec2f(-0.64 + fract(parcelFlow + 0.68) * 1.42, -0.46);
  let parcelA = rectMask(p, movingParcelA, vec2f(0.12, 0.09));
  let parcelB = rectMask(p, movingParcelB, vec2f(0.11, 0.08));
  let parcelC = rectMask(p, movingParcelC, vec2f(0.14, 0.1));
  let parcelRoad = max(capsuleLine(p, vec2f(-0.82, -0.28), vec2f(0.78, 0.24), 0.026),
    capsuleLine(p, vec2f(-0.62, 0.34), vec2f(0.66, -0.18), 0.023));
  color += vec3f(0.05, 0.38, 0.92) * networkLocal * parcelRoad * 0.62;
  color += vec3f(1.0, 0.28, 0.16) * networkLocal * max(max(parcelA, parcelB), parcelC) * 0.38;
  color += vec3f(0.0, 0.95, 1.0) * feedback * atomFeedbackArcs(p, t) * 0.72;
  let well = stripe(length(p) * 4.5 - t * 0.08, 0.025);
  color = mix(color, vec3f(0.02, 0.04, 0.12), orbit * smoothstep(1.0, 0.15, length(p)) * 0.66);
  color += vec3f(0.85, 0.92, 1.0) * orbit * well * 0.58;
  color += vec3f(1.0, 0.2, 0.82) * em * stripe(atan2(p.y, p.x) * 3.0 + length(p) * 2.0, 0.035) * 0.52;
  color += vec3f(0.7, 0.9, 1.0) * optical * exp(-abs(rot(p, -0.24).y) * 56.0) * 0.82;
  let prism = rectMask(rot(p - vec2f(0.24, -0.04), 0.55), vec2f(0.0), vec2f(0.17, 0.26));
  color += vec3f(1.0, 0.92, 0.35) * optical * prism * 0.52;
  let chip = rectMask(p, vec2f(0.0, 0.0), vec2f(0.58, 0.34));
  color = mix(color, vec3f(0.18, 0.11, 0.35), quantum * chip * 0.76);
  color += vec3f(0.6, 0.95, 1.0) * quantum * atomQuantumFringes(p, t) * 0.7;
  let waveCenter = vec2f(-0.18 + sin(t * 0.34) * 0.22, 0.04 + cos(t * 0.27) * 0.12);
  let acousticBands = stripe(length(p - waveCenter) * 7.5 - t * 1.18, 0.032);
  color += vec3f(0.4, 0.78, 1.0) * acoustic * acousticBands * 0.82;
  let branch = exp(-abs(sin(p.x * 7.0 + p.y * 4.0 + t * 0.88)) * 4.0) * smoothstep(0.88, 0.08, length(p));
  let bioPulse = diskMask(p, vec2f(sin(t * 0.82) * 0.42, cos(t * 0.66) * 0.28), 0.16) * (0.45 + 0.55 * sin(t * 2.2) * sin(t * 2.2));
  let cellSwarm = max(max(
    diskMask(p, vec2f(-0.54 + fract(t * 0.18) * 1.08, -0.16 + sin(t * 0.72) * 0.1), 0.09),
    diskMask(p, vec2f(0.36 - fract(t * 0.15) * 0.86, 0.18 + cos(t * 0.64) * 0.12), 0.075)),
    diskMask(p, vec2f(sin(t * 0.48) * 0.5, -0.34 + cos(t * 0.51) * 0.08), 0.08));
  color += vec3f(0.26, 0.9, 0.36) * bio * branch * 0.64;
  color += vec3f(0.58, 1.0, 0.36) * bio * bioPulse * 0.48;
  color += vec3f(0.9, 1.0, 0.52) * bio * cellSwarm * 0.62;
  let vessel = diskMask(p, vec2f(0.12, 0.0), 0.48) * (1.0 - diskMask(p, vec2f(0.12, 0.0), 0.31));
  let reactionFront = stripe(length(p - vec2f(0.12, 0.0)) * 6.0 + t * 0.18, 0.026);
  let reagentPool = diskMask(p, vec2f(0.16, -0.04), 0.36);
  color = mix(color, vec3f(0.03, 0.22, 0.24), chemical * reagentPool * 0.34);
  color += vec3f(0.82, 0.4, 1.0) * chemical * vessel * 0.46;
  color += vec3f(0.95, 0.55, 0.18) * chemical * reactionFront * 0.52;
  let doughBody = smoothstep(0.68, 0.04, length((p - vec2f(0.02, -0.06)) * vec2f(0.82, 1.22)));
  let glutenWeb = exp(-abs(sin(p.x * 9.0 + p.y * 5.2 + sin(t * 0.22 + p.y * 4.0) * 0.7)) * 4.6) * doughBody;
  let bubbleA = diskMask(p, vec2f(-0.32 + sin(t * 0.42) * 0.05, -0.05 + cos(t * 0.37) * 0.04), 0.1 + 0.025 * sin(t * 0.8) * sin(t * 0.8));
  let bubbleB = diskMask(p, vec2f(0.2 + sin(t * 0.36) * 0.04, 0.16 + cos(t * 0.41) * 0.05), 0.075 + 0.02 * sin(t * 0.66) * sin(t * 0.66));
  let bubbleC = diskMask(p, vec2f(0.38 + sin(t * 0.31) * 0.04, -0.24 + cos(t * 0.48) * 0.035), 0.085 + 0.018 * sin(t * 0.72) * sin(t * 0.72));
  let gasPockets = max(max(bubbleA, bubbleB), bubbleC) * doughBody;
  let acidityBands = stripe((p.x + p.y * 0.72) * 5.4 - t * (0.18 + motion * 0.36), 0.025) * doughBody;
  color = mix(color, vec3f(0.34, 0.22, 0.13), fermentationCue * doughBody * 0.42);
  color += vec3f(0.82, 0.54, 0.28) * fermentationCue * doughBody * 0.2;
  color += vec3f(0.96, 0.82, 0.46) * fermentationCue * glutenWeb * 0.42;
  color += vec3f(0.7, 0.96, 0.86) * fermentationCue * gasPockets * 0.62;
  color += vec3f(1.0, 0.42, 0.72) * fermentationCue * acidityBands * 0.38;
  let strata = max(stripe(p.y * 9.0 + sin(p.x * 4.0) * 0.12, 0.04), stripe((p.x - p.y) * 4.0, 0.03));
  let siloWalls = max(rectMask(p, vec2f(-0.54, 0.05), vec2f(0.035, 0.66)),
    rectMask(p, vec2f(0.54, 0.05), vec2f(0.035, 0.66)));
  let grainPile = smoothstep(0.08, 0.0, abs(p.y + 0.58 - abs(p.x) * 0.34)) * smoothstep(0.78, 0.04, abs(p.x));
  let dustBloom = smoothstep(0.86, 0.12, length(p - vec2f(0.04, 0.18))) *
    (0.45 + 0.55 * stripe(atan2(p.y - 0.18, p.x - 0.04) * 5.0 + t * 0.2, 0.035));
  let granularMask = clamp(max(max(siloWalls, grainPile), dustBloom * 0.46), 0.0, 1.0);
  color += vec3f(0.74, 0.52, 0.24) * granular * strata * granularMask * 0.34;
  color += vec3f(0.52, 0.38, 0.18) * granular * max(siloWalls, grainPile) * 0.76;
  color += vec3f(1.0, 0.66, 0.22) * granular * dustBloom * 0.34;
  color += vec3f(0.9, 0.78, 0.48) * surface * (1.0 - clamp(granular * 0.72, 0.0, 0.86)) * stripe((p.x + p.y) * 8.0 - t * 0.12, 0.028) * 0.08;
  let armTip = vec2f(0.5, 0.18 + sin(t * 1.8) * 0.14);
  let arm = max(capsuleLine(p, vec2f(-0.42, 0.12), vec2f(0.05, -0.06), 0.06),
    capsuleLine(p, vec2f(0.05, -0.06), armTip, 0.05));
  let conveyor = rectMask(p, vec2f(0.0, -0.46), vec2f(0.86, 0.085)) *
    (0.32 + stripe(p.x * 11.0 - t * 3.0, 0.056) * 0.68);
  let workcell = max(rectMask(p, vec2f(-0.62, 0.08), vec2f(0.09, 0.34)),
    rectMask(p, vec2f(0.66, 0.08), vec2f(0.08, 0.34)));
  let sortingGate = rectMask(p, vec2f(sin(t * 0.95) * 0.42, -0.1), vec2f(0.035, 0.34));
  color += vec3f(0.78, 0.86, 0.92) * robot * arm * 0.82;
  color += vec3f(1.0, 0.64, 0.18) * robot * diskMask(p, armTip, 0.09) * 0.64;
  color += vec3f(0.13, 0.18, 0.22) * robot * conveyor * 0.82;
  color += vec3f(0.38, 0.82, 1.0) * robot * workcell * 0.42;
  color += vec3f(1.0, 0.48, 0.14) * robot * max(parcelA, parcelC) * 0.52;
  color += vec3f(0.9, 1.0, 0.36) * robot * sortingGate * 0.52;
  let panel = rectMask(p, vec2f(-0.56, 0.42), vec2f(0.22, 0.14));
  let readoutDeck = rectMask(p, vec2f(0.0, 0.58), vec2f(0.86, 0.13));
  let scan = max(stripe(p.x * 15.0 - t * 0.48, 0.035), stripe((p.x + p.y) * 9.0 + t * 0.2, 0.028));
  let sampleBeam = exp(-abs(rot(p, 0.1).y - 0.08) * 34.0) * smoothstep(-0.78, 0.78, p.x);
  color += vec3f(0.12, 0.88, 1.0) * instrument * panel * (0.62 + stripe(p.x * 16.0 - t * 0.4, 0.04) * 0.38);
  color += vec3f(0.98, 0.22, 0.78) * max(measurement, signal) * readoutDeck * (0.32 + scan * 0.52);
  color += vec3f(0.18, 0.96, 0.72) * max(instrument, signal) * sampleBeam * 0.44;
  let structuralMix = (0.34 + total * 0.26) * (1.0 - literalScene);
  return mix(base, color, clamp(structuralMix, 0.0, 0.58));
}

fn atomOperatorOverlays(p: vec2f, t: f32, base: vec3f) -> vec3f {
  let sceneGroup = floor(u.viewport.w);
  var color = base;
  let thermal = max(atomAt(0), atomAt(14));
  let fluid = atomAt(1);
  let stress = atomAt(2);
  let feedback = atomAt(3);
  let orbit = atomAt(4);
  let em = atomAt(5);
  let optical = atomAt(6);
  let quantum = atomAt(7);
  let acoustic = atomAt(8);
  let bio = atomAt(9);
  let chemical = atomAt(10);
  let network = atomAt(11);
  let granular = atomAt(12);
  let instrument = max(atomAt(13), atomAt(17));
  let combustion = atomAt(14);
  let phase = atomAt(15);
  let robot = atomAt(16);
  let motion = atomAt(18);
  let density = atomAt(19);
  let emission = atomAt(20);
  let constraint = atomAt(21);
  let signal = atomAt(22);
  let surface = atomAt(23);
  let networkLocal = network * (1.0 - clamp(max(max(robot, chemical), max(granular, fluid)) * 0.76, 0.0, 0.9));
  color += vec3f(1.0, 0.32, 0.08) * thermal * atomThermalPlume(p, t) * 0.34;
  color += vec3f(0.12, 0.56, 0.92) * fluid * atomFluidRibbons(p, t) * 0.22;
  color += vec3f(1.0, 0.86, 0.24) * stress * atomStressCracks(p, t) * 0.28;
  color += vec3f(0.34, 0.9, 1.0) * feedback * atomFeedbackArcs(p, t) * 0.22;
  color += vec3f(0.95, 0.82, 1.0) * quantum * atomQuantumFringes(p, t) * 0.24;
  color += vec3f(0.92, 0.68, 0.18) * networkLocal * atomNetworkPressure(p, t) * 0.2;
  color += vec3f(0.72, 0.8, 1.0) * max(optical, em) * exp(-abs(rot(p, -0.28).y) * 48.0) * 0.24;
  color += vec3f(0.8, 0.9, 1.0) * acoustic * stripe(length(p) * 7.0 - t * 0.42, 0.024) * 0.18;
  color += vec3f(0.3, 0.86, 0.42) * bio * exp(-abs(sin(p.x * 6.0 + p.y * 4.0 + t * 0.16)) * 5.5) * 0.12;
  color += vec3f(0.76, 0.48, 1.0) * chemical * smoothstep(0.95, 0.12, length(p)) * 0.08;
  color += vec3f(0.86, 0.72, 0.42) * granular * stripe(p.y * 9.0 + sin(p.x * 4.0), 0.032) * 0.16;
  color += vec3f(0.1, 0.95, 1.0) * instrument * rectMask(p, vec2f(0.0, 0.58), vec2f(0.68, 0.045)) * 0.28;
  let detectorHit = diskMask(p, vec2f(-0.72 + fract(t * 0.76) * 1.44, 0.28 + sin(t * 1.1) * 0.2), 0.085);
  let detectorTrack = capsuleLine(p, vec2f(-0.88, -0.22 + sin(t * 0.7) * 0.12), vec2f(0.88, 0.18 + cos(t * 0.64) * 0.16), 0.024);
  color += vec3f(0.26, 1.0, 0.95) * instrument * detectorHit * 0.78;
  color += vec3f(0.92, 1.0, 0.8) * instrument * detectorTrack * (0.32 + stripe(t * 2.0, 0.32) * 0.34);
  color += vec3f(1.0, 0.18, 0.04) * combustion * atomThermalPlume(p + vec2f(0.12, -0.1), t) * 0.3;
  color += vec3f(0.75, 0.92, 1.0) * phase * stripe(length(p) * 5.4 + sin(p.x * 3.0) - t * 0.18, 0.03) * 0.18;
  color += vec3f(0.9, 0.92, 0.96) * robot * stripe((p.x + p.y) * 7.0 - t * 0.3, 0.03) * 0.14;
  color += u.palette1.rgb * density * exp(-abs(sin(p.x * 8.0) + cos(p.y * 6.0 + t * 0.12)) * 2.4) * 0.08;
  color += u.palette3.rgb * emission * exp(-abs(rot(p, 0.72).y) * 34.0) * 0.18;
  color += vec3f(1.0, 0.92, 0.36) * constraint * capsuleLine(p, vec2f(-0.64, -0.44), vec2f(0.64, 0.44), 0.018) * 0.22;
  color += u.palette3.rgb * signal * stripe((p.x - p.y) * 6.0 - t * 0.48, 0.022) * 0.18;
  color += u.palette1.rgb * surface * stripe(max(abs(p.x), abs(p.y)) * 5.0 + t * 0.08, 0.028) * 0.12;
  color += u.palette3.rgb * motion * stripe(length(p) * 4.8 - t * 0.62, 0.02) * 0.14;
  color += u.palette3.rgb * orbit * stripe(length(p) * 3.6 - t * 0.12, 0.025) * 0.18;
  let robotCarrier = rectMask(p, vec2f(-0.78 + fract(t * 0.72) * 1.56, -0.48), vec2f(0.12, 0.075));
  let robotCarrierUpper = rectMask(p, vec2f(-0.78 + fract(t * 0.58 + 0.24) * 1.56, 0.34), vec2f(0.16, 0.095));
  let robotConveyorUpper = rectMask(p, vec2f(0.0, 0.34), vec2f(0.94, 0.07)) *
    (0.34 + stripe(p.x * 13.0 - t * 3.4, 0.06) * 0.66);
  let robotSweep = capsuleLine(p, vec2f(-0.52, 0.12), vec2f(sin(t * 1.65) * 0.62, -0.1 + cos(t * 1.2) * 0.18), 0.032);
  color += vec3f(1.0, 0.64, 0.12) * robot * robotCarrier * 0.82;
  color += vec3f(1.0, 0.76, 0.18) * robot * robotCarrierUpper * 0.86;
  color += vec3f(0.08, 0.38, 0.9) * robot * robotConveyorUpper * 0.52;
  color += vec3f(0.82, 0.95, 1.0) * robot * robotSweep * 0.48;
  let dispatchTokenA = diskMask(p, vec2f(-0.84 + fract(t * 0.62) * 1.68, 0.18), 0.07);
  let dispatchTokenB = rectMask(p, vec2f(-0.72 + fract(t * 0.48 + 0.38) * 1.44, -0.18), vec2f(0.1, 0.075));
  let dispatchTrack = max(
    capsuleLine(p, vec2f(-0.86, 0.18), vec2f(0.86, 0.18), 0.024),
    capsuleLine(p, vec2f(-0.7, -0.18), vec2f(0.72, -0.18), 0.022)
  );
  color += vec3f(0.2, 0.74, 1.0) * networkLocal * dispatchTrack * 0.46;
  color += vec3f(1.0, 0.82, 0.22) * networkLocal * max(dispatchTokenA, dispatchTokenB) * 0.78;
  let literalScene = 0.0;
  return mix(base, color, clamp(0.34 + robot * 0.18, 0.0, 0.56) * (1.0 - literalScene));
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
  color = atomStructuralScene(p, t, color);
  color = affordanceOverlays(p, t, color);
  color = cinematic3dScene(p, t, scene, color);
  color = atomOperatorOverlays(p, t, color);
  let vignette = smoothstep(1.45, 0.18, length(p));
  color = mix(color * 0.78, color, vignette);
  color = pow(max(color, vec3f(0.0)), vec3f(0.92));
  return vec4f(color, 1.0);
}
`;

  return { create };
});
