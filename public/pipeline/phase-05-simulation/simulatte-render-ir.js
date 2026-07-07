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
        domainKind: domain.kind || '',
        domainTags: (domain.tags || []).slice(),
        operatorHints: unique([
          ...(entity.operatorHints || []),
          ...(domain.operatorHints || []),
        ]),
        label: entity.label,
        glyph,
        materialId: entity.materialId,
        materialStyle,
        visualRegime,
        geometry: domain.geometryRef || entity.geometryRef || null,
        stateBindings: stateBindingsForEntity(entity, domain, solverGraph),
        behavior: behaviorForEntity(entity, physicsIR.behaviorRelations || []),
        physicsOperators: operatorTypesForEntity(entity, physicsIR.operators || [], solverGraph.steps || []),
        order: index,
      };
    });
    const sceneHint = renderRegistry.sceneHintForObjects
      ? renderRegistry.sceneHintForObjects(objects, physicsIR, solverGraph)
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
      typedEvidenceBuckets: physicsIR.typedEvidenceBuckets || universeGraph.typedEvidenceBuckets || null,
      compositionLedger: physicsIR.compositionLedger || universeGraph.compositionLedger || null,
      behaviorRelations: physicsIR.behaviorRelations || [],
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
    if (has('swimPhase')) bind.swimPhase = `swimPhase:${entityId}`;
    if (has('strokeForce')) bind.strokeForce = `strokeForce:${entityId}`;
    if (has('buoyancy')) bind.buoyancy = `buoyancy:${entityId}`;
    if (has('drag')) bind.drag = `drag:${entityId}`;
    if (has('submersion')) bind.submersion = `submersion:${entityId}`;
    if (has('wake')) bind.wake = `wake:${entityId}`;
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
      .filter((field) => [
        'temperature',
        'flowVelocity',
        'pressure',
        'damage',
        'stress',
        'phase',
        'amplitude',
        'backlog',
        'throughput',
        'signalDelay',
        'density',
        'nutrient',
        'liquidFraction',
        'reactionProgress',
        'swimPhase',
        'strokeForce',
        'buoyancy',
        'drag',
        'submersion',
        'wake',
      ].includes(field.name))
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

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function behaviorForEntity(entity = {}, behaviorRelations = []) {
    const entityId = entity.id || '';
    const rows = (behaviorRelations || []).filter((row) => row.agentEntityId === entityId || row.mediumEntityId === entityId);
    if (!rows.length) return null;
    return {
      schema: 'simulatte.renderBehaviorBinding.v1',
      processes: unique(rows.map((row) => row.process).filter(Boolean)),
      roles: unique(rows.map((row) => row.agentEntityId === entityId ? 'agent' : 'medium')),
      relationIds: rows.map((row) => row.id).filter(Boolean),
      operators: unique(rows.flatMap((row) => row.operators || [])),
    };
  }

  function operatorTypesForEntity(entity = {}, operators = [], steps = []) {
    const entityId = entity.id || '';
    return unique([
      ...(operators || []).filter((row) => row.entityId === entityId).map((row) => row.type),
      ...(steps || []).filter((row) => String(row.operatorId || '').endsWith(`:${entityId}`)).map((row) => row.operatorType),
    ].filter(Boolean));
  }

  return {
    RENDER_IR_SCHEMA,
    compileRenderIR,
  };
});
