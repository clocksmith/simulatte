(function attachSimulatteWebGpuRendererconstants(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');
  const renderInput = typeof module === 'object' && module.exports
    ? require('./simulatte-render-execution-input.js') : root.SimulatteRenderExecutionInput;
  if (!renderInput) throw new Error('Renderer requires the Phase 7 render input contract');

    const SCENE_PACKET_OBJECT_SLOTS = 8;

    const SCENE_PACKET_FLOATS = SCENE_PACKET_OBJECT_SLOTS * 12;

    const GPU_OBJECT_PART_CAPACITY = 256;

    const GPU_OBJECT_PART_FLOATS = 40;

    const GPU_OBJECT_UNIFORM_FLOATS = 20;

    const GPU_OBJECT_PART_BYTES = GPU_OBJECT_PART_FLOATS * 4;

    const PIXEL_READBACK_BYTES_PER_ROW = 256;

    const PHASE7_PIXEL_READBACK_SAMPLE_LIMIT = GPU_OBJECT_PART_CAPACITY + 64;
    const PHASE7_PIXEL_READBACK_MAX_ATTEMPTS = 3;

    const UNIFORM_FLOAT_COUNT = 144 + SCENE_PACKET_FLOATS;

    const PHASE7_OUTPUT_SCHEMA = 'simulatte.phase7.output.v2';

    const RENDER_EXECUTION_INPUT_SCHEMA = renderInput.RENDER_EXECUTION_INPUT_SCHEMA;

    const RENDER_EXECUTION_SCHEMA = 'simulatte.renderExecution.v2';

    const RENDER_DATA_SCHEMA = 'simulatte.phase7.compactRenderData.v1';

    const PHASE6_OUTPUT_SCHEMA = 'simulatte.phase6.output.v2';

    root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-constants.js', {
      PHASE7_PIXEL_READBACK_MAX_ATTEMPTS,
      SCENE_PACKET_OBJECT_SLOTS,
      SCENE_PACKET_FLOATS,
      GPU_OBJECT_PART_CAPACITY,
      GPU_OBJECT_PART_FLOATS,
      GPU_OBJECT_PART_BYTES,
      GPU_OBJECT_UNIFORM_FLOATS,
      PIXEL_READBACK_BYTES_PER_ROW,
      PHASE7_PIXEL_READBACK_SAMPLE_LIMIT,
      UNIFORM_FLOAT_COUNT,
      PHASE7_OUTPUT_SCHEMA,
      RENDER_EXECUTION_INPUT_SCHEMA,
      RENDER_EXECUTION_SCHEMA,
      RENDER_DATA_SCHEMA,
      PHASE6_OUTPUT_SCHEMA,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
