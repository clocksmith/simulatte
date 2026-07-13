(function attachSimulatteCompositionGraphrenderirbinding(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function sceneKindForRenderIR(renderIR, solverGraph, graph, graphObjects, spec) {
        const sceneHint = normalizedSceneHint(renderIR.sceneHint);
        const directScene = directSceneKindForRenderIR(renderIR, spec);
        const promptText = directPromptSceneText(renderIR, spec);
        const promptTerrain = (graphObjects || []).some((object) => (
          isPromptGroundedComponent(object, promptText) && hasDirectTerrainSignal([
            object.id,
            object.role,
            object.phrase,
            object.shape,
            ...(object.domains || []),
          ].filter(Boolean).join(' '))
        ));
        if (directScene === 'biology' && promptTerrain) return 'watershed';
        if (directScene === 'mechanical' && sceneHint === 'city' &&
          (hasDirectBuiltEnvironmentSignal(promptText) || hasDirectMechanicalRigSignal(promptText)) &&
          !hasDirectNetworkSignal(promptText)) {
          return 'mechanical';
        }
        if (directScene === 'mechanical' &&
          (hasDirectBuiltEnvironmentSignal(promptText) || hasDirectMechanicalRigSignal(promptText)) &&
          !/\b(magnet|magnetic|ferrofluid|coil|stator|flux|dipole)\b/.test(promptText) &&
          ['', 'biology', 'city', 'literal-composite', 'magnetic-machine', 'watershed'].includes(sceneHint)) return 'mechanical';
        if (directScene && broadSceneHintCanYieldToDirectLanguage(sceneHint)) return directScene;
        const residualOptics = (graphObjects || []).some((object) => (
          object.source === 'doppler-residual' &&
          /optical|optics|lens|prism|refraction/.test(`${object.visualRegime || ''} ${object.shape || ''} ${object.role || ''}`)
        ));
        if (residualOptics) return 'optics';
        if (sceneHint && sceneHint !== 'literal-composite') return sceneHint;
        const signalScene = sceneKindFromRenderIRSignals(renderIR, solverGraph, spec);
        if (signalScene && signalScene !== 'literal-composite') return signalScene;
        const fallbackScene = sceneKindForComposition(
          graph,
          graphObjects,
          fieldsForComposition(graph, spec),
          spec
        );
        if (fallbackScene && fallbackScene !== 'generic') return fallbackScene;
        return signalScene || sceneHint || 'generic';
      }

    function directSceneKindForRenderIR(renderIR, spec) {
        return directSceneKindForText(
          directRenderIRSceneText(renderIR, spec),
          directPromptSceneText(renderIR, spec)
        );
      }

    function directSceneKindForText(text = '', promptText = text) {
        if (/\b(galaxy|galaxies|nebula|black hole|event horizon|planet|planets|moon|moons|star|stars|solar system)\b/.test(promptText)) return 'planetary-space';
        if (hasDirectCombustionSignal(promptText)) return 'fire';
        if (hasDirectThermalSignal(promptText)) return 'thermal-plume';
        if (hasDirectSwimmingSignal(promptText)) return 'watershed';
        if (hasThinFilmSignal(promptText)) return 'thin-film';
        if (hasDirectTerrainSignal(text)) return 'watershed';
        if (hasDirectMechanicalRigSignal(promptText)) return 'mechanical';
        if (hasDirectBuiltEnvironmentSignal(promptText)) return 'mechanical';
        if (hasDirectAnimalOrPlantSignal(text) && !hasDirectMechanicalRigSignal(promptText)) return 'biology';
        return '';
      }

    function broadSceneHintCanYieldToDirectLanguage(sceneHint) {
        return !sceneHint || sceneHint === 'generic' || sceneHint === 'literal-composite' ||
          sceneHint === 'mechanical' || sceneHint === 'biology';
      }

    function normalizedSceneHint(value) {
        const scene = String(value || '').trim();
        return scene && scene !== 'generic' ? scene : '';
      }

    function nonFallbackSceneKind(value) {
        const scene = String(value || '').trim();
        return scene && scene !== 'generic' && scene !== 'literal-composite' ? scene : '';
      }

    function sceneKindFromRenderIRSignals(renderIR, solverGraph, spec) {
        const directText = directRenderIRSceneText(renderIR, spec);
        if (hasDirectSwimmingSignal(directText)) return 'watershed';
        if (hasDirectAnimalOrPlantSignal(directText) && !hasDirectMechanicalRigSignal(directText)) return 'biology';
        const text = [
          (renderIR.objects || []).map((object) => [
            object.label,
            object.glyph,
            object.materialId,
            object.visualRegime,
            object.domainKind,
            object.semanticRef,
            object.physicalRef,
            ...(object.domainTags || []),
            ...(object.operatorHints || []),
            Object.keys(object.stateBindings || {}).join(' '),
          ].join(' ')).join(' '),
          (renderIR.fields || []).map((field) => `${field.name} ${field.channel} ${field.domainId}`).join(' '),
          (solverGraph.steps || []).map((step) => `${step.operatorType} ${step.solverId}`).join(' '),
        ].join(' ').toLowerCase();
        const expanded = expandedSceneKindForText(text);
        if (expanded) return expanded;
        if (hasRoboticsSignal(text)) return 'robotics-control';
        if (hasChemistryLabSignal(text)) return 'chemistry-lab';
        if (hasGranularCombustionSignal(text)) return 'granular';
        if (hasThinFilmSignal(text)) return 'thin-film';
        if (/tray|raw material|heat diffusion sample/.test(text) && /water|air|rock|wood|metal|glass|steel/.test(text)) {
          return 'material-tray';
        }
        if (/thermal plume|cooling|cooler|smoke over cooling/.test(text) && /thermal|heat|temperature/.test(text)) {
          return 'thermal-plume';
        }
        if (/process-fire|flame|combustion|fuel|burn/.test(text) && /heat_source|reaction_diffusion|burn/.test(text)) {
          return 'fire';
        }
        if (/lava|magma|molten|volcano|heat_transfer|phase_transition|steam|thermal|temperature/.test(text)) return 'thermal-plume';
        if (/black-hole|black hole|singularity|spaceship|spacecraft|rocket|orbital|orbit|planetary/.test(text)) return 'planetary-space';
        if (/lens|prism|mirror|optics|field_refraction|field_reflection|laser/.test(text)) return 'optics';
        if (/network|queue|traffic|market|network_flow|backlog|throughput/.test(text)) return 'city';
        if (/wheel|rotor|stator|slider|sliding|electromagnetism|magnetic_force|rotor-wheel/.test(text) && /magnet|magnetic/.test(text)) {
          return 'magnetic-machine';
        }
        if (/ferrofluid|magnetic_fluid|magnetizes|spikes|magnetic_field/.test(text)) return 'ferrofluid';
        if (/\b(terrain|erosion|sediment|river|rain|basalt|watershed|gravity)\b/.test(text)) return 'watershed';
        if (/acoustic|sound|wave_field|resonance|amplitude/.test(text) &&
          !/biology|growth|mycelium|bacteria|membrane|protein|nutrient|density/.test(text)) {
          return 'acoustic';
        }
        if (/granular|grain|bead|sieve|avalanche|powder/.test(text)) return 'granular';
        if (/growth_decay|reaction_diffusion|mycelium|bacteria|biofilm|fermentation|nutrient/.test(text)) return 'biology';
        if (/rigid_collision|fracture_threshold|rotational_torque|projectile|collision/.test(text) &&
          !/acoustic|sound|wave_field|resonance|amplitude/.test(text)) {
          return 'mechanical';
        }
        if (/biology|growth|mycelium|bacteria|membrane|protein|nutrient|density/.test(text)) return 'biology';
        if (/acoustic|sound|wave_field|resonance|amplitude/.test(text)) return 'acoustic';
        if (/fluid|water|flowVelocity|advection/.test(text)) return 'watershed';
        if (/turbine|castle|ice|storm|instrument/.test(text)) return 'literal-composite';
        return '';
      }

    function directRenderIRSceneText(renderIR, spec) {
        return positiveLanguageText([
          directPromptSceneText(renderIR, spec),
          ...((renderIR && renderIR.objects || []).map((object) => [
            object.label,
            object.glyph,
            object.materialId,
            object.visualRegime,
            object.domainKind,
            object.semanticRef,
            object.physicalRef,
            ...(object.domainTags || []),
            ...(object.operatorHints || []),
          ].join(' '))),
        ].filter(Boolean).join(' '));
      }

    function directPromptSceneText(renderIR, spec) {
        const promptParse = spec && spec.promptParse || {};
        const universeGraph = spec && spec.universeGraph || {};
        const physicsIR = spec && spec.physicsIR || {};
        const promptOwnedObjects = (renderIR && renderIR.objects || []).filter((object) => (
          object.directlyGrounded === true ||
          /^prompt\./.test(String(object.semanticRef || object.physicalRef || ''))
        ));
        return positiveLanguageText([
          renderIR && renderIR.prompt,
          universeGraph.prompt,
          physicsIR.prompt,
          spec && spec.name,
          ...((promptParse.spans || []).map((span) => span.text)),
          ...promptOwnedObjects.map((object) => [
            object.sourceLabel,
            object.label,
            object.visualArchetype,
            object.semanticClass,
            object.semanticRef,
            object.physicalRef,
          ].filter(Boolean).join(' ')),
        ].filter(Boolean).join(' '));
      }

    function hasDirectSwimmingSignal(text = '') {
        return /\b(swim|swims|swimming|swam|underwater|water|pool|pond|lake|river)\b/.test(text) &&
          (hasDirectAnimalOrPlantSignal(text) || /\b(swim|swims|swimming|swam|underwater)\b/.test(text));
      }

    function hasDirectTerrainSignal(text = '') {
        return /\b(mountain|mountains|terrain|watershed|river|erosion|sediment|delta|lake|pond)\b/.test(text);
      }

    function hasDirectCombustionSignal(text = '') {
        return /\b(forest fire|wildfire|fire|flame|flames|smoke|soot|burn|burns|burning|combust|combustion|ember|embers)\b/.test(text);
      }

    function hasDirectThermalSignal(text = '') {
        return /\b(lava|magma|molten|volcano|volcanic|steam|thermal plume|heat plume)\b/.test(text);
      }

    function hasDirectAnimalOrPlantSignal(text = '') {
        return /\b(dog|dogs|cat|cats|mouse|mice|gerbil|gerbils|hamster|hamsters|animal|animals|mammal|mammals|bird|birds|fish|flower|flowers|tree|trees|plant|plants|leaf|leaves|root|roots|grass|forest)\b/.test(text);
      }

    function hasDirectMechanicalRigSignal(text = '') {
        return /\b(hamster wheel|running wheel|wheel crashing|bicycle|airplane|aircraft|crash|crashes|crashing|collision|collide|impact|fracture|projectile|gear|rotor|motor)\b/.test(text);
      }

    function hasDirectBuiltEnvironmentSignal(text = '') {
        return /\b(chair|table|sofa|lamp|television|tv|building|room|house|apartment|office|shelf)\b/.test(text);
      }

    function hasDirectNetworkSignal(text = '') {
        return /\b(city|traffic|network|queue|market|power grid|railway|dispatch|packet|server|zoning|logistics)\b/.test(text);
      }

    function hasRoboticsSignal(text = '') {
        const positive = positiveLanguageText(text);
        return /\b(robot|robotic|gripper|servo|workcell|manipulator|pick-place|pick and place|contact force)\b/.test(positive) &&
          /\b(robot|robotic|gripper|servo|manipulator|workcell)\b/.test(positive);
      }

    function positiveLanguageText(value = '') {
        const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
        const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
        const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
        return String(value || '').toLowerCase().replace(negated, ' ').replace(/\s+/g, ' ').trim();
      }

    function hasChemistryLabSignal(text = '') {
        return /\b(microfluidic|droplet|droplets|channel junction|meniscus|reagent|reaction vessel|catalyst|dose|insulin pump)\b/.test(text) &&
          !/\b(warehouse|traffic|market|orbit|planet|battery runaway|heat plume)\b/.test(text);
      }

    function hasGranularCombustionSignal(text = '') {
        if (/\b(rain|river|water|watershed|terrain|erosion|erodes|mountain|delta|channel)\b/.test(text) &&
          !/\b(dust|powder|silo|aerosol|explode|explodes|explosion)\b/.test(text)) {
          return false;
        }
        return /\b(grain|dust|powder|silo|aerosol|bead|sand|avalanche)\b/.test(text) &&
          /\b(explode|explodes|explosion|combust|burn|ignite|silo|avalanche|sieve|grain bed|bead stream)\b/.test(text);
      }

    function hasThinFilmSignal(text = '') {
        const positive = positiveLanguageText(text);
        return /\b(thin-film|thin film|soap|wire-loop|wire loop|surface_tension|iridescen)\b/.test(positive) ||
          (/\b(air bubble|air bubbles|bubble|bubbles)\b/.test(positive) &&
            /\b(soap|film|wire|loop|iridescen|surface tension|surface_tension)\b/.test(positive));
      }

    function renderIRObjectSceneText(renderIR, graphObjects) {
        return [
          (renderIR.objects || []).map((object) => [
            object.id,
            object.label,
            object.glyph,
            object.materialId,
            object.visualRegime,
            object.semanticRef,
            object.physicalRef,
          ].join(' ')).join(' '),
          specificGraphObjects(graphObjects).map(renderObjectText).join(' '),
        ].join(' ').toLowerCase();
      }

    function renderIRSceneText(renderIR, solverGraph, graph, graphObjects, spec) {
        return [
          renderIR.sceneHint,
          (renderIR.objects || []).map((object) => [
            object.id,
            object.label,
            object.glyph,
            object.materialId,
            object.visualRegime,
            object.semanticRef,
            object.physicalRef,
            Object.keys(object.stateBindings || {}).join(' '),
          ].join(' ')).join(' '),
          (renderIR.fields || []).map((field) => `${field.name} ${field.channel} ${field.domainId}`).join(' '),
          (solverGraph.steps || []).map((step) => `${step.operatorType} ${step.solverId}`).join(' '),
          specificGraphObjects(graphObjects).map(renderObjectText).join(' '),
        ].join(' ').toLowerCase();
      }

    function specificGraphObjects(objects) {
        return (objects || []).filter((object) => {
          const source = object.source || '';
          if (!source) return false;
          return source !== 'catalog';
        });
      }

    function contextObjectForRenderIRScene(text, sceneKind) {
        if (sceneKind === 'fire') return /flame|smoke|fuel|water|terrain|wall/.test(text);
        if (sceneKind === 'optics') return /lens|prism|mirror|beam|light|sensor/.test(text);
        if (sceneKind === 'city') return /queue|network|market|traffic|sensor|ledger/.test(text);
        if (sceneKind === 'watershed') return /rain|river|terrain|sediment|sand|soil|rock|delta|basalt|storm|surge|submarine|turbine|algae|undersea|water|tank/.test(text);
        if (sceneKind === 'magnetic-machine') return /wheel|rotor|stator|slider|magnet|panel|ledger/.test(text);
        if (sceneKind === 'mechanical') return /collision|fractur|constraint|wall|projectile|tower|glass|rigid/.test(text);
        if (sceneKind === 'literal-composite') return /lava|turbine|ice|castle|storm|bridge|wetland|volcano|rocket|submarine/.test(text);
        if (sceneKind === 'biology') return /algae|wetland|swamp|nutrient|growth|membrane|plant/.test(text);
        if (sceneKind === 'acoustic') return /wave|storm|bridge|cable|pressure|resonance|tube/.test(text);
        const expandedPriority = typeof expandedSceneObjectPriority === 'function'
          ? expandedSceneObjectPriority(text, { source: 'render-ir' }, sceneKind)
          : null;
        if (Number.isFinite(expandedPriority)) return expandedPriority >= 0;
        return false;
      }

    function fieldKindForRenderIRField(field, sceneKind) {
        const text = `${field.name || ''} ${field.channel || ''} ${field.domainId || ''}`.toLowerCase();
        if (sceneKind === 'city' && /backlog|throughput|delay|network/.test(text)) return 'network-flow';
        if (sceneKind === 'watershed' && /flow|pressure|water|river|channel|fluid/.test(text)) return 'flow';
        if (sceneKind === 'watershed' && /damage|terrain|rain|delta|slope|sediment|erosion/.test(text)) return 'gravity';
        if (sceneKind === 'optics' && /phase|amplitude|field|light|glass|refraction/.test(text)) return 'optical-rays';
        if (sceneKind === 'acoustic' && /phase|amplitude|pressure|wave/.test(text)) return 'pressure-wave';
        if (sceneKind === 'biology' && /density|nutrient|growth/.test(text)) return 'force-field';
        if ((sceneKind === 'fire' || sceneKind === 'thermal-plume') && /temperature|heat|reaction/.test(text)) return 'thermal';
        if (sceneKind === 'mechanical' && /damage|stress|velocity|angle|torque/.test(text)) return 'force-field';
        if (sceneKind === 'literal-composite' && /temperature|flow|damage|phase|pressure/.test(text)) return 'force-field';
        return field.name || 'state-field';
      }

    function uniqueFieldsByKind(fields) {
        const seen = new Set();
        const out = [];
        for (const field of fields || []) {
          const key = `${field.kind}:${field.channel || field.id || ''}`;
          const sceneKey = String(field.kind || '');
          if (seen.has(key) || seen.has(sceneKey)) continue;
          seen.add(key);
          seen.add(sceneKey);
          out.push(field);
        }
        return out;
      }

    function uniqueObjectsById(objects) {
        const seen = new Set();
        const out = [];
        for (const object of objects || []) {
          if (!object) continue;
          const key = String(
            object.id
            || object.physicalRef
            || object.semanticRef
            || `${object.shape || 'object'}:${object.role || ''}:${object.phrase || ''}`
          );
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push(object);
        }
        return out;
      }

    function shapeForRenderGlyph(glyph, object) {
        if (/^(?:dog|cat|animal)$/.test(object.visualArchetype)) return 'animal-body';
        if (/^(?:flower|plant|tree)$/.test(object.visualArchetype)) return 'plant-cluster';
        if (object.visualArchetype === 'building') return 'building';
        if (object.visualArchetype === 'instrument') return 'instrument';
        if (object.visualArchetype === 'wheel') return 'wheel';
        if (object.visualArchetype === 'water') return 'pool';
        if (object.visualArchetype === 'particle-cloud') return 'grain-bed';
        if (object.visualArchetype === 'waveguide') return 'instrument';
        if (object.visualArchetype === 'star') return 'source-field';
        if (glyph === 'lava') return 'lava-flow';
        if (glyph === 'volcano') return 'volcano';
        if (glyph === 'turbine') {
          return object.visualArchetype === 'wheel' || object.semanticClass === 'wheel'
            ? 'wheel'
            : 'turbine';
        }
        if (glyph === 'bridge') return 'bridge';
        if (glyph === 'tower') return 'tower';
        if (glyph === 'castle') return /wall/i.test(object.label || '') ? 'wall' : 'castle';
        if (glyph === 'ice') return 'ice';
        if (glyph === 'lens') return 'lens';
        if (glyph === 'prism') return 'prism';
        if (glyph === 'mirror') return 'mirror';
        if (glyph === 'flame') return 'flame-front';
        if (glyph === 'smoke') return 'plume';
        if (glyph === 'storm') return 'storm';
        if (glyph === 'wetland') return 'wetland';
        if (glyph === 'fluid_path') return 'flow-path';
        if (glyph === 'projectile') return 'bar';
        if (glyph === 'rocket') return 'rocket';
        if (glyph === 'submarine') return 'submarine';
        if (glyph === 'instrument') return 'instrument';
        if (glyph === 'network') {
          const tags = [object.semanticClass, object.visualArchetype, ...(object.domainTags || [])]
            .filter(Boolean).join(' ').toLowerCase();
          return /(?:^|\s)(?:queue|market-queue)(?:\s|$)/.test(tags) ? 'queue-node' : 'network-node';
        }
        if (glyph === 'field') return 'field-envelope';
        if (glyph === 'particle_cloud') return 'flow-path';
        if (glyph === 'organism') return 'plant-cluster';
        return 'body';
      }

    function poseForRenderObject(object, index, total) {
        const geometry = object.geometry || {};
        if (Array.isArray(geometry.anchor)) {
          const size = sizeForRenderGlyph(object.glyph);
          return { x: geometry.anchor[0], y: geometry.anchor[1], rotation: 0, w: size[0], h: size[1] };
        }
        if (Array.isArray(geometry.bounds)) {
          return {
            x: geometry.bounds[0] + geometry.bounds[2] * 0.5,
            y: geometry.bounds[1] + geometry.bounds[3] * 0.5,
            rotation: 0,
            w: geometry.bounds[2],
            h: geometry.bounds[3],
          };
        }
        if (geometry.kind === 'path') {
          return { points: [[0.1, 0.38], [0.34, 0.46], [0.58, 0.5], [0.88, 0.62]] };
        }
        const angle = total <= 1 ? 0 : index / Math.max(1, total) * Math.PI * 2;
        const size = sizeForRenderGlyph(object.glyph);
        return {
          x: 0.5 + Math.cos(angle) * 0.22,
          y: 0.5 + Math.sin(angle) * 0.16,
          rotation: 0,
          w: size[0],
          h: size[1],
        };
      }

    function sizeForRenderGlyph(glyph) {
        if (glyph === 'lava' || glyph === 'fluid_path') return [0.34, 0.12];
        if (glyph === 'volcano') return [0.24, 0.18];
        if (glyph === 'turbine') return [0.18, 0.18];
        if (glyph === 'bridge') return [0.24, 0.1];
        if (glyph === 'tower') return [0.14, 0.22];
        if (glyph === 'castle') return [0.22, 0.22];
        if (glyph === 'lens' || glyph === 'prism' || glyph === 'mirror') return [0.13, 0.13];
        if (glyph === 'flame' || glyph === 'smoke') return [0.18, 0.22];
        if (glyph === 'storm') return [0.32, 0.2];
        if (glyph === 'wetland') return [0.26, 0.16];
        if (glyph === 'field') return [0.3, 0.26];
        if (glyph === 'network') return [0.08, 0.08];
        return [0.16, 0.12];
      }

    function relationsFromPhysicsIR(spec) {
        const ir = spec.physicsIR || {};
        const seen = new Set();
        return (ir.couplings || []).map((coupling) => ({
          from: String(coupling.from || '').replace(/^domain:/, ''),
          to: String(coupling.to || '').replace(/^domain:/, ''),
          channel: coupling.type || 'coupling',
          reason: coupling.type || 'coupling',
          strength: 0.72,
          operatorId: coupling.operatorId,
        })).filter((relation) => {
          const key = `${relation.from}:${relation.to}:${relation.channel}:${relation.operatorId || ''}`;
          if (!relation.from || !relation.to || relation.from === relation.to || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

    function renderObjectForNode(node, spec) {
        const pose = poseForNode(node, spec);
        return {
          id: node.primitiveId,
          kind: node.type,
          material: node.material,
          role: node.role,
          shape: node.shape,
          visualRegime: visualRegimeForNode(node),
          assembly: node.assembly || '',
          phrase: node.phrase || '',
          source: node.source || '',
          pose,
          dynamics: { ...(node.state || {}), ...(node.params || {}) },
          primitiveProgram: node.primitiveProgram || primitiveProgramForNode(node),
          required: true,
        };
      }

    function rendererPlanForComposition(graph, objects, fields, solverPlan, spec, forcedSceneKind = '') {
        const sceneKind = forcedSceneKind || sceneKindForComposition(graph, objects, fields, spec);
        const dominantRegime = dominantRegimeForScene(sceneKind, objects);
        const fieldKinds = uniqueList((fields || []).map((field) => field.kind));
        const solverFamilies = uniqueList((solverPlan && solverPlan.families) || []);
        const shapeSignature = uniqueList((objects || []).map((object) => object.shape)).join('+');
        const materialSignature = uniqueList((objects || []).map((object) => object.material)).join('+');
        const visualGenome = visualGenomeForComposition(graph, objects, fields, solverPlan, spec, sceneKind);
        const visualIdentity = {
          schema: 'simulatte.visualIdentity.v1',
          sceneKind,
          dominantRegime,
          shapeSignature,
          materialSignature,
          fieldKinds,
          solverFamilies,
          objectCount: (objects || []).length,
          visualGenomeId: visualGenome.id,
          visualGenomeSeed: visualGenome.seed,
          visualDialect: visualGenome.visualDialect || '',
          compositionTopology: visualGenome.compositionTopology || '',
          cameraArchetype: visualGenome.cameraArchetype || '',
          scaleTier: visualGenome.scaleTier || '',
          motifs: visualGenome.motifs,
        };
        const registry = renderRegistryRef();
        const visualRecipe = registry && typeof registry.recipeForScene === 'function'
          ? registry.recipeForScene(sceneKind)
          : null;
        return {
          schema: 'simulatte.rendererPlan.v1',
          renderer: `simulatte.regime.${sceneKind}.v1`,
          sceneKind,
          dominantRegime,
          passOrder: renderPassOrder(sceneKind, solverFamilies),
          visualRecipe,
          visualIdentity,
          visualGenome,
        };
      }

    function visualIRForRenderProgram(graph, objects, fields, solverPlan, spec, rendererPlan, sceneKind) {
        const baseVisualGenome = rendererPlan && rendererPlan.visualGenome || {};
        const environmentPrograms = spec && spec.renderIR && spec.renderIR.environmentPrograms || [];
        const visualGenome = applyPromptEnvironmentVisualGenome(baseVisualGenome, environmentPrograms);
        const constructionApproach = spec && spec.renderIR && spec.renderIR.constructionApproach || {};
        const recipe = rendererPlan && rendererPlan.visualRecipe || null;
        const semantic = visualGenome.semanticVisuals || {};
        const causalAffordances = causalAffordancesFromSpec(spec, sceneKind);
        const graphicsAtoms = visualGraphicsAtomsForIR({
          sceneKind,
          objects,
          fields,
          solverPlan,
          spec,
          rendererPlan,
          causalAffordances,
          visualGenome,
          recipe,
        });
        const baseVisualEntities = filterPromptPartSupportEntities(
          (objects || []).map((object, index) => visualEntityForObject(object, index, sceneKind, constructionApproach)),
          spec && spec.renderIR && spec.renderIR.objects || []
        );
        const swimmingVisualLowering = lowerSwimmingVisualObligations(spec, baseVisualEntities, sceneKind);
        const visualEntities = swimmingVisualLowering.entities;
        const materialRows = uniqueVisualRows([
          ...swimmingVisualLowering.materials,
          ...visualMaterialsForObjects(objects, visualGenome, recipe, causalAffordances),
          ...visualMaterialsForGraphicsAtoms(graphicsAtoms.materials),
        ]);
        const fieldRows = uniqueVisualRows([
          ...swimmingVisualLowering.fields,
          ...(fields || []).map((field, index) => visualFieldForField(field, index, sceneKind)),
          ...visualFieldsForGraphicsAtoms(graphicsAtoms.fields, sceneKind),
        ]);
        const processRows = uniqueVisualRows([
          ...swimmingVisualLowering.processes,
          ...visualProcessesForPlan(objects, solverPlan, semantic, sceneKind, causalAffordances),
          ...visualProcessesForGraphicsAtoms(graphicsAtoms.processes, objects, sceneKind),
        ]);
        const geometryRows = [
          ...visualEntities.map((entity) => visualGeometryForEntity(entity, sceneKind)),
          ...visualGeometryForCausalAffordances(causalAffordances, sceneKind),
          ...visualGeometryForGraphicsAtoms(graphicsAtoms.geometry, sceneKind),
        ];
        const motionRows = uniqueVisualRows([
          ...visualMotionForProcesses(processRows, visualGenome, sceneKind, causalAffordances),
          ...visualMotionForGraphicsAtoms(graphicsAtoms.motion, visualGenome, sceneKind),
        ]);
        const renderInstances = visualRenderInstancesForIR(
          visualEntities,
          geometryRows,
          materialRows,
          fieldRows,
          processRows,
          motionRows,
          sceneKind
        );
        const compositionLedger = visualCompositionLedgerForSpec(spec, visualEntities, renderInstances, processRows, fieldRows);
        const operators = visualOperatorsForIR(
          visualEntities,
          materialRows,
          fieldRows,
          processRows,
          geometryRows,
          motionRows,
          recipe,
          causalAffordances,
          graphicsAtoms
        );
        const camera = {
          ...visualCameraForScene(sceneKind, recipe, visualEntities, visualGenome),
          atoms: graphicsAtoms.camera,
        };
        const lighting = applyPromptEnvironmentLighting(
          visualLightingForScene(sceneKind, recipe, visualGenome),
          environmentPrograms
        );
        const sceneRenderPacket = sceneRenderPacketForVisualIR({
          sceneKind,
          camera,
          lighting,
          entities: visualEntities,
          materials: materialRows,
          fields: fieldRows,
          processes: processRows,
          geometry: geometryRows,
          motion: motionRows,
          renderInstances,
          graphicsAtoms,
          compositionLedger,
          visualGenome,
        });
        assertScenePacketIdentityPreserved(sceneRenderPacket);
        return {
          schema: VISUAL_IR_SCHEMA,
          compiler: 'simulatte.visual-ir.compiler.v1',
          intentText: graph && graph.intentText || '',
          sceneKind,
          painterKind: recipe && recipe.painterKind || sceneKind,
          scale: visualScaleForScene(sceneKind, visualEntities),
          scaleTier: visualGenome.scaleTier || '',
          visualDialect: visualGenome.visualDialect || '',
          compositionTopology: visualGenome.compositionTopology || '',
          camera,
          lighting,
          entities: visualEntities,
          materials: materialRows,
          fields: fieldRows,
          processes: processRows,
          geometry: geometryRows,
          motion: motionRows,
          renderInstances,
          sceneRenderPacket,
          compositionLedger,
          rejectedRows: visualRejectedRowsForIR(rendererPlan, graphicsAtoms),
          graphicsAtoms,
          operators,
          causalAffordances,
          receipts: augmentVisualReceiptsWithIntentBrief(
            visualReceiptsForIR(
              visualEntities,
              materialRows,
              fieldRows,
              processRows,
              operators,
              rendererPlan,
              causalAffordances,
              graphicsAtoms,
              renderInstances,
              rendererPlan
            ),
            spec,
            sceneKind
          ).concat([visualCompositionLedgerReceipt(compositionLedger), swimmingVisualLowering.receipt]),
        };
      }

    function lowerSwimmingVisualObligations(spec = {}, entities = [], sceneKind = '') {
        const agents = swimmingAgentRows(entities, spec);
        if (!agents.length) {
          return {
            entities,
            materials: [],
            fields: [],
            processes: [],
            receipt: swimmingVisualLoweringReceipt([], [], [], []),
          };
        }
        const agentIds = new Set(agents.map((entity) => entity.id));
        let agentIndex = 0;
        const loweredEntities = (entities || []).map((entity) => {
          if (agentIds.has(entity.id)) {
            const lowered = lowerSwimmingAgentEntity(entity, agentIndex, agents.length, sceneKind);
            agentIndex += 1;
            return lowered;
          }
          if (isSwimmingWaterEntity(entity, sceneKind, spec)) {
            return lowerSwimmingWaterEntity(entity);
          }
          return entity;
        });
        const loweredAgents = loweredEntities.filter((entity) => agentIds.has(entity.id));
        const materials = speciesMaterialRowsForSwimmingAgents(loweredAgents);
        const fields = wakeFieldRowsForSwimmingAgents(loweredAgents);
        const processes = swimmingEffectRowsForAgents(loweredAgents);
        return {
          entities: loweredEntities,
          materials,
          fields,
          processes,
          receipt: swimmingVisualLoweringReceipt(loweredAgents, materials, fields, processes),
        };
      }

    function swimmingAgentRows(entities = [], spec = {}) {
        const obligations = spec && spec.renderIR && spec.renderIR.compositionLedger &&
          Array.isArray(spec.renderIR.compositionLedger.obligations)
          ? spec.renderIR.compositionLedger.obligations
          : [];
        const hasSwimmingObligation = obligations.some((row) => /swimming|wake-ripples|partial-submersion|swimming-pose/.test(row.id || ''));
        const rows = (entities || []).filter((entity) => {
          const species = swimmingAgentSpecies(entity);
          if (species !== 'dog' && species !== 'cat' && species !== 'animal') return false;
          return hasSwimmingObligation || entityHasSwimmingCue(entity);
        });
        const specific = rows.filter((entity) => {
          const species = swimmingAgentSpecies(entity);
          return species === 'dog' || species === 'cat';
        });
        return uniqueVisualRows(specific.length ? specific : rows).slice(0, 6);
      }

    function entityHasSwimmingCue(entity = {}) {
        const text = [
          swimmingEntityText(entity),
          entity.behavior && (entity.behavior.processes || []).join(' '),
          (entity.physicsOperators || []).join(' '),
          entity.stateBindings && Object.keys(entity.stateBindings).join(' '),
          entity.stateBindings && Object.values(entity.stateBindings).join(' '),
        ].filter(Boolean).join(' ').toLowerCase();
        return /\bswim|fluid_locomotion|wake_generation|body_water_contact|partial_submersion|submersion|wake/.test(text);
      }

    function swimmingAgentSpecies(entity = {}) {
        const identityText = swimmingEntityIdentityText(entity);
        const hasDogIdentity = /\bdogs?\b|(?:^|[-_])dog(?:[-_]|$)|surface[-_ ]dog|primitive[-_ ]dog/.test(identityText);
        const hasCatIdentity = /\bcats?\b|(?:^|[-_])cat(?:[-_]|$)|surface[-_ ]cat|primitive[-_ ]cat/.test(identityText);
        if (hasDogIdentity && !hasCatIdentity) return 'dog';
        if (hasCatIdentity && !hasDogIdentity) return 'cat';
        const text = swimmingEntityText(entity);
        const hasDogText = /\bdogs?\b|(?:^|[-_])dog(?:[-_]|$)|surface[-_ ]dog|primitive[-_ ]dog/.test(text);
        const hasCatText = /\bcats?\b|(?:^|[-_])cat(?:[-_]|$)|surface[-_ ]cat|primitive[-_ ]cat/.test(text);
        if (hasDogText && !hasCatText) return 'dog';
        if (hasCatText && !hasDogText) return 'cat';
        if (/\banimal|mammal|swimmer|animal-body/.test(identityText || text)) return 'animal';
        return '';
      }

    function swimmingEntityIdentityText(entity = {}) {
        return [
          entity.id,
          entity.sourceObject,
          entity.semanticRef,
          entity.physicalRef,
          entity.role,
          entity.kind,
          entity.shape,
          entity.material,
          entity.visualRegime,
          ...(entity.sourceIds || []),
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function swimmingEntityText(entity = {}) {
        return [
          entity.id,
          entity.label,
          entity.sourceObject,
          entity.semanticRef,
          entity.physicalRef,
          entity.role,
          entity.kind,
          entity.shape,
          entity.material,
          entity.visualRegime,
          ...(entity.sourceIds || []),
          ...(entity.evidence || []),
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function lowerSwimmingAgentEntity(entity = {}, index = 0, total = 1, sceneKind = '') {
        const species = swimmingAgentSpecies(entity) || 'animal';
        const pose = swimmingAgentPose(entity, index, total, species, sceneKind);
        return {
          ...entity,
          kind: 'agent',
          role: 'swimming-agent',
          material: speciesSwimMaterialId(species),
          shape: species === 'dog' ? 'dog-body' : species === 'cat' ? 'cat-body' : 'animal-body',
          pose,
          visualTraits: {
            ...(entity.visualTraits || {}),
            species,
            silhouette: species === 'dog'
              ? 'dog-body-long-muzzle'
              : species === 'cat' ? 'cat-body-arched-tail' : 'animal-body-swim',
            swimPose: species === 'dog' ? 'forelegs-paddle-head-up' : 'compact-paddle-tail-line',
            waterlineMask: true,
          },
          geometryConstraints: uniqueList([
            ...(entity.geometryConstraints || []),
            'species-distinct-silhouette',
            'swim-waterline',
            'partial-submersion',
            'wake-emitter',
          ]),
          stateBindings: {
            ...(entity.stateBindings || {}),
            swimPhase: entity.stateBindings && entity.stateBindings.swimPhase || `swim:${entity.id}`,
            wake: entity.stateBindings && entity.stateBindings.wake || `wake:${entity.id}`,
            submersion: entity.stateBindings && entity.stateBindings.submersion || `submersion:${entity.id}`,
          },
          physicsOperators: uniqueList([
            ...(entity.physicsOperators || []),
            'fluid_locomotion',
            'buoyancy',
            'drag',
            'wake_generation',
            'body_water_contact',
            'partial_submersion',
          ]),
          evidence: uniqueList([
            ...(entity.evidence || []),
            'visual-obligation:species-distinct-silhouettes',
            'visual-obligation:swimming-pose',
            'visual-obligation:partial-submersion',
          ]),
          confidence: Math.max(Number.isFinite(Number(entity.confidence)) ? Number(entity.confidence) : 0, 0.82),
          reason: 'swimming biological agent lowered into species-specific waterline render entity',
        };
      }

    function swimmingAgentPose(entity = {}, index = 0, total = 1, species = 'animal', sceneKind = '') {
        const count = Math.max(1, total);
        const baseX = count === 1 ? 0.5 : 0.36 + (index / Math.max(1, count - 1)) * 0.28;
        const speciesOffset = species === 'dog' ? -0.035 : species === 'cat' ? 0.035 : 0;
        const seed = hashProgram(`${sceneKind}:${entity.id}:${species}`) || 1;
        const x = clamp(baseX + speciesOffset + unitFromSeed(seed, 3) * 0.025 - 0.0125, 0.16, 0.84);
        const y = clamp(0.625 + index * 0.045 + unitFromSeed(seed, 5) * 0.025, 0.54, 0.74);
        const size = species === 'dog' ? [0.18, 0.085] : species === 'cat' ? [0.135, 0.07] : [0.15, 0.075];
        return {
          ...(entity.pose || {}),
          x,
          y,
          w: size[0],
          h: size[1],
          rotation: species === 'dog' ? -0.045 : 0.055,
          waterline: y,
        };
      }

    function speciesSwimMaterialId(species = 'animal') {
        if (species === 'dog') return 'dog-swim-fur';
        if (species === 'cat') return 'cat-swim-fur';
        return 'animal-swim-body';
      }

    function speciesMaterialRowsForSwimmingAgents(agents = []) {
        const species = uniqueList((agents || []).map(swimmingAgentSpecies).filter(Boolean));
        const rows = species.map((name) => {
          const style = speciesSwimMaterialStyle(name);
          return {
            id: speciesSwimMaterialId(name),
            family: 'biological',
            shader: 'fibrous-cellular-mesh',
            fill: style.fill,
            stroke: style.stroke,
            opacity: style.opacity,
            roughness: 0.68,
            emissive: false,
            evidence: [`species:${name}`, 'visual-obligation:species-distinct-silhouettes'],
            status: 'accepted',
            confidence: 0.9,
            reason: `${name} swimming material selected to preserve species identity`,
          };
        });
        if (agents.length) {
          rows.push({
            id: 'wake-ripple',
            family: 'fluid',
            shader: 'advected-ripple-volume',
            fill: '#c7f4ff',
            stroke: '#4aa9d8',
            opacity: 0.42,
            roughness: 0.18,
            emissive: false,
            evidence: ['visual-obligation:wake-ripples'],
            status: 'accepted',
            confidence: 0.86,
            reason: 'wake ripple material selected for swimming-agent trails',
          }, {
            id: 'submersion-mask',
            family: 'fluid',
            shader: 'advected-ripple-volume',
            fill: '#4ab5e8',
            stroke: '#1e6e9a',
            opacity: 0.5,
            roughness: 0.2,
            emissive: false,
            evidence: ['visual-obligation:partial-submersion'],
            status: 'accepted',
            confidence: 0.86,
            reason: 'submersion mask material selected for waterline clipping',
          });
        }
        return rows;
      }

    function speciesSwimMaterialStyle(species = 'animal') {
        if (species === 'dog') return { fill: '#8a5f3d', stroke: '#402917', opacity: 0.86 };
        if (species === 'cat') return { fill: '#d9cab1', stroke: '#6b5a47', opacity: 0.84 };
        return { fill: '#b68b6a', stroke: '#5b3e2f', opacity: 0.82 };
      }

    Object.assign(scope, {
      sceneKindForRenderIR,
      directSceneKindForRenderIR,
      directSceneKindForText,
      broadSceneHintCanYieldToDirectLanguage,
      normalizedSceneHint,
      nonFallbackSceneKind,
      sceneKindFromRenderIRSignals,
      directRenderIRSceneText,
      directPromptSceneText,
      hasDirectSwimmingSignal,
      hasDirectCombustionSignal,
      hasDirectAnimalOrPlantSignal,
      hasDirectMechanicalRigSignal,
      hasRoboticsSignal,
      positiveLanguageText,
      hasChemistryLabSignal,
      hasGranularCombustionSignal,
      hasThinFilmSignal,
      renderIRObjectSceneText,
      renderIRSceneText,
      specificGraphObjects,
      contextObjectForRenderIRScene,
      fieldKindForRenderIRField,
      uniqueFieldsByKind,
      uniqueObjectsById,
      shapeForRenderGlyph,
      poseForRenderObject,
      sizeForRenderGlyph,
      relationsFromPhysicsIR,
      renderObjectForNode,
      rendererPlanForComposition,
      visualIRForRenderProgram,
      lowerSwimmingVisualObligations,
      swimmingAgentRows,
      entityHasSwimmingCue,
      swimmingAgentSpecies,
      swimmingEntityIdentityText,
      swimmingEntityText,
      lowerSwimmingAgentEntity,
      swimmingAgentPose,
      speciesSwimMaterialId,
      speciesMaterialRowsForSwimmingAgents,
      speciesSwimMaterialStyle,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
