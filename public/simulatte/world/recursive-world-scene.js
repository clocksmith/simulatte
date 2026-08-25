(function attachRecursiveWorldScene(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRecursiveWorldScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRecursiveWorldSceneApi() {
  const RENDER_PROGRAM_SCHEMA = 'simulatte.recursive-render-program/v1';
  const FRAME_STATE_SCHEMA = 'simulatte.recursive-render-frame-state/v1';
  const INSTANCE_FLOATS = 20;
  const COLORS = Object.freeze({
    planet: [0.035, 0.12, 0.22, 1],
    'subsea-capacity-corridor': [0.95, 0.42, 0.16, 1],
    datacenter: [0.91, 0.67, 0.25, 1],
    'compute-rack': [0.18, 0.58, 0.72, 1],
    'compute-node': [0.74, 0.52, 0.22, 1],
    gpu: [0.83, 0.35, 0.22, 1],
    default: [0.7, 0.72, 0.75, 1],
  });

  class RecursiveWorldSceneError extends Error {
    constructor(code, message) {
      super(`${code}: ${message}`);
      this.name = 'SimulatteRecursiveWorldSceneError';
      this.code = code;
    }
  }

  function compileScene(worldSpec) {
    requireRecord(worldSpec, 'worldSpec');
    const graph = worldSpec.compositionGraph;
    const program = worldSpec.renderProgram;
    validateRenderProgram(program, graph);
    const frameTransforms = resolveFrameTransforms(graph.frames);
    const instances = [];
    program.representations.forEach((representation) => {
      const frameMatrix = frameTransforms[representation.coordinateFrameId];
      representation.primitives.forEach((primitive) => {
        if (primitive.kind === 'polyline') {
          primitive.points.slice(1).forEach((point, index) => {
            instances.push(instanceRecord({
              id: `${representation.id}:${primitive.id}:segment:${index}`,
              representation,
              primitive,
              meshKind: 'box',
              modelMatrix: multiplyMatrix(frameMatrix, segmentMatrix(primitive.points[index], point, primitive.widthMeters)),
            }));
          });
          return;
        }
        const size = primitive.kind === 'sphere'
          ? [primitive.radius, primitive.radius, primitive.radius]
          : primitive.size;
        instances.push(instanceRecord({
          id: `${representation.id}:${primitive.id}`,
          representation,
          primitive,
          meshKind: primitive.kind,
          modelMatrix: multiplyMatrix(frameMatrix, multiplyMatrix(translationMatrix(primitive.center), scaleMatrix(size))),
        }));
      });
    });
    instances.sort((left, right) => left.meshKind.localeCompare(right.meshKind) || left.id.localeCompare(right.id));
    const baseInstanceData = createInstanceData(instances);
    const groups = [];
    instances.forEach((instance, index) => {
      const prior = groups.at(-1);
      if (prior?.meshKind === instance.meshKind) prior.instanceCount += 1;
      else groups.push({ meshKind: instance.meshKind, firstInstance: index, instanceCount: 1 });
    });
    const sceneContentHash = contentHash({ worldSpecContentHash: worldSpec.contentHash, renderProgram: program });
    return Object.freeze({
      schema: 'simulatte.compiled-recursive-render-scene/v1',
      contentHash: sceneContentHash,
      worldSpecContentHash: worldSpec.contentHash,
      renderProgram: program,
      frameTransforms: freezeRecords(frameTransforms),
      instances: Object.freeze(instances),
      groups: Object.freeze(groups.map(Object.freeze)),
      baseInstanceData,
      instanceStrideFloats: INSTANCE_FLOATS,
      labels: Object.freeze(instances.map((instance) => Object.freeze({
        id: instance.id,
        representationId: instance.representationId,
        semanticRole: instance.semanticRole,
        worldPosition: Object.freeze([instance.modelMatrix[12], instance.modelMatrix[13], instance.modelMatrix[14]]),
      }))),
    });
  }

  function buildFrameState(scene, observation) {
    requireRecord(scene, 'scene');
    requireRecord(observation, 'observation');
    if (observation.schema !== 'simulatte.multirate-port-observation/v1') {
      fail('recursive_scene_observation_schema_invalid', `Unsupported observation schema ${observation.schema}`);
    }
    const instanceData = new Float32Array(scene.baseInstanceData);
    const metrics = {};
    const boundedByRepresentation = new Map();
    scene.renderProgram.stateBindings.forEach((binding) => {
      const record = observation.records[binding.sourcePortId];
      if (!record) fail('recursive_scene_observation_missing', `Missing published output ${binding.sourcePortId}`);
      const value = Number(record.value);
      if (!Number.isFinite(value)) fail('recursive_scene_observation_invalid', `Output ${binding.sourcePortId} must be finite`);
      const minimum = binding.mapping.minimum;
      const maximum = binding.mapping.maximum;
      const normalized = Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum
        ? clamp((value - minimum) / (maximum - minimum), 0, 1)
        : null;
      metrics[binding.id] = Object.freeze({
        sourcePortId: binding.sourcePortId,
        representationId: binding.representationId,
        visualChannel: binding.visualChannel,
        unit: binding.unit,
        value,
        normalized,
        timestamp: record.timestamp,
      });
      if (normalized !== null) {
        const rows = boundedByRepresentation.get(binding.representationId) || [];
        rows.push(normalized);
        boundedByRepresentation.set(binding.representationId, rows);
      }
    });
    scene.instances.forEach((instance, index) => {
      const values = boundedByRepresentation.get(instance.representationId);
      if (!values?.length) return;
      const intensity = 0.4 + (values.reduce((sum, value) => sum + value, 0) / values.length) * 0.6;
      const offset = index * INSTANCE_FLOATS + 16;
      instanceData[offset] *= intensity;
      instanceData[offset + 1] *= intensity;
      instanceData[offset + 2] *= intensity;
    });
    const frameState = {
      schema: FRAME_STATE_SCHEMA,
      worldSpecContentHash: scene.worldSpecContentHash,
      observationContentHash: observation.contentHash,
      logicalTime: observation.logicalTime,
      metrics,
      instanceData,
    };
    return Object.freeze(frameState);
  }

  function validateRenderProgram(program, graph) {
    requireRecord(program, 'renderProgram');
    if (program.schema !== RENDER_PROGRAM_SCHEMA) fail('recursive_scene_schema_invalid', `Expected ${RENDER_PROGRAM_SCHEMA}`);
    requireArray(program.representations, 'renderProgram.representations', 1);
    requireArray(program.cameraTargets, 'renderProgram.cameraTargets', 1);
    requireArray(program.stateBindings, 'renderProgram.stateBindings');
    requireRecord(graph, 'compositionGraph');
    const scopes = new Map(graph.scopes.map((scope) => [scope.id, scope]));
    const frames = new Set(graph.frames.map((frame) => frame.id));
    const outputPorts = new Set(graph.ports.filter((port) => port.direction === 'output').map((port) => port.id));
    const representations = new Map();
    program.representations.forEach((representation) => {
      requireString(representation.id, 'representation.id');
      if (representations.has(representation.id)) fail('recursive_scene_representation_duplicate', `Duplicate representation ${representation.id}`);
      const scope = scopes.get(representation.scopeId);
      if (!scope) fail('recursive_scene_scope_unknown', `Unknown scope ${representation.scopeId}`);
      if (!scope.renderRepresentationIds.includes(representation.id)) {
        fail('recursive_scene_representation_unowned', `Scope ${scope.id} does not own ${representation.id}`);
      }
      if (!frames.has(representation.coordinateFrameId)) fail('recursive_scene_frame_unknown', `Unknown frame ${representation.coordinateFrameId}`);
      if (!scope.availableFidelityLevels.some((level) => level.id === representation.fidelityLevelId)) {
        fail('recursive_scene_fidelity_unknown', `Scope ${scope.id} does not declare ${representation.fidelityLevelId}`);
      }
      requireArray(representation.primitives, `${representation.id}.primitives`, 1);
      representation.primitives.forEach(validatePrimitive);
      representations.set(representation.id, representation);
    });
    program.cameraTargets.forEach((target) => {
      requireString(target.id, 'cameraTarget.id');
      if (!scopes.has(target.scopeId)) fail('recursive_scene_camera_scope_unknown', `Unknown camera scope ${target.scopeId}`);
      if (!frames.has(target.coordinateFrameId)) fail('recursive_scene_camera_frame_unknown', `Unknown camera frame ${target.coordinateFrameId}`);
      requireVector(target.position, 3, `${target.id}.position`);
      requirePositive(target.distanceMeters, `${target.id}.distanceMeters`);
    });
    program.stateBindings.forEach((binding) => {
      requireString(binding.id, 'stateBinding.id');
      if (!outputPorts.has(binding.sourcePortId)) {
        fail('recursive_scene_binding_port_invalid', `Binding ${binding.id} must reference a declared output port`);
      }
      if (!representations.has(binding.representationId)) {
        fail('recursive_scene_binding_representation_unknown', `Binding ${binding.id} references unknown representation`);
      }
      requireRecord(binding.mapping, `${binding.id}.mapping`);
    });
    return program;
  }

  function validatePrimitive(primitive) {
    requireRecord(primitive, 'primitive');
    requireString(primitive.id, 'primitive.id');
    if (!['box', 'sphere', 'polyline'].includes(primitive.kind)) fail('recursive_scene_primitive_invalid', `Unsupported primitive ${primitive.kind}`);
    if (primitive.kind === 'polyline') {
      requireArray(primitive.points, `${primitive.id}.points`, 2);
      primitive.points.forEach((point) => requireVector(point, 3, `${primitive.id}.point`));
      requirePositive(primitive.widthMeters, `${primitive.id}.widthMeters`);
      return;
    }
    requireVector(primitive.center, 3, `${primitive.id}.center`);
    if (primitive.kind === 'box') {
      requireVector(primitive.size, 3, `${primitive.id}.size`);
      primitive.size.forEach((value) => requirePositive(value, `${primitive.id}.size`));
    } else requirePositive(primitive.radius, `${primitive.id}.radius`);
  }

  function resolveFrameTransforms(frames) {
    requireArray(frames, 'frames', 1);
    const byId = new Map(frames.map((frame) => [frame.id, frame]));
    const resolved = {};
    const active = new Set();
    function resolve(id) {
      if (resolved[id]) return resolved[id];
      const frame = byId.get(id);
      if (!frame) fail('recursive_scene_frame_unknown', `Unknown frame ${id}`);
      if (active.has(id)) fail('recursive_scene_frame_cycle', `Frame cycle at ${id}`);
      active.add(id);
      const local = frame.transformToParent
        ? composeTransform(frame.transformToParent)
        : identityMatrix();
      resolved[id] = frame.transformToParent
        ? multiplyMatrix(resolve(frame.transformToParent.parentFrameId), local)
        : local;
      active.delete(id);
      return resolved[id];
    }
    [...byId.keys()].sort().forEach(resolve);
    return resolved;
  }

  function instanceRecord({ id, representation, primitive, meshKind, modelMatrix }) {
    const color = primitive.color || COLORS[primitive.semanticRole] || COLORS.default;
    return Object.freeze({
      id,
      representationId: representation.id,
      scopeId: representation.scopeId,
      semanticRole: primitive.semanticRole,
      meshKind,
      modelMatrix: Object.freeze(modelMatrix),
      color: Object.freeze([...color]),
    });
  }

  function createInstanceData(instances) {
    const data = new Float32Array(instances.length * INSTANCE_FLOATS);
    instances.forEach((instance, index) => {
      data.set(instance.modelMatrix, index * INSTANCE_FLOATS);
      data.set(instance.color, index * INSTANCE_FLOATS + 16);
    });
    return data;
  }

  function composeTransform(transform) {
    return multiplyMatrix(
      translationMatrix(transform.translation),
      multiplyMatrix(quaternionMatrix(transform.rotationQuaternion), scaleMatrix([transform.scale, transform.scale, transform.scale]))
    );
  }

  function segmentMatrix(left, right, width) {
    const delta = subtract(right, left);
    const length = magnitude(delta);
    if (!(length > 0)) fail('recursive_scene_segment_zero', 'Polyline segments must have positive length');
    const x = scale(delta, 1 / length);
    const reference = Math.abs(x[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    const y = normalize(cross(reference, x));
    const z = cross(x, y);
    const center = scale(add(left, right), 0.5);
    return [
      x[0] * length, x[1] * length, x[2] * length, 0,
      y[0] * width, y[1] * width, y[2] * width, 0,
      z[0] * width, z[1] * width, z[2] * width, 0,
      center[0], center[1], center[2], 1,
    ];
  }

  function identityMatrix() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function translationMatrix(value) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, value[0], value[1], value[2], 1];
  }

  function scaleMatrix(value) {
    return [value[0], 0, 0, 0, 0, value[1], 0, 0, 0, 0, value[2], 0, 0, 0, 0, 1];
  }

  function quaternionMatrix(value) {
    const [x, y, z, w] = value;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    return [
      1 - y * y2 - z * z2, y * x2 + w * z2, z * x2 - w * y2, 0,
      x * y2 - w * z2, 1 - x * x2 - z * z2, z * y2 + w * x2, 0,
      x * z2 + w * y2, y * z2 - w * x2, 1 - x * x2 - y * y2, 0,
      0, 0, 0, 1,
    ];
  }

  function multiplyMatrix(left, right) {
    const out = new Array(16).fill(0);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        for (let index = 0; index < 4; index += 1) out[column * 4 + row] += left[index * 4 + row] * right[column * 4 + index];
      }
    }
    return out;
  }

  function transformPoint(matrix, point) {
    return [
      matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
      matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
      matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
    ];
  }

  function add(left, right) { return left.map((value, index) => value + right[index]); }
  function subtract(left, right) { return left.map((value, index) => value - right[index]); }
  function scale(value, amount) { return value.map((row) => row * amount); }
  function magnitude(value) { return Math.hypot(...value); }
  function normalize(value) { return scale(value, 1 / magnitude(value)); }
  function cross(left, right) { return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]; }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function freezeRecords(value) { return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, row]) => [key, Object.freeze([...row])]))); }
  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
      return Object.fromEntries(Object.keys(value).filter((key) => key !== 'contentHash').sort().map((key) => [key, canonicalValue(value[key])]));
    }
    if (ArrayBuffer.isView(value)) return Array.from(value);
    return value;
  }
  function contentHash(value) {
    const input = JSON.stringify(canonicalValue(value));
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }
  function requireRecord(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('recursive_scene_record_invalid', `${label} must be an object`); }
  function requireArray(value, label, minimum = 0) { if (!Array.isArray(value) || value.length < minimum) fail('recursive_scene_array_invalid', `${label} must contain at least ${minimum} row(s)`); }
  function requireString(value, label) { if (typeof value !== 'string' || !value) fail('recursive_scene_string_invalid', `${label} must be a non-empty string`); }
  function requirePositive(value, label) { if (!Number.isFinite(value) || value <= 0) fail('recursive_scene_number_invalid', `${label} must be positive`); }
  function requireVector(value, length, label) { if (!Array.isArray(value) || value.length !== length || value.some((row) => !Number.isFinite(row))) fail('recursive_scene_vector_invalid', `${label} must contain ${length} finite values`); }
  function fail(code, message) { throw new RecursiveWorldSceneError(code, message); }

  return Object.freeze({
    FRAME_STATE_SCHEMA,
    INSTANCE_FLOATS,
    RENDER_PROGRAM_SCHEMA,
    RecursiveWorldSceneError,
    buildFrameState,
    compileScene,
    contentHash,
    multiplyMatrix,
    resolveFrameTransforms,
    transformPoint,
    validateRenderProgram,
  });
});
