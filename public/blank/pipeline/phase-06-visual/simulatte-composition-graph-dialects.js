(function attachSimulatteCompositionGraphDialects(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const DIALECT_DEFAULTS = Object.freeze({
      biology: ['biology/specimen', 'specimen', 'microscope-cutaway', 'microscopic'],
      'civic-market': ['civic-market/network-ledger', 'lattice', 'aerial-map', 'landscape'],
      'robotics-control': ['robotics-control/workcell', 'cutaway', 'lab-bench', 'human'],
      fire: ['fire/firefront', 'plume', 'section-elevation', 'architectural'],
      'ocean-cryosphere': ['ocean-cryosphere/ice-basin', 'basin', 'aerial-map', 'landscape'],
      'planetary-space': ['planetary-space/orbital', 'orbit', 'orbital-wide', 'orbital'],
      watershed: ['watershed/basin', 'basin', 'aerial-map', 'landscape'],
      'restoration-water': ['restoration-water/tidal-root-buffer', 'branching', 'aerial-map', 'landscape'],
      'material-tray': ['material-tray/specimen', 'specimen', 'lab-bench', 'microscopic'],
      'chemistry-lab': ['chemistry-lab/specimen', 'specimen', 'microscope-cutaway', 'microscopic'],
      acoustic: ['acoustic/waveguide', 'corridor', 'section-elevation', 'human'],
      optics: ['optics/optical-bench', 'corridor', 'lab-bench', 'human'],
      mechanical: ['mechanical/cutaway', 'cutaway', 'section-elevation', 'human'],
      'particle-instrument': ['particle-instrument/detector-slice', 'cutaway', 'section-elevation', 'human'],
      'quantum-instrument': ['quantum-instrument/resonator-readout', 'radial', 'microscope-cutaway', 'microscopic'],
    });

    function visualDialectPlanForGenome({
      sceneKind = '',
      objects = [],
      fields = [],
      solverPlan = null,
      semanticVisuals = null,
    } = {}) {
        const evidence = visualDialectEvidence(objects, fields, solverPlan, semanticVisuals);
        const candidates = visualDialectCandidates(sceneKind, evidence);
        const selected = candidates
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0] ||
          visualDialectFallback(sceneKind);
        return {
          schema: 'simulatte.visualDialectPlan.v1',
          source: 'compiled-phase4-to5-evidence',
          sceneKind,
          visualDialect: selected.id,
          compositionTopology: selected.compositionTopology,
          cameraArchetype: selected.cameraArchetype,
          scaleTier: selected.scaleTier,
          geometryGrammar: selected.geometryGrammar,
          layoutGrammar: selected.layoutGrammar,
          motionGrammar: selected.motionGrammar,
          paletteAnchor: selected.paletteAnchor,
          evidence: {
            schema: 'simulatte.visualDialectEvidence.v1',
            sourceMode: evidence.sourceMode,
            objectIds: evidence.objectIds,
            fieldIds: evidence.fieldIds,
            solverSteps: evidence.solverSteps,
            semanticRows: evidence.semanticRows,
            matchedTerms: selected.matchedTerms,
            candidateScores: candidates.map((row) => ({
              id: row.id,
              score: row.score,
              matchedTerms: row.matchedTerms,
            })),
          },
        };
      }

    function visualDialectEvidence(objects = [], fields = [], solverPlan = null, semanticVisuals = null) {
        const grounded = (objects || []).filter((row) => isPromptGroundedGenomeObject(row));
        const sourceObjects = grounded.length ? grounded : (objects || []);
        const solverSteps = uniqueList([
          ...((solverPlan && solverPlan.executableSteps) || []),
          ...((solverPlan && solverPlan.steps) || []).map((row) => (
            typeof row === 'string' ? row : row && (row.operatorType || row.type || row.id)
          )),
        ].filter(Boolean));
        const semanticRows = uniqueList([
          ...((semanticVisuals && semanticVisuals.archetypes) || []).map((row) => row.id),
          ...((semanticVisuals && semanticVisuals.materials) || []).map((row) => row.id),
          ...((semanticVisuals && semanticVisuals.processes) || []).map((row) => row.id),
        ].filter(Boolean));
        const text = [
          ...sourceObjects.map((row) => [
            row.id, row.role, row.phrase, row.shape, row.material, row.assembly,
            row.visualRegime, row.semanticRef, row.physicalRef, row.sourceLabel,
            ...(row.aliases || []),
            ...(row.construction && row.construction.partHints || []),
            ...(row.construction && row.construction.shapeHints || []),
          ].filter(Boolean).join(' ')),
          ...(fields || []).map((row) => [
            row.id, row.kind, row.channel, row.stateBinding, row.domainId,
          ].filter(Boolean).join(' ')),
          ...solverSteps,
          ...semanticRows,
        ].join(' ').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        return {
          text: ` ${text} `,
          sourceMode: grounded.length ? 'prompt-grounded-compiled-objects' : 'compiled-support-objects',
          objectIds: sourceObjects.map((row) => row.id).filter(Boolean).slice(0, 24),
          fieldIds: (fields || []).map((row) => row.id).filter(Boolean).slice(0, 16),
          solverSteps: solverSteps.slice(0, 20),
          semanticRows: semanticRows.slice(0, 20),
        };
      }

    function visualDialectCandidates(sceneKind = '', evidence = {}) {
        const candidates = [];
        const add = (id, compositionTopology, cameraArchetype, scaleTier, geometryGrammar, layoutGrammar, motionGrammar, paletteAnchor, terms) => {
          const matchedTerms = visualDialectMatchedTerms(evidence, terms);
          candidates.push({
            id,
            compositionTopology,
            cameraArchetype,
            scaleTier,
            geometryGrammar,
            layoutGrammar,
            motionGrammar,
            paletteAnchor,
            matchedTerms,
            score: matchedTerms.reduce((sum, row) => sum + row.weight, 0),
          });
        };
        if (sceneKind === 'robotics-control') {
          add('robotics-control/conveyor-logistics', 'conveyor', 'isometric-line', 'human', 'parallel-lanes-and-parcel-cells', 'parallel-lane-grid', 'packet-routing-pulse', 'industrial-amber-cyan', [
            ['conveyor', 5], ['parcel', 5], ['warehouse', 3], ['logistics', 3], ['sort', 2],
            ['backlog', 2], ['throughput', 2], ['network flow', 1],
          ]);
          add('robotics-control/precision-gripper', 'specimen', 'lab-cutaway', 'microscopic', 'articulated-gripper-and-constrained-specimen', 'central-specimen-stage', 'torsion-arc-and-contact-pulse', 'precision-violet-steel', [
            ['gripper', 5], ['sample holder', 5], ['protein', 4], ['twist', 3],
            ['torsion', 3], ['angular momentum', 3], ['rotational torque', 2], ['contact', 2],
          ]);
        }
        if (sceneKind === 'mechanical') {
          add('mechanical/common-world-interior', 'interior', 'ground-level', 'human', 'literal-object-silhouettes', 'room-plane', 'evidence-bound-object-motion', 'daylight-slate-warm', [
            ['chair', 5], ['table', 5], ['sofa', 5], ['lamp', 4], ['television', 4], ['building', 3], ['person', 3], ['shelf', 3],
          ]);
          add('mechanical/transport-infrastructure', 'corridor', 'wide-establishing', 'human', 'vehicle-and-infrastructure-silhouettes', 'travel-corridor', 'path-traverse-and-structure-response', 'sky-steel-asphalt', [
            ['airplane', 5], ['aircraft', 5], ['bicycle', 4], ['bridge', 4], ['road', 4], ['vehicle', 3], ['flight', 3],
          ]);
        }
        if (sceneKind === 'biology' || sceneKind === 'molecular-biology' || sceneKind === 'evolution-ecology') {
          add('biology/animal-gait', 'field-map', 'wide-establishing', 'landscape', 'limb-pairs-and-body-contours', 'gait-cell-field', 'stride-and-track-pairs', 'field-green-ochre', [
            ['dog', 5], ['cat', 5], ['animal', 4], ['mammal', 3], ['gait', 3], ['run', 2],
          ]);
          add('biology/plant-growth', 'radial', 'topographic-cutaway', 'landscape', 'petals-stems-and-vein-lattices', 'radial-growth-front', 'growth-front-and-vein-pulse', 'chlorophyll-green', [
            ['plant', 5], ['leaf', 4], ['root', 4], ['stem', 3], ['biomass', 2], ['growth decay', 2],
          ]);
          add('biology/microbiome', 'branching', 'microscope-cutaway', 'microscopic', 'colony-cells-and-membrane-rims', 'branching-colony-mesh', 'diffusion-and-colony-pulse', 'microbe-teal', [
            ['microbiome', 5], ['bacteria', 5], ['biofilm', 4], ['colony', 4], ['membrane', 3], ['nutrient', 2],
          ]);
          add('biology/fermentation', 'basin', 'lab-cutaway', 'microscopic', 'dough-matrix-and-bubble-volumes', 'vessel-basin', 'bubble-rise-and-acidity-front', 'ferment-amber', [
            ['fermentation', 5], ['dough', 4], ['yeast', 4], ['gluten', 3], ['acidity', 3], ['bubble', 2],
          ]);
          add('biology/protein-folding', 'specimen', 'microscope-cutaway', 'microscopic', 'chain-ribbons-and-constraint-rings', 'central-specimen-stage', 'constraint-torsion-and-energy-settle', 'protein-violet', [
            ['protein', 5], ['molecular', 4], ['bond', 4], ['enzyme', 3], ['energy minimization', 3],
          ]);
        }
        if (sceneKind === 'civic-market' || sceneKind === 'city') {
          add('civic-market/transit-dispatch', 'ladder', 'map-view', 'landscape', 'tracks-platforms-and-signal-blocks', 'parallel-track-ladder', 'headway-and-dispatch-pulse', 'transit-cyan-amber', [
            ['railway', 5], ['dispatch', 5], ['signal block', 4], ['train', 4], ['platform', 3], ['headway', 3],
          ]);
          add('civic-market/zoning-shadow', 'lattice', 'aerial-map', 'landscape', 'parcel-grids-and-building-masses', 'parcel-lattice-map', 'sun-path-and-comfort-isobands', 'solar-concrete-violet', [
            ['zoning', 5], ['sunlight', 4], ['pedestrian', 4], ['comfort', 3], ['building', 3], ['parcel', 2],
          ]);
          add('civic-market/crowd-flow', 'branching', 'map-view', 'landscape', 'agent-streams-and-entry-corridors', 'branching-corridor-map', 'crowd-flow-and-density-pulse', 'crowd-coral-indigo', [
            ['crowd', 5], ['pedestrian', 3], ['flow', 2], ['queue', 2], ['agent', 2],
          ]);
          add('civic-market/market-queue', 'stack', 'isometric-line', 'human', 'queue-cells-and-exchange-stations', 'stacked-market-cells', 'queue-pressure-and-trade-pulse', 'market-amber-blue', [
            ['market', 5], ['queue', 5], ['trade', 3], ['backlog', 3], ['throughput', 2],
          ]);
        }
        if (sceneKind === 'fire' || sceneKind === 'thermal-plume') {
          add('fire/structure-fire', 'cutaway', 'section-elevation', 'architectural', 'structural-silhouette-and-fire-compartments', 'building-cutaway', 'flame-front-and-evacuation-plume', 'fire-orange-charcoal', [
            ['building', 4], ['structure', 4], ['room', 3], ['wall', 3], ['fire', 3], ['flame', 3],
          ]);
          add('fire/forest-fire', 'field-map', 'aerial-map', 'landscape', 'tree-clusters-and-fireline-fronts', 'terrain-fire-map', 'firefront-and-wind-shear', 'wildfire-amber-green', [
            ['forest', 5], ['tree', 4], ['wildfire', 5], ['firefront', 3], ['wind', 2],
          ]);
          add('fire/industrial-heat', 'stack', 'section-elevation', 'architectural', 'kiln-fins-and-heat-exchanger-stacks', 'industrial-stack-section', 'thermal-plume-and-heat-isobands', 'kiln-orange-steel', [
            ['factory', 4], ['kiln', 5], ['metal', 2], ['thermal', 3], ['heat transfer', 3],
          ]);
        }
        if (sceneKind === 'ocean-cryosphere' || sceneKind === 'ocean') {
          add('ocean-cryosphere/glacier-calving', 'basin', 'aerial-map', 'landscape', 'fjord-walls-ice-shelf-and-calving-fractures', 'fjord-basin-map', 'calving-drop-and-wave-rings', 'ice-blue-slate', [
            ['glacier', 5], ['calving', 5], ['fjord', 5], ['sea ice', 4], ['ice', 3], ['wave', 2],
          ]);
          add('ocean-cryosphere/sediment-flow', 'basin', 'topographic-cutaway', 'landscape', 'delta-fans-and-sediment-bands', 'sediment-basin', 'advection-and-deposition-bands', 'sediment-aqua-ochre', [
            ['sediment', 5], ['delta', 4], ['erosion', 4], ['grain', 3], ['advection', 2],
          ]);
        }
        if (sceneKind === 'particle-instrument') {
          add('particle-instrument/detector-slice', 'cutaway', 'section-elevation', 'human', 'detector-layers-track-arcs-and-calorimeter-cells', 'concentric-detector-slice', 'collision-vertex-and-track-plume', 'detector-cyan-amber', [
            ['particle collider', 5], ['detector', 5], ['muon', 5], ['calorimeter', 4], ['track', 3], ['field line', 2],
          ]);
        }
        if (sceneKind === 'quantum-instrument') {
          add('quantum-instrument/resonator-readout', 'radial', 'microscope-cutaway', 'microscopic', 'chip-cells-resonator-rings-and-phase-fringes', 'central-resonator-chip', 'phase-readout-and-microwave-pulse', 'quantum-violet-cyan', [
            ['qubit', 5], ['microwave resonator', 5], ['resonator', 4], ['readout', 4], ['measurement', 3], ['phase', 2],
          ]);
        }
        if (sceneKind === 'watershed' || sceneKind === 'restoration-water') {
          add('watershed/animal-swim', 'basin', 'topographic-cutaway', 'landscape', 'limb-pairs-waterline-contours-and-submerged-bodies', 'waterline-basin', 'stroke-and-wake-pairs', 'field-green-ochre', [
            ['dog', 5], ['cat', 5], ['animal', 4], ['swimming', 4], ['fluid locomotion', 3], ['wake generation', 2],
          ]);
        }
        if (sceneKind === 'restoration-water') {
          add('restoration-water/tidal-root-buffer', 'branching', 'aerial-map', 'landscape', 'mangrove-root-lattice-and-tidal-channel-bands', 'branching-tidal-delta', 'surge-attenuation-and-sediment-settling', 'mangrove-teal-ochre', [
            ['mangrove', 5], ['root', 4], ['tidal channel', 4], ['storm surge', 4],
            ['sediment', 3], ['brackish', 3], ['settling', 2], ['advection', 1],
          ]);
        }
        return candidates;
      }

    function visualDialectMatchedTerms(evidence = {}, terms = []) {
        return terms
          .filter(([term]) => evidence.text.includes(` ${String(term).replace(/[_-]+/g, ' ')} `))
          .map(([term, weight]) => ({ term, weight }));
      }

    function visualDialectFallback(sceneKind = '') {
        const row = DIALECT_DEFAULTS[sceneKind] || ['generic/compiled-scene', 'specimen', 'instrument-panel', 'human'];
        return {
          id: row[0],
          compositionTopology: row[1],
          cameraArchetype: row[2],
          scaleTier: row[3],
          geometryGrammar: 'compiled-object-silhouettes',
          layoutGrammar: row[1],
          motionGrammar: 'compiled-process-motion',
          paletteAnchor: sceneKind || 'compiled-neutral',
          matchedTerms: [],
          score: 0,
        };
      }

    function genomeCompositionTopology(sceneKind, _motifs, objects, fields, _seed, solverPlan = null, semanticVisuals = null) {
        return visualDialectPlanForGenome({ sceneKind, objects, fields, solverPlan, semanticVisuals }).compositionTopology;
      }

    function genomeScaleTier(sceneKind, objects, fields = [], solverPlan = null, semanticVisuals = null) {
        return visualDialectPlanForGenome({ sceneKind, objects, fields, solverPlan, semanticVisuals }).scaleTier;
      }

    function genomeCameraArchetype(scaleTier, compositionTopology, sceneKind, dialectPlan = null) {
        if (dialectPlan && dialectPlan.cameraArchetype) return dialectPlan.cameraArchetype;
        return visualDialectFallback(sceneKind).cameraArchetype ||
          (scaleTier === 'orbital' || compositionTopology === 'orbit' ? 'orbital-wide' : 'instrument-panel');
      }

    Object.assign(scope, {
      DIALECT_DEFAULTS,
      visualDialectPlanForGenome,
      visualDialectEvidence,
      visualDialectCandidates,
      visualDialectMatchedTerms,
      visualDialectFallback,
      genomeCompositionTopology,
      genomeScaleTier,
      genomeCameraArchetype,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
