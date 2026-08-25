(function attachAutonomyWebGpuRenderer(root, factory) {
  const math = typeof module === 'object' && module.exports
    ? require('./webgpu-math.js')
    : root.SimulatteAutonomyGpuMath;
  const geometry = typeof module === 'object' && module.exports
    ? require('./webgpu-geometry.js')
    : root.SimulatteAutonomyGpuGeometry;
  const cameraController = typeof module === 'object' && module.exports
    ? require('./camera-controller.js')
    : root.SimulatteAutonomyCamera;
  const presentationCompiler = typeof module === 'object' && module.exports
    ? require('./plugin-presentation.js')
    : root.SimulattePluginPresentation;
  const semanticLabels = typeof module === 'object' && module.exports
    ? require('./semantic-label-overlay.js')
    : root.SimulatteSemanticLabelOverlay;
  const passApi = typeof module === 'object' && module.exports
    ? require('./webgpu-pass.js')
    : root.SimulatteAutonomyGpuPass;
  const api = factory(math, geometry, cameraController, presentationCompiler, semanticLabels, passApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyWebGpuRenderer(math, geometry, cameraController, presentationCompiler, semanticLabels, passApi) {
  const SAMPLE_COUNT = 1;
  const MINIMAP_RADIUS_M = 420;
  const MINIMAP_FRAME_INTERVAL_MS = 1000 / 10;
  const PRIMARY_RENDER_INTERVAL_MS = 1000 / 45;
  const SHADER = `
struct Uniforms {
  viewProjection: mat4x4<f32>,
  cameraPosition: vec4<f32>,
  lightDirection: vec4<f32>,
  fogColorDensity: vec4<f32>,
  timeViewport: vec4<f32>,
}

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) emissive: f32,
  @location(4) material: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) emissive: f32,
  @location(4) material: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.clipPosition = uniforms.viewProjection * vec4<f32>(input.position, 1.0);
  output.worldPosition = input.position;
  output.normal = input.normal;
  output.color = input.color;
  output.emissive = input.emissive;
  output.material = input.material;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let normal = normalize(input.normal);
  let lightDirection = normalize(-uniforms.lightDirection.xyz);
  let viewDirection = normalize(uniforms.cameraPosition.xyz - input.worldPosition);
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let roughness = clamp(input.material.y, 0.06, 1.0);
  let metallic = clamp(input.material.x, 0.0, 1.0);
  let specularPower = mix(180.0, 7.0, roughness);
  let fresnelBase = mix(vec3<f32>(0.035), input.color.rgb, vec3<f32>(metallic));
  let fresnel = fresnelBase + (vec3<f32>(1.0) - fresnelBase) * pow(1.0 - max(dot(viewDirection, halfDirection), 0.0), 5.0);
  let specular = fresnel * pow(max(dot(normal, halfDirection), 0.0), specularPower) * mix(1.3, 0.18, roughness);
  let rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0) * 0.08;
  // Static roads, buildings, and grid lines must remain temporally stable.
  // Only high-emissive dynamic signals are allowed to pulse; animating every
  // map fragment makes thin geometry shimmer as the camera moves.
  let pulse = select(1.0, 0.82 + 0.18 * sin(uniforms.timeViewport.x * 2.4 + input.worldPosition.x * 0.018 - input.worldPosition.z * 0.012), input.emissive > 0.8);
  let diffuseColor = input.color.rgb * (0.2 + diffuse * 0.74) * (1.0 - metallic * 0.38);
  let lit = diffuseColor + specular + input.color.rgb * rim + input.color.rgb * input.emissive * pulse;
  let toneMapped = lit / (lit + vec3<f32>(0.85));
  let cameraDistance = distance(uniforms.cameraPosition.xyz, input.worldPosition);
  let fogAmount = clamp(1.0 - exp(-cameraDistance * uniforms.fogColorDensity.w), 0.0, 0.88);
  return vec4<f32>(mix(toneMapped, uniforms.fogColorDensity.rgb, fogAmount), input.color.a);
}
`;

  async function createCanvasRenderer(canvas, worldModel, options = {}) {
    const cameraApi = resolveCameraController(cameraController);
    if (!passApi?.createPipelines || !passApi?.encodeScene) {
      throw rendererError('webgpu_pass_runtime_missing', 'WebGPU pass composition runtime is unavailable');
    }
    if (!globalThis.navigator?.gpu) throw rendererError('webgpu_unavailable', 'This simulation requires a browser with WebGPU enabled');
    if (!worldModel.world.renderGeometry) throw rendererError('render_geometry_missing', `World ${worldModel.world.id} has no compiled renderGeometry`);
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw rendererError('webgpu_adapter_missing', 'WebGPU did not return a compatible adapter');
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) throw rendererError('webgpu_context_missing', 'Canvas did not provide a WebGPU context');
    const minimapCanvas = options.minimapCanvas || null;
    const minimapContext = minimapCanvas ? minimapCanvas.getContext('webgpu') : null;
    const labelCanvas = options.labelCanvas || null;
    if (minimapCanvas && !minimapContext) throw rendererError('webgpu_minimap_context_missing', 'Follow minimap did not provide a WebGPU context');
    if (labelCanvas && !semanticLabels?.draw) throw rendererError('semantic_label_runtime_missing', 'Semantic label canvas requires the label overlay runtime');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
      colorSpace: 'srgb',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    minimapContext?.configure({ device, format, alphaMode: 'opaque', colorSpace: 'srgb' });
    const shader = device.createShaderModule({ label: 'autonomy-map-shader', code: SHADER });
    const compilation = await shader.getCompilationInfo();
    const shaderErrors = compilation.messages.filter((row) => row.type === 'error');
    if (shaderErrors.length) throw rendererError('webgpu_shader_invalid', shaderErrors.map((row) => `${row.lineNum}:${row.linePos} ${row.message}`).join('\n'));
    const cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'autonomy-camera-bind-group-layout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });
    const cameraPipelineLayout = device.createPipelineLayout({
      label: 'autonomy-camera-pipeline-layout',
      bindGroupLayouts: [cameraBindGroupLayout],
    });
    const pipelines = passApi.createPipelines({
      device,
      layout: cameraPipelineLayout,
      module: shader,
      format,
      floatsPerVertex: geometry.FLOATS_PER_VERTEX,
      sampleCount: SAMPLE_COUNT,
    });
    const uniformBuffer = device.createBuffer({ label: 'autonomy-camera-uniforms', size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const uniformData = new Float32Array(32);
    const bindGroup = device.createBindGroup({
      label: 'autonomy-map-bind-group',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    const minimapUniformBuffer = minimapCanvas
      ? device.createBuffer({ label: 'autonomy-minimap-uniforms', size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
      : null;
    const minimapUniformData = minimapCanvas ? new Float32Array(32) : null;
    const minimapBindGroup = minimapUniformBuffer
      ? device.createBindGroup({
        label: 'autonomy-minimap-bind-group',
        layout: cameraBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: minimapUniformBuffer } }],
      })
      : null;
    const staticData = geometry.createStaticGeometry(worldModel.world, { detail: 'full' });
    const overviewStaticData = geometry.createStaticGeometry(worldModel.world, { detail: 'overview' });
    const groundOverlayData = geometry.createGroundOverlayGeometry(worldModel.world);
    const staticBuffer = createVertexBuffer(device, staticData, 'autonomy-static-geometry');
    const overviewStaticBuffer = createVertexBuffer(device, overviewStaticData, 'autonomy-overview-static-geometry');
    const groundOverlayBuffer = createVertexBuffer(device, groundOverlayData, 'autonomy-ground-overlay-geometry');
    const state = {
      ...cameraApi.createCameraState(worldModel.world, worldModel, options.regionRegistry, options.regionPacks),
      routeIdentity: null,
      latestSnapshot: null,
      latestReceipt: null,
      tracePositions: [],
      dynamicData: new Float32Array(),
      dynamicWriter: geometry.createWriter(1048576),
      dynamicBuffer: null,
      dynamicCapacity: 0,
      pluginStaticData: new Float32Array(),
      pluginStaticWriter: geometry.createWriter(262144),
      pluginStaticBuffer: null,
      pluginStaticCapacity: 0,
      pluginOverlayData: new Float32Array(),
      pluginOverlayWriter: geometry.createWriter(262144),
      pluginOverlayBuffer: null,
      pluginOverlayCapacity: 0,
      pluginShadowData: new Float32Array(),
      pluginShadowWriter: geometry.createWriter(262144),
      pluginShadowBuffer: null,
      pluginShadowCapacity: 0,
      pluginDynamicData: new Float32Array(),
      pluginDynamicWriter: geometry.createWriter(262144),
      pluginDynamicBuffer: null,
      pluginDynamicCapacity: 0,
      coreDynamicSnapshot: null,
      coreDynamicReceipt: null,
      coreDynamicTraceLength: -1,
      frameCount: 0,
      frameCpuMs: [],
      firstFrameAt: null,
      startedAt: performance.now(),
      animationFrame: null,
      renderTargets: null,
      minimapTargets: null,
      minimapFrameCount: 0,
      minimapLastRenderAt: -Infinity,
      minimapWasVisible: false,
      lastSubmittedFrameAt: -Infinity,
      staticData,
      staticBuffer,
      overviewStaticData,
      overviewStaticBuffer,
      pluginScene: presentationCompiler.compile([], worldModel),
      pluginTransitionActors: new Map(),
      pluginSimulationTimeSeconds: 0,
      pluginAnimationStartedAt: performance.now(),
      workCpuMs: {
        pluginCompile: [],
        pluginStaticGeometry: [],
        pluginDynamicGeometry: [],
        coreDynamicGeometry: [],
      },
      semanticLabelReceipt: null,
      isDestroyed: false,
    };
    const adapterInfo = readAdapterInfo(adapter);
    canvas.dataset.rendererBackend = 'webgpu';
    canvas.dataset.adapterName = adapterInfo.description || adapterInfo.device || adapterInfo.architecture || 'WebGPU adapter';
    canvas.dataset.actorMeshSchema = geometry.ACTOR_MESH_SCHEMA;
    canvas.dataset.actorMeshKinds = geometry.SUPPORTED_ACTOR_KINDS.join(',');
    canvas.dataset.materialModel = geometry.MATERIAL_MODEL;
    canvas.dataset.worldSurfaceOwner = worldModel.world.renderGeometry.surfaceOwner || 'core';
    canvas.dataset.ambientActorCount = String(worldModel.ambientCompilation.actors.length);
    canvas.dataset.ambientActorKinds = Object.entries(worldModel.ambientCompilation.counts)
      .filter(([, count]) => count > 0).map(([kind]) => kind).join(',');
    canvas.dataset.cameraMode = state.mode;
    canvas.dataset.cameraFocus = state.focusId;
    canvas.dataset.cameraTransition = 'settled';
    canvas.dataset.followMinimap = 'hidden';
    if (minimapCanvas) {
      minimapCanvas.dataset.projection = 'orthographic_top_north_up';
      minimapCanvas.dataset.radiusM = String(MINIMAP_RADIUS_M);
    }
    installCameraControls(canvas, state, cameraApi, options.onCameraInteraction);
    device.lost.then((info) => {
      canvas.dataset.rendererLost = 'true';
      if (!state.isDestroyed && typeof options.onFailure === 'function') options.onFailure(rendererError('webgpu_device_lost', `${info.reason}: ${info.message}`));
    });

    function render(snapshot, tickReceipt = null) {
      state.latestSnapshot = snapshot;
      state.latestReceipt = tickReceipt || state.latestReceipt;
      if (!state.routeIdentity && snapshot.route?.segmentIds?.length) {
        state.routeIdentity = snapshot.route.segmentIds.join('|');
        cameraApi.updateRouteTarget(state, snapshot.route.segmentIds, worldModel, worldModel.world, performance.now());
      }
      const position = snapshot.state.position;
      if (position && (!state.tracePositions.length || pointDistance(position, state.tracePositions.at(-1)) > 0.15)) state.tracePositions.push({ ...position });
      refreshDynamicGeometry();
    }

    function refreshDynamicGeometry() {
      if (!state.latestSnapshot) return;
      const snapshot = snapshotAtRenderTime(state.latestSnapshot, state.pluginSimulationTimeSeconds);
      if (state.coreDynamicSnapshot !== state.latestSnapshot
        || state.coreDynamicReceipt !== state.latestReceipt
        || state.coreDynamicTraceLength !== state.tracePositions.length) {
        const coreStartedAt = performance.now();
        state.dynamicData = geometry.createDynamicGeometry(worldModel, snapshot, state.latestReceipt, state.tracePositions, state.dynamicWriter);
        recordWorkCpu(state.workCpuMs.coreDynamicGeometry, performance.now() - coreStartedAt);
        ensureGeometryBuffer(device, state, state.dynamicData, 'dynamicBuffer', 'dynamicCapacity', 'autonomy-dynamic-geometry');
        state.coreDynamicSnapshot = state.latestSnapshot;
        state.coreDynamicReceipt = state.latestReceipt;
        state.coreDynamicTraceLength = state.tracePositions.length;
      }
      refreshPluginDynamicGeometry(snapshot, 0);
    }

    function refreshPluginDynamicGeometry(snapshot = null, animationTimeSeconds = null) {
      if (!state.pluginScene?.actors?.length) return;
      const pluginStartedAt = performance.now();
      state.pluginDynamicData = geometry.createPluginDynamicGeometry(
        state.pluginScene,
        snapshot || snapshotAtRenderTime(state.latestSnapshot, state.pluginSimulationTimeSeconds),
        state.pluginDynamicWriter,
        animationTimeSeconds,
        state.pluginTransitionActors,
      );
      recordWorkCpu(state.workCpuMs.pluginDynamicGeometry, performance.now() - pluginStartedAt);
      ensureGeometryBuffer(device, state, state.pluginDynamicData, 'pluginDynamicBuffer', 'pluginDynamicCapacity', 'autonomy-plugin-dynamic-geometry');
    }

    function setPluginPresentations(contributions, presentationOptions = {}) {
      state.pluginSimulationTimeSeconds = Math.max(0, Number(presentationOptions.simulationTimeMs || 0)) / 1000;
      state.pluginAnimationStartedAt = performance.now();
      const compileStartedAt = performance.now();
      const previousActors = new Map((state.pluginScene?.actors || []).map((row) => [row.id, row]));
      const nextScene = presentationCompiler.compile(contributions, worldModel, {
        ...presentationOptions,
        viewport: {
          width: Math.max(1, canvas.clientWidth || canvas.width),
          height: Math.max(1, canvas.clientHeight || canvas.height),
        },
      });
      state.pluginTransitionActors = new Map(nextScene.actors.flatMap((row) => {
        const previous = previousActors.get(row.id);
        if (!previous || row.points.length !== 1 || previous.points?.length !== 1) return [];
        const from = previous.points[0];
        const to = row.points[0];
        if (!from || !to || (from.x === to.x && from.y === to.y)) return [];
        return [[row.id, { x: from.x, y: from.y }]];
      }));
      state.pluginScene = nextScene;
      recordWorkCpu(state.workCpuMs.pluginCompile, performance.now() - compileStartedAt);
      const staticStartedAt = performance.now();
      state.pluginStaticData = geometry.createPluginStaticGeometry(state.pluginScene, state.pluginStaticWriter, { excludeShadows: true, excludeAreas: true });
      recordWorkCpu(state.workCpuMs.pluginStaticGeometry, performance.now() - staticStartedAt);
      ensureGeometryBuffer(device, state, state.pluginStaticData, 'pluginStaticBuffer', 'pluginStaticCapacity', 'autonomy-plugin-static-geometry');
      state.pluginOverlayData = geometry.createPluginOverlayGeometry(state.pluginScene, state.pluginOverlayWriter);
      ensureGeometryBuffer(device, state, state.pluginOverlayData, 'pluginOverlayBuffer', 'pluginOverlayCapacity', 'autonomy-plugin-overlay-geometry');
      state.pluginShadowData = geometry.createPluginShadowGeometry(state.pluginScene, state.pluginShadowWriter);
      ensureGeometryBuffer(device, state, state.pluginShadowData, 'pluginShadowBuffer', 'pluginShadowCapacity', 'autonomy-plugin-shadow-geometry');
      cameraApi.replacePluginCameraTargets(state, state.pluginScene.cameraTargets, performance.now());
      Object.entries(state.pluginScene.counts).forEach(([key, value]) => {
        canvas.dataset[`plugin${key.charAt(0).toUpperCase()}${key.slice(1)}Count`] = String(value);
      });
      canvas.dataset.sunAzimuthDegrees = state.pluginScene.sun ? String(state.pluginScene.sun.azimuthDegrees) : '';
      canvas.dataset.sunElevationDegrees = state.pluginScene.sun ? String(state.pluginScene.sun.elevationDegrees) : '';
      canvas.dataset.pluginShadowVertexCount = String(state.pluginShadowData.length / geometry.FLOATS_PER_VERTEX);
      canvas.dataset.solarLighting = state.pluginScene.sun ? 'plugin' : 'default';
      const compositorReceipts = state.pluginScene.compositorReceipts || [];
      canvas.dataset.pluginCompositorReceiptCount = String(compositorReceipts.length);
      canvas.dataset.pluginVisibleLayerCount = String(compositorReceipts.reduce((sum, row) => sum + row.visibleLayerCount, 0));
      canvas.dataset.pluginRepresentedLayerCount = String(compositorReceipts.reduce((sum, row) => sum + row.representedLayerCount, 0));
      canvas.dataset.pluginSuppressedLayerCount = String(compositorReceipts.reduce((sum, row) => sum + row.suppressedLayerIds.length, 0));
      canvas.dataset.pluginClusterCount = String(compositorReceipts.reduce((sum, row) => sum + row.clusterCount, 0));
      canvas.dataset.pluginClusteredLayerCount = String(compositorReceipts.reduce((sum, row) => sum + row.clusteredLayerCount, 0));
      canvas.dataset.pluginLabelCount = String(compositorReceipts.reduce((sum, row) => sum + row.labelCount, 0));
      refreshDynamicGeometry();
      return structuredClone(state.pluginScene.counts);
    }

    function sceneGeometry(useOverviewStatic) {
      const selectedStaticData = useOverviewStatic ? state.overviewStaticData : state.staticData;
      return {
        static: geometryRow(useOverviewStatic ? state.overviewStaticBuffer : state.staticBuffer, selectedStaticData),
        groundOverlay: geometryRow(groundOverlayBuffer, groundOverlayData),
        pluginOverlay: geometryRow(state.pluginOverlayBuffer, state.pluginOverlayData),
        shadow: geometryRow(state.pluginShadowBuffer, state.pluginShadowData),
        dynamic: geometryRow(state.dynamicBuffer, state.dynamicData),
        pluginStatic: geometryRow(state.pluginStaticBuffer, state.pluginStaticData),
        pluginDynamic: geometryRow(state.pluginDynamicBuffer, state.pluginDynamicData),
      };
    }

    function geometryRow(buffer, data) {
      return { buffer, vertexCount: data.length / geometry.FLOATS_PER_VERTEX };
    }

    function drawFrame(timestamp = performance.now()) {
      if (state.isDestroyed || !state.latestSnapshot) return;
      const cpuStartedAt = performance.now();
      resizeCanvas(canvas, device, format, state);
      const pose = cameraApi.advanceCamera(state, state.latestSnapshot, worldModel, canvas.width / canvas.height, timestamp);
      const camera = cameraForPose(pose, canvas);
      recordCameraDataset(canvas, pose);
      const animationTimeSeconds = Math.max(0, (timestamp - state.pluginAnimationStartedAt) / 1000);
      refreshPluginDynamicGeometry(
        snapshotAtRenderTime(state.latestSnapshot, state.pluginSimulationTimeSeconds),
        animationTimeSeconds,
      );
      if (timestamp - state.lastSubmittedFrameAt < PRIMARY_RENDER_INTERVAL_MS) return;
      state.lastSubmittedFrameAt = timestamp;
      const seconds = resolvedSimulationTimeSeconds(state.latestSnapshot, state.pluginSimulationTimeSeconds);
      writeUniforms(device, uniformBuffer, camera, canvas, seconds, state.pluginScene.sun, uniformData);
      state.semanticLabelReceipt = semanticLabels?.draw(
        labelCanvas,
        state.pluginScene.labels,
        camera.viewProjection,
        { width: canvas.width, height: canvas.height },
      ) || null;
      const encoder = device.createCommandEncoder({ label: 'autonomy-map-frame' });
      const currentTexture = context.getCurrentTexture();
      const useOverviewStatic = pose.mode !== 'pov';
      passApi.encodeScene(encoder, {
        label: 'autonomy-map-pass',
        resolveTarget: currentTexture.createView(),
        targets: state.renderTargets,
        bindGroup,
        pipelines,
        sampleCount: SAMPLE_COUNT,
        geometry: sceneGeometry(useOverviewStatic),
        clearValue: { r: 0.006, g: 0.018, b: 0.035, a: 1 },
      });
      const minimapVisible = Boolean(pose.mode === 'follow' && minimapCanvas);
      canvas.dataset.followMinimap = minimapVisible ? 'visible' : 'hidden';
      if (minimapVisible) {
        minimapCanvas.hidden = false;
        const shouldRenderMinimap = !state.minimapWasVisible
          || timestamp - state.minimapLastRenderAt >= MINIMAP_FRAME_INTERVAL_MS;
        if (shouldRenderMinimap && pose.transitionState === 'settled') {
          resizeMinimapCanvas(minimapCanvas, device, format, state);
          const minimapCamera = cameraForMinimap(state.latestSnapshot, minimapCanvas);
          writeUniforms(device, minimapUniformBuffer, minimapCamera, minimapCanvas, seconds, state.pluginScene.sun, minimapUniformData);
          passApi.encodeScene(encoder, {
            label: 'autonomy-minimap-pass',
            resolveTarget: minimapContext.getCurrentTexture().createView(),
            targets: state.minimapTargets,
            bindGroup: minimapBindGroup,
            pipelines,
            sampleCount: SAMPLE_COUNT,
            geometry: sceneGeometry(true),
            clearValue: { r: 0.003, g: 0.012, b: 0.022, a: 1 },
          });
          state.minimapLastRenderAt = timestamp;
          state.minimapFrameCount += 1;
          minimapCanvas.dataset.frameCount = String(state.minimapFrameCount);
          minimapCanvas.dataset.center = `${state.latestSnapshot.state.position.x.toFixed(2)},${state.latestSnapshot.state.position.y.toFixed(2)}`;
        }
        state.minimapWasVisible = true;
      } else if (minimapCanvas) {
        minimapCanvas.hidden = true;
        state.minimapWasVisible = false;
      }
      device.queue.submit([encoder.finish()]);
      state.frameCount += 1;
      if (!state.firstFrameAt) state.firstFrameAt = performance.now();
      canvas.dataset.frameCount = String(state.frameCount);
      canvas.dataset.staticVertexCount = String(staticData.length / geometry.FLOATS_PER_VERTEX);
      canvas.dataset.dynamicVertexCount = String((state.dynamicData.length + state.pluginDynamicData.length) / geometry.FLOATS_PER_VERTEX);
      if (state.frameCpuMs.length >= 512) state.frameCpuMs.shift();
      state.frameCpuMs.push(performance.now() - cpuStartedAt);
    }

    async function capturePixels(options = {}) {
      if (state.isDestroyed) throw rendererError('webgpu_capture_disposed', 'Cannot capture a disposed renderer');
      if (!state.latestSnapshot) throw rendererError('webgpu_capture_state_missing', 'Cannot capture before a simulation state is rendered');
      resizeCanvas(canvas, device, format, state);
      const pose = cameraApi.advanceCamera(
        state,
        state.latestSnapshot,
        worldModel,
        canvas.width / canvas.height,
        performance.now(),
      );
      const camera = cameraForPose(pose, canvas);
      const seconds = resolvedSimulationTimeSeconds(state.latestSnapshot, state.pluginSimulationTimeSeconds);
      writeUniforms(device, uniformBuffer, camera, canvas, seconds, state.pluginScene.sun, uniformData);
      const currentTexture = context.getCurrentTexture();
      const encoder = device.createCommandEncoder({ label: 'autonomy-evidence-frame' });
      const useOverviewStatic = pose.mode !== 'pov';
      passApi.encodeScene(encoder, {
        label: 'autonomy-evidence-pass',
        resolveTarget: currentTexture.createView(),
        targets: state.renderTargets,
        bindGroup,
        pipelines,
        sampleCount: SAMPLE_COUNT,
        geometry: sceneGeometry(useOverviewStatic),
        clearValue: { r: 0.006, g: 0.018, b: 0.035, a: 1 },
      });
      const rowBytes = canvas.width * 4;
      const bytesPerRow = Math.ceil(rowBytes / 256) * 256;
      const readback = device.createBuffer({
        label: 'autonomy-evidence-readback',
        size: bytesPerRow * canvas.height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      encoder.copyTextureToBuffer(
        { texture: currentTexture },
        { buffer: readback, bytesPerRow, rowsPerImage: canvas.height },
        { width: canvas.width, height: canvas.height, depthOrArrayLayers: 1 },
      );
      device.queue.submit([encoder.finish()]);
      const rgba = new Uint8Array(rowBytes * canvas.height);
      let mapped = false;
      try {
        await readback.mapAsync(GPUMapMode.READ);
        mapped = true;
        const bytes = new Uint8Array(readback.getMappedRange());
        for (let y = 0; y < canvas.height; y += 1) {
          rgba.set(bytes.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes), y * rowBytes);
        }
        if (format.startsWith('bgra')) {
          for (let index = 0; index < rgba.length; index += 4) {
            const blue = rgba[index];
            rgba[index] = rgba[index + 2];
            rgba[index + 2] = blue;
          }
        }
      } finally {
        if (mapped) readback.unmap();
        readback.destroy();
      }
      const capture = {
        schema: 'simulatte.autonomyRenderPixels.v1',
        width: canvas.width,
        height: canvas.height,
        format: 'rgba8unorm',
        sourceBackend: 'webgpu',
        sourceFormat: format,
        sourceFrameCount: state.frameCount,
      };
      if (options.encoding === 'bytes') {
        return Object.freeze({ ...capture, rgbaBytes: rgba });
      }
      let binary = '';
      for (let offset = 0; offset < rgba.length; offset += 32768) {
        binary += String.fromCharCode(...rgba.subarray(offset, offset + 32768));
      }
      return Object.freeze({ ...capture, rgbaBase64: btoa(binary) });
    }

    function animationFrame(timestamp) {
      if (state.isDestroyed) return;
      drawFrame(timestamp);
      state.animationFrame = requestAnimationFrame(animationFrame);
    }

    function reset() {
      state.tracePositions = [];
      state.latestReceipt = null;
      state.routeIdentity = null;
    }

    function setCameraMode(mode) {
      cameraApi.setCameraMode(state, mode, performance.now());
      canvas.dataset.cameraMode = mode;
      if (state.latestSnapshot) drawFrame();
      return mode;
    }

    function focusCameraTarget(targetId) {
      const mode = cameraApi.focusCameraTarget(state, targetId, performance.now());
      canvas.dataset.cameraMode = mode;
      canvas.dataset.cameraFocus = targetId;
      if (state.latestSnapshot) drawFrame();
      return mode;
    }

    function cameraTargets() {
      return structuredClone(state.targets);
    }

    function cameraState() {
      return Object.freeze({
        mode: state.mode,
        focusId: state.focusId,
        transition: state.transition ? 'active' : 'settled',
      });
    }

    function receipt() {
      return {
        schema: 'simulatte.autonomyWebGpuRenderReceipt.v5',
        backend: 'webgpu',
        adapter: adapterInfo,
        format,
        sampleCount: SAMPLE_COUNT,
        staticVertexCount: staticData.length / geometry.FLOATS_PER_VERTEX,
        dynamicVertexCount: (state.dynamicData.length + state.pluginDynamicData.length) / geometry.FLOATS_PER_VERTEX,
        coreDynamicVertexCount: state.dynamicData.length / geometry.FLOATS_PER_VERTEX,
        pluginStaticVertexCount: state.pluginStaticData.length / geometry.FLOATS_PER_VERTEX,
        groundOverlayVertexCount: groundOverlayData.length / geometry.FLOATS_PER_VERTEX,
        pluginOverlayVertexCount: state.pluginOverlayData.length / geometry.FLOATS_PER_VERTEX,
        pluginShadowVertexCount: state.pluginShadowData.length / geometry.FLOATS_PER_VERTEX,
        pluginDynamicVertexCount: state.pluginDynamicData.length / geometry.FLOATS_PER_VERTEX,
        solarLighting: state.pluginScene.sun ? {
          azimuthDegrees: state.pluginScene.sun.azimuthDegrees,
          elevationDegrees: state.pluginScene.sun.elevationDegrees,
        } : null,
        frameCount: state.frameCount,
        renderCpu: {
          basis: 'main-thread-command-encoding-and-submit',
          sampleCount: state.frameCpuMs.length,
          totalMs: state.frameCpuMs.reduce((sum, value) => sum + value, 0),
          maxMs: Math.max(0, ...state.frameCpuMs),
        },
        workCpuMs: Object.fromEntries(Object.entries(state.workCpuMs).map(([key, values]) => [key, {
          sampleCount: values.length,
          totalMs: values.reduce((sum, value) => sum + value, 0),
          maxMs: Math.max(0, ...values),
        }])),
        firstFrameMs: state.firstFrameAt ? Number((state.firstFrameAt - state.startedAt).toFixed(3)) : null,
        worldId: worldModel.world.id,
        worldSurfaceOwner: worldModel.world.renderGeometry.surfaceOwner || 'core',
        buildingCount: worldModel.world.renderGeometry.buildings.length,
        streetCount: worldModel.world.renderGeometry.streets.length,
        parkCount: worldModel.world.renderGeometry.parks.length,
        circuitCount: worldModel.world.circuits.length,
        bikeFacilityCount: worldModel.world.renderGeometry.bikeFacilities.length,
        actorGeometry: {
          schema: geometry.ACTOR_MESH_SCHEMA,
          supportedKinds: [...geometry.SUPPORTED_ACTOR_KINDS],
          materialModel: geometry.MATERIAL_MODEL,
        },
        ambientTraffic: {
          schema: worldModel.ambientCompilation.schema,
          actorCount: worldModel.ambientCompilation.actors.length,
          counts: structuredClone(worldModel.ambientCompilation.counts),
          interactionModel: worldModel.ambientCompilation.interactionModel,
          animationModel: worldModel.ambientCompilation.animationModel,
          sourceGeometryIds: [...worldModel.ambientCompilation.sourceGeometryIds],
          claimBoundary: worldModel.ambientCompilation.claimBoundary,
        },
        camera: {
          mode: state.mode,
          focusId: state.focusId,
          transitionState: state.transition ? 'active' : 'settled',
          targetCount: state.targets.length,
          followDistanceM: Number(state.followDistance.toFixed(3)),
        },
        minimap: {
          schema: 'simulatte.autonomyFollowMinimap.v1',
          available: Boolean(minimapCanvas),
          visible: Boolean(minimapCanvas && state.mode === 'follow'),
          projection: 'orthographic_top_north_up',
          radiusM: MINIMAP_RADIUS_M,
          frameCount: state.minimapFrameCount,
        },
        pluginPresentation: structuredClone(state.pluginScene.counts),
        pluginCompositor: structuredClone(state.pluginScene.compositorReceipts || []),
        semanticLabels: state.semanticLabelReceipt ? structuredClone(state.semanticLabelReceipt) : null,
      };
    }

    function destroy() {
      state.isDestroyed = true;
      delete canvas.__simulatteCaptureRenderPixels;
      delete canvas.__simulatteRenderReceipt;
      if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
      staticBuffer.destroy();
      overviewStaticBuffer.destroy();
      groundOverlayBuffer.destroy();
      state.dynamicBuffer?.destroy();
      state.pluginStaticBuffer?.destroy();
      state.pluginOverlayBuffer?.destroy();
      state.pluginShadowBuffer?.destroy();
      state.pluginDynamicBuffer?.destroy();
      state.renderTargets?.color.destroy();
      state.renderTargets?.depth.destroy();
      state.minimapTargets?.color.destroy();
      state.minimapTargets?.depth.destroy();
      uniformBuffer.destroy();
      minimapUniformBuffer?.destroy();
      if (labelCanvas) labelCanvas.getContext('2d')?.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
      device.destroy();
    }

    canvas.__simulatteCaptureRenderPixels = capturePixels;
    canvas.__simulatteRenderReceipt = receipt;
    state.animationFrame = requestAnimationFrame(animationFrame);
    return {
      render,
      reset,
      setCameraMode,
      focusCameraTarget,
      cameraTargets,
      cameraState,
      setPluginPresentations,
      capturePixels,
      receipt,
      destroy,
      device,
      adapterInfo,
    };
  }

  function createVertexBuffer(device, data, label) {
    const size = Math.max(4, Math.ceil(data.byteLength / 4) * 4);
    const buffer = device.createBuffer({ label, size, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
    if (data.length) new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }

  function ensureGeometryBuffer(device, state, data, bufferKey, capacityKey, label) {
    if (!state[bufferKey] || data.byteLength > state[capacityKey]) {
      state[bufferKey]?.destroy();
      state[capacityKey] = Math.max(4096, nextPowerOfTwo(data.byteLength));
      state[bufferKey] = device.createBuffer({ label, size: state[capacityKey], usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (data.length) device.queue.writeBuffer(state[bufferKey], 0, data);
  }

  function recordWorkCpu(values, durationMs) {
    if (values.length >= 128) values.shift();
    values.push(Number(durationMs));
  }

  function resizeCanvas(canvas, device, format, state) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = Math.max(320, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(260, Math.round(canvas.clientHeight * ratio));
    if (canvas.width === width && canvas.height === height && state.renderTargets) return;
    canvas.width = width;
    canvas.height = height;
    state.renderTargets?.color.destroy();
    state.renderTargets?.depth.destroy();
    state.renderTargets = {
      color: device.createTexture({ label: 'autonomy-msaa-color', size: [width, height], sampleCount: SAMPLE_COUNT, format, usage: GPUTextureUsage.RENDER_ATTACHMENT }),
      depth: device.createTexture({ label: 'autonomy-depth', size: [width, height], sampleCount: SAMPLE_COUNT, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT }),
    };
  }

  function resizeMinimapCanvas(canvas, device, format, state) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = Math.max(160, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(120, Math.round(canvas.clientHeight * ratio));
    if (canvas.width === width && canvas.height === height && state.minimapTargets) return;
    canvas.width = width;
    canvas.height = height;
    state.minimapTargets?.color.destroy();
    state.minimapTargets?.depth.destroy();
    state.minimapTargets = {
      color: device.createTexture({ label: 'autonomy-minimap-msaa-color', size: [width, height], sampleCount: SAMPLE_COUNT, format, usage: GPUTextureUsage.RENDER_ATTACHMENT }),
      depth: device.createTexture({ label: 'autonomy-minimap-depth', size: [width, height], sampleCount: SAMPLE_COUNT, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT }),
    };
  }

  function cameraForPose(pose, canvas) {
    const aspect = canvas.width / canvas.height;
    return {
      eye: pose.eye,
      viewProjection: math.multiply(
        math.perspective(pose.fieldOfViewRadians, aspect, pose.near, pose.far),
        math.lookAt(pose.eye, pose.target)
      ),
    };
  }

  function cameraForMinimap(snapshot, canvas) {
    const point = snapshot.state.position;
    const eye = [point.x, 1800, -point.y];
    const target = [point.x, 0, -point.y];
    const aspect = canvas.width / canvas.height;
    return {
      eye,
      viewProjection: math.multiply(
        math.orthographic(-MINIMAP_RADIUS_M * aspect, MINIMAP_RADIUS_M * aspect, -MINIMAP_RADIUS_M, MINIMAP_RADIUS_M, 1, 4000),
        math.lookAt(eye, target, [0, 0, -1])
      ),
    };
  }

  function recordCameraDataset(canvas, pose) {
    const vector = (values) => values.map((value) => Number(value.toFixed(2))).join(',');
    canvas.dataset.cameraMode = pose.mode;
    canvas.dataset.cameraFocus = pose.focusId;
    canvas.dataset.cameraTransition = pose.transitionState;
    canvas.dataset.cameraTransitionProgress = pose.transitionProgress.toFixed(3);
    canvas.dataset.cameraEye = vector(pose.eye);
    canvas.dataset.cameraTarget = vector(pose.target);
    canvas.dataset.cameraFollowDistance = pose.followDistance.toFixed(3);
  }

  function writeUniforms(device, buffer, camera, canvas, seconds, sun = null, values = new Float32Array(32)) {
    const directionToSun = sun?.directionToSun || [0.38, 0.88, 0.26];
    values.set(camera.viewProjection, 0);
    values.set([...camera.eye, 1], 16);
    values.set(directionToSun.map((value) => -value).concat(0), 20);
    values.set([0.008, 0.025, 0.05, fogDensityForEye(camera.eye)], 24);
    values.set([seconds, canvas.width, canvas.height, 0], 28);
    device.queue.writeBuffer(buffer, 0, values);
  }

  function fogDensityForEye(eye) {
    const altitude = Math.max(1, Math.abs(Number(eye?.[1] || 0)));
    return Math.min(0.00013, 0.22 / altitude);
  }

  function installCameraControls(canvas, state, camera, onInteraction) {
    let pointer = null;
    canvas.addEventListener('pointerdown', (event) => {
      const action = state.mode === 'top' || event.shiftKey || event.button !== 0 ? 'pan' : 'orbit';
      camera.setCameraMode(state, 'free', performance.now());
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, action };
      canvas.dataset.cameraInteraction = action;
      onInteraction?.({ control: action, mode: 'free', targetIds: [] });
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const deltaX = event.clientX - pointer.x;
      const deltaY = event.clientY - pointer.y;
      if (pointer.action === 'pan') camera.panCamera(state, deltaX, deltaY, canvas.clientHeight);
      else camera.orbitCamera(state, deltaX, deltaY);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    });
    const release = (event) => {
      if (pointer?.id === event.pointerId) pointer = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const trackedMode = ['follow', 'pov'].includes(state.mode);
      if (!trackedMode) camera.setCameraMode(state, 'free', performance.now());
      canvas.dataset.cameraInteraction = 'zoom';
      onInteraction?.({ control: 'zoom', mode: trackedMode ? state.mode : 'free', targetIds: [] });
      camera.zoomCamera(state, event.deltaY);
    }, { passive: false });
  }

  function resolveCameraController(candidate) {
    const api = candidate || globalThis.SimulatteAutonomyCamera;
    const requiredMethods = [
      'createCameraState',
      'updateRouteTarget',
      'advanceCamera',
      'setCameraMode',
      'focusCameraTarget',
      'panCamera',
      'orbitCamera',
      'zoomCamera',
      'replacePluginCameraTargets',
    ];
    const missingMethods = requiredMethods.filter((name) => typeof api?.[name] !== 'function');
    if (missingMethods.length) {
      throw rendererError('camera_runtime_unavailable', `Camera runtime is missing: ${missingMethods.join(', ')}`);
    }
    return api;
  }

  function readAdapterInfo(adapter) {
    const info = adapter.info || {};
    return {
      vendor: info.vendor || null,
      architecture: info.architecture || null,
      device: info.device || null,
      description: info.description || null,
      isFallbackAdapter: Boolean(adapter.isFallbackAdapter),
    };
  }

  function nextPowerOfTwo(value) {
    let power = 1;
    while (power < Math.max(1, value)) power *= 2;
    return power;
  }

  function pointDistance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function resolvedSimulationTimeSeconds(snapshot, pluginSimulationTimeSeconds = 0) {
    return Math.max(
      0,
      Number(snapshot?.state?.simulatedTimeSeconds || 0),
      Number(pluginSimulationTimeSeconds || 0),
    );
  }

  function snapshotAtRenderTime(snapshot, pluginSimulationTimeSeconds = 0) {
    const simulatedTimeSeconds = resolvedSimulationTimeSeconds(snapshot, pluginSimulationTimeSeconds);
    if (simulatedTimeSeconds === Number(snapshot?.state?.simulatedTimeSeconds || 0)) return snapshot;
    return {
      ...snapshot,
      state: { ...snapshot.state, simulatedTimeSeconds },
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function rendererError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyWebGpuRendererError';
    error.code = code;
    return error;
  }
  return { MINIMAP_RADIUS_M, SHADER, cameraForMinimap, createCanvasRenderer, fogDensityForEye, readAdapterInfo, rendererError, resolveCameraController, resolvedSimulationTimeSeconds, snapshotAtRenderTime };
});
