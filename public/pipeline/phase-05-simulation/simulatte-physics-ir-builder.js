(function attachSimulattePhysicsIRbuilder(root) {
  const scope = root.__SimulattePhysicsIRRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function buildPhysicsIR(input = {}) {
        const universeGraph = input.universeGraph || { nodes: [], edges: [], unresolved: [] };
        const intentBrief = universeGraph.intentBrief || null;
        const prompt = universeGraph.prompt || '';
        const params = input.params || {};
        const entities = [];
        const domains = [];
        const stateFields = [];
        const rigidBodies = [];
        const particles = [];
        const constraints = [];
        const operators = [];
        const couplings = [];
        const behaviorRelations = [];
        const boundaryConditions = [];
        const controls = Object.keys(params).map((key) => ({ id: key, value: params[key] }));
        const receipt = emptyReceipt();
        const domainByNode = new Map();
        const materialAssignments = materialAssignmentsForGraph(universeGraph);
        const environmentPrograms = (universeGraph.environmentPrograms || []).map((row) => ({ ...row }));

        for (const node of universeGraph.nodes || []) {
          if (materialAssignments.sourceNodeIds.has(node.id)) {
            receipt.exact.push({
              promptSpan: node.label,
              canonicalId: node.canonicalId,
              confidence: node.confidence,
              loweredAs: 'material assignment',
            });
            continue;
          }
          const semanticType = String(node.semanticType || node.type || '').toLowerCase();
          if (node.supportOnly === true || /^(event|process|action|observable|operator|part|property|state)$/.test(semanticType)) {
            receipt.exact.push({
              promptSpan: node.label,
              canonicalId: node.canonicalId,
              confidence: node.confidence,
              loweredAs: 'non-entity semantic evidence',
            });
            continue;
          }
          const entity = entityForNode(node, materialAssignments.byTargetNodeId.get(node.id) || '');
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

        addCouplingsFromEdges(
          couplings,
          operators,
          stateFields,
          domainByNode,
          universeGraph.edges || [],
          params,
          receipt,
          behaviorRelations
        );
        if (typeof addBehaviorBundlesFromLedger === 'function') {
          addBehaviorBundlesFromLedger(
            couplings,
            operators,
            stateFields,
            domains,
            universeGraph.compositionLedger,
            prompt,
            params,
            receipt,
            behaviorRelations
          );
        }
        addImplicitCouplings(couplings, operators, domains, params, receipt);
        addFallbackIfNeeded(entities, domains, stateFields, operators, boundaryConditions, prompt, params, receipt);
        addIntentBriefReceipt(receipt, intentBrief);

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
          behaviorRelations,
          boundaryConditions,
          controls,
          readouts,
          environmentPrograms,
          promptVisualObligations: (universeGraph.promptVisualObligations || []).map((row) => ({ ...row })),
          receipt,
          typedEvidenceBuckets: universeGraph.typedEvidenceBuckets || null,
          compositionLedger: lowerCompositionLedgerForPhysics(universeGraph.compositionLedger, behaviorRelations),
          provenance: {
            compiler: 'simulatte.physics-ir.v1',
            universeGraph: universeGraph.schema || '',
          },
        };
      }

    function emptyReceipt() {
        return { exact: [], approximate: [], unresolved: [], unsupported: [] };
      }

    function addIntentBriefReceipt(receipt, intentBrief) {
        if (!intentBrief) return;
        for (const edge of intentBrief.causalGraph || []) {
          receipt.exact.push({
            promptSpan: edge.mechanism || edge.id || 'intent causal edge',
            canonicalId: edge.operatorType || edge.relationType || '',
            confidence: edge.confidence || 0,
            evidence: edge.evidence || [],
          });
        }
        for (const assumption of intentBrief.assumptions || []) {
          receipt.approximate.push({
            promptSpan: assumption.label || assumption.id,
            reason: assumption.statement || 'explicit intent assumption',
            evidence: assumption.evidence || [],
          });
        }
        for (const row of intentBrief.unsupported || []) {
          receipt.unsupported.push({
            promptSpan: row.label || row.id,
            reason: row.reason || 'unsupported by intent brief',
            fallback: row.fallback || '',
          });
        }
        for (const row of intentBrief.degradedTo || []) {
          receipt.approximate.push({
            promptSpan: row.label || row.id,
            reason: row.reason || 'intent brief selected degraded executable approximation',
          });
        }
      }

    function materialAssignmentsForGraph(universeGraph = {}) {
        const byNodeId = new Map((universeGraph.nodes || []).map((node) => [node.id, node]));
        const byTargetNodeId = new Map();
        const sourceNodeIds = new Set();
        for (const edge of universeGraph.edges || []) {
          if (edge.type !== 'materialOf') continue;
          const materialNode = byNodeId.get(edge.from);
          if (!materialNode || !edge.to) continue;
          const materialId = materialNode.materialId || String(materialNode.canonicalId || materialNode.label || '')
            .split(/[._-]/).filter(Boolean).pop();
          if (!materialId) continue;
          byTargetNodeId.set(edge.to, materialId);
          sourceNodeIds.add(edge.from);
        }
        return { byTargetNodeId, sourceNodeIds };
      }

    function entityForNode(node, materialOverride = '') {
        return {
          id: slugify(node.id || node.canonicalId || node.label),
          sourceNodeId: node.id,
          canonicalId: node.canonicalId,
          label: node.label || node.canonicalId,
          sourceLabel: node.sourceLabel || (node.aliases || [])[0] || node.label || node.canonicalId,
          semanticType: node.semanticType || 'body',
          semanticClass: node.semanticClass || '',
          visualArchetype: node.visualArchetype || '',
          aliases: node.aliases || [],
          shapeHints: node.shapeHints || [],
          construction: node.construction || null,
          constructionHypotheses: (node.constructionHypotheses || []).map((row) => ({ ...row })),
          constructionProvenance: node.constructionProvenance || [],
          properties: (node.properties || []).map((row) => ({ ...row })),
          partGraph: (node.partGraph || []).map((row) => ({
            ...row,
            properties: (row.properties || []).map((property) => ({ ...property })),
          })),
          cardinality: Number.isFinite(Number(node.cardinality)) ? Number(node.cardinality) : 1,
          poseHint: node.poseHint ? { ...node.poseHint } : null,
          directlyGrounded: node.directlyGrounded === true || node.indexName === 'prompt-typed-slot',
          materialId: materialOverride || node.materialId || materialFromDomains([
            ...(node.domains || []),
            node.label,
            node.canonicalId,
          ]),
          domains: node.domains || [],
          operatorHints: node.operatorHints || [],
          evidence: node.evidence || [],
          geometryRef: geometryForNode(node),
          confidence: node.confidence,
        };
      }

    function geometryForNode(node) {
        if (node.construction) {
          return {
            kind: 'constructive-program',
            construction: node.construction,
            constructionHypotheses: (node.constructionHypotheses || []).map((row) => ({ ...row })),
            bounds: [0.2, 0.24, 0.28, 0.24],
          };
        }
        if (node.directlyGrounded === true && /^(dog|cat)$/.test(String(node.visualArchetype || ''))) {
          return { kind: 'animal-body', joints: 6, bounds: [0.22, 0.34, 0.24, 0.14] };
        }
        if (node.directlyGrounded === true && node.visualArchetype) {
          return {
            kind: 'semantic-object',
            archetype: node.visualArchetype,
            bounds: [0.32, 0.34, 0.24, 0.2],
          };
        }
        const text = [
          node.label,
          node.canonicalId,
          node.semanticType,
          ...(node.domains || []),
          ...(node.operatorHints || []),
          ...(node.shapeHints || []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (/\b(gut|microbiome|microbe|microbes|bacteria|colonies|colony|intestinal|intestine|immune|metabolite|metabolites|fold|folds|tissue)\b/.test(text)) {
          return { kind: 'tissue-colony-fold', folds: 7, colonies: 18, bounds: [0.12, 0.18, 0.76, 0.62] };
        }
        if (/\b(protein|molecular|bond|gluten|dough|strand|enzyme|ribosome)\b/.test(text)) {
          return { kind: 'chain-network', nodes: 18, bounds: [0.18, 0.22, 0.64, 0.48] };
        }
        if (/\b(root|mangrove|coral|algae|mycelium|biofilm|colony|branch)\b/.test(text)) {
          return { kind: 'branch-network', nodes: 22, bounds: [0.12, 0.2, 0.72, 0.56] };
        }
        if (/\b(dog|dogs|cat|cats|mammal|mammals|animal|animals|gait|fur)\b|small[_-]?mammal|medium[_-]?mammal/.test(text)) {
          return { kind: 'animal-body', joints: 6, bounds: [0.22, 0.34, 0.24, 0.14] };
        }
        if (/\b(flower|flowers|plant|plants|leaf|leaves|tree|trees|garden|crop|botanical|biomass)\b|light[_-]?response/.test(text)) {
          return { kind: 'botanical-cluster', stems: 12, bounds: [0.18, 0.24, 0.44, 0.5] };
        }
        if (/\b(robot|robotic|gripper|servo|workcell|manipulator|armature)\b/.test(text)) {
          return { kind: 'articulated-arm', joints: 4, anchor: [0.62, 0.48] };
        }
        if (/\b(railway|rail|train|subway|dispatch|signal block|signal blocks|platform|slot|slots|delayed)\b/.test(text)) {
          return { kind: 'rail-dispatch-grid', nodes: 14, bounds: [0.1, 0.2, 0.8, 0.52] };
        }
        if (/\b(data center|server|rack|racks|cooling aisle|cooling aisles)\b/.test(text)) {
          return { kind: 'data-center-grid', nodes: 12, bounds: [0.1, 0.18, 0.8, 0.58] };
        }
        if (/\b(zoning|shadow|pedestrian|comfort|sunlight|building masses|city grid|urban)\b/.test(text)) {
          return { kind: 'civic-shadow-volume', cells: 12, bounds: [0.12, 0.16, 0.76, 0.64] };
        }
        if (/\b(lab|sample holder|sample|phase study|generic lab)\b/.test(text)) {
          return { kind: 'lab-sample-stage', panels: 3, bounds: [0.2, 0.26, 0.58, 0.42] };
        }
        if (/\b(glacier|iceberg|fjord|sea ice|ice shelf|calving|ocean)\b/.test(text)) {
          return { kind: 'ice-water-section', bounds: [0.08, 0.16, 0.84, 0.66] };
        }
        if (/\b(detector|calorimeter|sensor|readout|chip|resonator|instrument)\b/.test(text)) {
          return { kind: 'instrument-plane', panels: 5, bounds: [0.14, 0.18, 0.72, 0.58] };
        }
        if (/\b(server|rack|data center|warehouse|queue|traffic|market|city|zoning)\b/.test(text)) {
          return { kind: 'node-grid', nodes: 9, bounds: [0.12, 0.18, 0.76, 0.62] };
        }
        if (/\b(building|stairwell|concrete|wall|castle|cathedral)\b/.test(text)) {
          return { kind: 'sectioned-structure', bounds: [0.58, 0.24, 0.24, 0.5] };
        }
        if (/\b(fire|flame|smoke|soot|plume|combustion)\b/.test(text)) {
          return { kind: 'plume-volume', bounds: [0.18, 0.18, 0.58, 0.68] };
        }
        if (/\b(planet|moon|ring|rings|orbit|orbital|asteroid|space)\b/.test(text)) {
          return { kind: 'orbital-system', bodies: 5, anchor: [0.5, 0.5] };
        }
        if (/\b(turbine|rotor|wheel)\b/.test(text)) return { kind: 'disk', radius: 0.12, anchor: [0.54, 0.52] };
        if (/\b(lava|river|water|wind|rain|flow|fluid|channel)\b/.test(text)) {
          return { kind: 'flow-channel', bounds: [0.08, 0.18, 0.84, 0.64] };
        }
        if (/\b(wall|castle|cathedral)\b/.test(text)) return { kind: 'barrier', bounds: [0.68, 0.28, 0.12, 0.46] };
        if (/\b(projectile|hammer)\b/.test(text)) return { kind: 'point-body', radius: 0.045, anchor: [0.22, 0.42] };
        if (/\b(network|queue|traffic|market|city)\b/.test(text)) return { kind: 'node-grid', nodes: 6 };
        return { kind: 'body', bounds: [0.32, 0.34, 0.24, 0.2] };
      }

    function domainForEntity(entity, node, index) {
        const domains = node.domains || entity.domains || [];
        const operatorHints = uniqueList([...(entity.operatorHints || []), ...(node.operatorHints || [])]);
        const kind = inferredDomainKind(entity, node, domains);
        const tags = domainTagsForEntity(entity, node, domains, operatorHints);
        return {
          id: `domain:${entity.id}`,
          entityId: entity.id,
          sourceNodeId: node.id,
          kind,
          materialId: entity.materialId,
          geometryRef: entity.geometryRef,
          tags,
          operatorHints,
          order: index,
        };
      }

    function inferredDomainKind(entity, node, domains) {
        const semanticType = entity.semanticType || node.semanticType || '';
        const text = [
          entity.id,
          entity.label,
          entity.canonicalId,
          semanticType,
          ...(domains || []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (entity.directlyGrounded === true && entity.visualArchetype &&
          !/^(?:environment|material|medium)$/.test(String(semanticType).toLowerCase())) {
          return 'rigidBody';
        }
        if (/\b(railway|rail|train|subway|dispatch|signal|platform|slot|zoning|queue|traffic|market|network|agent|server|city)\b/.test(text)) {
          return 'network';
        }
        if (/\b(sunlight|shadow|phase study|lab sample|sample holder|immune sampling|metabolite|nutrient|density)\b/.test(text)) {
          return 'field';
        }
        if (/\b(lava|magma|water|river|lake|pool|pond|ocean|fluid|flow channel)\b/.test(text)) {
          return 'fluid';
        }
        return preferredDomainKind(domains, semanticType);
      }

    function domainTagsForEntity(entity, node, domains, operatorHints) {
        const identityText = [
          entity.id,
          entity.label,
          entity.canonicalId,
          node && node.label,
          ...(domains || []),
        ].filter(Boolean).join(' ').toLowerCase();
        const text = [
          identityText,
          ...(operatorHints || []),
        ].filter(Boolean).join(' ').toLowerCase();
        const opticalOnlyLight = /\b(sunlight|shadow|shadows|light volume|light volumes)\b/.test(identityText) &&
          !/\b(heat|heated|heating|thermal|temperature|cooling|coolant|fire|flame|smoke|steam)\b/.test(identityText);
        return uniqueList([
          entity.semanticType,
          ...(domains || []).filter((domain) => !(opticalOnlyLight && domain === 'thermal')),
          ...(operatorHints || []).filter((hint) => !(opticalOnlyLight && hint === 'heat_transfer')),
        ].filter(Boolean));
      }

    function preferredDomainKind(domains, semanticType) {
        if (semanticType === 'network') return 'network';
        if (semanticType === 'fluid') return 'fluid';
        if (semanticType === 'observable') return 'field';
        if ((domains || []).some((domain) => /^(water|lake|pool|pond|river|ocean|beach)$/.test(domain))) return 'fluid';
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
          hasTag(domain, 'constraint') ||
          hasTag(domain, 'atomic') ||
          hasTag(domain, 'protein') ||
          hasTag(domain, 'robotic') ||
          hasTag(domain, 'contact')
        ) {
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
        if (
          hasTag(domain, 'growth') ||
          hasTag(domain, 'biological') ||
          hasTag(domain, 'protein') ||
          hasOperatorHint(domain, 'growth_decay')
        ) {
          addField(fields, domain, 'density', 'scalar', 'ratio', 0.28);
          addField(fields, domain, 'nutrient', 'scalar', 'ratio', 0.62);
        }
        if (
          hasTag(domain, 'reaction') ||
          hasTag(domain, 'chemical') ||
          hasTag(domain, 'fermentation') ||
          hasOperatorHint(domain, 'reaction_diffusion')
        ) {
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
        if (
          hasTag(domain, 'growth') ||
          hasTag(domain, 'biological') ||
          hasTag(domain, 'protein') ||
          hasOperatorHint(domain, 'growth_decay')
        ) {
          addOperator(operators, 'growth_decay', domain, {
            reads: [`density:${entity.id}`, `nutrient:${entity.id}`],
            writes: [`density:${entity.id}`, `nutrient:${entity.id}`],
            params: { rate: clamp01(Number(params.populationGrowth || 0.32)) },
          });
        }
        if (
          hasTag(domain, 'reaction') ||
          hasTag(domain, 'chemical') ||
          hasTag(domain, 'fermentation') ||
          hasOperatorHint(domain, 'reaction_diffusion')
        ) {
          addOperator(operators, 'reaction_diffusion', domain, {
            reads: [`reactionProgress:${entity.id}`],
            writes: [`reactionProgress:${entity.id}`],
            params: { rate: clamp01(Number(params.catalyst || params.combustibility || 0.46)) },
          });
        }
        if (
          hasTag(domain, 'constraint') ||
          hasTag(domain, 'atomic') ||
          hasTag(domain, 'protein') ||
          /\b(bond|constraint)\b/i.test(entity.label || entity.canonicalId || '')
        ) {
          addOperator(operators, 'fracture_threshold', domain, {
            reads: [`stress:${entity.id}`, `damage:${entity.id}`],
            writes: [`damage:${entity.id}`],
            params: { threshold: clamp(Number(params.bondStrength || 0.58), 0.05, 1.4) },
          });
        }
        if (/\b(robot|robotic|gripper|servo|workcell|manipulator|twist)\b/i.test(entity.label || entity.canonicalId || '')) {
          addOperator(operators, 'rotational_torque', domain, {
            reads: [`angle:${entity.id}`, `angularVelocity:${entity.id}`, `torque:${entity.id}`],
            writes: [`angularVelocity:${entity.id}`, `angle:${entity.id}`, `torque:${entity.id}`],
            params: { coupling: clamp(Number(params.fieldStrength || 0.62), 0.05, 2) },
          });
        }
        if (node && node.semanticType === 'observable' && !node.operatorHints.length) {
          addOperator(operators, 'derive_readout', domain, { reads: [], writes: [], params: { label: node.label } });
        }
      }

    function addCouplingsFromEdges(couplings, operators, fields, domainByNode, edges, params, receipt, behaviorRelations) {
        for (const edge of edges || []) {
          const from = domainByNode.get(edge.from);
          const to = domainByNode.get(edge.to);
          if (!from || !to) continue;
          if (isSwimmingEdge(edge, from, to)) {
            addSwimmingBehaviorFromEdge(couplings, operators, fields, from, to, edge, params, receipt, behaviorRelations);
            continue;
          }
          if (
            typeof addBehaviorBundleFromEdge === 'function' &&
            addBehaviorBundleFromEdge(couplings, operators, fields, from, to, edge, params, receipt, behaviorRelations)
          ) {
            continue;
          }
          if (edge.type === 'adjacent') {
            receipt.approximate.push({
              promptSpan: `${edge.from} adjacent ${edge.to}`,
              reason: 'compiled as colocated domains without a coupling operator',
            });
            continue;
          }
          if (edge.type === 'materialOf') continue;
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

    function isSwimmingEdge(edge = {}, from = {}, to = {}) {
        const text = [
          edge.type,
          edge.processId,
          edge.relation,
          edge.causalAffordance,
          from.entityId,
          to.entityId,
          ...(from.tags || []),
          ...(to.tags || []),
        ].filter(Boolean).join(' ').toLowerCase();
        return /\bswim|swimming|agents-in-water\b/.test(text) &&
          isAnimalDomain(from) &&
          isWaterDomain(to);
      }

    function addSwimmingBehaviorFromEdge(couplings, operators, fields, agentDomain, waterDomain, edge, params, receipt, behaviorRelations) {
        ensureSwimmingFields(fields, agentDomain);
        ensureWaterFields(fields, waterDomain, params);
        const operatorsForBehavior = [
          addSwimmingOperator(operators, 'fluid_locomotion', agentDomain, waterDomain, params),
          addSwimmingOperator(operators, 'buoyancy', agentDomain, waterDomain, params),
          addSwimmingOperator(operators, 'drag', agentDomain, waterDomain, params),
          addSwimmingOperator(operators, 'wake_generation', agentDomain, waterDomain, params),
          addSwimmingOperator(operators, 'body_water_contact', agentDomain, waterDomain, params),
          addSwimmingOperator(operators, 'partial_submersion', agentDomain, waterDomain, params),
        ];
        for (const op of operatorsForBehavior) {
          couplings.push({
            from: agentDomain.id,
            to: waterDomain.id,
            type: op.type,
            operatorId: op.id,
            processId: edge.processId || 'swimming',
          });
        }
        behaviorRelations.push({
          schema: 'simulatte.behaviorRelation.v1',
          id: `behavior:swimming:${agentDomain.entityId}:${waterDomain.entityId}`,
          process: 'swimming',
          agentEntityId: agentDomain.entityId,
          mediumEntityId: waterDomain.entityId,
          relation: edge.type || 'interaction',
          spatialRelation: edge.prepositions && edge.prepositions[0] || 'in',
          operators: operatorsForBehavior.map((op) => op.type),
          evidence: edge.evidence || ['prompt-clause'],
          status: 'lowered',
        });
        receipt.exact.push({
          promptSpan: `${agentDomain.entityId} swimming in ${waterDomain.entityId}`,
          canonicalId: 'behavior.swimming-in-water',
          confidence: edge.confidence || 0.78,
          evidence: edge.evidence || ['prompt-clause'],
        });
      }

    function ensureSwimmingFields(fields, domain) {
        addField(fields, domain, 'velocity', 'vector2', 'm/s', { x: 0, y: 0 });
        addField(fields, domain, 'force', 'vector2', 'N', { x: 0, y: 0 });
        addField(fields, domain, 'swimPhase', 'scalar', 'rad', 0);
        addField(fields, domain, 'strokeForce', 'scalar', 'N', 0.42);
        addField(fields, domain, 'buoyancy', 'scalar', 'N', 0.5);
        addField(fields, domain, 'drag', 'scalar', 'ratio', 0.28);
        addField(fields, domain, 'submersion', 'scalar', 'ratio', 0.58);
        addField(fields, domain, 'wake', 'scalar', 'ratio', 0.18);
      }

    function ensureWaterFields(fields, domain, params) {
        addField(fields, domain, 'flowVelocity', 'vector2', 'm/s', {
          x: clamp(Number(params.flowRate ?? params.windSpeed ?? 0.32), -2, 2),
          y: 0,
        });
        addField(fields, domain, 'pressure', 'scalar', 'kPa', 0.34);
        addField(fields, domain, 'viscosity', 'scalar', 'Pa*s', materialViscosity('water'));
        addField(fields, domain, 'wake', 'scalar', 'ratio', 0.12);
      }

    function addSwimmingOperator(operators, type, agentDomain, waterDomain, params) {
        const agent = agentDomain.entityId;
        const water = waterDomain.entityId;
        const rate = clamp(Number(params.swimRate || params.flowRate || 0.58), 0.05, 2);
        const configs = {
          fluid_locomotion: {
            reads: [`swimPhase:${agent}`, `strokeForce:${agent}`, `velocity:${agent}`, `flowVelocity:${water}`],
            writes: [`velocity:${agent}`, `swimPhase:${agent}`, `strokeForce:${agent}`],
            params: { rate, gait: 'paddle' },
          },
          buoyancy: {
            reads: [`submersion:${agent}`, `buoyancy:${agent}`, `pressure:${water}`],
            writes: [`force:${agent}`, `buoyancy:${agent}`],
            params: { neutralDepth: 0.58 },
          },
          drag: {
            reads: [`velocity:${agent}`, `flowVelocity:${water}`, `viscosity:${water}`, `drag:${agent}`],
            writes: [`velocity:${agent}`, `drag:${agent}`],
            params: { coefficient: 0.34 },
          },
          wake_generation: {
            reads: [`velocity:${agent}`, `wake:${agent}`, `flowVelocity:${water}`],
            writes: [`wake:${agent}`, `wake:${water}`, `flowVelocity:${water}`],
            params: { spread: 0.42 },
          },
          body_water_contact: {
            reads: [`position:${agent}`, `position:${water}`, `submersion:${agent}`],
            writes: [`submersion:${agent}`],
            params: { contactBand: 0.18 },
          },
          partial_submersion: {
            reads: [`position:${agent}`, `buoyancy:${agent}`, `submersion:${agent}`],
            writes: [`submersion:${agent}`, `buoyancy:${agent}`],
            params: { surfaceLevel: 0.58 },
          },
        };
        return addOperator(operators, type, agentDomain, configs[type] || { reads: [], writes: [], params: {} });
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
        if (edgeType === 'fluidForce' && from.kind === 'fluid' && to.kind === 'fluid') return 'pressure_flow_lite';
        if (edgeType === 'heatTransfer' && hasFieldTarget(from, 'temperature') && hasFieldTarget(to, 'temperature')) {
          return 'heat_transfer';
        }
        if (edgeType === 'phaseChange' && hasFieldTarget(to, 'liquidFraction')) return 'phase_transition';
        if (edgeType === 'collision' && (hasTag(from, 'collision') || from.kind === 'rigidBody') && to.kind !== 'fluid') {
          return 'rigid_collision';
        }
        if (edgeType === 'growthCoupling') return 'growth_decay';
        if (edgeType === 'waveCoupling') return 'wave_field';
        if (edgeType === 'diffusion') return 'diffusion';
        if (edgeType === 'networkFlow' || edgeType === 'controlLoop') return 'network_flow';
        if (edgeType === 'fieldForce' || edgeType === 'refraction') return 'wave_field';
        if (edgeType === 'orbitalGravity') return 'oscillator';
        if (edgeType === 'erosion') return 'pressure_flow_lite';
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
        if (type === 'pressure_flow_lite') {
          return addOperator(operators, type, to, {
            reads: [`pressure:${fromEntity}`, `flowVelocity:${toEntity}`],
            writes: [`flowVelocity:${toEntity}`],
            params: { rate: clamp(Number(params.flowRate || params.erosionRate || 0.52), 0.05, 2) },
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

    Object.assign(scope, {
      buildPhysicsIR,
      emptyReceipt,
      addIntentBriefReceipt,
      entityForNode,
      geometryForNode,
      domainForEntity,
      inferredDomainKind,
      domainTagsForEntity,
      preferredDomainKind,
      addBaseFields,
      addField,
      addEntityOperators,
      addCouplingsFromEdges,
      isSwimmingEdge,
      addSwimmingBehaviorFromEdge,
      ensureSwimmingFields,
      ensureWaterFields,
      addSwimmingOperator,
      addImplicitCouplings,
      couplingOperator,
      addCouplingOperator,
      addFallbackIfNeeded,
      addOperator,
      rigidBodyForEntity,
      particleSetForEntity,
      boundaryForDomain,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
