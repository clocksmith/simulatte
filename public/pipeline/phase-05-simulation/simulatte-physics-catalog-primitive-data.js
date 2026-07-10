(function attachSimulattePhysicsCatalogprimitivedata(root) {
  const scope = root.__SimulattePhysicsCatalogRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function contractSummaryForPrimitives(primitives, promptText = '') {
        const rows = primitives || [];
        const layerFocus = classifyPromptLayer(promptText, rows);
        const topLevel = topLevelPrimitivesForLayer(rows, layerFocus);
        const contracts = rows.map(contractForPrimitive).filter(Boolean);
        const materials = Object.fromEntries(contracts
          .filter((contract) => contract.material)
          .map((contract) => [contract.id, contract.material]));
        const ports = Object.fromEntries(contracts.map((contract) => [contract.id, contract.ports]));
        const geometry = Object.fromEntries(contracts.map((contract) => [contract.id, contract.geometry]));
        const recipeSlots = Object.fromEntries(contracts
          .filter((contract) => contract.slots.length)
          .map((contract) => [contract.id, contract.slots]));
        const summary = {
          schema: 'simulatte.layerContract.v1',
          layerStack: LAYER_STACK.map((layer) => ({
            id: layer.id,
            index: layer.index,
            composes: layer.composes.slice(),
            role: layer.role,
          })),
          compilerInputPlane: {
            id: COMPILER_INPUT_PLANE.id,
            role: COMPILER_INPUT_PLANE.role,
            targetLayers: COMPILER_INPUT_PLANE.targetLayers.slice(),
          },
          adjacency: validateLayerAdjacency(),
          layerFocus,
          topLevel: topLevel.map((primitive) => primitive.id),
          materials,
          interactions: matchingInteractionRules(rows),
          ports,
          geometry,
          recipeSlots,
          layout: layoutForPrimitives(rows),
          readouts: readoutsForPrimitives(rows),
        };
        summary.graph = compileGraphIR(rows, promptText, summary);
        return summary;
      }

    function explicitPrimitiveScore(prompt, primitive) {
        const text = ` ${String(prompt || '').toLowerCase()} `;
        const terms = meaningfulTokens(primitiveText(primitive));
        const promptTerms = new Set(meaningfulTokens(prompt));
        const uniqueTerms = Array.from(new Set(terms)).filter((term) => term.length > 3);
        let hits = 0;
        for (const term of uniqueTerms) {
          if (text.includes(` ${term} `) || text.includes(term.replace(/-/g, ' '))) hits += 1;
        }
        let score = Math.min(0.32, hits * 0.045);
        const idTerms = primitive.id.split(/[-_]+/).filter((term) => term.length > 3);
        if (idTerms.some((term) => promptTerms.has(term))) score += 0.24;
        if ((primitive.domains || []).some((domain) => promptTerms.has(domain))) score += 0.18;
        return Math.min(0.62, score);
      }

    function rankPhysicalPrimitives(promptText = '', options = {}) {
        const prompt = String(promptText || '').trim();
        if (!prompt) return [];
        const max = Number.isFinite(options.max) ? options.max : 32;
    	    const intentVector = buildIntentVector(prompt);
    	    const ranked = PHYSICAL_PRIMITIVES
    	      .filter((primitive) => isRetrievablePrimitive(primitive))
    	      .map((primitive) => {
            const candidateVector = buildIntentVector(primitiveText(primitive));
            const score = vectorScore(intentVector, candidateVector) + explicitPrimitiveScore(prompt, primitive);
            return { ...primitive, score: Number(score.toFixed(4)) };
          })
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        const topScore = ranked[0] ? ranked[0].score : 0;
        if (topScore < 0.22) return [];
        const threshold = Math.max(0.075, topScore * 0.34);
        return ranked.filter((primitive) => primitive.score >= threshold).slice(0, max);
      }

    function withPrimitiveDependencies(rankedPrimitives, promptText = '') {
        const prompt = String(promptText || '').toLowerCase();
        const byId = new Map(PHYSICAL_PRIMITIVES.map((primitive) => [primitive.id, primitive]));
        const rows = [];
        const rowsById = new Map();
        const seen = new Set();
        const ensure = (id, score = 0.18, depth = 0) => {
          const primitive = byId.get(id);
          if (!primitive) return;
          const existing = rowsById.get(id);
          if (existing) {
            existing.score = Math.max(existing.score, score);
            return;
          }
          seen.add(id);
          const row = { ...primitive, score };
          rows.push(row);
          rowsById.set(id, row);
          if (depth > 8) return;
          const nextScore = Math.max(0.08, Number((score * 0.86).toFixed(4)));
          for (const childId of primitive.recipe || []) {
            ensure(childId, nextScore, depth + 1);
          }
        };
        for (const primitive of rankedPrimitives) ensure(primitive.id, primitive.score);
        const has = (...ids) => ids.some((id) => seen.has(id));
        const says = (...terms) => terms.some((term) => prompt.includes(term));
        const fireRequested = has('flame', 'forest-fire', 'fire-front') ||
          says('fire', 'flame', 'burn', 'burning', 'combust', 'wildfire', 'smoke');

        if (says('perpetual', 'magnetic wheel', 'solar magnetic machine', 'generator')) {
          ensure('rotor-wheel', 0.84);
          ensure('stator-slider', 0.82);
          ensure('solar-panel', 0.78);
          ensure('motor-load', 0.7);
          ensure('bearing-friction', 0.64);
          for (const id of ['rotor-wheel', 'stator-slider', 'solar-panel', 'motor-load']) {
            const row = rowsById.get(id);
            if (row) {
              row.pinned = true;
              row.source = row.source || 'prompt-family';
              row.phrase = row.phrase || 'solar magnetic machine';
            }
          }
        }
        if (has('flow-inlet', 'moving-fluid', 'wake-obstacle', 'turbulence-field', 'wind-field', 'pressure-vessel')) {
          ensure('flow-inlet', 0.72);
          ensure('moving-fluid', 0.7);
          ensure('flow-outlet', 0.5);
        }
        if (says('turbulent', 'turbulence', 'vortex', 'wake', 'swirl')) {
          ensure('turbulence-field', 0.72);
          ensure('wake-obstacle', 0.66);
          ensure('moving-fluid', 0.62);
        }
        if (has('reactant-a', 'reactant-b', 'catalyst-front')) {
          ensure('reactant-a', 0.7);
          ensure('reactant-b', 0.68);
          ensure('catalyst-front', 0.66);
          ensure('cooling-field', 0.52);
        }
        if (has('thermal-source') || says('hot', 'heat', 'cooling')) {
          ensure('thermal-source', 0.62);
          ensure('cooling-field', 0.52);
        }
        if (has('optical-prism', 'light-source')) {
          ensure('light-source', 0.68);
          ensure('optical-prism', 0.66);
        }
        if (has('acoustic-emitter', 'wave-source')) {
          ensure('acoustic-emitter', 0.68);
          ensure('wave-source', 0.62);
        }
        if (has('spring-constraint', 'collision-boundary', 'gravity-source')) {
          ensure('rigid-body', 0.56);
        }
        if (says('spring', 'elastic', 'collisions', 'collision')) {
          ensure('spring-constraint', 0.72);
          ensure('elasticity', 0.66);
          ensure('collision-boundary', 0.56);
          ensure('rigid-body', 0.52);
        }
        if (has('granular-bed')) {
          ensure('collision-boundary', 0.52);
          ensure('gravity-source', 0.46);
        }
        if (says('sand', 'granular', 'grain', 'grains', 'sediment')) {
          ensure('granular-bed', 0.68);
          ensure('sand', 0.58);
          ensure('collision-boundary', 0.52);
          ensure('gravity-source', 0.46);
        }
        if (has('buoyant-body')) {
          ensure('moving-fluid', 0.54);
          ensure('gravity-source', 0.42);
        }
        if (says('bubble', 'bubbles', 'float', 'floating', 'buoyant', 'buoyancy')) {
          ensure('buoyant-body', 0.7);
          ensure('moving-fluid', 0.54);
        }
        if (has('electric-field', 'plasma-arc')) {
          ensure('electric-field', 0.68);
          ensure('plasma-arc', 0.62);
          ensure('thermal-source', 0.5);
        }
        if (says('plasma', 'arc', 'discharge', 'lightning')) {
          ensure('plasma-arc', 0.76);
          ensure('electric-field', 0.62);
          ensure('thermal-source', 0.5);
        }
        if (has('sun-star')) {
          ensure('light-source', 0.62);
          ensure('thermal-source', 0.56);
          ensure('energy-ledger', 0.42);
        }
        if (has('fire-front', 'wood-fiber')) {
          ensure('fire-front', 0.68);
          ensure('thermal-source', 0.56);
          ensure('cooling-field', 0.36);
        }
        if (has('water-volume')) {
          ensure('moving-fluid', 0.62);
          ensure('flow-inlet', 0.44);
          ensure('buoyant-body', 0.42);
        }
        if (has('rock-mass', 'ceramic-shell', 'crystal-lattice')) {
          ensure('rock-mass', 0.54);
          ensure('terrain-heightfield', 0.42);
          ensure('collision-boundary', 0.38);
        }
        if (has('metal-conductor')) {
          ensure('electric-field', 0.52);
          ensure('thermal-source', 0.34);
        }
        if (has('magnetic-core')) {
          ensure('electric-field', 0.48);
          ensure('metal-conductor', 0.42);
        }
        if (has('glass-pane')) {
          ensure('light-source', 0.5);
          ensure('optical-prism', 0.48);
        }
        if (has('atom-core', 'electron-cloud', 'ion-pair', 'molecular-bond')) {
          ensure('atom-core', 0.58);
          ensure('electron-cloud', 0.52);
          ensure('molecular-bond', 0.48);
          ensure('ion-pair', 0.42);
        }
        if (has('feedback-controller', 'sensor-array', 'delay-buffer')) {
          ensure('sensor-array', 0.66);
          ensure('feedback-controller', 0.64);
          ensure('delay-buffer', 0.48);
        }
        if (has('queue-server', 'logistics-node', 'network-link')) {
          ensure('queue-server', 0.62);
          ensure('network-link', 0.56);
          ensure('logistics-node', 0.54);
        }
        if (says('logistics', 'logistics node', 'warehouse', 'inventory', 'supply chain', 'transport')) {
          ensure('logistics-node', 0.74);
          ensure('network-link', 0.58);
          ensure('queue-server', 0.52);
        }
        if (has('terrain-heightfield', 'erosion-channel')) {
          ensure('terrain-heightfield', 0.64);
          ensure('erosion-channel', 0.58);
          ensure('flow-inlet', 0.44);
        }
        if (says('erosion', 'erode', 'river erosion', 'terrain erosion')) {
          ensure('erosion-channel', 0.76);
          ensure('terrain-heightfield', 0.64);
          ensure('flow-inlet', 0.44);
        }
        if (has('phase-change-material')) {
          ensure('thermal-source', 0.56);
          ensure('cooling-field', 0.44);
        }
        if (has('brine', 'mercury', 'copper', 'silicon', 'carbon')) {
          ensure('electric-field', 0.58);
          ensure('thermal-source', 0.42);
          ensure('crystal-lattice', 0.34);
        }
        if (has('gel', 'foam', 'membrane')) {
          ensure('cohesive-cluster', 0.56);
          ensure('adhesion-film', 0.44);
          ensure('wave-source', 0.36);
        }
        if (has('leaf', 'mycelium', 'protein', 'bacteria')) {
          ensure('population-field', 0.62);
          ensure('diffusion', 0.44);
          ensure('growth-decay', 0.42);
        }
        if (has('phase-change') || says('phase change', 'melt', 'freeze', 'boil', 'steam')) {
          ensure('phase-change-material', 0.7);
          ensure('thermal-source', 0.56);
          ensure('cooling-field', 0.44);
        }
        if (has('adhesion-film', 'cohesive-cluster')) {
          ensure('adhesion-film', 0.54);
          ensure('cohesive-cluster', 0.52);
        }
        if (has('population-field', 'infection-front')) {
          ensure('population-field', 0.62);
          ensure('infection-front', 0.56);
          ensure('reactant-a', 0.34);
        }
        if (says('infection front', 'infection', 'disease', 'epidemic', 'contagion')) {
          ensure('infection-front', 0.76);
          ensure('population-field', 0.62);
          ensure('diffusion', 0.42);
        }
        if (has('market-demand', 'logistics-node')) {
          ensure('market-demand', 0.58);
          ensure('queue-server', 0.42);
        }
        if (has('noise-field')) {
          ensure('noise-field', 0.52);
          ensure('sensor-array', 0.42);
        }
        if (says('data recorder', 'recorder', 'trace', 'audit', 'receipt')) {
          ensure('data-recorder', 0.74);
          ensure('noise-field', 0.56);
          ensure('sensor-array', 0.5);
        }
        if (has('sun-lamp', 'radiation')) {
          ensure('light-source', 0.56);
          ensure('heat-transfer', 0.48);
        }
        if (fireRequested && has('flame', 'combustion', 'fire-plasma', 'forest-fire')) {
          ensure('flame', 0.64);
          ensure('combustion', 0.58);
          ensure('heat-transfer', 0.5);
          ensure('smoke', 0.44);
        }
        if (has('river', 'river-erosion', 'water')) {
          ensure('water', 0.58);
          ensure('fluid-advection', 0.52);
          ensure('erosion', 0.44);
        }
        if (has('glass', 'lens', 'mirror', 'prism', 'optics-bench')) {
          ensure('optics', 0.58);
          ensure('glass', 0.5);
          ensure('light-source', 0.44);
        }
        if (has('magnet', 'magnetic-motor', 'magnetized-metal')) {
          ensure('magnetism', 0.58);
          ensure('magnetized-metal', 0.52);
          ensure('electromagnetism', 0.42);
        }
        if (!rows.some((primitive) => primitive.type === 'body' || primitive.type === 'material')) {
          ensure('rigid-body', 0.42);
        }
        ensure('energy-ledger', 0.34);
        return rows
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
          .slice(0, 40);
      }

    Object.assign(scope, {
      contractSummaryForPrimitives,
      explicitPrimitiveScore,
      rankPhysicalPrimitives,
      withPrimitiveDependencies,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
