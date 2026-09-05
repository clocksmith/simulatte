(function attachRenderTargets(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRenderTargets = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRenderTargetsApi() {
  function resize(previous, device, descriptor) {
    const { width, height, sampleCount, colorFormat, depthFormat, usage, label } = descriptor;
    const limit = device.limits?.maxTextureDimension2D;
    if (![width, height, sampleCount, usage].every(value => Number.isInteger(value) && value > 0) ||
        !depthFormat || (limit && (width > limit || height > limit))) {
      throw new Error('render_targets_descriptor_invalid');
    }
    const key = JSON.stringify([width, height, sampleCount, colorFormat || '', depthFormat, usage]);
    if (previous?.device === device && previous.key === key && !previous.disposed) return previous;
    const allocated = [];
    function texture(format, suffix) {
      const result = device.createTexture({
        label: `${label}:${suffix}`, size: [width, height, 1], sampleCount, format, usage,
      });
      allocated.push(result);
      return result;
    }
    let next;
    try {
      const color = colorFormat ? texture(colorFormat, 'color') : null;
      const depth = texture(depthFormat, 'depth');
      let disposed = false;
      next = Object.freeze({
        device, key, width, height, color, depth,
        get disposed() { return disposed; },
        destroy() {
          if (disposed) return;
          disposed = true;
          allocated.forEach(resource => resource.destroy());
        },
      });
    } catch (error) {
      allocated.forEach(resource => resource.destroy());
      throw error;
    }
    previous?.destroy();
    return next;
  }
  return Object.freeze({ resize });
});
