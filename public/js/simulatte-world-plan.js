(function attachSimulatteWorldPlan(root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteWorldPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldPlanApi(catalog) {
  const {
    clamp,
    clamp01,
    hashNoise,
    uniqueList,
  } = catalog;

  const PLAN_SCHEMA = 'simulatte.worldPlan.v1';

  const MATERIAL_STYLES = Object.freeze({
    air: style('#dff7ff', '#76c7e7', 0.18),
    biomass: style('#5a8f52', '#2f6130', 0.72),
    fire: style('#ff7a2f', '#b93118', 0.92),
    glass: style('#dff9ff', '#66b8e8', 0.34),
    light: style('#ffe873', '#efb425', 0.84),
    magnet: style('#d44a8f', '#2959c6', 0.88),
    metal: style('#b8c1ca', '#68737e', 0.74),
    rock: style('#8f8b82', '#54524d', 0.86),
    sand: style('#d9bd7b', '#a8793d', 0.76),
    smoke: style('#aeb5ba', '#687077', 0.28),
    soil: style('#8a6845', '#4d3826', 0.78),
    water: style('#56b7e8', '#216b9c', 0.62),
    wood: style('#9b6236', '#57351d', 0.8),
  });

  function style(fill, stroke, alpha) {
    return { fill, stroke, alpha };
  }

  function tokenSet(spec) {
    const out = new Set();
    for (const item of [
      spec.name,
      spec.description,
      spec.intent && spec.intent.prompt,
      ...(spec.modules || []),
      ...(spec.objects || []).flatMap((object) => [object.id, object.type, object.role, object.layer]),
    ]) {
      String(item || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).forEach((token) => out.add(token));
    }
    return out;
  }

  function hasAny(tokens, ...terms) {
    return terms.some((term) => tokens.has(term) || tokens.has(String(term).replace(/-/g, '')));
  }

  function planKindForSpec(spec) {
    const tokens = tokenSet(spec);
    const top = spec.contract && spec.contract.topLevel || [];
    const prompt = `${spec.name || ''} ${spec.intent && spec.intent.prompt || ''}`.toLowerCase();
    const promptHas = (...terms) => terms.some((term) => prompt.includes(term));
    const includes = (id) => top.includes(id) || (spec.objects || []).some((object) => object.id === id);
    if (top.includes('magnetic-motor') || promptHas('magnetic', 'wheel', 'rotor', 'perpetual')) {
      return 'magnetic-machine';
    }
    if (promptHas('sample tray', 'matter tray', 'material tray', 'water air rock')) {
      return 'material-bench';
    }
    if (includes('forest-fire') || hasAny(tokens, 'forest', 'fire', 'flame') ||
      promptHas('combustion', 'burn', 'smoke lift', 'damp pockets')) {
      return 'forest-fire';
    }
    if (includes('river-erosion') || includes('mountain-watershed') ||
      promptHas('rain channel', 'sediment fan', 'gravity slope', 'erosion')) {
      return 'watershed';
    }
    if (includes('optics-bench') || hasAny(tokens, 'optics', 'lens', 'prism')) return 'optics-bench';
    if (includes('city-grid') || includes('traffic-system') || includes('market-queue') ||
      promptHas('rush-hour', 'service loop', 'demand queue', 'throughput meter')) {
      return 'city-grid';
    }
    if (hasAny(tokens, 'water', 'wood', 'metal', 'glass', 'rock', 'sand', 'soil')) return 'material-bench';
    return 'freeform-physics';
  }

  function basePlan(spec, kind) {
    const contract = spec.contract || {};
    const stageTrace = [
      stage('lexical_evidence', { terms: tokenSet(spec).size, topLevel: contract.topLevel || [] }),
      stage('primitive_resolution', { objects: (spec.objects || []).length, modules: (spec.modules || []).length }),
      stage('contract_graph', {
        nodes: contract.graph ? contract.graph.nodes.length : 0,
        edges: contract.graph ? contract.graph.edges.length : 0,
      }),
    ];
    return {
      schema: PLAN_SCHEMA,
      intentText: spec.intent && spec.intent.prompt || spec.name,
      kind,
      intentState: {
        layerFocus: contract.layerFocus || 'custom',
        layoutMode: contract.layout ? contract.layout.grammar : 'freeform',
        topLevel: contract.topLevel || [],
      },
      stageTrace,
      fidelity: { score: 88, notes: [] },
      materials: { ...MATERIAL_STYLES },
      objects: [],
      relations: [],
      fields: [],
      emitters: [],
      camera: { framing: '2d-plan', padding: 0.08 },
    };
  }

  function stage(name, data) {
    return { name, ...data };
  }

  function addObject(plan, id, kind, material, pose, opts = {}) {
    plan.objects.push({
      id,
      kind,
      material,
      role: opts.role || kind,
      shape: opts.shape || kind,
      pose: { ...pose },
      dynamics: { ...(opts.dynamics || {}) },
      required: opts.required !== false,
    });
  }

  function addRelation(plan, from, to, channel, opts = {}) {
    plan.relations.push({ from, to, channel, strength: opts.strength ?? 1, reason: opts.reason || channel });
  }

  function addField(plan, id, kind, opts = {}) {
    plan.fields.push({ id, kind, ...opts });
  }

  function addEmitter(plan, id, kind, opts = {}) {
    plan.emitters.push({ id, kind, ...opts });
  }

  function finalizePlan(plan) {
    plan.stageTrace.push(stage('spatial_constraint_solve', {
      objects: plan.objects.length,
      relations: plan.relations.length,
      layout: plan.intentState.layoutMode,
    }));
    plan.stageTrace.push(stage('simulation_program', {
      fields: plan.fields.length,
      emitters: plan.emitters.length,
      dynamicObjects: plan.objects.filter((object) => Object.keys(object.dynamics || {}).length).length,
    }));
    plan.stageTrace.push(stage('renderer_plan', {
      shapes: uniqueList(plan.objects.map((object) => object.shape)).length,
      materials: uniqueList(plan.objects.map((object) => object.material)).length,
    }));
    plan.fidelity.score = clamp(86 + plan.objects.length * 0.7 + plan.relations.length * 0.25, 88, 98);
    plan.fidelity.notes = [
      `${plan.objects.length} planned bodies`,
      `${plan.fields.length} active fields`,
      `${plan.relations.length} physical links`,
    ];
    return plan;
  }

  function buildMagneticMachine(plan, spec) {
    const p = spec.params || {};
    addObject(plan, 'solar-panel', 'source', 'light', rect(0.11, 0.2, 0.16, 0.12, -0.12), {
      role: 'bounded solar input',
      shape: 'panel',
      dynamics: { irradiance: p.irradiance || 780 },
    });
    addObject(plan, 'rotor-wheel', 'body', 'metal', circle(0.5, 0.52, 0.18), {
      role: 'rotating inertial wheel',
      shape: 'wheel',
      dynamics: { inertia: p.wheelInertia || 0.72, rpm: 0 },
    });
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      addObject(plan, `rotor-magnet-${i + 1}`, 'magnet', 'magnet', {
        x: 0.5 + Math.cos(a) * 0.16,
        y: 0.52 + Math.sin(a) * 0.16,
        w: 0.035,
        h: 0.07,
        rotation: a,
      }, { role: i % 2 ? 'south pole segment' : 'north pole segment', shape: 'magnet' });
      addRelation(plan, `rotor-magnet-${i + 1}`, 'rotor-wheel', 'torque');
    }
    addObject(plan, 'stator-slider', 'actuator', 'magnet', rect(0.78, 0.52, 0.15, 0.08, 0), {
      role: 'timed magnetic stator',
      shape: 'slider',
      dynamics: { amplitude: p.sliderAmplitude || 0.42, phase: p.sliderPhase || 0.18 },
    });
    addObject(plan, 'motor-load', 'sink', 'metal', rect(0.52, 0.82, 0.18, 0.08, 0), {
      role: 'explicit electrical load',
      shape: 'load',
      dynamics: { torque: p.loadTorque || 0.16 },
    });
    addObject(plan, 'energy-ledger', 'ledger', 'glass', rect(0.17, 0.79, 0.19, 0.1, 0), {
      role: 'conservation accounting',
      shape: 'meter',
    });
    addRelation(plan, 'solar-panel', 'stator-slider', 'energy');
    addRelation(plan, 'stator-slider', 'rotor-wheel', 'magnetic-force');
    addRelation(plan, 'rotor-wheel', 'motor-load', 'mechanical-work');
    addRelation(plan, 'motor-load', 'energy-ledger', 'receipt');
    addField(plan, 'sun-rays', 'radiation', { from: [0.03, 0.05], to: [0.3, 0.28], strength: p.irradiance / 1200 || 0.65 });
    addField(plan, 'magnetic-field', 'dipole', { center: [0.61, 0.52], radius: 0.28, strength: p.magneticStrength || 0.62 });
  }

  function buildForestFire(plan, spec) {
    const p = spec.params || {};
    addObject(plan, 'fuel-bed', 'material', 'wood', rect(0.39, 0.6, 0.48, 0.18, -0.04), {
      role: 'dry wood and biomass fuel bed',
      shape: 'fuel-bed',
      dynamics: { fuel: p.combustibility || 0.76, moisture: p.moisture || 0.28 },
    });
    addObject(plan, 'burn-front', 'process', 'fire', rect(0.43, 0.55, 0.25, 0.18, 0.08), {
      role: 'combustion front',
      shape: 'flame-front',
      dynamics: { temperature: p.heatTransfer || 0.5 },
    });
    addObject(plan, 'smoke-plume', 'material', 'smoke', rect(0.46, 0.31, 0.26, 0.24, -0.1), {
      role: 'buoyant smoke plume',
      shape: 'plume',
    });
    addObject(plan, 'wind-field', 'field', 'air', rect(0.2, 0.38, 0.22, 0.12, 0), {
      role: 'wind advection',
      shape: 'vector-band',
      dynamics: { speed: p.windSpeed || p.flowRate || 0.24 },
    });
    addObject(plan, 'water-line', 'source', 'water', path([[0.12, 0.78], [0.32, 0.71], [0.58, 0.75]]), {
      role: 'suppression stream',
      shape: 'flow-path',
      dynamics: { flow: p.flowRate || 0.2 },
    });
    addObject(plan, 'rock-wall', 'constraint', 'rock', rect(0.76, 0.58, 0.08, 0.36, 0.04), {
      role: 'hard fire break',
      shape: 'wall',
    });
    addRelation(plan, 'fuel-bed', 'burn-front', 'fuel');
    addRelation(plan, 'wind-field', 'burn-front', 'advection');
    addRelation(plan, 'water-line', 'burn-front', 'suppression');
    addRelation(plan, 'rock-wall', 'burn-front', 'containment');
    addField(plan, 'heat-gradient', 'thermal', { center: [0.46, 0.56], radius: 0.32, strength: p.heatTransfer || 0.5 });
    addEmitter(plan, 'embers', 'particles', { source: 'burn-front', material: 'fire', rate: 0.56 });
    addEmitter(plan, 'smoke', 'plume', { source: 'smoke-plume', material: 'smoke', rate: 0.48 });
  }

  function buildWatershed(plan, spec) {
    const p = spec.params || {};
    addObject(plan, 'terrain-heightfield', 'terrain', 'soil', rect(0.12, 0.18, 0.74, 0.64, 0), {
      role: 'sloped terrain',
      shape: 'heightfield',
      dynamics: { slope: p.terrainSlope || 0.28 },
    });
    addObject(plan, 'river-channel', 'material', 'water', path([[0.2, 0.22], [0.35, 0.39], [0.48, 0.54], [0.72, 0.76]]), {
      role: 'flowing river',
      shape: 'flow-path',
      dynamics: { flow: p.flowRate || 0.45 },
    });
    addObject(plan, 'eroding-bank', 'process', 'sand', rect(0.38, 0.52, 0.18, 0.12, 0.45), {
      role: 'sediment source',
      shape: 'bank-cut',
      dynamics: { erosion: p.erosionRate || 0.22 },
    });
    addObject(plan, 'rock-ridge', 'constraint', 'rock', rect(0.16, 0.28, 0.24, 0.09, -0.35), {
      role: 'resistant ridge',
      shape: 'ridge',
    });
    addRelation(plan, 'terrain-heightfield', 'river-channel', 'gravity-slope');
    addRelation(plan, 'river-channel', 'eroding-bank', 'shear');
    addRelation(plan, 'rock-ridge', 'river-channel', 'boundary');
    addField(plan, 'downhill-flow', 'gravity', { from: [0.18, 0.18], to: [0.76, 0.82], strength: p.gravity || 0.18 });
    addEmitter(plan, 'sediment-particles', 'particles', { source: 'eroding-bank', material: 'sand', rate: 0.44 });
  }

  function buildOpticsBench(plan, spec) {
    const p = spec.params || {};
    addObject(plan, 'bench', 'constraint', 'metal', rect(0.14, 0.66, 0.72, 0.06, 0), {
      role: 'optics rail',
      shape: 'rail',
    });
    addObject(plan, 'sun-lamp', 'source', 'light', circle(0.16, 0.47, 0.055), {
      role: 'collimated light source',
      shape: 'lamp',
      dynamics: { intensity: p.lightIntensity || 0.56 },
    });
    addObject(plan, 'glass-lens', 'body', 'glass', rect(0.38, 0.47, 0.05, 0.22, 0), {
      role: 'convex refractor',
      shape: 'lens',
      dynamics: { refractiveIndex: p.refractiveIndex || 1.52 },
    });
    addObject(plan, 'prism', 'body', 'glass', rect(0.56, 0.48, 0.11, 0.11, 0.72), {
      role: 'spectrum splitter',
      shape: 'prism',
    });
    addObject(plan, 'mirror', 'constraint', 'metal', rect(0.72, 0.43, 0.14, 0.025, -0.45), {
      role: 'reflector',
      shape: 'mirror',
    });
    addObject(plan, 'sensor', 'sensor', 'metal', rect(0.84, 0.56, 0.07, 0.12, 0), {
      role: 'light measurement plane',
      shape: 'sensor',
    });
    addRelation(plan, 'sun-lamp', 'glass-lens', 'light');
    addRelation(plan, 'glass-lens', 'prism', 'focused-light');
    addRelation(plan, 'prism', 'sensor', 'spectrum');
    addRelation(plan, 'mirror', 'sensor', 'reflected-light');
    addField(plan, 'light-rays', 'optical-rays', { from: [0.16, 0.47], to: [0.84, 0.56], strength: p.lightIntensity || 0.56 });
  }

  function buildCityGrid(plan, spec) {
    const p = spec.params || {};
    const roads = [
      ['road-east-1', [[0.12, 0.26], [0.78, 0.26]]],
      ['road-east-2', [[0.12, 0.55], [0.78, 0.55]]],
      ['road-north-1', [[0.2, 0.18], [0.2, 0.72]]],
      ['road-north-2', [[0.42, 0.18], [0.42, 0.84]]],
      ['road-north-3', [[0.64, 0.18], [0.64, 0.72]]],
    ];
    for (const [id, points] of roads) {
      addObject(plan, id, 'path', 'rock', path(points), {
        role: 'street corridor',
        shape: 'flow-path',
        required: false,
      });
    }
    const blocks = [
      ['block-a', 0.3, 0.39, 0.12, 0.12],
      ['block-b', 0.54, 0.39, 0.12, 0.12],
      ['block-c', 0.3, 0.7, 0.12, 0.1],
      ['block-d', 0.55, 0.72, 0.14, 0.1],
    ];
    for (const [id, x, y, w, h] of blocks) {
      addObject(plan, id, 'body', 'glass', rect(x, y, w, h, 0), {
        role: 'load block',
        shape: 'building-block',
        required: false,
      });
    }
    const nodes = [
      ['source-a', 0.2, 0.26, 'source'],
      ['junction-a', 0.42, 0.26, 'node'],
      ['market-queue', 0.64, 0.26, 'queue'],
      ['junction-b', 0.2, 0.55, 'node'],
      ['signal-controller', 0.42, 0.55, 'controller'],
      ['load-zone', 0.64, 0.55, 'sink'],
      ['power-grid', 0.42, 0.78, 'grid'],
    ];
    for (const [id, x, y, kind] of nodes) {
      const material = kind === 'queue' ? 'glass' : kind === 'grid' ? 'metal' : 'rock';
      addObject(plan, id, kind, material, circle(x, y, kind === 'queue' ? 0.065 : 0.052), {
        role: kind === 'queue' ? 'backlog and service node' : 'network node',
        shape: kind === 'queue' ? 'queue-node' : 'network-node',
        dynamics: { backlog: kind === 'queue' ? p.queueBacklog || 0.34 : 0 },
      });
    }
    addRelation(plan, 'source-a', 'junction-a', 'flow');
    addRelation(plan, 'junction-a', 'market-queue', 'arrivals');
    addRelation(plan, 'junction-b', 'signal-controller', 'signal');
    addRelation(plan, 'signal-controller', 'load-zone', 'service');
    addRelation(plan, 'power-grid', 'market-queue', 'energy');
    addRelation(plan, 'market-queue', 'load-zone', 'throughput');
    addField(plan, 'route-network', 'network-flow', { strength: p.serviceRate || 0.58 });
    addEmitter(plan, 'queue-tokens', 'packets', { source: 'market-queue', material: 'light', rate: p.queueBacklog || 0.34 });
  }

  function buildMaterialBench(plan, spec) {
    const ids = (spec.objects || [])
      .filter((object) => object.layer === 'material' || MATERIAL_STYLES[object.id])
      .map((object) => object.id)
      .slice(0, 12);
    const materials = ids.length ? ids : ['water', 'wood', 'metal', 'glass', 'rock', 'sand'];
    materials.forEach((id, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      addObject(plan, id, 'material', materialKey(id), rect(0.18 + col * 0.18, 0.27 + row * 0.2, 0.12, 0.1, 0), {
        role: `${id.replace(/-/g, ' ')} sample`,
        shape: sampleShape(id),
        dynamics: { mass: 0.4 + hashNoise(41, index) * 0.4 },
      });
    });
    addField(plan, 'test-force-field', 'material-test', { center: [0.52, 0.5], radius: 0.42, strength: 0.5 });
  }

  function buildFreeform(plan, spec) {
    const objects = (spec.objects || []).slice(0, 16);
    const total = Math.max(1, objects.length);
    objects.forEach((object, index) => {
      const a = (index / total) * Math.PI * 2 - Math.PI / 2;
      const r = 0.18 + (index % 4) * 0.045;
      addObject(plan, object.id, object.type || 'body', materialForObject(object), {
        x: 0.52 + Math.cos(a) * r,
        y: 0.52 + Math.sin(a) * r,
        w: 0.08,
        h: 0.07,
        rotation: a + Math.PI / 2,
      }, {
        role: object.role || object.id,
        shape: shapeForObject(object),
        dynamics: object.state || {},
      });
      if (index > 0) addRelation(plan, objects[index - 1].id, object.id, 'coupled-state', { strength: 0.45 });
    });
    addObject(plan, 'world-field', 'field', 'light', circle(0.52, 0.52, 0.28), {
      role: 'resolved field envelope',
      shape: 'field-envelope',
      required: false,
    });
    addField(plan, 'combined-forces', 'force-field', { center: [0.52, 0.52], radius: 0.32, strength: 0.5 });
  }

  function materialKey(id) {
    if (/water|river|lake/.test(id)) return 'water';
    if (/wood|biomass|fuel/.test(id)) return 'wood';
    if (/glass|lens|prism/.test(id)) return 'glass';
    if (/magnet/.test(id)) return 'magnet';
    if (/metal|motor|generator|wheel/.test(id)) return 'metal';
    if (/sand/.test(id)) return 'sand';
    if (/soil|terrain/.test(id)) return 'soil';
    if (/fire|flame|plasma/.test(id)) return 'fire';
    if (/smoke/.test(id)) return 'smoke';
    if (/rock|wall/.test(id)) return 'rock';
    return 'light';
  }

  function materialForObject(object) {
    return materialKey(`${object.id || ''} ${object.role || ''} ${object.type || ''}`);
  }

  function shapeForObject(object) {
    const text = `${object.id || ''} ${object.role || ''} ${object.type || ''}`.toLowerCase();
    if (/wheel|rotor|gear/.test(text)) return 'wheel';
    if (/lens/.test(text)) return 'lens';
    if (/prism/.test(text)) return 'prism';
    if (/river|flow|pipe|channel/.test(text)) return 'flow-path';
    if (/queue|network|graph/.test(text)) return 'network-node';
    if (/field/.test(text)) return 'field-envelope';
    if (/wall|boundary|constraint/.test(text)) return 'wall';
    return object.type === 'material' ? sampleShape(object.id) : 'body';
  }

  function sampleShape(id) {
    if (/water|oil|steam|smoke/.test(id)) return 'pool';
    if (/glass|ice/.test(id)) return 'lens';
    if (/metal|magnet/.test(id)) return 'bar';
    if (/sand|soil|clay|rock/.test(id)) return 'grain-bed';
    if (/wood|fabric|rubber/.test(id)) return 'slab';
    if (/fire|plasma/.test(id)) return 'flame-front';
    return 'sample';
  }

  function circle(x, y, r) {
    return { x, y, r };
  }

  function rect(x, y, w, h, rotation = 0) {
    return { x, y, w, h, rotation };
  }

  function path(points) {
    return { points };
  }

  function buildWorldPlan(spec) {
    if (!spec || spec.templateId === 'blank-world') return null;
    const kind = planKindForSpec(spec);
    const plan = basePlan(spec, kind);
    if (kind === 'magnetic-machine') buildMagneticMachine(plan, spec);
    else if (kind === 'forest-fire') buildForestFire(plan, spec);
    else if (kind === 'watershed') buildWatershed(plan, spec);
    else if (kind === 'optics-bench') buildOpticsBench(plan, spec);
    else if (kind === 'city-grid') buildCityGrid(plan, spec);
    else if (kind === 'material-bench') buildMaterialBench(plan, spec);
    else buildFreeform(plan, spec);
    return finalizePlan(plan);
  }

  return {
    MATERIAL_STYLES,
    PLAN_SCHEMA,
    buildWorldPlan,
    planKindForSpec,
  };
});
