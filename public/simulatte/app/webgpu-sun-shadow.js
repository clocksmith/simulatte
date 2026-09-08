(function attachSunShadow(root, factory) {
  const math = typeof module === 'object' && module.exports ? require('./webgpu-math.js') : root.SimulatteAutonomyGpuMath;
  const api = factory(math);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunShadow = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunShadowApi(math) {
  const SIZE = 2048;
  const WGSL = `
struct SunShadow { matrix: mat4x4<f32>, settings: vec4<f32> }
@group(0) @binding(1) var<uniform> sunShadow: SunShadow;
@group(0) @binding(2) var sunDepth: texture_depth_2d;
@group(0) @binding(3) var sunComparison: sampler_comparison;
fn sunVisibility(position: vec3<f32>) -> f32 {
  if (sunShadow.settings.x < 0.5) { return 1.0; }
  let clip = sunShadow.matrix * vec4<f32>(position, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0)) || ndc.z < 0.0 || ndc.z > 1.0) { return 1.0; }
  var visibility = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      visibility += textureSampleCompareLevel(sunDepth, sunComparison,
        uv + vec2<f32>(f32(x), f32(y)) * sunShadow.settings.y, ndc.z - sunShadow.settings.z);
    }
  }
  return visibility / 9.0;
}`;

  function projection(sun, center = [0, 0, 0], radius = 1200) {
    const direction = sun?.directionToSun;
    if (!Array.isArray(direction) || direction.length !== 3 || !direction.every(Number.isFinite) || direction[1] <= 0) return null;
    const towardSun = math.normalize(direction);
    const extent = Math.max(120, Math.min(6000, Number.isFinite(radius) ? radius : 1200));
    const target = center.map(value => Number.isFinite(value) ? value : 0);
    const eye = math.add(target, math.scale(towardSun, extent * 3));
    const up = Math.abs(towardSun[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0];
    return { matrix: math.multiply(math.orthographic(-extent, extent, -extent, extent, 1, extent * 6), math.lookAt(eye, target, up)),
      extent, towardSun };
  }

  function create(device, floatsPerVertex) {
    const depth = device.createTexture({ label: 'world-sun-depth', size: [SIZE, SIZE], format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const view = depth.createView();
    const buffer = device.createBuffer({ label: 'world-sun-uniforms', size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const sampler = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
    const layout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }] });
    const module = device.createShaderModule({ label: 'world-sun-depth-shader', code: `
      struct SunShadow { matrix: mat4x4<f32>, settings: vec4<f32> }
      @group(0) @binding(0) var<uniform> sun: SunShadow;
      @vertex fn vertexMain(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
        return sun.matrix * vec4<f32>(position, 1.0);
      }` });
    const pipeline = device.createRenderPipeline({ label: 'world-sun-depth-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module, entryPoint: 'vertexMain', buffers: [{ arrayStride: floatsPerVertex * 4,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2 } });
    const bindGroup = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer } }] });
    let receipt = { schema: 'simulatte.sunShadowRender.v1', enabled: false, casterVertices: 0 };
    return {
      layoutEntries: [
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
      ],
      entries: [{ binding: 1, resource: { buffer } }, { binding: 2, resource: view }, { binding: 3, resource: sampler }],
      encode(encoder, { sun, center, radius, rows }) {
        const light = projection(sun, center, radius);
        const values = new Float32Array(20);
        if (light) values.set(light.matrix);
        values.set([light ? 1 : 0, 1 / SIZE, 0.00012, 0], 16);
        device.queue.writeBuffer(buffer, 0, values);
        const pass = encoder.beginRenderPass({ label: 'world-sun-shadow-pass', colorAttachments: [],
          depthStencilAttachment: { view, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
        let casterVertices = 0;
        if (light) {
          pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup);
          for (const row of rows) if (row?.buffer && row.vertexCount > 0) {
            pass.setVertexBuffer(0, row.buffer); pass.draw(row.vertexCount); casterVertices += row.vertexCount;
          }
        }
        pass.end();
        receipt = { schema: 'simulatte.sunShadowRender.v1', enabled: Boolean(light), resolution: SIZE,
          casterVertices, extentM: light?.extent || 0, directionToSun: light?.towardSun || null,
          method: 'three-dimensional-geometry-depth-map', filter: '3x3-comparison', reservedBytes: SIZE * SIZE * 4 + 80 };
        return receipt;
      },
      receipt: () => structuredClone(receipt),
      destroy() { depth.destroy(); buffer.destroy(); },
    };
  }
  return Object.freeze({ create, projection, WGSL, SIZE });
});
