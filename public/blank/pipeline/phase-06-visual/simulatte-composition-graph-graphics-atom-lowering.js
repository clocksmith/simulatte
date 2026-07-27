(function attachSimulatteCompositionGraphGraphicsAtomLowering(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');

  function visualGraphicsAtomsForIR(context) {
    if (scope.visualOperatorCompiler && typeof scope.visualOperatorCompiler.compileVisualGraphicsAtoms === 'function') {
      return scope.visualOperatorCompiler.compileVisualGraphicsAtoms(context);
    }
    return {
      schema: 'simulatte.graphicsAtomPlan.v1',
      atlas: 'simulatte.visualOperatorAtlas.v1',
      compiler: 'missing-visual-operator-compiler',
      atlasId: 'missing-runtime-atlas',
      source: 'fallback-graphics-atom-plan',
      mappings: [],
      geometry: [],
      fields: [],
      materials: [],
      processes: [],
      motion: [],
      camera: [],
      uniforms: {
        schema: 'simulatte.graphicsAtomUniforms.v1',
        order: [],
        values: [],
        bySlot: {},
      },
      wgslOperators: [],
      rejections: [],
      receipts: [],
    };
  }

  function bindGraphicsAtomsToEntities(entities = [], graphicsAtoms = {}) {
    return scope.visualOperatorCompiler.bindGraphicsAtomsToEntities(entities, graphicsAtoms);
  }

  function visualCameraWithGraphicsAtoms(camera = {}, atoms = [], entities = []) {
    return scope.visualOperatorCompiler.visualCameraWithGraphicsAtoms(camera, atoms, entities);
  }

  function visualMaterialsForGraphicsAtoms(atoms = []) {
    return (atoms || []).filter((atom) => !(atom.sourceObjectIds || []).length).map((atom, index) => {
      const family = materialFamilyForGraphicsAtom(atom.id);
      const hue = scope.hashProgram(atom.id || index) % 360;
      return {
        id: `atom:${atom.id}`,
        family,
        shader: shaderForGraphicsMaterialAtom(atom.id, family),
        fill: `hsl(${hue}, 70%, 62%)`,
        stroke: `hsl(${hue}, 58%, 30%)`,
        opacity: /transparent|vapor|fluid|glass/.test(atom.id) ? 0.34 : 0.52,
        roughness: scope.materialRoughness(family),
        emissive: /emissive|hot|flame|plasma|signal|spectral/.test(atom.id),
        evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
        status: 'accepted',
        confidence: 0.66,
        reason: 'graphics atom material compiled from accepted VisualIR operator mapping',
      };
    });
  }

  function materialFamilyForGraphicsAtom(id) {
    const text = String(id || '').toLowerCase();
    if (/hot|thermal|flame|plasma|emissive|heat/.test(text)) return 'thermal';
    if (/vapor|fluid|wet|ripple|water|pressure/.test(text)) return 'fluid';
    if (/transparent|glass|caustic|phase|crystal/.test(text)) return 'transparent';
    if (/metal|trace|coil|instrument|brushed/.test(text)) return 'metal';
    if (/bio|cell|fibrous|membrane/.test(text)) return 'biological';
    if (/granular|soil|strata/.test(text)) return 'granular';
    if (/signal|charged|monitor|electric/.test(text)) return 'electric';
    return 'matte';
  }

  function shaderForGraphicsMaterialAtom(id, family) {
    const text = String(id || '').toLowerCase();
    if (/hot|thermal|flame|emissive/.test(text)) return 'atom-emissive-gradient';
    if (/vapor|fluid|wet|ripple/.test(text)) return 'atom-volume-ripple';
    if (/caustic|transparent|glass|crystal/.test(text)) return 'atom-refractive-caustic';
    if (/signal|charged|trace|monitor/.test(text)) return 'atom-signal-trace';
    if (/fracture|deformed/.test(text)) return 'atom-stress-material';
    return scope.shaderForMaterialFamily(family);
  }

  function visualFieldsForGraphicsAtoms(atoms = [], sceneKind = '') {
    return (atoms || []).map((atom) => {
      const id = `atom-field:${atom.id}`;
      const kind = fieldKindForGraphicsAtom(atom.id);
      return {
        id,
        kind,
        channel: atom.id,
        visualEncoding: fieldEncodingForGraphicsAtom(atom.id, sceneKind),
        strength: Number((0.56 + (scope.hashProgram(atom.id) % 31) / 100).toFixed(2)),
        geometry: scope.visualFieldGeometry({ id, kind }, kind),
        evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
        atomId: atom.id,
        status: 'accepted',
        confidence: 0.66,
        reason: 'graphics atom field compiled from accepted VisualIR operator mapping',
      };
    });
  }

  function fieldKindForGraphicsAtom(id) {
    const text = String(id || '').toLowerCase();
    if (/heat|thermal|soot|latent/.test(text)) return 'thermal';
    if (/queue|network|setpoint|state|error/.test(text)) return 'network-flow';
    if (/velocity|pressure|flow/.test(text)) return 'flow';
    if (/stress|impulse|force|constraint/.test(text)) return 'force-field';
    if (/gravity|barycenter/.test(text)) return 'gravity';
    if (/phase|caustic|ray|optical/.test(text)) return 'optical-rays';
    if (/measurement|uncertainty|readout|telemetry|probe|sample/.test(text)) return 'measurement-field';
    if (/sediment|slope|granular|grain|soil|terrain/.test(text)) return 'granular-gradient';
    if (/nutrient|density|growth|bio|cell|membrane|organic/.test(text)) return 'biological-gradient';
    if (/acidity|acid|chemical|reaction|concentration/.test(text)) return 'chemical-gradient';
    if (/flux|charge|magnetic|electromagnetic/.test(text)) return 'dipole';
    return 'state-field';
  }

  function fieldEncodingForGraphicsAtom(id, sceneKind) {
    const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
    if (/heat|thermal|latent/.test(text)) return 'heat-isobands';
    if (/velocity|flow|slope|sediment/.test(text)) return 'topographic-streamlines';
    if (/stress|impulse|force/.test(text)) return 'vector-flux-lines';
    if (/gravity|barycenter|orbit/.test(text)) return 'ray-cone-caustics';
    if (/caustic|phase|ray|optical/.test(text)) return 'ray-cone-caustics';
    if (/measurement|uncertainty|readout|telemetry|probe|sample/.test(text)) return 'readout-bands';
    if (/queue|network|state/.test(text)) return 'node-link-pressure';
    return 'scalar-contours';
  }

  function visualProcessesForGraphicsAtoms(atoms = [], objects = [], sceneKind = '') {
    return (atoms || []).map((atom, index) => ({
      id: `atom-process:${atom.id}`,
      family: atom.id,
      operator: processOperatorForGraphicsAtom(atom.id, sceneKind),
      affects: affectedEntitiesForGraphicsAtom(atom.id, objects),
      motion: motionGrammarForGraphicsAtom(atom.id, sceneKind),
      evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
      order: 200 + index,
      atomId: atom.id,
      status: 'accepted',
      confidence: 0.64,
      reason: 'graphics atom process compiled from accepted VisualIR operator mapping',
    }));
  }

  function processOperatorForGraphicsAtom(id, sceneKind) {
    const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
    if (/thermal|heat|flame|phase/.test(text)) return 'thermal-front';
    if (/flow|transport|pressure|settling|erosion/.test(text)) return 'advected-particles';
    if (/orbit|wave|resonant|phase/.test(text)) return 'wave-or-orbit-trails';
    if (/feedback|routing|queue|control|measurement/.test(text)) return 'agent-routing-pulses';
    if (/growth|diffusion-limited|cell/.test(text)) return 'growth-diffusion-front';
    if (/fracture|contact|impulse|force/.test(text)) return 'constraint-impulse-arcs';
    if (/field|charge|flux|spark/.test(text)) return 'field-line-advection';
    return 'state-pulse-overlay';
  }

  function affectedEntitiesForGraphicsAtom(id, objects) {
    const text = String(id || '').toLowerCase();
    return (objects || []).filter((object) => {
      const row = scope.renderObjectText(object);
      if (/heat|thermal|phase|flame/.test(text)) return /heat|fire|lava|air|metal|steam|ice/.test(row);
      if (/flow|pressure|transport/.test(text)) return /flow|fluid|water|air|pipe|river|coolant/.test(row);
      if (/network|queue|control|feedback|measurement/.test(text)) return /sensor|network|queue|server|controller|agent/.test(row);
      if (/orbit|gravity/.test(text)) return /orbit|space|planet|rocket|body/.test(row);
      if (/fracture|stress|contact/.test(text)) return /wall|solid|bridge|body|impact|constraint/.test(row);
      return true;
    }).slice(0, 8).map((object) => object.id);
  }

  function motionGrammarForGraphicsAtom(id, sceneKind) {
    return scope.motionForProcessFamily(id, sceneKind);
  }

  function visualGeometryForGraphicsAtoms(atoms = [], sceneKind = '') {
    return (atoms || []).filter((atom) => !(atom.sourceObjectIds || []).length).map((atom, index) => ({
      id: `geometry:atom:${scope.visualSafeId(atom.id)}`,
      entityId: `graphics-atom:${scope.visualSafeId(atom.id)}`,
      primitive: geometryPrimitiveForGraphicsAtom(atom.id, sceneKind),
      sceneKind,
      label: atom.label || atom.id,
      description: `Graphics atom ${atom.id}`,
      evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
      order: 200 + index,
      atomId: atom.id,
      status: 'accepted',
      confidence: 0.64,
      reason: 'graphics atom geometry compiled from accepted VisualIR operator mapping',
    }));
  }

  function geometryPrimitiveForGraphicsAtom(id, sceneKind) {
    const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
    if (/composition-topology.*(?:conveyor|ladder|lattice|branching)/.test(text)) return 'route-node-graph';
    if (/composition-topology.*(?:cutaway|stack|corridor|basin|field-map)/.test(text)) return 'sectioned-surface';
    if (/composition-topology.*specimen/.test(text)) return 'instrument-glyph';
    if (/composition-topology.*orbit/.test(text)) return 'orbital-body';
    if (/composition-topology.*radial/.test(text)) return 'optical-field-sheet';
    if (/node[-_ ]?link|graph|route|routing/.test(text)) return 'route-node-graph';
    if (/parcel|grid/.test(text)) return 'parcel-cell-grid';
    if (/agent|controller|feedback/.test(text)) return 'agent-token-swarm';
    if (/plume|volume|tube|flow|cloud|flame/.test(text)) return 'fluid-volume-ribbon';
    if (/sheet|surface|solid|strata|terrain|phase|fuel|wall/.test(text)) return 'sectioned-surface';
    if (/instrument|probe|readout|sensor|resonator/.test(text)) return 'instrument-glyph';
    if (/organic|cell|branch|membrane/.test(text)) return 'organic-silhouette';
    if (/orbit|gravity|trajectory|astral/.test(text)) return 'orbital-body';
    if (/ray|caustic|optical/.test(text)) return 'optical-field-sheet';
    if (/field|flux|pressure|stress/.test(text)) return 'scalar-field-sheet';
    return 'procedural-silhouette';
  }

  function visualMotionForGraphicsAtoms(atoms = [], visualGenome = {}, sceneKind = '') {
    return (atoms || []).filter((atom) => !(atom.sourceObjectIds || []).length).map((atom, index) => ({
      id: `motion:atom:${scope.visualSafeId(atom.id)}`,
      processId: `atom-process:${atom.id}`,
      grammar: motionGrammarForGraphicsAtom(atom.id, sceneKind),
      phase: index / Math.max(1, atoms.length),
      speed: scope.motionSpeedForScene(sceneKind, atom.id),
      density: Math.max(24, visualGenome && visualGenome.morphology
        ? visualGenome.morphology.particleDensity || 24
        : 24),
      atomId: atom.id,
      evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
      status: 'accepted',
      confidence: 0.62,
      reason: 'graphics atom motion compiled from accepted VisualIR operator mapping',
    }));
  }

  function uniqueVisualRows(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows || []) {
      const key = String(row && (row.id || row.atomId || row.family || row.kind) || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }

  function visualGeometryForCausalAffordances(affordances, sceneKind) {
    return (affordances || []).map((row, index) => ({
      id: `geometry:causal:${scope.visualSafeId(row.id || `affordance-${index + 1}`)}`,
      entityId: `affordance:${scope.visualSafeId(row.id || `affordance-${index + 1}`)}`,
      primitive: geometryPrimitiveForAffordance(row, sceneKind),
      sceneKind: row.sceneKind || sceneKind,
      label: row.id || `causal affordance ${index + 1}`,
      description: row.geometry || 'hand-authored causal visual affordance',
      shaderHints: row.shaderHints || [],
      motionHints: row.motionHints || [],
      causalRelationId: row.causalRelationId || '',
      evidence: [`causal-affordance:${row.id || index}`, row.causalRelationId || 'causal-relation'],
      order: 100 + index,
      status: 'accepted',
      confidence: 0.74,
      reason: 'causal affordance geometry accepted from grounded intent receipt',
    }));
  }

  function geometryPrimitiveForAffordance(row, sceneKind) {
    const text = `${row && row.geometry || ''} ${row && row.sceneKind || ''} ${sceneKind || ''}`.toLowerCase();
    if (/plume|steam|smoke|funnel|aurora|curtain|volume|cloud/.test(text)) return 'volume-ribbon';
    if (/orbit|ring|field|magnetic|pressure|wave|caustic|ray/.test(text)) return 'field-curve-set';
    if (/heightfield|terrain|delta|slope|soil|reef|glacier|ocean/.test(text)) return 'heightfield-slice';
    if (/network|queue|node|shard|warehouse|supply|controller/.test(text)) return 'node-link-volume';
    if (/tube|pipe|artery|droplet|channel|flow/.test(text)) return 'transparent-flow-tube';
    if (/robot|bridge|turbine|rotor|chip|metal|valve/.test(text)) return 'cutaway-machine';
    if (/protein|neuron|root|coral|biomass|algae/.test(text)) return 'organic-branch-volume';
    return 'semantic-3d-affordance';
  }

  root.SimulattePhaseModuleRegistry.define(
    'compositionGraph',
    'simulatte-composition-graph-graphics-atom-lowering.js',
    {
      visualGraphicsAtomsForIR,
      bindGraphicsAtomsToEntities,
      visualCameraWithGraphicsAtoms,
      visualMaterialsForGraphicsAtoms,
      materialFamilyForGraphicsAtom,
      shaderForGraphicsMaterialAtom,
      visualFieldsForGraphicsAtoms,
      fieldKindForGraphicsAtom,
      fieldEncodingForGraphicsAtom,
      visualProcessesForGraphicsAtoms,
      processOperatorForGraphicsAtom,
      affectedEntitiesForGraphicsAtom,
      motionGrammarForGraphicsAtom,
      visualGeometryForGraphicsAtoms,
      geometryPrimitiveForGraphicsAtom,
      visualMotionForGraphicsAtoms,
      uniqueVisualRows,
      visualGeometryForCausalAffordances,
      geometryPrimitiveForAffordance,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
