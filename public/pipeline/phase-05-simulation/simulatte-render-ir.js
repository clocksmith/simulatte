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
    const physicalObjects = (physicsIR.entities || []).map((entity, index) => {
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
        sourceLabel: entity.sourceLabel || entity.label,
        aliases: (entity.aliases || []).slice(),
        semanticClass: entity.semanticClass || '',
        visualArchetype: entity.visualArchetype || '',
        shapeHints: (entity.shapeHints || []).slice(),
        construction: entity.construction || null,
        constructionProvenance: (entity.constructionProvenance || []).slice(),
        directlyGrounded: entity.directlyGrounded === true,
        glyph,
        materialId: entity.materialId,
        materialStyle,
        visualRegime,
        geometry: domain.geometryRef || entity.geometryRef || null,
        stateBindings: stateBindingsForEntity(entity, domain, solverGraph),
        behavior: behaviorForEntity(entity, physicsIR.behaviorRelations || []),
        physicsOperators: operatorTypesForEntity(entity, physicsIR.operators || [], solverGraph.steps || []),
        order: index,
        evidence: (entity.evidence || []).slice(),
      };
    });
    const objects = [
      ...physicalObjects,
      ...visualOnlyObjects(universeGraph, physicalObjects, renderRegistry),
    ];
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

  function visualOnlyObjects(universeGraph = {}, physicalObjects = [], registry = {}) {
    const represented = new Set((physicalObjects || []).flatMap((row) => identityKeys([
      row.id,
      row.semanticRef,
      row.physicalRef,
      row.label,
    ].filter(Boolean).join(' '))));
    const rows = [];
    const materialAttributeNodeIds = new Set((universeGraph.edges || [])
      .filter((edge) => edge.type === 'materialOf')
      .map((edge) => edge.from));
    for (const node of universeGraph.nodes || []) {
      if (materialAttributeNodeIds.has(node.id)) continue;
      const nodeKeys = identityKeys([
        node.id,
        node.canonicalId,
        node.label,
        ...(node.aliases || []),
      ].filter(Boolean).join(' '));
      if (nodeKeys.some((key) => represented.has(key))) continue;
      if (!node.id || !node.label || node.supportOnly === true) continue;
      const semanticType = String(node.semanticType || node.type || '').toLowerCase();
      if (/^(event|process|action|observable|operator|property|state)$/.test(semanticType)) {
        continue;
      }
      const domain = {
        kind: node.semanticType || 'object',
        materialId: node.materialId || '',
        tags: node.domains || [],
        operatorHints: node.operatorTypes || node.operatorHints || [],
      };
      const materialStyle = registry.materialStyle ? registry.materialStyle(node.materialId) : {};
      rows.push({
        id: `render:${node.id}`,
        semanticRef: node.canonicalId || node.id,
        physicalRef: '',
        sourceGraphId: node.id,
        sourceIds: [node.id, ...(node.evidence || [])],
        domainRef: '',
        domainKind: domain.kind,
        domainTags: domain.tags.slice(),
        operatorHints: unique(node.operatorTypes || node.operatorHints || []),
        label: node.label,
        sourceLabel: node.label,
        aliases: (node.aliases || []).slice(),
        semanticClass: node.semanticClass || '',
        visualArchetype: node.visualArchetype || '',
        shapeHints: (node.shapeHints || []).slice(),
        construction: node.construction || null,
        constructionProvenance: (node.constructionProvenance || []).slice(),
        directlyGrounded: node.directlyGrounded === true || node.indexName === 'prompt-typed-slot',
        glyph: node.shapeHints && node.shapeHints[0] || 'body',
        materialId: node.materialId || '',
        materialStyle,
        visualRegime: registry.visualRegimeForDomain
          ? registry.visualRegimeForDomain(domain)
          : domain.kind,
        geometry: node.construction ? { kind: 'constructive-program', construction: node.construction } :
          node.shapeHints && node.shapeHints[0] || null,
        stateBindings: {},
        behavior: null,
        physicsOperators: unique(node.operatorTypes || node.operatorHints || []),
        renderOnly: true,
        evidence: node.evidence || [],
        order: physicalObjects.length + rows.length,
      });
      nodeKeys.forEach((key) => represented.add(key));
    }
    return rows;
  }

  function identityKeys(value = '') {
    const ignored = new Set(['artifact', 'entity', 'environment', 'primitive', 'prompt', 'render', 'surface']);
    return String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !ignored.has(token))
      .map((token) => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token);
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
      sourceEvidence: unique(rows.flatMap((row) => row.evidence || [])),
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
