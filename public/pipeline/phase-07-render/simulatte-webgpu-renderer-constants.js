(function attachSimulatteWebGpuRendererconstants(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const SCENE_PACKET_OBJECT_SLOTS = 8;

    const SCENE_PACKET_FLOATS = SCENE_PACKET_OBJECT_SLOTS * 12;

    const GPU_SCENE_INSTANCE_CAPACITY = 32;

    const GPU_SCENE_INSTANCE_FLOATS = 12;

    const GPU_SCENE_INSTANCE_BYTES = GPU_SCENE_INSTANCE_FLOATS * 4;

    const GPU_SCENE_STATS_BYTES = 4 * 4;

    const GPU_DRAW_INDIRECT_BYTES = 4 * 4;

    const PIXEL_READBACK_BYTES_PER_ROW = 256;

    const PHASE8_READBACK_SAMPLE_LIMIT = 32;

    const UNIFORM_FLOAT_COUNT = 144 + SCENE_PACKET_FLOATS;

    const PHASE7_OUTPUT_SCHEMA = 'simulatte.phase7.output.v2';

    const RENDER_EXECUTION_INPUT_SCHEMA = 'simulatte.renderExecutionInput.v1';

    const RENDER_EXECUTION_SCHEMA = 'simulatte.renderExecution.v2';

    const RENDER_DATA_SCHEMA = 'simulatte.phase7.compactRenderData.v1';

    const PHASE6_OUTPUT_SCHEMA = 'simulatte.phase6.output.v2';

    const WEBGPU_SCENE_PREPARE_SHADER = `
    const GPU_SCENE_INSTANCE_CAPACITY: u32 = ${GPU_SCENE_INSTANCE_CAPACITY}u;

    struct SceneInstance {
      object: vec4f,
      style: vec4f,
      identity: vec4f,
    };

    @group(0) @binding(0) var<storage, read> sceneInstances: array<SceneInstance>;
    @group(0) @binding(1) var<storage, read_write> visibleInstances: array<SceneInstance>;
    @group(0) @binding(2) var<storage, read_write> sceneStats: array<atomic<u32>>;
    @group(0) @binding(3) var<storage, read_write> drawIndirectArgs: array<u32>;

    fn instanceVisible(row: SceneInstance) -> bool {
      if (row.style.x <= 0.5 || row.style.w <= 0.01) { return false; }
      let obj = row.object;
      if (obj.x + obj.z < -0.05 || obj.x - obj.z > 1.05) { return false; }
      if (obj.y + obj.w < -0.05 || obj.y - obj.w > 1.05) { return false; }
      return true;
    }

    @compute @workgroup_size(64)
    fn cs(@builtin(global_invocation_id) globalId: vec3u) {
      if (globalId.x == 0u) {
        atomicStore(&sceneStats[0], 0u);
        atomicStore(&sceneStats[2], GPU_SCENE_INSTANCE_CAPACITY);
        atomicStore(&sceneStats[3], 1u);
        drawIndirectArgs[0] = 3u;
        drawIndirectArgs[1] = 1u;
        drawIndirectArgs[2] = 0u;
        drawIndirectArgs[3] = 0u;
      }
      workgroupBarrier();
      let index = globalId.x;
      let sourceCount = min(atomicLoad(&sceneStats[1]), GPU_SCENE_INSTANCE_CAPACITY);
      if (index >= sourceCount) { return; }
      let row = sceneInstances[index];
      if (!instanceVisible(row)) { return; }
      let dst = atomicAdd(&sceneStats[0], 1u);
      if (dst < GPU_SCENE_INSTANCE_CAPACITY) {
        visibleInstances[dst] = row;
      }
    }
    `;

    Object.assign(scope, {
      SCENE_PACKET_OBJECT_SLOTS,
      SCENE_PACKET_FLOATS,
      GPU_SCENE_INSTANCE_CAPACITY,
      GPU_SCENE_INSTANCE_FLOATS,
      GPU_SCENE_INSTANCE_BYTES,
      GPU_SCENE_STATS_BYTES,
      GPU_DRAW_INDIRECT_BYTES,
      PIXEL_READBACK_BYTES_PER_ROW,
      PHASE8_READBACK_SAMPLE_LIMIT,
      UNIFORM_FLOAT_COUNT,
      PHASE7_OUTPUT_SCHEMA,
      RENDER_EXECUTION_INPUT_SCHEMA,
      RENDER_EXECUTION_SCHEMA,
      RENDER_DATA_SCHEMA,
      PHASE6_OUTPUT_SCHEMA,
      WEBGPU_SCENE_PREPARE_SHADER,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
