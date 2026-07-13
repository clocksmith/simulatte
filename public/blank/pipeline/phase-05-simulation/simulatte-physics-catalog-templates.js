(function attachSimulattePhysicsCatalogtemplates(root) {
  const scope = root.__SimulattePhysicsCatalogRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function visualSlotTargetsForAction(actionEntry = {}) {
        const bySemanticClass = ACTION_VISUAL_SLOT_TARGETS[String(actionEntry.semanticClass || '')];
        if (bySemanticClass) return bySemanticClass;
        const target = String(actionEntry.id || '').replace(/^action:/, '') || String(actionEntry.label || '');
        return ACTION_VISUAL_SLOT_TARGETS[target] || [];
      }

    function toCatalogItem(layer, item) {
        const id = String(item.id);
        const label = item.label || labelize(id);
        const idTerms = id.split(/[-_]+/).filter((term) => term.length > 2);
        const domains = uniqueList([...(item.domains || []), layer, id, ...idTerms]);
        return {
          id,
          label,
          type: item.type || layer,
          layer,
          role: item.role || `${label} ${layer}`,
          domains,
          controls: item.controls || [],
          params: item.params || {},
          recipe: item.recipe || [],
          text: `${label} ${item.text || ''} ${domains.join(' ')} ${(item.recipe || []).join(' ')}`,
        };
      }

    function uniqueCatalogItems(...groups) {
        const seen = new Set();
        const out = [];
        for (const group of groups) {
          for (const item of group) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            out.push(item);
          }
        }
        return Object.freeze(out);
      }

    function generatedMaterialPropertiesForId(id) {
        if (id === 'lava') return { density: 0.78, hardness: 0.12, heatCapacity: 0.74, opacity: 1, viscosity: 0.62, phasePoint: 0.9 };
        if (id === 'snow') return { density: 0.22, hardness: 0.06, heatCapacity: 0.7, moisture: 0.82, opacity: 0.72, phasePoint: 0.16 };
        if (id === 'mud') return { density: 0.62, hardness: 0.08, heatCapacity: 0.52, moisture: 0.92, opacity: 0.95, viscosity: 0.74 };
        if (id === 'battery-electrolyte') return { density: 0.56, heatCapacity: 0.62, conductivity: 0.76, moisture: 0.82, viscosity: 0.28 };
        if (id === 'semiconductor') return { density: 0.54, hardness: 0.58, conductivity: 0.48, opacity: 0.5, refractiveIndex: 1.68 };
        if (id === 'concrete-rebar') return { density: 0.84, hardness: 0.86, heatCapacity: 0.34, conductivity: 0.32, opacity: 1 };
        if (id === 'blood') return { density: 0.58, heatCapacity: 0.72, moisture: 0.94, opacity: 0.82, viscosity: 0.34 };
        if (id === 'tendon') return { density: 0.4, hardness: 0.18, heatCapacity: 0.46, moisture: 0.48, viscosity: 0.18 };
        if (id === 'cartilage') return { density: 0.36, hardness: 0.1, heatCapacity: 0.48, moisture: 0.72, viscosity: 0.34 };
        if (METAL_MATERIAL_IDS.has(id)) {
          return { density: 0.82, hardness: 0.64, heatCapacity: 0.3, conductivity: 0.82, opacity: 1 };
        }
        if (GAS_MATERIAL_IDS.has(id)) {
          return { density: 0.08, heatCapacity: 0.22, opacity: 0.05, viscosity: 0.05 };
        }
        if (MINERAL_MATERIAL_IDS.has(id)) {
          return { density: 0.74, hardness: 0.82, heatCapacity: 0.32, opacity: 0.92, refractiveIndex: 1.38 };
        }
        if (ORGANIC_MATERIAL_IDS.has(id)) {
          return { density: 0.36, hardness: 0.16, heatCapacity: 0.48, combustibility: 0.62, viscosity: 0.28 };
        }
        if (POLYMER_MATERIAL_IDS.has(id)) {
          return { density: 0.3, hardness: 0.22, heatCapacity: 0.44, combustibility: 0.34, viscosity: 0.4 };
        }
        if (BIO_MOLECULE_MATERIAL_IDS.has(id)) {
          return { density: 0.22, hardness: 0.04, heatCapacity: 0.52, moisture: 0.68, viscosity: 0.55 };
        }
        if (id === 'graphene') return { density: 0.36, hardness: 0.68, conductivity: 0.98, opacity: 0.24 };
        if (id === 'acid' || id === 'base') return { density: 0.5, heatCapacity: 0.74, conductivity: 0.58, moisture: 1, viscosity: 0.18 };
        if (id === 'salt') return { density: 0.64, hardness: 0.38, conductivity: 0.34, opacity: 0.78 };
        return {};
      }

    function paramsForHandwrittenPrompt(index, prompt) {
        const text = String(prompt || '').toLowerCase();
        const value = (offset, min = 0.18, max = 0.92) => {
          const raw = ((index + 1) * 41 + offset * 29) % 100;
          return Number((min + (raw / 99) * (max - min)).toFixed(2));
        };
        const params = {
          energyInput: value(1),
          heatTransfer: value(2),
          pressure: value(3),
          flowRate: value(4),
          turbulence: value(5),
          viscosity: value(6),
          density: value(7),
          damping: value(8, 0.02, 0.18),
          surfaceTension: value(9),
          waveAmplitude: value(10),
          soundFrequency: value(11, 0.08, 1.2),
          magnetization: value(12),
          fieldStrength: value(13),
          irradiance: Math.round(240 + value(14) * 980),
          gravity: Number(value(15, -0.18, 0.32).toFixed(2)),
          queueBacklog: value(16),
          serviceRate: value(17),
          marketDemand: value(18),
          populationGrowth: value(19, 0.08, 1.18),
          lightIntensity: value(20),
          moisture: value(21),
          erosionRate: value(22),
          conductivity: value(23),
          refractiveIndex: Number((1.05 + value(24) * 0.82).toFixed(2)),
          hardness: value(25),
        };
        if (/cell|fung|root|algae|coral|bio|microb|plant|seed|animal|whale|wolf|moss|DNA|enzyme|neuron|lung|liver|kidney|tissue|virus|bacteria/i.test(text)) {
          Object.assign(params, { populationGrowth: 0.84, moisture: 0.74, diffusionA: 0.7 });
        }
        if (/star|orbit|asteroid|comet|planet|galactic|pulsar|black hole|cosmic|lunar|solar sail/i.test(text)) {
          Object.assign(params, { gravity: 0.24, irradiance: 980, fieldStrength: 0.58 });
        }
        if (/plasma|corona|tokamak|lightning|ion|gamma|xenon|magnet|ferrofluid|qubit/i.test(text)) {
          Object.assign(params, { magnetization: 0.82, fieldStrength: 0.84, conductivity: 0.76 });
        }
        if (/water|brine|river|ocean|flow|filter|pump|coolant|fluid|wave|geyser|storm|hurricane/i.test(text)) {
          Object.assign(params, { flowRate: 0.82, turbulence: 0.76, pressure: 0.72 });
        }
        if (/heat|fire|thermal|boil|melt|pyrolyze|burn|cool|frost|helium|ice|permafrost/i.test(text)) {
          Object.assign(params, { heatTransfer: 0.8, energyInput: 0.74, thermalFlux: 0.72 });
        }
        if (/queue|market|traffic|subway|supply|packet|ledger|receipt|route|network/i.test(text)) {
          Object.assign(params, { queueBacklog: 0.76, serviceRate: 0.46, networkLatency: 0.48 });
        }
        return Object.freeze(params);
      }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }

    function clamp01(value) {
        return clamp(value, 0, 1);
      }

    function wrapAngle(angle) {
        const wrapped = angle % TAU;
        return wrapped < 0 ? wrapped + TAU : wrapped;
      }

    function shortestAngle(from, to) {
        let delta = wrapAngle(to) - wrapAngle(from);
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        return delta;
      }

    function hashNoise(seed, index) {
        const x = Math.sin((seed + 1) * 12.9898 + (index + 1) * 78.233) * 43758.5453;
        return x - Math.floor(x);
      }

    function slugify(value) {
        return String(value || 'simulation')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 52) || 'simulation';
      }

    function templateById(templateId) {
        return TEMPLATE_LIBRARY.find((template) => template.id === templateId) || TEMPLATE_LIBRARY[0];
      }

    function normalizeControl(control) {
        if (Array.isArray(control)) return control;
        if (typeof control === 'string') return CONTROL_LIBRARY[control] || [control, labelize(control), 0, 1, 0.01];
        if (control && control.key) {
          return [
            control.key,
            control.label || labelize(control.key),
            Number(control.min ?? 0),
            Number(control.max ?? 1),
            Number(control.step ?? 0.01),
          ];
        }
        return ['value', 'value', 0, 1, 0.01];
      }

    function labelize(key) {
        return String(key || 'value')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/[-_]+/g, ' ')
          .toLowerCase();
      }

    function controlsForSpec(specOrTemplate) {
        return (specOrTemplate.controls || templateById(specOrTemplate.templateId || specOrTemplate.id).controls || [])
          .map(normalizeControl);
      }

    function controlsByKey(specOrTemplate) {
        return Object.fromEntries(controlsForSpec(specOrTemplate).map((control) => [control[0], control]));
      }

    function normalizeParams(template, params, controls = controlsForSpec(template)) {
        const controlsMap = Object.fromEntries(controls.map((control) => [control[0], control]));
        const base = { ...template.params, ...(params || {}) };
        return Object.fromEntries(Object.entries(base).map(([key, value]) => {
          const control = controlsMap[key];
          if (!control) return [key, Number(value)];
          return [key, clamp(Number(value), Number(control[2]), Number(control[3]))];
        }));
      }

    function normalizeObjects(objects, fallback = []) {
        const source = Array.isArray(objects) && objects.length ? objects : fallback;
        return source.map((object, index) => ({
          id: slugify(object.id || object.name || `object-${index + 1}`),
          type: String(object.type || 'body'),
          role: String(object.role || object.name || 'physical object'),
          layer: object.layer || '',
          domains: uniqueList(object.domains || []),
          material: object.material || '',
          visualRegime: object.visualRegime || '',
          assembly: object.assembly || '',
          phrase: object.phrase || '',
          source: object.source || '',
          score: Number(object.score || 0),
          pinned: Boolean(object.pinned),
          primitiveProgram: object.primitiveProgram || null,
          geometry: object.geometry || null,
          ports: object.ports || null,
          slots: object.slots || [],
          synthesis: object.synthesis || null,
          state: object.state || null,
        }));
      }

    function uniqueList(values) {
        return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
      }

    function meaningfulTokens(text) {
        const raw = String(text || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((token) => token && token.length > 1 && !SEMANTIC_STOPWORDS.has(token));
        const out = [];
        for (const token of raw) {
          const singular = token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
          out.push(singular);
          for (const synonym of TOKEN_SYNONYMS[singular] || TOKEN_SYNONYMS[token] || []) {
            out.push(synonym);
          }
        }
        return out;
      }

    function addVectorFeature(vector, key, weight) {
        vector.set(key, (vector.get(key) || 0) + weight);
      }

    function buildIntentVector(text) {
        const tokens = meaningfulTokens(text);
        const vector = new Map();
        for (const token of tokens) {
          addVectorFeature(vector, `w:${token}`, 1);
          const padded = `^${token}$`;
          for (const n of [3, 4]) {
            if (padded.length < n) continue;
            for (let i = 0; i <= padded.length - n; i += 1) {
              addVectorFeature(vector, `g:${padded.slice(i, i + n)}`, 0.38);
            }
          }
        }
        for (let i = 0; i < tokens.length - 1; i += 1) {
          addVectorFeature(vector, `b:${tokens[i]}_${tokens[i + 1]}`, 0.72);
        }
        return vector;
      }

    function vectorScore(intentVector, candidateVector) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (const [key, weight] of intentVector) {
          normA += weight * weight;
          if (candidateVector.has(key)) dot += weight * candidateVector.get(key);
        }
        for (const weight of candidateVector.values()) {
          normB += weight * weight;
        }
        if (!normA || !normB) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
      }

    function primitiveById(id) {
        return PHYSICAL_PRIMITIVES.find((primitive) => primitive.id === id) || null;
      }

    function isRetrievablePrimitive(primitiveOrId) {
        const primitive = typeof primitiveOrId === 'string' ? primitiveById(primitiveOrId) : primitiveOrId;
        return Boolean(primitive) && primitive.isRetrievable !== false;
      }

    function layerForId(id, primitives = LAYERED_PRIMITIVES) {
        const primitive = (primitives || []).find((item) => item.id === id);
        return primitive ? primitive.layer : null;
      }

    function lowerLayerFor(layerId) {
        const index = LAYER_INDEX[layerId];
        if (!index || index <= 1) return null;
        const lower = LAYER_STACK.find((layer) => layer.index === index - 1);
        return lower ? lower.id : null;
      }

    function validateLayerAdjacency(primitives = LAYERED_PRIMITIVES) {
        const byId = new Map((primitives || []).map((primitive) => [primitive.id, primitive]));
        const errors = [];
        for (const primitive of primitives || []) {
          const expectedChildLayer = lowerLayerFor(primitive.layer);
          const recipe = primitive.recipe || [];
          if (!expectedChildLayer && recipe.length) {
            errors.push({
              id: primitive.id,
              layer: primitive.layer,
              reason: 'base-layer-has-recipe',
              expectedChildLayer: null,
              childIds: recipe.slice(),
            });
            continue;
          }
          for (const childId of recipe) {
            const child = byId.get(childId);
            if (!child) {
              errors.push({
                id: primitive.id,
                layer: primitive.layer,
                childId,
                reason: 'missing-child',
                expectedChildLayer,
              });
              continue;
            }
            if (child.layer !== expectedChildLayer) {
              errors.push({
                id: primitive.id,
                layer: primitive.layer,
                childId,
                childLayer: child.layer,
                reason: 'non-adjacent-child',
                expectedChildLayer,
              });
            }
          }
        }
        return {
          schema: 'simulatte.layerAdjacency.v1',
          valid: errors.length === 0,
          layerStack: LAYER_STACK.map((layer) => ({
            id: layer.id,
            index: layer.index,
            composes: layer.composes.slice(),
          })),
          compilerInputPlane: COMPILER_INPUT_PLANE.id,
          checked: (primitives || []).length,
          errors,
        };
      }

    function primitiveText(primitive) {
        return `${primitive.id} ${primitive.type} ${primitive.role} ${primitive.domains.join(' ')} ${primitive.text || ''}`;
      }

    function materialPropertiesForId(id) {
        return {
          ...MATERIAL_PROPERTY_DEFAULTS,
          ...generatedMaterialPropertiesForId(id),
          ...(MATERIAL_PROFILES[id] || {}),
        };
      }

    function geometryForPrimitive(primitive) {
        if (!primitive) return GEOMETRY_PROFILES.body;
        return {
          ...(GEOMETRY_PROFILES[primitive.type] || GEOMETRY_PROFILES.body),
          ...(GEOMETRY_OVERRIDES[primitive.id] || {}),
        };
      }

    function portsForPrimitive(primitive) {
        if (!primitive) return { accepts: [], outputs: [] };
        const base = PORT_PROFILES[primitive.type] || { accepts: [], outputs: [] };
        const override = PORT_PROFILES[primitive.id] || {};
        return {
          accepts: uniqueList([...(base.accepts || []), ...(override.accepts || [])]),
          outputs: uniqueList([...(base.outputs || []), ...(override.outputs || [])]),
        };
      }

    function recipeSlotsForId(id) {
        return (RECIPE_SLOT_LIBRARY[id] || []).map((slot) => ({
          slot: slot.slot,
          accepts: uniqueList(slot.accepts || []),
          required: Boolean(slot.required),
        }));
      }

    function primitiveTokenSet(primitives) {
        const tokens = new Set();
        for (const primitive of primitives || []) {
          tokens.add(primitive.id);
          tokens.add(primitive.layer);
          tokens.add(primitive.type);
          for (const domain of primitive.domains || []) tokens.add(domain);
        }
        return tokens;
      }

    function matchingInteractionRules(primitives) {
        const tokens = primitiveTokenSet(primitives);
        return INTERACTION_RULES
          .filter((rule) => (rule.when || []).every((token) => tokens.has(token)))
          .map((rule) => ({
            id: rule.id,
            when: uniqueList(rule.when || []),
            effect: rule.effect,
            params: { ...(rule.params || {}) },
          }));
      }

    function unitsForParams(params = {}) {
        return Object.fromEntries(Object.keys(params).sort().map((key) => [
          key,
          PARAM_UNIT_SCHEMA[key] || { dimension: 'dimensionless', unit: '1' },
        ]));
      }

    function conservationForPrimitives(primitives) {
        const tokens = primitiveTokenSet(primitives);
        return CONSERVATION_RULES
          .filter((rule) => (rule.when || []).every((token) => tokens.has(token)))
          .map((rule) => ({
            id: rule.id,
            tracks: uniqueList(rule.tracks || []),
            suppliedBy: uniqueList(rule.suppliedBy || []),
            lostTo: uniqueList(rule.lostTo || []),
          }));
      }

    function operatorsForPrimitives(primitives) {
        const out = [];
        const seen = new Set();
        for (const primitive of primitives || []) {
          const keys = uniqueList([primitive.id, primitive.type, primitive.layer, ...(primitive.domains || [])]);
          for (const key of keys) {
            const operatorId = OPERATOR_MATCHES[key];
            if (!operatorId || seen.has(operatorId)) continue;
            const operator = OPERATOR_REGISTRY[operatorId];
            if (!operator) continue;
            seen.add(operatorId);
            out.push({
              id: operatorId,
              inputs: uniqueList(operator.inputs || []),
              outputs: uniqueList(operator.outputs || []),
              state: uniqueList(operator.state || []),
              conserves: uniqueList(operator.conserves || []),
            });
          }
        }
        return out;
      }

    function stateForPrimitive(primitive, contract) {
        const material = contract && contract.materials ? contract.materials[primitive.id] : null;
        const ports = contract && contract.ports ? contract.ports[primitive.id] || { accepts: [], outputs: [] } : { accepts: [], outputs: [] };
        const domains = new Set([primitive.id, primitive.type, primitive.layer, ...(primitive.domains || [])]);
        const state = {
          temperature: material ? material.phasePoint || 0.5 : 0.5,
          moisture: material ? material.moisture || 0 : domains.has('water') ? 1 : 0,
          charge: domains.has('electricity') || domains.has('plasma') ? 0.32 : 0,
          pressure: domains.has('pressure') || ports.outputs.includes('pressure') ? 0.42 : 0,
          backlog: domains.has('queue') ? 0.34 : 0,
          fuel: material ? material.combustibility || 0 : domains.has('combustion') ? 0.45 : 0,
          mass: material ? material.density || 0.5 : primitive.type === 'body' ? 0.6 : 0.2,
          velocity: domains.has('fluid') || domains.has('motion') || primitive.type === 'body' ? 0.18 : 0,
          health: domains.has('biology') ? 0.72 : 1,
          inventory: domains.has('inventory') || domains.has('queue') || domains.has('market') ? 0.36 : 0,
        };
        return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Number(value.toFixed(4))]));
      }

    function graphNodeForPrimitive(primitive, contract, index) {
        return {
          id: primitive.id,
          nodeType: physicalNodeTypeForPrimitive(primitive),
          layer: primitive.layer || '',
          type: primitive.type,
          role: primitive.role,
          geometry: contract && contract.geometry ? contract.geometry[primitive.id] || geometryForPrimitive(primitive) : geometryForPrimitive(primitive),
          ports: contract && contract.ports ? contract.ports[primitive.id] || portsForPrimitive(primitive) : portsForPrimitive(primitive),
          material: contract && contract.materials ? contract.materials[primitive.id] || null : null,
          state: stateForPrimitive(primitive, contract),
          visualRegime: primitive.visualRegime || firstDomainRegime(primitive),
          solverRequirements: solverRequirementsForPrimitive(primitive),
          primitiveProgram: primitive.primitiveProgram || null,
          source: primitive.source || 'catalog',
          order: index,
        };
      }

    function physicalNodeTypeForPrimitive(primitive) {
        const text = primitiveText(primitive).toLowerCase();
        if (
          /^flame$|fire-front|thermal-source/.test(primitive.id) ||
          primitive.type === 'source' ||
          /source|lamp|sun|inlet|emitter|battery|generator/.test(text)
        ) return 'source';
        if (primitive.type === 'sink' || /sink|load|outlet|loss|drain/.test(text)) return 'sink';
        if (primitive.type === 'sensor' || /sensor|meter|readout|recorder|probe/.test(text)) return 'sensor';
        if (primitive.type === 'controller' || /controller|feedback|control|actuator/.test(text)) return 'controller';
        if (primitive.type === 'constraint' || /wall|boundary|constraint|barrier/.test(text)) return 'boundary';
        if (primitive.layer === 'material' || primitive.type === 'material') return 'materialField';
        if (primitive.layer === 'physics' || /diffusion|combustion|magnetism|optics|reaction|advection/.test(text)) return 'operator';
        if (primitive.type === 'body' || /wheel|rotor|mass|rigid|spring/.test(text)) return 'rigidBody';
        return 'domain';
      }

    function firstDomainRegime(primitive) {
        const text = primitiveText(primitive).toLowerCase();
        if (/fire|heat|thermal|combust|smoke|plasma/.test(text)) return 'thermal';
        if (/fluid|water|flow|river|air|wind/.test(text)) return 'fluid';
        if (/glass|light|lens|prism|mirror|optic/.test(text)) return 'optical';
        if (/magnet|magnetic|rotor|motor/.test(text)) return 'magnetic';
        if (/electric|charge|copper|silicon/.test(text)) return 'electrical';
        if (/sand|soil|rock|grain|terrain|erosion/.test(text)) return 'granular';
        if (/cell|bacteria|mycelium|biology|growth/.test(text)) return 'biological';
        if (/membrane|gel|foam|soft/.test(text)) return 'soft';
        if (/sound|acoustic|wave/.test(text)) return 'acoustic';
        if (/phase|melt|freeze|boil|ice|steam/.test(text)) return 'phase';
        if (/atom|molecule|ion|crystal|lattice/.test(text)) return 'atomic';
        if (/queue|network|traffic|market|logistics/.test(text)) return 'network';
        return '';
      }

    function solverRequirementsForPrimitive(primitive) {
        const regime = primitive.visualRegime || firstDomainRegime(primitive);
        const map = {
          fluid: ['velocity', 'density'],
          thermal: ['temperature', 'fuel', 'smoke'],
          optical: ['rayBatch', 'surfaceNormal', 'causticAccumulation'],
          magnetic: ['flux', 'force'],
          electrical: ['charge', 'potential'],
          granular: ['height', 'sediment'],
          biological: ['population', 'nutrient'],
          soft: ['tension', 'displacement'],
          acoustic: ['phase', 'amplitude'],
          phase: ['phase', 'latentHeat'],
          atomic: ['bond', 'charge'],
          network: ['backlog', 'throughput'],
        };
        return map[regime] || ['scalar'];
      }

    function graphEdgesForNodes(nodes, primitives) {
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const edges = [];
        const addEdge = (from, to, channel, reason) => {
          if (!from || !to || from === to || edges.length >= 96) return;
          const id = `${from}->${to}:${channel}:${reason}`;
          if (edges.some((edge) => edge.id === id)) return;
          edges.push({ id, from, to, channel, type: edgeTypeForChannel(channel), reason });
        };
        for (const primitive of primitives || []) {
          for (const childId of primitive.recipe || []) {
            if (byId.has(primitive.id) && byId.has(childId)) {
              addEdge(childId, primitive.id, 'recipe', 'slot');
            }
          }
        }
        for (const source of nodes) {
          for (const target of nodes) {
            if (source === target) continue;
            for (const output of source.ports.outputs || []) {
              if ((target.ports.accepts || []).includes(output)) {
                addEdge(source.id, target.id, output, 'port');
              }
            }
          }
        }
        return edges;
      }

    function edgeTypeForChannel(channel) {
        const value = String(channel || '');
        if (/energy|heat|thermal/.test(value)) return 'transfersEnergy';
        if (/matter|material|fuel|sediment|flow/.test(value)) return 'transfersMass';
        if (/constraint|recipe|slot/.test(value)) return 'constrains';
        if (/light|spectrum/.test(value)) return 'refracts';
        if (/force|field|magnet|gravity/.test(value)) return 'constrains';
        if (/signal|trace|measure/.test(value)) return 'measures';
        if (/pressure|fluid|velocity/.test(value)) return 'advects';
        return 'couples';
      }

    function validateGraphIR(graph, primitives, promptText = '') {
        const ids = new Set((graph.nodes || []).map((node) => node.id));
        const tokens = primitiveTokenSet(primitives);
        const prompt = String(promptText || '').toLowerCase();
        const warnings = [];
        const repairs = [];
        const needs = (id, required, message, repair) => {
          if (!tokens.has(id)) return;
          if (required.some((item) => tokens.has(item))) return;
          warnings.push(message);
          repairs.push(repair);
        };
        needs('combustion', ['wood', 'fuel', 'biomass'], 'combustion needs a fuel-bearing material', 'add wood, fuel, or biomass');
        needs('combustion', ['air'], 'combustion needs an oxygen/air source', 'add air or wind field');
        if (prompt.includes('optic') || prompt.includes('lens') || prompt.includes('prism')) {
          needs('optics', ['light-source', 'sun-lamp'], 'optics needs a light input', 'add light source or sun lamp');
        }
        needs('queue', ['source-sink', 'market-demand', 'logistics-node'], 'queue needs arrivals or logistics context', 'add source/sink or logistics node');
        if (ids.has('rock') && tokens.has('queue') && !prompt.includes('logistics')) {
          warnings.push('rock cannot be served by a queue unless wrapped by logistics');
          repairs.push('add logistics-node or remove queue from raw rock material');
        }
        return {
          status: warnings.length ? 'repaired' : 'valid',
          warnings,
          repairs,
        };
      }

    function temporalEventsForPrimitives(primitives) {
        const tokens = primitiveTokenSet(primitives);
        return TEMPORAL_GRAMMAR
          .filter((event) => (event.when || []).every((token) => tokens.has(token)))
          .map((event) => ({
            id: event.id,
            trigger: event.trigger,
            outputs: uniqueList(event.outputs || []),
          }));
      }

    function promptExplanation(promptText, primitives, contract, graph) {
        const topIdentity = contract.topLevel && contract.topLevel[0] || primitives[0] && primitives[0].id || 'world';
        const promptTerms = new Set(meaningfulTokens(promptText));
        const expanded = primitives
          .filter((primitive) => primitive.id !== topIdentity)
          .sort((a, b) => {
            const aScore = primitivePromptIdentityScore(a, promptTerms);
            const bScore = primitivePromptIdentityScore(b, promptTerms);
            return bScore - aScore || Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id);
          })
          .slice(0, 10)
          .map((primitive) => primitive.id);
        return {
          prompt: String(promptText || '').trim(),
          topIdentity,
          expanded,
          interactions: (contract.interactions || []).map((rule) => rule.id),
          operators: (graph.operators || []).map((operator) => operator.id),
          conservation: (graph.conservation || []).map((rule) => rule.id),
          validation: graph.validation,
        };
      }

    function primitivePromptIdentityScore(primitive, promptTerms) {
        if (!primitive || !promptTerms || !promptTerms.size) return 0;
        const idTerms = String(primitive.id || '').split(/[-_]+/).filter((term) => term.length > 2);
        const domainTerms = (primitive.domains || [])
          .flatMap((domain) => String(domain || '').split(/[-_]+/))
          .filter((term) => term.length > 2);
        const terms = uniqueList([...idTerms, ...domainTerms]);
        let score = terms.reduce((total, term) => total + (promptTerms.has(term) ? 1 : 0), 0);
        if (promptTerms.has(primitive.id)) score += 6;
        if (idTerms.length && idTerms.every((term) => promptTerms.has(term))) score += 4;
        if (primitive.source === 'open-semantic-rag') score -= 0.25;
        return score;
      }

    function compileGraphIR(primitives, promptText, contract, params = {}) {
        const nodes = (primitives || []).map((primitive, index) => graphNodeForPrimitive(primitive, contract, index));
        const graph = {
          schema: 'simulatte.physicalGraph.v1',
          units: unitsForParams(params),
          nodes,
          edges: graphEdgesForNodes(nodes, primitives),
          operators: operatorsForPrimitives(primitives),
          conservation: conservationForPrimitives(primitives),
          temporal: temporalEventsForPrimitives(primitives),
          coverage: coverageForPrompt(promptText, primitives, nodes),
          quality: null,
          validation: null,
          explanation: null,
        };
        graph.validation = validateGraphIR(graph, primitives, promptText);
        graph.explanation = promptExplanation(promptText, primitives, contract, graph);
        graph.quality = qualityForGraph(graph);
        return graph;
      }

    function coverageForPrompt(promptText, primitives, nodes) {
        const terms = uniqueList(meaningfulTokens(promptText));
        const rows = terms.map((term) => {
          const exact = (primitives || []).find((primitive) => {
            const text = primitiveText(primitive).toLowerCase();
            return primitive.id.includes(term) || text.split(/[^a-z0-9]+/).includes(term);
          });
          if (exact) return coverageRow(term, 'exactPrimitive', exact.id, 1);
          const open = (nodes || []).find((node) => node.source === 'open-semantic-rag' && String(node.role || '').includes(term));
          if (open) return coverageRow(term, 'openComponent', open.id, 0.82);
          const operator = (nodes || []).find((node) => (node.solverRequirements || []).some((item) => item.includes(term)));
          if (operator) return coverageRow(term, 'operatorState', operator.id, 0.68);
          return coverageRow(term, 'residual', '', 0);
        });
        return {
          schema: 'simulatte.promptCoverage.v1',
          terms: rows,
          residual: rows.filter((row) => row.kind === 'residual').map((row) => row.term),
        };
      }

    function coverageRow(term, kind, target, score) {
        return { term, kind, target, score: Number(score.toFixed(3)) };
      }

    function qualityForGraph(graph) {
        const total = graph.coverage && graph.coverage.terms.length || 0;
        const residual = graph.coverage && graph.coverage.residual.length || 0;
        const validationPenalty = graph.validation && graph.validation.status === 'repaired' ? 0.08 : 0;
        const coverage = total ? 1 - residual / total : 1;
        return {
          schema: 'simulatte.physicalQuality.v1',
          coverage: Number(coverage.toFixed(3)),
          residualTerms: graph.coverage ? graph.coverage.residual : [],
          score: Number(clamp(coverage - validationPenalty, 0, 1).toFixed(3)),
        };
      }

    function classifyPromptLayer(promptText, rankedPrimitives = []) {
        const prompt = String(promptText || '').toLowerCase();
        const says = (...terms) => terms.some((term) => prompt.includes(term));
        if (says('forest fire')) return 'composition';
        if (says('city', 'forest', 'coastline', 'warehouse', 'marketplace', 'lab bench', 'scene')) return 'scene';
        if (says('system', 'engine', 'reactor', 'grid', 'forest fire', 'erosion', 'bench')) return 'composition';
        if (says('component', 'motor', 'pump', 'valve', 'lens', 'mirror', 'magnet', 'sensor')) return 'component';
        if (says('material', 'element', 'water', 'wood', 'metal', 'glass', 'rock', 'sand')) return 'material';
        if (says('gravity', 'collision', 'diffusion', 'radiation', 'combustion', 'magnetism')) return 'physics';
        if (says('field', 'particle', 'graph', 'constraint', 'queue', 'ledger')) return 'math';
        const firstLayer = rankedPrimitives.find((primitive) => primitive.layer)?.layer;
        return firstLayer || 'composition';
      }

    function topLevelPrimitivesForLayer(primitives, layerFocus) {
        const ordered = primitives || [];
        const layerOrder = {
          scene: ['scene', 'composition', 'component'],
          composition: ['composition', 'scene', 'component'],
          component: ['component', 'composition'],
          material: ['material', 'component'],
          physics: ['physics', 'component'],
          math: ['math', 'physics'],
        }[layerFocus] || ['composition', 'scene', 'component'];
        const picked = [];
        for (const layer of layerOrder) {
          for (const primitive of ordered) {
            if (primitive.layer === layer && !picked.some((item) => item.id === primitive.id)) {
              picked.push(primitive);
            }
            if (picked.length >= 4) return picked;
          }
        }
        return ordered.slice(0, 4);
      }

    function layoutForPrimitives(primitives) {
        const ids = new Set((primitives || []).map((primitive) => primitive.id));
        for (const id of ids) {
          if (SCENE_LAYOUTS[id]) return { id, ...SCENE_LAYOUTS[id] };
        }
        if (ids.has('forest-fire')) return { id: 'forest', ...SCENE_LAYOUTS.forest };
        if (ids.has('river-erosion')) return { id: 'mountain-watershed', ...SCENE_LAYOUTS['mountain-watershed'] };
        if (ids.has('optics-bench')) return { id: 'lab-bench', ...SCENE_LAYOUTS['lab-bench'] };
        if (ids.has('power-grid') || ids.has('traffic-system')) return { id: 'city-grid', ...SCENE_LAYOUTS['city-grid'] };
        return { id: 'freeform', grammar: 'radial assembly', zones: ['source', 'field', 'matter'], camera: 'plan' };
      }

    function readoutsForPrimitives(primitives) {
        const tokens = primitiveTokenSet(primitives);
        const rule = CONTEXTUAL_READOUT_RULES.find((item) => (
          item.when.length && item.when.every((token) => tokens.has(token))
        )) || CONTEXTUAL_READOUT_RULES.find((item) => item.id === 'generic');
        return [...rule.labels];
      }

    function contractForPrimitive(primitive) {
        if (!primitive) return null;
        const materialId = primitive.material || primitive.id;
        return {
          id: primitive.id,
          layer: primitive.layer || '',
          geometry: geometryForPrimitive(primitive),
          material: primitive.layer === 'material' || MATERIAL_PROFILES[materialId] || primitive.material
            ? materialPropertiesForId(materialId)
            : null,
          ports: portsForPrimitive(primitive),
          slots: recipeSlotsForId(primitive.id),
        };
      }

    Object.assign(scope, {
      visualSlotTargetsForAction,
      toCatalogItem,
      uniqueCatalogItems,
      generatedMaterialPropertiesForId,
      paramsForHandwrittenPrompt,
      clamp,
      clamp01,
      wrapAngle,
      shortestAngle,
      hashNoise,
      slugify,
      templateById,
      normalizeControl,
      labelize,
      controlsForSpec,
      controlsByKey,
      normalizeParams,
      normalizeObjects,
      uniqueList,
      meaningfulTokens,
      addVectorFeature,
      buildIntentVector,
      vectorScore,
      primitiveById,
      isRetrievablePrimitive,
      layerForId,
      lowerLayerFor,
      validateLayerAdjacency,
      primitiveText,
      materialPropertiesForId,
      geometryForPrimitive,
      portsForPrimitive,
      recipeSlotsForId,
      primitiveTokenSet,
      matchingInteractionRules,
      unitsForParams,
      conservationForPrimitives,
      operatorsForPrimitives,
      stateForPrimitive,
      graphNodeForPrimitive,
      physicalNodeTypeForPrimitive,
      firstDomainRegime,
      solverRequirementsForPrimitive,
      graphEdgesForNodes,
      edgeTypeForChannel,
      validateGraphIR,
      temporalEventsForPrimitives,
      promptExplanation,
      primitivePromptIdentityScore,
      compileGraphIR,
      coverageForPrompt,
      coverageRow,
      qualityForGraph,
      classifyPromptLayer,
      topLevelPrimitivesForLayer,
      layoutForPrimitives,
      readoutsForPrimitives,
      contractForPrimitive,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
