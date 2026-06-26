(function attachSimulatteRenderIR(root, factory) {
  const renderRegistry = typeof module === 'object' && module.exports
    ? require('./simulatte-render-registry.js')
    : root.SimulatteRenderRegistry;
  const api = factory(renderRegistry || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteRenderIR = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRenderIRApi(renderRegistry = {}) {
  const RENDER_IR_SCHEMA = 'simulatte.renderIR.v1';

  function compileRenderIR(physicsIR = {}, solverGraph = {}, universeGraph = {}) {
    const domainByEntity = new Map((physicsIR.domains || []).map((domain) => [domain.entityId, domain]));
    const objects = (physicsIR.entities || []).map((entity, index) => {
      const domain = domainByEntity.get(entity.id) || {};
      const glyph = renderRegistry.glyphForEntity ? renderRegistry.glyphForEntity(entity, domain) : 'body';
      const materialStyle = renderRegistry.materialStyle ? renderRegistry.materialStyle(entity.materialId) : {};
      const visualRegime = renderRegistry.visualRegimeForDomain
        ? renderRegistry.visualRegimeForDomain(domain)
        : domain.kind || 'material';
      return {
        id: `render:${entity.id}`,
        semanticRef: entity.canonicalId,
        physicalRef: entity.id,
        domainRef: domain.id || '',
        label: entity.label,
        glyph,
        materialId: entity.materialId,
        materialStyle,
        visualRegime,
        geometry: domain.geometryRef || entity.geometryRef || null,
        stateBindings: stateBindingsForEntity(entity, domain, solverGraph),
        order: index,
      };
    });
    const sceneHint = renderRegistry.sceneHintForObjects
      ? renderRegistry.sceneHintForObjects(objects)
      : 'generic';
    return {
      schema: RENDER_IR_SCHEMA,
      sourceIR: physicsIR.schema || '',
      sourceSolverGraph: solverGraph.schema || '',
      prompt: physicsIR.prompt || universeGraph.prompt || '',
      objects,
      fields: fieldBindings(physicsIR, solverGraph),
      readouts: readoutBindings(physicsIR, solverGraph),
      receipt: physicsIR.receipt || null,
      sceneHint,
      provenance: {
        compiler: 'simulatte.render-ir.v1',
        registry: renderRegistry.RENDER_REGISTRY_SCHEMA || '',
      },
    };
  }

  function stateBindingsForEntity(entity, domain, solverGraph) {
    const entityId = entity.id;
    const has = (name) => solverGraph.channelMetadata && solverGraph.channelMetadata[`${name}:${entityId}`];
    const bind = {};
    if (has('temperature')) {
      bind.hue = `temperature:${entityId}`;
      bind.glow = `temperature:${entityId}`;
    }
    if (has('flowVelocity')) {
      bind.motion = `flowVelocity:${entityId}`;
      bind.flow = `flowVelocity:${entityId}`;
    }
    if (has('angularVelocity')) bind.rotationRate = `angularVelocity:${entityId}`;
    if (has('angle')) bind.rotation = `angle:${entityId}`;
    if (has('damage')) bind.crackDensity = `damage:${entityId}`;
    if (has('stress')) bind.deformation = `stress:${entityId}`;
    if (has('liquidFraction')) {
      bind.opacity = `liquidFraction:${entityId}`;
      bind.phase = `liquidFraction:${entityId}`;
    }
    if (has('pressure')) bind.pressure = `pressure:${entityId}`;
    if (has('backlog')) bind.congestion = `backlog:${entityId}`;
    if (has('throughput')) bind.throughput = `throughput:${entityId}`;
    if (has('amplitude')) bind.amplitude = `amplitude:${entityId}`;
    if (has('density')) bind.density = `density:${entityId}`;
    if (!Object.keys(bind).length) bind.activity = firstChannelForEntity(entityId, solverGraph);
    return bind;
  }

  function firstChannelForEntity(entityId, solverGraph) {
    return Object.keys(solverGraph.channelMetadata || {}).find((key) => key.endsWith(`:${entityId}`)) || '';
  }

  function fieldBindings(physicsIR, solverGraph) {
    return (physicsIR.stateFields || [])
      .filter((field) => ['temperature', 'flowVelocity', 'pressure', 'damage', 'phase', 'amplitude'].includes(field.name))
      .map((field) => ({
        id: `field:${field.id}`,
        channel: field.id,
        name: field.name,
        type: field.type,
        units: field.units,
        domainId: field.domainId,
        metadata: solverGraph.channelMetadata ? solverGraph.channelMetadata[field.id] || null : null,
      }));
  }

  function readoutBindings(physicsIR, solverGraph) {
    const fromIR = physicsIR.readouts || [];
    return fromIR.map((readout) => ({
      label: readout.label,
      channel: readout.channel,
      units: solverGraph.channelMetadata && solverGraph.channelMetadata[readout.channel]
        ? solverGraph.channelMetadata[readout.channel].units
        : '',
      source: readout.source || 'physics-ir',
    }));
  }

  return {
    RENDER_IR_SCHEMA,
    compileRenderIR,
  };
});
