(function attachHomepageWebGpu(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteHomepageWebGpu = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createHomepageWebGpu(root) {
  const CELL_COUNT = 7;
  const UNIFORM_FLOATS = 16 + CELL_COUNT * 4;
  const MAX_PIXEL_RATIO = 1.5;

  async function create({ canvas, shaderUrl, signal, onFailure }) {
    if (!root.navigator?.gpu) throw new Error('WebGPU unavailable');
    const adapter = await root.navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    signal.throwIfAborted();
    if (!adapter) throw new Error('No WebGPU adapter');
    if (adapter.info?.isFallbackAdapter === true || adapter.isFallbackAdapter === true) {
      throw new Error('Software GPU: using CSS effects');
    }
    const device = await adapter.requestDevice();
    let context = null, buffer = null, destroyed = false;
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      signal.removeEventListener('abort', destroy);
      context?.unconfigure();
      buffer?.destroy();
      device.destroy();
    }
    signal.addEventListener('abort', destroy, { once: true });
    try {
      signal.throwIfAborted();
      context = canvas.getContext('webgpu');
      if (!context) throw new Error('WebGPU canvas unavailable');
      const response = await root.fetch(shaderUrl, { signal });
      if (!response.ok) throw new Error(`Homepage shader returned HTTP ${response.status}`);
      const source = await response.text();
      signal.throwIfAborted();
      const module = device.createShaderModule({ label: 'Homepage contours', code: source });
      const format = root.navigator.gpu.getPreferredCanvasFormat();
      const pipeline = await device.createRenderPipelineAsync({
        label: 'Homepage contours', layout: 'auto',
        vertex: { module, entryPoint: 'vertexMain' },
        fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
      signal.throwIfAborted();
      context.configure({ device, format, alphaMode: 'premultiplied' });
      buffer = device.createBuffer({ label: 'Homepage frame', size: UNIFORM_FLOATS * 4,
        usage: root.GPUBufferUsage.UNIFORM | root.GPUBufferUsage.COPY_DST });
      const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer } }] });
      const uniforms = new Float32Array(UNIFORM_FLOATS);
      device.lost.then(info => { if (!destroyed) onFailure(new Error(info.message || 'Homepage GPU device lost')); });
      device.addEventListener('uncapturederror', event => { if (!destroyed) onFailure(event.error); });

      function render({ width, height, cells, time, pointer, hoverIndex, hoverAmount, launchIndex, launchProgress, ink }) {
        if (destroyed || signal.aborted || width <= 0 || height <= 0) return;
        const ratio = Math.min(root.devicePixelRatio || 1, MAX_PIXEL_RATIO,
          device.limits.maxTextureDimension2D / Math.max(width, height));
        const pixelWidth = Math.max(1, Math.round(width * ratio));
        const pixelHeight = Math.max(1, Math.round(height * ratio));
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
        uniforms.set([width, height, time, ratio], 0);
        uniforms.set([pointer[0], pointer[1], hoverIndex, launchIndex], 4);
        uniforms.set([hoverAmount, launchProgress, 0, 0], 8);
        uniforms.set([...ink, 1], 12);
        for (let index = 0; index < CELL_COUNT; index += 1) uniforms.set(cells[index], 16 + index * 4);
        device.queue.writeBuffer(buffer, 0, uniforms);
        const encoder = device.createCommandEncoder({ label: 'Homepage frame' });
        const pass = encoder.beginRenderPass({ colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store',
        }] });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      }
      return Object.freeze({ render, destroy });
    } catch (error) {
      destroy();
      throw error;
    }
  }
  return Object.freeze({ create });
});
