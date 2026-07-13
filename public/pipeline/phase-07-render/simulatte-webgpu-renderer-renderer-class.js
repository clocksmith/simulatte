(function attachSimulatteWebGpuRendererrendererclass(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function makeDefaultWebGpuFeatureReceipt() {
        return {
          schema: DEFAULT_WEBGPU_FEATURE_RECEIPT.schema,
          available: [],
          requested: [],
          enabled: [],
          failed: [],
          used: DEFAULT_WEBGPU_FEATURE_RECEIPT.used.slice(),
          unsupportedNativeFeatures: DEFAULT_WEBGPU_FEATURE_RECEIPT.unsupportedNativeFeatures.slice(),
        };
      }

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
          this.onSceneProof = typeof options.onSceneProof === 'function' ? options.onSceneProof : null;
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
          this.sceneRenderPacketKey = '';
          this.renderExecutionInput = null;
          this.renderInputSerial = 0;
          this.canvas.dataset.renderInputSerial = '0';
          this.renderData = null;
          this.phase7Output = null;
          this.phase7OutputPacketKey = '';
          this.phase8Output = null;
          this.pixelReadbackSerial = 0;
          this.pendingPixelReadbackPromise = null;
          this.pendingPixelReadbackPacketKey = '';
          this.lastPixelReadbackReceipt = null;
          this.sceneObjectUniforms = new Float32Array(SCENE_PACKET_FLOATS);
          this.sceneInstanceData = new Float32Array(GPU_SCENE_INSTANCE_CAPACITY * GPU_SCENE_INSTANCE_FLOATS);
          this.sceneInstanceCount = 0;
          this.objectPartData = new Float32Array(GPU_OBJECT_PART_CAPACITY * GPU_OBJECT_PART_FLOATS);
          this.objectUniforms = new Float32Array(GPU_OBJECT_UNIFORM_FLOATS);
          this.cameraState = {};
          this.lightState = {};
          this.rendererConsumption = null;
          this.objectPartCount = 0;
          this.objectPartBufferDirty = true;
          this.gpuScenePath = 'background-plus-instanced-object-parts';
          this.webgpuFeatureReceipt = makeDefaultWebGpuFeatureReceipt();
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
            const deviceRequest = await requestWebGpuDevice(adapter);
            this.device = deviceRequest.device;
            this.webgpuFeatureReceipt = deviceRequest.receipt;
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
              usage: canvasTextureUsage(),
              alphaMode: 'opaque',
            });
            this.uniformBuffer = this.device.createBuffer({
              size: this.uniforms.byteLength,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.objectPartBuffer = this.device.createBuffer({
              size: GPU_OBJECT_PART_CAPACITY * GPU_OBJECT_PART_BYTES,
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
            const shader = this.device.createShaderModule({ code: WEBGPU_BACKGROUND_SHADER });
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
            if (pipelineError) throw new Error(pipelineError.message || 'WebGPU pipeline validation failed');
            await this.setupObjectPartPipeline();
            this.device.lost.then((info) => {
              this.ready = false;
              this.status = `WebGPU device lost: ${info && info.message ? info.message : 'unknown'}`;
              this.canvas.dataset.rendererStatus = this.status;
            });
            this.ready = true;
            this.status = 'WebGPU renderer ready';
            this.canvas.dataset.renderer = 'webgpu';
            this.canvas.dataset.visualTier = 'webgpu-depth-lit-2-5d';
            this.canvas.dataset.rendererStatus = this.status;
            this.canvas.dataset.webgpuFeatureFlags = webgpuFeatureSummary(this.webgpuFeatureReceipt);
            this.canvas.dataset.webgpuOptimizationPath = this.gpuScenePath;
          } catch (err) {
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
          const shader = this.device.createShaderModule({ code: WEBGPU_OBJECT_SHADER });
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

        isReady() {
          return this.ready;
        }

        setLoading(active, percent, stage) {
          this.canvas.dataset.loadingIgnored = active ? `${Number(percent || 0)}:${stage || ''}` : '';
        }

        setRenderExecutionInput(renderExecutionInput) {
          const scenePacket = sceneRenderPacketFromExecutionInput(renderExecutionInput);
          const nextRenderExecutionInput = renderExecutionInput && renderExecutionInput.schema === 'simulatte.renderExecutionInput.v1'
            ? renderExecutionInput
            : null;
          if (nextRenderExecutionInput !== this.renderExecutionInput) {
            this.renderInputSerial += 1;
            this.canvas.dataset.renderInputSerial = String(this.renderInputSerial);
          }
          this.renderExecutionInput = nextRenderExecutionInput;
          this.canvas.dataset.renderExecutionInput = this.renderExecutionInput
            ? this.renderExecutionInput.schema
            : 'missing-renderExecutionInput';
          this.canvas.dataset.phase7InputVisualObligationCount = String(
            this.renderExecutionInput && Array.isArray(this.renderExecutionInput.visualObligations)
              ? this.renderExecutionInput.visualObligations.length
              : 0
          );
          const packet = scenePacket || emptySceneRenderPacket();
          const sceneKind = packet.sceneKind || '';
          if (this.renderData && packet === this.sceneRenderPacket) {
            this.sceneKind = sceneKind;
            this.applyPixelSampleOptions(renderExecutionInput);
            return;
          }
          const packetKey = sceneRenderPacketRenderDataKey(packet, sceneKind);
          if (this.renderData && packetKey === this.sceneRenderPacketKey) {
            this.sceneRenderPacket = packet;
            this.sceneKind = sceneKind;
            this.applyPixelSampleOptions(renderExecutionInput);
            return;
          }
          this.sceneRenderPacket = packet;
          this.sceneKind = sceneKind;
          this.sceneRenderPacketKey = packetKey;
          this.resetPixelReadbackForPacket(packetKey);
          this.renderData = compileSceneRenderData(packet, sceneKind, packetKey);
          this.applyPixelSampleOptions(renderExecutionInput);
          this.applyRenderData(this.renderData, scenePacket !== null);
        }

        setSpec(renderExecutionInput) {
          this.setRenderExecutionInput(renderExecutionInput);
        }

        applyPixelSampleOptions(renderExecutionInput = null) {
          if (!this.renderData) return;
          const proof = renderExecutionInput && renderExecutionInput.phase7PixelProof || {};
          const auditRequiresProof = this.canvas && this.canvas.dataset && this.canvas.dataset.auditRequirePixelProof === 'true';
          const requiredObligationIds = phase7RequiredVisualObligationIds(renderExecutionInput, this.sceneRenderPacket);
          this.renderData.requireLivePixelSamples = renderExecutionInput && renderExecutionInput.requireLivePixelSamples === true ||
            proof.required === true ||
            auditRequiresProof ||
            requiredObligationIds.length > 0;
          this.canvas.dataset.phase7LivePixelSamplesRequired = this.renderData.requireLivePixelSamples ? 'true' : 'false';
          this.canvas.dataset.phase7RequiredVisualObligationCount = String(requiredObligationIds.length);
          const samples = renderExecutionInput && (
            renderExecutionInput.pixelSamples ||
            renderExecutionInput.livePixelSamples ||
            proof.samples ||
            proof.pixelSamples
          ) || null;
          if (samples) {
            this.renderData.pixelSamples = samples;
            this.renderData.pixelSampleSource = 'renderExecutionInput';
          } else if (this.renderData.pixelSampleSource === 'renderExecutionInput') {
            delete this.renderData.pixelSamples;
            delete this.renderData.pixelSampleSource;
          }
        }

        render(renderExecutionInput, nowMs) {
          if (!this.ready || !this.device || !this.pipeline) return false;
          const started = typeof performance !== 'undefined' ? performance.now() : nowMs;
          if (renderExecutionInput && renderExecutionInput !== this.renderExecutionInput) {
            this.setRenderExecutionInput(renderExecutionInput);
          }
          const state = this.renderExecutionInput && this.renderExecutionInput.simulationState || {};
          this.resize();
          this.refreshRendererConsumption();
          this.writeUniforms(state, nowMs || 0);
          this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniforms);
          this.writeObjectUniforms(nowMs || 0);
          this.writeObjectPartBuffer();
          const encoder = this.device.createCommandEncoder();
          const frameTexture = this.context.getCurrentTexture();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: frameTexture.createView(),
              clearValue: { r: 0.98, g: 0.98, b: 1, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            }],
            ...(this.depthTexture ? {
              depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
              },
            } : {}),
          });
          pass.setPipeline(this.pipeline);
          pass.setBindGroup(0, this.bindGroup);
          pass.draw(3, 1, 0, 0);
          if (this.objectPipeline && this.objectBindGroup && this.objectPartCount > 0) {
            pass.setPipeline(this.objectPipeline);
            pass.setBindGroup(0, this.objectBindGroup);
            pass.draw(6, this.objectPartCount, 0, 0);
          }
          pass.end();
          this.renderData.pixelReadbackTimeMs = nowMs || 0;
          const pixelReadback = this.encodePixelReadback(encoder, frameTexture);
          this.device.queue.submit([encoder.finish()]);
          if (typeof performance !== 'undefined') {
            this.lastFrameMs = performance.now() - started;
            this.adaptQuality();
          }
          this.renderCount += 1;
          this.canvas.dataset.renderCount = String(this.renderCount);
          this.canvas.dataset.lastFrameMs = String(Number(this.lastFrameMs || 0).toFixed(3));
          this.canvas.dataset.webgpuOptimizationPath = this.gpuScenePath;
          this.refreshPhase7Output(this.renderCount, this.lastFrameMs);
          this.schedulePixelReadback(pixelReadback, this.renderCount, this.lastFrameMs);
          return true;
        }

        refreshPhase7Output(renderCount = this.renderCount, frameMs = this.lastFrameMs) {
          const packetKey = this.renderData && this.renderData.packetKey || '';
          if (!this.phase7Output || packetKey !== this.phase7OutputPacketKey) {
            this.phase7Output = phase7OutputEnvelope(
              this.renderExecutionInput,
              this.sceneRenderPacket,
              renderCount,
              frameMs,
              this.canvas,
              this.renderData,
              this.webgpuOptimizationReceipt()
            );
            this.phase7OutputPacketKey = packetKey;
            this.canvas.dataset.phase7Output = this.phase7Output.schema;
            this.canvas.dataset.phase7OutputInput = this.phase7Output.inputSchema;
            this.settleSceneProof();
            return this.phase7Output;
          }
          const execution = this.phase7Output.artifact && this.phase7Output.artifact.renderExecution;
          if (execution) {
            execution.renderCount = Number(renderCount || 0);
            execution.frameMs = Number(frameMs || 0);
          }
          return this.phase7Output;
        }

        settleSceneProof() {
          const api = typeof globalThis !== 'undefined' ? globalThis.SimulatteSceneProof : null;
          if (!api || typeof api.settleSceneProof !== 'function' || !this.phase7Output) {
            this.phase8Output = null;
            return null;
          }
          try {
            this.phase8Output = api.settleSceneProof(this.phase7Output);
            const sceneProof = this.phase8Output.artifact.sceneProof;
            this.canvas.dataset.phase8Output = this.phase8Output.schema;
            this.canvas.dataset.sceneProofVerdict = sceneProof.verdict;
            this.canvas.dataset.sceneProofError = '';
            this.canvas.dataset.sceneProofLostCount = String(sceneProof.summary.lostCount);
            this.canvas.dataset.sceneProofNotProvenCount = String(sceneProof.summary.notProvenCount);
            this.canvas.dataset.sceneProofRequiredLostIds = JSON.stringify(sceneProof.summary.requiredLostIds || []);
            this.canvas.dataset.sceneProofRequiredNotProvenIds = JSON.stringify(
              sceneProof.summary.requiredNotProvenIds || []
            );
            this.canvas.dataset.sceneProofRequiredFailures = JSON.stringify(
              (sceneProof.settledObligations || []).filter((row) => (
                row.required === true && (row.status === 'lost' || row.status === 'not-proven')
              ))
            );
          } catch (error) {
            this.phase8Output = null;
            this.canvas.dataset.phase8Output = '';
            this.canvas.dataset.sceneProofVerdict = 'error';
            this.canvas.dataset.sceneProofError = error && error.message ? error.message : String(error);
            this.canvas.dataset.sceneProofRequiredLostIds = '[]';
            this.canvas.dataset.sceneProofRequiredNotProvenIds = '[]';
            this.canvas.dataset.sceneProofRequiredFailures = '[]';
          }
          notifyRendererSceneProof(this);
          return this.phase8Output;
        }

        encodePixelReadback(encoder, frameTexture) {
          const plan = phase7PixelReadbackPlan(
            this.renderData,
            this.sceneRenderPacket,
            this.renderExecutionInput,
            this.canvas
          );
          if (!plan || !plan.samples.length) {
            this.canvas.dataset.phase7PixelReadbackPlan = 'none';
            return null;
          }
          this.canvas.dataset.phase7PixelReadbackPlan = String(plan.samples.length);
          if (this.pendingPixelReadbackPacketKey === plan.packetKey) return null;
          if (!this.device || typeof this.device.createBuffer !== 'function') return null;
          if (!encoder || typeof encoder.copyTextureToBuffer !== 'function') return null;
          const size = Math.max(PIXEL_READBACK_BYTES_PER_ROW, plan.samples.length * PIXEL_READBACK_BYTES_PER_ROW);
          const buffer = this.device.createBuffer({
            size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
          plan.samples.forEach((sample, index) => {
            encoder.copyTextureToBuffer(
              {
                texture: frameTexture,
                origin: { x: sample.x, y: sample.y, z: 0 },
              },
              {
                buffer,
                offset: index * PIXEL_READBACK_BYTES_PER_ROW,
                bytesPerRow: PIXEL_READBACK_BYTES_PER_ROW,
                rowsPerImage: 1,
              },
              { width: 1, height: 1, depthOrArrayLayers: 1 }
            );
          });
          const readback = {
            schema: 'simulatte.phase7PixelReadback.v1',
            serial: this.pixelReadbackSerial += 1,
            packetKey: this.renderData && this.renderData.packetKey || '',
            plan,
            buffer,
            bytesPerRow: PIXEL_READBACK_BYTES_PER_ROW,
          };
          this.pendingPixelReadbackPacketKey = readback.packetKey;
          this.canvas.dataset.phase7PixelReadback = 'pending';
          this.canvas.dataset.phase7PixelReadbackMessage = '';
          this.canvas.dataset.phase7PixelProofStatus = 'pending';
          return readback;
        }

        schedulePixelReadback(readback, renderCount, frameMs) {
          if (!readback) return;
          const done = Promise.resolve()
            .then(() => {
              const submitted = this.device && this.device.queue && this.device.queue.onSubmittedWorkDone;
              return typeof submitted === 'function' ? submitted.call(this.device.queue) : null;
            })
            .then(() => readback.buffer.mapAsync(GPUMapMode.READ))
            .then(() => {
              const mapped = new Uint8Array(readback.buffer.getMappedRange());
              const samples = readback.plan.samples.map((sample, index) => {
                const raw = [
                  mapped[index * readback.bytesPerRow],
                  mapped[index * readback.bytesPerRow + 1],
                  mapped[index * readback.bytesPerRow + 2],
                  mapped[index * readback.bytesPerRow + 3],
                ];
                return {
                  ...sample,
                  rgba: /^bgra/.test(this.format) ? [raw[2], raw[1], raw[0], raw[3]] : raw,
                };
              });
              if (typeof readback.buffer.unmap === 'function') readback.buffer.unmap();
              if (typeof readback.buffer.destroy === 'function') readback.buffer.destroy();
              this.applyPixelReadbackSamples(readback, samples, renderCount, frameMs);
            })
            .catch((err) => {
              this.recordPixelReadbackFailure(readback, err);
            })
            .finally(() => {
              if (this.pendingPixelReadbackPacketKey === readback.packetKey) {
                this.pendingPixelReadbackPacketKey = '';
              }
            });
          this.pendingPixelReadbackPromise = done;
        }

        applyPixelReadbackSamples(readback, samples, renderCount, frameMs) {
          if (!this.renderData || this.renderData.packetKey !== readback.packetKey) return;
          const sampleSet = {
            schema: 'simulatte.phase7PixelSampleSet.v1',
            source: 'webgpu-texture-copy-readback',
            packetKey: readback.packetKey,
            readbackSerial: readback.serial,
            samples,
          };
          this.renderData.livePixelSamples = sampleSet;
          this.canvas.__simulattePixelSamples = sampleSet;
          this.lastPixelReadbackReceipt = {
            schema: 'simulatte.phase7PixelReadbackReceipt.v1',
            status: 'pass',
            source: sampleSet.source,
            packetKey: readback.packetKey,
            sampleCount: samples.length,
            readbackSerial: readback.serial,
          };
          this.phase7OutputPacketKey = '';
          this.refreshPhase7Output(renderCount, frameMs);
          const pixelAudit = this.phase7Output && this.phase7Output.artifact &&
            this.phase7Output.artifact.renderExecution &&
            this.phase7Output.artifact.renderExecution.pixelAudit;
          this.renderData.livePixelSamplesStatus = pixelAudit && pixelAudit.status || 'unknown';
          this.canvas.dataset.phase7PixelReadback = 'pass';
          this.canvas.dataset.phase7PixelSampleCount = String(samples.length);
          this.canvas.dataset.phase7PixelProofStatus = pixelAudit && pixelAudit.status || 'unknown';
          this.canvas.dataset.phase7PixelVisibleSampleCount = String(
            pixelAudit && pixelAudit.livePixelAudit && pixelAudit.livePixelAudit.visibleSampleCount || 0
          );
          this.canvas.dataset.phase7PixelMinContrast = String(
            pixelAudit && pixelAudit.livePixelAudit && pixelAudit.livePixelAudit.minContrast || 0
          );
          this.canvas.dataset.phase7PixelSampledObligationCount = String(
            pixelAudit && pixelAudit.livePixelAudit && pixelAudit.livePixelAudit.sampledRequiredObligationCount || 0
          );
          this.canvas.dataset.phase7PixelRequiredObligationCount = String(
            pixelAudit && pixelAudit.livePixelAudit && pixelAudit.livePixelAudit.requiredObligationCount || 0
          );
          this.canvas.dataset.phase7PixelSampledObligations = pixelAudit && pixelAudit.livePixelAudit
            ? pixelAudit.livePixelAudit.sampledObligationIds.join(',')
            : '';
          this.canvas.dataset.phase7VisualObligationProof = JSON.stringify(
            this.phase7Output && this.phase7Output.artifact && this.phase7Output.artifact.renderExecution.visualObligationProof || []
          ).slice(0, 2000);
          this.canvas.dataset.phase7PixelAuditChecks = JSON.stringify(pixelAudit && pixelAudit.checks || []).slice(0, 2000);
        }

        recordPixelReadbackFailure(readback, err) {
          const message = err && err.message ? err.message : 'WebGPU pixel readback failed';
          this.lastPixelReadbackReceipt = {
            schema: 'simulatte.phase7PixelReadbackReceipt.v1',
            status: 'fail',
            source: 'webgpu-texture-copy-readback',
            packetKey: readback && readback.packetKey || '',
            sampleCount: readback && readback.plan && readback.plan.samples.length || 0,
            readbackSerial: readback && readback.serial || 0,
            message,
          };
          this.errorLog.push(message);
          if (this.renderData) this.renderData.livePixelSamplesStatus = 'fail';
          this.canvas.dataset.phase7PixelReadback = 'fail';
          this.canvas.dataset.phase7PixelReadbackMessage = message;
          this.canvas.dataset.phase7PixelProofStatus = 'fail';
          this.phase7OutputPacketKey = '';
          this.refreshPhase7Output(this.renderCount, this.lastFrameMs);
        }

        resetPixelReadbackForPacket(packetKey = '') {
          this.pendingPixelReadbackPacketKey = '';
          this.lastPixelReadbackReceipt = null;
          this.phase7Output = null;
          this.phase7OutputPacketKey = '';
          if (!this.canvas || !this.canvas.dataset) return;
          this.canvas.dataset.phase7PixelReadback = '';
          this.canvas.dataset.phase7PixelReadbackMessage = '';
          this.canvas.dataset.phase7PixelProofStatus = '';
          this.canvas.dataset.phase7PixelSampleCount = '0';
          this.canvas.dataset.phase7PixelVisibleSampleCount = '0';
          this.canvas.dataset.phase7PixelMinContrast = '0';
          this.canvas.dataset.phase7PixelSampledObligationCount = '0';
          this.canvas.dataset.phase7PixelRequiredObligationCount = '0';
          this.canvas.dataset.phase7PixelSampledObligations = '';
          this.canvas.dataset.phase7VisualObligationProof = '';
          this.canvas.dataset.phase7PixelAuditChecks = '';
          this.canvas.dataset.phase7PixelPacketKey = packetKey;
        }

        applyRenderData(renderData, hasScenePacket) {
          this.sceneId = renderData.sceneId;
          this.features = renderData.features;
          this.atomUniforms = renderData.atomUniforms;
          this.sceneMix = renderData.sceneMix;
          this.visualIrLayers = renderData.visualIrLayers;
          this.sceneObjectUniforms = renderData.sceneObjectUniforms;
          this.sceneInstanceData = renderData.sceneInstanceData;
          this.sceneInstanceCount = renderData.sceneInstanceCount;
          this.objectPartData = renderData.objectPartData;
          this.objectPartCount = renderData.objectPartCount;
          this.cameraState = renderData.cameraState || {};
          this.lightState = renderData.lightState || {};
          this.rendererConsumption = renderData.rendererConsumption || null;
          this.objectPartBufferDirty = true;
          this.palette = paletteForScene(this.sceneKind, this.atomUniforms, renderData.palette);
          this.metrics = renderData.metrics;
          this.seed = renderData.seed;
          this.canvas.dataset.sceneKind = this.sceneKind;
          this.canvas.dataset.sceneId = String(this.sceneId);
          this.canvas.dataset.sceneMix = sceneMixSummary(this.sceneMix);
          this.canvas.dataset.sceneMixSlots = String(activeSceneMixSlots(this.sceneMix));
          this.canvas.dataset.visualIrLayers = visualIrLayerSummary(this.visualIrLayers);
          this.canvas.dataset.visualIrLayerSlots = String(activeVisualIrLayerSlots(this.visualIrLayers));
          this.canvas.dataset.phase7Input = this.renderExecutionInput
            ? this.renderExecutionInput.schema
            : 'missing-renderExecutionInput';
          this.canvas.dataset.phase7SceneRenderPacketInput = hasScenePacket
            ? this.sceneRenderPacket.schema
            : 'missing-sceneRenderPacket';
          this.canvas.dataset.phase7RenderData = renderData.schema;
          this.canvas.dataset.phase7RenderDataKey = renderData.packetKey;
          this.canvas.dataset.phase7RenderPath = renderData.path;
          this.canvas.dataset.sceneRenderDrawCount = String(renderData.drawCount);
          this.canvas.dataset.sceneRenderPacket = renderData.summary;
          this.canvas.dataset.sceneRenderEntityCount = String(renderData.entityCount);
          this.canvas.dataset.sceneRenderFieldCount = String(renderData.fieldCount);
          this.canvas.dataset.sceneRenderEffectCount = String(renderData.effectCount);
          this.canvas.dataset.sceneRenderSpatialHash = renderData.spatialHash;
          this.canvas.dataset.sceneObjectUniforms = renderData.sceneObjectUniformSummary;
          this.canvas.dataset.sceneObjectIdentities = renderData.sceneObjectIdentitySummary;
          this.canvas.dataset.webgpuOptimizationPath = this.gpuScenePath;
          this.canvas.dataset.webgpuSceneInstanceCapacity = String(GPU_SCENE_INSTANCE_CAPACITY);
          this.canvas.dataset.webgpuSceneInstanceCount = String(renderData.sceneInstanceCount);
          this.canvas.dataset.webgpuSceneInstances = renderData.sceneInstanceSummary;
          this.canvas.dataset.webgpuObjectPartCapacity = String(GPU_OBJECT_PART_CAPACITY);
          this.canvas.dataset.webgpuObjectPartCount = String(renderData.objectPartCount);
          this.canvas.dataset.webgpuObjectParts = renderData.objectPartSummary;
          this.canvas.dataset.webgpuObjectRealization = JSON.stringify(renderData.objectRealization);
          this.canvas.dataset.webgpuStorageBytes = String(GPU_OBJECT_PART_CAPACITY * GPU_OBJECT_PART_BYTES);
          this.canvas.dataset.phase7RendererConsumption = JSON.stringify(this.rendererConsumption || {});
          this.canvas.dataset.phase7CameraConsumed = this.rendererConsumption && this.rendererConsumption.cameraConsumed ? 'true' : 'false';
          this.canvas.dataset.phase7LightCountConsumed = String(this.rendererConsumption && this.rendererConsumption.lightCountConsumed || 0);
          this.canvas.dataset.phase7MaterialCountConsumed = String(this.rendererConsumption && this.rendererConsumption.materialCountConsumed || 0);
          this.canvas.dataset.phase7DepthEnabled = this.rendererConsumption && this.rendererConsumption.depthEnabled ? 'true' : 'false';
        }

        refreshRendererConsumption() {
          if (!this.rendererConsumption) return;
          const objectPathActive = Boolean(
            this.objectPipeline && this.objectBindGroup && this.objectUniformBuffer && this.objectPartCount > 0
          );
          this.rendererConsumption.cameraConsumed = objectPathActive &&
            this.rendererConsumption.cameraConfigured === true;
          this.rendererConsumption.lightCountConsumed = objectPathActive
            ? Number(this.rendererConsumption.sourceLightCount || 0)
            : 0;
          this.rendererConsumption.materialCountConsumed = objectPathActive
            ? Number(this.rendererConsumption.sourceMaterialCount || 0)
            : 0;
          this.rendererConsumption.depthEnabled = objectPathActive && Boolean(this.depthTexture);
          this.rendererConsumption.normalShading = objectPathActive;
          if (this.renderData) this.renderData.rendererConsumption = this.rendererConsumption;
          this.canvas.dataset.phase7RendererConsumption = JSON.stringify(this.rendererConsumption);
          this.canvas.dataset.phase7CameraConsumed = this.rendererConsumption.cameraConsumed ? 'true' : 'false';
          this.canvas.dataset.phase7LightCountConsumed = String(this.rendererConsumption.lightCountConsumed);
          this.canvas.dataset.phase7MaterialCountConsumed = String(this.rendererConsumption.materialCountConsumed);
          this.canvas.dataset.phase7DepthEnabled = this.rendererConsumption.depthEnabled ? 'true' : 'false';
        }

        writeObjectUniforms(nowMs = 0) {
          if (!this.objectUniformBuffer) return;
          this.objectUniforms = scenePacketCameraLightUniformVector(
            this.cameraState,
            this.lightState,
            this.canvas.dataset.auditFreezeFrame === 'true' ? 0 : nowMs * 0.001,
            this.canvas.width,
            this.canvas.height
          );
          this.device.queue.writeBuffer(this.objectUniformBuffer, 0, this.objectUniforms);
        }

        writeObjectPartBuffer() {
          if (!this.objectPartBuffer || !this.objectPartBufferDirty) return;
          this.device.queue.writeBuffer(this.objectPartBuffer, 0, this.objectPartData);
          this.objectPartBufferDirty = false;
        }

        webgpuOptimizationReceipt() {
          return {
            schema: 'simulatte.phase7.webgpuOptimization.v1',
            path: this.gpuScenePath,
            computeSceneReady: false,
            instanceCapacity: GPU_SCENE_INSTANCE_CAPACITY,
            instanceCount: this.sceneInstanceCount,
            objectPartCapacity: GPU_OBJECT_PART_CAPACITY,
            objectPartCount: this.objectPartCount,
            storageBytes: GPU_OBJECT_PART_CAPACITY * GPU_OBJECT_PART_BYTES,
            indirectDraw: 'not-used-direct-instancing',
            drawCalls: this.objectPartCount > 0 ? 2 : 1,
            translatedTechniques: WEBGPU_TRANSLATED_TECHNIQUES.slice(),
            unsupportedNativeFeatures: WEBGPU_NATIVE_ONLY_FEATURES.slice(),
            features: this.webgpuFeatureReceipt,
            pixelReadback: this.lastPixelReadbackReceipt,
            rendererConsumption: this.rendererConsumption,
          };
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
          if (this.depthTexture && typeof this.depthTexture.destroy === 'function') this.depthTexture.destroy();
          this.depthTexture = this.device && typeof this.device.createTexture === 'function'
            ? this.device.createTexture({
              size: [width, height, 1],
              format: 'depth24plus',
              usage: typeof GPUTextureUsage === 'undefined' ? 0x10 : GPUTextureUsage.RENDER_ATTACHMENT,
            })
            : null;
        }

        writeUniforms(state, nowMs) {
          const u = this.uniforms;
          u[0] = this.canvas.width;
          u[1] = this.canvas.height;
          u[2] = this.canvas.dataset.auditFreezeFrame === 'true' ? 0 : nowMs * 0.001;
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

    function canvasTextureUsage() {
        const fallback = 0x10 | 0x01;
        if (typeof GPUTextureUsage === 'undefined') return fallback;
        return GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC;
      }

    function sceneRenderPacketFromExecutionInput(renderExecutionInput) {
        if (!renderExecutionInput) return null;
        if (renderExecutionInput.schema === 'simulatte.sceneRenderPacket.v1') {
          throw new Error('Phase 7 expected simulatte.renderExecutionInput.v1, received bare simulatte.sceneRenderPacket.v1');
        }
        if (renderExecutionInput.schema !== RENDER_EXECUTION_INPUT_SCHEMA) {
          throw new Error(`Phase 7 expected ${RENDER_EXECUTION_INPUT_SCHEMA}, received ${renderExecutionInput.schema || typeof renderExecutionInput}`);
        }
        if (renderExecutionInput.inputSchema !== PHASE6_OUTPUT_SCHEMA) {
          throw new Error(`Phase 7 expected inputSchema ${PHASE6_OUTPUT_SCHEMA}, received ${renderExecutionInput.inputSchema || 'missing'}`);
        }
        const packet = renderExecutionInput && renderExecutionInput.sceneRenderPacket || null;
        if (!packet || packet.schema !== 'simulatte.sceneRenderPacket.v1') {
          throw new Error(`Phase 7 expected sceneRenderPacket simulatte.sceneRenderPacket.v1, received ${packet && packet.schema || 'missing'}`);
        }
        return packet;
      }

    function phase7PixelReadbackPlan(renderData = null, sceneRenderPacket = {}, renderExecutionInput = null, canvas = null) {
        if (!renderData || renderData.requireLivePixelSamples !== true) return null;
        if (renderData.pixelSamples) return null;
        if (renderData.livePixelSamplesStatus === 'fail') return null;
        if (
          renderData.livePixelSamples &&
          renderData.livePixelSamples.packetKey === renderData.packetKey &&
          renderData.livePixelSamplesStatus === 'pass'
        ) {
          return null;
        }
        const width = Number(canvas && canvas.width || 0);
        const height = Number(canvas && canvas.height || 0);
        if (!width || !height) return null;
        const obligations = phase7RequiredVisualObligations(renderExecutionInput, sceneRenderPacket);
        const drawables = Array.isArray(renderData.drawables) && renderData.drawables.length
          ? renderData.drawables
          : scenePacketUniformDrawables(sceneRenderPacket, renderData.sceneKind || '').slice(0, GPU_SCENE_INSTANCE_CAPACITY);
        if (!obligations.length || !drawables.length) return null;
        const samples = [];
        for (const obligation of obligations) {
          if (obligation.constraintKind === 'environment' || obligation.targetIdentity === 'sunset') {
            samples.push(pixelSampleForEnvironmentObligation(obligation, width, height));
            if (samples.length >= PHASE8_READBACK_SAMPLE_LIMIT) break;
            continue;
          }
          const expectedSamples = Math.max(1, Math.min(
            PHASE8_READBACK_SAMPLE_LIMIT - samples.length,
            Number(obligation.expectedCount || 1)
          ));
          const matched = drawablesForPixelObligation(drawables, obligation).slice(0, expectedSamples);
          if (obligation.constraintKind === 'construction-part') {
            const projectedParts = phase7ProjectedObjectPartPoints(
              renderData,
              obligation,
              Number(renderData.pixelReadbackTimeMs || 0) * 0.001
            ).slice(0, expectedSamples);
            const drawable = matched[0];
            for (const projected of projectedParts) {
              const sample = drawable && pixelSampleForDrawable(
                drawable, obligation, width, height, samples.length, drawables.length
              );
              if (!sample) continue;
              applyProjectedPixelSample(sample, projected, width, height, obligation);
              samples.push(sample);
              if (samples.length >= PHASE8_READBACK_SAMPLE_LIMIT) break;
            }
            if (samples.length >= PHASE8_READBACK_SAMPLE_LIMIT) break;
            continue;
          }
          for (const drawable of matched) {
            const sample = pixelSampleForDrawable(drawable, obligation, width, height, samples.length, drawables.length);
            const projected = phase7ProjectedObjectPartPoint(
              renderData,
              { ...obligation, targetEntityId: drawable.id || obligation.targetEntityId },
              Number(renderData.pixelReadbackTimeMs || 0) * 0.001
            );
            if (sample && projected) applyProjectedPixelSample(sample, projected, width, height, obligation);
            if (sample) samples.push(sample);
            if (samples.length >= PHASE8_READBACK_SAMPLE_LIMIT) break;
          }
          if (samples.length >= PHASE8_READBACK_SAMPLE_LIMIT) break;
        }
        if (!samples.length) return null;
        return {
          schema: 'simulatte.phase7PixelReadbackPlan.v1',
          packetKey: renderData.packetKey,
          canvas: { width, height },
          sampleCount: samples.length,
          samples,
        };
      }

    function applyProjectedPixelSample(sample, projected, width, height, obligation = {}) {
        sample.x = clampInt(Math.round(projected.x * (width - 1)), 0, width - 1);
        sample.y = clampInt(Math.round(projected.y * (height - 1)), 0, height - 1);
        sample.uv = [Number(projected.x.toFixed(5)), Number(projected.y.toFixed(5))];
        sample.constructionRole = projected.part && projected.part.constructionRole || '';
        sample.constructionPartId = projected.part && projected.part.constructionPartId || '';
        sample.expectedSampleCount = Number(obligation.expectedCount || 1);
      }

    function phase7RequiredVisualObligationIds(renderExecutionInput = null, sceneRenderPacket = {}) {
        return phase7RequiredVisualObligations(renderExecutionInput, sceneRenderPacket)
          .map((row) => row.obligationId || row.id || '')
          .filter(Boolean);
      }

    function phase7RequiredVisualObligations(renderExecutionInput = null, sceneRenderPacket = {}) {
        const direct = renderExecutionInput && Array.isArray(renderExecutionInput.visualObligations)
          ? renderExecutionInput.visualObligations
          : [];
        const ledger = renderExecutionInput && renderExecutionInput.compositionLedger ||
          sceneRenderPacket && sceneRenderPacket.compositionLedger ||
          null;
        const ledgerRows = ledger && Array.isArray(ledger.obligations) ? ledger.obligations : [];
        const directIds = new Set(direct.map((row) => row && (row.obligationId || row.id)).filter(Boolean));
        return [
          ...direct,
          ...ledgerRows.filter((row) => !directIds.has(row && (row.obligationId || row.id))),
        ].filter((row) => {
          const id = row && (row.obligationId || row.id) || '';
          return row && row.required === true && (directIds.has(id) || (
          row.kind === 'visual' ||
          row.kind === 'entity' ||
          row.kind === 'object' ||
          row.kind === 'environment' ||
          row.kind === 'medium' ||
          row.ownedByPhase === 6 ||
          /^visual:/.test(id)
          ));
        });
      }

    function drawablesForPixelObligation(drawables = [], obligation = {}) {
        const obligationText = normalizeForProof([
          obligation.obligationId,
          obligation.id,
          obligation.target,
          obligation.description,
        ].filter(Boolean).join(' '));
        const scored = drawables.map((row, index) => ({
          row,
          index,
          score: pixelObligationDrawableScore(row, obligationText),
        })).filter((entry) => entry.score > 0);
        if (!scored.length) {
          return [];
        }
        return scored
          .sort((a, b) => b.score - a.score || a.index - b.index)
          .map((entry) => entry.row);
      }

    function pixelObligationDrawableScore(row = {}, obligationText = '') {
        const rowText = normalizeForProof(JSON.stringify({
          id: row.id,
          label: row.label,
          layerSlot: row.layerSlot,
          packetKind: row.packetKind,
          sourceGraphId: row.sourceGraphId,
          identity: row.identity,
          geometry: row.geometry,
          domain: row.domain,
          animation: row.animation,
          material: row.material,
          renderCodes: row.renderCodes,
        }));
        let score = 0;
        if (/species distinct|species distinct silhouettes/.test(obligationText)) {
          if (/\bdog\b/.test(rowText)) score += 12;
          if (/\bcat\b/.test(rowText)) score += 12;
          if (/biological agent/.test(rowText)) score += 3;
        }
        if (/swimming pose|swim/.test(obligationText)) {
          if (/swim cycle|swimming agent|swim pose/.test(rowText)) score += 12;
          if (/biological agent/.test(rowText)) score += 2;
        }
        if (/wake|ripple/.test(obligationText)) {
          if (/wake|ripple|flow field/.test(rowText)) score += 12;
          if (/water volume/.test(rowText)) score += 2;
        }
        if (/partial submersion|submersion|waterline/.test(obligationText)) {
          if (/submersion|waterline/.test(rowText)) score += 12;
          if (/biological agent|water volume/.test(rowText)) score += 2;
        }
        const terms = obligationText.split(/\s+/).filter((term) => term.length > 3);
        for (const term of terms) {
          if (rowText.includes(term)) score += 1;
        }
        if (row.packetKind === 'entity') score += 0.2;
        return score;
      }

    Object.assign(scope, {
      makeDefaultWebGpuFeatureReceipt,
      create,
      WebGpuRenderer,
      canvasTextureUsage,
      sceneRenderPacketFromExecutionInput,
      phase7PixelReadbackPlan,
      phase7RequiredVisualObligationIds,
      phase7RequiredVisualObligations,
      drawablesForPixelObligation,
      pixelObligationDrawableScore,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
