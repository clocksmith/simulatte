(function attachSimulatteCompositionGraphselectionlayout(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function style(fill, stroke, alpha) {
        return { fill, stroke, alpha };
      }

    function buildCompositionGraph(spec = {}) {
        const contract = spec.contract || {};
        const graph = contract.graph || {};
        const universeGraph = spec.universeGraph || {};
        const priors = selectionPriors(spec);
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
          intentText: compiledIntentText(universeGraph, spec),
          nodes,
          relations,
          operators,
          priors,
          provenance: {
            composer: 'simulatte.grid-like-composition.v1',
            source: 'concept-graph-selection-priors',
            conceptCount: Array.isArray(universeGraph.nodes) ? universeGraph.nodes.length : 0,
            primitiveCount: nodes.length,
          },
        };
      }

    function compiledIntentText(universeGraph = {}, spec = {}) {
        const renderIR = spec.renderIR || {};
        return [
          ...(universeGraph.nodes || []).map((node) => [
            node.id,
            node.canonicalId,
            node.primitiveId,
            node.label,
            node.kind,
            node.semanticType,
            ...(node.domains || []),
            ...(node.tags || []),
            ...(node.operatorHints || []),
          ].filter(Boolean).join(' ')),
          ...(universeGraph.visualAffordances || []).map((row) => [
            row.id,
            row.causalRelationId,
            row.sceneKind,
            row.geometry,
            ...(row.shaderHints || []),
            ...(row.motionHints || []),
          ].filter(Boolean).join(' ')),
          ...(renderIR.objects || []).map((object) => [
            object.id,
            object.label,
            object.glyph,
            object.materialId,
            object.visualRegime,
            object.semanticRef,
            object.physicalRef,
          ].filter(Boolean).join(' ')),
          ...(renderIR.fields || []).map((field) => [
            field.id,
            field.name,
            field.channel,
            field.domainId,
          ].filter(Boolean).join(' ')),
          ...(renderIR.causalAffordances || []).map((row) => [
            row.id,
            row.causalRelationId,
            row.sceneKind,
            row.geometry,
            ...(row.shaderHints || []),
            ...(row.motionHints || []),
          ].filter(Boolean).join(' ')),
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function selectionPriors(spec = {}) {
        const universeGraph = spec.universeGraph || {};
        const conceptGraph = Array.isArray(universeGraph.nodes) ? universeGraph.nodes : [];
        return conceptGraph
          .map((concept, index) => ({
            primitiveId: concept.primitiveId || concept.canonicalId || concept.id,
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
        const promptText = compiledPromptTextForSelection(spec);
        const sceneKind = selectionSceneKindForSpec(spec, promptText);
        const hasPromptGrounded = components.some((component) => isPromptGroundedComponent(component, promptText));
        const selected = [];
        for (const id of top) {
          if (byId.has(id) && !selected.includes(byId.get(id)) &&
            shouldSelectTopLevelComponent(byId.get(id), hasPromptGrounded, promptText, sceneKind)) {
            selected.push(byId.get(id));
          }
        }
        for (const component of components) {
          if (selected.length >= 24) break;
          if (isRequiredComponent(component) && !selected.includes(component)) selected.push(component);
        }
        for (const component of components) {
          if (selected.length >= 24) break;
          if (isPromptGroundedComponent(component, promptText) && !selected.includes(component)) selected.push(component);
        }
        for (const prior of priors) {
          if (selected.length >= 24) break;
          const component = byId.get(prior.primitiveId);
          if (component && !selected.includes(component) &&
            shouldSelectPriorComponent(component, selected, promptText, sceneKind)) {
            selected.push(component);
          }
        }
        for (const component of components) {
          if (selected.length >= 24) break;
          if (!selected.includes(component) && shouldSelectFallbackComponent(component, selected, promptText, sceneKind)) selected.push(component);
        }
        return selected;
      }

    function compiledPromptTextForSelection(spec = {}) {
        const promptParse = spec.promptParse || {};
        return [
          spec.name,
          spec.renderIR && spec.renderIR.prompt,
          spec.physicsIR && spec.physicsIR.prompt,
          ...((promptParse.spans || []).map((span) => span.text)),
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function selectionSceneKindForSpec(spec = {}, promptText = '') {
        const prompt = positiveLanguageText(promptText);
        const direct = nonFallbackSceneKind(spec && spec.renderIR && (spec.renderIR.sceneKind || spec.renderIR.sceneHint));
        if (direct) return direct;
        if (hasDirectSwimmingSignal(prompt)) return 'watershed';
        return baseSceneKindForPromptText(prompt) || expandedSceneKindForText(prompt) || '';
      }

    function shouldSelectPriorComponent(component, selected, promptText, sceneKind) {
        if (!component) return false;
        if (!(selected || []).some((item) => isPromptGroundedComponent(item, promptText))) return true;
        if (isPromptGroundedComponent(component, promptText)) return true;
        return sceneCompatibleSupportComponent(component, sceneKind, promptText);
      }

    function shouldSelectFallbackComponent(component, selected, promptText, sceneKind) {
        if (!component) return false;
        const source = String(component.source || '');
        if (!(selected || []).some((item) => isPromptGroundedComponent(item, promptText))) return true;
        if (isPromptGroundedComponent(component, promptText)) return true;
        if (source === 'semantic-surface-grounder') return false;
        return sceneCompatibleSupportComponent(component, sceneKind, promptText);
      }

    function shouldSelectTopLevelComponent(component, hasPromptGrounded, promptText, sceneKind) {
        if (!component) return false;
        const source = String(component.source || '');
        if (source !== 'catalog') return true;
        if (!hasPromptGrounded) return true;
        return sceneCompatibleSupportComponent(component, sceneKind, promptText);
      }

    function catalogSupportIsPrompted(component, promptText) {
        const prompt = String(promptText || '').toLowerCase();
        const id = String(component && component.id || '').toLowerCase();
        if (!prompt) return false;
        if (id === 'collision') return /\b(collision|collide|collides|colliding|crash|crashes|crashing|impact|hits?|strikes?)\b/.test(prompt);
        if (id === 'elasticity') return /\b(elastic|elasticity|spring|bounce|bouncy|deform|stretch)\b/.test(prompt);
        if (id === 'friction') return /\b(friction|slip|slide|drag|traction)\b/.test(prompt);
        if (id === 'constraint' || id === 'surface-boundary') return /\b(constraint|boundary|wall|contact|support|surface)\b/.test(prompt);
        if (id === 'time-step') return /\b(time[- ]?step|timestep|dt|integration)\b/.test(prompt);
        if (id === 'wave-source') return /\b(wave|waves|oscillation|speaker|sound|acoustic|driver)\b/.test(prompt);
        if (id === 'energy-ledger' || id === 'conservation-ledger') return /\b(energy|conservation|ledger|accounting|loss|stored)\b/.test(prompt);
        const terms = id.split(/[-_]+/).filter((term) => term.length > 2);
        return terms.length > 0 && terms.some((term) => new RegExp(`\\b${term}\\b`).test(prompt));
      }

    function sceneCompatibleSupportComponent(component, sceneKind, promptText) {
        if (!component) return false;
        if (catalogSupportIsPrompted(component, promptText)) return true;
        const source = String(component.source || '');
        if (source === 'semantic-surface-grounder') return false;
        if (source !== 'catalog') return true;
        const text = componentSelectionText(component);
        const prompt = String(promptText || '').toLowerCase();
        if (GENERIC_CATALOG_SUPPORT_IDS.has(component.id) && !catalogSupportIsPrompted(component, prompt)) {
          return false;
        }
        if (sceneKind === 'fire' || sceneKind === 'thermal-plume') {
          if (/\b(water|river|erosion|sediment|terrain|watershed|soil|rock-wall|flow-inlet|flow-outlet|fluid-advection|moving-fluid|buoyancy|population|growth-decay|infection|biology|optics|lens|mirror|prism|queue|network|traffic|market)\b/.test(text)) {
            return /\b(water|river|terrain|erosion|sediment|wet|rain|flood|flow|growth|plant|forest|tree)\b/.test(prompt);
          }
          return /\b(fire|flame|combust|smoke|fuel|wood|air|wind|oxygen|heat|thermal|radiation|cooling|phase-change|plasma)\b/.test(text);
        }
        if (sceneKind === 'optics' || sceneKind === 'thin-film') {
          if (/\b(water|fluid|flow|advection|pressure|moving-fluid|flow-inlet|flow-outlet|buoyancy)\b/.test(text)) {
            return /\b(water|fluid|river|pond|ocean|brine|liquid|through water)\b/.test(prompt);
          }
          if (/\b(fire|flame|smoke|combust|queue|traffic|market|network|infection|population|terrain|erosion|sediment)\b/.test(text)) {
            return false;
          }
          return /\b(optic|prism|lens|mirror|light|ray|glass|sensor|lamp|caustic|film|beam|radiation|transparent|crystal)\b/.test(text);
        }
        if (sceneKind === 'city' || sceneKind === 'civic-market' || sceneKind === 'digital-network' || sceneKind === 'venue-crowd') {
          if (/\b(fire|flame|smoke|wood|thermal|water|river|fluid|erosion|sediment|terrain|biology|protein|bacteria|animal)\b/.test(text)) {
            return /\b(fire|water|river|cooling|heat|thermal|animal|biology)\b/.test(prompt);
          }
          return /\b(network|queue|traffic|market|power|sensor|ledger|delay|controller|route|node|link|agent|platform|slot|logistics|server|rack|signal|grid|building|parcel|zoning|pedestrian)\b/.test(text);
        }
        if (sceneKind === 'watershed' || sceneKind === 'restoration-water' || sceneKind === 'ocean-cryosphere') {
          if (/\b(fire|flame|smoke|thermal|optic|lens|mirror|prism|queue|traffic|market|network)\b/.test(text)) {
            return false;
          }
          return /\b(water|river|flow|fluid|advection|pressure|terrain|heightfield|erosion|channel|sand|soil|clay|rock|sediment|gravity|granular|grain|slope|animal|body|biomass|swim|buoyancy|glacier|ice|ocean|storm|surge|wetland|mangrove|root)\b/.test(text);
        }
        if (sceneKind === 'biology' || sceneKind === 'molecular-biology' || sceneKind === 'evolution-ecology') {
          if (/\b(fire|flame|smoke|thermal|optic|lens|mirror|prism|queue|traffic|market|network|glacier)\b/.test(text)) {
            return false;
          }
          if (/\b(water|fluid|flow|advection)\b/.test(text)) {
            return /\b(water|fluid|swim|wetland|pond|river|nutrient|metabolite)\b/.test(prompt);
          }
          return /\b(animal|body|biomass|membrane|soft|growth|diffusion|nutrient|population|cell|protein|bacteria|mycelium|leaf|plant|root|tissue|metabolite|colony|organism|infection)\b/.test(text);
        }
        if (sceneKind === 'granular') {
          if (/\b(fire|flame|smoke|optic|lens|prism|queue|network)\b/.test(text)) return false;
          return /\b(granular|grain|bead|sieve|avalanche|powder|sand|rock|sediment|gravity|collision|constraint|friction|surface-boundary)\b/.test(text);
        }
        if (sceneKind === 'mechanical' || sceneKind === 'robotics-control') {
          if (/\b(fire|flame|smoke|thermal|fluid-advection|river|water|protein|bacteria)\b/.test(text)) return false;
          return /\b(collision|friction|rigid-body|soft-body|wheel|wall|constraint|surface-boundary|energy-ledger|metal|rubber|robot|gripper|servo|motor|contact|force|bearing|spring)\b/.test(text);
        }
        if (sceneKind === 'ferrofluid' || sceneKind === 'magnetic-machine') {
          if (/\b(fire|flame|smoke|queue|traffic|protein|bacteria|terrain|river)\b/.test(text)) return false;
          return /\b(magnet|ferrofluid|coil|current|conductor|copper|rotor|stator|wheel|slider|solar|panel|motor|load|flux|dipole|electric|field)\b/.test(text);
        }
        if (sceneKind === 'acoustic') {
          if (/\b(fire|flame|smoke|queue|traffic|network|optic|lens|prism)\b/.test(text)) return false;
          return /\b(acoustic|sound|wave|pressure|resonance|emitter|tube|water|brass|membrane|air|oscillator)\b/.test(text);
        }
        if (sceneKind === 'particle-instrument' || sceneKind === 'quantum-instrument') {
          return /\b(collider|muon|particle|track|detector|calorimeter|instrument|sensor|field|magnet|thermal|readout|measurement|optical|light)\b/.test(text);
        }
        if (sceneKind === 'planetary-space') {
          return /\b(planet|ring|moon|resonance|orbit|orbital|gravity|boulder|ice|space|trajectory|density|wave)\b/.test(text);
        }
        return false;
      }

    function componentSelectionText(component) {
        return [
          component && component.id,
          component && component.type,
          component && component.kind,
          component && component.role,
          component && component.phrase,
          component && component.shape,
          component && component.material,
          component && component.visualRegime,
          ...((component && component.domains) || []),
          ...((component && component.tags) || []),
          component && component.text,
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function phraseMatchesPrompt(phrase, promptText) {
        const phraseText = positiveLanguageText(phrase);
        const prompt = positiveLanguageText(promptText);
        if (!phraseText || !prompt) return false;
        if (prompt.includes(phraseText)) return true;
        const stop = new Set([
          'and', 'with', 'through', 'into', 'from', 'the', 'a', 'an', 'of', 'in', 'on',
          'environment', 'component', 'physics', 'material', 'primitive', 'generated',
        ]);
        const terms = phraseText.split(/\s+/).filter((term) => term.length > 2 && !stop.has(term));
        if (!terms.length) return false;
        return terms.every((term) => {
          const singular = term.endsWith('s') ? term.slice(0, -1) : term;
          return new RegExp(`\\b${singular}(?:s|es)?\\b`).test(prompt);
        });
      }

    function isPromptGroundedComponent(component, promptText = '') {
        const source = String(component && component.source || '');
        if (source === 'semantic-surface-grounder') {
          return phraseMatchesPrompt(component && component.phrase, promptText);
        }
        return /^embedding-guided-synth|open-semantic-rag|semantic-surface-grounder|prompt-family|prompt-explicit|render-ir|doppler-residual/.test(source) ||
          Boolean(component && component.phrase && source && source !== 'catalog');
      }

    function isRequiredComponent(component) {
        const source = String(component && component.source || '');
        return Boolean(component && component.pinned) || source === 'prompt-family';
      }

    function pinnedComponentIdsForSpec(spec) {
        void spec;
        return [];
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
          visualRegime: component.visualRegime || '',
          assembly: component.assembly || '',
          phrase: component.phrase || '',
          source: component.source || '',
          domains: component.domains || [],
          placement: placementFor(component, index, total, spec, contract),
          params: { ...(component.params || {}) },
          state: graphNode ? graphNode.state || null : component.state || null,
          ports: component.ports || null,
          primitiveProgram: component.primitiveProgram || null,
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
        const id = String(component && component.id || '');
        const text = componentText(component);
        const radial = radialPlacement(index, total, phase);
        if (id === 'rotor-wheel') return anchoredPlacement(0.5, 0.5, 0, index);
        if (id === 'stator-slider') return anchoredPlacement(0.68, 0.42, -0.18, index);
        if (id === 'solar-panel') return anchoredPlacement(0.18, 0.18, 0.18, index);
        if (id === 'motor-load') return anchoredPlacement(0.78, 0.74, 0.12, index);
        if (/load|generator|motor-load/.test(text)) return anchoredPlacement(0.78, 0.74, 0.12, index);
        if (/solar|sun|lamp|panel/.test(text)) return anchoredPlacement(0.18, 0.18, 0.18, index);
        if (/wheel|rotor/.test(text)) return anchoredPlacement(0.5, 0.5, 0, index);
        if (/slider|stator|magnet/.test(text)) return anchoredPlacement(0.68, 0.42, -0.18, index);
        if (/mycelium|bacteria|protein|leaf|cell/.test(text)) return anchoredPlacement(0.46, 0.56, 0, index);
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
        if (spec && spec.renderIR && spec.solverGraph) {
          return renderProgramFromRenderIR(graph, spec);
        }
        const initialObjects = graph.nodes.map((node) => renderObjectForNode(node, spec));
        const relations = graph.relations.map((relation) => ({
          ...relation,
          reason: relation.channel,
        }));
        const rawFields = fieldsForComposition(graph, spec);
        const sceneKind = resolveSceneKind(graph, initialObjects, rawFields, spec);
        const fields = focusFieldsForScene(rawFields, sceneKind);
        const layoutSolverPlan = refineSolverPlanForScene(solverPlanForComposition(graph, initialObjects), sceneKind);
        const layoutGenome = visualGenomeForComposition(graph, initialObjects, fields, layoutSolverPlan, spec, sceneKind);
        const laidOutObjects = layoutObjectsForScene(prioritizeObjectsForScene(initialObjects, sceneKind), sceneKind, spec, layoutGenome);
        const objectLedger = visualObjectAcceptanceLedger(laidOutObjects, sceneKind, spec);
        const objects = objectLedger.accepted;
        const visualRegimes = uniqueList(objects.map((object) => object.visualRegime));
        const emitters = emittersForComposition(graph);
        const solverPlan = refineSolverPlanForScene(solverPlanForComposition(graph, laidOutObjects), sceneKind);
        const rendererPlan = {
          ...rendererPlanForComposition(graph, objects, fields, solverPlan, spec, sceneKind),
          visualObjectLedger: objectLedger.summary,
        };
        const visualIR = visualIRForRenderProgram(graph, objects, fields, solverPlan, spec, rendererPlan, sceneKind);
        const program = {
          schema: RENDER_PROGRAM_SCHEMA,
          sourceGraphId: graph.graphId,
          intentText: graph.intentText,
          materials: { ...MATERIAL_STYLES },
          objects,
          supportObjects: objectLedger.rejected,
          visualAcceptance: objectLedger.receipts,
          relations,
          fields,
          emitters,
          solverPlan,
          rendererPlan,
          visualGenome: rendererPlan.visualGenome,
          visualIR,
          sceneRenderPacket: visualIR.sceneRenderPacket,
          camera: { framing: 'composition-2d', padding: 0.08, sceneKind: rendererPlan.sceneKind },
          provenance: {
            compiler: 'simulatte.composition-to-render-program.v1',
            nodeCount: graph.nodes.length,
            relationCount: graph.relations.length,
            operatorCount: graph.operators.length,
            visualRegimes,
            dominantRegime: rendererPlan.dominantRegime,
            sceneKind: rendererPlan.sceneKind,
            visualIdentity: rendererPlan.visualIdentity,
            visualGenome: rendererPlan.visualGenome,
            visualObjectLedger: objectLedger.summary,
            signature: uniqueList(graph.nodes.map((node) => node.shape)).join('+'),
          },
        };
        return program;
      }

    function augmentRenderProgramWithRenderIR(program, spec) {
        const renderObjects = spec.renderIR && spec.renderIR.objects || [];
        const bindingByText = renderBindingIndex(renderObjects);
        const objects = (program.objects || []).map((object) => {
          const key = bestRenderBindingKey(object, bindingByText);
          const binding = key ? bindingByText.get(key) : null;
          if (!binding) return object;
          return {
            ...object,
            stateBindings: binding.stateBindings || {},
            physicalRef: binding.physicalRef || object.physicalRef || '',
            semanticRef: binding.semanticRef || object.semanticRef || '',
          };
        });
        const fields = program.fields || [];
        const solverFamilies = uniqueList([
          ...((program.solverPlan && program.solverPlan.families) || []),
          ...((spec.solverGraph.steps || []).map((step) => step.solverId)),
        ]);
        return {
          ...program,
          objects,
          fields,
          renderIR: spec.renderIR,
          solverPlan: {
            ...(program.solverPlan || {}),
            families: solverFamilies,
            state: uniqueList([
              ...((program.solverPlan && program.solverPlan.state) || []),
              ...Object.keys(spec.solverGraph.channels || {}),
            ]),
            executableSteps: (spec.solverGraph.steps || []).map((step) => step.operatorType),
          },
          provenance: {
            ...(program.provenance || {}),
            renderIR: spec.renderIR.schema,
            solverGraph: spec.solverGraph.schema,
          },
        };
      }

    function renderBindingIndex(renderObjects) {
        const map = new Map();
        for (const object of renderObjects || []) {
          for (const key of renderBindingKeys(object)) {
            if (key && !map.has(key)) map.set(key, object);
          }
        }
        return map;
      }

    function renderBindingKeys(object) {
        return uniqueList([
          object.physicalRef,
          object.semanticRef,
          object.id,
          renderBindingTail(object.physicalRef),
          renderBindingTail(object.semanticRef),
          object.label,
        ].flatMap(renderBindingAliases)).filter((key) => key && !genericRenderBindingKey(key));
      }

    function bestRenderBindingKey(object, bindingByText) {
        const keys = Array.from(bindingByText.keys());
        const strongKeys = uniqueList([
          object.id,
          object.physicalRef,
          object.semanticRef,
          renderBindingTail(object.id),
          renderBindingTail(object.physicalRef),
          renderBindingTail(object.semanticRef),
        ].flatMap(renderBindingAliases)).filter(Boolean);
        for (const key of keys) {
          if (strongKeys.some((candidate) => renderBindingRefMatches(key, candidate))) return key;
        }
        const roleKeys = uniqueList([
          object.role,
          object.label,
        ].flatMap(renderBindingAliases)).filter((key) => key && !genericRenderBindingKey(key));
        for (const key of keys) {
          if (roleKeys.some((candidate) => renderBindingTokenMatches(key, candidate))) return key;
        }
        const text = renderBindingNormalize([
          object.id,
          object.role,
          object.shape,
          object.material,
          object.assembly,
          object.visualRegime,
        ].join(' '));
        for (const key of keys) {
          if (!key || genericRenderBindingKey(key)) continue;
          if (key.length >= 5 && (text.includes(key) || key.includes(renderBindingNormalize(object.id)))) return key;
        }
        if (/lava|magma/.test(text) && bindingByText.has('lava')) return 'lava';
        if (/turbine|rotor|wheel/.test(text) && bindingByText.has('turbine')) return 'turbine';
        if (/castle|wall/.test(text) && bindingByText.has('castle')) return 'castle';
        if (/ice/.test(text) && bindingByText.has('ice')) return 'ice';
        return '';
      }

    function renderBindingNormalize(value = '') {
        return String(value || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }

    function renderBindingAliases(value = '') {
        const key = renderBindingNormalize(value);
        if (!key) return [];
        const aliases = [key];
        const tail = renderBindingTail(key);
        if (tail && tail !== key) aliases.push(tail);
        const singular = renderBindingSingular(key);
        if (singular && singular !== key) aliases.push(singular);
        const singularTail = renderBindingSingular(tail);
        if (singularTail && singularTail !== tail) aliases.push(singularTail);
        return aliases;
      }

    function renderBindingTail(value = '') {
        const key = renderBindingNormalize(value);
        return key.replace(/^(?:render|semantic|primitive)-/, '');
      }

    function renderBindingSingular(value = '') {
        const key = renderBindingNormalize(value);
        if (key.endsWith('ies')) return `${key.slice(0, -3)}y`;
        if (key.endsWith('es')) return key.slice(0, -2);
        if (key.endsWith('s') && key.length > 3) return key.slice(0, -1);
        return key;
      }

    function genericRenderBindingKey(key = '') {
        return GENERIC_RENDER_BINDING_KEYS.has(renderBindingNormalize(key));
      }

    function renderBindingRefMatches(key = '', candidate = '') {
        const normalizedKey = renderBindingNormalize(key);
        const normalizedCandidate = renderBindingNormalize(candidate);
        if (!normalizedKey || !normalizedCandidate || genericRenderBindingKey(normalizedCandidate)) return false;
        return normalizedKey === normalizedCandidate ||
          normalizedKey.endsWith(`-${normalizedCandidate}`) ||
          normalizedCandidate.endsWith(`-${normalizedKey}`);
      }

    function renderBindingTokenMatches(key = '', candidate = '') {
        const normalizedKey = renderBindingNormalize(key);
        const normalizedCandidate = renderBindingNormalize(candidate);
        const singularKey = renderBindingSingular(normalizedKey);
        const singularCandidate = renderBindingSingular(normalizedCandidate);
        if (!singularKey || !singularCandidate || genericRenderBindingKey(singularCandidate)) return false;
        if (singularKey === singularCandidate) return true;
        const escaped = singularCandidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|-)${escaped}(?:-|$)`).test(singularKey);
      }

    function renderProgramFromRenderIR(graph, spec) {
        const renderIR = spec.renderIR || {};
        const solverGraph = spec.solverGraph || {};
        const bindingByText = renderBindingIndex(renderIR.objects || []);
        const irObjects = (renderIR.objects || []).map((object, index) => ({
          id: object.physicalRef || object.id,
          kind: object.glyph === 'field' ? 'field' : 'body',
          material: object.materialId || 'metal',
          role: object.label || object.semanticRef || object.id,
          shape: shapeForRenderGlyph(object.glyph, object),
          visualRegime: object.visualRegime || '',
          assembly: object.semanticRef || '',
          phrase: object.label || '',
          source: 'render-ir',
          pose: poseForRenderObject(object, index, renderIR.objects.length),
          dynamics: {},
          stateBindings: object.stateBindings || {},
          behavior: object.behavior || null,
          physicsOperators: object.physicsOperators || [],
          physicalRef: object.physicalRef || '',
          semanticRef: object.semanticRef || '',
          required: true,
        }));
        const graphObjects = (graph.nodes || [])
          .map((node) => renderObjectForNode(node, spec))
          .map((object) => bindRenderIRToObject(object, bindingByText));
        const sceneKind = sceneKindForRenderIR(renderIR, solverGraph, graph, graphObjects, spec);
        const irContext = unmatchedRenderIRObjects(graphObjects, irObjects, sceneKind);
        const layoutFields = focusFieldsForScene(fieldsForComposition(graph, spec), sceneKind);
        const layoutSolverPlan = refineSolverPlanForScene(solverPlanForComposition(graph, graphObjects), sceneKind);
        const layoutGenome = visualGenomeForComposition(graph, graphObjects, layoutFields, layoutSolverPlan, spec, sceneKind);
        const laidOutObjects = preservePromptGroundedSurfaceObjects(layoutObjectsForScene(
          prioritizeObjectsForScene(uniqueObjectsById([...graphObjects, ...irContext]), sceneKind),
          sceneKind,
          spec,
          layoutGenome
        ), graphObjects, spec, sceneKind);
        const objectLedger = visualObjectAcceptanceLedger(laidOutObjects, sceneKind, spec);
        const objects = objectLedger.accepted;
        const irFields = (renderIR.fields || []).map((field) => ({
          id: field.id,
          kind: fieldKindForRenderIRField(field, sceneKind),
          channel: field.channel,
          stateBinding: field.channel,
          domainId: field.domainId,
          strength: 0.7,
        }));
        const legacyFields = fieldsForComposition(graph, spec);
        const fields = focusFieldsForScene(uniqueFieldsByKind([...irFields, ...legacyFields]), sceneKind);
        const legacySolverPlan = refineSolverPlanForScene(solverPlanForComposition(graph, laidOutObjects), sceneKind);
        const solverSteps = solverGraphStepsForScene((solverGraph && solverGraph.steps) || [], sceneKind);
        const solverPlan = {
          schema: 'simulatte.solverPlan.v1',
          integrator: legacySolverPlan.integrator || 'mixed-semi-implicit',
          families: uniqueList([
            ...((legacySolverPlan && legacySolverPlan.families) || []),
            ...(solverSteps.map((step) => step.solverId)),
          ]),
          state: uniqueList([
            ...((legacySolverPlan && legacySolverPlan.state) || []),
            ...Object.keys(solverGraph.channels || {}),
          ]),
          steps: solverSteps.map((step) => step.operatorType),
          executableSteps: solverSteps.map((step) => step.operatorType),
        };
        const rendererPlan = {
          ...rendererPlanForComposition(graph, objects, fields, solverPlan, spec, sceneKind),
          visualObjectLedger: objectLedger.summary,
        };
        const visualIR = visualIRForRenderProgram(graph, objects, fields, solverPlan, spec, rendererPlan, sceneKind);
        return {
          schema: RENDER_PROGRAM_SCHEMA,
          sourceGraphId: graph.graphId,
          intentText: graph.intentText,
          materials: { ...MATERIAL_STYLES },
          objects,
          supportObjects: objectLedger.rejected,
          visualAcceptance: objectLedger.receipts,
          relations: relationsFromPhysicsIR(spec),
          fields,
          emitters: emittersForComposition(graph),
          solverPlan,
          rendererPlan,
          visualGenome: rendererPlan.visualGenome,
          visualIR,
          sceneRenderPacket: visualIR.sceneRenderPacket,
          renderIR,
          camera: { framing: 'composition-2d', padding: 0.08, sceneKind },
          provenance: {
            compiler: 'simulatte.render-ir-to-render-program.v1',
            nodeCount: objects.length,
            relationCount: spec.physicsIR ? (spec.physicsIR.couplings || []).length : 0,
            operatorCount: solverGraph.steps ? solverGraph.steps.length : 0,
            visualRegimes: uniqueList(objects.map((object) => object.visualRegime)),
            dominantRegime: rendererPlan.dominantRegime,
            sceneKind,
            visualIdentity: rendererPlan.visualIdentity,
            visualGenome: rendererPlan.visualGenome,
            visualObjectLedger: objectLedger.summary,
            signature: uniqueList(objects.map((object) => object.shape)).join('+'),
            renderIR: renderIR.schema,
            solverGraph: solverGraph.schema,
          },
        };
      }

    function bindRenderIRToObject(object, bindingByText) {
        const key = bestRenderBindingKey(object, bindingByText);
        const binding = key ? bindingByText.get(key) : null;
        if (!binding) return object;
        return {
          ...object,
          stateBindings: binding.stateBindings || {},
          behavior: binding.behavior || object.behavior || null,
          physicsOperators: uniqueList([...(object.physicsOperators || []), ...(binding.physicsOperators || [])]),
          physicalRef: binding.physicalRef || object.physicalRef || '',
          semanticRef: binding.semanticRef || object.semanticRef || '',
        };
      }

    function preservePromptGroundedSurfaceObjects(objects, graphObjects, spec, sceneKind) {
        const promptText = compiledPromptTextForSelection(spec);
        const existing = new Set((objects || []).map((object) => object.id));
        const directSurface = (graphObjects || []).filter((object) => {
          if (!object || existing.has(object.id)) return false;
          if (object.source !== 'semantic-surface-grounder') return false;
          if (!isPromptGroundedComponent(object, promptText)) return false;
          return sceneObjectPriority(object, sceneKind) >= 0;
        });
        if (!directSurface.length) return objects;
        return uniqueObjectsById([...objects, ...directSurface]).slice(0, 24);
      }

    function unmatchedRenderIRObjects(graphObjects, irObjects, sceneKind) {
        const seen = new Set((graphObjects || []).flatMap((object) => [
          object.id,
          object.semanticRef,
          object.physicalRef,
        ].map((value) => String(value || '').toLowerCase()).filter(Boolean)));
        return (irObjects || [])
          .filter((object) => {
            const text = renderObjectText(object);
            if ([object.id, object.semanticRef, object.physicalRef]
              .some((value) => seen.has(String(value || '').toLowerCase()))) {
              return false;
            }
            return contextObjectForRenderIRScene(text, sceneKind);
          })
          .slice(0, 10);
      }

    Object.assign(scope, {
      style,
      buildCompositionGraph,
      compiledIntentText,
      selectionPriors,
      selectGraphNodes,
      compiledPromptTextForSelection,
      selectionSceneKindForSpec,
      shouldSelectPriorComponent,
      shouldSelectFallbackComponent,
      shouldSelectTopLevelComponent,
      catalogSupportIsPrompted,
      sceneCompatibleSupportComponent,
      componentSelectionText,
      phraseMatchesPrompt,
      isPromptGroundedComponent,
      isRequiredComponent,
      pinnedComponentIdsForSpec,
      compositionNode,
      graphNodeFor,
      compositionRelations,
      placementFor,
      anchoredPlacement,
      clampAnchor,
      radialPlacement,
      linePlacement,
      gridPlacement,
      flowPlacement,
      patchPlacement,
      compileCompositionToRenderProgram,
      augmentRenderProgramWithRenderIR,
      renderBindingIndex,
      renderBindingKeys,
      bestRenderBindingKey,
      renderBindingNormalize,
      renderBindingAliases,
      renderBindingTail,
      renderBindingSingular,
      genericRenderBindingKey,
      renderBindingRefMatches,
      renderBindingTokenMatches,
      renderProgramFromRenderIR,
      bindRenderIRToObject,
      preservePromptGroundedSurfaceObjects,
      unmatchedRenderIRObjects,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
