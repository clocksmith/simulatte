(function attachSimulatteCompositionGraphhelpers(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function sceneKindFromSemantics(graph, objects, fields, spec) {
        const direct = normalizedSceneHint(spec && spec.renderIR && spec.renderIR.sceneHint);
        if (direct && direct !== 'literal-composite') return direct;
        const registry = renderRegistryRef();
        if (registry && typeof registry.sceneHintForObjects === 'function') {
          const hint = normalizedSceneHint(registry.sceneHintForObjects(
            objects || [],
            (spec && spec.physicsIR) || {},
            (spec && spec.solverGraph) || {}
          ));
          if (hint && hint !== 'literal-composite') return hint;
        }
        return 'generic';
      }

    function resolveSceneKind(graph, objects, fields, spec) {
        const semantic = sceneKindFromSemantics(graph, objects, fields, spec);
        const promptText = directPromptSceneText((spec && spec.renderIR) || {}, spec || {});
        const objectText = (objects || []).map(renderObjectText).join(' ');
        const directScene = directSceneKindForText([promptText, objectText].join(' '), promptText);
        if (directScene && broadSceneHintCanYieldToDirectLanguage(semantic)) return directScene;
        if (semantic && semantic !== 'generic') return semantic;
        return sceneKindForComposition(graph, objects, fields, spec);
      }

    function sceneKindForComposition(graph, objects, fields, spec) {
        const operatorIds = new Set((graph.operators || []).map((operator) => operator.id));
        const promptText = compositionPromptText(graph, spec);
        const text = [
          promptText,
          (objects || []).map((object) => `${object.id} ${object.shape} ${object.role}`).join(' '),
          (fields || []).map((field) => field.kind).join(' '),
          Array.from(operatorIds).join(' '),
        ].join(' ').toLowerCase();
        if (/sample tray|material tray|raw material|materials|water air rock wood metal/.test(promptText)) {
          return 'material-tray';
        }
        if (/thermal plume|cooling fin|cooling fins/.test(promptText)) {
          return 'thermal-plume';
        }
        if (/ferrofluid|copper coil|pulsing current|magnetic spikes/.test(promptText)) {
          return 'ferrofluid';
        }
        if (hasThinFilmSignal(promptText)) {
          return 'thin-film';
        }
        if (hasAcousticWaveSignal(promptText)) {
          return 'acoustic';
        }
        if (/granular|beads|avalanche|sieve|powder/.test(promptText)) {
          return 'granular';
        }
        if (/\b(fire|flame|smoke|burn|burning|combust|wildfire|pine)\b|forest-fire/.test(promptText)) {
          return 'fire';
        }
        if (/projectile|crack|fracture|impact|collision/.test(promptText) && /tower|glass|wall|bridge|body/.test(promptText)) {
          return 'mechanical';
        }
        if (/storm waves|bridge cables|flex bridge|wave.*bridge|pressure wave/.test(promptText)) return 'acoustic';
        if (
          /rain carves|carves basalt|basalt delta|watershed|river|erosion|terrain|sediment|mountain|rain channel|sand|soil|rock ridges/.test(promptText) &&
          !/lava|magma|volcano|bridge|castle|mirror|spaceship|spacecraft|submarine|turbine/.test(promptText)
        ) {
          return 'watershed';
        }
        if (/algae grows|quartz wetland|grow|grows|growing|growth|biological|mycelium|bacteria|membrane|colony|infection|protein|fermentation|sourdough|gluten|dough|yeast/.test(promptText)) {
          return 'biology';
        }
        if (/solar magnetic|magnetic wheel|perpetual|magnetic motor|rotor|stator/.test(promptText)) {
          return 'magnetic-machine';
        }
        if (/\b(mouse|gerbil|hamster wheel|running wheel|crash|collision|impact)\b/.test(promptText)) {
          return 'mechanical';
        }
        if (/spaceship|spacecraft|rocket|submarine|volcano|lava|magma|piano|keyboard|castle|crystal tower|storm|turbine|algae|black hole|singularity|swamp|wetland|hammer|gold/.test(promptText)) {
          return 'literal-composite';
        }
        if (/city grid|traffic|market queue|feedback shock|power grid|queue|logistics/.test(promptText) || operatorIds.has('queueService')) {
          return 'city';
        }
        if (/acoustic|sound|pressure wave|waveguide|resonance|brass tube/.test(promptText)) {
          return 'acoustic';
        }
        if (/optics|prism|lens|mirror|laser|glass/.test(promptText) || operatorIds.has('refraction')) {
          return 'optics';
        }
        if (operatorIds.has('growthDecay')) {
          return 'biology';
        }
        if (hasRoboticsSignal(text)) return 'robotics-control';
        if (hasChemistryLabSignal(text)) return 'chemistry-lab';
        if (hasGranularCombustionSignal(text)) return 'granular';
        if (/thermal plume|cooling fin|heat plume/.test(text)) return 'thermal-plume';
        if (/ferrofluid|coil|current|copper conductor|magnetic spikes/.test(text)) return 'ferrofluid';
        if (hasThinFilmSignal(text)) return 'thin-film';
        if (hasAcousticWaveSignal(text)) return 'acoustic';
        if (/granular|grain-bed|bead|sieve|avalanche|powder/.test(text)) return 'granular';
        if (/flame|fuel-bed|fire-front|smoke|combust/.test(text)) return 'fire';
        if (/solar magnetic|magnetic-motor|rotor-wheel|stator-slider|dipole/.test(text) || operatorIds.has('magnetism')) {
          return 'magnetic-machine';
        }
        if (/acoustic|sound|wavefront|resonance|pressure/.test(text)) return 'acoustic';
        if (/sediment|terrain|basalt|delta/.test(text)) return 'watershed';
        if (/fluid|water|flow-path|advection|river/.test(text) || operatorIds.has('advection')) return 'watershed';
        if (/\b(atom|atomic|electron|ion|lattice|crystal)\b/.test(text)) return 'atomic';
        return 'generic';
      }

    function compositionPromptText(graph = {}, spec = {}) {
        const renderIR = spec.renderIR || {};
        const universeGraph = spec.universeGraph || {};
        const physicsIR = spec.physicsIR || {};
        const promptParse = spec.promptParse || {};
        return positiveLanguageText([
          renderIR.prompt,
          universeGraph.prompt,
          physicsIR.prompt,
          spec.name,
          graph.intentText,
          ...(promptParse.spans || []).map((span) => span.text),
        ].filter(Boolean).join(' '));
      }

    function hasAcousticWaveSignal(text = '') {
        const positive = positiveLanguageText(text);
        return /\b(acoustic|sound|standing wave|standing waves|pressure wave|pressure waves|waveguide|resonance|resonator|levitator|speaker|brass tube)\b/.test(positive) ||
          (/\b(dust|particle|particles)\b/.test(positive) &&
            /\b(levitate|levitator|standing|pressure|acoustic|sound|wave|tube|brass)\b/.test(positive));
      }

    function focusFieldsForScene(fields, sceneKind) {
        const registry = renderRegistryRef();
        const recipe = registry && typeof registry.recipeForScene === 'function'
          ? registry.recipeForScene(sceneKind)
          : null;
        if (recipe && Array.isArray(recipe.fieldKinds) && recipe.fieldKinds.length) {
          const wanted = new Set(recipe.fieldKinds);
          const focused = (fields || []).filter((field) => wanted.has(field.kind));
          if (focused.length) return focused;
          return recipe.fieldKinds.map((kind, index) => defaultFieldForKind(kind, index, sceneKind));
        }
        const allowed = {
          fire: ['thermal', 'gravity'],
          optics: ['optical-rays'],
          city: ['network-flow'],
          watershed: ['flow', 'gravity'],
          'magnetic-machine': ['dipole', 'radiation'],
          ferrofluid: ['dipole'],
          'thin-film': ['optical-rays'],
          granular: ['gravity'],
          'thermal-plume': ['thermal', 'gravity'],
          'material-tray': ['thermal', 'gravity'],
          biology: ['force-field'],
          mechanical: ['force-field', 'gravity'],
          'literal-composite': ['force-field', 'gravity'],
          acoustic: ['force-field'],
          fluid: ['gravity', 'force-field'],
          atomic: ['force-field'],
          generic: ['force-field'],
        };
        const wanted = new Set(allowed[sceneKind] || allowed.generic);
        const focused = (fields || []).filter((field) => wanted.has(field.kind));
        if (focused.length) return focused;
        if (sceneKind === 'optics' || sceneKind === 'thin-film') {
          return [{ id: 'scene-optical-rays', kind: 'optical-rays', from: [0.12, 0.46], to: [0.88, 0.56], strength: 0.72 }];
        }
        if (sceneKind === 'city') {
          return [{ id: 'scene-network-flow', kind: 'network-flow', strength: 0.72 }];
        }
        if (sceneKind === 'fire' || sceneKind === 'thermal-plume') {
          return [{ id: 'scene-thermal-field', kind: 'thermal', center: [0.5, 0.56], radius: 0.34, strength: 0.72 }];
        }
        if (sceneKind === 'magnetic-machine' || sceneKind === 'ferrofluid') {
          return [{ id: 'scene-dipole-field', kind: 'dipole', center: [0.54, 0.5], radius: 0.32, strength: 0.72 }];
        }
        if (sceneKind === 'watershed' || sceneKind === 'granular') {
          return [{ id: 'scene-gravity-flow', kind: 'gravity', from: [0.16, 0.16], to: [0.78, 0.84], strength: 0.68 }];
        }
        return [{ id: 'scene-force-field', kind: 'force-field', center: [0.52, 0.52], radius: 0.32, strength: 0.5 }];
      }

    function defaultFieldForKind(kind, index, sceneKind) {
        if (kind === 'network-flow') return { id: `scene-${sceneKind}-network-${index}`, kind, strength: 0.72 };
        if (kind === 'optical-rays') {
          return { id: `scene-${sceneKind}-rays-${index}`, kind, from: [0.1, 0.32], to: [0.88, 0.5], strength: 0.68 };
        }
        if (kind === 'gravity') {
          return { id: `scene-${sceneKind}-gravity-${index}`, kind, from: [0.18, 0.16], to: [0.78, 0.84], strength: 0.64 };
        }
        if (kind === 'flow') {
          return { id: `scene-${sceneKind}-flow-${index}`, kind, from: [0.14, 0.72], to: [0.86, 0.44], strength: 0.66 };
        }
        if (kind === 'thermal') {
          return { id: `scene-${sceneKind}-thermal-${index}`, kind, center: [0.52, 0.56], radius: 0.36, strength: 0.68 };
        }
        if (kind === 'dipole') {
          return { id: `scene-${sceneKind}-dipole-${index}`, kind, center: [0.54, 0.5], radius: 0.34, strength: 0.68 };
        }
        return { id: `scene-${sceneKind}-field-${index}`, kind, center: [0.52, 0.52], radius: 0.34, strength: 0.58 };
      }

    function dominantRegimeForScene(sceneKind, objects) {
        const registry = renderRegistryRef();
        const recipe = registry && typeof registry.recipeForScene === 'function'
          ? registry.recipeForScene(sceneKind)
          : null;
        if (recipe && recipe.dominantRegime) return recipe.dominantRegime;
        const map = {
          fire: 'thermal',
          optics: 'optical',
          city: 'network',
          watershed: 'fluid',
          'magnetic-machine': 'magnetic',
          ferrofluid: 'magnetic',
          'thin-film': 'optical',
          granular: 'granular',
          'thermal-plume': 'thermal',
          'material-tray': 'material',
          biology: 'biological',
          mechanical: 'mechanical',
          'literal-composite': 'composite',
          fluid: 'fluid',
          atomic: 'atomic',
          acoustic: 'acoustic',
          generic: 'generic',
        };
        if (map[sceneKind]) return map[sceneKind];
        const counts = new Map();
        for (const object of objects || []) {
          const key = object.visualRegime || 'generic';
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'generic';
      }

    function renderPassOrder(sceneKind, solverFamilies) {
        const registry = renderRegistryRef();
        const recipe = registry && typeof registry.recipeForScene === 'function'
          ? registry.recipeForScene(sceneKind)
          : null;
        if (recipe && Array.isArray(recipe.passOrder) && recipe.passOrder.length) return recipe.passOrder.slice();
        const shared = ['clear', 'world-field', 'solver-overlay', 'objects', 'emissions'];
        if (sceneKind === 'fire') return ['clear', 'fuel-terrain', 'heat-field', 'flame-front', 'smoke-embers'];
        if (sceneKind === 'optics') return ['clear', 'optical-rail', 'beam-trace', 'surfaces', 'caustics'];
        if (sceneKind === 'city') return ['clear', 'route-grid', 'queue-flow', 'service-pulses', 'ledger'];
        if (sceneKind === 'watershed') return ['clear', 'terrain-height', 'water-channel', 'sediment', 'erosion'];
        if (sceneKind === 'magnetic-machine') return ['clear', 'flux-field', 'rotor', 'stator', 'energy'];
        if (sceneKind === 'ferrofluid') return ['clear', 'coil-field', 'fluid-spikes', 'dipoles', 'objects'];
        if (sceneKind === 'thin-film') return ['clear', 'film-frame', 'interference', 'bubbles', 'wire'];
        if (sceneKind === 'granular') return ['clear', 'sieve', 'bead-stream', 'pile', 'contacts'];
        if (sceneKind === 'thermal-plume') return ['clear', 'cooling-fins', 'plume', 'smoke-shear', 'sensors'];
        if (sceneKind === 'material-tray') return ['clear', 'tray-field', 'specimens', 'interactions', 'composite'];
        if (sceneKind === 'biology') return ['clear', 'nutrient-field', 'membranes', 'growth-front', 'cells'];
        if (sceneKind === 'mechanical') return ['clear', 'constraint-space', 'bodies', 'contacts', 'impulse-ledger'];
        if (sceneKind === 'literal-composite') return ['clear', 'environment', 'literal-objects', 'contacts', 'fields'];
        if (sceneKind === 'acoustic') return ['clear', 'waveguide', 'pressure-fronts', 'resonators', 'objects'];
        return uniqueList([...shared, ...(solverFamilies || [])]);
      }

    function refineSolverPlanForScene(plan, sceneKind) {
        if (!plan) return plan;
        if (sceneKind === 'biology') {
          return solverPlanWithSceneFamilies(plan, [
            'growth-diffusion',
            'membrane-relaxation',
            'scalar-coupled-state',
          ], ['growth-diffusion']);
        }
        if (sceneKind === 'watershed') {
          return solverPlanWithSceneFamilies(plan, [
            'particle-advection',
            'granular-settling',
            'growth-diffusion',
            'phase-boundary',
            'scalar-coupled-state',
          ], ['particle-advection']);
        }
        if (sceneKind !== 'mechanical') return plan;
        const families = uniqueList([
          'constraint-dynamics',
          ...(plan.families || []).filter((family) => family === 'membrane-relaxation'),
        ]);
        return {
          ...plan,
          families,
          state: uniqueList([
            ...(plan.state || []),
            'contact-manifold',
            'impulse',
            'angular-velocity',
          ]),
        };
      }

    function solverPlanWithSceneFamilies(plan, allowedFamilies, fallbackFamilies) {
        const allowed = new Set(allowedFamilies);
        const families = uniqueList((plan.families || []).filter((family) => allowed.has(family)));
        const finalFamilies = families.length ? families : fallbackFamilies.slice();
        return {
          ...plan,
          families: finalFamilies,
          state: uniqueList(finalFamilies.flatMap(stateTexturesForFamily)),
        };
      }

    function solverGraphStepsForScene(steps, sceneKind) {
        const rows = steps || [];
        const allow = sceneSolverStepPattern(sceneKind);
        if (!allow) return rows;
        return rows.filter((step) => allow.test(`${step.operatorType || ''} ${step.solverId || ''}`));
      }

    function sceneSolverStepPattern(sceneKind) {
        if (sceneKind === 'biology') return /\b(growth|diffusion|membrane|soft|nutrient|density)\b/;
        if (sceneKind === 'watershed') return /\b(advection|flow|fluid|erosion|gravity|growth|sediment|pressure)\b/;
        return null;
      }

    function expandedSceneKindForText(value) {
        const registry = renderRegistryRef();
        if (!registry || typeof registry.sceneHintForText !== 'function') return '';
        const scene = normalizedSceneHint(registry.sceneHintForText(value));
        return scene && scene !== 'generic' ? scene : '';
      }

    function baseSceneKindForPromptText(value) {
        const text = String(value || '').toLowerCase();
        if (!text) return '';
        if (/\b(fire|forest fire|wildfire|dry pine fire|building fire|warehouse fire|flame|combustion|burning)\b/.test(text)) {
          return 'fire';
        }
        if (/\b(lava|magma|steam|thermal plume|heat plume|cooling fin|cooling fins|smoke over cooling)\b/.test(text)) {
          return 'thermal-plume';
        }
        if (/\b(hamster wheel|mouse|gerbil|wheel crashing|collision|bridge|cable|fracture|impact|robot|mechanical)\b/.test(text)) {
          return 'mechanical';
        }
        if (/\b(ferrofluid|copper coil|pulsing current|magnetic spikes)\b/.test(text)) return 'ferrofluid';
        if (/\b(soap film|thin film|air bubble|wire loop|iridescen)\b/.test(text)) return 'thin-film';
        if (/\b(granular|beads|avalanche|sieve|powder)\b/.test(text)) return 'granular';
        if (/\b(optics|prism|lens|mirror|laser|glass lens)\b/.test(text)) return 'optics';
        if (/\b(city grid|traffic|market queue|power grid|queue|logistics)\b/.test(text)) return 'city';
        if (/\b(watershed|river|erosion|terrain|sediment|rain channel|soil|rock ridges)\b/.test(text)) return 'watershed';
        if (/\b(acoustic|sound|pressure wave|waveguide|resonance|brass tube)\b/.test(text)) return 'acoustic';
        if (/\b(protein|mycelium|bacteria|membrane|colony|infection)\b/.test(text)) return 'biology';
        return '';
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
        if (node.shape === 'animal-body') return [0.16, 0.1];
        if (node.shape === 'coil') return [0.16, 0.12];
        if (node.shape === 'wire-loop' || node.shape === 'film') return [0.2, 0.16];
        if (node.shape === 'bubble') return [0.12, 0.12];
        if (node.shape === 'cooling-fins' || node.shape === 'sieve') return [0.24, 0.12];
        if (node.shape === 'bridge') return [0.22, 0.1];
        if (node.shape === 'singularity') return [0.18, 0.18];
        if (node.shape === 'hammer') return [0.18, 0.12];
        if (node.shape === 'wetland') return [0.26, 0.16];
        if (node.shape === 'rocket') return [0.18, 0.11];
        if (node.shape === 'submarine') return [0.22, 0.11];
        if (node.shape === 'volcano') return [0.24, 0.18];
        if (node.shape === 'lava-flow') return [0.28, 0.1];
        if (node.shape === 'instrument') return [0.2, 0.12];
        if (node.shape === 'castle') return [0.22, 0.19];
        if (node.shape === 'tower') return [0.14, 0.22];
        if (node.shape === 'turbine') return [0.16, 0.16];
        if (node.shape === 'storm') return [0.32, 0.2];
        if (node.shape === 'plant-cluster') return [0.18, 0.16];
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

    function solverPlanForComposition(graph, objects) {
        const operatorIds = new Set((graph.operators || []).map((operator) => operator.id));
        const regimes = new Set((objects || []).map((object) => object.visualRegime));
        const families = [];
        if (operatorIds.has('advection') || regimes.has('fluid')) families.push('particle-advection');
        if (operatorIds.has('heatTransfer') || regimes.has('thermal')) families.push('heat-diffusion');
        if (operatorIds.has('combustion')) families.push('reaction-front');
        if (operatorIds.has('refraction') || regimes.has('optical')) families.push('ray-optics');
        if (operatorIds.has('magnetism') || regimes.has('magnetic')) families.push('magnetic-vector-field');
        if (operatorIds.has('erosion') || regimes.has('granular')) families.push('granular-settling');
        if (operatorIds.has('growthDecay') || regimes.has('biological') || regimes.has('ecological')) families.push('growth-diffusion');
        if (operatorIds.has('collision') || regimes.has('mechanical')) families.push('constraint-dynamics');
        if (regimes.has('electrical')) families.push('electric-potential-field');
        if (regimes.has('acoustic')) families.push('wave-equation');
        if (regimes.has('soft')) families.push('membrane-relaxation');
        if (regimes.has('phase')) families.push('phase-boundary');
        if (!families.length) families.push('scalar-coupled-state');
        return {
          schema: 'simulatte.solverPlan.v1',
          integrator: 'mixed-semi-implicit',
          families: uniqueList(families),
          state: uniqueList(families.flatMap(stateTexturesForFamily)),
        };
      }

    function stateTexturesForFamily(family) {
        const map = {
          'particle-advection': ['velocity', 'density'],
          'heat-diffusion': ['temperature'],
          'reaction-front': ['fuel', 'product', 'temperature'],
          'ray-optics': ['light-paths', 'surface-normal'],
          'magnetic-vector-field': ['flux', 'force'],
          'granular-settling': ['height', 'sediment'],
          'growth-diffusion': ['population', 'nutrient'],
          'electric-potential-field': ['charge', 'potential'],
          'wave-equation': ['phase', 'amplitude'],
          'membrane-relaxation': ['tension', 'displacement'],
          'phase-boundary': ['phase', 'latent-heat'],
          'scalar-coupled-state': ['energy', 'field'],
        };
        return map[family] || [];
      }

    function componentText(component) {
        if (!component) return '';
        return [
          component.id,
          component.type,
          component.role,
          component.phrase,
          component.material,
          component.visualRegime,
          component.assembly,
          component.source,
          ...(component.domains || []),
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function inferLayer(component) {
        const text = componentText(component);
        if (/water|wood|metal|glass|rock|sand|soil|air|smoke|fire/.test(text)) return 'material';
        if (/gravity|field|diffusion|collision|constraint/.test(text)) return 'physics';
        if (/queue|graph|source|sink|ledger|threshold|delay/.test(text)) return 'math';
        return component.type || 'component';
      }

    function materialForComponent(component) {
        if (component && component.material) return component.material;
        const text = componentText(component);
        const identity = [
          component && component.id,
          component && component.type,
          component && component.role,
          component && component.phrase,
        ].filter(Boolean).join(' ').toLowerCase();
        if (/brine/.test(text)) return 'brine';
        if (/mercury/.test(text)) return 'mercury';
        if (/copper/.test(text)) return 'copper';
        if (/silicon/.test(text)) return 'silicon';
        if (/carbon/.test(text)) return 'carbon';
        if (/gold/.test(text)) return 'gold';
        if (/lava|magma|molten/.test(text)) return 'lava';
        if (/ice|frozen/.test(text)) return 'ice';
        if (/quartz|crystal/.test(text)) return 'quartz';
        if (/ferrofluid/.test(text)) return 'ferrofluid';
        if (/gel/.test(text)) return 'gel';
        if (/foam/.test(text)) return 'foam';
        if (/membrane/.test(text)) return 'membrane';
        if (/leaf/.test(text)) return 'leaf';
        if (/mycelium/.test(text)) return 'mycelium';
        if (/protein/.test(text)) return 'protein';
        if (/bacteria/.test(text)) return 'bacteria';
        if (/water|river|lake|submarine/.test(identity)) return 'water';
        if (/wood|biomass|fuel/.test(text)) return 'wood';
        if (/glass|lens|prism/.test(text)) return 'glass';
        if (/magnet/.test(text)) return 'magnet';
        if (/metal|motor|generator|wheel|rotor|spacecraft|spaceship|rocket|turbine|submarine/.test(text)) return 'metal';
        if (/sand/.test(text)) return 'sand';
        if (/soil|terrain/.test(text)) return 'soil';
        if (/fire|flame|combust|plasma|volcano/.test(text)) return 'fire';
        if (/smoke/.test(text)) return 'smoke';
        if (/rock|wall/.test(text)) return 'rock';
        if (/bubble|foam|soap/.test(text)) return 'foam';
        if (/film|membrane/.test(text)) return 'membrane';
        if (/air|wind/.test(text)) return 'air';
        return 'matte';
      }

    function shapeForComponent(component) {
        const componentId = String(component && component.id || '');
        if (componentId === 'rotor-wheel') return 'wheel';
        if (componentId === 'stator-slider') return 'slider';
        if (componentId === 'solar-panel') return 'panel';
        if (componentId === 'motor-load') return 'meter';
        if (component && component.assembly === 'flow') return 'flow-path';
        if (component && component.assembly === 'field') return 'field-envelope';
        if (component && component.assembly === 'network') return 'network-node';
        if (component && component.assembly === 'source') return 'source-field';
        const geometryShapes = ((component && component.geometry && component.geometry.shapes) || [])
          .join(' ')
          .toLowerCase();
        const text = componentText(component);
        const phrase = String(component && component.phrase || '').toLowerCase();
        const identity = `${component && component.id || ''} ${component && component.role || ''} ${component && component.material || ''}`.toLowerCase();
        const namedIdentity = `${component && component.id || ''} ${component && component.role || ''} ${phrase}`.toLowerCase();
        const specific = [
          component && component.id,
          component && component.type,
          component && component.role,
          component && component.material,
          component && component.visualRegime,
          component && component.assembly,
          component && component.source,
          ...((component && component.domains) || []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (/\bgold\b|gold-/.test(identity)) return 'bar';
        if (/air-material|air material/.test(identity)) return /bubble/.test(text) ? 'bubble' : 'sample';
        if (/water-material|water material/.test(identity)) return 'pool';
        if (/rocket[_-]body|spacecraft|spaceship|rocket|satellite/.test(`${specific} ${geometryShapes}`)) return 'rocket';
        if (/submarine[_-]body|submarine|submersible/.test(`${specific} ${geometryShapes}`)) return 'submarine';
        if (/volcano|volcanic/.test(specific)) return 'volcano';
        const directShapeText = [
          component && component.id,
          component && component.type,
          component && component.role,
          component && component.material,
          component && component.visualRegime,
          component && component.assembly,
        ].filter(Boolean).join(' ').toLowerCase();
        if (/\b(detector|phototube|calorimeter|instrument|sensor[-_ ]?array|data[-_ ]?recorder|readout)\b/.test(directShapeText)) return 'instrument';
        if (/\b(pressure[-_ ]?vessel|water[-_ ]?tank|tank|chamber)\b/.test(directShapeText)) return 'wall';
        if (/\b(laser|lens|glass|prism)\b/.test(directShapeText) && /\b(optical|light|laser|lens|glass|prism)\b/.test(directShapeText)) {
          return /\bprism\b/.test(directShapeText) ? 'prism' : 'lens';
        }
        if (/\b(photon|light[-_ ]?source|radiation|optics)\b/.test(directShapeText)) return 'field-envelope';
        const ownIdentity = [
          component && component.id,
          component && component.type,
          component && component.role,
          component && component.material,
          component && component.visualRegime,
          component && component.assembly,
          ...((component && component.domains) || []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (/\b(mouse|mice|gerbil|hamster|dog|cat|animal|mammal|organism)\b/.test(ownIdentity)) return 'animal-body';
        if (/\b(person|people|human|pedestrian|worker|patient|agent)\b/.test(ownIdentity)) return 'body';
        if (/\b(car|vehicle|truck|bus|train|railcar|rail_vehicle|wheeled_vehicle)\b/.test(ownIdentity)) return 'wheel';
        if (/\b(chair|chairs|couch|sofa|table|desk|bench|furniture|household_object)\b/.test(ownIdentity)) return 'body';
        if (/\b(cup|mug|bowl|container|glass-cup|glass cup)\b/.test(ownIdentity)) return 'sample';
        if (/\b(laptop|computer|screen|monitor|window)\b/.test(ownIdentity)) return 'panel';
        if (/\b(hammer|mallet)\b/.test(ownIdentity)) return 'hammer';
        if (/\b(knife|blade|tool|hand_tool)\b/.test(ownIdentity)) return 'bar';
        if (/\b(box|crate|package|parcel)\b/.test(ownIdentity)) return 'body';
        if (/\b(building|room|warehouse|factory|house|apartment|office|school|hospital|stairwell|corridor|hallway|basement|garage|roof|shed|cabin)\b/.test(namedIdentity) || /\bbox\b.*\bshell\b/.test(geometryShapes)) {
          return 'building';
        }
        if (/gear[_-]train|gearbox|wheel|rotor|gear/.test(`${specific} ${geometryShapes}`)) return 'wheel';
        if (/span[_-]structure|bridge|truss|span/.test(`${specific} ${geometryShapes}`)) return 'bridge';
        if (/crystal tower|crystal towers/.test(phrase) || (/\btower\b/.test(specific) && !/castle/.test(specific))) return 'tower';
        if (/castle/.test(`${specific} ${geometryShapes}`)) return 'castle';
        if (/lava[_-]flow|lava|magma|molten/.test(`${specific} ${geometryShapes}`)) return 'lava-flow';
        if (/instrument[_-]body|piano|keyboard|instrument/.test(`${specific} ${geometryShapes}`)) return 'instrument';
        if (/turbine|propeller|fan turbine/.test(`${specific} ${geometryShapes}`)) return 'turbine';
        if (/storm|hurricane|rainstorm/.test(specific)) return 'storm';
        if (/colony[_-]field|algae|plant cluster|plant_cluster/.test(`${specific} ${geometryShapes}`)) return 'plant-cluster';
        if (/prism/.test(identity)) return 'prism';
        if (/glass|lens/.test(identity)) return 'lens';
        if (/spacecraft|spaceship|rocket|satellite/.test(text)) return 'rocket';
        if (/submarine|submersible/.test(text)) return 'submarine';
        if (/volcano|volcanic/.test(text)) return 'volcano';
        if (/bridge|truss|span/.test(text)) return 'bridge';
        if (/crystal tower|crystal towers|tower/.test(text)) return 'tower';
        if (/ice castle|castle/.test(text)) return 'castle';
        if (/lava|magma|molten/.test(text)) return 'lava-flow';
        if (/piano|keyboard|instrument/.test(text)) return 'instrument';
        if (/turbine|propeller|fan turbine/.test(text)) return 'turbine';
        if (/storm|hurricane|rainstorm/.test(text)) return 'storm';
        if (/algae|plant cluster/.test(text)) return 'plant-cluster';
        if (/wheel|rotor|gear/.test(text)) return 'wheel';
        if (/\b(mouse|gerbil|hamster|dog|cat|animal|organism)\b/.test(text)) return 'animal-body';
        if (/ferrofluid/.test(text)) return 'pool';
        if (/black hole|singularity|event horizon/.test(text)) return 'singularity';
        if (/swamp|marsh|wetland/.test(text)) return 'wetland';
        if (/hammer|mallet/.test(text)) return 'hammer';
        if (/cooling fin|cooling fins|heat sink|heatsink/.test(text)) return 'cooling-fins';
        if (/sieve|screen|mesh/.test(text)) return 'sieve';
        if (/copper coil|coil|solenoid|winding/.test(text)) return 'coil';
        if (/wire loop|wire loops|loop/.test(text)) return 'wire-loop';
        if (/air bubble|air bubbles|bubble/.test(text)) return 'bubble';
        if (/soap thin film|thin film|soap film|film/.test(text)) return 'film';
        if (/forest-fire|fuel bed|biomass/.test(text)) return 'fuel-bed';
        if (/\b(ledger|meter|recorder)\b/.test(namedIdentity) || /\benergy-ledger\b/.test(text)) return 'meter';
        if (/solar|panel/.test(text)) return 'panel';
        if (/slider|actuator/.test(text)) return 'slider';
        if (/magnet/.test(text)) return 'magnet';
        if (/prism/.test(text)) return 'prism';
        if (/lens/.test(text)) return 'lens';
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
        if (/gold|copper|silicon|carbon|metal|magnet/.test(id)) return 'bar';
        if (/foam|gel|membrane/.test(id)) return 'membrane-field';
        if (/bacteria|mycelium|leaf|protein/.test(id)) return 'colony-field';
        if (/brine|mercury|water|oil|steam|smoke|ferrofluid/.test(id)) return 'pool';
        if (/ice/.test(id)) return 'castle';
        if (/glass|quartz|crystal/.test(id)) return 'lens';
        if (/sand|soil|clay|rock/.test(id)) return 'grain-bed';
        if (/wood|fabric|rubber/.test(id)) return 'slab';
        if (/fire|plasma/.test(id)) return 'flame-front';
        return 'sample';
      }

    function visualRegimeForNode(node) {
        const identityText = [
          node.primitiveId,
          node.material,
          node.shape,
          node.role,
          node.assembly,
          (node.domains || []).join(' '),
        ].join(' ').toLowerCase();
        const text = [
          identityText,
          node.phrase,
          node.source,
        ].join(' ').toLowerCase();
        if (/dog|cat|mouse|gerbil|hamster|animal|mammal|flower|tree|plant|root|mycelium|bacteria|protein|leaf|biology|population|colony|infection/.test(identityText)) return 'biological';
        if (/\b(train|railway|rail|subway|dispatch|signal block|signal blocks|platform|queue|traffic|market|logistics)\b/.test(identityText)) return 'network';
        if (/swim|swimming|underwater/.test(String(node.phrase || '').toLowerCase()) &&
          /water|fluid|flow|pressure|pool/.test(identityText)) return 'fluid';
        if (/mountain|mountaint|terrain|heightfield|soil|rock|sediment|clay|granular|grain/.test(identityText)) return 'granular';
        if (/lava|magma|molten|melt|phase|ice|crystal|castle/.test(identityText)) return 'phase';
        if (/volcano|fire|flame|plume|thermal|heat|combust|smoke/.test(identityText)) return 'thermal';
        if (/water|river|fluid|flow|pool|pond|lake|swim|swimming/.test(identityText)) return 'fluid';
        if (node && node.visualRegime) return node.visualRegime;
        if (/spacecraft|spaceship|rocket|satellite|submarine|turbine/.test(text)) return 'mechanical';
        if (/glacier|fjord|sea ice|iceberg|cryosphere|calving/.test(text)) return 'phase';
        if (/piano|keyboard|instrument|acoustic/.test(text)) return 'acoustic';
        if (/storm|hurricane|rainstorm/.test(text)) return 'fluid';
        if (/volcano|lava|magma|molten/.test(text)) return 'thermal';
        if (/membrane|gel|foam|fabric|soft|adhesion|cohesion/.test(text)) return 'soft';
        if (/\b(atom|electron|ion|molecule|crystal|lattice|atomic)\b/.test(text)) return 'atomic';
        if (/electric|charge|current|copper|silicon|conductor|plasma/.test(text)) return 'electrical';
        if (/sound|acoustic|standing wave|pressure wave|pressure waves|resonance/.test(text)) return 'acoustic';
        if (/phase|melt|freeze|boil|steam|ice/.test(text)) return 'phase';
        if (/fire|flame|plume|thermal|heat|combust|smoke/.test(text)) return 'thermal';
        if (/ferrofluid|magnet|metal|electro|wheel|motor|bar|rail|field/.test(text)) return 'magnetic';
        if (/water|river|fluid|flow|pool|air|wind|brine|mercury/.test(text)) return 'fluid';
        if (/glass|light|lens|prism|ray|mirror|sensor|panel|optics/.test(text)) return 'optical';
        if (/rock|wood|soil|sand|terrain|grain|fuel|wall|ridge/.test(text)) return 'granular';
        if (/queue|network|market|logistics|traffic/.test(text)) return 'network';
        return 'generic';
      }

    function primitiveProgramForNode(node) {
        const visualRegime = visualRegimeForNode(node);
        const seed = hashProgram(`${node.primitiveId}:${node.role}:${node.shape}`);
        return {
          schema: 'simulatte.primitiveProgram.v1',
          source: 'composition-primitive-program',
          shapeKey: `cg_${seed.toString(16).padStart(8, '0')}`,
          phrase: node.phrase || node.role || node.primitiveId,
          assembly: node.assembly || node.shape || node.type,
          visualRegime,
          material: node.material,
          parts: programParts(visualRegime, node.shape, seed),
          provenance: {
            primitiveId: node.primitiveId,
            tokenHash: seed >>> 0,
          },
        };
      }

    function programParts(visualRegime, shape, seed) {
        if (shape === 'wheel') return [
          part('flux-loop', 10, 0.12),
          part('ring', 6, 0.1),
          part('particle', 18, 0.08),
        ];
        if (shape === 'prism' || shape === 'lens') return [
          part('spectral-ray', 9, 0.22),
          part('caustic', 8, 0.12),
          part('field-line', 3, 0.06),
        ];
        if (shape === 'flow-path') return [
          part('stream', 9, 0.14),
          part('droplet', 26, 0.1),
          part('ripple', 5, 0.08),
        ];
        if (shape === 'flame-front' || shape === 'plume') return [
          part('plume', 12, 0.13),
          part('spark', 26, 0.17),
          part('phase-band', 4, 0.06),
        ];
        if (shape === 'queue-node' || shape === 'network-node') return [
          part('network-thread', 12, 0.12),
          part('pulse', 18, 0.1),
          part('particle', 14, 0.08),
        ];
        if (visualRegime === 'biological') return [
          part('branch', 10, 0.14),
          part('cell', 22, 0.1),
          part('membrane', 4, 0.08),
        ];
        if (visualRegime === 'soft') return [part('membrane', 8, 0.13), part('ripple', 8, 0.08)];
        if (visualRegime === 'atomic') return [part('orbital', 7, 0.14), part('lattice', 24, 0.1)];
        if (visualRegime === 'electrical') return [part('arc', 10, 0.15), part('pulse', 14, 0.11)];
        if (visualRegime === 'acoustic') return [part('wavefront', 12, 0.11), part('ripple', 8, 0.09)];
        if (visualRegime === 'granular') return [part('strata', 9, 0.12), part('grain', 38, 0.1)];
        if (visualRegime === 'magnetic') return [part('flux-loop', 10, 0.12), part('particle', 18, 0.08)];
        if (visualRegime === 'fluid') return [part('stream', 8, 0.13), part('droplet', 24, 0.09)];
        if (visualRegime === 'phase') return [part('phase-band', 8, 0.12), part('droplet', 12, 0.08)];
        if (seed % 3 === 0) return [part('field-line', 7, 0.1), part('particle', 16, 0.08)];
        return [part('ripple', 6, 0.08), part('particle', 18, 0.08)];
      }

    function part(kind, count, alpha) {
        return { kind, count, alpha };
      }

    function hashProgram(value) {
        let h = 2166136261;
        for (let i = 0; i < String(value).length; i += 1) {
          h ^= String(value).charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      }

    Object.assign(scope, {
      sceneKindFromSemantics,
      resolveSceneKind,
      sceneKindForComposition,
      compositionPromptText,
      hasAcousticWaveSignal,
      focusFieldsForScene,
      defaultFieldForKind,
      dominantRegimeForScene,
      renderPassOrder,
      refineSolverPlanForScene,
      solverPlanWithSceneFamilies,
      solverGraphStepsForScene,
      sceneSolverStepPattern,
      expandedSceneKindForText,
      baseSceneKindForPromptText,
      poseForNode,
      sizeForNode,
      fieldsForComposition,
      emittersForComposition,
      solverPlanForComposition,
      stateTexturesForFamily,
      componentText,
      inferLayer,
      materialForComponent,
      shapeForComponent,
      sampleShape,
      visualRegimeForNode,
      primitiveProgramForNode,
      programParts,
      part,
      hashProgram,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
