(function attachSimulattePhysicsModel(root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const composer = typeof module === 'object' && module.exports
    ? require('./simulatte-composition-graph.js')
    : root.SimulatteCompositionGraph;
  const classifier = typeof module === 'object' && module.exports
    ? require('./simulatte-intent-classifier.js')
    : root.SimulatteIntentClassifier;
  const semantic = typeof module === 'object' && module.exports
    ? require('./simulatte-semantic-rag.js')
    : root.SimulatteSemanticRag;
  const doppler = typeof module === 'object' && module.exports
    ? require('./simulatte-doppler-intent.js')
    : root.SimulatteDopplerIntent;
  const graphSynthesis = typeof module === 'object' && module.exports
    ? require('./simulatte-graph-synthesis.js')
    : root.SimulatteGraphSynthesis;
  const api = factory(catalog, composer, classifier, semantic, doppler, graphSynthesis);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsModel(
  catalog,
  composer = {},
  classifier = {},
  semantic = {},
  doppler = {},
  graphSynthesis = {}
) {
  const {
    CONTROL_LIBRARY,
    DEFAULT_PARAMS,
    EXAMPLE_INTENTS,
    FIELD_GRID,
    PHYSICAL_PRIMITIVES,
    SEMANTIC_STOPWORDS,
    TAU,
    TEMPLATE_LIBRARY,
    TOKEN_SYNONYMS,
    buildIntentVector,
    clamp,
    clamp01,
    contractSummaryForPrimitives,
    controlsByKey,
    controlsForSpec,
    explicitPrimitiveScore,
    hashNoise,
    labelize,
    meaningfulTokens,
    normalizeControl,
    normalizeObjects,
    normalizeParams,
    primitiveById,
    primitiveText,
    rankPhysicalPrimitives,
    shortestAngle,
    slugify,
    templateById,
    unitsForParams,
    uniqueList,
    vectorScore,
    withPrimitiveDependencies,
    wrapAngle,
  } = catalog;
  const {
    COMPOSITION_SCHEMA,
    RENDER_PROGRAM_SCHEMA,
    buildCompositionGraph,
    compileCompositionToRenderProgram,
  } = composer || {};
  const {
    INTENT_CLASSIFICATION_SCHEMA,
    INTENT_MODEL_ID,
    classificationSummary,
    classifyIntentPrompt,
    rankPrimitivesForClassification,
  } = classifier || {};
  const {
    SEMANTIC_RAG_SCHEMA,
    buildPrimitiveProgram,
    createSemanticRag,
  } = semantic || {};
  const {
    DOPPLER_INTENT_SCHEMA,
    normalizeDopplerIntent,
  } = doppler || {};
  const {
    SYNTHESIS_SCHEMA,
    groundedPrimitiveRows,
    synthesizeWorldIntent,
  } = graphSynthesis || {};

  function createSpec(templateId = 'magnetic-wheel', overrides = {}) {
    const template = templateById(templateId);
    const name = String(overrides.name || template.name).trim() || template.name;
    const controls = (overrides.controls || template.controls || []).map(normalizeControl);
    const modules = uniqueList(overrides.modules || template.modules || []);
    const objects = normalizeObjects(overrides.objects, template.objects || []);
    const spec = {
      schema: 'simulatte.simulationSpec.v1',
      id: overrides.id || `${slugify(name)}-${Date.now().toString(36)}`,
      templateId: template.id,
      name,
      kind: template.kind,
      description: String(overrides.description || template.description),
      modules,
      objects,
      controls,
      params: normalizeParams(template, overrides.params, controls),
      intent: overrides.intent || null,
      contract: overrides.contract || (
        overrides.intent && overrides.intent.resolution
          ? overrides.intent.resolution.contract || null
          : null
      ),
      createdAt: overrides.createdAt || new Date(0).toISOString(),
      remixOf: overrides.remixOf || '',
    };
    spec.compositionGraph = overrides.compositionGraph || (
      buildCompositionGraph && spec.templateId === 'custom-world' ? buildCompositionGraph(spec) : null
    );
    spec.renderProgram = overrides.renderProgram || (
      spec.compositionGraph && compileCompositionToRenderProgram
        ? compileCompositionToRenderProgram(spec.compositionGraph, spec)
        : null
    );
    spec.physicalSpec = overrides.physicalSpec || (
      spec.contract && spec.contract.graph ? compilePhysicalSpec(spec) : null
    );
    return spec;
  }

  function normalizeSpec(raw) {
    if (!raw || typeof raw !== 'object') return createSpec('magnetic-wheel');
    const template = templateById(raw.templateId);
    return createSpec(template.id, {
      id: raw.id || `${template.id}-${Date.now().toString(36)}`,
      name: raw.name || template.name,
      description: raw.description || template.description,
      modules: raw.modules || template.modules || [],
      objects: raw.objects || template.objects || [],
      controls: raw.controls || template.controls || [],
      params: raw.params || {},
      intent: raw.intent || null,
      contract: raw.contract || (
        raw.intent && raw.intent.resolution
          ? raw.intent.resolution.contract || null
          : null
      ),
      compositionGraph: raw.compositionGraph || null,
      renderProgram: raw.renderProgram || null,
      physicalSpec: raw.physicalSpec || null,
      createdAt: raw.createdAt || new Date(0).toISOString(),
      remixOf: raw.remixOf || '',
    });
  }

  function compilePhysicalSpec(spec) {
    const graph = spec.contract && spec.contract.graph || {};
    const renderProgram = spec.renderProgram || {};
    const solverPlan = renderProgram.solverPlan || solverPlanForGraph(graph);
    const nodes = graph.nodes || [];
    const nodeIdsByType = (type) => nodes.filter((node) => node.nodeType === type).map((node) => node.id);
    return {
      schema: 'simulatte.physicalSpec.v1',
      sourceGraph: graph.schema || '',
      prompt: spec.intent && spec.intent.prompt || spec.name,
      materials: graphMaterialMap(nodes),
      operators: graph.operators || [],
      stateTextures: uniqueList([
        ...(solverPlan.state || []),
        ...nodes.flatMap((node) => node.solverRequirements || []),
      ]),
      sources: nodeIdsByType('source'),
      sinks: nodeIdsByType('sink'),
      boundaries: nodeIdsByType('boundary'),
      sensors: nodeIdsByType('sensor'),
      controllers: nodeIdsByType('controller'),
      particles: particlePlansForNodes(nodes),
      fields: renderProgram.fields || [],
      readouts: spec.contract && spec.contract.readouts || [],
      renderPasses: renderPassesForSolverPlan(solverPlan),
      debugViews: debugViewsForGraph(graph),
      quality: graph.quality || { score: 1, residualTerms: [] },
      receipt: {
        classifier: spec.intent && spec.intent.classification ? spec.intent.classification.model.id : '',
        rerank: spec.intent && spec.intent.rerank ? spec.intent.rerank : null,
        rag: spec.intent && spec.intent.semanticRag ? spec.intent.semanticRag.model.id : '',
        doppler: dopplerReceipt(spec.intent && spec.intent.dopplerIntent),
        synthesis: synthesisReceipt(spec.intent && spec.intent.synthesis),
        renderer: renderProgram.rendererPlan ? renderProgram.rendererPlan.renderer : '',
        visualIdentity: renderProgram.provenance ? renderProgram.provenance.visualIdentity || null : null,
        graphValidation: graph.validation ? graph.validation.status : 'unknown',
      },
    };
  }

  function graphMaterialMap(nodes) {
    return Object.fromEntries((nodes || [])
      .filter((node) => node.material)
      .map((node) => [node.id, node.material]));
  }

  function solverPlanForGraph(graph) {
    const regimes = new Set((graph.nodes || []).map((node) => node.visualRegime).filter(Boolean));
    const families = [];
    if (regimes.has('fluid')) families.push('particle-advection');
    if (regimes.has('thermal')) families.push('heat-diffusion');
    if (regimes.has('optical')) families.push('ray-optics');
    if (regimes.has('magnetic')) families.push('magnetic-vector-field');
    if (regimes.has('electrical')) families.push('electric-potential-field');
    if (regimes.has('granular')) families.push('granular-settling');
    if (regimes.has('biological')) families.push('growth-diffusion');
    if (regimes.has('soft')) families.push('membrane-relaxation');
    if (regimes.has('acoustic')) families.push('wave-equation');
    if (regimes.has('phase')) families.push('phase-boundary');
    if (!families.length) families.push('scalar-coupled-state');
    return { families, state: uniqueList((graph.nodes || []).flatMap((node) => node.solverRequirements || [])) };
  }

  function particlePlansForNodes(nodes) {
    return (nodes || [])
      .filter((node) => node.primitiveProgram)
      .map((node) => ({
        nodeId: node.id,
        visualRegime: node.visualRegime,
        material: node.primitiveProgram.material,
        parts: node.primitiveProgram.parts,
      }));
  }

  function renderPassesForSolverPlan(plan) {
    const families = plan.families || [];
    return uniqueList([
      'state-upload',
      ...families.map((family) => `${family}-solve`),
      'material-field-render',
      'particle-render',
      'composite',
      'debug-readback',
    ]);
  }

  function debugViewsForGraph(graph) {
    return uniqueList([
      'coverage',
      'physical-graph',
      ...(graph.quality && graph.quality.residualTerms && graph.quality.residualTerms.length ? ['residual-terms'] : []),
      ...(graph.validation && graph.validation.status === 'repaired' ? ['repairs'] : []),
    ]);
  }

  function dopplerReceipt(dopplerIntent) {
    if (!dopplerIntent) return null;
    return {
      schema: DOPPLER_INTENT_SCHEMA || 'simulatte.dopplerIntentHints.v1',
      source: dopplerIntent.source || 'doppler-residual-intent',
      model: dopplerIntent.model ? dopplerIntent.model.id : '',
      primitiveCount: (dopplerIntent.primitives || []).length,
      regimes: dopplerIntent.regimes || [],
      operators: dopplerIntent.operators || [],
    };
  }

  function contractForComponent(contract, id) {
    return {
      geometry: contract && contract.geometry ? contract.geometry[id] || null : null,
      ports: contract && contract.ports ? contract.ports[id] || null : null,
      slots: contract && contract.recipeSlots ? contract.recipeSlots[id] || [] : [],
    };
  }

  function averageMaterialProperties(materials = {}) {
    const values = Object.values(materials);
    if (!values.length) return {};
    const totals = {};
    for (const material of values) {
      for (const [key, value] of Object.entries(material)) {
        totals[key] = (totals[key] || 0) + Number(value || 0);
      }
    }
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / values.length]));
  }

  function interactionTotals(contract) {
    const totals = {};
    for (const rule of contract && contract.interactions || []) {
      for (const [key, value] of Object.entries(rule.params || {})) {
        totals[key] = (totals[key] || 0) + Number(value || 0);
      }
    }
    return totals;
  }

  function operatorTotals(contract) {
    const totals = {};
    const operators = contract && contract.graph ? contract.graph.operators || [] : [];
    for (const operator of operators) {
      if (operator.id === 'combustion') {
        totals.heat = (totals.heat || 0) + 0.18;
        totals.matter = (totals.matter || 0) - 0.04;
      } else if (operator.id === 'advection') {
        totals.motion = (totals.motion || 0) + 0.12;
      } else if (operator.id === 'erosion') {
        totals.matter = (totals.matter || 0) + 0.14;
        totals.stability = (totals.stability || 0) - 0.04;
      } else if (operator.id === 'refraction') {
        totals.field = (totals.field || 0) + 0.08;
      } else if (operator.id === 'queueService') {
        totals.motion = (totals.motion || 0) - 0.04;
      } else if (operator.id === 'magnetism') {
        totals.field = (totals.field || 0) + 0.12;
      }
    }
    return totals;
  }

  function applyContractDefaults(params, contract) {
    if (!contract) return;
    const material = averageMaterialProperties(contract.materials);
    const interactions = interactionTotals(contract);
    const use = (key, value) => {
      if (Number.isFinite(value)) params[key] = clamp01(Number(value));
    };
    use('density', material.density);
    use('hardness', material.hardness);
    use('conductivity', material.conductivity);
    use('combustibility', material.combustibility + (interactions.fire || 0));
    use('moisture', material.moisture);
    use('opacity', material.opacity);
    if (Number.isFinite(material.refractiveIndex)) {
      params.refractiveIndex = clamp(material.refractiveIndex, 1, 2.6);
    }
    use('magnetization', material.magnetization);
    use('viscosity', material.viscosity);
    use('phaseThreshold', material.phasePoint);
    if (Number.isFinite(interactions.heat)) {
      params.heatTransfer = clamp01((params.heatTransfer || 0) + interactions.heat);
    }
    if (Number.isFinite(interactions.field)) {
      params.fieldStrength = clamp01((params.fieldStrength || 0) + interactions.field);
    }
    if (Number.isFinite(interactions.matter)) {
      params.complexity = clamp01((params.complexity || 0.5) + interactions.matter * 0.25);
    }
  }

  function applyPromptParameterHints(promptText, params, addControl = () => {}) {
    const prompt = String(promptText || '').toLowerCase();
    const has = (...terms) => terms.some((term) => prompt.includes(term));
    const assign = (values) => {
      for (const [key, value] of Object.entries(values)) {
        params[key] = value;
        addControl(key);
      }
    };

    if ((has('sunlit', 'solar') && has('rotor', 'wheel')) || has('alternating magnets')) {
      assign({
        irradiance: 1040,
        magneticStrength: 0.9,
        sliderAmplitude: 0.68,
        sliderPhase: 0.12,
        loadTorque: 0.28,
        friction: 0.055,
        driveTiming: 0.64,
      });
    }
    if (has('dry pine', 'combustion', 'smoke lift', 'damp pockets')) {
      assign({
        combustibility: 0.88,
        moisture: 0.18,
        windSpeed: 0.52,
        flowRate: 0.38,
        heatTransfer: 0.74,
        opacity: 0.62,
        damping: 0.07,
      });
    }
    if (has('collimated', 'prismatic', 'refractive split') || has('glass lens', 'prism')) {
      assign({
        lightIntensity: 0.92,
        refractiveIndex: 1.68,
        opacity: 0.08,
        fieldStrength: 0.62,
        heatTransfer: 0.14,
        signalNoise: 0.04,
      });
    }
    if (has('rush-hour', 'demand queue', 'throughput meter', 'noisy packets')) {
      assign({
        queueBacklog: 0.78,
        serviceRate: 0.42,
        marketDemand: 0.74,
        networkLatency: 0.44,
        signalDelay: 0.32,
        signalNoise: 0.18,
      });
    }
    if (has('steep rain', 'rain channel', 'sediment fan', 'gravity slope')) {
      assign({
        flowRate: 0.82,
        erosionRate: 0.62,
        terrainSlope: 0.54,
        gravity: 0.18,
        granularFriction: 0.32,
        moisture: 0.76,
      });
    }
  }

  function graphNodeForSpec(contract, id) {
    const nodes = contract && contract.graph ? contract.graph.nodes || [] : [];
    return nodes.find((node) => node.id === id) || null;
  }

  function createIntentFromPrompt(promptText = '', options = {}) {
    const prompt = String(promptText || '').toLowerCase();
    const words = prompt.split(/[^a-z0-9]+/).filter(Boolean);
    const title = titleFromPrompt(words);
    const semanticRag = options.semanticRag || (
      createSemanticRag && prompt.trim()
        ? createSemanticRag(promptText, PHYSICAL_PRIMITIVES, { maxDocuments: 72, maxOpenComponents: 12 })
        : null
    );
    const dopplerIntent = normalizeDopplerIntent
      ? normalizeDopplerIntent(options.dopplerIntent || options.dopplerHints, PHYSICAL_PRIMITIVES)
      : null;
    const hasModelBackedSelection = Array.isArray(options.embeddingPriors)
      && options.embeddingPriors.length
      && options.embeddingModel
      && options.embeddingModel.id;
    const allowPrototypeFallback = options.allowPrototypeFallback === true;
    const shouldClassify = classifyIntentPrompt && (
      hasModelBackedSelection ||
      allowPrototypeFallback ||
      !prompt ||
      /\b(blank|empty|scratch)\b/.test(prompt)
    );
    const classification = shouldClassify
      ? classifyIntentPrompt(promptText, {
        max: 36,
        embeddingPriors: options.embeddingPriors || [],
        embeddingModel: options.embeddingModel || null,
        embeddingBackend: options.embeddingBackend || '',
        allowPrototypeFallback,
        semanticRag,
      })
      : null;
    const intent = {
      schema: 'simulatte.intent.v1',
      prompt: String(promptText || '').trim(),
      title: title || 'Custom Physics World',
      domains: [],
      components: [],
      conceptGraph: [],
      classification,
      rerank: options.intentRerank || options.rerank || null,
      semanticRag,
      dopplerIntent,
      resolution: {
        mode: '2d',
        integrator: 'semi-implicit-euler',
        renderer: 'webgpu-field-with-canvas-fallback',
        ranker: classification ? classification.model.id : 'simulatte-physical-primitives-v1',
        classifier: classification ? classification.model.id : 'simulatte-physical-primitives-v1',
        embedding: classification && classification.model.runtime ? classification.model.runtime : null,
        rerank: options.intentRerank || options.rerank || null,
        doppler: dopplerIntent ? dopplerReceipt(dopplerIntent) : null,
      },
    };
    const addDomain = (...domains) => {
      for (const domain of domains) {
        if (!intent.domains.includes(domain)) intent.domains.push(domain);
      }
    };
    const addComponent = (id, type, role, params = {}, controls = [], score = 0, meta = {}) => {
      if (intent.components.some((component) => component.id === id)) return;
      intent.components.push({
        id,
        type,
        role,
        params,
        controls: uniqueList(controls),
        score: Number(score || 0),
        ...meta,
      });
    };

    if (!prompt || /\b(blank|empty|scratch)\b/.test(prompt)) {
      intent.title = 'Blank Construction Plane';
      addDomain('blank');
      intent.resolution.integrator = 'none';
      addComponent('canvas', 'plane', 'empty 2d construction surface', { guideDensity: 0.42, canvasScale: 0.62 });
      return intent;
    }

    const synthesis = synthesizeWorldIntent
      ? synthesizeWorldIntent(promptText, {
        cardMatches: options.cardMatches || options.surfaceCardMatches || [],
        primitivePriors: options.embeddingPriors || [],
        semanticRag,
        dopplerIntent,
      }, catalog)
      : null;
    if (synthesis) {
      intent.synthesis = synthesis;
      intent.resolution.synthesis = synthesisReceipt(synthesis);
    }

    const baseCatalogRanked = classification && rankPrimitivesForClassification
      ? rankPrimitivesForClassification(classification, { max: 40 })
      : withPrimitiveDependencies(rankPhysicalPrimitives(promptText), promptText);
    const synthRows = synthesisPrimitiveRows(synthesis);
    const preferSynthGraph = shouldPreferSynthGraph(promptText, synthesis);
    const catalogRanked = preferSynthGraph ? [] : baseCatalogRanked;
    const semanticRows = preferSynthGraph ? [] : semanticOpenPrimitives(semanticRag);
    const ranked = mergeRankedPrimitives(
      catalogRanked,
      synthRows,
      semanticRows,
      dopplerHintPrimitives(dopplerIntent, promptText)
    );
    const contract = contractSummaryForPrimitives(ranked, promptText);
    if (classification) {
      contract.layerFocus = classification.layerFocus;
      contract.classification = classificationSummary
        ? classificationSummary(classification)
        : {
          model: classification.model.id,
          confidence: classification.confidence,
          layerFocus: classification.layerFocus,
        };
    }
    if (dopplerIntent) {
      contract.doppler = {
        schema: dopplerIntent.schema,
        source: dopplerIntent.source,
        model: dopplerIntent.model,
        primitives: dopplerIntent.primitives.map((hint) => hint.primitiveId),
        regimes: dopplerIntent.regimes,
        operators: dopplerIntent.operators,
      };
    }
    if (synthesis) {
      contract.synthesis = {
        schema: synthesis.schema || SYNTHESIS_SCHEMA || '',
        model: synthesis.model,
        valid: synthesis.validation ? synthesis.validation.valid : false,
        nodes: synthesis.synthGraph ? synthesis.synthGraph.nodes.length : 0,
        relations: synthesis.synthGraph ? synthesis.synthGraph.relations.length : 0,
        events: synthesis.synthGraph ? synthesis.synthGraph.events.length : 0,
        groundedPrimitives: synthesis.groundedGraph ? synthesis.groundedGraph.primitiveIds.length : 0,
      };
    }
    intent.resolution.layerFocus = contract.layerFocus;
    intent.resolution.topLevel = contract.topLevel;
    intent.resolution.contract = contract;
    if (/\b(perpetual|magnetic wheel|solar magnetic|generator)\b/.test(prompt)) {
      intent.title = 'Solar Magnetic Perpetual Motion Machine';
    } else if (ranked.some((primitive) => primitive.domains.includes('optics'))) {
      intent.title = title || 'Prismatic Optics World';
    } else if (ranked.some((primitive) => primitive.domains.includes('fluid'))) {
      intent.title = title || 'Fluid Physics World';
    } else if (ranked.some((primitive) => primitive.domains.includes('chemistry'))) {
      intent.title = title || 'Reaction Field';
    } else if (ranked.some((primitive) => primitive.domains.includes('acoustics'))) {
      intent.title = title || 'Acoustic Wave World';
    } else {
      intent.title = title || 'Generated Physics World';
    }

    for (const primitive of ranked) {
      const primitiveContract = contractForComponent(contract, primitive.id);
      addDomain(...primitive.domains);
      addComponent(
        primitive.id,
        primitive.type,
        primitive.role,
        primitive.params,
        primitive.controls,
        primitive.score,
        {
          layer: primitive.layer || '',
          domains: primitive.domains || [],
          material: primitive.material || '',
          visualRegime: primitive.visualRegime || '',
          assembly: primitive.assembly || '',
          phrase: primitive.phrase || '',
          source: primitive.source || 'catalog',
          primitiveProgram: primitive.primitiveProgram || null,
          geometry: primitiveContract.geometry,
          ports: primitiveContract.ports,
          slots: primitiveContract.slots,
        }
      );
      intent.conceptGraph.push({
        id: primitive.id,
        score: primitive.score,
        domains: primitive.domains,
        prior: classification && classification.priors
          ? classification.priors.find((prior) => prior.primitiveId === primitive.id) || null
          : null,
        phrase: primitive.phrase || '',
        source: primitive.source || 'catalog',
      });
    }
    addSynthesisComponents(synthesis, addDomain, addComponent, intent);

    return intent;
  }

  function addSynthesisComponents(synthesis, addDomain, addComponent, intent = null) {
    if (!synthesis || !synthesis.synthGraph) return;
    for (const node of synthesis.synthGraph.nodes || []) {
      const componentId = slugify(node.id);
      const domains = uniqueList([
        'synth',
        node.nodeType,
        node.class,
        ...(node.materials || []),
        ...(node.behaviors || []),
        ...(node.constraints || []),
      ].filter(Boolean));
      addDomain(...domains);
      addComponent(
        componentId,
        node.nodeType,
        node.label,
        {},
        [],
        node.match ? node.match.score : 0.72,
        {
          layer: 'component',
          domains,
          material: materialForSynthesisNode(node),
          visualRegime: visualRegimeForSynthesisNode(node),
          assembly: node.class || node.cardId,
          phrase: node.match ? node.match.span : node.label,
          source: 'embedding-guided-synth-node',
          primitiveProgram: null,
          geometry: {
            kind: node.nodeType,
            shapes: node.morphology ? node.morphology.shapes || [] : [],
            parts: node.morphology ? node.morphology.parts || [] : [],
            scale: node.morphology ? node.morphology.scale || 'nominal' : 'nominal',
          },
          ports: node.ports || [],
          slots: node.morphology ? node.morphology.parts || [] : [],
          synthesis: {
            cardId: node.cardId,
            nodeType: node.nodeType,
            match: node.match || null,
          },
        }
      );
      if (intent && Array.isArray(intent.conceptGraph)) {
        intent.conceptGraph.push({
          id: componentId,
          score: node.match ? node.match.score : 0.72,
          domains,
          prior: null,
          phrase: node.match ? node.match.span : node.label,
          source: 'embedding-guided-synth-node',
        });
      }
    }
    for (const event of synthesis.synthGraph.events || []) {
      const componentId = slugify(event.id);
      const domains = uniqueList(['synth', 'event', event.type, ...(event.physics || [])]);
      addDomain(...domains);
      addComponent(
        componentId,
        'event',
        event.type,
        {},
        [],
        0.82,
        {
          layer: 'composition',
          domains,
          material: '',
          visualRegime: event.type === 'collision' ? 'mechanical' : 'generic',
          assembly: 'event',
          phrase: event.type,
          source: 'embedding-guided-synth-event',
          primitiveProgram: null,
          geometry: { kind: 'event', participants: event.participants || [] },
          ports: event.participants || [],
          slots: event.physics || [],
          synthesis: {
            cardId: event.cardId,
            eventType: event.type,
            participants: event.participants || [],
          },
        }
      );
      if (intent && Array.isArray(intent.conceptGraph)) {
        intent.conceptGraph.push({
          id: componentId,
          score: 0.82,
          domains,
          prior: null,
          phrase: event.type,
          source: 'embedding-guided-synth-event',
        });
      }
    }
    for (const environment of synthesis.synthGraph.environment || []) {
      const label = environment.label || environment.id || 'environment';
      const componentId = `environment-${slugify(environment.id || label)}`;
      const domains = uniqueList(['synth', 'environment', slugify(label)].filter(Boolean));
      addDomain(...domains);
      addComponent(
        componentId,
        'environment',
        label,
        {},
        [],
        0.68,
        {
          layer: 'scene',
          domains,
          material: /swamp|marsh|wetland|water/i.test(label) ? 'water' : '',
          visualRegime: /swamp|marsh|wetland|water/i.test(label) ? 'fluid' : 'generic',
          assembly: 'environment',
          phrase: label,
          source: 'embedding-guided-synth-environment',
          primitiveProgram: null,
          geometry: { kind: 'environment', label },
          ports: [],
          slots: [],
          synthesis: {
            environmentId: environment.id || label,
            source: environment.source || '',
          },
        }
      );
      if (intent && Array.isArray(intent.conceptGraph)) {
        intent.conceptGraph.push({
          id: componentId,
          score: 0.68,
          domains,
          prior: null,
          phrase: label,
          source: 'embedding-guided-synth-environment',
        });
      }
    }
  }

  function materialForSynthesisNode(node) {
    const materials = node.materials || [];
    if (materials.includes('soft_tissue')) return 'membrane';
    if (materials.includes('fur')) return 'protein';
    if (materials.includes('steel')) return 'metal';
    if (materials.includes('gold')) return 'gold';
    if (materials.includes('rubber_material')) return 'rubber';
    if (materials.includes('glass_material')) return 'glass';
    if (materials.includes('water_material')) return 'water';
    if (materials.includes('air_material')) return 'air';
    return materials.find((material) => primitiveById(material)) || '';
  }

  function visualRegimeForSynthesisNode(node) {
    const values = [
      node.class,
      ...(node.materials || []),
      ...(node.behaviors || []),
      ...(node.constraints || []),
      node.cardId,
    ].join(' ');
    if (/\bmammal|rodent|tissue|gait|soft/i.test(values)) return 'biological';
    if (/\bwheel|rotating|axle|apparatus|rigid/i.test(values)) return 'mechanical';
    if (/\bwater|flow|pipe|pump/i.test(values)) return 'fluid';
    if (/\bheat|fire|thermal/i.test(values)) return 'thermal';
    if (/\blens|glass|optics/i.test(values)) return 'optical';
    if (/\bmagnet|rotor/i.test(values)) return 'magnetic';
    return 'generic';
  }

  function synthesisPrimitiveRows(synthesis) {
    if (!synthesis || typeof groundedPrimitiveRows !== 'function') return [];
    return groundedPrimitiveRows(synthesis, catalog);
  }

  function shouldPreferSynthGraph(promptText, synthesis) {
    if (!synthesis || !synthesis.validation || synthesis.validation.valid !== true) return false;
    if (hasCatalogCriticalDomain(promptText)) return false;
    const graph = synthesis.synthGraph || {};
    const relations = graph.relations || [];
    const events = graph.events || [];
    const hasCompositionalRelation = relations.some((relation) => (
      relation.type === 'inside' ||
      relation.type === 'attached_to' ||
      relation.type === 'drives'
    ));
    const hasWorldEvent = events.some((event) => ['collision', 'falling', 'break'].includes(event.type));
    if ((!hasWorldEvent && !hasCompositionalRelation) || (graph.nodes || []).length < 2) return false;
    return !/\b(perpetual|solar magnetic|magnetic wheel|generator)\b/i.test(String(promptText || ''));
  }

  function hasCatalogCriticalDomain(promptText) {
    return /\b(logistics|warehouse|inventory|supply chain|market|demand|queue|backlog|sensor|feedback|control|controller|data recorder|audit trace|telemetry|traffic|network)\b/i
      .test(String(promptText || ''));
  }

  function synthesisReceipt(synthesis) {
    if (!synthesis) return null;
    return {
      schema: synthesis.schema || SYNTHESIS_SCHEMA || '',
      model: synthesis.model ? synthesis.model.id : '',
      retriever: synthesis.model ? synthesis.model.retriever : '',
      planner: synthesis.model ? synthesis.model.planner : '',
      valid: synthesis.validation ? synthesis.validation.valid : false,
      warnings: synthesis.validation ? synthesis.validation.warnings || [] : [],
      repairs: synthesis.validation ? synthesis.validation.repairs || [] : [],
      nodes: synthesis.synthGraph ? synthesis.synthGraph.nodes.length : 0,
      relations: synthesis.synthGraph ? synthesis.synthGraph.relations.length : 0,
      events: synthesis.synthGraph ? synthesis.synthGraph.events.length : 0,
      groundedPrimitives: synthesis.groundedGraph ? synthesis.groundedGraph.primitiveIds.length : 0,
    };
  }

  function semanticOpenPrimitives(semanticRag) {
    return (semanticRag && semanticRag.openComponents || []).map((component) => ({
      id: component.id,
      type: component.type || 'component',
      role: component.role || component.phrase || component.id,
      layer: component.layer || 'component',
      domains: component.domains || [],
      params: component.params || {},
      controls: component.controls || [],
      score: Number(component.score || 0.42),
      material: component.material || '',
      visualRegime: component.visualRegime || '',
      assembly: component.assembly || '',
      phrase: component.phrase || '',
      source: component.source || 'open-semantic-rag',
      primitiveProgram: component.primitiveProgram || (
        buildPrimitiveProgram ? buildPrimitiveProgram(component) : null
      ),
      recipe: [],
      text: component.phrase || component.role || '',
    }));
  }

  function dopplerHintPrimitives(dopplerIntent, promptText) {
    const hints = dopplerIntent && Array.isArray(dopplerIntent.primitives)
      ? dopplerIntent.primitives
      : [];
    if (!hints.length) return [];
    const rows = hints
      .map((hint) => {
        const primitive = primitiveById(hint.primitiveId);
        if (!primitive) return null;
        return {
          ...primitive,
          score: Number(Math.max(0.62, Number(hint.score || 0)).toFixed(4)),
          source: 'doppler-residual',
          phrase: hint.reason || primitive.text || primitive.role || '',
        };
      })
      .filter(Boolean);
    return withPrimitiveDependencies(rows, promptText)
      .map((primitive) => {
        const hint = hints.find((item) => item.primitiveId === primitive.id);
        return {
          ...primitive,
          score: Number(Math.max(primitive.score || 0, hint ? hint.score : 0).toFixed(4)),
          source: hint ? 'doppler-residual' : primitive.source || 'doppler-dependency',
          phrase: hint && hint.reason ? hint.reason : primitive.phrase || primitive.text || '',
        };
      });
  }

  function mergeRankedPrimitives(...rowSets) {
    const byId = new Map();
    for (const primitive of rowSets.flat()) {
      if (!primitive || !primitive.id) continue;
      const existing = byId.get(primitive.id);
      if (!existing || Number(primitive.score || 0) > Number(existing.score || 0)) {
        byId.set(primitive.id, primitive);
      }
    }
    return Array.from(byId.values())
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id))
      .slice(0, 56);
  }

  function resolveIntentToSpec(intentInput, overrides = {}) {
    const intent = intentInput && intentInput.schema === 'simulatte.intent.v1'
      ? intentInput
      : createIntentFromPrompt('');
    const overrideParams = overrides && overrides.params && typeof overrides.params === 'object'
      ? overrides.params
      : {};
    if (intent.domains.includes('blank')) {
      const plane = intent.components.find((component) => component.id === 'canvas');
      return createSpec('blank-world', {
        name: intent.title || 'Blank Construction Plane',
        description: intent.prompt ? `Intent: ${intent.prompt}` : 'Empty 2d construction surface.',
        params: { ...(plane ? plane.params : {}), ...overrideParams },
        intent,
      });
    }

    const modules = ['mechanics', 'field', 'energy-ledger'];
    const objects = [];
    const controls = ['energyInput', 'fieldStrength', 'damping', 'complexity'];
    const params = { ...templateById('custom-world').params };
    const contract = intent.resolution && intent.resolution.contract
      ? intent.resolution.contract
      : null;
    const addControl = (key) => {
      if (CONTROL_LIBRARY[key] && !controls.includes(key)) controls.push(key);
    };
    for (const domain of intent.domains) {
      if (!modules.includes(domain)) modules.push(domain);
    }
    for (const component of intent.components) {
      const graphNode = graphNodeForSpec(contract, component.id);
      objects.push({
        id: component.id,
        type: component.type,
        role: component.role,
        layer: component.layer || '',
        domains: component.domains || [],
        material: component.material || '',
        visualRegime: component.visualRegime || '',
        assembly: component.assembly || '',
        phrase: component.phrase || '',
        source: component.source || '',
        primitiveProgram: component.primitiveProgram || null,
        geometry: component.geometry || null,
        ports: component.ports || null,
        slots: component.slots || [],
        synthesis: component.synthesis || null,
        state: graphNode ? graphNode.state : null,
      });
      for (const key of component.controls || []) addControl(key);
      for (const [key, value] of Object.entries(component.params || {})) {
        params[key] = value;
        addControl(key);
      }
    }
    applyContractDefaults(params, contract);
    applyPromptParameterHints(intent.prompt, params, addControl);

    const exactMachine = intent.title === 'Solar Magnetic Perpetual Motion Machine';
    if (exactMachine) {
      Object.assign(params, {
        irradiance: 780,
        sliderAmplitude: 0.42,
        loadTorque: 0.16,
      });
    }
    for (const [key, value] of Object.entries(overrideParams)) {
      if (!Number.isFinite(Number(value))) continue;
      params[key] = Number(value);
      addControl(key);
    }
    if (contract && contract.graph) {
      contract.graph.units = unitsForParams(params);
    }
    return createSpec('custom-world', {
      name: exactMachine ? 'Solar Magnetic Perpetual Motion Machine' : intent.title || 'Custom Physics World',
      description: intent.prompt ? `Intent: ${intent.prompt}` : 'Prompt resolved into 2d simulation components.',
      modules,
      objects,
      controls,
      params,
      intent,
      contract,
    });
  }

  function createSpecFromPrompt(promptText = '', overrides = {}) {
    return resolveIntentToSpec(createIntentFromPrompt(promptText, overrides), overrides);
  }

  function titleFromPrompt(words) {
    const stop = new Set(['a', 'an', 'and', 'the', 'with', 'to', 'of', 'for', 'from', 'that', 'uses', 'use', 'build', 'make', 'create', 'simulate', 'simulation']);
    const keep = words.filter((word) => !stop.has(word)).slice(0, 6);
    if (!keep.length) return '';
    return keep.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  function remixSpec(inputSpec, overrides = {}) {
    const spec = normalizeSpec(inputSpec);
    const params = { ...spec.params };
    for (const [key, , min, max] of controlsForSpec(spec)) {
      const span = Number(max) - Number(min);
      const drift = span * (hashNoise(Date.now(), key.length + spec.id.length) - 0.5) * 0.12;
      params[key] = clamp(Number(params[key]) + drift, Number(min), Number(max));
    }
    return createSpec(spec.templateId, {
      ...spec,
      ...overrides,
      id: overrides.id || `${slugify(spec.name)}-remix-${Date.now().toString(36)}`,
      name: overrides.name || `${spec.name} Remix`,
      modules: overrides.modules || spec.modules,
      objects: overrides.objects || spec.objects,
      controls: overrides.controls || spec.controls,
      params: { ...params, ...(overrides.params || {}) },
      remixOf: spec.id,
    });
  }

  function serializeSpec(spec) {
    return JSON.stringify(normalizeSpec(spec), null, 2);
  }

  function deserializeSpec(text) {
    return normalizeSpec(JSON.parse(String(text || '{}')));
  }

  function createSimulationState(spec) {
    const normalized = normalizeSpec(spec);
    if (normalized.templateId === 'blank-world') return createBlankState(normalized);
    if (normalized.templateId === 'custom-world') return createCustomState(normalized);
    if (normalized.templateId === 'fluid-vortex') return createFluidState(normalized.params);
    if (normalized.templateId === 'reaction-diffusion') return createReactionState(normalized.params);
    return createState(normalized.params);
  }

  function stepSimulation(inputState, spec, dt) {
    const normalized = normalizeSpec(spec);
    if (normalized.templateId === 'blank-world') return stepBlankState(inputState, normalized, dt);
    if (normalized.templateId === 'custom-world') return stepCustomState(inputState, normalized, dt);
    if (normalized.templateId === 'fluid-vortex') return stepFluidState(inputState, normalized.params, dt);
    if (normalized.templateId === 'reaction-diffusion') return stepReactionState(inputState, normalized.params, dt);
    return stepState(inputState, normalized.params, dt);
  }

  function solarPower(params) {
    return Math.max(0, params.irradiance) * Math.max(0, params.panelArea) * clamp(params.panelEfficiency, 0, 1);
  }

  function magnetPosition(angle, radius) {
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  function createState(params = {}) {
    const next = { ...DEFAULT_PARAMS, ...params };
    return {
      kind: 'magnetic-wheel',
      t: 0,
      theta: 0.12,
      omega: 0,
      sliderAngle: 0,
      sliderVelocity: 0,
      solarBufferJ: 0,
      solarInputJ: 0,
      actuatorWorkJ: 0,
      wheelWorkJ: 0,
      loadOutputJ: 0,
      frictionLossJ: 0,
      generatorLossJ: 0,
      lastTorque: 0,
      lastMagneticTorque: 0,
      lastActuatorPower: 0,
      lastSolarPower: solarPower(next),
      lastLoadPower: 0,
      params: next,
    };
  }

  function magneticTorque(state, params) {
    const wheelMagnets = 10;
    const wheelRadius = 1.0;
    const sliderRadius = 1.42;
    const stator = magnetPosition(state.sliderAngle, sliderRadius);
    let torque = 0;
    for (let i = 0; i < wheelMagnets; i += 1) {
      const pole = i % 2 === 0 ? 1 : -1;
      const angle = state.theta + (i / wheelMagnets) * TAU;
      const rotor = magnetPosition(angle, wheelRadius);
      const dx = rotor.x - stator.x;
      const dy = rotor.y - stator.y;
      const dist2 = Math.max(0.055, dx * dx + dy * dy);
      const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
      const forceScale = params.magneticStrength * pole / (dist2 * Math.sqrt(dist2));
      const tangentialForce = (dx * tangent.x + dy * tangent.y) * forceScale;
      torque += tangentialForce * wheelRadius;
    }
    return clamp(torque, -2.8, 2.8);
  }

  function sliderTargetAngle(state, params) {
    const sunCycle = Math.sin(state.t * 0.42);
    const commutation = state.theta + params.sliderPhase * TAU;
    return wrapAngle(commutation + sunCycle * params.sliderAmplitude);
  }

  function stepState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const state = { ...inputState, params };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const sunPower = solarPower(params);
    state.solarInputJ += sunPower * dt;
    state.solarBufferJ += sunPower * dt;

    const target = sliderTargetAngle(state, params);
    const sliderError = shortestAngle(state.sliderAngle, target);
    const desiredVelocity = clamp(sliderError * 8, -3.6, 3.6);
    const velocityDelta = desiredVelocity - state.sliderVelocity;
    const actuatorPowerRequest = Math.abs(velocityDelta) * 9.5 + Math.abs(desiredVelocity) * 1.2;
    const actuatorPower = Math.min(state.solarBufferJ / dt, actuatorPowerRequest);
    const actuatorScale = actuatorPowerRequest > 0 ? actuatorPower / actuatorPowerRequest : 1;
    state.sliderVelocity += velocityDelta * actuatorScale * clamp(params.actuatorEfficiency, 0.05, 1);
    state.sliderVelocity *= 0.92;
    state.sliderAngle = wrapAngle(state.sliderAngle + state.sliderVelocity * dt);
    state.solarBufferJ = Math.max(0, state.solarBufferJ - actuatorPower * dt);
    state.actuatorWorkJ += actuatorPower * dt;

    let magTorque = magneticTorque(state, params);
    const predictedOmega = state.omega + (magTorque / Math.max(0.05, params.wheelInertia)) * dt;
    const fieldPowerRequest = Math.max(0, magTorque * predictedOmega) / clamp(params.actuatorEfficiency, 0.05, 1);
    const fieldPower = Math.min(state.solarBufferJ / dt, fieldPowerRequest);
    const fieldScale = fieldPowerRequest > 0 ? fieldPower / fieldPowerRequest : 1;
    magTorque *= fieldScale;
    state.solarBufferJ = Math.max(0, state.solarBufferJ - fieldPower * dt);
    state.actuatorWorkJ += fieldPower * dt;
    const loadTorque = Math.sign(state.omega || magTorque || 1) * Math.min(Math.abs(params.loadTorque), Math.abs(state.omega) * 0.18 + 0.08);
    const frictionTorque = state.omega * params.friction;
    const netTorque = magTorque - frictionTorque - loadTorque;
    const alpha = netTorque / Math.max(0.05, params.wheelInertia);
    state.omega += alpha * dt;
    state.omega *= 0.999;
    state.theta = wrapAngle(state.theta + state.omega * dt);

    const magneticPower = magTorque * state.omega;
    const loadPower = Math.max(0, loadTorque * state.omega);
    const frictionPower = Math.max(0, frictionTorque * state.omega);
    const generatorLoss = loadPower * 0.08;
    state.wheelWorkJ += magneticPower * dt;
    state.loadOutputJ += loadPower * dt;
    state.frictionLossJ += frictionPower * dt;
    state.generatorLossJ += generatorLoss * dt;
    state.t += dt;
    state.lastTorque = netTorque;
    state.lastMagneticTorque = magTorque;
    state.lastActuatorPower = actuatorPower + fieldPower;
    state.lastSolarPower = sunPower;
    state.lastLoadPower = loadPower;
    return state;
  }

  function kineticEnergy(state) {
    return 0.5 * state.params.wheelInertia * state.omega * state.omega;
  }

  function energyLedger(state) {
    const stored = kineticEnergy(state) + state.solarBufferJ;
    const spent = state.actuatorWorkJ + state.loadOutputJ + state.frictionLossJ + state.generatorLossJ + stored;
    return {
      solarInputJ: state.solarInputJ,
      actuatorWorkJ: state.actuatorWorkJ,
      wheelKineticJ: kineticEnergy(state),
      loadOutputJ: state.loadOutputJ,
      frictionLossJ: state.frictionLossJ,
      generatorLossJ: state.generatorLossJ,
      solarBufferJ: state.solarBufferJ,
      balanceErrorJ: state.solarInputJ - spent,
      rpm: state.omega * 60 / TAU,
      torqueNm: state.lastTorque,
      magneticTorqueNm: state.lastMagneticTorque,
      solarPowerW: state.lastSolarPower,
      actuatorPowerW: state.lastActuatorPower,
      loadPowerW: state.lastLoadPower,
    };
  }

  function createFluidState(params = {}) {
    const next = { ...templateById('fluid-vortex').params, ...params };
    const particles = Array.from({ length: 360 }, (_, index) => ({
      x: hashNoise(3, index),
      y: hashNoise(7, index),
      vx: 0,
      vy: 0,
      age: hashNoise(11, index),
    }));
    return {
      kind: 'fluid-vortex',
      t: 0,
      particles,
      pressure: 0,
      vorticity: 0,
      mixing: 0,
      dragLossJ: 0,
      flowInputJ: 0,
      params: next,
    };
  }

  function stepFluidState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const state = {
      ...inputState,
      params,
      particles: inputState.particles.map((particle) => ({ ...particle })),
    };
    const obstacle = { x: 0.56, y: 0.52, r: params.obstacleRadius };
    let vorticity = 0;
    let pressure = 0;
    let mixing = 0;
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      const dx = p.x - obstacle.x;
      const dy = p.y - obstacle.y;
      const dist = Math.max(0.018, Math.hypot(dx, dy));
      const nx = dx / dist;
      const ny = dy / dist;
      const wake = Math.exp(-dist / Math.max(0.04, obstacle.r * 2.8));
      const swirl = params.vortexStrength * wake;
      const noise = (hashNoise(Math.floor(state.t * 30), i) - 0.5) * params.turbulence;
      p.vx += (params.inletFlow * 0.55 + -ny * swirl + noise) * dt;
      p.vy += (nx * swirl + params.gravity + noise * 0.35) * dt;
      p.vx *= 1 - params.viscosity * dt * 1.8;
      p.vy *= 1 - params.viscosity * dt * 1.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (dist < obstacle.r) {
        p.x = obstacle.x + nx * obstacle.r;
        p.y = obstacle.y + ny * obstacle.r;
        p.vx += nx * 0.4;
        p.vy += ny * 0.4;
        pressure += 1;
      }
      if (p.x > 1.04 || p.y < -0.04 || p.y > 1.04) {
        p.x = -0.03;
        p.y = hashNoise(i, Math.floor(state.t * 10));
        p.vx = params.inletFlow;
        p.vy = 0;
        p.age = 0;
      }
      if (p.x < -0.06) p.x = 1.03;
      p.age = clamp01(p.age + dt * 0.08);
      vorticity += Math.abs(p.vx * ny - p.vy * nx);
      mixing += p.age * (1 - Math.abs(p.y - 0.5) * 1.2);
    }
    const count = state.particles.length || 1;
    state.t += dt;
    state.vorticity = vorticity / count;
    state.pressure = pressure / count * 100;
    state.mixing = clamp01(mixing / count);
    state.flowInputJ += Math.max(0, params.inletFlow) * dt * 12;
    state.dragLossJ += state.vorticity * params.viscosity * dt * 7;
    return state;
  }

  function createReactionState(params = {}) {
    const next = { ...templateById('reaction-diffusion').params, ...params };
    const size = FIELD_GRID;
    const a = new Float32Array(size * size).fill(1);
    const b = new Float32Array(size * size);
    const heat = new Float32Array(size * size);
    const center = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dist = Math.hypot(x - center, y - center);
        if (dist < size * 0.12 || hashNoise(x, y) > 0.986) {
          const idx = y * size + x;
          b[idx] = 0.9;
          a[idx] = 0.25;
        }
      }
    }
    return {
      kind: 'reaction-diffusion',
      t: 0,
      size,
      a,
      b,
      heat,
      conversion: 0,
      front: 0,
      entropy: 0,
      params: next,
    };
  }

  function laplace(field, size, x, y) {
    const xm = (x + size - 1) % size;
    const xp = (x + 1) % size;
    const ym = (y + size - 1) % size;
    const yp = (y + 1) % size;
    const c = field[y * size + x];
    return (
      field[y * size + xm] +
      field[y * size + xp] +
      field[ym * size + x] +
      field[yp * size + x] -
      4 * c
    );
  }

  function stepReactionState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const size = inputState.size || FIELD_GRID;
    const a = new Float32Array(inputState.a);
    const b = new Float32Array(inputState.b);
    const heat = new Float32Array(inputState.heat);
    const nextA = new Float32Array(a.length);
    const nextB = new Float32Array(b.length);
    const nextHeat = new Float32Array(heat.length);
    let massB = 0;
    let front = 0;
    let entropy = 0;
    const scale = dt * 8;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const av = a[idx];
        const bv = b[idx];
        const reaction = av * bv * bv * (0.75 + params.catalyst * 0.45);
        const da = params.diffusionA * laplace(a, size, x, y) - reaction + params.feedRate * (1 - av);
        const db = params.diffusionB * laplace(b, size, x, y) + reaction - (params.killRate + params.feedRate) * bv;
        const nvA = clamp(av + da * scale, 0, 1);
        const nvB = clamp(bv + db * scale, 0, 1);
        nextA[idx] = nvA;
        nextB[idx] = nvB;
        nextHeat[idx] = clamp(heat[idx] + reaction * scale * 0.22 - params.cooling * heat[idx] * dt, 0, 1);
        massB += nvB;
        front += Math.abs(nvB - bv);
        const local = clamp01(nvB);
        entropy += local > 0 && local < 1 ? -local * Math.log(local) : 0;
      }
    }
    const cells = size * size;
    return {
      kind: 'reaction-diffusion',
      t: inputState.t + dt,
      size,
      a: nextA,
      b: nextB,
      heat: nextHeat,
      conversion: massB / cells,
      front: front / cells,
      entropy: entropy / cells,
      params,
    };
  }

  function createBlankState(spec) {
    return {
      kind: 'blank-world',
      t: 0,
      params: { ...templateById('blank-world').params, ...spec.params },
      modules: [],
      objects: [],
    };
  }

  function stepBlankState(inputState, spec, dtInput) {
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    return {
      ...inputState,
      t: inputState.t + dt,
      params: { ...inputState.params, ...spec.params },
    };
  }

  function hasModule(specOrState, moduleName) {
    return (specOrState.modules || []).includes(moduleName);
  }

  function isMagneticMachine(spec) {
    return hasModule(spec, 'electromagnetism') &&
      (spec.objects || []).some((object) => /wheel|rotor|slider|magnet/i.test(`${object.id} ${object.role}`));
  }

  function createCustomParticles(spec) {
    const count = 120 + Math.round(clamp(spec.params.complexity ?? 0.5, 0, 1) * 220) + (spec.objects || []).length * 16;
    return Array.from({ length: count }, (_, index) => ({
      x: hashNoise(19, index),
      y: hashNoise(23, index),
      vx: (hashNoise(29, index) - 0.5) * 0.08,
      vy: (hashNoise(31, index) - 0.5) * 0.08,
      phase: hashNoise(37, index),
      kind: index % Math.max(1, (spec.objects || []).length),
    }));
  }

  function createComponentStates(spec) {
    const graphNodes = spec.contract && spec.contract.graph ? spec.contract.graph.nodes || [] : [];
    const graphStates = Object.fromEntries(graphNodes.map((node) => [node.id, node.state || {}]));
    return Object.fromEntries((spec.objects || []).map((object) => [
      object.id,
      {
        ...(graphStates[object.id] || {}),
        ...(object.state || {}),
      },
    ]));
  }

  function stepComponentStates(inputStates, spec, params, dt) {
    const next = {};
    const interactions = interactionTotals(spec.contract);
    const operators = operatorTotals(spec.contract);
    const heatDelta = ((params.heatTransfer || 0) * 0.02 + (operators.heat || 0)) * dt;
    const moistureDelta = ((params.moisture || 0) * 0.01 + Math.min(0, interactions.fire || 0) * 0.02) * dt;
    for (const object of spec.objects || []) {
      const previous = inputStates && inputStates[object.id] ? inputStates[object.id] : object.state || {};
      const isFire = /flame|combustion|fire/.test(object.id);
      const isQueue = /queue|market|traffic/.test(object.id);
      const isWater = /water|river|lake/.test(object.id);
      next[object.id] = {
        temperature: clamp01((previous.temperature ?? 0.5) + heatDelta + (isFire ? 0.018 : 0)),
        moisture: clamp01((previous.moisture ?? 0) + moistureDelta + (isWater ? 0.006 : -0.002) * dt),
        charge: clamp((previous.charge ?? 0) + (params.electricField || 0) * dt * 0.01, -1, 1),
        pressure: clamp01((previous.pressure ?? 0) + (params.pressure || 0) * dt * 0.01),
        backlog: clamp01((previous.backlog ?? 0) + (isQueue ? (params.queueBacklog || 0) * dt * 0.02 : 0)),
        fuel: clamp01((previous.fuel ?? 0) - (isFire ? Math.max(0, params.combustibility || 0) * dt * 0.008 : 0)),
        mass: Math.max(0, (previous.mass ?? 0.2) - (isFire ? dt * 0.001 : 0)),
        velocity: clamp01((previous.velocity ?? 0) + (params.flowRate || params.windSpeed || 0) * dt * 0.02),
        health: clamp01((previous.health ?? 1) - Math.max(0, params.infectionRate || 0) * dt * 0.006),
        inventory: clamp01((previous.inventory ?? 0) + (isQueue ? (params.marketDemand || 0) * dt * 0.012 : 0)),
      };
    }
    return next;
  }

  function createCustomState(spec) {
    const params = { ...templateById('custom-world').params, ...spec.params };
    return {
      kind: 'custom-world',
      t: 0,
      params,
      modules: spec.modules,
      objects: spec.objects,
      componentStates: createComponentStates(spec),
      particles: createCustomParticles({ ...spec, params }),
      machine: isMagneticMachine(spec) ? createState(params) : null,
      fluid: hasModule(spec, 'fluid') ? createFluidState({
        ...params,
        inletFlow: params.inletFlow ?? params.flowRate,
        vortexStrength: params.vortexStrength ?? params.fieldStrength,
      }) : null,
      reaction: hasModule(spec, 'chemistry') ? createReactionState(params) : null,
      energy: 0,
      motion: 0,
      field: 0,
      matter: 0,
      heat: 0,
      stability: 1,
    };
  }

  function stepCustomState(inputState, spec, dtInput) {
    const params = { ...inputState.params, ...spec.params };
    const contract = spec.contract || (
      spec.intent && spec.intent.resolution
        ? spec.intent.resolution.contract || null
        : null
    );
    const interactions = interactionTotals(contract);
    const operatorEffect = operatorTotals(contract);
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const state = {
      ...inputState,
      params,
      modules: spec.modules,
      objects: spec.objects,
      componentStates: stepComponentStates(inputState.componentStates, spec, params, dt),
      particles: inputState.particles.map((particle) => ({ ...particle })),
    };
    if (state.machine) state.machine = stepState(state.machine, params, dt);
    if (state.fluid) {
      state.fluid = stepFluidState(state.fluid, {
        ...params,
        inletFlow: params.inletFlow ?? params.flowRate,
        vortexStrength: params.vortexStrength ?? params.fieldStrength,
      }, dt);
    }
    if (state.reaction) state.reaction = stepReactionState(state.reaction, params, dt);

    const field = (params.fieldStrength || 0) +
      (params.magneticStrength || 0) * 0.7 +
      (params.electricField || 0) * 0.52 +
      (interactions.field || 0) * 0.25 +
      (operatorEffect.field || 0) +
      (hasModule(spec, 'gravity') ? Math.abs(params.gravity || 0) : 0);
    const drive = (params.energyInput || 0) + solarPower({ ...DEFAULT_PARAMS, ...params }) / 900;
    const swirl = (params.turbulence || 0) + (params.vortexStrength || 0) * 0.28;
    const damping = clamp(params.damping ?? params.friction ?? 0.08, 0, 0.95);
    const spring = hasModule(spec, 'elasticity') ? clamp(params.springConstant || 0, 0, 1.6) : 0;
    const thermal = hasModule(spec, 'thermal') ? clamp(params.thermalFlux || params.heatTransfer || 0, 0, 1.5) : 0;
    const wave = hasModule(spec, 'wave') || hasModule(spec, 'acoustics') ? clamp(params.waveAmplitude || 0, 0, 1.2) : 0;
    const acoustic = hasModule(spec, 'acoustics') ? clamp(params.soundFrequency || 0.42, 0.05, 1.4) : 0;
    const buoyancy = hasModule(spec, 'buoyancy') ? clamp(params.buoyancy || 0, -0.4, 1.2) : 0;
    const wind = hasModule(spec, 'fluid') ? clamp(params.windSpeed || 0, -1.2, 1.2) : 0;
    const charge = hasModule(spec, 'electricity') || hasModule(spec, 'plasma') ? clamp(params.charge || params.electricField || 0, -1.2, 1.2) : 0;
    const granular = hasModule(spec, 'granular') ? clamp(params.granularFriction || 0.38, 0, 1) : 0;
    const restitution = hasModule(spec, 'collision') ? clamp(params.restitution || 0.72, 0, 1) : 0;
    const control = hasModule(spec, 'control') ? clamp(params.controlGain || 0, 0, 1.5) : 0;
    const signalNoise = hasModule(spec, 'signal') || hasModule(spec, 'noise') ? clamp(params.signalNoise || 0, 0, 1) : 0;
    const latency = hasModule(spec, 'network') ? clamp(params.networkLatency || params.signalDelay || 0, 0, 1.5) : 0;
    const queue = hasModule(spec, 'queue') ? clamp(params.queueBacklog || 0, 0, 1) : 0;
    const service = hasModule(spec, 'queue') || hasModule(spec, 'logistics') ? clamp(params.serviceRate || 0.5, 0.05, 1.5) : 0;
    const terrain = hasModule(spec, 'terrain') ? clamp(params.terrainSlope || 0, -1, 1) : 0;
    const erosion = hasModule(spec, 'erosion') ? clamp(params.erosionRate || 0, 0, 1) : 0;
    const biology = hasModule(spec, 'biology') ? clamp(params.populationGrowth || 0, 0, 1.4) : 0;
    const infection = hasModule(spec, 'biology') || hasModule(spec, 'diffusion') ? clamp(params.infectionRate || 0, 0, 1.2) : 0;
    const adhesion = hasModule(spec, 'surface') ? clamp(params.adhesion || 0, 0, 1.2) : 0;
    const cohesion = hasModule(spec, 'cohesion') || hasModule(spec, 'material') ? clamp(params.cohesion || 0, 0, 1.2) : 0;
    const phase = hasModule(spec, 'phase-change') ? clamp(params.phaseThreshold || 0.5, 0, 1) : 0;
    const latentHeat = hasModule(spec, 'phase-change') ? clamp(params.latentHeat || 0, 0, 1.4) : 0;
    const market = hasModule(spec, 'economics') || hasModule(spec, 'market') ? clamp(params.marketDemand || 0, 0, 1.5) : 0;
    const elasticity = hasModule(spec, 'economics') || hasModule(spec, 'market') ? clamp(params.priceElasticity || 0, 0, 1.2) : 0;
    const solarRadiation = hasModule(spec, 'radiation') ? clamp((params.irradiance || 0) / 1200, 0, 1.5) : 0;
    const fire = hasModule(spec, 'fire') ? clamp((params.combustibility || 0) + (interactions.fire || 0) * 0.3, 0, 1.2) : 0;
    const water = hasModule(spec, 'water') || hasModule(spec, 'liquid') ? clamp(params.moisture || 0.5, 0, 1) : 0;
    const solid = hasModule(spec, 'solid') || hasModule(spec, 'rock') || hasModule(spec, 'wood') ? clamp(params.hardness || 0, 0, 1.5) : 0;
    const metal = hasModule(spec, 'metal') ? clamp(params.conductivity || 0, 0, 1.5) : 0;
    const magneticMaterial = hasModule(spec, 'magnetic') ? clamp(params.magnetization || params.magneticStrength || 0, 0, 1.5) : 0;
    const glass = hasModule(spec, 'glass') ? clamp(1 - (params.opacity || 0), 0, 1) : 0;
    const atomic = hasModule(spec, 'atomic') ? clamp((params.atomicMass || 28) / 120, 0, 2) : 0;
    const bond = hasModule(spec, 'atomic') || hasModule(spec, 'cohesion') ? clamp(params.bondStrength || 0, 0, 1.5) : 0;
    const ionization = hasModule(spec, 'atomic') || hasModule(spec, 'plasma') ? clamp(params.ionization || 0, 0, 1.5) : 0;
    let motionSum = 0;
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      const cx = p.x - 0.5;
      const cy = p.y - 0.5;
      const radius = Math.max(0.03, Math.hypot(cx, cy));
      const tangentX = -cy / radius;
      const tangentY = cx / radius;
      const noise = hashNoise(Math.floor(state.t * 24), i) - 0.5;
      const phase = state.t * (1.8 + acoustic * 4.2) + p.phase * TAU;
      const waveForce = Math.sin(p.x * 10 + phase) * wave;
      const springForceX = -cx * spring * 0.42;
      const springForceY = -cy * spring * 0.42;
      const electricForce = charge / Math.max(0.08, radius * radius);
      const controlPull = control * (0.5 - radius) * 0.08;
      const queuePulse = queue * Math.sin(state.t * (1.2 + service) + p.phase * TAU) * 0.06;
      const terrainPush = terrain * (0.22 + erosion * 0.18);
      const biologyPush = biology * Math.sin(p.x * 7 + state.t * 0.9) * 0.035;
      const infectionPush = infection * Math.cos(p.y * 9 - state.t * 1.1) * 0.03;
      const cohesionPull = (cohesion + bond * 0.72 + atomic * 0.18) * (0.5 - radius) * 0.05;
      const refractionDrift = glass * Math.sin(p.y * 8 + state.t * 0.7) * 0.026;
      const fireLift = fire * (1 - water * 0.72 + Math.min(0, interactions.fire || 0) * 0.18) * 0.18;
      const materialInertia = 1 + solid * 0.44 + metal * 0.28 + atomic * 0.22;
      p.vx += (
        tangentX * (field + magneticMaterial * 0.46 + ionization * 0.22) * 0.18 +
        drive * (0.04 + market * 0.016 + solarRadiation * 0.018) +
        springForceX +
        cx * (electricForce + magneticMaterial * 0.14 + metal * 0.08) * 0.018 +
        wind * 0.22 +
        controlPull * cx +
        cohesionPull * cx +
        queuePulse +
        terrainPush +
        biologyPush +
        refractionDrift +
        noise * (swirl * 0.18 + thermal * 0.16 + signalNoise * 0.22 + fire * 0.16)
      ) * dt;
      p.vy += (
        tangentY * (field + magneticMaterial * 0.46 + ionization * 0.22) * 0.18 +
        (params.gravity || 0) * 0.34 -
        (buoyancy + water * 0.22) * 0.26 -
        fireLift +
        springForceY +
        waveForce * 0.16 +
        cy * (electricForce + magneticMaterial * 0.14 + metal * 0.08) * 0.014 +
        controlPull * cy +
        cohesionPull * cy -
        terrainPush * 0.34 +
        infectionPush +
        noise * (swirl * 0.12 + thermal * 0.12 + signalNoise * 0.18 + fire * 0.14)
      ) * dt;
      const granularDrag = granular && p.y > 0.63 ? 1 + granular * 2.8 : 1;
      const surfaceDrag = adhesion && (p.y > 0.78 || p.x < 0.12 || p.x > 0.88) ? 1 + adhesion * 2.2 : 1;
      const latencyDrag = 1 + latency * 0.24 + Math.max(0, queue - service * 0.5) * 0.28;
      const waterDrag = 1 + water * 0.55;
      p.vx *= 1 - damping * granularDrag * surfaceDrag * latencyDrag * waterDrag * materialInertia * dt * 2.4;
      p.vy *= 1 - damping * granularDrag * surfaceDrag * latencyDrag * waterDrag * materialInertia * dt * 2.4;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (restitution > 0) {
        if (p.x < 0.04 || p.x > 0.96) {
          p.x = clamp(p.x, 0.04, 0.96);
          p.vx *= -restitution;
        }
        if (p.y < 0.06 || p.y > 0.94) {
          p.y = clamp(p.y, 0.06, 0.94);
          p.vy *= -restitution;
        }
      } else {
        if (p.x < -0.04) p.x = 1.04;
        if (p.x > 1.04) p.x = -0.04;
        if (p.y < -0.04) p.y = 1.04;
        if (p.y > 1.04) p.y = -0.04;
      }
      motionSum += Math.hypot(p.vx, p.vy);
    }

    const machineLedger = state.machine ? energyLedger(state.machine) : null;
    const chemistryHeat = state.reaction ? maxField(state.reaction.heat) : 0;
    const fluidMotion = state.fluid ? state.fluid.vorticity : 0;
    state.t += dt;
    state.energy += (drive + solarRadiation * 0.42 + fire * 0.36 + market * (1 - elasticity * 0.22) + queue * 0.12) * dt * 10;
    state.motion = motionSum / Math.max(1, state.particles.length) +
      (machineLedger ? Math.abs(machineLedger.rpm) / 80 : 0) +
      fluidMotion +
      Math.max(0, interactions.motion || 0) * 0.04 +
      Math.max(0, operatorEffect.motion || 0) * 0.04;
    state.field = field + magneticMaterial * 0.34 + metal * 0.12 + control * 0.16 + signalNoise * 0.08 + latency * 0.05;
    state.matter = (state.fluid ? state.fluid.mixing : 0) +
      (state.reaction ? state.reaction.conversion : 0) +
      granular * 0.12 +
      buoyancy * 0.06 +
      biology * 0.1 +
      erosion * 0.07 +
      cohesion * 0.04 +
      solid * 0.05 +
      atomic * 0.04 +
      (interactions.matter || 0) * 0.08 +
      (operatorEffect.matter || 0) * 0.08;
    state.heat = chemistryHeat +
      (params.heatTransfer || 0) * 0.12 +
      thermal * 0.18 +
      fire * 0.28 +
      solarRadiation * 0.18 +
      metal * 0.05 +
      (interactions.heat || 0) * 0.08 +
      (operatorEffect.heat || 0) * 0.08 +
      (params.plasmaTemperature || 0) * 0.22 +
      latentHeat * Math.max(0, state.heat - phase * 0.1) +
      (machineLedger ? Math.max(0, machineLedger.actuatorPowerW) / 600 : 0);
    state.stability = clamp01(1 -
      Math.abs(state.field - drive) * 0.14 -
      swirl * 0.11 -
      chemistryHeat * 0.08 -
      thermal * 0.04 -
      fire * (0.12 - water * 0.05) -
      Math.abs(charge) * 0.04 -
      ionization * 0.05 -
      signalNoise * 0.07 -
      latency * 0.05 -
      Math.max(0, queue - service) * 0.1 -
      infection * 0.06 +
      control * 0.05 +
      solid * 0.03 +
      bond * 0.03 +
      (interactions.stability || 0) * 0.08 +
      (operatorEffect.stability || 0) * 0.08);
    return state;
  }

  function formatMetric(value, digits = 1) {
    if (!Number.isFinite(value)) return '0';
    return value.toFixed(digits);
  }

  function readoutValues(state, spec) {
    if (spec.templateId === 'blank-world') {
      return {
        modules: '0',
        objects: '0',
        forces: '0',
        sources: '0',
        sinks: '0',
        canvas: formatMetric(state.params.canvasScale, 2),
      };
    }
    if (spec.templateId === 'custom-world') {
      const generic = {
        energy: formatMetric(state.energy, 1),
        motion: formatMetric(state.motion * 100, 1),
        field: formatMetric(state.field, 2),
        matter: formatMetric(state.matter * 100, 0),
        heat: formatMetric(state.heat * 100, 0),
        stability: formatMetric(state.stability * 100, 0),
      };
      const labels = readoutLabelsForSpec(spec);
      return Object.fromEntries(labels.map((label) => [
        label,
        contextualReadoutValue(label, state, spec, generic),
      ]));
    }
    if (spec.templateId === 'fluid-vortex') {
      return {
        flow: formatMetric(state.params.inletFlow, 2),
        pressure: formatMetric(state.pressure, 1),
        vorticity: formatMetric(state.vorticity, 2),
        mixing: formatMetric(state.mixing * 100, 0),
        drag: formatMetric(state.dragLossJ, 1),
        age: formatMetric(state.t, 1),
      };
    }
    if (spec.templateId === 'reaction-diffusion') {
      const massB = state.conversion * state.size * state.size;
      return {
        conversion: formatMetric(state.conversion * 100, 1),
        heat: formatMetric(maxField(state.heat) * 100, 0),
        front: formatMetric(state.front * 1000, 2),
        'mass b': formatMetric(massB, 0),
        entropy: formatMetric(state.entropy, 3),
        time: formatMetric(state.t, 1),
      };
    }
    const ledger = energyLedger(state);
    return {
      rpm: formatMetric(ledger.rpm, 1),
      torque: formatMetric(ledger.torqueNm, 2),
      solar: formatMetric(ledger.solarPowerW, 0),
      load: formatMetric(ledger.loadPowerW, 1),
      actuator: formatMetric(ledger.actuatorPowerW, 1),
      balance: formatMetric(ledger.balanceErrorJ, 2),
    };
  }

  function maxField(field) {
    let max = 0;
    for (const value of field || []) max = Math.max(max, value);
    return max;
  }

  function readoutLabelsForSpec(spec) {
    if (spec.templateId === 'custom-world') {
      const contract = spec.contract || (
        spec.intent && spec.intent.resolution
          ? spec.intent.resolution.contract || null
          : null
      );
      return contract && Array.isArray(contract.readouts) && contract.readouts.length
        ? contract.readouts.slice(0, 6)
        : templateById(spec.templateId).readouts;
    }
    return templateById(spec.templateId).readouts;
  }

  function contextualReadoutValue(label, state, spec, generic) {
    const params = spec.params || {};
    const ledger = state.machine ? energyLedger(state.machine) : null;
    switch (label) {
      case 'fuel load':
        return formatMetric((params.combustibility || 0) * (1 - (params.moisture || 0) * 0.35) * 100, 0);
      case 'burn front':
        return formatMetric((state.heat + state.motion * 0.08) * 100, 0);
      case 'smoke':
        return formatMetric(((params.opacity || 0) * 0.5 + state.heat * 0.3) * 100, 0);
      case 'moisture':
        return formatMetric((params.moisture || 0) * 100, 0);
      case 'wind':
        return formatMetric(Math.abs(params.windSpeed || params.flowRate || 0) * 100, 0);
      case 'containment':
        return formatMetric(state.stability * 100, 0);
      case 'water flow':
        return formatMetric((params.flowRate || params.inletFlow || 0) * 100, 0);
      case 'erosion rate':
        return formatMetric((params.erosionRate || 0) * 100, 0);
      case 'sediment':
        return formatMetric(state.matter * 100, 0);
      case 'slope':
        return formatMetric(Math.abs(params.terrainSlope || params.gravity || 0) * 100, 0);
      case 'terrain loss':
        return formatMetric((state.matter * (params.erosionRate || 0.1)) * 100, 0);
      case 'light':
        return formatMetric((params.lightIntensity || 0) * 100, 0);
      case 'refraction':
        return formatMetric(params.refractiveIndex || 1, 2);
      case 'beam split':
        return formatMetric((state.field + (params.lightIntensity || 0) * 0.2) * 100, 0);
      case 'focus':
        return formatMetric(state.stability * 100, 0);
      case 'grid load':
        return formatMetric((state.energy * 0.12 + (params.marketDemand || 0) * 60) % 100, 0);
      case 'queue backlog':
        return formatMetric((params.queueBacklog || 0) * 100, 0);
      case 'throughput':
        return formatMetric((params.serviceRate || 0) * (1 - (params.queueBacklog || 0) * 0.4) * 100, 0);
      case 'delay':
        return formatMetric((params.networkLatency || params.signalDelay || 0) * 100, 0);
      case 'demand':
        return formatMetric((params.marketDemand || 0) * 100, 0);
      case 'source':
        return formatMetric((params.energyInput || params.irradiance / 1200 || 0) * 100, 0);
      case 'loss':
        return formatMetric((1 - state.stability + state.heat * 0.05) * 100, 0);
      case 'balance':
        return ledger ? formatMetric(ledger.balanceErrorJ, 2) : generic.stability;
      case 'rpm':
        return ledger ? formatMetric(ledger.rpm, 1) : generic.motion;
      case 'timing':
        return formatMetric((params.driveTiming || params.signalDelay || 0) * 100, 0);
      default:
        return generic[label] || '0';
    }
  }

  function stateLabel(state, spec) {
    if (spec.templateId === 'blank-world') {
      return 'blank construction plane';
    }
    if (spec.templateId === 'custom-world') {
      const sceneKind = spec.renderProgram && spec.renderProgram.rendererPlan
        ? spec.renderProgram.rendererPlan.sceneKind
        : '';
      if (sceneKind === 'magnetic-machine') return 'composed magnetic machine';
      if (sceneKind === 'fire') return 'elemental reaction world';
      if (sceneKind === 'optics' || sceneKind === 'thin-film') return 'composed optics world';
      if (sceneKind === 'city') return 'composed operations network';
      if (sceneKind === 'watershed') return 'terrain flow world';
      if (sceneKind === 'biology') return 'composed control biology';
      if (sceneKind === 'acoustic') return 'composed wave world';
      if (sceneKind === 'granular') return 'granular physics world';
      if (sceneKind === 'ferrofluid') return 'magnetic fluid world';
      if (sceneKind === 'thermal-plume') return 'thermal plume world';
      if (sceneKind === 'mechanical') return 'mechanical constraint world';
      if (hasModule(spec, 'terrain') && hasModule(spec, 'logistics')) return 'composed terrain market';
      if (hasModule(spec, 'phase-change') && hasModule(spec, 'network')) return 'composed phase network';
      if (hasModule(spec, 'biology') && hasModule(spec, 'control')) return 'composed control biology';
      if (hasModule(spec, 'atomic') && hasModule(spec, 'metal')) return 'atomic material world';
      if (hasModule(spec, 'fire') && hasModule(spec, 'water')) return 'elemental reaction world';
      if (hasModule(spec, 'glass') && hasModule(spec, 'magnetic')) return 'raw material optics';
      if (hasModule(spec, 'rock') || hasModule(spec, 'wood') || hasModule(spec, 'metal')) return 'raw material world';
      if (hasModule(spec, 'chemistry') && hasModule(spec, 'fluid')) return 'composed fluid chemistry';
      if (hasModule(spec, 'electromagnetism') && hasModule(spec, 'solar')) return 'composed magnetic machine';
      if (hasModule(spec, 'queue') || hasModule(spec, 'network')) return 'composed operations network';
      if (hasModule(spec, 'optics') && hasModule(spec, 'plasma')) return 'prismatic plasma world';
      if (hasModule(spec, 'optics')) return 'composed optics world';
      if (hasModule(spec, 'plasma') || hasModule(spec, 'electricity')) return 'charged plasma world';
      if (hasModule(spec, 'acoustics') || hasModule(spec, 'wave')) return 'composed wave world';
      if (hasModule(spec, 'granular')) return 'granular physics world';
      if (hasModule(spec, 'elasticity') || hasModule(spec, 'collision')) return 'mechanical constraint world';
      if (hasModule(spec, 'fluid')) return 'composed flow world';
      if (hasModule(spec, 'chemistry')) return 'composed reaction world';
      return 'composed physics world';
    }
    if (spec.templateId === 'fluid-vortex') {
      return state.vorticity > 0.35 ? 'turbulent wake' : 'laminar drift';
    }
    if (spec.templateId === 'reaction-diffusion') {
      return state.front > 0.0004 ? 'reaction front active' : 'diffusing';
    }
    const ledger = energyLedger(state);
    return Math.abs(state.omega) < 0.05 && state.t > 2
      ? 'stalled'
      : ledger.loadPowerW > 0.2
        ? 'spinning under load'
        : 'seeking torque';
  }
  return {
    ...catalog,
    COMPOSITION_SCHEMA,
    INTENT_CLASSIFICATION_SCHEMA,
    INTENT_MODEL_ID,
    RENDER_PROGRAM_SCHEMA,
    SEMANTIC_RAG_SCHEMA,
    SYNTHESIS_SCHEMA,
    buildPrimitiveProgram,
    buildCompositionGraph,
    classificationSummary,
    classifyIntentPrompt,
    compileCompositionToRenderProgram,
    createBlankState,
    createComponentStates,
    createCustomState,
    createFluidState,
    createIntentFromPrompt,
    createSemanticRag,
    synthesizeWorldIntent,
    groundedPrimitiveRows,
    createReactionState,
    createSimulationState,
    createSpec,
    createSpecFromPrompt,
    createState,
    deserializeSpec,
    energyLedger,
    formatMetric,
    hasModule,
    isMagneticMachine,
    kineticEnergy,
    magnetPosition,
    magneticTorque,
    maxField,
    normalizeSpec,
    operatorTotals,
    rankPrimitivesForClassification,
    readoutLabelsForSpec,
    readoutValues,
    remixSpec,
    resolveIntentToSpec,
    serializeSpec,
    sliderTargetAngle,
    solarPower,
    stateLabel,
    stepBlankState,
    stepComponentStates,
    stepCustomState,
    stepFluidState,
    stepReactionState,
    stepSimulation,
    stepState,
    titleFromPrompt,
  };
});
