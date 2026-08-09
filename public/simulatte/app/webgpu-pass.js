(function attachAutonomyWebGpuPass(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyGpuPass = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyWebGpuPass() {
  const BLEND_STATE = Object.freeze({
    color: Object.freeze({ srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }),
    alpha: Object.freeze({ srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }),
  });

  function vertexBufferLayout(floatsPerVertex) {
    return {
      arrayStride: floatsPerVertex * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x4' },
        { shaderLocation: 3, offset: 40, format: 'float32' },
        { shaderLocation: 4, offset: 44, format: 'float32x2' },
      ],
    };
  }

  function pipelineDescriptor({
    label,
    layout,
    module,
    format,
    floatsPerVertex,
    sampleCount,
    depthWriteEnabled,
    depthCompare,
  }) {
    return {
      label,
      layout,
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [vertexBufferLayout(floatsPerVertex)],
      },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [{ format, blend: BLEND_STATE }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled, depthCompare },
      multisample: { count: sampleCount },
    };
  }

  function createPipelines({ device, layout, module, format, floatsPerVertex, sampleCount }) {
    if (!device?.createRenderPipeline || !layout || !module) {
      throw passError('webgpu_pass_dependencies_invalid', 'Pipeline creation requires a device, shared camera layout, and shader module');
    }
    return Object.freeze({
      opaque: device.createRenderPipeline(pipelineDescriptor({
        label: 'autonomy-map-pipeline',
        layout,
        module,
        format,
        floatsPerVertex,
        sampleCount,
        depthWriteEnabled: true,
        depthCompare: 'less',
      })),
      overlay: device.createRenderPipeline(pipelineDescriptor({
        label: 'autonomy-overlay-pipeline',
        layout,
        module,
        format,
        floatsPerVertex,
        sampleCount,
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
      })),
    });
  }

  function encodeScene(encoder, {
    label,
    resolveTarget,
    targets,
    bindGroup,
    pipelines,
    sampleCount,
    clearValue,
    geometry,
  }) {
    if (!encoder?.beginRenderPass || !pipelines?.opaque || !pipelines?.overlay) {
      throw passError('webgpu_pass_state_invalid', 'Scene encoding requires an encoder and opaque/overlay pipelines');
    }
    const pass = encoder.beginRenderPass({
      label,
      colorAttachments: [{
        view: sampleCount === 1 ? resolveTarget : targets.color.createView(),
        ...(sampleCount === 1 ? {} : { resolveTarget }),
        clearValue,
        loadOp: 'clear',
        storeOp: sampleCount === 1 ? 'store' : 'discard',
      }],
      depthStencilAttachment: {
        view: targets.depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });
    pass.setBindGroup(0, bindGroup);
    drawRows(pass, pipelines.opaque, [geometry.static]);
    drawRows(pass, pipelines.overlay, [geometry.groundOverlay, geometry.pluginOverlay, geometry.shadow]);
    drawRows(pass, pipelines.opaque, [geometry.dynamic, geometry.pluginStatic, geometry.pluginDynamic]);
    pass.end();
  }

  function drawRows(pass, pipeline, rows) {
    const drawable = rows.filter((row) => row?.buffer && row.vertexCount > 0);
    if (!drawable.length) return;
    pass.setPipeline(pipeline);
    drawable.forEach((row) => {
      pass.setVertexBuffer(0, row.buffer);
      pass.draw(row.vertexCount);
    });
  }

  function passError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyWebGpuPassError';
    error.code = code;
    return error;
  }

  return Object.freeze({ BLEND_STATE, createPipelines, encodeScene, passError, pipelineDescriptor, vertexBufferLayout });
});
