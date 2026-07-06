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
    'material-tray': 35,
    cryosphere: 27,
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
    'cultural-material': 36,
    'hazard-atmosphere': 31,
    'space-instrument': 32,
  });

  const SCENE_MIX_SLOTS = Object.freeze([
    'thermal',
    'water',
    'mechanical',
    'magnetic',
    'optical',
    'acoustic',
    'biological',
    'chemical',
    'orbital',
    'network',
    'energy',
    'robotic',
    'granular',
    'instrument',
    'phase',
    'hazard',
  ]);

  const VISUAL_IR_LAYER_SLOTS = Object.freeze([
    'biological-agent',
    'water-volume',
    'detector-geometry',
    'node-graph',
    'readout-panel',
    'track-line',
    'field-sheet',
    'flow-field',
    'thermal-field',
    'optical-field',
    'network-flow',
    'material-surface',
    'organic-matrix',
    'bubble-volume',
    'constraint-surface',
    'causal-affordance',
    'process-pulse',
    'particle-swarm',
    'robot-armature',
    'granular-strata',
    'orbital-body',
    'acoustic-waveguide',
    'chemical-front',
    'phase-boundary',
  ]);

  const SCENE_PACKET_OBJECT_SLOTS = 8;
  const SCENE_PACKET_FLOATS = SCENE_PACKET_OBJECT_SLOTS * 12;
  const UNIFORM_FLOAT_COUNT = 144 + SCENE_PACKET_FLOATS;
  const PHASE8_OUTPUT_SCHEMA = 'simulatte.phase8.output.v1';
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
    instrument: ['#ffffff', '#22d3ee', '#111827', '#f59e0b'],
    grid: ['#f8fafc', '#facc15', '#111827', '#ef4444'],
    robot: ['#f9fafb', '#38bdf8', '#1f2937', '#f97316'],
    factory: ['#fff7ed', '#94a3b8', '#1e293b', '#fb7185'],
    quantum: ['#f8fafc', '#a78bfa', '#020617', '#22d3ee'],
    agro: ['#f7fee7', '#84cc16', '#14532d', '#f97316'],
    sport: ['#f8fafc', '#60a5fa', '#111827', '#f59e0b'],
    cultural: ['#fffbeb', '#d97706', '#1f2937', '#14b8a6'],
  });

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
      this.uniforms = new Float32Array(UNIFORM_FLOAT_COUNT);
      this.features = new Float32Array(48);
      this.atomUniforms = new Float32Array(24);
      this.sceneMix = new Float32Array(SCENE_MIX_SLOTS.length);
      this.sceneMix[SCENE_MIX_SLOTS.indexOf('mechanical')] = 1;
      this.visualIrLayers = new Float32Array(VISUAL_IR_LAYER_SLOTS.length);
      this.sceneRenderPacket = null;
      this.renderExecutionInput = null;
      this.phase8Output = null;
      this.sceneObjectUniforms = new Float32Array(SCENE_PACKET_FLOATS);
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

    setRenderExecutionInput(renderExecutionInput) {
      const scenePacket = sceneRenderPacketFromExecutionInput(renderExecutionInput);
      this.renderExecutionInput = renderExecutionInput && renderExecutionInput.schema === 'simulatte.renderExecutionInput.v1'
        ? renderExecutionInput
        : null;
      this.sceneRenderPacket = scenePacket || emptySceneRenderPacket();
      this.sceneKind = this.sceneRenderPacket.sceneKind || '';
      this.sceneId = scenePacketSceneId(this.sceneRenderPacket, this.sceneKind);
      this.canvas.dataset.sceneKind = this.sceneKind;
      this.canvas.dataset.sceneId = String(this.sceneId);
      this.features = scenePacketFeatureVector(this.sceneRenderPacket);
      this.atomUniforms = scenePacketAtomUniformVector(this.sceneRenderPacket);
      this.sceneMix = scenePacketSceneMixVector(this.sceneRenderPacket, this.sceneKind);
      this.visualIrLayers = visualIrLayerVector(this.sceneRenderPacket);
      this.sceneObjectUniforms = scenePacketObjectUniformVector(this.sceneRenderPacket, this.sceneKind);
      this.canvas.dataset.sceneMix = sceneMixSummary(this.sceneMix);
      this.canvas.dataset.sceneMixSlots = String(activeSceneMixSlots(this.sceneMix));
      this.canvas.dataset.visualIrLayers = visualIrLayerSummary(this.visualIrLayers);
      this.canvas.dataset.visualIrLayerSlots = String(activeVisualIrLayerSlots(this.visualIrLayers));
      this.canvas.dataset.phase8Input = scenePacket ? this.sceneRenderPacket.schema : 'missing-sceneRenderPacket';
      this.canvas.dataset.renderExecutionInput = this.renderExecutionInput
        ? this.renderExecutionInput.schema
        : 'missing-renderExecutionInput';
      this.canvas.dataset.sceneRenderPacket = sceneRenderPacketSummary(this.sceneRenderPacket);
      this.canvas.dataset.sceneRenderEntityCount = String(scenePacketEntityCount(this.sceneRenderPacket));
      this.canvas.dataset.sceneRenderFieldCount = String(scenePacketFieldCount(this.sceneRenderPacket));
      this.canvas.dataset.sceneRenderEffectCount = String(scenePacketEffectCount(this.sceneRenderPacket));
      this.canvas.dataset.sceneRenderSpatialHash = scenePacketSpatialHash(this.sceneRenderPacket);
      this.canvas.dataset.sceneObjectUniforms = sceneObjectUniformSummary(
        this.sceneObjectUniforms,
        this.sceneRenderPacket,
        this.sceneKind
      );
      this.canvas.dataset.sceneObjectIdentities = scenePacketIdentitySummary(this.sceneRenderPacket, this.sceneKind);
      this.palette = paletteForScene(this.sceneKind, this.atomUniforms);
      this.metrics = metricsForScenePacket(this.sceneRenderPacket);
      this.seed = seedForScenePacket(this.sceneRenderPacket);
    }

    setSpec(renderExecutionInput) {
      this.setRenderExecutionInput(renderExecutionInput);
    }

    render(renderExecutionInput, nowMs) {
      if (!this.ready || !this.device || !this.pipeline) return false;
      const started = typeof performance !== 'undefined' ? performance.now() : nowMs;
      if (renderExecutionInput && renderExecutionInput !== this.renderExecutionInput) {
        this.setRenderExecutionInput(renderExecutionInput);
      }
      const state = this.renderExecutionInput && this.renderExecutionInput.simulationState || {};
      this.resize();
      this.writeUniforms(state, nowMs || 0);
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
      this.phase8Output = phase8OutputEnvelope(
        this.renderExecutionInput,
        this.sceneRenderPacket,
        this.renderCount,
        this.lastFrameMs,
        this.canvas
      );
      this.canvas.dataset.phase8Output = this.phase8Output.schema;
      this.canvas.dataset.phase8OutputInput = this.phase8Output.inputSchema;
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

    writeUniforms(state, nowMs) {
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
      offset += 24;
      for (let i = 0; i < SCENE_MIX_SLOTS.length; i += 1) {
        u[offset + i] = this.sceneMix[i] || 0;
      }
      offset += SCENE_MIX_SLOTS.length;
      for (let i = 0; i < VISUAL_IR_LAYER_SLOTS.length; i += 1) {
        u[offset + i] = this.visualIrLayers[i] || 0;
      }
      offset += VISUAL_IR_LAYER_SLOTS.length;
      for (let i = 0; i < SCENE_PACKET_FLOATS; i += 1) {
        u[offset + i] = this.sceneObjectUniforms[i] || 0;
      }
    }

    adaptQuality() {
      if (this.lastFrameMs > 18 && this.quality > 0.62) this.quality *= 0.965;
      else if (this.lastFrameMs < 10 && this.quality < 1) this.quality = Math.min(1, this.quality * 1.01 + 0.002);
    }
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

  function phase8OutputEnvelope(renderExecutionInput, sceneRenderPacket, renderCount, frameMs, canvas) {
    return {
      schema: PHASE8_OUTPUT_SCHEMA,
      phase: 8,
      inputSchema: renderExecutionInput && renderExecutionInput.inputSchema || 'simulatte.phase7.output.v1',
      runtimeReceiptId: renderExecutionInput && renderExecutionInput.runtimeReceiptId || 'runtime:unknown',
      artifact: {
        renderExecution: {
          schema: 'simulatte.renderExecution.v1',
          sceneRenderPacketSchema: sceneRenderPacket && sceneRenderPacket.schema || '',
          rendered: true,
          renderCount: Number(renderCount || 0),
          frameMs: Number(frameMs || 0),
          canvas: {
            width: canvas && Number(canvas.width || 0) || 0,
            height: canvas && Number(canvas.height || 0) || 0,
          },
        },
      },
      receipts: [
        {
          id: 'phase8-webgpu-render',
          schema: 'simulatte.phaseReceipt.v1',
          sceneKind: sceneRenderPacket && sceneRenderPacket.sceneKind || '',
          entityCount: scenePacketEntityCount(sceneRenderPacket),
          fieldCount: scenePacketFieldCount(sceneRenderPacket),
          effectCount: scenePacketEffectCount(sceneRenderPacket),
        },
      ],
    };
  }

  function emptySceneRenderPacket(sceneKind = '') {
    return {
      schema: 'simulatte.sceneRenderPacket.v1',
      compiler: 'simulatte.webgpu.empty-scene-render-packet.v1',
      sceneKind,
      coordinateSystem: { space: 'normalized-canvas', origin: 'top-left', bounds: [0, 0, 1, 1] },
      camera: {},
      lights: [],
      entities: [],
      fields: [],
      effects: [],
      uniforms: {
        schema: 'simulatte.sceneRenderPacketUniforms.v1',
        sceneId: SCENE_IDS[sceneKind] ?? 3,
        atomUniforms: new Array(24).fill(0),
        sceneMix: new Array(SCENE_MIX_SLOTS.length).fill(0),
        visualLayers: new Array(VISUAL_IR_LAYER_SLOTS.length).fill(0),
      },
      passes: ['background'],
      receipts: { source: 'missing-compiled-scene-packet' },
    };
  }

  function scenePacketSceneId(packet, sceneKind = '') {
    const value = Number(packet && packet.uniforms && packet.uniforms.sceneId);
    if (Number.isFinite(value)) return value;
    return SCENE_IDS[sceneKind] ?? 3;
  }

  function scenePacketFeatureVector(_packet) {
    return new Float32Array(48);
  }

  function scenePacketAtomUniformVector(packet) {
    return scenePacketUniformVector(packet, 'atomUniforms', 24);
  }

  function scenePacketSceneMixVector(packet, sceneKind = '') {
    const vector = scenePacketUniformVector(packet, 'sceneMix', SCENE_MIX_SLOTS.length);
    if (activeSceneMixSlots(vector)) return compressSceneMixVector(vector);
    addSceneKindMix(vector, sceneKind, 0.52);
    for (const row of scenePacketDrawableRows(packet)) {
      addScenePacketLayerMix(vector, row.layerSlot, row.renderCodes && row.renderCodes.categoryCode || 0);
    }
    return compressSceneMixVector(vector);
  }

  function scenePacketUniformVector(packet, key, length) {
    const values = packet && packet.uniforms && Array.isArray(packet.uniforms[key])
      ? packet.uniforms[key]
      : [];
    const vector = new Float32Array(length);
    for (let i = 0; i < Math.min(length, values.length); i += 1) {
      vector[i] = clamp01(values[i]);
    }
    return vector;
  }

  function scenePacketDrawableRows(packet) {
    return [
      ...scenePacketRows(packet, 'entities').map((row) => ({ ...row, packetKind: 'entity' })),
      ...scenePacketRows(packet, 'fields').map((row) => ({ ...row, packetKind: 'field' })),
      ...scenePacketRows(packet, 'effects').map((row) => ({ ...row, packetKind: 'effect' })),
    ];
  }

  function addScenePacketLayerMix(vector, layerSlot = '', categoryCode = 0) {
    const add = (slot, value) => addSceneMixSlot(vector, slot, value);
    switch (String(layerSlot || '')) {
      case 'biological-agent':
      case 'organic-matrix':
        add('biological', 0.72);
        break;
      case 'water-volume':
      case 'flow-field':
      case 'bubble-volume':
        add('water', 0.64);
        break;
      case 'detector-geometry':
      case 'readout-panel':
      case 'track-line':
        add('instrument', 0.72);
        break;
      case 'node-graph':
      case 'network-flow':
        add('network', 0.72);
        break;
      case 'thermal-field':
        add('thermal', 0.7);
        break;
      case 'optical-field':
        add('optical', 0.68);
        break;
      case 'chemical-front':
        add('chemical', 0.66);
        break;
      case 'robot-armature':
        add('robotic', 0.68);
        break;
      case 'granular-strata':
        add('granular', 0.66);
        break;
      case 'orbital-body':
        add('orbital', 0.68);
        break;
      case 'acoustic-waveguide':
        add('acoustic', 0.68);
        break;
      case 'phase-boundary':
        add('phase', 0.64);
        break;
      case 'particle-swarm':
        add('instrument', 0.38);
        break;
      default:
        break;
    }
    if (categoryCode === 5) add('instrument', 0.32);
    if (categoryCode === 6) add('network', 0.32);
    if (categoryCode === 9) add('biological', 0.32);
  }

  function scenePacketEntityCount(packet) {
    return packet && Array.isArray(packet.entities) ? packet.entities.length : 0;
  }

  function scenePacketFieldCount(packet) {
    return packet && Array.isArray(packet.fields) ? packet.fields.length : 0;
  }

  function scenePacketEffectCount(packet) {
    return packet && Array.isArray(packet.effects) ? packet.effects.length : 0;
  }

  function sceneRenderPacketSummary(packet) {
    if (!packet) return 'none';
    const layerSlots = scenePacketLayerList(packet).slice(0, 8).join('+');
    const passes = Array.isArray(packet.passes) ? packet.passes.join('+') : '';
    return [
      packet.schema,
      `entities:${scenePacketEntityCount(packet)}`,
      `fields:${scenePacketFieldCount(packet)}`,
      `effects:${scenePacketEffectCount(packet)}`,
      layerSlots ? `layers:${layerSlots}` : '',
      passes ? `passes:${passes}` : '',
    ].filter(Boolean).join(';');
  }

  function scenePacketLayerList(packet) {
    return Array.from(new Set([
      ...scenePacketRows(packet, 'entities').map((row) => row.layerSlot),
      ...scenePacketRows(packet, 'fields').map((row) => row.layerSlot),
      ...scenePacketRows(packet, 'effects').map((row) => row.layerSlot),
    ].filter(Boolean)));
  }

  function scenePacketRows(packet, key) {
    return packet && Array.isArray(packet[key]) ? packet[key] : [];
  }

  function scenePacketSpatialHash(packet) {
    if (!packet) return 'none';
    const text = [
      packet.sceneKind,
      ...scenePacketRows(packet, 'entities').map((row) => scenePacketRowHashText(row)),
      ...scenePacketRows(packet, 'fields').map((row) => scenePacketRowHashText(row)),
      ...scenePacketRows(packet, 'effects').map((row) => scenePacketRowHashText(row)),
    ].join('|');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function scenePacketRowHashText(row = {}) {
    const transform = row.transform || {};
    const position = Array.isArray(transform.position) ? transform.position : [];
    const scale = Array.isArray(transform.scale) ? transform.scale : [];
    const domain = row.domain || {};
    const bounds = Array.isArray(domain.bounds) ? domain.bounds : row.geometry && row.geometry.bounds || [];
    const identity = row.identity || {};
    return [
      row.id,
      row.layerSlot,
      identity.type,
      identity.category,
      row.sourceGraphId,
      position.map((value) => Number(value || 0).toFixed(3)).join(','),
      scale.map((value) => Number(value || 0).toFixed(3)).join(','),
      bounds.map((value) => Number(value || 0).toFixed(3)).join(','),
      row.animation && row.animation.kind,
    ].filter(Boolean).join(':');
  }

  function scenePacketObjectUniformVector(packet, sceneKind = '') {
    const vector = new Float32Array(SCENE_PACKET_FLOATS);
    const drawables = scenePacketUniformDrawables(packet, sceneKind).slice(0, SCENE_PACKET_OBJECT_SLOTS);
    drawables.forEach((row, index) => {
      const transform = scenePacketDrawableTransform(row, index, drawables.length);
      const codes = row.renderCodes || {};
      const layerCode = Number(codes.layerCode || scenePacketLayerCode(row.layerSlot));
      const animationCode = Number(codes.animationCode || scenePacketAnimationCode(row.animation && row.animation.kind));
      const identityCode = Number(codes.semanticCode || 0);
      const categoryCode = Number(codes.categoryCode || scenePacketCategoryCode(row));
      const packetKindCode = Number(codes.packetKindCode || scenePacketKindCode(row.packetKind));
      const objectOffset = index * 4;
      const styleOffset = SCENE_PACKET_OBJECT_SLOTS * 4 + index * 4;
      const identityOffset = SCENE_PACKET_OBJECT_SLOTS * 8 + index * 4;
      vector[objectOffset] = transform.x;
      vector[objectOffset + 1] = transform.y;
      vector[objectOffset + 2] = transform.w;
      vector[objectOffset + 3] = transform.h;
      vector[styleOffset] = layerCode;
      vector[styleOffset + 1] = transform.rotation;
      vector[styleOffset + 2] = animationCode;
      vector[styleOffset + 3] = clamp01(row.confidence || row.material && row.material.opacity || 0.72);
      vector[identityOffset] = identityCode;
      vector[identityOffset + 1] = categoryCode;
      vector[identityOffset + 2] = Number(codes.variantCode ?? scenePacketVariantCode(row));
      vector[identityOffset + 3] = packetKindCode;
    });
    return vector;
  }

  function scenePacketUniformDrawables(packet, sceneKind = '') {
    if (!packet) return [];
    const rows = scenePacketDrawableRows(packet)
      .filter((row) => row && row.layerSlot && (row.renderCodes && row.renderCodes.layerCode || scenePacketLayerCode(row.layerSlot)) > 0);
    rows.sort((a, b) => scenePacketDrawablePriority(b, sceneKind) - scenePacketDrawablePriority(a, sceneKind) ||
      Number(a.drawOrder || 0) - Number(b.drawOrder || 0) ||
      String(a.id || '').localeCompare(String(b.id || '')));
    const selected = [];
    for (const row of rows) {
      if (selected.length >= SCENE_PACKET_OBJECT_SLOTS) break;
      selected.push(row);
    }
    return selected;
  }

  function scenePacketDrawablePriority(row, sceneKind = '') {
    const explicit = Number(row && row.renderPriority);
    if (Number.isFinite(explicit)) return explicit;
    const layerCode = Number(row && row.renderCodes && row.renderCodes.layerCode || scenePacketLayerCode(row && row.layerSlot));
    const kindCode = Number(row && row.renderCodes && row.renderCodes.packetKindCode || scenePacketKindCode(row && row.packetKind));
    return kindCode * 4 + layerCode * 0.1 + clamp01(row && row.confidence || 0);
  }

  function scenePacketDrawableTransform(row, index = 0, total = 1) {
    const transform = row && row.transform || {};
    const position = Array.isArray(transform.position) ? transform.position : null;
    const scale = Array.isArray(transform.scale) ? transform.scale : null;
    const rotation = Array.isArray(transform.rotation) ? Number(transform.rotation[2] || 0) : 0;
    if (position && scale) {
      return {
        x: clamp01(position[0]),
        y: clamp01(position[1]),
        w: scenePacketSize(scale[0], 0.12),
        h: scenePacketSize(scale[1], 0.1),
        rotation,
      };
    }
    const domain = row && row.domain || {};
    if (Array.isArray(domain.bounds)) {
      return {
        x: clamp01(domain.bounds[0] + domain.bounds[2] * 0.5),
        y: clamp01(domain.bounds[1] + domain.bounds[3] * 0.5),
        w: scenePacketSize(domain.bounds[2], 0.42),
        h: scenePacketSize(domain.bounds[3], 0.32),
        rotation: 0,
      };
    }
    if (Array.isArray(row && row.geometry && row.geometry.bounds)) {
      const bounds = row.geometry.bounds;
      return {
        x: clamp01(bounds[0] + bounds[2] * 0.5),
        y: clamp01(bounds[1] + bounds[3] * 0.5),
        w: scenePacketSize(bounds[2], 0.12),
        h: scenePacketSize(bounds[3], 0.1),
        rotation,
      };
    }
    const angle = total <= 1 ? 0 : index / Math.max(1, total) * Math.PI * 2;
    return {
      x: clamp01(0.5 + Math.cos(angle) * 0.24),
      y: clamp01(0.52 + Math.sin(angle) * 0.18),
      w: 0.13,
      h: 0.1,
      rotation: 0,
    };
  }

  function scenePacketSize(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return clamp(numeric, 0.01, 1);
  }

  function scenePacketLayerCode(layerSlot) {
    const index = VISUAL_IR_LAYER_SLOTS.indexOf(String(layerSlot || ''));
    return index >= 0 ? index + 1 : 0;
  }

  function scenePacketAnimationCode(kind) {
    const value = String(kind || '').toLowerCase();
    if (/swim/.test(value)) return 1;
    if (/flow|ripple/.test(value)) return 2;
    if (/track|particle/.test(value)) return 3;
    if (/readout|measurement/.test(value)) return 4;
    if (/packet|network|route/.test(value)) return 5;
    if (/fermentation|bubble|rise/.test(value)) return 6;
    if (/plume|thermal|fire/.test(value)) return 7;
    if (/orbit|drift/.test(value)) return 8;
    return 0.5;
  }

  function scenePacketSemanticCode(row = {}) {
    return Number(row.renderCodes && row.renderCodes.semanticCode || 0);
  }

  function scenePacketCategoryCode(row = {}) {
    if (row.renderCodes && Number.isFinite(Number(row.renderCodes.categoryCode))) {
      return Number(row.renderCodes.categoryCode);
    }
    return row.packetKind === 'entity' ? 10 : row.packetKind === 'field' ? 3 : row.packetKind === 'effect' ? 8 : 0;
  }

  function scenePacketKindCode(kind) {
    if (kind === 'entity') return 1;
    if (kind === 'field') return 2;
    if (kind === 'effect') return 3;
    return 0;
  }

  function scenePacketVariantCode(row = {}) {
    const text = `${row.id || ''}:${row.label || ''}:${row.sourceGraphId || ''}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function scenePacketIdentityLabel(row = {}) {
    const identity = row.identity || {};
    return identity.label || identity.type || row.label || row.id || row.layerSlot || 'object';
  }

  function scenePacketIdentitySummary(packet, sceneKind = '') {
    const drawables = scenePacketUniformDrawables(packet, sceneKind).slice(0, SCENE_PACKET_OBJECT_SLOTS);
    return drawables.map((row, index) => {
      const transform = scenePacketDrawableTransform(row, index, drawables.length);
      const identity = row.identity || {};
      return [
        `${index}:${scenePacketIdentityLabel(row)}`,
        identity.category || row.packetKind || '',
        row.layerSlot || '',
        `@${Number(transform.x || 0).toFixed(2)},${Number(transform.y || 0).toFixed(2)}`,
      ].filter(Boolean).join(':');
    }).join(';') || 'none';
  }

  function sceneObjectUniformSummary(vector, packet = null, sceneKind = '') {
    const drawables = packet ? scenePacketUniformDrawables(packet, sceneKind).slice(0, SCENE_PACKET_OBJECT_SLOTS) : [];
    const rows = [];
    for (let i = 0; i < SCENE_PACKET_OBJECT_SLOTS; i += 1) {
      const styleOffset = SCENE_PACKET_OBJECT_SLOTS * 4 + i * 4;
      const identityOffset = SCENE_PACKET_OBJECT_SLOTS * 8 + i * 4;
      const layerCode = vector && vector[styleOffset] || 0;
      if (layerCode <= 0) continue;
      const layer = VISUAL_IR_LAYER_SLOTS[Math.max(0, Math.floor(layerCode) - 1)] || 'unknown';
      const semanticCode = vector && vector[identityOffset] || 0;
      const label = drawables[i] ? scenePacketIdentityLabel(drawables[i]) : `semantic-${Number(semanticCode || 0).toFixed(0)}`;
      rows.push(`${i}:${label}:${layer}@${Number(vector[i * 4] || 0).toFixed(2)},${Number(vector[i * 4 + 1] || 0).toFixed(2)}`);
    }
    return rows.join(';') || 'none';
  }

  function addScenePacketLayers(vector, packet, sceneKind = '') {
    if (!packet) return;
    const addRow = (row, strength) => {
      if (!row || !row.layerSlot) return;
      addVisualIrLayerSlot(vector, row.layerSlot, strength);
    };
    for (const row of scenePacketRows(packet, 'entities')) addRow(row, 0.96);
    for (const row of scenePacketRows(packet, 'fields')) addRow(row, 0.72);
    for (const row of scenePacketRows(packet, 'effects')) addRow(row, 0.58);
  }

  function visualIrLayerVector(packet) {
    const vector = scenePacketUniformVector(packet, 'visualLayers', VISUAL_IR_LAYER_SLOTS.length);
    if (activeVisualIrLayerSlots(vector)) return compressVisualIrLayerVector(vector);
    addScenePacketLayers(vector, packet);
    return compressVisualIrLayerVector(vector);
  }

  function addVisualIrLayerSlot(vector, slot, value) {
    const index = VISUAL_IR_LAYER_SLOTS.indexOf(slot);
    if (index < 0) return;
    vector[index] = clamp01(vector[index] + value);
  }

  function compressVisualIrLayerVector(input) {
    const vector = new Float32Array(VISUAL_IR_LAYER_SLOTS.length);
    const ranked = Array.from(input || []).map((value, index) => ({
      index,
      value: clamp01(value),
    })).sort((a, b) => b.value - a.value || a.index - b.index);
    ranked.forEach((entry, rank) => {
      if (entry.value < 0.06) return;
      const gain = rank === 0 ? 1.12 : rank < 6 ? 0.94 : rank < 12 ? 0.7 : 0.46;
      vector[entry.index] = clamp01(entry.value * gain);
    });
    return vector;
  }

  function visualIrLayerSummary(vector) {
    return Array.from(vector || [])
      .map((value, index) => ({ slot: VISUAL_IR_LAYER_SLOTS[index], value: clamp01(value) }))
      .filter((entry) => entry.value >= 0.06)
      .sort((a, b) => b.value - a.value || a.slot.localeCompare(b.slot))
      .slice(0, 10)
      .map((entry) => `${entry.slot}:${entry.value.toFixed(2)}`)
      .join(',');
  }

  function activeVisualIrLayerSlots(vector) {
    return Array.from(vector || []).filter((value) => clamp01(value) >= 0.06).length;
  }

  function addSceneKindMix(vector, sceneKind, strength = 0.32) {
    const value = String(sceneKind || '').toLowerCase();
    if (!value) return;
    if (/thermal|fire|plume|weather/.test(value)) addSceneMixSlot(vector, 'thermal', strength);
    if (/watershed|ocean|fluid|restoration|cryosphere/.test(value)) addSceneMixSlot(vector, 'water', strength);
    if (/mechanical|structural|sport/.test(value)) addSceneMixSlot(vector, 'mechanical', strength);
    if (/magnetic|ferrofluid/.test(value)) addSceneMixSlot(vector, 'magnetic', strength);
    if (/optics|thin-film|quantum/.test(value)) addSceneMixSlot(vector, 'optical', strength);
    if (/acoustic/.test(value)) addSceneMixSlot(vector, 'acoustic', strength);
    if (/biology|ecology|clinical|agro|molecular/.test(value)) addSceneMixSlot(vector, 'biological', strength);
    if (/chemistry|material|cultural/.test(value)) addSceneMixSlot(vector, 'chemical', strength);
    if (/planetary|space|atomic/.test(value)) addSceneMixSlot(vector, 'orbital', strength);
    if (/digital|city|civic|venue|network|grid/.test(value)) addSceneMixSlot(vector, 'network', strength);
    if (/energy|grid|advanced|plasma/.test(value)) addSceneMixSlot(vector, 'energy', strength);
    if (/robot|manufacturing|factory/.test(value)) addSceneMixSlot(vector, 'robotic', strength);
    if (/granular/.test(value)) addSceneMixSlot(vector, 'granular', strength);
    if (/instrument|particle|detector/.test(value)) addSceneMixSlot(vector, 'instrument', strength);
    if (/phase|thin-film|cryosphere/.test(value)) addSceneMixSlot(vector, 'phase', strength * 0.8);
    if (/hazard|storm|wildfire|tsunami|earthquake/.test(value)) addSceneMixSlot(vector, 'hazard', strength);
  }

  function addSceneMixSlot(vector, slot, value) {
    const index = SCENE_MIX_SLOTS.indexOf(slot);
    if (index < 0) return;
    vector[index] = clamp01(vector[index] + value);
  }

  function compressSceneMixVector(input) {
    const vector = new Float32Array(SCENE_MIX_SLOTS.length);
    const ranked = Array.from(input || []).map((value, index) => ({
      index,
      value: clamp01(value),
    })).sort((a, b) => b.value - a.value || a.index - b.index);
    ranked.forEach((entry, rank) => {
      if (entry.value < 0.08) return;
      const gain = rank === 0 ? 1 : rank < 4 ? 0.92 : rank < 8 ? 0.76 : 0.54;
      vector[entry.index] = clamp01(entry.value * gain);
    });
    if (!ranked.length || ranked[0].value < 0.08) {
      addSceneMixSlot(vector, 'mechanical', 0.42);
    }
    return vector;
  }

  function sceneMixSummary(vector) {
    return Array.from(vector || [])
      .map((value, index) => ({ slot: SCENE_MIX_SLOTS[index], value: clamp01(value) }))
      .filter((entry) => entry.value >= 0.08)
      .sort((a, b) => b.value - a.value || a.slot.localeCompare(b.slot))
      .slice(0, 8)
      .map((entry) => `${entry.slot}:${entry.value.toFixed(2)}`)
      .join(',');
  }

  function activeSceneMixSlots(vector) {
    return Array.from(vector || []).filter((value) => clamp01(value) >= 0.08).length;
  }

  function featureStrength(features) {
    let total = 0;
    for (const value of features || []) total += value;
    return clamp(total / 4, 0, 1);
  }

  function metricsForScenePacket(packet) {
    const layers = new Set(scenePacketLayerList(packet));
    const entityCount = scenePacketEntityCount(packet);
    const fieldCount = scenePacketFieldCount(packet);
    const effectCount = scenePacketEffectCount(packet);
    return {
      heat: layers.has('thermal-field') || layers.has('phase-boundary') ? 0.72 : 0.35,
      flow: layers.has('water-volume') || layers.has('flow-field') || layers.has('network-flow') ? 0.66 : 0.42,
      density: clamp01(0.36 + entityCount * 0.035 + fieldCount * 0.025),
      bloom: layers.has('optical-field') || layers.has('readout-panel') || effectCount > 2 ? 0.82 : 0.58,
      motion: layers.has('track-line') || layers.has('process-pulse') || layers.has('acoustic-waveguide') ? 0.76 : 0.42,
    };
  }

  function paletteForScene(sceneKind, atoms) {
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
    if (sceneKind === 'material-tray') return paletteToVec4(PALETTES.factory);
    if (sceneKind === 'evolution-ecology' || sceneKind === 'restoration-water') return paletteToVec4(PALETTES.bio);
    if (sceneKind === 'city' || sceneKind === 'civic-market' || sceneKind === 'venue-crowd') return paletteToVec4(PALETTES.network);
    if (sceneKind === 'particle-instrument' || sceneKind === 'space-instrument') return paletteToVec4(PALETTES.instrument);
    if (sceneKind === 'hazard-atmosphere') return paletteToVec4(PALETTES.weather);
    if (sceneKind === 'advanced-energy') return paletteToVec4(PALETTES.plasma);
    if (sceneKind === 'thermal-plume') return paletteToVec4(PALETTES.thermal);
    if (sceneKind === 'grid-energy') return paletteToVec4(PALETTES.grid);
    if (sceneKind === 'robotics-control') return paletteToVec4(PALETTES.robot);
    if (sceneKind === 'manufacturing-line') return paletteToVec4(PALETTES.factory);
    if (sceneKind === 'quantum-instrument') return paletteToVec4(PALETTES.quantum);
    if (sceneKind === 'agro-waste-loop') return paletteToVec4(PALETTES.agro);
    if (sceneKind === 'sport-motion') return paletteToVec4(PALETTES.sport);
    if (sceneKind === 'cultural-material') return paletteToVec4(PALETTES.cultural);
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

  function seedForScenePacket(packet) {
    const text = [
      packet && packet.sceneKind,
      scenePacketSpatialHash(packet),
      sceneRenderPacketSummary(packet),
    ].filter(Boolean).join('|');
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
  sceneMix0: vec4f,
  sceneMix1: vec4f,
  sceneMix2: vec4f,
  sceneMix3: vec4f,
  visualIr0: vec4f,
  visualIr1: vec4f,
  visualIr2: vec4f,
  visualIr3: vec4f,
  visualIr4: vec4f,
  visualIr5: vec4f,
  sceneObj0: vec4f,
  sceneObj1: vec4f,
  sceneObj2: vec4f,
  sceneObj3: vec4f,
  sceneObj4: vec4f,
  sceneObj5: vec4f,
  sceneObj6: vec4f,
  sceneObj7: vec4f,
  sceneStyle0: vec4f,
  sceneStyle1: vec4f,
  sceneStyle2: vec4f,
  sceneStyle3: vec4f,
  sceneStyle4: vec4f,
  sceneStyle5: vec4f,
  sceneStyle6: vec4f,
  sceneStyle7: vec4f,
  sceneIdentity0: vec4f,
  sceneIdentity1: vec4f,
  sceneIdentity2: vec4f,
  sceneIdentity3: vec4f,
  sceneIdentity4: vec4f,
  sceneIdentity5: vec4f,
  sceneIdentity6: vec4f,
  sceneIdentity7: vec4f,
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

fn sceneMixAt(index: i32) -> f32 {
  if (index < 4) { return u.sceneMix0[index]; }
  if (index < 8) { return u.sceneMix1[index - 4]; }
  if (index < 12) { return u.sceneMix2[index - 8]; }
  return u.sceneMix3[index - 12];
}

fn visualIrAt(index: i32) -> f32 {
  if (index < 4) { return u.visualIr0[index]; }
  if (index < 8) { return u.visualIr1[index - 4]; }
  if (index < 12) { return u.visualIr2[index - 8]; }
  if (index < 16) { return u.visualIr3[index - 12]; }
  if (index < 20) { return u.visualIr4[index - 16]; }
  return u.visualIr5[index - 20];
}

fn scenePacketObjectAt(index: i32) -> vec4f {
  if (index == 0) { return u.sceneObj0; }
  if (index == 1) { return u.sceneObj1; }
  if (index == 2) { return u.sceneObj2; }
  if (index == 3) { return u.sceneObj3; }
  if (index == 4) { return u.sceneObj4; }
  if (index == 5) { return u.sceneObj5; }
  if (index == 6) { return u.sceneObj6; }
  return u.sceneObj7;
}

fn scenePacketStyleAt(index: i32) -> vec4f {
  if (index == 0) { return u.sceneStyle0; }
  if (index == 1) { return u.sceneStyle1; }
  if (index == 2) { return u.sceneStyle2; }
  if (index == 3) { return u.sceneStyle3; }
  if (index == 4) { return u.sceneStyle4; }
  if (index == 5) { return u.sceneStyle5; }
  if (index == 6) { return u.sceneStyle6; }
  return u.sceneStyle7;
}

fn scenePacketIdentityAt(index: i32) -> vec4f {
  if (index == 0) { return u.sceneIdentity0; }
  if (index == 1) { return u.sceneIdentity1; }
  if (index == 2) { return u.sceneIdentity2; }
  if (index == 3) { return u.sceneIdentity3; }
  if (index == 4) { return u.sceneIdentity4; }
  if (index == 5) { return u.sceneIdentity5; }
  if (index == 6) { return u.sceneIdentity6; }
  return u.sceneIdentity7;
}

fn scenePacketStrength() -> f32 {
  var total = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let style = scenePacketStyleAt(i);
    if (style.x > 0.5) {
      total += clamp(style.w, 0.0, 1.0);
    }
  }
  return clamp(total / 4.0, 0.0, 1.0);
}

fn scenePacketLayerColor(layer: f32) -> vec3f {
  if (layer < 1.5) { return vec3f(0.62, 0.78, 0.42); }
  if (layer < 2.5) { return vec3f(0.06, 0.56, 0.95); }
  if (layer < 3.5) { return vec3f(0.12, 0.9, 1.0); }
  if (layer < 4.5) { return vec3f(0.12, 0.46, 1.0); }
  if (layer < 5.5) { return vec3f(0.18, 0.88, 1.0); }
  if (layer < 6.5) { return vec3f(0.94, 1.0, 0.76); }
  if (layer < 7.5) { return vec3f(0.42, 0.78, 1.0); }
  if (layer < 8.5) { return vec3f(0.12, 0.72, 1.0); }
  if (layer < 9.5) { return vec3f(1.0, 0.28, 0.08); }
  if (layer < 10.5) { return vec3f(1.0, 0.92, 0.64); }
  if (layer < 11.5) { return vec3f(0.16, 0.64, 1.0); }
  if (layer < 12.5) { return vec3f(0.72, 0.56, 0.34); }
  if (layer < 13.5) { return vec3f(0.94, 0.72, 0.38); }
  if (layer < 14.5) { return vec3f(0.72, 0.98, 0.86); }
  if (layer < 15.5) { return vec3f(0.9, 0.78, 0.48); }
  if (layer < 16.5) { return vec3f(1.0, 0.84, 0.18); }
  if (layer < 17.5) { return vec3f(0.96, 0.46, 1.0); }
  if (layer < 18.5) { return vec3f(1.0, 0.78, 0.22); }
  if (layer < 19.5) { return vec3f(0.88, 0.94, 1.0); }
  if (layer < 20.5) { return vec3f(0.96, 0.66, 0.22); }
  if (layer < 21.5) { return vec3f(0.9, 0.94, 1.0); }
  if (layer < 22.5) { return vec3f(0.52, 0.82, 1.0); }
  if (layer < 23.5) { return vec3f(0.8, 0.48, 1.0); }
  return vec3f(0.78, 0.92, 1.0);
}

fn scenePacketAnimalMask(local: vec2f, semantic: f32, slot: f32, t: f32) -> f32 {
  let head = vec2f(0.48, -0.04 + sin(t * 1.2 + slot) * 0.035);
  let body = capsuleLine(local, vec2f(-0.38, 0.02), vec2f(0.24, -0.01), 0.18);
  let headDisk = diskMask(local, head, select(0.118, 0.135, semantic < 1.5));
  let tail = capsuleLine(local, vec2f(-0.42, 0.02), vec2f(-0.76, -0.12 + sin(t * 1.8 + slot) * 0.1), 0.045);
  let legs = max(
    capsuleLine(local, vec2f(-0.18, 0.12), vec2f(-0.3, 0.38 + sin(t * 2.2 + slot) * 0.08), 0.034),
    capsuleLine(local, vec2f(0.14, 0.1), vec2f(0.28, 0.35 + cos(t * 2.1 + slot) * 0.07), 0.032)
  );
  let dogEar = max(
    capsuleLine(local, head + vec2f(-0.02, -0.1), head + vec2f(-0.1, -0.24), 0.036),
    capsuleLine(local, head + vec2f(0.04, -0.09), head + vec2f(0.0, -0.24), 0.034)
  );
  let catEar = max(
    smoothstep(0.16, 0.02, length((local - (head + vec2f(-0.055, -0.14))) * vec2f(1.0, 1.5))),
    smoothstep(0.16, 0.02, length((local - (head + vec2f(0.075, -0.14))) * vec2f(1.0, 1.5)))
  );
  let ears = select(catEar, dogEar, semantic < 1.5);
  return max(max(body, headDisk), max(tail, max(legs, ears)));
}

fn scenePacketObjectMask(p: vec2f, obj: vec4f, style: vec4f, identity: vec4f, slot: f32, t: f32) -> f32 {
  if (style.x <= 0.5 || style.w <= 0.01) { return 0.0; }
  let aspect = max(u.viewport.x / max(u.viewport.y, 1.0), 0.1);
  var center = vec2f((obj.x * 2.0 - 1.0) * aspect, (1.0 - obj.y) * 2.0 - 1.0);
  let anim = style.z;
  let amp = 0.025 + style.w * 0.035;
  if (anim < 1.5 && anim > 0.75) {
    center += vec2f(sin(t * 1.4 + slot) * amp * aspect, sin(t * 2.1 + slot * 0.7) * amp * 0.65);
  } else if (anim < 2.5 && anim > 1.5) {
    center += vec2f(sin(t * 0.52 + slot) * amp * 0.38 * aspect, cos(t * 0.47 + slot) * amp * 0.3);
  } else if (anim < 5.5 && anim > 4.5) {
    center += vec2f(fract(t * 0.12 + slot * 0.17) * 0.08 * aspect - 0.04 * aspect, 0.0);
  } else if (anim < 7.5 && anim > 6.5) {
    center += vec2f(sin(t * 0.34 + slot) * amp * 0.25 * aspect, amp * 0.35);
  } else if (anim > 7.5) {
    let a = t * 0.18 + slot;
    center += vec2f(cos(a) * amp * aspect, sin(a) * amp);
  }
  let halfSize = vec2f(max(obj.z * aspect, 0.018), max(obj.w, 0.018));
  let local = rot((p - center) / max(halfSize, vec2f(0.01)), -style.y);
  let layer = style.x;
  let semantic = identity.x;
  var mask = 0.0;
  if (semantic > 0.5 && semantic < 3.5) {
    mask = scenePacketAnimalMask(local, semantic, slot, t);
  } else if (semantic > 3.5 && semantic < 4.5) {
    mask = smoothstep(0.92, 0.52, length(local * vec2f(0.78, 1.26))) *
      (0.72 + 0.28 * stripe(local.y * 5.0 + sin(local.x * 3.0 + t * 0.55), 0.035));
  } else if (semantic > 4.5 && semantic < 6.5) {
    mask = smoothstep(1.0, 0.1, abs(local.x)) * smoothstep(-1.0, 0.9, local.y);
  } else if (semantic > 6.5 && semantic < 7.5) {
    mask = max(capsuleLine(local, vec2f(-0.68, 0.26), vec2f(0.08, -0.08), 0.12),
      capsuleLine(local, vec2f(0.08, -0.08), vec2f(0.62, 0.18), 0.09));
  } else if (semantic > 7.5 && semantic < 9.5) {
    mask = max(rectMask(local, vec2f(0.0), vec2f(0.8, 0.54)), stripe(local.y * 5.0 - t * 0.4, 0.04));
  } else if (semantic > 9.5 && semantic < 10.5) {
    mask = max(diskMask(local, vec2f(-0.5, -0.14), 0.16),
      max(diskMask(local, vec2f(0.18, 0.16), 0.17), capsuleLine(local, vec2f(-0.5, -0.14), vec2f(0.18, 0.16), 0.04)));
  } else if (semantic > 10.5 && semantic < 12.5) {
    mask = max(capsuleLine(local, vec2f(-0.72, -0.18), vec2f(0.68, 0.16), 0.1),
      ellipseRing(local, vec2f(0.08, 0.02), vec2f(1.1, 0.82), 0.46, 0.055));
  } else if (semantic > 12.5 && semantic < 13.5) {
    mask = max(rectMask(local, vec2f(0.0, 0.08), vec2f(0.82, 0.62)),
      rectMask(local, vec2f(-0.28, -0.48), vec2f(0.24, 0.18)));
  } else if (layer < 2.5 || (layer > 12.5 && layer < 14.5) || (layer > 17.5 && layer < 18.5) || (layer > 20.5 && layer < 21.5)) {
    mask = smoothstep(1.05, 0.78, length(local));
  } else if ((layer > 2.5 && layer < 3.5) || (layer > 4.5 && layer < 5.5)) {
    let body = max(ellipseRing(local, vec2f(0.0), vec2f(1.4, 0.82), 0.68, 0.08), rectMask(local, vec2f(0.0), vec2f(0.8, 0.2)));
    mask = body;
  } else if ((layer > 3.5 && layer < 4.5) || (layer > 10.5 && layer < 11.5)) {
    mask = max(diskMask(local, vec2f(0.0), 0.42), max(capsuleLine(local, vec2f(-0.86, -0.42), vec2f(0.0, 0.0), 0.08), capsuleLine(local, vec2f(0.0, 0.0), vec2f(0.82, 0.36), 0.08)));
  } else if ((layer > 5.5 && layer < 6.5) || (layer > 7.5 && layer < 8.5)) {
    mask = capsuleLine(local, vec2f(-0.92, -0.2), vec2f(0.92, 0.22 + sin(t * 0.6 + slot) * 0.18), 0.08);
  } else if (layer > 8.5 && layer < 10.5) {
    mask = max(smoothstep(1.0, 0.1, abs(local.x)) * smoothstep(-1.0, 0.85, local.y), stripe(local.y * 3.0 - t * 0.44, 0.04));
  } else {
    mask = max(rectMask(local, vec2f(0.0), vec2f(0.88, 0.56)), smoothstep(1.08, 0.88, length(local)));
  }
  let pulse = 0.74 + 0.26 * sin(t * (0.6 + anim * 0.09) + slot);
  return clamp(mask * style.w * pulse, 0.0, 1.0);
}

fn sceneRenderPacketScene(p: vec2f, t: f32, base: vec3f) -> vec3f {
  let strength = scenePacketStrength();
  if (strength <= 0.01) { return base; }
  var color = mix(base, u.palette2.rgb, strength * 0.08);
  for (var i = 0; i < 8; i = i + 1) {
    let obj = scenePacketObjectAt(i);
    let style = scenePacketStyleAt(i);
    let identity = scenePacketIdentityAt(i);
    let slot = f32(i);
    let mask = scenePacketObjectMask(p, obj, style, identity, slot, t);
    var tone = scenePacketLayerColor(style.x);
    if (identity.x > 0.5 && identity.x < 1.5) {
      tone = vec3f(0.72, 0.52, 0.32);
    } else if (identity.x > 1.5 && identity.x < 2.5) {
      tone = vec3f(0.88, 0.78, 0.56);
    } else if (identity.x > 3.5 && identity.x < 4.5) {
      tone = vec3f(0.04, 0.58, 0.95);
    } else if (identity.x > 5.5 && identity.x < 6.5) {
      tone = vec3f(1.0, 0.24, 0.06);
    }
    let layer = style.x;
    if (layer > 1.5 && layer < 2.5) {
      let ripple = stripe(length((p - vec2f((obj.x * 2.0 - 1.0) * max(u.viewport.x / max(u.viewport.y, 1.0), 0.1), (1.0 - obj.y) * 2.0 - 1.0)) * vec2f(1.0, 0.72)) * 7.0 - t * 0.42, 0.035);
      color += tone * mask * 0.42 + vec3f(0.82, 1.0, 0.96) * ripple * mask * 0.18;
    } else if (layer > 3.5 && layer < 4.5) {
      color += tone * mask * 0.48 + vec3f(1.0, 0.78, 0.18) * mask * stripe((p.x + p.y) * 5.0 - t * 0.7, 0.034) * 0.22;
    } else if (layer > 12.5 && layer < 14.5) {
      color = mix(color, tone, mask * 0.34);
      color += vec3f(0.9, 1.0, 0.82) * mask * starParticleField(p + vec2f(slot * 0.03, t * 0.04), t, 0.12) * 0.16;
    } else {
      color = mix(color, tone, mask * 0.46);
      color += tone * mask * 0.18;
    }
  }
  return mix(base, color, clamp(0.36 + strength * 0.5, 0.0, 0.9));
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
  } else if (sceneGroup == 3.0) {
    let shaft = capsuleLine(p, vec2f(-0.68, -0.14), vec2f(0.62, 0.16), 0.07);
    let rotor = ellipseRing(p, vec2f(0.2, 0.04), vec2f(1.0, 1.0), 0.28, 0.035);
    let contact = stripe(atan2(p.y - 0.04, p.x - 0.2) * 5.0 - t * (0.2 + motion * 0.2), 0.036) * rotor;
    color = mix(color, u.palette2.rgb, 0.18);
    color += u.palette1.rgb * shaft * 0.46;
    color += u.palette3.rgb * max(rotor, contact) * (0.26 + motion * 0.24);
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
  } else if (sceneGroup == 35.0) {
    let tray = rectMask(p, vec2f(0.0, -0.12), vec2f(0.82, 0.48));
    let wells = max(max(
      ellipseRing(p, vec2f(-0.44, 0.0), vec2f(1.0, 0.8), 0.16, 0.026),
      ellipseRing(p, vec2f(0.0, 0.02), vec2f(1.0, 0.8), 0.16, 0.026)),
      ellipseRing(p, vec2f(0.44, -0.02), vec2f(1.0, 0.8), 0.16, 0.026));
    let specimen = max(max(
      diskMask(p, vec2f(-0.44, 0.0), 0.12),
      diskMask(p, vec2f(0.0, 0.02), 0.1)),
      diskMask(p, vec2f(0.44, -0.02), 0.11));
    let readout = stripe(p.x * 10.0 + p.y * 3.0 - t * 0.2, 0.028) * tray;
    color = mix(color, vec3f(0.12, 0.13, 0.14), tray * 0.46);
    color += u.palette1.rgb * wells * 0.58;
    color += u.palette3.rgb * specimen * (0.28 + density * 0.22);
    color += vec3f(0.72, 0.9, 1.0) * readout * 0.16;
  } else if (sceneGroup == 36.0) {
    let artifact = rectMask(p, vec2f(0.0, -0.04), vec2f(0.66, 0.42));
    let pigment = stripe(p.y * 9.0 + sin(p.x * 5.0 + t * 0.06) * 0.18, 0.034) * artifact;
    let craquelure = atomStressCracks(p * vec2f(1.1, 0.8), t * 0.3) * artifact;
    let humidity = atomFluidRibbons(p + vec2f(0.0, t * 0.04), t * 0.25) * smoothstep(0.88, 0.12, length(p));
    color = mix(color, vec3f(0.22, 0.16, 0.09), artifact * 0.5);
    color += u.palette1.rgb * pigment * 0.38;
    color += vec3f(0.08, 0.1, 0.12) * craquelure * 0.52;
    color += u.palette3.rgb * humidity * 0.14;
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

fn atomPhaseBoundary(p: vec2f, t: f32) -> f32 {
  let body = smoothstep(0.84, 0.06, length(p * vec2f(0.9, 1.15)));
  return stripe(length(p) * 5.4 + sin(p.x * 3.0) - t * 0.18, 0.03) * body;
}

fn atomVectorFlow(p: vec2f, t: f32) -> f32 {
  let q = p + vec2f(sin(p.y * 4.0 + t * 0.42) * 0.08, 0.0);
  return max(atomFluidRibbons(q, t), stripe((q.x + q.y) * 5.0 - t * 0.38, 0.026)) * smoothstep(1.1, 0.08, length(p));
}

fn atomConstraintPads(p: vec2f, t: f32) -> f32 {
  let padA = diskMask(p, vec2f(-0.44, -0.18 + sin(t * 0.25) * 0.03), 0.12);
  let padB = diskMask(p, vec2f(0.42, 0.18 + cos(t * 0.22) * 0.03), 0.12);
  let bridge = capsuleLine(p, vec2f(-0.44, -0.18), vec2f(0.42, 0.18), 0.024);
  return max(max(padA, padB), bridge * 0.56);
}

fn atomSignalPulses(p: vec2f, t: f32) -> f32 {
  return stripe((p.x - p.y) * 6.0 - t * 0.58, 0.024) * smoothstep(1.04, 0.08, length(p));
}

fn atomOrbitalTrails(p: vec2f, t: f32) -> f32 {
  let angle = atan2(p.y, p.x);
  return stripe(angle * 2.4 + length(p) * 2.2 - t * 0.18, 0.026) * smoothstep(0.98, 0.08, length(p));
}

fn atomGravityWell(p: vec2f, t: f32) -> f32 {
  return stripe(length(p) * 4.6 - t * 0.1, 0.024) * smoothstep(1.0, 0.05, length(p));
}

fn atomFluxLines(p: vec2f, t: f32) -> f32 {
  return stripe(atan2(p.y, p.x) * 3.2 + length(p) * 2.2 - t * 0.18, 0.028) * smoothstep(0.96, 0.08, length(p));
}

fn atomChargeShell(p: vec2f, t: f32) -> f32 {
  return max(ellipseRing(p, vec2f(-0.22, 0.02), vec2f(1.2, 0.82), 0.28, 0.026),
    ellipseRing(p, vec2f(0.28, -0.02), vec2f(1.0, 1.1), 0.22, 0.024)) *
    (0.72 + 0.28 * sin(t * 0.8) * sin(t * 0.8));
}

fn atomOpticalCaustics(p: vec2f, t: f32) -> f32 {
  let beamA = exp(-abs(rot(p, 0.24).y) * 62.0) * smoothstep(-0.82, 0.76, p.x);
  let beamB = exp(-abs(rot(p, -0.32).y + 0.08) * 48.0) * smoothstep(-0.78, 0.72, p.x);
  return max(beamA, beamB) * (0.78 + 0.22 * sin(t + p.x * 4.0));
}

fn atomRayCones(p: vec2f, t: f32) -> f32 {
  let cone = exp(-abs(abs(rot(p - vec2f(-0.18, 0.02), 0.18).y) - max(0.02, (p.x + 0.25) * 0.18)) * 24.0);
  return cone * smoothstep(-0.78, 0.72, p.x);
}

fn atomReadoutPulse(p: vec2f, t: f32) -> f32 {
  let deck = rectMask(p, vec2f(0.0, 0.58), vec2f(0.78, 0.09));
  return deck * max(stripe(p.x * 12.0 - t * 0.8, 0.04), stripe((p.x + p.y) * 8.0 + t * 0.24, 0.03));
}

fn atomAcousticRings(p: vec2f, t: f32) -> f32 {
  return stripe(length((p - vec2f(-0.12, 0.02)) * vec2f(1.0, 0.72)) * 7.8 - t * 0.9, 0.026);
}

fn atomStandingNodes(p: vec2f, t: f32) -> f32 {
  return stripe(p.x * 7.0 + sin(p.y * 4.0 + t * 0.18), 0.03) * smoothstep(0.34, 0.02, abs(p.y));
}

fn atomBiologicalBranches(p: vec2f, t: f32) -> f32 {
  return branchWeb(p, t);
}

fn atomDensityFront(p: vec2f, t: f32) -> f32 {
  return smoothstep(0.06, 0.0, abs(length((p - vec2f(0.08, -0.02)) * vec2f(0.9, 1.18)) - 0.42 + sin(t * 0.28) * 0.05));
}

fn atomFermentationBubbles(p: vec2f, t: f32) -> f32 {
  let dough = smoothstep(0.72, 0.06, length((p - vec2f(0.02, -0.06)) * vec2f(0.8, 1.18)));
  let a = diskMask(p, vec2f(-0.32 + sin(t * 0.42) * 0.05, -0.05), 0.1);
  let b = diskMask(p, vec2f(0.2, 0.16 + cos(t * 0.41) * 0.05), 0.075);
  let c = diskMask(p, vec2f(0.38 + sin(t * 0.31) * 0.04, -0.24), 0.085);
  return max(max(a, b), c) * dough;
}

fn atomGlutenStrands(p: vec2f, t: f32) -> f32 {
  let dough = smoothstep(0.72, 0.06, length((p - vec2f(0.02, -0.06)) * vec2f(0.8, 1.18)));
  return exp(-abs(sin(p.x * 9.0 + p.y * 5.2 + sin(t * 0.22 + p.y * 4.0) * 0.7)) * 4.6) * dough;
}

fn atomAcidityGradient(p: vec2f, t: f32) -> f32 {
  let dough = smoothstep(0.72, 0.06, length((p - vec2f(0.02, -0.06)) * vec2f(0.8, 1.18)));
  return stripe((p.x + p.y * 0.72) * 5.4 - t * 0.22, 0.025) * dough;
}

fn atomChemicalClouds(p: vec2f, t: f32) -> f32 {
  let pool = smoothstep(0.68, 0.04, length((p - vec2f(0.12, 0.0)) * vec2f(1.0, 0.78)));
  return pool * (0.55 + 0.45 * filmNoise(p * 1.8, t * 0.4));
}

fn atomReactionFront(p: vec2f, t: f32) -> f32 {
  return stripe(length(p - vec2f(0.12, 0.0)) * 6.0 + t * 0.18, 0.026) * smoothstep(0.78, 0.06, length(p));
}

fn atomPacketPulses(p: vec2f, t: f32) -> f32 {
  let road = max(capsuleLine(p, vec2f(-0.82, -0.28), vec2f(0.78, 0.24), 0.024),
    capsuleLine(p, vec2f(-0.62, 0.34), vec2f(0.66, -0.18), 0.022));
  return road * stripe((p.x + p.y) * 5.0 - t * 0.86, 0.038);
}

fn atomGranularStrata(p: vec2f, t: f32) -> f32 {
  return max(stripe(p.y * 9.0 + sin(p.x * 4.0) * 0.12, 0.04), stripe((p.x - p.y) * 4.0, 0.03));
}

fn atomSedimentMotion(p: vec2f, t: f32) -> f32 {
  let fan = smoothstep(0.5, 0.04, length((p - vec2f(0.46, -0.36)) * vec2f(1.2, 0.7)));
  return fan * stripe(atan2(p.y + 0.36, p.x - 0.46) * 5.0 + t * 0.18, 0.035);
}

fn atomInstrumentReadout(p: vec2f, t: f32) -> f32 {
  let panel = rectMask(p, vec2f(-0.56, 0.42), vec2f(0.22, 0.14));
  let deck = rectMask(p, vec2f(0.0, 0.58), vec2f(0.86, 0.13));
  return max(panel, deck * max(stripe(p.x * 15.0 - t * 0.48, 0.035), stripe((p.x + p.y) * 9.0 + t * 0.2, 0.028)));
}

fn atomMeasurementBands(p: vec2f, t: f32) -> f32 {
  return stripe(p.x * 11.0 + p.y * 2.0 - t * 0.36, 0.028) * smoothstep(0.88, 0.1, abs(p.y - 0.42));
}

fn atomCombustionFront(p: vec2f, t: f32) -> f32 {
  return atomThermalPlume(p * vec2f(0.88, 1.1) + vec2f(sin(t * 0.36) * 0.08, -0.12), t);
}

fn atomSootColumn(p: vec2f, t: f32) -> f32 {
  return stripe(p.y * 5.5 + sin(p.x * 4.2 + t * 0.18) * 0.75 - t * 0.16, 0.03) *
    smoothstep(-0.18, 0.82, p.y);
}

fn atomLatentHeatBand(p: vec2f, t: f32) -> f32 {
  return stripe(max(abs(p.x), abs(p.y)) * 5.2 - t * 0.12, 0.027) * smoothstep(0.92, 0.06, length(p));
}

fn atomRobotWorkcell(p: vec2f, t: f32) -> f32 {
  let armTip = vec2f(0.5, 0.18 + sin(t * 1.8) * 0.14);
  let arm = max(capsuleLine(p, vec2f(-0.42, 0.12), vec2f(0.05, -0.06), 0.06),
    capsuleLine(p, vec2f(0.05, -0.06), armTip, 0.05));
  let cell = max(rectMask(p, vec2f(-0.62, 0.08), vec2f(0.09, 0.34)),
    rectMask(p, vec2f(0.66, 0.08), vec2f(0.08, 0.34)));
  return max(arm, cell * 0.64);
}

fn atomContactForces(p: vec2f, t: f32) -> f32 {
  let tip = vec2f(0.5, 0.18 + sin(t * 1.8) * 0.14);
  return max(diskMask(p, tip, 0.09), stripe(length(p - tip) * 5.0 - t * 0.8, 0.026) * smoothstep(0.42, 0.04, length(p - tip)));
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
  } else if (sceneGroup == 35.0) {
    color = mix(color, vec3f(0.06, 0.065, 0.07), 0.38);
    let tray = panel3d(p, vec2f(0.0, -0.1), vec2f(0.82, 0.48), vec3f(0.12, 0.13, 0.14), u.palette1.rgb);
    let wellA = orb3d(p, vec2f(-0.44, 0.0), 0.13, u.palette1.rgb * 0.7, u.palette3.rgb * 0.03, 0.36);
    let wellB = orb3d(p, vec2f(0.0, 0.02), 0.11, u.palette3.rgb * 0.68, u.palette1.rgb * 0.03, 0.42);
    let wellC = orb3d(p, vec2f(0.44, -0.02), 0.12, u.palette0.rgb * 0.76, u.palette3.rgb * 0.02, 0.5);
    color = blendLayer(color, tray);
    color = blendLayer(color, wellA);
    color = blendLayer(color, wellB);
    color = blendLayer(color, wellC);
    color += vec3f(0.82, 0.92, 1.0) * atomMeasurementBands(p, t) * 0.18;
    color += u.palette3.rgb * atomPhaseBoundary(p, t) * phase * 0.24;
  } else if (sceneGroup == 36.0) {
    color = mix(color, vec3f(0.16, 0.11, 0.07), 0.42);
    let artifact = panel3d(p, vec2f(0.0, -0.04), vec2f(0.66, 0.42), vec3f(0.26, 0.18, 0.1), u.palette1.rgb);
    let glaze = atomOpticalCaustics(p * vec2f(0.9, 1.2), t * 0.18) * artifact.a;
    let cracks = atomStressCracks(p * vec2f(1.15, 0.85), t * 0.22) * artifact.a;
    let humidity = atomFluidRibbons(p + vec2f(0.0, t * 0.04), t * 0.22) * smoothstep(0.88, 0.12, length(p));
    color = blendLayer(color, artifact);
    color += u.palette1.rgb * glaze * 0.2;
    color += vec3f(0.08, 0.07, 0.06) * cracks * 0.58;
    color += u.palette3.rgb * humidity * 0.14;
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
  let measurement = atomAt(17);
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
  color += vec3f(0.12, 0.56, 0.92) * fluid * max(atomFluidRibbons(p, t), atomVectorFlow(p, t)) * 0.22;
  color += vec3f(1.0, 0.86, 0.24) * stress * max(atomStressCracks(p, t), atomConstraintPads(p, t)) * 0.28;
  color += vec3f(0.34, 0.9, 1.0) * feedback * max(atomFeedbackArcs(p, t), atomSignalPulses(p, t)) * 0.22;
  color += vec3f(0.95, 0.82, 1.0) * quantum * atomQuantumFringes(p, t) * 0.24;
  color += vec3f(0.92, 0.68, 0.18) * networkLocal * max(atomNetworkPressure(p, t), atomPacketPulses(p, t)) * 0.2;
  color += vec3f(0.72, 0.8, 1.0) * optical * max(atomOpticalCaustics(p, t), atomRayCones(p, t)) * 0.24;
  color += vec3f(0.7, 0.85, 1.0) * em * max(atomFluxLines(p, t), atomChargeShell(p, t)) * 0.2;
  color += vec3f(0.8, 0.9, 1.0) * acoustic * max(atomAcousticRings(p, t), atomStandingNodes(p, t)) * 0.18;
  color += vec3f(0.3, 0.86, 0.42) * bio * max(atomBiologicalBranches(p, t), atomDensityFront(p, t)) * 0.12;
  color += vec3f(0.76, 0.48, 1.0) * chemical * max(atomChemicalClouds(p, t), atomReactionFront(p, t)) * 0.08;
  color += vec3f(0.86, 0.72, 0.42) * granular * max(atomGranularStrata(p, t), atomSedimentMotion(p, t)) * 0.16;
  color += vec3f(0.1, 0.95, 1.0) * instrument * atomInstrumentReadout(p, t) * 0.28;
  let detectorHit = diskMask(p, vec2f(-0.72 + fract(t * 0.76) * 1.44, 0.28 + sin(t * 1.1) * 0.2), 0.085);
  let detectorTrack = capsuleLine(p, vec2f(-0.88, -0.22 + sin(t * 0.7) * 0.12), vec2f(0.88, 0.18 + cos(t * 0.64) * 0.16), 0.024);
  color += vec3f(0.26, 1.0, 0.95) * instrument * detectorHit * 0.78;
  color += vec3f(0.92, 1.0, 0.8) * instrument * detectorTrack * (0.32 + stripe(t * 2.0, 0.32) * 0.34);
  color += vec3f(1.0, 0.18, 0.04) * combustion * max(atomCombustionFront(p, t), atomSootColumn(p, t)) * 0.3;
  color += vec3f(0.75, 0.92, 1.0) * phase * max(atomPhaseBoundary(p, t), atomLatentHeatBand(p, t)) * 0.18;
  color += vec3f(0.9, 0.92, 0.96) * robot * max(atomRobotWorkcell(p, t), atomContactForces(p, t)) * 0.14;
  color += u.palette1.rgb * density * exp(-abs(sin(p.x * 8.0) + cos(p.y * 6.0 + t * 0.12)) * 2.4) * 0.08;
  color += u.palette3.rgb * emission * exp(-abs(rot(p, 0.72).y) * 34.0) * 0.18;
  color += vec3f(1.0, 0.92, 0.36) * constraint * atomConstraintPads(p, t) * 0.22;
  color += u.palette3.rgb * signal * max(atomSignalPulses(p, t), atomReadoutPulse(p, t)) * 0.18;
  color += u.palette1.rgb * surface * stripe(max(abs(p.x), abs(p.y)) * 5.0 + t * 0.08, 0.028) * 0.12;
  color += u.palette3.rgb * motion * stripe(length(p) * 4.8 - t * 0.62, 0.02) * 0.14;
  color += u.palette3.rgb * orbit * max(atomOrbitalTrails(p, t), atomGravityWell(p, t)) * 0.18;
  color += vec3f(0.96, 0.82, 0.46) * min(bio, fluid) * atomGlutenStrands(p, t) * 0.16;
  color += vec3f(0.7, 0.96, 0.86) * min(bio, fluid) * atomFermentationBubbles(p, t) * 0.22;
  color += vec3f(1.0, 0.42, 0.72) * min(bio, chemical) * atomAcidityGradient(p, t) * 0.18;
  color += vec3f(0.98, 0.22, 0.78) * max(measurement, signal) * atomMeasurementBands(p, t) * 0.2;
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

fn graphComposedVisualIrScene(p: vec2f, t: f32, base: vec3f) -> vec3f {
  var color = base;
  let biologicalAgent = visualIrAt(0);
  let waterVolume = visualIrAt(1);
  let detectorGeometry = visualIrAt(2);
  let nodeGraph = visualIrAt(3);
  let readoutPanel = visualIrAt(4);
  let trackLine = visualIrAt(5);
  let fieldSheet = visualIrAt(6);
  let flowField = visualIrAt(7);
  let thermalField = visualIrAt(8);
  let opticalField = visualIrAt(9);
  let networkFlow = visualIrAt(10);
  let materialSurface = visualIrAt(11);
  let organicMatrix = visualIrAt(12);
  let bubbleVolume = visualIrAt(13);
  let constraintSurface = visualIrAt(14);
  let causalAffordance = visualIrAt(15);
  let processPulse = visualIrAt(16);
  let particleSwarm = visualIrAt(17);
  let robotArmature = visualIrAt(18);
  let granularStrata = visualIrAt(19);
  let orbitalBody = visualIrAt(20);
  let acousticWaveguide = visualIrAt(21);
  let chemicalFront = visualIrAt(22);
  let phaseBoundary = visualIrAt(23);
  let layerTotal = clamp(
    biologicalAgent + waterVolume + detectorGeometry + nodeGraph + readoutPanel + trackLine +
    fieldSheet + flowField + thermalField + opticalField + networkFlow + materialSurface +
    organicMatrix + bubbleVolume + constraintSurface + causalAffordance + processPulse +
    particleSwarm + robotArmature + granularStrata + orbitalBody + acousticWaveguide +
    chemicalFront + phaseBoundary,
    0.0,
    12.0
  );

  let waterBody = smoothstep(0.34, 0.0, abs(p.y + 0.32 + sin(p.x * 2.4 + t * 0.08) * 0.08)) *
    (1.0 - smoothstep(0.72, 1.24, abs(p.x)));
  let waterRidges = max(atomFluidRibbons(p + vec2f(0.0, t * 0.04), t), atomVectorFlow(p, t)) * waterBody;
  color = mix(color, vec3f(0.02, 0.2, 0.32), waterVolume * waterBody * 0.48);
  color += vec3f(0.12, 0.64, 1.0) * waterVolume * waterRidges * 0.42;

  let animalCenterA = vec2f(-0.34 + sin(t * 0.42) * 0.05, -0.11 + sin(t * 0.7) * 0.05);
  let animalCenterB = vec2f(0.32 + cos(t * 0.36) * 0.045, 0.1 + cos(t * 0.54) * 0.04);
  let animalLocalA = rot(p - animalCenterA, 0.12 + sin(t * 0.3) * 0.06);
  let animalLocalB = rot(p - animalCenterB, -0.22 + cos(t * 0.28) * 0.06);
  let animalBodyA = max(capsuleLine(animalLocalA, vec2f(-0.22, -0.02), vec2f(0.18, 0.02), 0.095),
    max(diskMask(animalLocalA, vec2f(0.26, 0.04), 0.073), capsuleLine(animalLocalA, vec2f(-0.28, -0.02), vec2f(-0.44, -0.1 + sin(t) * 0.04), 0.028)));
  let animalBodyB = max(capsuleLine(animalLocalB, vec2f(-0.18, 0.0), vec2f(0.2, 0.04), 0.082),
    max(diskMask(animalLocalB, vec2f(0.27, 0.05), 0.062), capsuleLine(animalLocalB, vec2f(-0.24, 0.0), vec2f(-0.38, 0.12 + cos(t) * 0.035), 0.024)));
  let swimWake = max(
    capsuleLine(p, animalCenterA - vec2f(0.34, 0.08), animalCenterA - vec2f(0.08, 0.01), 0.018),
    capsuleLine(p, animalCenterB - vec2f(0.32, -0.08), animalCenterB - vec2f(0.08, -0.02), 0.016)
  );
  let bioWater = min(biologicalAgent, waterVolume);
  color += vec3f(0.74, 0.62, 0.42) * biologicalAgent * max(animalBodyA, animalBodyB) * 0.82;
  color += vec3f(0.85, 1.0, 0.96) * bioWater * swimWake * (0.34 + waterRidges * 0.28);

  let detectorShell = max(
    ellipseRing(p, vec2f(0.0, -0.02), vec2f(0.76, 1.12), 0.62, 0.032),
    ellipseRing(p, vec2f(0.0, -0.02), vec2f(1.08, 0.72), 0.44, 0.022)
  );
  let detectorSegments = detectorShell * max(stripe(atan2(p.y + 0.02, p.x) * 9.0 + t * 0.1, 0.036),
    stripe(length(p) * 8.0, 0.024));
  let detectorPanel = panel3d(p, vec2f(0.0, 0.58), vec2f(0.86, 0.12), vec3f(0.02, 0.055, 0.08), vec3f(0.1, 0.94, 1.0));
  color += vec3f(0.16, 0.9, 1.0) * detectorGeometry * detectorShell * 0.56;
  color += vec3f(1.0, 0.72, 0.18) * detectorGeometry * detectorSegments * 0.28;
  color = mix(color, detectorPanel.rgb, detectorGeometry * readoutPanel * detectorPanel.a * 0.58);

  let trackA = capsuleLine(p, vec2f(-0.86, -0.2 + sin(t * 0.42) * 0.06), vec2f(0.82, 0.24 + cos(t * 0.38) * 0.08), 0.017);
  let trackB = capsuleLine(p, vec2f(-0.74, 0.32), vec2f(0.58, -0.34 + sin(t * 0.34) * 0.08), 0.014);
  let hitA = diskMask(p, vec2f(-0.78 + fract(t * 0.68) * 1.56, -0.16 + sin(t * 0.9) * 0.1), 0.065);
  let hitB = diskMask(p, vec2f(0.7 - fract(t * 0.54) * 1.4, 0.28 + cos(t * 0.78) * 0.12), 0.052);
  color += vec3f(0.92, 1.0, 0.76) * trackLine * max(trackA, trackB) * 0.58;
  color += vec3f(0.2, 1.0, 0.92) * max(trackLine, detectorGeometry) * max(hitA, hitB) * 0.66;

  let readoutShape = max(atomInstrumentReadout(p, t), atomMeasurementBands(p, t));
  color += vec3f(0.18, 0.88, 1.0) * readoutPanel * readoutShape * 0.5;

  let graphEdgeA = capsuleLine(p, vec2f(-0.62, -0.22), vec2f(0.0, 0.16), 0.019);
  let graphEdgeB = capsuleLine(p, vec2f(0.0, 0.16), vec2f(0.58, -0.1), 0.019);
  let graphEdgeC = capsuleLine(p, vec2f(-0.42, 0.42), vec2f(0.0, 0.16), 0.016);
  let graphEdgeD = capsuleLine(p, vec2f(0.58, -0.1), vec2f(0.46, 0.42), 0.016);
  let graphNodes = max(max(diskMask(p, vec2f(-0.62, -0.22), 0.065), diskMask(p, vec2f(0.0, 0.16), 0.076)),
    max(max(diskMask(p, vec2f(0.58, -0.1), 0.062), diskMask(p, vec2f(-0.42, 0.42), 0.054)), diskMask(p, vec2f(0.46, 0.42), 0.054)));
  let graphPulse = stripe((p.x + p.y) * 5.8 - t * 0.78, 0.033) * max(max(graphEdgeA, graphEdgeB), max(graphEdgeC, graphEdgeD));
  color += vec3f(0.12, 0.48, 1.0) * nodeGraph * max(max(graphEdgeA, graphEdgeB), max(graphEdgeC, graphEdgeD)) * 0.54;
  color += vec3f(1.0, 0.78, 0.18) * max(nodeGraph, networkFlow) * max(graphNodes, graphPulse) * 0.48;
  color += vec3f(0.16, 0.72, 1.0) * networkFlow * atomPacketPulses(p, t) * 0.36;

  let surfaceBody = panel3d(p, vec2f(0.0, -0.1), vec2f(0.78, 0.28), vec3f(0.18, 0.16, 0.13), vec3f(0.9, 0.74, 0.42));
  color = mix(color, surfaceBody.rgb, materialSurface * surfaceBody.a * 0.28);
  color += vec3f(1.0, 0.82, 0.24) * constraintSurface * max(atomStressCracks(p, t), atomConstraintPads(p, t)) * 0.36;

  let dough = smoothstep(0.72, 0.06, length((p - vec2f(0.02, -0.06)) * vec2f(0.78, 1.16)));
  color = mix(color, vec3f(0.38, 0.24, 0.14), organicMatrix * dough * 0.42);
  color += vec3f(0.96, 0.78, 0.4) * organicMatrix * atomGlutenStrands(p, t) * 0.46;
  color += vec3f(0.72, 0.98, 0.86) * bubbleVolume * max(atomFermentationBubbles(p, t), starParticleField(p, t, 0.09)) * 0.54;

  let fieldGrid = max(stripe(p.x * 6.0 + sin(p.y * 3.0), 0.024), stripe(p.y * 5.2 + cos(p.x * 2.5), 0.024)) *
    (1.0 - smoothstep(0.72, 1.22, length(p)));
  color += vec3f(0.4, 0.78, 1.0) * fieldSheet * fieldGrid * 0.25;
  color += vec3f(0.12, 0.72, 1.0) * flowField * max(atomVectorFlow(p, t), atomFluidRibbons(p, t)) * 0.34;
  color += vec3f(1.0, 0.28, 0.08) * thermalField * max(atomThermalPlume(p, t), atomCombustionFront(p, t)) * 0.38;
  color += vec3f(1.0, 0.92, 0.64) * opticalField * max(atomOpticalCaustics(p, t), atomRayCones(p, t)) * 0.36;
  color += vec3f(0.52, 0.82, 1.0) * acousticWaveguide * max(atomAcousticRings(p, t), atomStandingNodes(p, t)) * 0.32;
  color += vec3f(0.8, 0.48, 1.0) * chemicalFront * max(atomChemicalClouds(p, t), atomReactionFront(p, t)) * 0.32;
  color += vec3f(0.78, 0.92, 1.0) * phaseBoundary * max(atomPhaseBoundary(p, t), atomLatentHeatBand(p, t)) * 0.3;
  color += vec3f(0.96, 0.66, 0.22) * granularStrata * max(atomGranularStrata(p, t), atomSedimentMotion(p, t)) * 0.34;
  color += vec3f(0.9, 0.94, 1.0) * orbitalBody * max(atomOrbitalTrails(p, t), atomGravityWell(p, t)) * 0.32;
  color += vec3f(1.0, 0.78, 0.22) * particleSwarm * starParticleField(p + vec2f(0.0, t * 0.08), t, 0.2) * 0.48;
  color += vec3f(0.88, 0.94, 1.0) * robotArmature * max(atomRobotWorkcell(p, t), atomContactForces(p, t)) * 0.36;

  let causalArrowA = capsuleLine(p, vec2f(-0.62, 0.54), vec2f(0.34, 0.38 + sin(t * 0.34) * 0.05), 0.018);
  let causalArrowHead = max(
    capsuleLine(p, vec2f(0.34, 0.38), vec2f(0.22, 0.48), 0.016),
    capsuleLine(p, vec2f(0.34, 0.38), vec2f(0.2, 0.3), 0.016)
  );
  let processRings = stripe(length((p - vec2f(0.02, 0.02)) * vec2f(1.0, 0.82)) * 5.6 - t * 0.52, 0.026) *
    (1.0 - smoothstep(0.62, 1.1, length(p)));
  color += vec3f(1.0, 0.86, 0.18) * causalAffordance * max(causalArrowA, causalArrowHead) * 0.56;
  color += vec3f(0.96, 0.46, 1.0) * processPulse * processRings * 0.28;

  return mix(base, color, clamp(0.16 + layerTotal * 0.055, 0.0, 0.78));
}

fn composedVisualIrScene(p: vec2f, t: f32, base: vec3f) -> vec3f {
  var color = base;
  let thermalScene = sceneMixAt(0);
  let waterScene = sceneMixAt(1);
  let mechanicalScene = sceneMixAt(2);
  let magneticScene = sceneMixAt(3);
  let opticalScene = sceneMixAt(4);
  let acousticScene = sceneMixAt(5);
  let biologicalScene = sceneMixAt(6);
  let chemicalScene = sceneMixAt(7);
  let orbitalScene = sceneMixAt(8);
  let networkScene = sceneMixAt(9);
  let energyScene = sceneMixAt(10);
  let roboticScene = sceneMixAt(11);
  let granularScene = sceneMixAt(12);
  let instrumentScene = sceneMixAt(13);
  let phaseScene = sceneMixAt(14);
  let hazardScene = sceneMixAt(15);
  let sceneTotal = clamp(
    thermalScene + waterScene + mechanicalScene + magneticScene + opticalScene + acousticScene +
    biologicalScene + chemicalScene + orbitalScene + networkScene + energyScene + roboticScene +
    granularScene + instrumentScene + phaseScene + hazardScene,
    0.0,
    6.0
  );

  let ground = smoothstep(0.08, 0.0, abs(p.y + 0.52 + sin(p.x * 2.8 + t * 0.08) * 0.06));
  let waterPath = smoothstep(0.065, 0.0, abs(p.y + 0.12 + sin(p.x * 3.2 + t * 0.1) * 0.14));
  let sedimentFan = smoothstep(0.52, 0.04, length((p - vec2f(0.46, -0.36)) * vec2f(1.15, 0.72)));
  let flowBands = max(atomFluidRibbons(p + vec2f(0.0, t * 0.035), t), atomVectorFlow(p, t));
  color = mix(color, vec3f(0.04, 0.11, 0.08), waterScene * 0.1);
  color += vec3f(0.06, 0.52, 0.96) * waterScene * max(waterPath, flowBands * 0.46) * 0.46;
  color += vec3f(0.72, 0.52, 0.22) * max(waterScene, granularScene) * max(ground, sedimentFan) * 0.22;

  let fireBed = panel3d(p, vec2f(0.0, -0.58), vec2f(0.84, 0.12), vec3f(0.16, 0.055, 0.025), vec3f(1.0, 0.24, 0.04)).w;
  color += vec3f(1.0, 0.24, 0.04) * thermalScene * max(atomThermalPlume(p, t), fireBed) * 0.42;
  color += vec3f(0.98, 0.7, 0.2) * max(thermalScene, phaseScene) * atomLatentHeatBand(p, t) * 0.18;

  let mechanicalLinks = max(
    capsuleLine(p, vec2f(-0.72, -0.16), vec2f(0.62, 0.18), 0.055),
    ellipseRing(p, vec2f(0.22, 0.04), vec2f(1.0, 1.0), 0.27, 0.032)
  );
  color += vec3f(0.86, 0.9, 0.96) * mechanicalScene * mechanicalLinks * 0.38;
  color += vec3f(1.0, 0.78, 0.2) * max(mechanicalScene, granularScene) * atomStressCracks(p, t) * 0.24;

  color += vec3f(0.32, 0.64, 1.0) * magneticScene * atomFluxLines(p, t) * 0.36;
  color += vec3f(0.96, 0.16, 0.82) * max(magneticScene, energyScene) * atomChargeShell(p, t) * 0.26;

  let filmBody = smoothstep(0.78, 0.08, length((p - vec2f(0.02, -0.02)) * vec2f(0.7, 1.04)));
  let spectral = vec3f(
    0.58 + 0.42 * sin(p.x * 9.0 + p.y * 6.0 + t * 0.16),
    0.58 + 0.42 * sin(p.x * 9.0 + p.y * 6.0 + t * 0.16 + 2.09),
    0.58 + 0.42 * sin(p.x * 9.0 + p.y * 6.0 + t * 0.16 + 4.18)
  );
  color = mix(color, spectral, opticalScene * filmBody * 0.24);
  color += vec3f(1.0, 0.95, 0.78) * opticalScene * max(atomOpticalCaustics(p, t), atomRayCones(p, t)) * 0.34;
  color += vec3f(0.72, 0.96, 1.0) * max(opticalScene, energyScene) * atomQuantumFringes(p, t) * 0.22;

  color += vec3f(0.45, 0.78, 1.0) * acousticScene * max(atomAcousticRings(p, t), atomStandingNodes(p, t)) * 0.38;

  let branch = branchWeb(p + vec2f(0.08, 0.1), t);
  let cells = max(
    diskMask(p, vec2f(-0.42 + sin(t * 0.36) * 0.06, -0.12), 0.095),
    diskMask(p, vec2f(0.34 + cos(t * 0.31) * 0.05, 0.18), 0.08)
  );
  color += vec3f(0.24, 0.88, 0.34) * biologicalScene * max(branch, cells) * 0.42;
  color += vec3f(0.72, 0.96, 0.86) * min(biologicalScene + waterScene, 1.0) * atomFermentationBubbles(p, t) * 0.2;

  color += vec3f(0.72, 0.42, 1.0) * chemicalScene * max(atomChemicalClouds(p, t), atomReactionFront(p, t)) * 0.24;
  color += vec3f(1.0, 0.44, 0.72) * max(chemicalScene, phaseScene) * atomAcidityGradient(p, t) * 0.18;

  color = mix(color, vec3f(0.012, 0.02, 0.06), orbitalScene * smoothstep(1.1, 0.1, length(p)) * 0.28);
  color += vec3f(0.82, 0.94, 1.0) * orbitalScene * starParticleField(p, t, 0.14 + orbitalScene * 0.12) * 0.58;
  color += u.palette3.rgb * orbitalScene * max(atomOrbitalTrails(p, t), atomGravityWell(p, t)) * 0.32;

  color += vec3f(0.16, 0.56, 1.0) * networkScene * max(atomNetworkPressure(p, t), atomPacketPulses(p, t)) * 0.42;
  color += vec3f(1.0, 0.76, 0.18) * max(networkScene, instrumentScene) * atomSignalPulses(p, t) * 0.26;

  color += vec3f(0.86, 0.2, 1.0) * energyScene * ellipseRing(p, vec2f(0.0, 0.02), vec2f(1.2, 0.72), 0.52, 0.04) * 0.36;
  color += vec3f(0.18, 0.92, 1.0) * energyScene * stripe(atan2(p.y, p.x) * 4.0 + length(p) * 3.0 - t * 0.28, 0.032) * smoothstep(0.95, 0.08, length(p)) * 0.22;

  color += vec3f(0.86, 0.92, 0.96) * roboticScene * max(atomRobotWorkcell(p, t), atomContactForces(p, t)) * 0.42;
  color += vec3f(1.0, 0.58, 0.16) * roboticScene * rectMask(p, vec2f(-0.78 + fract(t * 0.62) * 1.56, -0.48), vec2f(0.13, 0.08)) * 0.58;

  let strata = atomGranularStrata(p, t);
  let pile = smoothstep(0.08, 0.0, abs(p.y + 0.58 - abs(p.x) * 0.34)) * smoothstep(0.78, 0.04, abs(p.x));
  color += vec3f(0.72, 0.5, 0.22) * granularScene * max(strata, pile) * 0.42;
  color += vec3f(1.0, 0.66, 0.22) * granularScene * starParticleField(p + vec2f(0.0, t * 0.04), t, 0.12) * 0.18;

  let readout = max(atomInstrumentReadout(p, t), atomMeasurementBands(p, t));
  let detector = max(
    diskMask(p, vec2f(-0.72 + fract(t * 0.7) * 1.44, 0.26 + sin(t * 1.1) * 0.2), 0.08),
    capsuleLine(p, vec2f(-0.86, -0.22 + sin(t * 0.7) * 0.12), vec2f(0.86, 0.18 + cos(t * 0.64) * 0.16), 0.022)
  );
  color += vec3f(0.12, 0.9, 1.0) * instrumentScene * readout * 0.42;
  color += vec3f(0.92, 1.0, 0.82) * instrumentScene * detector * 0.34;

  color += vec3f(0.72, 0.92, 1.0) * phaseScene * max(atomPhaseBoundary(p, t), atomLatentHeatBand(p, t)) * 0.26;
  color += vec3f(1.0, 0.22, 0.05) * hazardScene * max(atomCombustionFront(p, t), stripe(length(p) * 5.8 - t * 0.3, 0.03)) * 0.34;
  color += vec3f(0.1, 0.64, 1.0) * hazardScene * atomDensityFront(p, t) * 0.22;

  return mix(base, color, clamp(0.18 + sceneTotal * 0.08, 0.0, 0.72));
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
  color = graphComposedVisualIrScene(p, t, color);
  color = composedVisualIrScene(p, t, color);
  color = sceneRenderPacketScene(p, t, color);
  color = atomOperatorOverlays(p, t, color);
  let vignette = smoothstep(1.45, 0.18, length(p));
  color = mix(color * 0.78, color, vignette);
  color = pow(max(color, vec3f(0.0)), vec3f(0.92));
  return vec4f(color, 1.0);
}
`;

  return { create };
});
