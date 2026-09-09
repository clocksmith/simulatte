(function attachSolarRenderer(root) {
  'use strict';
  const math = root.SimulatteSolarGeometry;
  const shaders = root.SimulatteSolarShaders;
  if (!math || !shaders) throw new Error('solar_renderer_dependencies_missing');
  const CAPACITY = 6000;
  const SAMPLE_COUNT = 4;
  const INSTANCE_BYTES = shaders.instanceFloats * 4;

  async function create(canvas, onFailure) {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable. Open this instance in a WebGPU-enabled browser over HTTPS or localhost.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter is available.');
    const device = await adapter.requestDevice();
    let disposed = false, frameCount = 0, completedFrames = 0, pending = false;
    device.lost.then((info) => { if (!disposed) onFailure(new Error(`WebGPU device lost: ${info.message}`)); });
    device.addEventListener('uncapturederror', (event) => onFailure(event.error));
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas context unavailable.');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    const uniform = device.createBuffer({ size: 176, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const instances = device.createBuffer({ size: CAPACITY * INSTANCE_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const shadowTexture = device.createTexture({ size: [2048, 2048], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const sampler = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
    const bindLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
    ] });
    const shadowLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ] });
    const bindings = device.createBindGroup({ layout: bindLayout, entries: [
      { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: instances } },
      { binding: 2, resource: shadowTexture.createView() }, { binding: 3, resource: sampler },
    ] });
    const shadowBindings = device.createBindGroup({ layout: shadowLayout, entries: [
      { binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: instances } },
    ] });
    const vertexBuffers = [{ arrayStride: 24, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
    ] }];
    const mainModule = device.createShaderModule({ code: shaders.main, label: 'Solar drive GGX materials' });
    const shadowModule = device.createShaderModule({ code: shaders.shadow, label: 'Solar drive shadow map' });
    for (const module of [mainModule, shadowModule]) {
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter((m) => m.type === 'error');
      if (errors.length) throw new Error(errors.map((m) => `WGSL ${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    }
    const pipeline = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindLayout] }),
      vertex: { module: mainModule, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: { module: mainModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      multisample: { count: SAMPLE_COUNT },
    });
    const shadowPipeline = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [shadowLayout] }),
      vertex: { module: shadowModule, entryPoint: 'vs', buffers: vertexBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2 },
    });
    const meshes = {};
    for (const [id, vertices] of Object.entries(math.meshLibrary())) {
      const buffer = device.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
      new Float32Array(buffer.getMappedRange()).set(vertices);
      buffer.unmap();
      meshes[id] = { buffer, count: vertices.length / 6 };
    }
    let depth = null, color = null, width = 0, height = 0, lastViewProjection = null;
    const packed = new Float32Array(CAPACITY * shaders.instanceFloats);
    const frame = new Float32Array(shaders.frameFloats);
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      const w = Math.max(1, Math.min(2560, Math.round(canvas.clientWidth * dpr)));
      const h = Math.max(1, Math.min(1800, Math.round(canvas.clientHeight * dpr)));
      if (w === width && h === height) return;
      depth?.destroy(); color?.destroy(); width = w; height = h;
      canvas.width = w; canvas.height = h;
      depth = device.createTexture({ size: [w, h], sampleCount: SAMPLE_COUNT, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      color = device.createTexture({ size: [w, h], sampleCount: SAMPLE_COUNT, format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    }
    function render(scene, camera, selected = 0) {
      if (disposed || pending) return;
      resize();
      if (scene.instances.length > CAPACITY) throw new Error('solar_scene_instance_budget_exceeded');
      const grouped = new Map();
      for (const item of scene.instances) {
        if (!meshes[item.mesh]) throw new Error(`solar_geometry_missing: ${item.mesh}`);
        if (!grouped.has(item.mesh)) grouped.set(item.mesh, []);
        grouped.get(item.mesh).push(item);
      }
      let index = 0;
      const draws = [];
      for (const [id, items] of grouped) {
        const start = index;
        for (const item of items) {
          const offset = index * shaders.instanceFloats;
          packed.set(item.matrix, offset);
          packed.set(item.color, offset + 16);
          packed.set(item.material, offset + 20);
          for (let column = 0; column < 3; column += 1) {
            const c = column * 4;
            const divisor = item.matrix[c] ** 2 + item.matrix[c + 1] ** 2 + item.matrix[c + 2] ** 2 || 1;
            packed.set([item.matrix[c] / divisor, item.matrix[c + 1] / divisor, item.matrix[c + 2] / divisor, 0], offset + 24 + c);
          }
          index += 1;
        }
        draws.push({ ...meshes[id], start, instances: items.length, id });
      }
      const eye = [camera.target[0] + camera.distance * Math.sin(camera.yaw) * Math.cos(camera.pitch),
        camera.target[1] + camera.distance * Math.sin(camera.pitch),
        camera.target[2] + camera.distance * Math.cos(camera.yaw) * Math.cos(camera.pitch)];
      const viewProjection = math.multiply(math.perspective(width / height), math.lookAt(eye, camera.target));
      const sun = math.norm([-0.6, 1.2, 0.8]);
      const lightProjection = math.multiply(math.orthographic(5.8), math.lookAt(sun.map((x) => x * 14), [0, 0.8, 0]));
      frame.set(viewProjection); frame.set(lightProjection, 16); frame.set([...eye, scene.timeS], 32);
      frame.set([...sun, 1], 36); frame.set([selected, 0, 0, 0], 40);
      device.queue.writeBuffer(uniform, 0, frame);
      device.queue.writeBuffer(instances, 0, packed.subarray(0, index * shaders.instanceFloats));
      const encoder = device.createCommandEncoder();
      const shadows = encoder.beginRenderPass({ colorAttachments: [], depthStencilAttachment: {
        view: shadowTexture.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store',
      } });
      shadows.setPipeline(shadowPipeline); shadows.setBindGroup(0, shadowBindings);
      for (const draw of draws) {
        shadows.setVertexBuffer(0, draw.buffer);
        shadows.draw(draw.count, draw.instances, 0, draw.start);
      }
      shadows.end();
      const pass = encoder.beginRenderPass({ colorAttachments: [{
        view: color.createView(), resolveTarget: context.getCurrentTexture().createView(),
        clearValue: { r: 0.94, g: 0.935, b: 0.92, a: 1 }, loadOp: 'clear', storeOp: 'discard',
      }], depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } });
      pass.setPipeline(pipeline); pass.setBindGroup(0, bindings);
      for (const draw of draws) {
        pass.setVertexBuffer(0, draw.buffer); pass.draw(draw.count, draw.instances, 0, draw.start);
      }
      pass.end(); device.queue.submit([encoder.finish()]);
      frameCount += 1;
      if (!pending) {
        pending = true;
        const submitted = frameCount;
        device.queue.onSubmittedWorkDone().then(() => { completedFrames = submitted; pending = false; }, onFailure);
      }
      lastViewProjection = viewProjection;
      canvas.dataset.backend = 'webgpu'; canvas.dataset.instanceCount = String(index);
      canvas.dataset.submittedFrames = String(frameCount); canvas.dataset.completedFrames = String(completedFrames);
    }
    function receipt() {
      return { backend: 'webgpu', adapter: { vendor: adapter.info?.vendor || '', architecture: adapter.info?.architecture || '',
        device: adapter.info?.device || '', description: adapter.info?.description || '' },
      submittedFrames: frameCount, completedFrames, width, height, sampleCount: SAMPLE_COUNT,
      shadowMapSize: 2048, instanceStrideBytes: INSTANCE_BYTES, frameUniformBytes: 176 };
    }
    function dispose() {
      if (disposed) return;
      disposed = true; depth?.destroy(); color?.destroy(); shadowTexture.destroy();
      uniform.destroy(); instances.destroy(); Object.values(meshes).forEach((mesh) => mesh.buffer.destroy());
      context.unconfigure(); device.destroy();
    }
    return { render, receipt, dispose, project: (point) => lastViewProjection ? math.project(lastViewProjection, point, canvas.clientWidth, canvas.clientHeight) : null };
  }
  root.SimulatteSolarRenderer = Object.freeze({ create });
})(globalThis);
