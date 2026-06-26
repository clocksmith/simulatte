(function attachSimulattePhysicsIR(root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const api = factory(catalog || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsIR = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsIRApi(catalog = {}) {
  const PHYSICAL_IR_SCHEMA = 'simulatte.physicalIR.v1';
  const {
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    clamp01 = (value) => Math.max(0, Math.min(1, value)),
    slugify = defaultSlugify,
    uniqueList = unique,
  } = catalog;

  const DOMAIN_KIND_BY_HINT = Object.freeze({
    fluid: 'fluid',
    thermal: 'field',
    phase: 'solid',
    solid: 'solid',
    fracture: 'solid',
    rigidBody: 'rigidBody',
    collision: 'rigidBody',
    rotationalMechanics: 'rigidBody',
    particles: 'particleSet',
    field: 'field',
    wave: 'field',
    oscillator: 'field',
    network: 'network',
    control: 'network',
    growth: 'field',
    terrain: 'solid',
    reaction: 'field',
  });

  function buildPhysicsIR(input = {}) {
    const universeGraph = input.universeGraph || { nodes: [], edges: [], unresolved: [] };
    const prompt = input.prompt || universeGraph.prompt || input.intent && input.intent.prompt || '';
    const params = input.params || {};
    const entities = [];
    const domains = [];
    const stateFields = [];
    const rigidBodies = [];
    const particles = [];
    const constraints = [];
    const operators = [];
    const couplings = [];
    const boundaryConditions = [];
    const controls = Object.keys(params).map((key) => ({ id: key, value: params[key] }));
    const receipt = emptyReceipt();
    const domainByNode = new Map();

    for (const node of universeGraph.nodes || []) {
      const entity = entityForNode(node);
      entities.push(entity);
      receipt.exact.push({ promptSpan: node.label, canonicalId: node.canonicalId, confidence: node.confidence });
      const domain = domainForEntity(entity, node, domains.length);
      domains.push(domain);
      domainByNode.set(node.id, domain);
      addBaseFields(stateFields, entity, domain, params);
      addEntityOperators(operators, entity, domain, node, params);
      if (domain.kind === 'rigidBody') rigidBodies.push(rigidBodyForEntity(entity, domain));
      if (domain.kind === 'particleSet') particles.push(particleSetForEntity(entity, domain));
      boundaryConditions.push(boundaryForDomain(domain));
    }

    for (const unresolved of universeGraph.unresolved || []) {
      receipt.unresolved.push({
        promptSpan: unresolved.text,
        reason: unresolved.reason || 'not grounded',
      });
    }

    addCouplingsFromEdges(couplings, operators, domainByNode, universeGraph.edges || [], params, receipt);
    addImplicitCouplings(couplings, operators, domains, params, receipt);
    addFallbackIfNeeded(entities, domains, stateFields, operators, boundaryConditions, prompt, params, receipt);

    const readouts = readoutsForIR(stateFields, operators, universeGraph.observables || []);
    return {
      schema: PHYSICAL_IR_SCHEMA,
      prompt,
      entities,
      domains,
      stateFields,
      rigidBodies,
      particles,
      constraints,
      operators,
      couplings,
      boundaryConditions,
      controls,
      readouts,
      receipt,
      provenance: {
        compiler: 'simulatte.physics-ir.v1',
        universeGraph: universeGraph.schema || '',
      },
    };
  }

  function emptyReceipt() {
    return { exact: [], approximate: [], unresolved: [], unsupported: [] };
  }

  function entityForNode(node) {
    return {
      id: slugify(node.id || node.canonicalId || node.label),
      sourceNodeId: node.id,
      canonicalId: node.canonicalId,
      label: node.label || node.canonicalId,
      semanticType: node.semanticType || 'body',
      materialId: node.materialId || materialFromDomains(node.domains || []),
      domains: node.domains || [],
      geometryRef: geometryForNode(node),
      confidence: node.confidence,
    };
  }

  function geometryForNode(node) {
    const text = `${node.label || ''} ${node.canonicalId || ''}`.toLowerCase();
    if (/turbine|rotor|wheel/.test(text)) return { kind: 'disk', radius: 0.12, anchor: [0.54, 0.52] };
    if (/lava|river|water|wind|rain/.test(text)) return { kind: 'path', bounds: [0.08, 0.18, 0.84, 0.64] };
    if (/wall|castle|cathedral/.test(text)) return { kind: 'barrier', bounds: [0.68, 0.28, 0.12, 0.46] };
    if (/projectile|hammer/.test(text)) return { kind: 'pointBody', radius: 0.045, anchor: [0.22, 0.42] };
    if (/network|queue|traffic|market|city/.test(text)) return { kind: 'graph', nodes: 6 };
    return { kind: 'body', bounds: [0.32, 0.34, 0.24, 0.2] };
  }

  function domainForEntity(entity, node, index) {
    const domains = node.domains || entity.domains || [];
    const kind = preferredDomainKind(domains, entity.semanticType);
    return {
      id: `domain:${entity.id}`,
      entityId: entity.id,
      sourceNodeId: node.id,
      kind,
      materialId: entity.materialId,
      geometryRef: entity.geometryRef,
      tags: uniqueList([entity.semanticType, ...domains].filter(Boolean)),
      order: index,
    };
  }

  function preferredDomainKind(domains, semanticType) {
    if (semanticType === 'network') return 'network';
    if (semanticType === 'fluid') return 'fluid';
    if (semanticType === 'observable') return 'field';
    for (const domain of domains || []) {
      if (DOMAIN_KIND_BY_HINT[domain]) return DOMAIN_KIND_BY_HINT[domain];
    }
    return 'rigidBody';
  }

  function addBaseFields(fields, entity, domain, params) {
    const id = entity.id;
    addField(fields, domain, 'position', 'vector2', 'normalized', { x: anchorValue(domain, 0), y: anchorValue(domain, 1) });
    if (domain.kind === 'fluid' || hasTag(domain, 'fluid')) {
      addField(fields, domain, 'flowVelocity', 'vector2', 'm/s', {
        x: clamp(Number(params.flowRate ?? params.windSpeed ?? 0.55), -2, 2),
        y: hasTag(domain, 'lava') ? 0.12 : 0,
      });
      addField(fields, domain, 'pressure', 'scalar', 'kPa', 0.34);
      addField(fields, domain, 'viscosity', 'scalar', 'Pa*s', materialViscosity(entity.materialId));
    }
    if (domain.kind === 'rigidBody' || hasTag(domain, 'rotationalMechanics')) {
      addField(fields, domain, 'velocity', 'vector2', 'm/s', { x: 0, y: 0 });
      addField(fields, domain, 'angle', 'scalar', 'rad', 0);
      addField(fields, domain, 'angularVelocity', 'scalar', 'rad/s', 0);
      addField(fields, domain, 'force', 'vector2', 'N', { x: 0, y: 0 });
      addField(fields, domain, 'torque', 'scalar', 'N*m', 0);
    }
    if (domain.kind === 'solid' || hasTag(domain, 'fracture')) {
      addField(fields, domain, 'stress', 'scalar', 'Pa', 0);
      addField(fields, domain, 'damage', 'scalar', 'ratio', 0);
    }
    if (
      hasTag(domain, 'thermal') ||
      domain.kind === 'solid' ||
      domain.kind === 'rigidBody' ||
      ['lava', 'fire', 'ice', 'water', 'metal', 'rock'].includes(entity.materialId)
    ) {
      addField(fields, domain, 'temperature', 'scalar', 'K', materialTemperature(entity.materialId, params));
    }
    if ((hasTag(domain, 'phase') && !['lava', 'fire'].includes(entity.materialId)) || entity.materialId === 'ice') {
      addField(fields, domain, 'liquidFraction', 'scalar', 'ratio', entity.materialId === 'water' ? 1 : 0);
    }
    if (domain.kind === 'network') {
      addField(fields, domain, 'backlog', 'scalar', 'ratio', clamp01(Number(params.queueBacklog || 0.35)));
      addField(fields, domain, 'throughput', 'scalar', 'ratio', clamp01(Number(params.serviceRate || 0.42)));
      addField(fields, domain, 'signalDelay', 'scalar', 's', clamp01(Number(params.networkLatency || params.signalDelay || 0.2)));
    }
    if (hasTag(domain, 'wave') || hasTag(domain, 'oscillator')) {
      addField(fields, domain, 'phase', 'scalar', 'rad', 0);
      addField(fields, domain, 'amplitude', 'scalar', 'ratio', clamp01(Number(params.waveAmplitude || 0.44)));
    }
    if (hasTag(domain, 'growth')) {
      addField(fields, domain, 'density', 'scalar', 'ratio', 0.28);
      addField(fields, domain, 'nutrient', 'scalar', 'ratio', 0.62);
    }
    if (hasTag(domain, 'reaction')) {
      addField(fields, domain, 'reactionProgress', 'scalar', 'ratio', 0.08);
    }
    fields.forEach((field) => {
      if (field.domainId === domain.id) field.entityId = id;
    });
  }

  function addField(fields, domain, name, type, units, initial) {
    const id = `${name}:${domain.entityId}`;
    if (fields.some((field) => field.id === id)) return;
    fields.push({
      id,
      domainId: domain.id,
      name,
      type,
      units,
      initial,
      bounds: boundsForField(name),
      owningSolvers: [],
    });
  }

  function addEntityOperators(operators, entity, domain, node, params) {
    if (domain.kind === 'fluid') {
      addOperator(operators, 'advection', domain, {
        reads: [`flowVelocity:${entity.id}`, `viscosity:${entity.id}`],
        writes: [`flowVelocity:${entity.id}`, `pressure:${entity.id}`],
        params: { rate: clamp(Number(params.flowRate ?? params.windSpeed ?? 0.55), 0, 2) },
      });
    }
    if (hasTag(domain, 'thermal') || ['lava', 'fire'].includes(entity.materialId)) {
      addOperator(operators, 'heat_source', domain, {
        reads: [`temperature:${entity.id}`],
        writes: [`temperature:${entity.id}`],
        params: { strength: materialHeatStrength(entity.materialId, params) },
      });
    }
    if (domain.kind === 'network') {
      addOperator(operators, 'network_flow', domain, {
        reads: [`backlog:${entity.id}`, `throughput:${entity.id}`, `signalDelay:${entity.id}`],
        writes: [`backlog:${entity.id}`, `throughput:${entity.id}`],
        params: { demand: clamp01(Number(params.marketDemand || params.queueBacklog || 0.52)) },
      });
    }
    if (hasTag(domain, 'wave') || hasTag(domain, 'oscillator')) {
      addOperator(operators, hasTag(domain, 'wave') ? 'wave_field' : 'oscillator', domain, {
        reads: [`phase:${entity.id}`, `amplitude:${entity.id}`],
        writes: [`phase:${entity.id}`, `amplitude:${entity.id}`],
        params: { frequency: clamp(Number(params.soundFrequency || 0.7), 0.05, 4) },
      });
    }
    if (hasTag(domain, 'growth')) {
      addOperator(operators, 'growth_decay', domain, {
        reads: [`density:${entity.id}`, `nutrient:${entity.id}`],
        writes: [`density:${entity.id}`, `nutrient:${entity.id}`],
        params: { rate: clamp01(Number(params.populationGrowth || 0.32)) },
      });
    }
    if (hasTag(domain, 'reaction')) {
      addOperator(operators, 'reaction_diffusion', domain, {
        reads: [`reactionProgress:${entity.id}`],
        writes: [`reactionProgress:${entity.id}`],
        params: { rate: clamp01(Number(params.catalyst || params.combustibility || 0.46)) },
      });
    }
    if (node && node.semanticType === 'observable' && !node.operatorHints.length) {
      addOperator(operators, 'derive_readout', domain, { reads: [], writes: [], params: { label: node.label } });
    }
  }

  function addCouplingsFromEdges(couplings, operators, domainByNode, edges, params, receipt) {
    for (const edge of edges || []) {
      const from = domainByNode.get(edge.from);
      const to = domainByNode.get(edge.to);
      if (!from || !to) continue;
      const operator = couplingOperator(edge.type, from, to);
      if (!operator) {
        receipt.unsupported.push({
          promptSpan: `${edge.from} ${edge.type} ${edge.to}`,
          reason: 'no compatible physical operator',
          fallback: 'visual adjacency only',
        });
        continue;
      }
      const op = addCouplingOperator(operators, operator, from, to, params, edge);
      couplings.push({ from: from.id, to: to.id, type: edge.type, operatorId: op.id });
    }
  }

  function addImplicitCouplings(couplings, operators, domains, params, receipt) {
    const fluids = domains.filter((domain) => domain.kind === 'fluid');
    const rotors = domains.filter((domain) => isRotationalDomain(domain));
    const thermal = domains.filter((domain) => hasTag(domain, 'thermal') || ['lava', 'fire'].includes(domain.materialId));
    const phaseTargets = domains.filter((domain) => (
      (hasTag(domain, 'phase') || domain.materialId === 'ice') &&
      !['lava', 'fire'].includes(domain.materialId)
    ));
    const fractureTargets = domains.filter((domain) => hasTag(domain, 'fracture'));
    for (const fluid of fluids) {
      for (const rotor of rotors) {
        const op = addCouplingOperator(operators, 'rotational_torque', fluid, rotor, params, { type: 'fluidForce' });
        couplings.push({ from: fluid.id, to: rotor.id, type: 'fluidForce', operatorId: op.id });
      }
    }
    for (const source of thermal) {
      for (const target of domains) {
        if (source.id === target.id || !hasFieldTarget(target, 'temperature')) continue;
        const op = addCouplingOperator(operators, 'heat_transfer', source, target, params, { type: 'heatTransfer' });
        couplings.push({ from: source.id, to: target.id, type: 'heatTransfer', operatorId: op.id });
      }
    }
    for (const target of phaseTargets) {
      const op = addCouplingOperator(operators, 'phase_transition', target, target, params, { type: 'phaseChange' });
      couplings.push({ from: target.id, to: target.id, type: 'phaseChange', operatorId: op.id });
    }
    for (const target of fractureTargets) {
      const op = addCouplingOperator(operators, 'fracture_threshold', target, target, params, { type: 'fracture' });
      couplings.push({ from: target.id, to: target.id, type: 'fracture', operatorId: op.id });
    }
    if (domains.some((domain) => /soul|entropy/.test(domain.entityId))) {
      receipt.approximate.push({
        promptSpan: 'abstract thermodynamic phrase',
        reason: 'compiled to observable field and readout channels',
      });
    }
  }

  function couplingOperator(edgeType, from, to) {
    if (
      (edgeType === 'fluidForce' || edgeType === 'torqueTransfer') &&
      from.kind === 'fluid' &&
      isRotationalDomain(to)
    ) {
      return 'rotational_torque';
    }
    if (edgeType === 'heatTransfer' && hasFieldTarget(from, 'temperature') && hasFieldTarget(to, 'temperature')) {
      return 'heat_transfer';
    }
    if (edgeType === 'phaseChange' && hasFieldTarget(to, 'liquidFraction')) return 'phase_transition';
    if (edgeType === 'collision' && (hasTag(from, 'collision') || from.kind === 'rigidBody') && to.kind !== 'fluid') {
      return 'rigid_collision';
    }
    if (edgeType === 'waveCoupling') return 'wave_field';
    if (edgeType === 'diffusion') return 'diffusion';
    if (edgeType === 'adjacent') return null;
    return null;
  }

  function addCouplingOperator(operators, type, from, to, params, edge) {
    const fromEntity = from.entityId;
    const toEntity = to.entityId;
    if (type === 'rotational_torque') {
      return addOperator(operators, type, to, {
        reads: [`flowVelocity:${fromEntity}`, `angularVelocity:${toEntity}`, `viscosity:${fromEntity}`],
        writes: [`angularVelocity:${toEntity}`, `angle:${toEntity}`, `torque:${toEntity}`],
        params: { coupling: clamp(Number(params.turbineCoupling || params.fieldStrength || 0.72), 0.05, 2) },
      });
    }
    if (type === 'heat_transfer') {
      return addOperator(operators, type, to, {
        reads: [`temperature:${fromEntity}`, `temperature:${toEntity}`],
        writes: [`temperature:${toEntity}`],
        params: { rate: clamp(Number(params.heatTransfer || 0.48), 0.02, 2) },
      });
    }
    if (type === 'phase_transition') {
      return addOperator(operators, type, to, {
        reads: [`temperature:${toEntity}`, `liquidFraction:${toEntity}`],
        writes: [`liquidFraction:${toEntity}`],
        params: { threshold: materialMeltPoint(to.materialId), rate: clamp(Number(params.latentHeat || 0.45), 0.05, 2) },
      });
    }
    if (type === 'rigid_collision') {
      return addOperator(operators, type, to, {
        reads: [`velocity:${fromEntity}`, `stress:${toEntity}`, `damage:${toEntity}`],
        writes: [`stress:${toEntity}`, `damage:${toEntity}`],
        params: { impulse: clamp(Number(params.impact || params.energyInput || 0.62), 0.05, 2) },
      });
    }
    if (type === 'fracture_threshold') {
      return addOperator(operators, type, to, {
        reads: [`stress:${toEntity}`, `damage:${toEntity}`, `temperature:${toEntity}`],
        writes: [`damage:${toEntity}`],
        params: { threshold: clamp(Number(params.hardness || 0.62), 0.05, 1.4) },
      });
    }
    return addOperator(operators, type, to, {
      reads: [],
      writes: [],
      params: { edgeType: edge && edge.type || '' },
    });
  }

  function addFallbackIfNeeded(entities, domains, fields, operators, boundaries, prompt, params, receipt) {
    if (entities.length) return;
    const node = {
      id: 'prompt-field',
      canonicalId: 'field.prompt',
      label: prompt || 'Prompt Field',
      semanticType: 'field',
      materialId: '',
      domains: ['field'],
      confidence: 0.32,
    };
    const entity = entityForNode(node);
    const domain = domainForEntity(entity, node, 0);
    entities.push(entity);
    domains.push(domain);
    addField(fields, domain, 'amplitude', 'scalar', 'ratio', clamp01(Number(params.fieldStrength || 0.4)));
    addField(fields, domain, 'phase', 'scalar', 'rad', 0);
    addOperator(operators, 'oscillator', domain, {
      reads: [`phase:${entity.id}`, `amplitude:${entity.id}`],
      writes: [`phase:${entity.id}`, `amplitude:${entity.id}`],
      params: { frequency: 0.42 },
    });
    boundaries.push(boundaryForDomain(domain));
    receipt.approximate.push({
      promptSpan: prompt || 'blank prompt',
      reason: 'compiled to generic oscillator field',
    });
  }

  function addOperator(operators, type, domain, detail) {
    const reads = uniqueList(detail.reads || []);
    const writes = uniqueList(detail.writes || []);
    const key = `${type}:${domain.entityId}:${reads.join(',')}:${writes.join(',')}`;
    const existing = operators.find((operator) => operator.key === key);
    if (existing) return existing;
    const operator = {
      id: `op${operators.length + 1}:${type}:${domain.entityId}`,
      key,
      type,
      domainId: domain.id,
      entityId: domain.entityId,
      inputs: reads,
      outputs: writes,
      reads,
      writes,
      params: detail.params || {},
      stage: stageForOperator(type),
    };
    operators.push(operator);
    return operator;
  }

  function rigidBodyForEntity(entity, domain) {
    return {
      id: `rigid:${entity.id}`,
      entityId: entity.id,
      domainId: domain.id,
      mass: materialDensity(entity.materialId),
      inertia: /turbine|rotor|wheel/i.test(entity.canonicalId) ? 0.38 : 0.62,
      fixed: /wall|castle|cathedral/.test(entity.canonicalId),
    };
  }

  function particleSetForEntity(entity, domain) {
    return {
      id: `particles:${entity.id}`,
      entityId: entity.id,
      domainId: domain.id,
      count: /rain|smoke|exhaust/.test(entity.canonicalId) ? 180 : 96,
      materialId: entity.materialId,
    };
  }

  function boundaryForDomain(domain) {
    if (domain.kind === 'fluid') return { domainId: domain.id, kind: 'open', axis: 'x', receipt: 'default-open-flow' };
    if (domain.kind === 'network') return { domainId: domain.id, kind: 'driven', value: 'bounded-demand' };
    if (domain.kind === 'solid') return { domainId: domain.id, kind: 'fixed', value: 'static-anchor' };
    return { domainId: domain.id, kind: 'closed', value: 'normalized-canvas' };
  }

  function readoutsForIR(fields, operators, observables) {
    const readouts = [];
    for (const observable of observables || []) {
      const field = fields.find((row) => row.name === observable.channel || row.id.startsWith(`${observable.channel}:`));
      readouts.push({ label: observable.label, channel: field ? field.id : observable.channel, source: 'prompt-observable' });
    }
    for (const name of ['angularVelocity', 'temperature', 'damage', 'liquidFraction', 'backlog', 'throughput']) {
      const field = fields.find((row) => row.name === name);
      if (field && !readouts.some((row) => row.channel === field.id)) {
        readouts.push({ label: name, channel: field.id, source: 'compiler-default' });
      }
    }
    if (!readouts.length && operators.length) {
      readouts.push({ label: 'activity', channel: operators[0].outputs[0] || operators[0].id, source: 'compiler-default' });
    }
    return readouts.slice(0, 8);
  }

  function materialTemperature(material, params) {
    if (material === 'lava' || material === 'fire') return clamp(Number(params.temperature || 0.92), 0, 2);
    if (material === 'ice') return clamp(Number(params.temperature || 0.14), 0, 1);
    if (material === 'water') return clamp(Number(params.temperature || 0.36), 0, 1);
    return clamp(Number(params.temperature || params.thermalFlux || 0.38), 0, 1.4);
  }

  function materialHeatStrength(material, params) {
    if (material === 'lava') return clamp(Number(params.heatTransfer || 1.05), 0.1, 2);
    if (material === 'fire') return clamp(Number(params.combustibility || 0.86), 0.1, 2);
    return clamp(Number(params.heatTransfer || 0.38), 0.05, 1.4);
  }

  function materialMeltPoint(material) {
    if (material === 'ice') return 0.32;
    if (material === 'metal') return 1.6;
    if (material === 'rock') return 1.1;
    return 0.56;
  }

  function materialViscosity(material) {
    if (material === 'lava') return 0.82;
    if (material === 'water') return 0.18;
    if (material === 'air') return 0.04;
    return 0.34;
  }

  function materialDensity(material) {
    if (material === 'metal') return 1.1;
    if (material === 'rock') return 1.3;
    if (material === 'wood') return 0.62;
    return 0.86;
  }

  function materialFromDomains(domains) {
    const text = (domains || []).join(' ');
    if (/lava/.test(text)) return 'lava';
    if (/water|fluid/.test(text)) return 'water';
    if (/metal|mechanic|rigid/.test(text)) return 'metal';
    if (/rock|solid|fracture/.test(text)) return 'rock';
    if (/bio|growth/.test(text)) return 'biomass';
    return '';
  }

  function stageForOperator(type) {
    if (type === 'heat_source') return 'sources';
    if (['advection', 'diffusion', 'wave_field', 'reaction_diffusion', 'growth_decay', 'network_flow'].includes(type)) {
      return 'fields';
    }
    if (['heat_transfer', 'rotational_torque', 'phase_transition', 'pressure_flow_lite'].includes(type)) {
      return 'couplings';
    }
    if (['rigid_collision', 'fracture_threshold'].includes(type)) return 'collisions';
    if (type === 'derive_readout') return 'derivedReadouts';
    return 'events';
  }

  function boundsForField(name) {
    if (name === 'temperature') return [0, 2];
    if (name === 'angularVelocity') return [-24, 24];
    if (name === 'angle') return [-Infinity, Infinity];
    if (name === 'flowVelocity' || name === 'velocity' || name === 'force') return [-4, 4];
    if (['damage', 'liquidFraction', 'density', 'nutrient', 'reactionProgress', 'backlog', 'throughput'].includes(name)) {
      return [0, 1];
    }
    return [0, 1.5];
  }

  function anchorValue(domain, axis) {
    const ref = domain.geometryRef || {};
    if (Array.isArray(ref.anchor)) return ref.anchor[axis] || 0.5;
    if (Array.isArray(ref.bounds)) return ref.bounds[axis] || 0.5;
    return 0.5;
  }

  function hasTag(domain, value) {
    return (domain.tags || []).includes(value) || domain.materialId === value;
  }

  function isRotationalDomain(domain) {
    const text = `${domain.entityId || ''} ${domain.materialId || ''} ${(domain.tags || []).join(' ')}`.toLowerCase();
    return hasTag(domain, 'rotationalMechanics') || /\bturbine|rotor|wheel|rotation|shaft|blade\b/.test(text);
  }

  function hasFieldTarget(domain, name) {
    if (name === 'temperature') return hasTag(domain, 'thermal') || ['lava', 'fire', 'ice', 'water', 'metal', 'rock'].includes(domain.materialId);
    if (name === 'liquidFraction') return hasTag(domain, 'phase') || domain.materialId === 'ice';
    return true;
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function defaultSlugify(value) {
    return String(value || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  return {
    PHYSICAL_IR_SCHEMA,
    buildPhysicsIR,
  };
});
