(function attachSimulatteParticleField(root, factory) {
  const api = factory();
  root.SimulatteParticleField = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createParticleFieldApi() {
  const PARTICLE_STRIDE = 6;
  const INSTANCE_STRIDE = 8;
  const DEFAULT_COUNT = 320;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function hashNoise(seed, index) {
    const x = Math.sin((seed + 1) * 12.9898 + (index + 1) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function colorForKind(kind, alpha) {
    if (kind === 1) return `hsla(24, 94%, 48%, ${alpha})`;
    if (kind === 2) return `hsla(194, 92%, 44%, ${alpha})`;
    if (kind === 3) return `hsla(244, 84%, 58%, ${alpha})`;
    return `hsla(78, 46%, 36%, ${alpha})`;
  }

  function materialVisualClass(object, fallbackKind) {
    const text = [
      object && object.id,
      object && object.kind,
      object && object.material,
      object && object.role,
      object && object.shape,
    ].filter(Boolean).join(' ').toLowerCase();
    if (/fire|flame|plasma|combust|heat|thermal|smoke|shock/.test(text)) return 1;
    if (/water|river|fluid|flow|glass|light|lens|prism|ray|air|wind|pool/.test(text)) return 2;
    if (/magnet|metal|electro|motor|wheel|ledger|sensor|goal|field/.test(text)) return 3;
    if (/rock|wood|soil|sand|terrain|grain|biomass|fuel/.test(text)) return 0;
    if (fallbackKind === 'shock') return 1;
    if (fallbackKind === 'goal') return 3;
    return 2;
  }

  class MagneticParticleField {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = null;
      this.count = Math.max(160, Math.min(360, Math.floor(options.count || DEFAULT_COUNT)));
      this.particles = new Float32Array(this.count * PARTICLE_STRIDE);
      this.instances = new Float32Array(this.count * INSTANCE_STRIDE);
      this.viewport = new Float32Array(2);
      this.lastGpuViewportKey = '';
      this.attractors = [];
      this.seed = 1;
      this.mode = 'canvas';
      this.status = 'Canvas magnetic field';
      this.requireWebGpu = options.requireWebGpu === true;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.maxDpr = clamp(Number(options.maxDevicePixelRatio || 1.5), 1, 2);
      this.gpu = null;
      this.gpuPending = false;
      this.lastRunKey = '';
      this.boot();
    }

    boot() {
      if (!this.canvas) return;
      this.resetParticles(1);
      if (navigator.gpu) {
        this.gpuPending = true;
        this.initWebGpu();
      } else if (this.requireWebGpu) {
        this.mode = 'webgpu-required';
        this.status = 'WebGPU magnetic field required';
      } else {
        this.ctx = this.canvas.getContext('2d');
      }
    }

    async initWebGpu() {
      if (!navigator.gpu || !this.canvas) {
        this.status = 'Canvas magnetic field';
        return;
      }

      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) {
          this.gpuPending = false;
          this.status = 'Canvas magnetic field: WebGPU adapter unavailable';
          if (this.requireWebGpu) {
            this.mode = 'webgpu-required';
            this.status = 'WebGPU magnetic field required: adapter unavailable';
          } else {
            this.ctx = this.canvas.getContext('2d');
          }
          return;
        }
        const device = await adapter.requestDevice();
        const context = this.canvas.getContext('webgpu');
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
          device,
          format,
          alphaMode: 'premultiplied',
        });

        const shader = device.createShaderModule({
          code: `
            struct Viewport {
              size: vec2f,
            };

            @group(0) @binding(0) var<uniform> viewport: Viewport;

            struct VsOut {
              @builtin(position) position: vec4f,
              @location(0) local: vec2f,
              @location(1) kind: f32,
              @location(2) alpha: f32,
              @location(3) force: f32,
              @location(4) axis: vec2f,
            };

            @vertex
            fn vs(
              @location(0) particlePos: vec2f,
              @location(1) radius: f32,
              @location(2) kind: f32,
              @location(3) alpha: f32,
              @location(4) force: f32,
              @location(5) angle: f32,
              @location(6) stretch: f32,
              @builtin(vertex_index) vertexIndex: u32
            ) -> VsOut {
              var quad = array<vec2f, 6>(
                vec2f(-1.0, -1.0),
                vec2f( 1.0, -1.0),
                vec2f(-1.0,  1.0),
                vec2f(-1.0,  1.0),
                vec2f( 1.0, -1.0),
                vec2f( 1.0,  1.0)
              );
              let local = quad[vertexIndex];
              let axis = vec2f(cos(angle), sin(angle));
              let normal = vec2f(-axis.y, axis.x);
              let screen = particlePos + axis * local.x * radius * stretch + normal * local.y * radius;
              let clip = vec2f(
                screen.x / max(viewport.size.x, 1.0) * 2.0 - 1.0,
                1.0 - screen.y / max(viewport.size.y, 1.0) * 2.0
              );
              var out: VsOut;
              out.position = vec4f(clip, 0.0, 1.0);
              out.local = local;
              out.kind = kind;
              out.alpha = alpha;
              out.force = force;
              out.axis = axis;
              return out;
            }

            fn palette(kind: f32, phase: f32) -> vec3f {
              if (kind > 0.5 && kind < 1.5) {
                return mix(vec3f(1.0, 0.28, 0.08), vec3f(0.68, 0.04, 0.18), phase);
              }
              if (kind > 1.5 && kind < 2.5) {
                return mix(vec3f(0.03, 0.68, 0.86), vec3f(0.52, 0.88, 1.0), phase);
              }
              if (kind > 2.5) {
                return mix(vec3f(0.28, 0.22, 0.92), vec3f(0.92, 0.22, 0.64), phase);
              }
              return mix(vec3f(0.34, 0.42, 0.22), vec3f(0.78, 0.66, 0.38), phase);
            }

            @fragment
            fn fs(in: VsOut) -> @location(0) vec4f {
              let p = in.local;
              let radial = dot(p, p);
              if (radial > 1.22) {
                discard;
              }
              let warp = 0.12 * sin(p.x * 7.0 + in.force * 6.28318 + in.axis.x * 2.4);
              let lane = exp(-abs(p.y + warp) * (5.8 + in.force * 6.4)) * smoothstep(1.04, 0.0, abs(p.x));
              let core = exp(-radial * (1.6 + in.force * 1.8));
              let shell = smoothstep(1.18, 0.48, radial) * smoothstep(0.08, 0.82, radial);
              let wave = 0.5 + 0.5 * sin(p.x * 12.0 + p.y * 5.0 + in.force * 9.0);
              let spectral = vec3f(
                0.54 + 0.46 * sin(wave * 6.28318 + in.kind),
                0.54 + 0.46 * sin(wave * 6.28318 + 2.1 + in.force),
                0.54 + 0.46 * sin(wave * 6.28318 + 4.2)
              );
              let base = palette(in.kind, wave);
              let color = mix(base, spectral, 0.12 + lane * 0.16 + shell * 0.08);
              let alpha = in.alpha * (core * 0.22 + lane * 0.58 + shell * 0.14) * (0.62 + in.force * 0.5);
              return vec4f(color, alpha);
            }
          `,
        });

        const viewportBuffer = device.createBuffer({
          size: 8,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const particleBuffer = device.createBuffer({
          size: this.instances.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        const bindGroupLayout = device.createBindGroupLayout({
          entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
        });
        const pipeline = device.createRenderPipeline({
          layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
          vertex: {
            module: shader,
            entryPoint: 'vs',
            buffers: [
              {
                arrayStride: INSTANCE_STRIDE * 4,
                stepMode: 'instance',
                attributes: [
                  { shaderLocation: 0, offset: 0, format: 'float32x2' },
                  { shaderLocation: 1, offset: 8, format: 'float32' },
                  { shaderLocation: 2, offset: 12, format: 'float32' },
                  { shaderLocation: 3, offset: 16, format: 'float32' },
                  { shaderLocation: 4, offset: 20, format: 'float32' },
                  { shaderLocation: 5, offset: 24, format: 'float32' },
                  { shaderLocation: 6, offset: 28, format: 'float32' },
                ],
              },
            ],
          },
          fragment: {
            module: shader,
            entryPoint: 'fs',
            targets: [
              {
                format,
                blend: {
                  color: {
                    srcFactor: 'src-alpha',
                    dstFactor: 'one',
                    operation: 'add',
                  },
                  alpha: {
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                  },
                },
              },
            ],
          },
          primitive: { topology: 'triangle-list' },
        });
        const bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [{ binding: 0, resource: { buffer: viewportBuffer } }],
        });
        this.gpu = { device, context, pipeline, viewportBuffer, particleBuffer, bindGroup };
        this.mode = 'webgpu';
        this.status = 'WebGPU magnetic field';
        this.gpuPending = false;
      } catch (err) {
        this.mode = this.requireWebGpu ? 'webgpu-required' : 'canvas';
        this.status = this.requireWebGpu
          ? `WebGPU magnetic field required: ${err && err.message ? err.message : 'init failed'}`
          : `Canvas magnetic field: ${err && err.message ? err.message : 'WebGPU init failed'}`;
        this.gpuPending = false;
        if (!this.requireWebGpu) this.ctx = this.canvas.getContext('2d');
      }
    }

    resize(width, height, dpr) {
      if (!this.canvas) return;
      this.width = Math.max(1, width);
      this.height = Math.max(1, height);
      this.dpr = Math.max(1, Math.min(this.maxDpr, dpr || 1));
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      if (this.ctx) this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    resetParticles(seed) {
      this.seed = Number.isFinite(Number(seed)) ? Number(seed) : 1;
      for (let i = 0; i < this.count; i += 1) {
        const index = i * PARTICLE_STRIDE;
        const a = hashNoise(this.seed, i) * Math.PI * 2;
        const r = Math.sqrt(hashNoise(this.seed + 17, i)) * 0.46;
        this.particles[index] = (0.5 + Math.cos(a) * r) * Math.max(1, this.width);
        this.particles[index + 1] = (0.5 + Math.sin(a) * r) * Math.max(1, this.height);
        this.particles[index + 2] = (hashNoise(this.seed + 29, i) - 0.5) * 18;
        this.particles[index + 3] = (hashNoise(this.seed + 43, i) - 0.5) * 18;
        this.particles[index + 4] = i % 4;
        this.particles[index + 5] = 0.24 + hashNoise(this.seed + 59, i) * 0.58;
      }
    }

    sync(run, items) {
      if (!run || !run.scenario) {
        this.attractors = [];
        return;
      }

      const runKey = `${run.scenario.id}:${run.tick}`;
      if (runKey !== this.lastRunKey && run.tick === 0) {
        this.resetParticles(run.scenario.seed || 1);
      }
      this.lastRunKey = runKey;

      const metrics = run.metrics || {};
      const stability = clamp01(Number(metrics.stability || 0) / 100);
      const load = clamp01(Number(metrics.load || 0) / 100);
      const coverageGap = clamp01((100 - Number(metrics.coverage || 0)) / 100);

      this.attractors = (items || []).map((item) => {
        const object = item.object || {};
        const screen = item.screen || {};
        const attractorKind = object.kind;
        const kind = materialVisualClass(object, attractorKind);
        let charge = 0.42 + load * 0.4;
        if (attractorKind === 'shock') {
          charge = object.active ? -1.24 - load * 1.2 : -0.36;
        } else if (attractorKind === 'resource') {
          charge = 0.72 + stability * 0.9;
        } else if (attractorKind === 'goal') {
          charge = 0.54 + (1 - coverageGap) * 0.52;
        }
        return {
          x: Number(screen.x || this.width * 0.5),
          y: Number(screen.y || this.height * 0.5),
          kind,
          charge,
          radius: attractorKind === 'shock' ? 240 : 190,
        };
      });
    }

    step(dt) {
      const safeDt = clamp(Number(dt || 0.016), 0.001, 0.05);
      const centerX = this.width * 0.5;
      const centerY = this.height * 0.52;
      const t = performance.now() * 0.001;

      for (let i = 0; i < this.count; i += 1) {
        const index = i * PARTICLE_STRIDE;
        let x = this.particles[index];
        let y = this.particles[index + 1];
        let vx = this.particles[index + 2];
        let vy = this.particles[index + 3];
        let kind = this.particles[index + 4];
        let forceLevel = 0.08;

        let fx = (centerX - x) * 0.0007;
        let fy = (centerY - y) * 0.0007;
        for (const attractor of this.attractors) {
          const dx = attractor.x - x;
          const dy = attractor.y - y;
          const dist2 = Math.max(80, dx * dx + dy * dy);
          const dist = Math.sqrt(dist2);
          const field = attractor.charge * Math.exp(-dist / Math.max(80, attractor.radius));
          const nx = dx / dist;
          const ny = dy / dist;
          fx += nx * field * 0.12;
          fy += ny * field * 0.12;
          fx += -ny * Math.abs(field) * 0.055;
          fy += nx * Math.abs(field) * 0.055;
          forceLevel = Math.max(forceLevel, clamp01(Math.abs(field) * 0.72));
          if (Math.abs(field) > 0.55) kind = attractor.kind;
        }

        const thermal = Math.sin(t * 1.7 + i * 0.37) * 0.018;
        vx = (vx + (fx + thermal) * safeDt * 210) * 0.965;
        vy = (vy + (fy - thermal) * safeDt * 210) * 0.965;
        x += vx * safeDt * 46;
        y += vy * safeDt * 46;

        const pad = 28;
        if (x < -pad) x = this.width + pad;
        if (x > this.width + pad) x = -pad;
        if (y < -pad) y = this.height + pad;
        if (y > this.height + pad) y = -pad;

        this.particles[index] = x;
        this.particles[index + 1] = y;
        this.particles[index + 2] = vx;
        this.particles[index + 3] = vy;
        this.particles[index + 4] = kind;
        this.particles[index + 5] = forceLevel;
      }
    }

    fillInstanceBuffer() {
      for (let i = 0; i < this.count; i += 1) {
        const source = i * PARTICLE_STRIDE;
        const target = i * INSTANCE_STRIDE;
        const force = clamp01(this.particles[source + 5]);
        this.instances[target] = this.particles[source] * this.dpr;
        this.instances[target + 1] = this.particles[source + 1] * this.dpr;
        this.instances[target + 2] = (1.9 + force * 7.6) * this.dpr;
        this.instances[target + 3] = this.particles[source + 4];
        this.instances[target + 4] = 0.08 + force * 0.42;
        this.instances[target + 5] = force;
        this.instances[target + 6] = Math.atan2(this.particles[source + 3] || 0.01, this.particles[source + 2] || 0.01);
        this.instances[target + 7] = 2.2 + force * 4.8;
      }
    }

    renderWebGpu() {
      const gpu = this.gpu;
      if (!gpu) return false;
      this.fillInstanceBuffer();
      const viewportWidth = this.width * this.dpr;
      const viewportHeight = this.height * this.dpr;
      const viewportKey = `${viewportWidth}x${viewportHeight}`;
      if (viewportKey !== this.lastGpuViewportKey) {
        this.viewport[0] = viewportWidth;
        this.viewport[1] = viewportHeight;
        gpu.device.queue.writeBuffer(gpu.viewportBuffer, 0, this.viewport);
        this.lastGpuViewportKey = viewportKey;
      }
      gpu.device.queue.writeBuffer(gpu.particleBuffer, 0, this.instances);

      const encoder = gpu.device.createCommandEncoder();
      const view = gpu.context.getCurrentTexture().createView();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(gpu.pipeline);
      pass.setBindGroup(0, gpu.bindGroup);
      pass.setVertexBuffer(0, gpu.particleBuffer);
      pass.draw(6, this.count, 0, 0);
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
      return true;
    }

    renderCanvas() {
      if (!this.ctx && this.canvas) {
        this.ctx = this.canvas.getContext('2d');
      }
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.count; i += 1) {
        const index = i * PARTICLE_STRIDE;
        const x = this.particles[index];
        const y = this.particles[index + 1];
        const vx = this.particles[index + 2];
        const vy = this.particles[index + 3];
        const kind = this.particles[index + 4];
        const force = clamp01(this.particles[index + 5]);
        const radius = 1.4 + force * 4.8;
        const length = radius * (4 + force * 4);
        const tilt = Math.atan2(vy || 0.01, vx || 0.01);
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(tilt);
        const gradient = this.ctx.createLinearGradient(-length, 0, length, 0);
        gradient.addColorStop(0, colorForKind(kind, 0));
        gradient.addColorStop(0.5, colorForKind(kind, 0.09 + force * 0.22));
        gradient.addColorStop(1, colorForKind(kind, 0));
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, length, radius, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = colorForKind(kind, 0.08 + force * 0.2);
        this.ctx.lineWidth = 0.8 + force * 1.2;
        this.ctx.beginPath();
        this.ctx.moveTo(-length * 0.82, Math.sin(i) * radius * 0.2);
        this.ctx.bezierCurveTo(-length * 0.24, -radius * 0.72, length * 0.24, radius * 0.72, length * 0.82, Math.sin(i + 2) * radius * 0.2);
        this.ctx.stroke();
        this.ctx.restore();
      }
      this.ctx.restore();
    }

    render() {
      if (this.mode === 'webgpu' && this.renderWebGpu()) return;
      if (this.gpuPending) return;
      if (this.mode === 'webgpu-required') return;
      this.renderCanvas();
    }
  }

  function create(canvas, options) {
    return new MagneticParticleField(canvas, options);
  }

  return { create };
});
