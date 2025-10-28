// GPU helper utilities for WebGPU/WebGL setup without third-party deps

const DEFAULT_MAX_DPR = 2;

export function resizeCanvasToDisplaySize(canvas, options = {}) {
  const {
    maxDevicePixelRatio = DEFAULT_MAX_DPR,
    desiredWidth,
    desiredHeight
  } = options;

  const dpr = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio);
  const widthPx = desiredWidth ?? canvas.clientWidth ?? canvas.width;
  const heightPx = desiredHeight ?? canvas.clientHeight ?? canvas.height;

  const targetWidth = Math.max(1, Math.floor(widthPx * dpr));
  const targetHeight = Math.max(1, Math.floor(heightPx * dpr));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  return { width: targetWidth, height: targetHeight, dpr };
}

export async function createGPUContext(canvas, options = {}) {
  const { powerPreference = 'high-performance', deviceDescriptor } = options;

  if (!navigator.gpu) {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return { type: 'webgl', gl };
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference });
  if (!adapter) {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return { type: 'webgl', gl };
  }

  const device = await adapter.requestDevice(deviceDescriptor || {});
  const context = canvas.getContext('webgpu');
  if (!context) {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return { type: 'webgl', gl };
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied'
  });

  return {
    type: 'webgpu',
    adapter,
    device,
    context,
    format
  };
}

export function createDefaultSampler(device, options = {}) {
  const {
    label = 'Default Sampler',
    magFilter = 'linear',
    minFilter = 'linear',
    mipmapFilter = 'linear',
    addressModeU = 'clamp-to-edge',
    addressModeV = 'clamp-to-edge'
  } = options;

  return device.createSampler({
    label,
    magFilter,
    minFilter,
    mipmapFilter,
    addressModeU,
    addressModeV
  });
}

export async function createTextureFromCanvas(device, sourceCanvas, options = {}) {
  const {
    label = 'CanvasTexture',
    usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  } = options;

  const imageBitmap = await createImageBitmap(sourceCanvas);
  const texture = device.createTexture({
    label,
    size: [imageBitmap.width, imageBitmap.height, 1],
    format: 'rgba8unorm',
    usage
  });

  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture },
    [imageBitmap.width, imageBitmap.height]
  );

  imageBitmap.close?.();

  return { texture, width: sourceCanvas.width, height: sourceCanvas.height };
}
