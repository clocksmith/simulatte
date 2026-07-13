(function attachSimulatteWebGpuRendererconstants(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const SCENE_PACKET_OBJECT_SLOTS = 8;

    const SCENE_PACKET_FLOATS = SCENE_PACKET_OBJECT_SLOTS * 12;

    const GPU_SCENE_INSTANCE_CAPACITY = 32;

    const GPU_SCENE_INSTANCE_FLOATS = 12;

    const GPU_SCENE_INSTANCE_BYTES = GPU_SCENE_INSTANCE_FLOATS * 4;

    const GPU_OBJECT_PART_CAPACITY = 256;

    const GPU_OBJECT_PART_FLOATS = 20;

    const GPU_OBJECT_UNIFORM_FLOATS = 20;

    const GPU_OBJECT_PART_BYTES = GPU_OBJECT_PART_FLOATS * 4;

    const PIXEL_READBACK_BYTES_PER_ROW = 256;

    const PHASE7_PIXEL_READBACK_SAMPLE_LIMIT = GPU_OBJECT_PART_CAPACITY +
      GPU_SCENE_INSTANCE_CAPACITY + 32;

    const UNIFORM_FLOAT_COUNT = 144 + SCENE_PACKET_FLOATS;

    const PHASE7_OUTPUT_SCHEMA = 'simulatte.phase7.output.v2';

    const RENDER_EXECUTION_INPUT_SCHEMA = 'simulatte.renderExecutionInput.v1';

    const RENDER_EXECUTION_SCHEMA = 'simulatte.renderExecution.v2';

    const RENDER_DATA_SCHEMA = 'simulatte.phase7.compactRenderData.v1';

    const PHASE6_OUTPUT_SCHEMA = 'simulatte.phase6.output.v2';

    Object.assign(scope, {
      SCENE_PACKET_OBJECT_SLOTS,
      SCENE_PACKET_FLOATS,
      GPU_SCENE_INSTANCE_CAPACITY,
      GPU_SCENE_INSTANCE_FLOATS,
      GPU_SCENE_INSTANCE_BYTES,
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
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
