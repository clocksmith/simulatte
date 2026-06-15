(function attachSimulatteCompositionGraph(root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteCompositionGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCompositionGraphApi(catalog) {
  const {
    clamp,
    hashNoise,
    uniqueList,
  } = catalog;

  const COMPOSITION_SCHEMA = 'simulatte.compositionGraph.v1';
  const RENDER_PROGRAM_SCHEMA = 'simulatte.renderProgram.v1';

  const MATERIAL_STYLES = Object.freeze({
    air: style('#dff7ff', '#76c7e7', 0.18),
    biomass: style('#5a8f52', '#2f6130', 0.72),
    fire: style('#ff8f4f', '#c65361', 0.68),
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

  function buildCompositionGraph(spec = {}) {
    const intent = spec.intent || {};
    const contract = spec.contract || {};
    const graph = contract.graph || {};
    const priors = selectionPriors(intent);
    const selected = selectGraphNodes(spec, priors);
    const nodes = selected.map((component, index) => (
      compositionNode(component, index, selected.length, spec, contract, priors)
    ));
    const relations = compositionRelations(nodes, graph);
    const operators = (graph.operators || []).map((operator) => ({
      id: operator.id,
      inputs: operator.inputs || [],
      outputs: operator.outputs || [],
    }));
    return {
      schema: COMPOSITION_SCHEMA,
      graphId: `${spec.id || 'sim'}-cg`,
      intentText: intent.prompt || spec.name || '',
      nodes,
      relations,
      operators,
      priors,
      provenance: {
        composer: 'simulatte.grid-like-composition.v1',
        source: 'concept-graph-selection-priors',
        conceptCount: Array.isArray(intent.conceptGraph) ? intent.conceptGraph.length : 0,
        primitiveCount: nodes.length,
      },
    };
  }

  function selectionPriors(intent = {}) {
    const conceptGraph = Array.isArray(intent.conceptGraph) ? intent.conceptGraph : [];
    return conceptGraph
      .map((concept, index) => ({
        primitiveId: concept.id,
        score: Number.isFinite(Number(concept.score)) ? Number(concept.score) : 0,
        domains: concept.domains || [],
        rank: index,
      }))
      .sort((a, b) => b.score - a.score || a.rank - b.rank);
  }

  function selectGraphNodes(spec, priors) {
    const components = Array.isArray(spec.objects) ? spec.objects : [];
    const byId = new Map(components.map((component) => [component.id, component]));
    const top = spec.contract && Array.isArray(spec.contract.topLevel) ? spec.contract.topLevel : [];
    const selected = [];
    for (const id of top) {
      if (byId.has(id) && !selected.includes(byId.get(id))) selected.push(byId.get(id));
    }
    for (const prior of priors) {
      if (selected.length >= 24) break;
      const component = byId.get(prior.primitiveId);
      if (component && !selected.includes(component)) selected.push(component);
    }
    for (const component of components) {
      if (selected.length >= 24) break;
      if (!selected.includes(component)) selected.push(component);
    }
    return selected;
  }

  function compositionNode(component, index, total, spec, contract, priors) {
    const prior = priors.find((item) => item.primitiveId === component.id) || {};
    const graphNode = graphNodeFor(contract, component.id);
    return {
      nodeId: `cg${index + 1}`,
      primitiveId: component.id,
      type: component.type || 'body',
      layer: component.layer || inferLayer(component),
      role: component.role || component.id,
      score: prior.score || component.score || 0,
      material: materialForComponent(component),
      shape: shapeForComponent(component),
      placement: placementFor(component, index, total, spec, contract),
      params: { ...(component.params || {}) },
      state: graphNode ? graphNode.state || null : component.state || null,
      ports: component.ports || null,
    };
  }

  function graphNodeFor(contract, id) {
    const nodes = contract && contract.graph && Array.isArray(contract.graph.nodes)
      ? contract.graph.nodes
      : [];
    return nodes.find((node) => node.id === id) || null;
  }

  function compositionRelations(nodes, graph) {
    const valid = new Set(nodes.map((node) => node.primitiveId));
    const fromGraph = (graph.edges || [])
      .filter((edge) => valid.has(edge.from) && valid.has(edge.to))
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        channel: edge.channel || edge.kind || 'coupled-state',
        strength: Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : 0.64,
      }));
    if (fromGraph.length) return fromGraph.slice(0, 42);
    return nodes.slice(1).map((node, index) => ({
      from: nodes[index].primitiveId,
      to: node.primitiveId,
      channel: 'coupled-state',
      strength: 0.45,
    }));
  }

  function placementFor(component, index, total, spec, contract) {
    const grammar = contract && contract.layout ? contract.layout.grammar : 'freeform';
    const phase = hashNoise((spec.id || '').length + 17, index);
    const text = componentText(component);
    const radial = radialPlacement(index, total, phase);
    if (/wheel|rotor/.test(text)) return anchoredPlacement(0.5, 0.5, 0, index);
    if (/slider|stator|magnet/.test(text)) return anchoredPlacement(0.68, 0.42, -0.18, index);
    if (/solar|sun|lamp|panel/.test(text)) return anchoredPlacement(0.18, 0.18, 0.18, index);
    if (/load|generator|motor-load/.test(text)) return anchoredPlacement(0.78, 0.74, 0.12, index);
    if (grammar === 'bench') return linePlacement(index, total, 0.18, 0.46, 0.74);
    if (grammar === 'orthogonal network' || grammar === 'route graph' || grammar === 'network') {
      return gridPlacement(index);
    }
    if (grammar === 'flow path' || grammar === 'downhill channel') return flowPlacement(index, total);
    if (grammar === 'process line' || grammar === 'hub and queues' || grammar === 'supply demand loop') {
      return linePlacement(index, total, 0.14, 0.52 + Math.sin(index) * 0.08, 0.72);
    }
    if (grammar === 'patch spread') return patchPlacement(component, index, total, phase);
    return radial;
  }

  function anchoredPlacement(x, y, rotation, layer) {
    return { anchor: clampAnchor([x, y]), rotation, scale: 1, layer };
  }

  function clampAnchor(anchor) {
    return [clamp(anchor[0], 0.08, 0.92), clamp(anchor[1], 0.1, 0.9)];
  }

  function radialPlacement(index, total, phase) {
    const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
    const radius = 0.16 + (index % 5) * 0.038 + phase * 0.02;
    return {
      anchor: clampAnchor([0.52 + Math.cos(angle) * radius, 0.52 + Math.sin(angle) * radius]),
      rotation: angle + Math.PI / 2,
      scale: 1,
      layer: index,
    };
  }

  function linePlacement(index, total, left, y, width) {
    const t = total <= 1 ? 0.5 : index / (total - 1);
    return { anchor: clampAnchor([left + t * width, y + Math.sin(index) * 0.035]), rotation: 0, scale: 1, layer: index };
  }

  function gridPlacement(index) {
    const col = index % 5;
    const row = Math.floor(index / 5);
    return { anchor: clampAnchor([0.18 + col * 0.16, 0.26 + row * 0.16]), rotation: 0, scale: 1, layer: index };
  }

  function flowPlacement(index, total) {
    const t = total <= 1 ? 0.5 : index / (total - 1);
    return { anchor: clampAnchor([0.18 + t * 0.64, 0.24 + t * 0.52 + Math.sin(index) * 0.04]), rotation: 0.42, scale: 1, layer: index };
  }

  function patchPlacement(component, index, total, phase) {
    const text = componentText(component);
    if (/wind|air/.test(text)) return anchoredPlacement(0.2, 0.36, 0, index);
    if (/water|flow/.test(text)) return anchoredPlacement(0.28, 0.74, -0.18, index);
    if (/wall|rock/.test(text)) return anchoredPlacement(0.76, 0.56, 0.08, index);
    const t = total <= 1 ? 0.5 : index / (total - 1);
    return { anchor: clampAnchor([0.38 + t * 0.2, 0.55 + (phase - 0.5) * 0.12]), rotation: 0.04, scale: 1, layer: index };
  }

  function compileCompositionToRenderProgram(graph = null, spec = {}) {
    if (!graph || graph.schema !== COMPOSITION_SCHEMA) return null;
    const objects = graph.nodes.map((node) => renderObjectForNode(node, spec));
    const relations = graph.relations.map((relation) => ({
      ...relation,
      reason: relation.channel,
    }));
    return {
      schema: RENDER_PROGRAM_SCHEMA,
      sourceGraphId: graph.graphId,
      intentText: graph.intentText,
      materials: { ...MATERIAL_STYLES },
      objects,
      relations,
      fields: fieldsForComposition(graph, spec),
      emitters: emittersForComposition(graph),
      camera: { framing: 'composition-2d', padding: 0.08 },
      provenance: {
        compiler: 'simulatte.composition-to-render-program.v1',
        nodeCount: graph.nodes.length,
        relationCount: graph.relations.length,
        operatorCount: graph.operators.length,
        signature: uniqueList(graph.nodes.map((node) => node.shape)).join('+'),
      },
    };
  }

  function renderObjectForNode(node, spec) {
    const pose = poseForNode(node, spec);
    return {
      id: node.primitiveId,
      kind: node.type,
      material: node.material,
      role: node.role,
      shape: node.shape,
      pose,
      dynamics: { ...(node.state || {}), ...(node.params || {}) },
      required: true,
    };
  }

  function poseForNode(node, spec) {
    const [x, y] = node.placement.anchor || [0.5, 0.5];
    const base = sizeForNode(node, spec);
    if (node.shape === 'flow-path') {
      return { points: [[x - 0.08, y - 0.04], [x, y], [x + 0.12, y + 0.04]] };
    }
    return { x, y, w: base[0], h: base[1], rotation: node.placement.rotation || 0 };
  }

  function sizeForNode(node, spec) {
    const density = clamp(Number(spec.params && spec.params.complexity || 0.5), 0, 1);
    if (node.shape === 'wheel') return [0.24, 0.24];
    if (node.shape === 'heightfield') return [0.64, 0.46];
    if (node.shape === 'queue-node' || node.shape === 'network-node') return [0.08, 0.08];
    if (node.shape === 'field-envelope') return [0.24 + density * 0.16, 0.24 + density * 0.16];
    if (node.layer === 'material') return [0.11, 0.09];
    return [0.1, 0.08];
  }

  function fieldsForComposition(graph, spec) {
    const operatorIds = new Set(graph.operators.map((operator) => operator.id));
    const fields = [];
    if (operatorIds.has('magnetism')) {
      fields.push({ id: 'magnetic-composition-field', kind: 'dipole', center: [0.58, 0.52], radius: 0.3, strength: spec.params.magneticStrength || 0.62 });
    }
    if (operatorIds.has('radiation')) {
      fields.push({ id: 'radiation-composition-field', kind: 'radiation', from: [0.03, 0.06], to: [0.3, 0.28], strength: (spec.params.irradiance || 780) / 1200 });
    }
    if (operatorIds.has('combustion') || operatorIds.has('heatTransfer')) {
      fields.push({ id: 'thermal-composition-field', kind: 'thermal', center: [0.46, 0.56], radius: 0.32, strength: spec.params.heatTransfer || 0.5 });
    }
    if (operatorIds.has('refraction')) {
      fields.push({ id: 'optical-composition-field', kind: 'optical-rays', from: [0.16, 0.47], to: [0.84, 0.56], strength: spec.params.lightIntensity || 0.56 });
    }
    if (operatorIds.has('queueService')) {
      fields.push({ id: 'network-composition-flow', kind: 'network-flow', strength: spec.params.serviceRate || 0.58 });
    }
    if (operatorIds.has('erosion') || operatorIds.has('gravity')) {
      fields.push({ id: 'gravity-composition-flow', kind: 'gravity', from: [0.18, 0.18], to: [0.76, 0.82], strength: spec.params.gravity || 0.18 });
    }
    if (!fields.length) fields.push({ id: 'combined-composition-field', kind: 'force-field', center: [0.52, 0.52], radius: 0.32, strength: 0.5 });
    return fields;
  }

  function emittersForComposition(graph) {
    const operators = new Set(graph.operators.map((operator) => operator.id));
    const emitters = [];
    if (operators.has('combustion')) {
      const source = graph.nodes.find((node) => /combust|flame|fire/.test(node.primitiveId));
      if (source) {
        emitters.push({ id: 'composition-embers', kind: 'particles', source: source.primitiveId, material: 'fire', rate: 0.5 });
        emitters.push({ id: 'composition-smoke', kind: 'plume', source: source.primitiveId, material: 'smoke', rate: 0.42 });
      }
    }
    if (operators.has('erosion')) {
      const source = graph.nodes.find((node) => /erosion|sand|soil/.test(node.primitiveId));
      if (source) emitters.push({ id: 'composition-sediment', kind: 'particles', source: source.primitiveId, material: 'sand', rate: 0.38 });
    }
    return emitters;
  }

  function componentText(component) {
    return `${component && component.id || ''} ${component && component.type || ''} ${component && component.role || ''}`.toLowerCase();
  }

  function inferLayer(component) {
    const text = componentText(component);
    if (/water|wood|metal|glass|rock|sand|soil|air|smoke|fire/.test(text)) return 'material';
    if (/gravity|field|diffusion|collision|constraint/.test(text)) return 'physics';
    if (/queue|graph|source|sink|ledger|threshold|delay/.test(text)) return 'math';
    return component.type || 'component';
  }

  function materialForComponent(component) {
    const text = componentText(component);
    if (/water|river|lake/.test(text)) return 'water';
    if (/wood|biomass|fuel/.test(text)) return 'wood';
    if (/glass|lens|prism/.test(text)) return 'glass';
    if (/magnet/.test(text)) return 'magnet';
    if (/metal|motor|generator|wheel|rotor/.test(text)) return 'metal';
    if (/sand/.test(text)) return 'sand';
    if (/soil|terrain/.test(text)) return 'soil';
    if (/fire|flame|combust|plasma/.test(text)) return 'fire';
    if (/smoke/.test(text)) return 'smoke';
    if (/rock|wall/.test(text)) return 'rock';
    if (/air|wind/.test(text)) return 'air';
    return 'light';
  }

  function shapeForComponent(component) {
    const text = componentText(component);
    if (/forest-fire|fuel bed|biomass/.test(text)) return 'fuel-bed';
    if (/wheel|rotor|gear/.test(text)) return 'wheel';
    if (/slider|actuator/.test(text)) return 'slider';
    if (/magnet/.test(text)) return 'magnet';
    if (/solar|panel/.test(text)) return 'panel';
    if (/load|ledger|meter|recorder/.test(text)) return 'meter';
    if (/lens/.test(text)) return 'lens';
    if (/prism/.test(text)) return 'prism';
    if (/river|flow|pipe|channel|water-line/.test(text)) return 'flow-path';
    if (/queue/.test(text)) return 'queue-node';
    if (/network|graph|grid|signal/.test(text)) return 'network-node';
    if (/terrain|heightfield/.test(text)) return 'heightfield';
    if (/wall|boundary|constraint|ridge/.test(text)) return 'wall';
    if (/field/.test(text)) return 'field-envelope';
    if (/fire|flame|combust/.test(text)) return 'flame-front';
    if (/smoke|plume/.test(text)) return 'plume';
    if (component.layer === 'material') return sampleShape(component.id);
    return 'body';
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

  return {
    COMPOSITION_SCHEMA,
    MATERIAL_STYLES,
    RENDER_PROGRAM_SCHEMA,
    buildCompositionGraph,
    compileCompositionToRenderProgram,
  };
});
