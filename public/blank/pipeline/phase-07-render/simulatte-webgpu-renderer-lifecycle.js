(function attachRendererLifecycle(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');
  class WebGpuRendererLifecycle {
    assertAlive() {
      if (this.disposed) throw Object.assign(new Error('Renderer disposed'), { code: 'renderer_disposed' });
    }

    releaseResources() {
      this.renderTargets?.destroy();
      this.renderTargets = null;
      this.depthTexture = null;
      for (const key of ['uniformBuffer', 'objectPartBuffer', 'objectUniformBuffer']) {
        this[key]?.destroy();
        this[key] = null;
      }
      this.context?.unconfigure?.();
      this.device?.destroy();
      this.device = null;
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.ready = false;
      this.pixelReadbackGeneration += 1;
      this.onSceneProof = null;
      this.onFailure = null;
      this.releaseResources();
      this.renderData = null;
      this.renderExecutionInput = null;
      this.phase7Output = null;
      this.phase8Output = null;
    }

    async init() {
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        this.assertAlive();
        if (!adapter) throw new Error('WebGPU adapter unavailable');
        this.deviceClass = scope.webGpuDeviceClass(adapter);
        const deviceRequest = await scope.requestWebGpuDevice(adapter);
        if (this.disposed) {
          deviceRequest.device.destroy();
          this.assertAlive();
        }
        this.device = deviceRequest.device;
        this.webgpuFeatureReceipt = deviceRequest.receipt;
        this.device.addEventListener('uncapturederror', (event) => {
          if (this.disposed) return;
          const message = event && event.error && event.error.message
            ? event.error.message
            : 'uncaptured WebGPU error';
          this.status = message;
          this.errorLog.push(message);
          this.canvas.dataset.rendererStatus = this.errorLog.slice(-4).join(' | ');
          this.ready = false;
          this.onFailure?.(Object.assign(new Error(message), { code: 'webgpu_uncaptured_error' }));
        });
        this.device.pushErrorScope('validation');
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
          device: this.device,
          format: this.format,
          usage: scope.canvasTextureUsage(),
          alphaMode: 'opaque',
        });
        this.uniformBuffer = this.device.createBuffer({
          size: this.uniforms.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.objectPartBuffer = this.device.createBuffer({
          size: scope.GPU_OBJECT_PART_CAPACITY * scope.GPU_OBJECT_PART_BYTES,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.objectUniformBuffer = this.device.createBuffer({
          size: this.objectUniforms.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.bindGroupLayout = this.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          ],
        });
        const shader = this.device.createShaderModule({ code: scope.WEBGPU_BACKGROUND_SHADER });
        this.pipeline = this.device.createRenderPipeline({
          layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
          vertex: { module: shader, entryPoint: 'backgroundVs' },
          fragment: { module: shader, entryPoint: 'backgroundFs', targets: [{ format: this.format }] },
          primitive: { topology: 'triangle-list' },
          depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: false,
            depthCompare: 'always',
          },
        });
        this.bindGroup = this.device.createBindGroup({
          layout: this.bindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.uniformBuffer } },
          ],
        });
        const pipelineError = await this.device.popErrorScope();
        this.assertAlive();
        if (pipelineError) throw new Error(pipelineError.message || 'WebGPU pipeline validation failed');
        await this.setupObjectPartPipeline();
        this.assertAlive();
        const activeDevice = this.device;
        activeDevice.lost.then((info) => {
          if (this.disposed || this.device !== activeDevice) return;
          this.renderTargets?.destroy();
          this.ready = false;
          this.status = `WebGPU device lost: ${info && info.message ? info.message : 'unknown'}`;
          this.canvas.dataset.rendererStatus = this.status;
          this.onFailure?.(Object.assign(new Error(this.status), { code: 'webgpu_device_lost' }));
        });
        this.ready = true;
        this.status = 'WebGPU renderer ready';
        this.canvas.dataset.renderer = 'webgpu';
        this.canvas.dataset.visualTier = 'webgpu-depth-lit-2-5d';
        this.canvas.dataset.rendererStatus = this.status;
        this.canvas.dataset.webgpuFeatureFlags = scope.webgpuFeatureSummary(this.webgpuFeatureReceipt);
        this.canvas.dataset.webgpuOptimizationPath = this.gpuScenePath;
      } catch (err) {
        if (this.disposed) return;
        this.initializationError = err;
        this.releaseResources();
        this.ready = false;
        this.status = err && err.message ? err.message : 'WebGPU renderer failed';
        this.canvas.dataset.renderer = 'webgpu-unavailable';
        this.canvas.dataset.rendererStatus = this.status;
      }
    }

    async setupObjectPartPipeline() {
      this.device.pushErrorScope('validation');
      this.objectBindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
          { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        ],
      });
      const shader = this.device.createShaderModule({ code: scope.WEBGPU_OBJECT_SHADER });
      this.objectPipeline = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.objectBindGroupLayout] }),
        vertex: { module: shader, entryPoint: 'objectVs' },
        fragment: {
          module: shader,
          entryPoint: 'objectFs',
          targets: [{
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less',
        },
      });
      this.objectBindGroup = this.device.createBindGroup({
        layout: this.objectBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.objectUniformBuffer } },
          { binding: 1, resource: { buffer: this.objectPartBuffer } },
        ],
      });
      const error = await this.device.popErrorScope();
      this.assertAlive();
      if (error) throw new Error(error.message || 'WebGPU object-part pipeline validation failed');
      this.gpuScenePath = 'background-plus-instanced-object-parts';
      this.webgpuFeatureReceipt.used = [
        'compiled-object-geometry-programs',
        'storage-buffer-object-parts',
        'instanced-bounded-quads',
        'depth-buffer-occlusion',
        'camera-perspective-transform',
        'normal-material-lighting',
      ];
    }

  }
  root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-lifecycle.js', { WebGpuRendererLifecycle });
})(typeof globalThis !== 'undefined' ? globalThis : window);
