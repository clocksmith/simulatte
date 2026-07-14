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
  const api = factory(math, geometry, cameraController);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyWebGpuRenderer(math, geometry, cameraController) {
  const SAMPLE_COUNT = 4;
  const MINIMAP_RADIUS_M = 420;
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
  let pulse = 0.82 + 0.18 * sin(uniforms.timeViewport.x * 2.4 + input.worldPosition.x * 0.018 - input.worldPosition.z * 0.012);
  let diffuseColor = input.color.rgb * (0.2 + diffuse * 0.74) * (1.0 - metallic * 0.38);
  let lit = diffuseColor + specular + input.color.rgb * rim + input.color.rgb * input.emissive * pulse;
  let toneMapped = lit / (lit + vec3<f32>(0.85));
  let cameraDistance = distance(uniforms.cameraPosition.xyz, input.worldPosition);
  let fogAmount = clamp(1.0 - exp(-cameraDistance * uniforms.fogColorDensity.w), 0.0, 0.88);
  return vec4<f32>(mix(toneMapped, uniforms.fogColorDensity.rgb, fogAmount), input.color.a);
}
`;

  async function createCanvasRenderer(canvas, worldModel, options = {}) {
    if (!globalThis.navigator?.gpu) throw rendererError('webgpu_unavailable', 'This simulation requires a browser with WebGPU enabled');
    if (!worldModel.world.renderGeometry) throw rendererError('render_geometry_missing', `World ${worldModel.world.id} has no compiled renderGeometry`);
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw rendererError('webgpu_adapter_missing', 'WebGPU did not return a compatible adapter');
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) throw rendererError('webgpu_context_missing', 'Canvas did not provide a WebGPU context');
    const minimapCanvas = options.minimapCanvas || null;
    const minimapContext = minimapCanvas ? minimapCanvas.getContext('webgpu') : null;
    if (minimapCanvas && !minimapContext) throw rendererError('webgpu_minimap_context_missing', 'Follow minimap did not provide a WebGPU context');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque', colorSpace: 'srgb' });
    minimapContext?.configure({ device, format, alphaMode: 'opaque', colorSpace: 'srgb' });
    const shader = device.createShaderModule({ label: 'autonomy-map-shader', code: SHADER });
    const compilation = await shader.getCompilationInfo();
    const shaderErrors = compilation.messages.filter((row) => row.type === 'error');
    if (shaderErrors.length) throw rendererError('webgpu_shader_invalid', shaderErrors.map((row) => `${row.lineNum}:${row.linePos} ${row.message}`).join('\n'));
    const pipeline = device.createRenderPipeline({
      label: 'autonomy-map-pipeline',
      layout: 'auto',
      vertex: {
        module: shader,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: geometry.FLOATS_PER_VERTEX * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x4' },
            { shaderLocation: 3, offset: 40, format: 'float32' },
            { shaderLocation: 4, offset: 44, format: 'float32x2' },
          ],
        }],
      },
      fragment: {
        module: shader,
        entryPoint: 'fragmentMain',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      multisample: { count: SAMPLE_COUNT },
    });
    const uniformBuffer = device.createBuffer({ label: 'autonomy-camera-uniforms', size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroup = device.createBindGroup({
      label: 'autonomy-map-bind-group',
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    const minimapUniformBuffer = minimapCanvas
      ? device.createBuffer({ label: 'autonomy-minimap-uniforms', size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
      : null;
    const minimapBindGroup = minimapUniformBuffer
      ? device.createBindGroup({
        label: 'autonomy-minimap-bind-group',
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: minimapUniformBuffer } }],
      })
      : null;
    const staticData = geometry.createStaticGeometry(worldModel.world);
    const staticBuffer = createVertexBuffer(device, staticData, 'autonomy-static-geometry');
    const state = {
      ...cameraController.createCameraState(worldModel.world, worldModel, options.regionRegistry, options.regionPacks),
      routeIdentity: null,
      latestSnapshot: null,
      latestReceipt: null,
      tracePositions: [],
      dynamicData: new Float32Array(),
      dynamicBuffer: null,
      dynamicCapacity: 0,
      frameCount: 0,
      firstFrameAt: null,
      startedAt: performance.now(),
      animationFrame: null,
      renderTargets: null,
      minimapTargets: null,
      minimapFrameCount: 0,
      isDestroyed: false,
    };
    const adapterInfo = readAdapterInfo(adapter);
    canvas.dataset.rendererBackend = 'webgpu';
    canvas.dataset.adapterName = adapterInfo.description || adapterInfo.device || adapterInfo.architecture || 'WebGPU adapter';
    canvas.dataset.actorMeshSchema = geometry.ACTOR_MESH_SCHEMA;
    canvas.dataset.actorMeshKinds = geometry.SUPPORTED_ACTOR_KINDS.join(',');
    canvas.dataset.materialModel = geometry.MATERIAL_MODEL;
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
    installCameraControls(canvas, state);
    device.lost.then((info) => {
      canvas.dataset.rendererLost = 'true';
      if (!state.isDestroyed && typeof options.onFailure === 'function') options.onFailure(rendererError('webgpu_device_lost', `${info.reason}: ${info.message}`));
    });

    function render(snapshot, tickReceipt = null) {
      state.latestSnapshot = snapshot;
      state.latestReceipt = tickReceipt || state.latestReceipt;
      if (!state.routeIdentity && snapshot.route?.segmentIds?.length) {
        state.routeIdentity = snapshot.route.segmentIds.join('|');
        cameraController.updateRouteTarget(state, snapshot.route.segmentIds, worldModel, worldModel.world, performance.now());
      }
      const position = snapshot.state.position;
      if (position && (!state.tracePositions.length || pointDistance(position, state.tracePositions.at(-1)) > 0.15)) state.tracePositions.push({ ...position });
      state.dynamicData = geometry.createDynamicGeometry(worldModel, snapshot, tickReceipt, state.tracePositions);
      ensureDynamicBuffer(device, state, state.dynamicData);
      drawFrame();
    }

    function drawFrame(timestamp = performance.now()) {
      if (state.isDestroyed || !state.latestSnapshot) return;
      resizeCanvas(canvas, device, format, state);
      const pose = cameraController.advanceCamera(state, state.latestSnapshot, worldModel, canvas.width / canvas.height, timestamp);
      const camera = cameraForPose(pose, canvas);
      recordCameraDataset(canvas, pose);
      const seconds = (timestamp - state.startedAt) / 1000;
      writeUniforms(device, uniformBuffer, camera, canvas, seconds);
      const encoder = device.createCommandEncoder({ label: 'autonomy-map-frame' });
      encodeScene(encoder, {
        label: 'autonomy-map-pass',
        context,
        targets: state.renderTargets,
        bindGroup,
        clearValue: { r: 0.006, g: 0.018, b: 0.035, a: 1 },
      });
      const minimapVisible = Boolean(pose.mode === 'follow' && minimapCanvas);
      canvas.dataset.followMinimap = minimapVisible ? 'visible' : 'hidden';
      if (minimapVisible) {
        minimapCanvas.hidden = false;
        resizeMinimapCanvas(minimapCanvas, device, format, state);
        const minimapCamera = cameraForMinimap(state.latestSnapshot, minimapCanvas);
        writeUniforms(device, minimapUniformBuffer, minimapCamera, minimapCanvas, seconds);
        encodeScene(encoder, {
          label: 'autonomy-minimap-pass',
          context: minimapContext,
          targets: state.minimapTargets,
          bindGroup: minimapBindGroup,
          clearValue: { r: 0.003, g: 0.012, b: 0.022, a: 1 },
        });
        state.minimapFrameCount += 1;
        minimapCanvas.dataset.frameCount = String(state.minimapFrameCount);
        minimapCanvas.dataset.center = `${state.latestSnapshot.state.position.x.toFixed(2)},${state.latestSnapshot.state.position.y.toFixed(2)}`;
      } else if (minimapCanvas) {
        minimapCanvas.hidden = true;
      }
      device.queue.submit([encoder.finish()]);
      state.frameCount += 1;
      if (!state.firstFrameAt) state.firstFrameAt = performance.now();
      canvas.dataset.frameCount = String(state.frameCount);
      canvas.dataset.staticVertexCount = String(staticData.length / geometry.FLOATS_PER_VERTEX);
      canvas.dataset.dynamicVertexCount = String(state.dynamicData.length / geometry.FLOATS_PER_VERTEX);
    }

    function encodeScene(encoder, { label, context: renderContext, targets, bindGroup: sceneBindGroup, clearValue }) {
      const pass = encoder.beginRenderPass({
        label,
        colorAttachments: [{
          view: targets.color.createView(),
          resolveTarget: renderContext.getCurrentTexture().createView(),
          clearValue,
          loadOp: 'clear',
          storeOp: 'discard',
        }],
        depthStencilAttachment: {
          view: targets.depth.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
        },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, sceneBindGroup);
      pass.setVertexBuffer(0, staticBuffer);
      pass.draw(staticData.length / geometry.FLOATS_PER_VERTEX);
      if (state.dynamicBuffer && state.dynamicData.length) {
        pass.setVertexBuffer(0, state.dynamicBuffer);
        pass.draw(state.dynamicData.length / geometry.FLOATS_PER_VERTEX);
      }
      pass.end();
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
      cameraController.setCameraMode(state, mode, performance.now());
      canvas.dataset.cameraMode = mode;
      if (state.latestSnapshot) drawFrame();
      return mode;
    }

    function focusCameraTarget(targetId) {
      const mode = cameraController.focusCameraTarget(state, targetId, performance.now());
      canvas.dataset.cameraMode = mode;
      canvas.dataset.cameraFocus = targetId;
      if (state.latestSnapshot) drawFrame();
      return mode;
    }

    function cameraTargets() {
      return structuredClone(state.targets);
    }

    function receipt() {
      return {
        schema: 'simulatte.autonomyWebGpuRenderReceipt.v5',
        backend: 'webgpu',
        adapter: adapterInfo,
        format,
        sampleCount: SAMPLE_COUNT,
        staticVertexCount: staticData.length / geometry.FLOATS_PER_VERTEX,
        dynamicVertexCount: state.dynamicData.length / geometry.FLOATS_PER_VERTEX,
        frameCount: state.frameCount,
        firstFrameMs: state.firstFrameAt ? Number((state.firstFrameAt - state.startedAt).toFixed(3)) : null,
        worldId: worldModel.world.id,
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
      };
    }

    function destroy() {
      state.isDestroyed = true;
      if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
      staticBuffer.destroy();
      state.dynamicBuffer?.destroy();
      state.renderTargets?.color.destroy();
      state.renderTargets?.depth.destroy();
      state.minimapTargets?.color.destroy();
      state.minimapTargets?.depth.destroy();
      uniformBuffer.destroy();
      minimapUniformBuffer?.destroy();
      device.destroy();
    }

    state.animationFrame = requestAnimationFrame(animationFrame);
    return { render, reset, setCameraMode, focusCameraTarget, cameraTargets, receipt, destroy, device, adapterInfo };
  }

  function createVertexBuffer(device, data, label) {
    const size = Math.max(4, Math.ceil(data.byteLength / 4) * 4);
    const buffer = device.createBuffer({ label, size, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
    if (data.length) new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }

  function ensureDynamicBuffer(device, state, data) {
    if (!state.dynamicBuffer || data.byteLength > state.dynamicCapacity) {
      state.dynamicBuffer?.destroy();
      state.dynamicCapacity = Math.max(4096, nextPowerOfTwo(data.byteLength));
      state.dynamicBuffer = device.createBuffer({ label: 'autonomy-dynamic-geometry', size: state.dynamicCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (data.length) device.queue.writeBuffer(state.dynamicBuffer, 0, data);
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

  function writeUniforms(device, buffer, camera, canvas, seconds) {
    const values = new Float32Array(32);
    values.set(camera.viewProjection, 0);
    values.set([...camera.eye, 1], 16);
    values.set([-0.38, -0.88, -0.26, 0], 20);
    values.set([0.008, 0.025, 0.05, 0.00013], 24);
    values.set([seconds, canvas.width, canvas.height, 0], 28);
    device.queue.writeBuffer(buffer, 0, values);
  }

  function installCameraControls(canvas, state) {
    let pointer = null;
    canvas.addEventListener('pointerdown', (event) => {
      const action = state.mode === 'top' || event.shiftKey || event.button !== 0 ? 'pan' : 'orbit';
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, action };
      canvas.dataset.cameraInteraction = action;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const deltaX = event.clientX - pointer.x;
      const deltaY = event.clientY - pointer.y;
      if (pointer.action === 'pan') cameraController.panCamera(state, deltaX, deltaY, canvas.clientHeight);
      else cameraController.orbitCamera(state, deltaX, deltaY);
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
      canvas.dataset.cameraInteraction = 'zoom';
      cameraController.zoomCamera(state, event.deltaY);
    }, { passive: false });
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

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function rendererError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyWebGpuRendererError';
    error.code = code;
    return error;
  }

  return { MINIMAP_RADIUS_M, SHADER, cameraForMinimap, createCanvasRenderer, readAdapterInfo, rendererError };
});
