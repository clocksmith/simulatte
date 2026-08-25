(function attachRecursiveWorldWebGpuRenderer(root, factory) {
  const sceneApi = typeof module === 'object' && module.exports
    ? require('./recursive-world-scene.js')
    : root.SimulatteRecursiveWorldScene;
  const viewApi = typeof module === 'object' && module.exports
    ? require('./recursive-world-view.js')
    : root.SimulatteRecursiveWorldView;
  const api = factory(sceneApi, viewApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRecursiveWorldWebGpuRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRecursiveWorldWebGpuRendererApi(sceneApi, viewApi) {
  const BUFFER_USAGE = typeof GPUBufferUsage === 'undefined'
    ? { COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64 }
    : GPUBufferUsage;
  const SHADER_STAGE = typeof GPUShaderStage === 'undefined' ? { VERTEX: 1 } : GPUShaderStage;
  const SHADER = `
struct Camera { viewProjection: mat4x4f };
@group(0) @binding(0) var<uniform> camera: Camera;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) model0: vec4f,
  @location(2) model1: vec4f,
  @location(3) model2: vec4f,
  @location(4) model3: vec4f,
  @location(5) color: vec4f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex fn vertexMain(input: VertexInput) -> VertexOutput {
  let model = mat4x4f(input.model0, input.model1, input.model2, input.model3);
  var output: VertexOutput;
  output.position = camera.viewProjection * model * vec4f(input.position, 1.0);
  output.color = input.color;
  return output;
}

@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}`;

  async function createRenderer(options) {
    const {
      canvas,
      scene,
      context: providedContext = null,
      device: providedDevice = null,
      format = 'bgra8unorm',
      pixelRatio = 1,
      now = () => performance.now(),
      buildId = 'unreported-build',
      runtimeId = 'simulatte.recursive-world-webgpu/v1',
      deviceClass = 'webgpu:unreported',
    } = options || {};
    if (!canvas) throw new Error('recursive_webgpu_canvas_missing: A canvas is required');
    if (!scene) throw new Error('recursive_webgpu_scene_missing: A compiled scene is required');
    let device = providedDevice;
    if (!device) {
      const adapter = await globalThis.navigator?.gpu?.requestAdapter();
      if (!adapter) throw new Error('recursive_webgpu_adapter_unavailable: WebGPU adapter unavailable');
      device = await adapter.requestDevice();
    }
    const context = providedContext || canvas.getContext('webgpu');
    if (!context) throw new Error('recursive_webgpu_context_unavailable: WebGPU canvas context unavailable');
    context.configure({ device, format, alphaMode: 'opaque' });
    const module = device.createShaderModule({ label: 'recursive-world-shader', code: SHADER });
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.VERTEX, buffer: { type: 'uniform' } }],
    });
    const pipeline = device.createRenderPipeline({
      label: 'recursive-world-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          {
            arrayStride: scene.instanceStrideFloats * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x4' },
              { shaderLocation: 3, offset: 32, format: 'float32x4' },
              { shaderLocation: 4, offset: 48, format: 'float32x4' },
              { shaderLocation: 5, offset: 64, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    const uniformBuffer = createBuffer(device, 64, BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST, 'recursive-world-camera');
    let instanceCapacity = nextPowerOfTwo(Math.max(scene.instances.length, 1));
    let instanceBuffer = createBuffer(device, instanceCapacity * scene.instanceStrideFloats * 4, BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_DST, 'recursive-world-instances');
    const meshes = {
      box: createMesh(device, cubeVertices(), 'recursive-world-box'),
      sphere: createMesh(device, sphereVertices(12, 24), 'recursive-world-sphere'),
    };
    const bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries: [{ binding: 0, resource: { buffer: uniformBuffer } }] });
    const view = viewApi.createViewController(scene, { initialTargetId: options.initialTargetId });
    let depthTexture = null;
    let depthSize = '';
    let frameSequence = 0;

    function render({ observation, nowMs = now() } = {}) {
      const started = now();
      resizeCanvas(canvas, pixelRatio);
      const camera = view.sample({ nowMs, aspect: canvas.width / Math.max(canvas.height, 1) });
      const frameState = sceneApi.buildFrameState(scene, observation);
      const relativeData = applyFloatingOrigin(frameState.instanceData, camera.floatingOrigin, scene.instanceStrideFloats);
      if (scene.instances.length > instanceCapacity) {
        instanceBuffer.destroy?.();
        instanceCapacity = nextPowerOfTwo(scene.instances.length);
        instanceBuffer = createBuffer(device, instanceCapacity * scene.instanceStrideFloats * 4, BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_DST, 'recursive-world-instances');
      }
      device.queue.writeBuffer(uniformBuffer, 0, camera.viewProjection);
      device.queue.writeBuffer(instanceBuffer, 0, relativeData);
      const sizeKey = `${canvas.width}x${canvas.height}`;
      if (sizeKey !== depthSize) {
        depthTexture?.destroy?.();
        depthTexture = device.createTexture({
          label: 'recursive-world-depth',
          size: [canvas.width, canvas.height],
          format: 'depth24plus',
          usage: typeof GPUTextureUsage === 'undefined' ? 16 : GPUTextureUsage.RENDER_ATTACHMENT,
        });
        depthSize = sizeKey;
      }
      const encoder = device.createCommandEncoder({ label: 'recursive-world-frame' });
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.012, g: 0.018, b: 0.028, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
        depthStencilAttachment: { view: depthTexture.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(1, instanceBuffer);
      scene.groups.forEach((group) => {
        const mesh = meshes[group.meshKind];
        if (!mesh) throw new Error(`recursive_webgpu_mesh_unsupported: No mesh for ${group.meshKind}`);
        pass.setVertexBuffer(0, mesh.buffer);
        pass.draw(mesh.vertexCount, group.instanceCount, 0, group.firstInstance);
      });
      pass.end();
      device.queue.submit([encoder.finish()]);
      frameSequence += 1;
      const receipt = {
        schema: 'simulatte.recursive-render-frame-receipt/v1',
        sequence: frameSequence,
        buildId,
        runtimeId,
        deviceClass,
        worldSpecContentHash: scene.worldSpecContentHash,
        sceneContentHash: scene.contentHash,
        observationContentHash: observation.contentHash,
        logicalTime: observation.logicalTime,
        viewport: Object.freeze({ width: canvas.width, height: canvas.height, pixelRatio }),
        floatingOrigin: camera.floatingOrigin,
        targetId: camera.targetId,
        instanceCount: scene.instances.length,
        drawCount: scene.groups.length,
        cpuFrameMilliseconds: now() - started,
        gpuTimingAvailable: false,
        frameBudgetClaimed: false,
      };
      receipt.contentHash = sceneApi.contentHash(receipt);
      return Object.freeze(receipt);
    }

    function dispose() {
      depthTexture?.destroy?.();
      instanceBuffer.destroy?.();
      uniformBuffer.destroy?.();
      Object.values(meshes).forEach((mesh) => mesh.buffer.destroy?.());
    }

    async function captureVisualEvidence(frameReceipt) {
      if (!frameReceipt || sceneApi.contentHash(frameReceipt) !== frameReceipt.contentHash) {
        throw new Error('recursive_webgpu_frame_receipt_invalid: Frame receipt is missing or tampered');
      }
      await device.queue.onSubmittedWorkDone?.();
      const blob = await canvasBlob(canvas);
      const pixelEvidenceHash = await sha256(await blob.arrayBuffer());
      const receipt = {
        ...frameReceipt,
        source: 'browser-webgpu',
        pixelEvidenceHash,
        pixelMimeType: blob.type || 'application/octet-stream',
        pixelByteLength: blob.size,
      };
      delete receipt.contentHash;
      receipt.contentHash = sceneApi.contentHash(receipt);
      return Object.freeze(receipt);
    }

    async function waitForSubmittedWork() {
      if (typeof device.queue.onSubmittedWorkDone !== 'function') {
        throw new Error('recursive_webgpu_completion_unavailable: GPUQueue.onSubmittedWorkDone is required for completed-frame evidence');
      }
      const started = now();
      await device.queue.onSubmittedWorkDone();
      return now() - started;
    }

    return Object.freeze({ captureVisualEvidence, dispose, focus: view.focus, render, viewSnapshot: view.snapshot, waitForSubmittedWork });
  }

  function canvasBlob(canvas) {
    if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type: 'image/png' });
    if (typeof canvas.toBlob !== 'function') throw new Error('recursive_webgpu_pixel_capture_unsupported: Canvas pixel capture is unavailable');
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('recursive_webgpu_pixel_capture_failed: Canvas returned no pixel evidence'));
    }, 'image/png'));
  }

  async function sha256(value) {
    const cryptoApi = globalThis.crypto?.subtle
      ? globalThis.crypto
      : typeof require === 'function'
        ? require('node:crypto').webcrypto
        : null;
    if (!cryptoApi?.subtle) throw new Error('recursive_webgpu_hash_unavailable: SHA-256 is unavailable');
    const digest = await cryptoApi.subtle.digest('SHA-256', value);
    return `sha256:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }

  function applyFloatingOrigin(instanceData, origin, stride) {
    const result = new Float32Array(instanceData);
    for (let offset = 0; offset < result.length; offset += stride) {
      result[offset + 12] -= origin[0];
      result[offset + 13] -= origin[1];
      result[offset + 14] -= origin[2];
    }
    return result;
  }

  function createMesh(device, vertices, label) {
    const buffer = createBuffer(device, vertices.byteLength, BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_DST, label);
    device.queue.writeBuffer(buffer, 0, vertices);
    return Object.freeze({ buffer, vertexCount: vertices.length / 3 });
  }

  function createBuffer(device, size, usage, label) {
    return device.createBuffer({ label, size: Math.max(4, Math.ceil(size / 4) * 4), usage });
  }

  function cubeVertices() {
    const faces = [
      [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
      [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
      [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
      [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
      [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
      [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]],
    ];
    return new Float32Array(faces.flatMap((face) => [face[0], face[1], face[2], face[0], face[2], face[3]]).flat());
  }

  function sphereVertices(latitudeBands, longitudeBands) {
    const rows = [];
    const point = (latitude, longitude) => {
      const theta = latitude / latitudeBands * Math.PI;
      const phi = longitude / longitudeBands * Math.PI * 2;
      return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
    };
    for (let latitude = 0; latitude < latitudeBands; latitude += 1) {
      for (let longitude = 0; longitude < longitudeBands; longitude += 1) {
        const a = point(latitude, longitude);
        const b = point(latitude + 1, longitude);
        const c = point(latitude + 1, longitude + 1);
        const d = point(latitude, longitude + 1);
        rows.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    return new Float32Array(rows);
  }

  function resizeCanvas(canvas, ratio) {
    const width = Math.max(1, Math.round((canvas.clientWidth || canvas.width || 1) * ratio));
    const height = Math.max(1, Math.round((canvas.clientHeight || canvas.height || 1) * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  function nextPowerOfTwo(value) { let result = 1; while (result < value) result *= 2; return result; }

  return Object.freeze({ SHADER, applyFloatingOrigin, createRenderer, cubeVertices, sphereVertices });
});
