(function attachSimulatteMultiscaleContracts(root, factory) {
  const primitives = typeof module === 'object' && module.exports
    ? require('./contract-validation-primitives.js')
    : root.SimulatteAutonomyContractPrimitives;
  if (!primitives) throw new Error('Simulatte multiscale contracts require validation primitives');
  const api = factory(primitives);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMultiscaleContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMultiscaleContracts(primitives) {
  const SCHEMAS = Object.freeze({
    scope: 'simulatte.recursiveWorldScope.v1',
    frame: 'simulatte.coordinateFrame.v1',
    port: 'simulatte.simulationPort.v1',
    coupling: 'simulatte.couplingPlan.v1',
    checkpoint: 'simulatte.scopeCheckpoint.v1',
    fidelity: 'simulatte.fidelityTransition.v1',
  });
  const SHA256 = /^sha256:[0-9a-f]{64}$/;
  const WORLD_HASH = /^fnv1a32:[0-9a-f]{8}$/;
  const WGS84 = Object.freeze({ semiMajorAxisMeters: 6378137, inverseFlattening: 298.257223563 });

  class MultiscaleContractError extends Error {
    constructor(path, expected, received) {
      super(`multiscale contract at ${path} expected ${expected}, received ${describe(received)}`);
      this.name = 'MultiscaleContractError';
      this.code = 'SIMULATTE_MULTISCALE_CONTRACT_INVALID';
      this.path = path;
      this.expected = expected;
      this.received = received;
    }
  }

  function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === 'string') return JSON.stringify(value);
    return typeof value;
  }

  function fail(path, expected, received) {
    throw new MultiscaleContractError(path, expected, received);
  }

  function object(value, path, required = [], optional = []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'object', value);
    const allowed = new Set([...required, ...optional]);
    required.forEach((key) => {
      if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'declared field', undefined);
    });
    Object.keys(value).forEach((key) => {
      if (!allowed.has(key)) fail(`${path}.${key}`, 'no undeclared field', value[key]);
    });
    return value;
  }

  function array(value, path, minimum = 0) {
    if (!Array.isArray(value) || value.length < minimum) fail(path, `array with at least ${minimum} row(s)`, value);
    return value;
  }

  function string(value, path) {
    if (typeof value !== 'string' || !value.length) fail(path, 'non-empty string', value);
    return value;
  }

  function nullableString(value, path) {
    if (value !== null) string(value, path);
    return value;
  }

  function finite(value, path, minimum = -Infinity, exclusive = false) {
    if (!Number.isFinite(value) || (exclusive ? value <= minimum : value < minimum)) {
      fail(path, `finite number ${exclusive ? '>' : '>='} ${minimum}`, value);
    }
    return value;
  }

  function integer(value, path, minimum = 0) {
    if (!Number.isInteger(value) || value < minimum) fail(path, `integer >= ${minimum}`, value);
    return value;
  }

  function oneOf(value, allowed, path) {
    if (!allowed.includes(value)) fail(path, allowed.join(' | '), value);
    return value;
  }

  function boolean(value, path) {
    if (typeof value !== 'boolean') fail(path, 'boolean', value);
    return value;
  }

  function exactSchema(value, schema) {
    if (value.schema !== schema) fail('$.schema', schema, value.schema);
  }

  function strings(value, path, minimum = 0) {
    const rows = array(value, path, minimum).map((row, index) => string(row, `${path}[${index}]`));
    if (new Set(rows).size !== rows.length) fail(path, 'unique string identities', rows);
    return rows;
  }

  function vector(value, path, length = null) {
    const rows = array(value, path, 1);
    if (length !== null && rows.length !== length) fail(path, `vector length ${length}`, rows);
    rows.forEach((row, index) => finite(row, `${path}[${index}]`));
    return rows;
  }

  function hash(value, path, pattern = SHA256) {
    if (typeof value !== 'string' || !pattern.test(value)) fail(path, pattern.source, value);
    return value;
  }

  function uniqueObjects(rows, path, key = 'id') {
    const ids = rows.map((row, index) => string(row && row[key], `${path}[${index}].${key}`));
    if (new Set(ids).size !== ids.length) fail(path, `unique ${key} values`, ids);
    return new Set(ids);
  }

  function validateResidencyPolicy(value, path, allowedStates) {
    object(value, path, ['allowedStates', 'defaultState']);
    const states = strings(value.allowedStates, `${path}.allowedStates`, 1);
    states.forEach((state, index) => oneOf(state, allowedStates, `${path}.allowedStates[${index}]`));
    string(value.defaultState, `${path}.defaultState`);
    if (!states.includes(value.defaultState)) fail(`${path}.defaultState`, 'member of allowedStates', value.defaultState);
  }

  function validateCoordinateFrame(frame) {
    object(frame, '$', ['schema', 'id', 'axes', 'handedness', 'origin', 'epoch', 'precision', 'bounds', 'transformToParent']);
    exactSchema(frame, SCHEMAS.frame);
    string(frame.id, '$.id');
    const axes = array(frame.axes, '$.axes', 1);
    uniqueObjects(axes, '$.axes');
    axes.forEach((axis, index) => {
      object(axis, `$.axes[${index}]`, ['id', 'unit', 'direction']);
      string(axis.unit, `$.axes[${index}].unit`);
      oneOf(axis.direction, ['positive', 'negative'], `$.axes[${index}].direction`);
    });
    oneOf(frame.handedness, ['right', 'left', 'not-applicable'], '$.handedness');
    object(frame.origin, '$.origin', ['kind', 'values', 'referenceFrameId']);
    oneOf(frame.origin.kind, ['absolute', 'reference'], '$.origin.kind');
    vector(frame.origin.values, '$.origin.values', axes.length);
    nullableString(frame.origin.referenceFrameId, '$.origin.referenceFrameId');
    if (frame.origin.kind === 'absolute' && frame.origin.referenceFrameId !== null) fail('$.origin.referenceFrameId', 'null for absolute origin', frame.origin.referenceFrameId);
    if (frame.origin.kind === 'reference' && frame.origin.referenceFrameId === null) fail('$.origin.referenceFrameId', 'frame identity for reference origin', null);
    if (frame.epoch !== null) string(frame.epoch, '$.epoch');
    finite(frame.precision, '$.precision', 0, true);
    object(frame.bounds, '$.bounds', ['minimum', 'maximum']);
    const minimum = vector(frame.bounds.minimum, '$.bounds.minimum', axes.length);
    const maximum = vector(frame.bounds.maximum, '$.bounds.maximum', axes.length);
    minimum.forEach((row, index) => {
      if (row >= maximum[index]) fail(`$.bounds.maximum[${index}]`, `greater than ${row}`, maximum[index]);
    });
    if (frame.transformToParent !== null) {
      object(frame.transformToParent, '$.transformToParent', ['parentFrameId', 'translation', 'rotationQuaternion', 'scale']);
      string(frame.transformToParent.parentFrameId, '$.transformToParent.parentFrameId');
      if (frame.transformToParent.parentFrameId === frame.id) fail('$.transformToParent.parentFrameId', 'different frame identity', frame.id);
      vector(frame.transformToParent.translation, '$.transformToParent.translation', axes.length);
      vector(frame.transformToParent.rotationQuaternion, '$.transformToParent.rotationQuaternion', 4);
      finite(frame.transformToParent.scale, '$.transformToParent.scale', 0, true);
    }
    return frame;
  }

  function validateCoordinateFrameAdapter(adapter, context = {}) {
    object(adapter, '$', ['id', 'sourceFrameId', 'destinationFrameId', 'method', 'direction', 'parameters', 'authority']);
    ['id', 'sourceFrameId', 'destinationFrameId', 'authority'].forEach((key) => string(adapter[key], `$.${key}`));
    if (adapter.sourceFrameId === adapter.destinationFrameId) fail('$.destinationFrameId', 'different frame identity', adapter.destinationFrameId);
    oneOf(adapter.method, ['wgs84-ecef'], '$.method');
    oneOf(adapter.direction, ['forward', 'bidirectional'], '$.direction');
    object(adapter.parameters, '$.parameters', ['semiMajorAxisMeters', 'inverseFlattening']);
    finite(adapter.parameters.semiMajorAxisMeters, '$.parameters.semiMajorAxisMeters', 0, true);
    finite(adapter.parameters.inverseFlattening, '$.parameters.inverseFlattening', 0, true);
    if (context.frameIds) {
      if (!context.frameIds.has(adapter.sourceFrameId)) fail('$.sourceFrameId', 'known coordinate frame', adapter.sourceFrameId);
      if (!context.frameIds.has(adapter.destinationFrameId)) fail('$.destinationFrameId', 'known coordinate frame', adapter.destinationFrameId);
    }
    return adapter;
  }

  function wgs84ToEcef(point, parameters = WGS84) {
    vector(point, '$.wgs84', 3);
    const [latitudeDegrees, longitudeDegrees, heightMeters] = point;
    if (latitudeDegrees < -90 || latitudeDegrees > 90) fail('$.wgs84[0]', 'latitude between -90 and 90 degrees', latitudeDegrees);
    if (longitudeDegrees < -180 || longitudeDegrees > 180) fail('$.wgs84[1]', 'longitude between -180 and 180 degrees', longitudeDegrees);
    const semiMajorAxis = parameters.semiMajorAxisMeters;
    const flattening = 1 / parameters.inverseFlattening;
    const eccentricitySquared = flattening * (2 - flattening);
    const latitude = latitudeDegrees * Math.PI / 180;
    const longitude = longitudeDegrees * Math.PI / 180;
    const sinLatitude = Math.sin(latitude);
    const cosLatitude = Math.cos(latitude);
    const radius = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);
    return Object.freeze([
      (radius + heightMeters) * cosLatitude * Math.cos(longitude),
      (radius + heightMeters) * cosLatitude * Math.sin(longitude),
      (radius * (1 - eccentricitySquared) + heightMeters) * sinLatitude,
    ]);
  }

  function ecefToWgs84(point, parameters = WGS84) {
    vector(point, '$.ecef', 3);
    const [x, y, z] = point;
    const semiMajorAxis = parameters.semiMajorAxisMeters;
    const flattening = 1 / parameters.inverseFlattening;
    const semiMinorAxis = semiMajorAxis * (1 - flattening);
    const eccentricitySquared = flattening * (2 - flattening);
    const secondaryEccentricitySquared = (semiMajorAxis ** 2 - semiMinorAxis ** 2) / semiMinorAxis ** 2;
    const horizontal = Math.hypot(x, y);
    if (horizontal < 0.000001) {
      if (Math.abs(z) < 0.000001) fail('$.ecef', 'point away from the undefined Earth center', point);
      return Object.freeze([Math.sign(z) * 90, 0, Math.abs(z) - semiMinorAxis]);
    }
    const theta = Math.atan2(z * semiMajorAxis, horizontal * semiMinorAxis);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const latitude = Math.atan2(
      z + secondaryEccentricitySquared * semiMinorAxis * sinTheta ** 3,
      horizontal - eccentricitySquared * semiMajorAxis * cosTheta ** 3
    );
    const longitude = Math.atan2(y, x);
    const sinLatitude = Math.sin(latitude);
    const radius = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);
    const height = horizontal / Math.max(Math.cos(latitude), Number.EPSILON) - radius;
    return Object.freeze([latitude * 180 / Math.PI, longitude * 180 / Math.PI, height]);
  }

  function transformCoordinate(adapter, point, direction = 'forward') {
    validateCoordinateFrameAdapter(adapter);
    if (direction === 'forward') return wgs84ToEcef(point, adapter.parameters);
    if (direction === 'reverse' && adapter.direction === 'bidirectional') return ecefToWgs84(point, adapter.parameters);
    fail('$.direction', 'forward or authorized reverse transform', direction);
  }

  function validateRecursiveWorldScope(scope, context = {}) {
    object(scope, '$', ['schema', 'id', 'parentScopeId', 'coordinateFrameId', 'spatialBounds', 'temporalDomain', 'childScopeIds', 'moduleInstanceIds', 'stateOwnerModuleIds', 'availableFidelityLevels', 'simulationResidencyPolicy', 'spatialResidencyPolicy', 'renderRepresentationIds', 'controlIds', 'proofObligationIds']);
    exactSchema(scope, SCHEMAS.scope);
    string(scope.id, '$.id');
    nullableString(scope.parentScopeId, '$.parentScopeId');
    if (scope.parentScopeId === scope.id) fail('$.parentScopeId', 'different scope identity', scope.id);
    string(scope.coordinateFrameId, '$.coordinateFrameId');
    if (context.frameIds && !context.frameIds.has(scope.coordinateFrameId)) fail('$.coordinateFrameId', 'known coordinate frame', scope.coordinateFrameId);
    object(scope.spatialBounds, '$.spatialBounds', ['kind', 'minimum', 'maximum']);
    oneOf(scope.spatialBounds.kind, ['axis-aligned-box', 'geographic-box'], '$.spatialBounds.kind');
    const boundsMinimum = vector(scope.spatialBounds.minimum, '$.spatialBounds.minimum');
    const boundsMaximum = vector(scope.spatialBounds.maximum, '$.spatialBounds.maximum', boundsMinimum.length);
    boundsMinimum.forEach((row, index) => {
      if (row >= boundsMaximum[index]) fail(`$.spatialBounds.maximum[${index}]`, `greater than ${row}`, boundsMaximum[index]);
    });
    object(scope.temporalDomain, '$.temporalDomain', ['startTime', 'endTime', 'timeUnit']);
    finite(scope.temporalDomain.startTime, '$.temporalDomain.startTime');
    finite(scope.temporalDomain.endTime, '$.temporalDomain.endTime');
    if (scope.temporalDomain.endTime <= scope.temporalDomain.startTime) fail('$.temporalDomain.endTime', 'after startTime', scope.temporalDomain.endTime);
    string(scope.temporalDomain.timeUnit, '$.temporalDomain.timeUnit');
    strings(scope.childScopeIds, '$.childScopeIds');
    const moduleIds = strings(scope.moduleInstanceIds, '$.moduleInstanceIds');
    strings(scope.stateOwnerModuleIds, '$.stateOwnerModuleIds').forEach((id, index) => {
      if (!moduleIds.includes(id)) fail(`$.stateOwnerModuleIds[${index}]`, 'module owned by this scope', id);
    });
    const levels = array(scope.availableFidelityLevels, '$.availableFidelityLevels', 1);
    uniqueObjects(levels, '$.availableFidelityLevels');
    const ranks = new Set();
    levels.forEach((level, index) => {
      object(level, `$.availableFidelityLevels[${index}]`, ['id', 'modelId', 'rank']);
      string(level.modelId, `$.availableFidelityLevels[${index}].modelId`);
      integer(level.rank, `$.availableFidelityLevels[${index}].rank`);
      if (ranks.has(level.rank)) fail(`$.availableFidelityLevels[${index}].rank`, 'unique fidelity rank', level.rank);
      ranks.add(level.rank);
    });
    validateResidencyPolicy(scope.simulationResidencyPolicy, '$.simulationResidencyPolicy', ['dormant', 'checkpointed', 'aggregate', 'active', 'refining']);
    validateResidencyPolicy(scope.spatialResidencyPolicy, '$.spatialResidencyPolicy', ['absent', 'requested', 'staged', 'resident', 'pinned', 'evicting']);
    strings(scope.renderRepresentationIds, '$.renderRepresentationIds');
    strings(scope.controlIds, '$.controlIds');
    strings(scope.proofObligationIds, '$.proofObligationIds');
    return scope;
  }

  function validateSimulationPort(port, context = {}) {
    object(port, '$', ['schema', 'id', 'moduleInstanceId', 'direction', 'kind', 'quantity', 'dataSchemaId', 'shape', 'unit', 'dimension', 'coordinateFrameId', 'cadence', 'timestampSemantics', 'latencySeconds', 'interpolationPolicy', 'aggregationPolicy', 'uncertainty', 'provenanceRequired', 'determinismClass', 'authority', 'validRange', 'missingDataBehavior', 'backpressurePolicy']);
    exactSchema(port, SCHEMAS.port);
    ['id', 'moduleInstanceId', 'quantity', 'dataSchemaId', 'unit', 'dimension', 'authority'].forEach((key) => string(port[key], `$.${key}`));
    oneOf(port.direction, ['input', 'output'], '$.direction');
    oneOf(port.kind, ['event', 'sampled-state'], '$.kind');
    array(port.shape, '$.shape').forEach((row, index) => integer(row, `$.shape[${index}]`, 1));
    nullableString(port.coordinateFrameId, '$.coordinateFrameId');
    if (port.coordinateFrameId !== null && context.frameIds && !context.frameIds.has(port.coordinateFrameId)) fail('$.coordinateFrameId', 'known coordinate frame', port.coordinateFrameId);
    object(port.cadence, '$.cadence', ['kind', 'intervalSeconds']);
    oneOf(port.cadence.kind, ['fixed', 'event'], '$.cadence.kind');
    if (port.cadence.kind === 'fixed') finite(port.cadence.intervalSeconds, '$.cadence.intervalSeconds', 0, true);
    if (port.cadence.kind === 'event' && port.cadence.intervalSeconds !== null) fail('$.cadence.intervalSeconds', 'null for event cadence', port.cadence.intervalSeconds);
    if (port.kind === 'event' && port.cadence.kind !== 'event') fail('$.cadence.kind', 'event for event port', port.cadence.kind);
    if (port.kind === 'sampled-state' && port.cadence.kind !== 'fixed') fail('$.cadence.kind', 'fixed for sampled-state port', port.cadence.kind);
    oneOf(port.timestampSemantics, ['sample-time', 'interval-start', 'interval-end', 'event-time'], '$.timestampSemantics');
    finite(port.latencySeconds, '$.latencySeconds', 0);
    oneOf(port.interpolationPolicy, ['none', 'hold', 'linear'], '$.interpolationPolicy');
    if (port.kind === 'event' && port.interpolationPolicy !== 'none') fail('$.interpolationPolicy', 'none for event port', port.interpolationPolicy);
    oneOf(port.aggregationPolicy, ['none', 'sum', 'mean', 'minimum', 'maximum', 'last'], '$.aggregationPolicy');
    object(port.uncertainty, '$.uncertainty', ['kind', 'unit', 'confidenceLevel']);
    oneOf(port.uncertainty.kind, ['none', 'absolute-bound', 'distribution'], '$.uncertainty.kind');
    if (port.uncertainty.unit !== null) string(port.uncertainty.unit, '$.uncertainty.unit');
    if (port.uncertainty.confidenceLevel !== null) finite(port.uncertainty.confidenceLevel, '$.uncertainty.confidenceLevel', 0);
    if (Number(port.uncertainty.confidenceLevel) > 1) fail('$.uncertainty.confidenceLevel', 'number <= 1', port.uncertainty.confidenceLevel);
    boolean(port.provenanceRequired, '$.provenanceRequired');
    oneOf(port.determinismClass, ['exact', 'bounded-numeric', 'seeded-stochastic', 'external-observation'], '$.determinismClass');
    object(port.validRange, '$.validRange', ['minimum', 'maximum']);
    if (port.validRange.minimum !== null) finite(port.validRange.minimum, '$.validRange.minimum');
    if (port.validRange.maximum !== null) finite(port.validRange.maximum, '$.validRange.maximum');
    if (port.validRange.minimum !== null && port.validRange.maximum !== null && port.validRange.minimum > port.validRange.maximum) fail('$.validRange', 'ordered minimum and maximum', port.validRange);
    oneOf(port.missingDataBehavior, ['reject', 'hold-last', 'use-declared-default', 'emit-unknown'], '$.missingDataBehavior');
    oneOf(port.backpressurePolicy, ['block', 'drop-oldest', 'drop-newest', 'coalesce', 'reject'], '$.backpressurePolicy');
    return port;
  }

  function validateCouplingPlan(plan, context = {}) {
    object(plan, '$', ['schema', 'id', 'edges', 'coupledSolvers']);
    exactSchema(plan, SCHEMAS.coupling);
    string(plan.id, '$.id');
    const ports = context.ports || [];
    const portsById = new Map(ports.map((port) => [port.id, port]));
    const edges = array(plan.edges, '$.edges');
    const edgeIds = uniqueObjects(edges, '$.edges');
    edges.forEach((edge, index) => {
      const path = `$.edges[${index}]`;
      object(edge, path, ['id', 'sourcePortId', 'destinationPortId', 'adapterId', 'communicationCadence', 'delaySeconds', 'initializationRule', 'samplingPolicy', 'errorPolicy', 'convergencePolicyId', 'proofObligationIds']);
      ['sourcePortId', 'destinationPortId', 'initializationRule'].forEach((key) => string(edge[key], `${path}.${key}`));
      nullableString(edge.adapterId, `${path}.adapterId`);
      nullableString(edge.convergencePolicyId, `${path}.convergencePolicyId`);
      object(edge.communicationCadence, `${path}.communicationCadence`, ['kind', 'intervalSeconds']);
      oneOf(edge.communicationCadence.kind, ['fixed', 'every-source-event'], `${path}.communicationCadence.kind`);
      if (edge.communicationCadence.kind === 'fixed') finite(edge.communicationCadence.intervalSeconds, `${path}.communicationCadence.intervalSeconds`, 0, true);
      if (edge.communicationCadence.kind === 'every-source-event' && edge.communicationCadence.intervalSeconds !== null) fail(`${path}.communicationCadence.intervalSeconds`, 'null for event cadence', edge.communicationCadence.intervalSeconds);
      finite(edge.delaySeconds, `${path}.delaySeconds`, 0);
      oneOf(edge.samplingPolicy, ['exact', 'hold', 'linear', 'aggregate'], `${path}.samplingPolicy`);
      oneOf(edge.errorPolicy, ['stop', 'degrade', 'retry', 'emit-unknown'], `${path}.errorPolicy`);
      strings(edge.proofObligationIds, `${path}.proofObligationIds`);
      if (ports.length) validateCoupledPorts(edge, portsById, path);
    });
    const solvers = array(plan.coupledSolvers, '$.coupledSolvers');
    const solverIds = uniqueObjects(solvers, '$.coupledSolvers');
    const solversById = new Map();
    solvers.forEach((solver, index) => {
      const path = `$.coupledSolvers[${index}]`;
      object(solver, path, ['id', 'edgeIds', 'algorithm', 'tolerance', 'maximumIterations']);
      strings(solver.edgeIds, `${path}.edgeIds`, 1).forEach((id, edgeIndex) => {
        if (!edgeIds.has(id)) fail(`${path}.edgeIds[${edgeIndex}]`, 'known coupling edge', id);
      });
      string(solver.algorithm, `${path}.algorithm`);
      finite(solver.tolerance, `${path}.tolerance`, 0);
      integer(solver.maximumIterations, `${path}.maximumIterations`, 1);
      solversById.set(solver.id, solver);
    });
    edges.forEach((edge, index) => {
      if (edge.convergencePolicyId !== null && !solverIds.has(edge.convergencePolicyId)) fail(`$.edges[${index}].convergencePolicyId`, 'known coupled solver', edge.convergencePolicyId);
    });
    if (ports.length) validateZeroDelayCycles(edges, portsById, solversById);
    return plan;
  }

  function validateCoupledPorts(edge, portsById, path) {
    const source = portsById.get(edge.sourcePortId);
    const destination = portsById.get(edge.destinationPortId);
    if (!source) fail(`${path}.sourcePortId`, 'known output port', edge.sourcePortId);
    if (!destination) fail(`${path}.destinationPortId`, 'known input port', edge.destinationPortId);
    if (source.direction !== 'output') fail(`${path}.sourcePortId`, 'output port', source.direction);
    if (destination.direction !== 'input') fail(`${path}.destinationPortId`, 'input port', destination.direction);
    const mismatches = ['unit', 'dimension', 'timestampSemantics', 'authority', 'coordinateFrameId']
      .filter((key) => source[key] !== destination[key]);
    if (primitives.canonicalJson(source.shape) !== primitives.canonicalJson(destination.shape)) mismatches.push('shape');
    if (source.kind !== destination.kind) mismatches.push('kind');
    if (mismatches.length && edge.adapterId === null) fail(`${path}.adapterId`, `named adapter for ${mismatches.join(', ')}`, null);
  }

  function validateZeroDelayCycles(edges, portsById, solversById) {
    const zeroEdges = edges.flatMap((edge) => {
      if (edge.delaySeconds !== 0) return [];
      const source = portsById.get(edge.sourcePortId);
      const destination = portsById.get(edge.destinationPortId);
      return source && destination ? [{ ...edge, from: source.moduleInstanceId, to: destination.moduleInstanceId }] : [];
    });
    const components = stronglyConnectedComponents(zeroEdges);
    components.forEach((component) => {
      const members = new Set(component);
      const cycleEdges = zeroEdges.filter((edge) => members.has(edge.from) && members.has(edge.to));
      const cyclic = component.length > 1 || cycleEdges.some((edge) => edge.from === edge.to);
      if (!cyclic) return;
      const solver = [...solversById.values()].find((row) => cycleEdges.every((edge) => row.edgeIds.includes(edge.id)));
      if (!solver) fail('$.coupledSolvers', `declared solver covering zero-delay cycle ${cycleEdges.map((edge) => edge.id).join(',')}`, []);
      cycleEdges.forEach((edge) => {
        if (edge.convergencePolicyId !== solver.id) fail(`$.edges.${edge.id}.convergencePolicyId`, solver.id, edge.convergencePolicyId);
      });
    });
  }

  function stronglyConnectedComponents(edges) {
    const nodes = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort();
    const outgoing = new Map(nodes.map((node) => [node, []]));
    edges.forEach((edge) => outgoing.get(edge.from).push(edge.to));
    outgoing.forEach((rows) => rows.sort());
    let index = 0;
    const stack = [];
    const onStack = new Set();
    const indices = new Map();
    const low = new Map();
    const result = [];
    function visit(node) {
      indices.set(node, index);
      low.set(node, index);
      index += 1;
      stack.push(node);
      onStack.add(node);
      outgoing.get(node).forEach((next) => {
        if (!indices.has(next)) {
          visit(next);
          low.set(node, Math.min(low.get(node), low.get(next)));
        } else if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node), indices.get(next)));
        }
      });
      if (low.get(node) !== indices.get(node)) return;
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      result.push(component.sort());
    }
    nodes.forEach((node) => { if (!indices.has(node)) visit(node); });
    return result;
  }

  function validateScopeCheckpoint(checkpoint) {
    object(checkpoint, '$', ['schema', 'id', 'contentHash', 'worldSpecContentHash', 'scopeId', 'logicalTime', 'compatibilityVersion', 'sourceCheckpointId', 'moduleImplementations', 'moduleStates', 'reconstructionReferences', 'pendingEvents', 'portBuffers', 'couplingState', 'fidelityLevels', 'omittedScopes']);
    exactSchema(checkpoint, SCHEMAS.checkpoint);
    ['id', 'scopeId', 'compatibilityVersion'].forEach((key) => string(checkpoint[key], `$.${key}`));
    hash(checkpoint.contentHash, '$.contentHash');
    hash(checkpoint.worldSpecContentHash, '$.worldSpecContentHash', WORLD_HASH);
    finite(checkpoint.logicalTime, '$.logicalTime', 0);
    nullableString(checkpoint.sourceCheckpointId, '$.sourceCheckpointId');
    const implementations = array(checkpoint.moduleImplementations, '$.moduleImplementations');
    const implementationIds = uniqueObjects(implementations, '$.moduleImplementations', 'moduleInstanceId');
    implementations.forEach((row, index) => {
      const path = `$.moduleImplementations[${index}]`;
      object(row, path, ['moduleInstanceId', 'implementationId', 'implementationHash', 'determinismClass']);
      string(row.implementationId, `${path}.implementationId`);
      hash(row.implementationHash, `${path}.implementationHash`);
      oneOf(row.determinismClass, ['exact', 'bounded-numeric', 'seeded-stochastic', 'external-observation'], `${path}.determinismClass`);
    });
    const states = array(checkpoint.moduleStates, '$.moduleStates');
    uniqueObjects(states, '$.moduleStates', 'moduleInstanceId');
    states.forEach((row, index) => {
      const path = `$.moduleStates[${index}]`;
      object(row, path, ['moduleInstanceId', 'stateHash', 'state']);
      if (!implementationIds.has(row.moduleInstanceId)) fail(`${path}.moduleInstanceId`, 'declared module implementation', row.moduleInstanceId);
      hash(row.stateHash, `${path}.stateHash`);
    });
    const references = array(checkpoint.reconstructionReferences, '$.reconstructionReferences');
    uniqueObjects(references, '$.reconstructionReferences', 'scopeId');
    references.forEach((row, index) => {
      const path = `$.reconstructionReferences[${index}]`;
      object(row, path, ['scopeId', 'method', 'checkpointId', 'eventLogHash', 'aggregateStateHash']);
      oneOf(row.method, ['exact-checkpoint', 'deterministic-replay', 'qualified-aggregate'], `${path}.method`);
      ['checkpointId', 'eventLogHash', 'aggregateStateHash'].forEach((key) => nullableString(row[key], `${path}.${key}`));
      if (row.method === 'exact-checkpoint' && row.checkpointId === null) fail(`${path}.checkpointId`, 'checkpoint identity', null);
      if (row.method === 'deterministic-replay' && row.eventLogHash === null) fail(`${path}.eventLogHash`, 'event-log identity', null);
      if (row.method === 'qualified-aggregate' && row.aggregateStateHash === null) fail(`${path}.aggregateStateHash`, 'aggregate-state identity', null);
    });
    if (!states.length && !references.length) fail('$.moduleStates', 'state or reconstruction reference', states);
    array(checkpoint.pendingEvents, '$.pendingEvents').forEach((row, index) => object(row, `$.pendingEvents[${index}]`, [], Object.keys(row || {})));
    const buffers = array(checkpoint.portBuffers, '$.portBuffers');
    uniqueObjects(buffers, '$.portBuffers', 'portId');
    buffers.forEach((row, index) => {
      const path = `$.portBuffers[${index}]`;
      object(row, path, ['portId', 'valueHash', 'timestamp', 'value']);
      hash(row.valueHash, `${path}.valueHash`);
      finite(row.timestamp, `${path}.timestamp`);
    });
    object(checkpoint.couplingState, '$.couplingState', [], Object.keys(checkpoint.couplingState));
    const levels = array(checkpoint.fidelityLevels, '$.fidelityLevels');
    uniqueObjects(levels, '$.fidelityLevels', 'scopeId');
    levels.forEach((row, index) => {
      object(row, `$.fidelityLevels[${index}]`, ['scopeId', 'fidelityLevelId']);
      string(row.fidelityLevelId, `$.fidelityLevels[${index}].fidelityLevelId`);
    });
    const omitted = array(checkpoint.omittedScopes, '$.omittedScopes');
    uniqueObjects(omitted, '$.omittedScopes', 'scopeId');
    omitted.forEach((row, index) => {
      const path = `$.omittedScopes[${index}]`;
      object(row, path, ['scopeId', 'policy', 'referenceId']);
      oneOf(row.policy, ['exact-checkpoint', 'deterministic-replay', 'qualified-aggregate', 'causally-irrelevant'], `${path}.policy`);
      string(row.referenceId, `${path}.referenceId`);
    });
    return checkpoint;
  }

  function validateFidelityTransition(transition) {
    object(transition, '$', ['schema', 'id', 'scopeId', 'logicalTime', 'sourceModelId', 'targetModelId', 'sourceStateHash', 'method', 'transformationId', 'preservedQuantities', 'discardedInformation', 'errorBounds', 'initializationMethod', 'causalFrontier', 'resultStateHash', 'continuityClaim', 'branchId']);
    exactSchema(transition, SCHEMAS.fidelity);
    ['id', 'scopeId', 'sourceModelId', 'targetModelId', 'transformationId', 'initializationMethod'].forEach((key) => string(transition[key], `$.${key}`));
    finite(transition.logicalTime, '$.logicalTime', 0);
    hash(transition.sourceStateHash, '$.sourceStateHash');
    oneOf(transition.method, ['exact-checkpoint', 'deterministic-replay', 'qualified-sampling', 'coarsen', 'refuse'], '$.method');
    strings(transition.preservedQuantities, '$.preservedQuantities');
    const discarded = strings(transition.discardedInformation, '$.discardedInformation');
    const bounds = array(transition.errorBounds, '$.errorBounds');
    uniqueObjects(bounds, '$.errorBounds', 'quantity');
    bounds.forEach((row, index) => {
      const path = `$.errorBounds[${index}]`;
      object(row, path, ['quantity', 'absolute', 'relative']);
      if (row.absolute !== null) finite(row.absolute, `${path}.absolute`, 0);
      if (row.relative !== null) finite(row.relative, `${path}.relative`, 0);
      if (row.absolute === null && row.relative === null) fail(path, 'absolute or relative error bound', row);
    });
    strings(transition.causalFrontier, '$.causalFrontier');
    if (transition.resultStateHash !== null) hash(transition.resultStateHash, '$.resultStateHash');
    nullableString(transition.branchId, '$.branchId');
    oneOf(transition.continuityClaim, ['exact', 'qualified-branch', 'lossy', 'refused'], '$.continuityClaim');
    if (['exact-checkpoint', 'deterministic-replay'].includes(transition.method)) {
      if (transition.continuityClaim !== 'exact' || discarded.length || bounds.length || transition.branchId !== null || transition.resultStateHash === null) fail('$', 'exact transition without discarded information, bounds, or branch', transition);
    }
    if (transition.method === 'qualified-sampling') {
      if (transition.continuityClaim !== 'qualified-branch' || transition.branchId === null || transition.resultStateHash === null) fail('$', 'qualified branch with explicit branch and result identities', transition);
    }
    if (transition.method === 'coarsen') {
      if (transition.continuityClaim !== 'lossy' || !discarded.length || !bounds.length || transition.resultStateHash === null) fail('$', 'lossy transition with discarded information and error bounds', transition);
    }
    if (transition.method === 'refuse') {
      if (transition.continuityClaim !== 'refused' || transition.resultStateHash !== null) fail('$', 'refused transition without result state', transition);
    }
    return transition;
  }

  function validateWorldComposition(value) {
    const { scopes, frames, ports, couplingPlan, frameAdapters = [] } = value;
    const frameRows = array(frames, '$.frames', 1);
    const frameIds = uniqueObjects(frameRows, '$.frames');
    frameRows.forEach(validateCoordinateFrame);
    frameRows.forEach((frame, index) => {
      const parentId = frame.transformToParent && frame.transformToParent.parentFrameId;
      if (parentId && !frameIds.has(parentId)) fail(`$.frames[${index}].transformToParent.parentFrameId`, 'known parent frame', parentId);
    });
    rejectParentCycle(frameRows, (row) => row.transformToParent && row.transformToParent.parentFrameId, '$.frames');
    const adapterRows = array(frameAdapters, '$.frameAdapters');
    uniqueObjects(adapterRows, '$.frameAdapters');
    adapterRows.forEach((adapter) => validateCoordinateFrameAdapter(adapter, { frameIds }));
    const scopeRows = array(scopes, '$.scopes', 1);
    const scopeIds = uniqueObjects(scopeRows, '$.scopes');
    scopeRows.forEach((scope) => validateRecursiveWorldScope(scope, { frameIds }));
    const roots = scopeRows.filter((scope) => scope.parentScopeId === null);
    if (roots.length !== 1) fail('$.scopes', 'exactly one root scope', roots.map((row) => row.id));
    scopeRows.forEach((scope, index) => {
      if (scope.parentScopeId !== null && !scopeIds.has(scope.parentScopeId)) fail(`$.scopes[${index}].parentScopeId`, 'known parent scope', scope.parentScopeId);
      scope.childScopeIds.forEach((id, childIndex) => {
        const child = scopeRows.find((row) => row.id === id);
        if (!child || child.parentScopeId !== scope.id) fail(`$.scopes[${index}].childScopeIds[${childIndex}]`, 'child whose parent points back to this scope', id);
      });
    });
    rejectParentCycle(scopeRows, (row) => row.parentScopeId, '$.scopes');
    const portRows = array(ports, '$.ports');
    uniqueObjects(portRows, '$.ports');
    portRows.forEach((port) => validateSimulationPort(port, { frameIds }));
    validateCouplingPlan(couplingPlan, { ports: portRows });
    return value;
  }

  function rejectParentCycle(rows, parentFor, path) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    rows.forEach((row) => {
      const seen = new Set([row.id]);
      let parentId = parentFor(row);
      while (parentId !== null && parentId !== undefined) {
        if (seen.has(parentId)) fail(path, `acyclic parent chain from ${row.id}`, [...seen, parentId]);
        seen.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        parentId = parentFor(parent);
      }
    });
  }

  return Object.freeze({
    SCHEMAS,
    MultiscaleContractError,
    validateRecursiveWorldScope,
    validateCoordinateFrame,
    validateCoordinateFrameAdapter,
    validateSimulationPort,
    validateCouplingPlan,
    validateScopeCheckpoint,
    validateFidelityTransition,
    validateWorldComposition,
    ecefToWgs84,
    transformCoordinate,
    wgs84ToEcef,
  });
});
