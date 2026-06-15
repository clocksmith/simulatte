(function attachSimulattePhysicsRenderer(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-model.js')
    : root.SimulattePhysicsModel;
  const api = factory(model);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsRenderer(model) {
  const {
    DEFAULT_PARAMS,
    EXAMPLE_INTENTS,
    TAU,
    clamp,
    clamp01,
    controlsForSpec,
    createSimulationState,
    createSpecFromPrompt,
    deserializeSpec,
    energyLedger,
    formatMetric,
    hasModule,
    hashNoise,
    maxField,
    normalizeSpec,
    readoutLabelsForSpec,
    readoutValues,
    remixSpec,
    serializeSpec,
    sliderTargetAngle,
    solarPower,
    stateLabel,
    stepSimulation,
    templateById,
  } = model;

  function createBrowserLab(root = document) {
    const canvas = root.getElementById('physics-canvas');
    if (!canvas) return null;
    const fieldCanvas = root.getElementById('field-canvas');
    const ctx = canvas.getContext('2d');
    const controlStack = root.getElementById('control-stack');
    const nameInput = root.getElementById('simulation-name');
    const promptInput = root.getElementById('build-prompt');
    const specPreview = root.getElementById('spec-preview');
    const componentStack = root.getElementById('component-stack');
    const exampleButtons = Array.from(root.querySelectorAll('[data-example-prompt]'));
    const readouts = Array.from({ length: 6 }, (_, index) => ({
      label: root.getElementById(`readout-${index + 1}-label`),
      value: root.getElementById(`readout-${index + 1}`),
    }));
    const stateReadout = root.getElementById('lab-state');
    const initialPrompt = promptInput ? promptInput.value : EXAMPLE_INTENTS[0].prompt;
    const initialParams = promptInput
      ? readPromptParams(promptInput, EXAMPLE_INTENTS[0].params)
      : EXAMPLE_INTENTS[0].params;
    let spec = createSpecFromPrompt(initialPrompt, { params: initialParams });
    let state = createSimulationState(spec);
    const field = root.defaultView && root.defaultView.SimulatteParticleField && fieldCanvas
      ? root.defaultView.SimulatteParticleField.create(fieldCanvas, { count: 420 })
      : null;
    let last = performance.now();
    let paused = false;
    let lastPreviewSync = 0;

    const setSpec = (nextSpec) => {
      spec = normalizeSpec(nextSpec);
      state = createSimulationState(spec);
      if (nameInput) nameInput.value = spec.name;
      renderControls(controlStack, spec);
      syncComponentStack(componentStack, spec);
      syncExampleButtons(exampleButtons, spec);
      syncReadoutLabels(readouts, spec);
      syncSpecPreview(specPreview, spec);
      lastPreviewSync = performance.now();
      last = performance.now();
    };

    const buildFromPrompt = (paramsOverride = null) => {
      const prompt = promptInput ? promptInput.value : '';
      const params = paramsOverride || readPromptParams(promptInput, {});
      setSpec(createSpecFromPrompt(prompt, { params }));
    };

    exampleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const params = readExampleParams(button);
        if (promptInput) {
          promptInput.value = button.dataset.examplePrompt || '';
          promptInput.dataset.exampleParams = JSON.stringify(params);
        }
        buildFromPrompt(params);
      });
    });
    if (promptInput) {
      promptInput.addEventListener('input', () => {
        delete promptInput.dataset.exampleParams;
      });
    }
    root.getElementById('build-lab')?.addEventListener('click', () => buildFromPrompt());
    root.getElementById('reset-lab')?.addEventListener('click', () => setSpec(spec));
    root.getElementById('pause-lab')?.addEventListener('click', () => {
      paused = !paused;
      root.getElementById('pause-lab').textContent = paused ? 'Resume' : 'Pause';
    });
    root.getElementById('remix-lab')?.addEventListener('click', () => setSpec(remixSpec(readSpecFromUi(spec, controlStack, nameInput))));
    root.getElementById('export-lab')?.addEventListener('click', async () => {
      const payload = serializeSpec(readSpecFromUi(spec, controlStack, nameInput));
      try {
        await navigator.clipboard.writeText(payload);
      } catch (_err) {
        window.prompt('Simulatte simulation spec:', payload);
      }
    });
    root.getElementById('import-lab')?.addEventListener('click', () => {
      const raw = window.prompt('Paste Simulatte simulation spec JSON:');
      if (!raw) return;
      try {
        setSpec(deserializeSpec(raw));
      } catch (_err) {
        if (stateReadout) stateReadout.textContent = 'import failed';
      }
    });

    function tick(now) {
      const dt = clamp((now - last) / 1000 || 0.016, 0.001, 0.05);
      last = now;
      resizeCanvas(canvas, ctx);
      if (field) {
        const box = canvas.getBoundingClientRect();
        field.resize(box.width, box.height, window.devicePixelRatio || 1);
      }
      spec = readSpecFromUi(spec, controlStack, nameInput);
      if (!paused) {
        const substeps = spec.templateId === 'reaction-diffusion' ? 2 : 3;
        for (let i = 0; i < substeps; i += 1) {
          state = stepSimulation(state, spec, dt / substeps);
        }
      }
      drawSimulation(ctx, canvas, state, spec);
      syncField(field, canvas, state, spec);
      syncReadouts(readouts, stateReadout, state, spec);
      syncOpenSpecPreview(specPreview, spec, now, lastPreviewSync, (value) => {
        lastPreviewSync = value;
      });
      if (field) {
        const fieldVisible = spec.templateId !== 'blank-world';
        if (fieldCanvas) {
          fieldCanvas.style.opacity = fieldVisible ? '' : '0';
          fieldCanvas.dataset.renderer = field.mode || 'canvas';
          fieldCanvas.dataset.rendererStatus = field.status || '';
        }
        if (fieldVisible) {
          field.step(dt);
          field.render();
        }
      }
      requestAnimationFrame(tick);
    }

    setSpec(spec);
    requestAnimationFrame(tick);
    return { getSpec: () => spec, getState: () => state, setSpec };
  }

  function renderControls(controlStack, spec) {
    if (!controlStack) return;
    controlStack.innerHTML = '';
    for (const [key, label, min, max, step] of controlsForSpec(spec)) {
      const wrapper = document.createElement('label');
      wrapper.className = 'physics-control';
      wrapper.setAttribute('for', `control-${key}`);
      const title = document.createElement('span');
      title.textContent = label;
      const input = document.createElement('input');
      input.id = `control-${key}`;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(spec.params[key]);
      input.dataset.paramKey = key;
      wrapper.append(title, input);
      controlStack.appendChild(wrapper);
    }
  }

  function readSpecFromUi(spec, controlStack, nameInput) {
    const params = { ...spec.params };
    if (controlStack) {
      controlStack.querySelectorAll('[data-param-key]').forEach((input) => {
        params[input.dataset.paramKey] = Number(input.value);
      });
    }
    return normalizeSpec({
      ...spec,
      name: nameInput && nameInput.value ? nameInput.value : spec.name,
      params,
    });
  }

  function syncTemplateButtons(buttons, templateId) {
    buttons.forEach((button) => {
      const active = button.dataset.templateId === templateId;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    });
  }

  function syncExampleButtons(buttons, spec) {
    const prompt = spec.intent && spec.intent.prompt ? spec.intent.prompt.toLowerCase() : '';
    buttons.forEach((button) => {
      const active = prompt && String(button.dataset.examplePrompt || '').toLowerCase() === prompt;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    });
  }

  function readExampleParams(button) {
    return parseParamJson(button && button.dataset ? button.dataset.exampleParams : '', {});
  }

  function readPromptParams(input, fallback = {}) {
    return parseParamJson(input && input.dataset ? input.dataset.exampleParams : '', fallback);
  }

  function parseParamJson(raw, fallback = {}) {
    if (!raw) return { ...fallback };
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : { ...fallback };
    } catch (_err) {
      return { ...fallback };
    }
  }

  function syncComponentStack(node, spec) {
    if (!node) return;
    node.innerHTML = '';
    if (spec.templateId === 'blank-world') {
      const empty = document.createElement('span');
      empty.className = 'component-chip is-empty';
      empty.textContent = 'empty plane';
      node.appendChild(empty);
      return;
    }
    if (spec.compositionGraph && spec.renderProgram) {
      const graph = spec.compositionGraph;
      const program = spec.renderProgram;
      const planChips = [
        'classifier composition',
        `${graph.nodes.length} primitives`,
        `${graph.relations.length} links`,
        `${graph.operators.length} operators`,
        `${program.fields.length} fields`,
      ];
      for (const label of planChips) {
        const chip = document.createElement('span');
        chip.className = 'component-chip is-domain';
        chip.textContent = label;
        node.appendChild(chip);
      }
      for (const object of graph.nodes.slice(0, 8)) {
        const chip = document.createElement('span');
        chip.className = `component-chip is-${object.type || 'part'}`;
        chip.textContent = object.primitiveId.replace(/-/g, ' ');
        node.appendChild(chip);
      }
      return;
    }
    const intent = spec.intent;
    const components = intent && intent.components ? intent.components : spec.objects.map((object) => ({
      id: object.id,
      type: object.type,
      role: object.role,
      params: {},
    }));
    const domains = intent && intent.domains ? intent.domains : spec.modules;
    const contract = spec.contract || (
      intent && intent.resolution ? intent.resolution.contract : null
    );
    const topLevelIds = contract && contract.topLevel || intent && intent.resolution && intent.resolution.topLevel || [];
    const topLevelItems = topLevelIds
      .map((id) => components.find((component) => component.id === id))
      .filter(Boolean);
    const childItems = components.filter((component) => !topLevelIds.includes(component.id));
    const componentItems = [...topLevelItems, ...childItems].slice(0, 12);
    if (!componentItems.length) {
      const empty = document.createElement('span');
      empty.className = 'component-chip is-empty';
      empty.textContent = 'empty plane';
      node.appendChild(empty);
      return;
    }
    const focus = contract && contract.layerFocus ? [contract.layerFocus] : [];
    const layout = contract && contract.layout ? [contract.layout.grammar] : [];
    for (const domain of [...focus, ...layout, ...domains].slice(0, 6)) {
      const chip = document.createElement('span');
      chip.className = 'component-chip is-domain';
      chip.textContent = domain;
      node.appendChild(chip);
    }
    for (const component of componentItems) {
      const chip = document.createElement('span');
      const topLevel = topLevelIds.includes(component.id) ? ' is-top-level' : '';
      chip.className = `component-chip is-${component.type || 'part'}${topLevel}`;
      chip.textContent = component.id.replace(/-/g, ' ');
      node.appendChild(chip);
    }
  }

  function syncReadoutLabels(readouts, spec) {
    const labels = readoutLabelsForSpec(spec);
    readouts.forEach((readout, index) => {
      if (readout.label) readout.label.textContent = labels[index] || '-';
    });
  }

  function syncReadouts(readouts, stateReadout, state, spec) {
    const values = readoutValues(state, spec);
    const labels = readoutLabelsForSpec(spec);
    readouts.forEach((readout, index) => {
      const key = labels[index];
      if (readout.value) readout.value.textContent = values[key] || '0';
    });
    if (stateReadout) stateReadout.textContent = stateLabel(state, spec);
  }

  function syncSpecPreview(node, spec) {
    if (!node) return;
    node.textContent = JSON.stringify({
      schema: spec.schema,
      template: spec.templateId,
      name: spec.name,
      intent: spec.intent ? {
        classification: spec.intent.classification ? {
          model: spec.intent.classification.model.id,
          confidence: spec.intent.classification.confidence,
          layerFocus: spec.intent.classification.layerFocus,
          priors: spec.intent.classification.priors.slice(0, 10).map((prior) => ({
            id: prior.primitiveId,
            score: prior.score,
            semantic: prior.semanticScore,
          })),
        } : null,
        domains: spec.intent.domains,
        components: spec.intent.components.map((component) => component.id),
        resolution: {
          mode: spec.intent.resolution.mode,
          integrator: spec.intent.resolution.integrator,
          renderer: spec.intent.resolution.renderer,
          ranker: spec.intent.resolution.ranker,
          layerFocus: spec.intent.resolution.layerFocus,
          topLevel: spec.intent.resolution.topLevel,
        },
      } : null,
      contract: spec.contract ? {
        layerFocus: spec.contract.layerFocus,
        topLevel: spec.contract.topLevel,
        layout: spec.contract.layout,
        interactions: spec.contract.interactions.map((rule) => rule.id),
        readouts: spec.contract.readouts,
        graph: spec.contract.graph ? {
          schema: spec.contract.graph.schema,
          nodes: spec.contract.graph.nodes.length,
          edges: spec.contract.graph.edges.length,
          operators: spec.contract.graph.operators.map((operator) => operator.id),
          conservation: spec.contract.graph.conservation.map((rule) => rule.id),
          temporal: spec.contract.graph.temporal.map((event) => event.id),
          validation: spec.contract.graph.validation,
          explanation: spec.contract.graph.explanation,
        } : null,
      } : null,
      compositionGraph: spec.compositionGraph ? {
        schema: spec.compositionGraph.schema,
        nodes: spec.compositionGraph.nodes.length,
        relations: spec.compositionGraph.relations.length,
        operators: spec.compositionGraph.operators.map((operator) => operator.id),
        priors: spec.compositionGraph.priors.slice(0, 10).map((prior) => prior.primitiveId),
      } : null,
      renderProgram: spec.renderProgram ? {
        schema: spec.renderProgram.schema,
        objects: spec.renderProgram.objects.length,
        relations: spec.renderProgram.relations.length,
        fields: spec.renderProgram.fields.map((field) => field.kind),
        signature: spec.renderProgram.provenance.signature,
      } : null,
      worldPlan: spec.worldPlan ? {
        schema: spec.worldPlan.schema,
        kind: spec.worldPlan.kind,
        objects: spec.worldPlan.objects.length,
        relations: spec.worldPlan.relations.length,
        fields: spec.worldPlan.fields.map((field) => field.kind),
        stages: spec.worldPlan.stageTrace.map((stage) => stage.name),
        fidelity: spec.worldPlan.fidelity,
      } : null,
      params: Object.fromEntries(Object.entries(spec.params).slice(0, 8)),
      remixOf: spec.remixOf || null,
    }, null, 2);
  }

  function syncOpenSpecPreview(node, spec, frameNow, lastSync, assignLastSync) {
    if (!node) return;
    const disclosure = node.closest ? node.closest('details') : null;
    if (disclosure && !disclosure.open) return;
    if (frameNow - lastSync < 250) return;
    syncSpecPreview(node, spec);
    assignLastSync(frameNow);
  }

  function resizeCanvas(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(box.width * dpr));
    const height = Math.max(280, Math.round(box.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function simulationGeometry(canvas, state) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const cx = width * 0.52;
    const cy = height * 0.52;
    const radius = Math.min(width, height) * 0.25;
    const statorRadius = radius * 1.42;
    const stator = {
      x: cx + Math.cos(state.sliderAngle || 0) * statorRadius,
      y: cy + Math.sin(state.sliderAngle || 0) * statorRadius,
    };
    return { width, height, cx, cy, radius, stator };
  }

  const COMPONENT_HUES = Object.freeze({
    source: 42,
    sink: 338,
    controller: 224,
    sensor: 186,
    process: 262,
    field: 174,
    material: 96,
    actor: 142,
    constraint: 14,
    ledger: 282,
    body: 206,
  });

  function componentText(object) {
    return `${object && object.id || ''} ${object && object.type || ''} ${object && object.role || ''}`.toLowerCase();
  }

  function componentVisualType(object) {
    const type = String(object && object.type || '').toLowerCase();
    const text = componentText(object);
    const shape = String(object && object.geometry && object.geometry.shape || '').toLowerCase();
    const spatial = String(object && object.geometry && object.geometry.spatial || '').toLowerCase();
    const accepts = object && object.ports && object.ports.accepts || [];
    const outputs = object && object.ports && object.ports.outputs || [];
    if (outputs.includes('trace')) return 'ledger';
    if (outputs.includes('loss')) return 'sink';
    if (outputs.includes('energy') || outputs.includes('heat') && !accepts.includes('heat')) return 'source';
    if (outputs.includes('signal') && accepts.includes('signal')) return 'controller';
    if (outputs.includes('signal') && !accepts.includes('signal')) return 'sensor';
    if (shape.includes('boundary') || spatial.includes('barrier')) return 'constraint';
    if (shape.includes('graph') || spatial.includes('nodes')) return 'field';
    if (shape.includes('heightfield') || shape.includes('particle') || spatial.includes('volume')) return 'material';
    if (shape.includes('rigid')) return 'body';
    if (type === 'source' || /inlet|input|solar|demand|emitter|feed/.test(text)) return 'source';
    if (type === 'sink' || /outlet|load|loss|drain|output/.test(text)) return 'sink';
    if (type === 'controller' || /controller|pid|servo|regulator/.test(text)) return 'controller';
    if (type === 'sensor' || /sensor|probe|telemetry|measurement|monitor/.test(text)) return 'sensor';
    if (type === 'process' || /queue|server|logistics|erosion|channel|reaction|catalyst/.test(text)) return 'process';
    if (type === 'constraint' || /wall|constraint|boundary|obstacle|delay|buffer|adhesion/.test(text)) return 'constraint';
    if (type === 'ledger' || /ledger|recorder|data|trace|audit|history/.test(text)) return 'ledger';
    if (type === 'actor' || /population|agent|species|cell|colony/.test(text)) return 'actor';
    if (type === 'material' || /terrain|granular|phase|fluid|plasma|material|reactant|sand/.test(text)) return 'material';
    if (type === 'field' || /field|network|noise|infection|cohesion|wind|gravity|electric/.test(text)) return 'field';
    return type === 'body' ? 'body' : 'body';
  }

  function componentHue(kind, index = 0) {
    return ((COMPONENT_HUES[kind] || COMPONENT_HUES.body) + (index % 3) * 8) % 360;
  }

  function grammarPoint(layout, object, index, total, width, height, state = {}) {
    if (!layout || !layout.grammar) return null;
    const grammar = String(layout.grammar || '');
    const text = componentText(object);
    const t = Number(state.t || 0);
    const span = Math.min(width, height);
    const progress = total <= 1 ? 0.5 : index / Math.max(1, total - 1);
    if (grammar === 'downhill channel') {
      const flow = /river|water|erosion|sediment|sand|soil/.test(text);
      return {
        x: width * (0.15 + progress * 0.72),
        y: height * (0.24 + progress * 0.48) + (flow ? Math.sin(t + index) * 10 : -36),
      };
    }
    if (grammar === 'bench') {
      if (/sun|light|source/.test(text)) return { x: width * 0.16, y: height * 0.44 };
      if (/sensor|recorder/.test(text)) return { x: width * 0.84, y: height * 0.45 };
      return { x: width * (0.28 + progress * 0.44), y: height * (0.44 + Math.sin(index) * 0.08) };
    }
    if (grammar === 'patch spread') {
      const centerX = /flame|combustion|ignition/.test(text) ? 0.44 : 0.52;
      const centerY = /water|moisture/.test(text) ? 0.76 : 0.55;
      const angle = index * 2.399 + t * 0.08;
      const radius = span * (0.08 + (index % 5) * 0.025);
      return { x: width * centerX + Math.cos(angle) * radius, y: height * centerY + Math.sin(angle) * radius };
    }
    if (grammar === 'orthogonal network' || grammar === 'route graph') {
      const col = index % 4;
      const row = Math.floor(index / 4) % 3;
      return { x: width * (0.24 + col * 0.17), y: height * (0.28 + row * 0.18) };
    }
    if (grammar === 'process line' || grammar === 'hub and queues' || grammar === 'supply demand loop') {
      return { x: width * (0.16 + progress * 0.72), y: height * (0.5 + Math.sin(index * 1.7) * 0.12) };
    }
    return null;
  }

  function componentPoint(object, index, total, width, height, state = {}, layout = null) {
    const kind = componentVisualType(object);
    const span = Math.min(width, height);
    const t = Number(state.t || 0);
    const wiggle = Math.sin(t * 0.44 + index * 1.7) * span * 0.01;
    const jitterX = (hashNoise(211, index) - 0.5) * span * 0.035;
    const jitterY = (hashNoise(223, index) - 0.5) * span * 0.03;
    const grammar = grammarPoint(layout, object, index, total, width, height, state);
    let x = width * 0.5;
    let y = height * 0.52;

    if (grammar) {
      x = grammar.x;
      y = grammar.y;
    } else if (kind === 'source') {
      x = width * (0.13 + (index % 2) * 0.07);
      y = height * (0.25 + (index % 4) * 0.12);
    } else if (kind === 'sink') {
      x = width * (0.87 - (index % 2) * 0.06);
      y = height * (0.27 + (index % 4) * 0.12);
    } else if (kind === 'controller') {
      x = width * (0.32 + (index % 2) * 0.11);
      y = height * (0.18 + (index % 3) * 0.08);
    } else if (kind === 'sensor') {
      x = width * (0.61 + (index % 2) * 0.1);
      y = height * (0.18 + (index % 3) * 0.08);
    } else if (kind === 'process') {
      x = width * (0.28 + (index % 5) * 0.12);
      y = height * (0.63 + (Math.floor(index / 5) % 2) * 0.09);
    } else if (kind === 'field') {
      const angle = (index / Math.max(1, total)) * TAU + t * 0.06;
      x = width * 0.52 + Math.cos(angle) * span * 0.23;
      y = height * 0.48 + Math.sin(angle) * span * 0.18;
    } else if (kind === 'material') {
      x = width * (0.22 + (index % 6) * 0.11);
      y = height * (0.78 + (index % 2) * 0.06);
    } else if (kind === 'actor') {
      const angle = index * 2.399 + t * 0.1;
      x = width * 0.72 + Math.cos(angle) * span * 0.11;
      y = height * 0.48 + Math.sin(angle) * span * 0.14;
    } else if (kind === 'constraint') {
      x = width * (index % 2 ? 0.79 : 0.21);
      y = height * (0.42 + (index % 4) * 0.11);
    } else if (kind === 'ledger') {
      x = width * (0.18 + (index % 2) * 0.09);
      y = height * (0.82 - (index % 3) * 0.08);
    } else {
      const angle = index * 1.71 + t * 0.05;
      x = width * 0.51 + Math.cos(angle) * span * 0.13;
      y = height * 0.5 + Math.sin(angle) * span * 0.12;
    }

    return {
      x: clamp(x + jitterX, 30, width - 30),
      y: clamp(y + jitterY + wiggle, 52, height - 28),
      kind,
    };
  }

  function particleAttractorKind(object) {
    const kind = componentVisualType(object);
    if (kind === 'sink' || kind === 'constraint') return 'shock';
    if (kind === 'source' || kind === 'controller' || kind === 'process' || kind === 'ledger') return 'goal';
    return 'resource';
  }

  function planParticleAttractorKind(object) {
    const kind = String(object && object.kind || '').toLowerCase();
    const material = String(object && object.material || '').toLowerCase();
    const role = String(object && object.role || '').toLowerCase();
    if (/sink|load|constraint|wall|ridge/.test(`${kind} ${role}`)) return 'shock';
    if (/source|ledger|sensor|controller|lamp|panel|meter/.test(`${kind} ${role}`)) return 'goal';
    if (/fire|smoke|plasma|thermal/.test(`${material} ${role}`)) return 'shock';
    if (/light|water|magnet|metal|glass/.test(`${material} ${role}`)) return 'goal';
    return 'resource';
  }

  function syncField(field, canvas, state, spec) {
    if (!field) return;
    const geometry = simulationGeometry(canvas, state);
    if (spec.templateId === 'blank-world') {
      field.sync({ scenario: { id: spec.id, seed: 5 }, tick: 0, metrics: { load: 0, coverage: 100, trust: 100, stability: 100 } }, []);
      return;
    }
    if (spec.templateId === 'custom-world') {
      const width = geometry.width;
      const height = geometry.height;
      if (spec.renderProgram) {
        const programObjects = (spec.renderProgram.objects || []).slice(0, 24);
        const markers = programObjects.map((object) => {
          const point = planObjectCenter(spec.renderProgram, object.id, width, height);
          return {
            object: {
              id: object.id,
              kind: planParticleAttractorKind(object),
              material: object.material,
              role: object.role,
              shape: object.shape,
              active: true,
            },
            screen: point || { x: width * 0.5, y: height * 0.5 },
          };
        });
        field.sync(
          {
            scenario: {
              id: spec.id,
              seed: (spec.compositionGraph ? spec.compositionGraph.nodes.length : 1) * 47 + programObjects.length,
            },
            tick: state.t,
            metrics: {
              load: clamp((state.field + state.heat + state.motion) * 38, 0, 100),
              coverage: clamp(state.matter * 84 + programObjects.length * 2, 0, 100),
              trust: clamp((spec.renderProgram.provenance.nodeCount || 1) * 7, 0, 100),
              stability: clamp(state.stability * 88 - state.heat * 6, 0, 100),
            },
          },
          markers
        );
        return;
      }
      if (spec.worldPlan) {
        const planObjects = (spec.worldPlan.objects || []).slice(0, 18);
        const markers = planObjects.map((object) => {
          const point = planObjectCenter(spec.worldPlan, object.id, width, height);
          return {
            object: {
              id: object.id,
              kind: planParticleAttractorKind(object),
              material: object.material,
              role: object.role,
              shape: object.shape,
              active: true,
            },
            screen: point || { x: width * 0.5, y: height * 0.5 },
          };
        });
        field.sync(
          {
            scenario: { id: spec.id, seed: spec.worldPlan.kind.length * 47 + planObjects.length },
            tick: state.t,
            metrics: {
              load: clamp((state.field + state.heat + state.motion) * 38, 0, 100),
              coverage: clamp(state.matter * 84 + planObjects.length * 2, 0, 100),
              trust: clamp(spec.worldPlan.fidelity.score || 90, 0, 100),
              stability: clamp(state.stability * 88 - state.heat * 6, 0, 100),
            },
          },
          markers
        );
        return;
      }
      const objects = (spec.objects || []).slice(0, 12);
      const layout = spec.contract ? spec.contract.layout : null;
      const markers = objects.map((object, index) => {
        const point = componentPoint(object, index, objects.length, width, height, state, layout);
        return {
          object: {
            id: object.id,
            kind: particleAttractorKind(object),
            material: object.material || object.id,
            role: object.role || object.type,
            shape: object.shape || object.type,
            active: true,
          },
          screen: { x: point.x, y: point.y },
        };
      });
      field.sync(
        {
          scenario: { id: spec.id, seed: spec.modules.length * 31 },
          tick: state.t,
          metrics: {
            load: clamp(state.motion * 70, 0, 100),
            coverage: clamp(state.matter * 100, 0, 100),
            trust: clamp(state.stability * 100, 0, 100),
            stability: clamp(state.stability * 100 - state.heat * 8, 0, 100),
          },
        },
        markers
      );
      return;
    }
    if (spec.templateId === 'reaction-diffusion') {
      field.sync({ scenario: { id: spec.id, seed: 99 }, tick: state.t, metrics: { load: state.conversion * 100, coverage: 80, trust: 75, stability: 80 } }, []);
      return;
    }
    if (spec.templateId === 'fluid-vortex') {
      field.sync(
        { scenario: { id: spec.id, seed: 77 }, tick: state.t, metrics: { load: state.pressure, coverage: 70, trust: state.mixing * 100, stability: 80 } },
        [
          { object: { id: 'inlet', kind: 'goal', active: true }, screen: { x: geometry.width * 0.16, y: geometry.height * 0.52 } },
          { object: { id: 'obstacle', kind: 'shock', active: true }, screen: { x: geometry.width * 0.56, y: geometry.height * 0.52 } },
        ]
      );
      return;
    }
    const magnets = [];
    for (let i = 0; i < 10; i += 2) {
      const angle = state.theta + (i / 10) * TAU;
      magnets.push({
        object: { id: `rotor-${i}`, kind: i % 4 === 0 ? 'resource' : 'shock', active: true },
        screen: {
          x: geometry.cx + Math.cos(angle) * geometry.radius,
          y: geometry.cy + Math.sin(angle) * geometry.radius,
        },
      });
    }
    const ledger = energyLedger(state);
    field.sync(
      {
        scenario: { id: spec.id, seed: 42 },
        tick: state.t,
        metrics: {
          load: clamp(Math.abs(ledger.torqueNm) * 38, 0, 100),
          coverage: clamp(100 - Math.abs(ledger.balanceErrorJ) * 0.8, 0, 100),
          trust: clamp(70 + ledger.loadPowerW * 2 - ledger.actuatorPowerW * 0.08, 0, 100),
          stability: clamp(100 - Math.abs(ledger.balanceErrorJ) * 0.6, 0, 100),
        },
      },
      [{ object: { id: 'solar-slider', kind: 'goal', active: true }, screen: geometry.stator }, ...magnets]
    );
  }

  function drawSimulation(ctx, canvas, state, spec) {
    if (spec.templateId === 'blank-world') {
      drawBlankWorld(ctx, canvas, state);
    } else if (spec.templateId === 'custom-world') {
      drawCustomWorld(ctx, canvas, state, spec);
    } else if (spec.templateId === 'fluid-vortex') {
      drawFluid(ctx, canvas, state);
    } else if (spec.templateId === 'reaction-diffusion') {
      drawReaction(ctx, canvas, state);
    } else {
      drawMagnetic(ctx, canvas, state);
    }
  }

  function drawBlankWorld(ctx, canvas, state) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    clearScene(ctx, width, height);
    const scale = clamp(state.params.canvasScale || 0.62, 0.2, 1);
    const density = clamp(state.params.guideDensity || 0.42, 0, 1);
    const cx = width * 0.52;
    const cy = height * 0.52;
    const w = Math.min(width * 0.58, height * 0.72) * scale;
    const h = w * 0.62;

    ctx.save();
    ctx.strokeStyle = 'rgba(43, 137, 118, 0.18)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([9, 12]);
    roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 22);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    const slots = [
      ['module slot', cx - w * 0.28, cy - h * 0.16],
      ['object slot', cx + w * 0.24, cy - h * 0.1],
      ['force slot', cx - w * 0.04, cy + h * 0.22],
    ];
    ctx.font = '12px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    slots.forEach(([label, x, y], index) => {
      const radius = 40 + density * 26 + index * 4;
      ctx.strokeStyle = index === 0 ? 'hsla(258, 90%, 58%, 0.24)' : index === 1 ? 'hsla(188, 92%, 42%, 0.24)' : 'hsla(318, 88%, 54%, 0.22)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.setLineDash(index === 1 ? [4, 9] : [7, 10]);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(23, 32, 29, 0.48)';
      ctx.fillText(label, x - 28, y + 4);
    });

    ctx.strokeStyle = 'rgba(43, 137, 118, 0.16)';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.42, cy);
    ctx.lineTo(cx + w * 0.42, cy);
    ctx.moveTo(cx, cy - h * 0.38);
    ctx.lineTo(cx, cy + h * 0.38);
    ctx.stroke();
    drawModuleChips(ctx, width, height, ['blank plane']);
    ctx.restore();
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawCustomWorld(ctx, canvas, state, spec) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    clearScene(ctx, width, height);
    if (spec.renderProgram) {
      drawWorldPlanScene(ctx, width, height, state, spec.renderProgram);
      return;
    }
    if (spec.worldPlan) {
      drawWorldPlanScene(ctx, width, height, state, spec.worldPlan);
      return;
    }
    drawLetterWorldFrame(ctx, width, height, spec);
    drawCustomParticleLayer(ctx, canvas, state, spec, 0.72);
    drawObjectLabels(ctx, canvas, state, spec);
  }

  function drawWorldPlanScene(ctx, width, height, state, plan) {
    drawPlanBackdrop(ctx, width, height, plan);
    drawPlanFields(ctx, width, height, state, plan);
    drawMaterialContinuumField(ctx, width, height, state, plan);
    drawPlanRelations(ctx, width, height, state, plan);
    drawPlanObjects(ctx, width, height, state, plan);
    drawPlanEmitters(ctx, width, height, state, plan);
  }

  function drawPlanBackdrop(ctx, width, height, plan) {
    ctx.save();
    const signature = String(plan.provenance && plan.provenance.signature || '');
    const thermal = /flame|fuel|plume/.test(signature);
    const optical = /prism|lens/.test(signature);
    const network = /queue|network/.test(signature);
    const top = thermal ? '#fff9f4' : optical ? '#fbfdff' : '#ffffff';
    const bottom = network ? '#f8fbfb' : '#f9fcfb';
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(31, 93, 82, 0.04)';
    ctx.lineWidth = 1;
    const spacing = Math.max(28, Math.min(width, height) / 12);
    for (let x = 0; x <= width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    drawSubstrateAtmosphere(ctx, width, height, signature);
    ctx.restore();
  }

  function drawSubstrateAtmosphere(ctx, width, height, signature) {
    const centerX = /network/.test(signature) ? width * 0.58 : width * 0.5;
    const centerY = /fuel|flame/.test(signature) ? height * 0.55 : height * 0.48;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 1;
    for (let band = 0; band < 9; band += 1) {
      const hue = /fuel|flame/.test(signature) ? 24 + band * 6 : /prism|lens/.test(signature) ? 188 + band * 14 : 162 + band * 7;
      const y = height * (0.18 + band * 0.075);
      ctx.strokeStyle = `hsla(${hue}, 68%, 58%, ${0.026 + band * 0.002})`;
      ctx.beginPath();
      for (let x = width * 0.08; x <= width * 0.94; x += 34) {
        const yy = y + Math.sin(x * 0.012 + band * 0.8 + centerX * 0.001) * 5 + (centerY - height * 0.5) * 0.015;
        if (x === width * 0.08) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMaterialContinuumField(ctx, width, height, state, plan) {
    const objects = (plan.objects || []).slice(0, 24);
    if (!objects.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < objects.length; i += 1) {
      const object = objects[i];
      const extent = objectExtent(object, width, height);
      if (!extent) continue;
      const family = materialFamily(object);
      if (family === 'thermal') drawThermalContinuum(ctx, extent, state, object, i);
      else if (family === 'fluid') drawFluidContinuum(ctx, extent, state, object, i);
      else if (family === 'optical') drawOpticalContinuum(ctx, extent, state, object, i);
      else if (family === 'magnetic') drawMagneticContinuum(ctx, extent, state, object, i);
      else if (family === 'granular') drawGranularContinuum(ctx, extent, state, object, i);
      else drawGenericContinuum(ctx, extent, state, object, i);
    }
    ctx.restore();
  }

  function objectExtent(object, width, height) {
    const pose = object.pose || {};
    const center = planPoseCenter(pose, width, height);
    const scale = Math.min(width, height);
    const w = (pose.w || pose.r * 2 || 0.09) * width;
    const h = (pose.h || pose.r * 2 || 0.09) * height;
    const r = (pose.r || Math.min(pose.w || 0.09, pose.h || 0.09) / 2) * scale;
    return {
      x: center.x,
      y: center.y,
      w: Math.max(18, w),
      h: Math.max(18, h),
      r: Math.max(12, r),
      rotation: pose.rotation || 0,
      points: Array.isArray(pose.points) ? pose.points.map((point) => ({ x: point[0] * width, y: point[1] * height })) : null,
    };
  }

  function materialFamily(object) {
    const text = `${object.material || ''} ${object.shape || ''} ${object.role || ''} ${object.kind || ''}`.toLowerCase();
    if (/fire|flame|plasma|combust|heat|thermal|smoke|plume/.test(text)) return 'thermal';
    if (/water|river|fluid|flow|pool|air|wind/.test(text)) return 'fluid';
    if (/glass|light|lens|prism|ray|mirror|sensor|panel/.test(text)) return 'optical';
    if (/magnet|metal|electro|wheel|motor|bar|rail|field/.test(text)) return 'magnetic';
    if (/rock|wood|soil|sand|terrain|grain|fuel|biomass|wall|ridge/.test(text)) return 'granular';
    return 'generic';
  }

  function drawThermalContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let i = 0; i < 12; i += 1) {
      const x = -extent.w * 0.46 + i * extent.w * 0.084;
      const heightScale = 0.34 + hashNoise(index * 19, i) * 0.44;
      ctx.strokeStyle = `hsla(${hue + i * 3}, 90%, ${46 + i * 1.4}%, ${0.09 + heightScale * 0.12})`;
      ctx.lineWidth = 1.2 + heightScale * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, extent.h * 0.36);
      ctx.bezierCurveTo(
        x + Math.sin(state.t * 1.1 + i) * extent.w * 0.08,
        extent.h * 0.08,
        x + Math.cos(state.t * 0.8 + i) * extent.w * 0.14,
        -extent.h * heightScale,
        x + Math.sin(state.t * 1.4 + i) * extent.w * 0.06,
        -extent.h * (0.42 + heightScale)
      );
      ctx.stroke();
    }
    const gradient = ctx.createLinearGradient(0, extent.h * 0.42, 0, -extent.h * 0.72);
    gradient.addColorStop(0, `hsla(${hue + 10}, 96%, 54%, 0.12)`);
    gradient.addColorStop(0.46, `hsla(${hue + 32}, 92%, 46%, 0.06)`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(-extent.w * 0.52, -extent.h * 0.78, extent.w * 1.04, extent.h * 1.22);
    ctx.restore();
  }

  function drawFluidContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    if (extent.points && extent.points.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let band = 0; band < 7; band += 1) {
        ctx.strokeStyle = `hsla(${hue + band * 6}, 78%, 48%, ${0.08 + band * 0.018})`;
        ctx.lineWidth = 2 + band * 0.9;
        ctx.beginPath();
        extent.points.forEach((point, pointIndex) => {
          const y = point.y + Math.sin(state.t * 1.1 + pointIndex + band) * (band + 1) * 0.7;
          if (!pointIndex) ctx.moveTo(point.x, y);
          else ctx.lineTo(point.x, y);
        });
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let i = 0; i < 9; i += 1) {
      ctx.strokeStyle = `hsla(${hue + i * 5}, 82%, 48%, ${0.12 - i * 0.006})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(
        0,
        Math.sin(state.t * 0.7 + i) * extent.h * 0.04,
        extent.w * (0.18 + i * 0.048),
        extent.h * (0.1 + i * 0.03),
        Math.sin(state.t + i) * 0.05,
        0,
        TAU
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOpticalContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let i = -3; i <= 3; i += 1) {
      ctx.strokeStyle = `hsla(${hue + 14 + i * 18}, 94%, 58%, 0.12)`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.72, i * extent.h * 0.08);
      ctx.bezierCurveTo(
        -extent.w * 0.18,
        i * extent.h * 0.04 + Math.sin(state.t + i) * 2,
        extent.w * 0.16,
        -i * extent.h * 0.04,
        extent.w * 0.76,
        -i * extent.h * 0.09
      );
      ctx.stroke();
    }
    const gradient = ctx.createLinearGradient(-extent.w * 0.6, 0, extent.w * 0.6, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.5, `hsla(${hue + 12}, 92%, 70%, 0.08)`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(-extent.w * 0.72, -extent.h * 0.44, extent.w * 1.44, extent.h * 0.88);
    ctx.restore();
  }

  function drawMagneticContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.2 + index) * 0.03);
    for (let i = 0; i < 10; i += 1) {
      const rx = extent.w * (0.22 + i * 0.04);
      const ry = extent.h * (0.22 + i * 0.035);
      ctx.strokeStyle = `hsla(${hue + i * 8}, 78%, 48%, ${0.12 - i * 0.006})`;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, state.t * 0.05 + i * 0.14, 0, TAU);
      ctx.stroke();
    }
    for (let i = -3; i <= 3; i += 1) {
      ctx.strokeStyle = `hsla(${hue + 28}, 86%, 58%, 0.08)`;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.58, i * extent.h * 0.08);
      ctx.bezierCurveTo(-extent.w * 0.18, -extent.h * 0.34, extent.w * 0.18, extent.h * 0.34, extent.w * 0.58, i * extent.h * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGranularContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let band = 0; band < 7; band += 1) {
      ctx.strokeStyle = `hsla(${hue + band * 7}, 48%, ${34 + band * 2}%, ${0.1 + band * 0.012})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j <= 16; j += 1) {
        const x = -extent.w * 0.52 + j * extent.w * 0.065;
        const y = -extent.h * 0.38 + band * extent.h * 0.13 + Math.sin(j * 0.8 + band + state.t * 0.18) * extent.h * 0.025;
        if (!j) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 28; i += 1) {
      const x = (hashNoise(index * 43 + 3, i) - 0.5) * extent.w * 0.88;
      const y = (hashNoise(index * 43 + 7, i) - 0.5) * extent.h * 0.72;
      ctx.fillStyle = `hsla(${hue + hashNoise(index * 43 + 11, i) * 24}, 42%, 36%, 0.12)`;
      ctx.beginPath();
      ctx.arc(x, y + Math.sin(state.t * 0.3 + i) * 0.3, 0.8 + hashNoise(index * 43 + 13, i) * 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGenericContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let i = 0; i < 6; i += 1) {
      ctx.strokeStyle = `hsla(${hue + i * 12}, 64%, 48%, ${0.09 + i * 0.008})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, extent.w * (0.18 + i * 0.06), extent.h * (0.15 + i * 0.045), Math.sin(state.t * 0.2 + i) * 0.1, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function materialHueFor(material, index = 0) {
    const hues = {
      air: 190,
      fire: 24,
      glass: 205,
      light: 52,
      magnet: 288,
      metal: 218,
      rock: 78,
      sand: 42,
      smoke: 238,
      soil: 34,
      water: 198,
      wood: 30,
    };
    return (hues[material] || 168) + index * 11;
  }

  function drawFieldSplat(ctx, x, y, size, hue, alpha, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'screen';
    const radius = Math.max(0.8, size);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 2.7);
    glow.addColorStop(0, `hsla(${hue}, 98%, 68%, ${alpha * 1.5})`);
    glow.addColorStop(0.44, `hsla(${(hue + 58) % 360}, 94%, 62%, ${alpha * 0.54})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 2.4, radius * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `hsla(${(hue + 104) % 360}, 100%, 70%, ${alpha * 0.72})`;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(-radius * 1.7, 0);
    ctx.bezierCurveTo(-radius * 0.45, -radius * 0.24, radius * 0.45, radius * 0.24, radius * 1.7, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlanFields(ctx, width, height, state, plan) {
    for (const field of plan.fields || []) {
      if (field.kind === 'radiation') drawRadiationField(ctx, width, height, state, field);
      else if (field.kind === 'dipole') drawDipoleField(ctx, width, height, state, field);
      else if (field.kind === 'thermal') drawThermalField(ctx, width, height, state, field);
      else if (field.kind === 'optical-rays') drawOpticalField(ctx, width, height, state, field);
      else if (field.kind === 'network-flow') drawNetworkField(ctx, width, height, state, plan);
      else if (field.kind === 'gravity') drawGravityField(ctx, width, height, state, field);
      else drawEnvelopeField(ctx, width, height, state, field);
    }
  }

  function drawRadiationField(ctx, width, height, state, field) {
    const from = field.from || [0.04, 0.06];
    const to = field.to || [0.34, 0.3];
    ctx.save();
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 9; i += 1) {
      const offset = (i - 4) * 0.018 + Math.sin(state.t * 1.2 + i) * 0.004;
      const hue = 40 + i * 7;
      ctx.strokeStyle = `hsla(${hue}, 90%, 56%, ${0.18 + (field.strength || 0.5) * 0.18})`;
      ctx.beginPath();
      ctx.moveTo(from[0] * width, (from[1] + offset) * height);
      ctx.lineTo((to[0] + offset * 0.6) * width, (to[1] + offset) * height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDipoleField(ctx, width, height, state, field) {
    const cx = (field.center ? field.center[0] : 0.5) * width;
    const cy = (field.center ? field.center[1] : 0.52) * height;
    const radius = (field.radius || 0.28) * Math.min(width, height);
    ctx.save();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i += 1) {
      const r = radius * (0.45 + i * 0.075);
      const phase = state.t * 0.28 + i * 0.18;
      ctx.strokeStyle = `hsla(${286 + i * 7}, 86%, 50%, ${0.1 + i * 0.012})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.18, r * 0.64, phase, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawThermalField(ctx, width, height, state, field) {
    const cx = (field.center ? field.center[0] : 0.5) * width;
    const cy = (field.center ? field.center[1] : 0.5) * height;
    const radius = (field.radius || 0.3) * Math.min(width, height);
    ctx.save();
    for (let i = 4; i > 0; i -= 1) {
      const pulse = Math.sin(state.t * 1.8 + i) * 0.04;
      const r = radius * (i / 4 + pulse);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, `hsla(${26 + i * 8}, 94%, 58%, ${0.08 / i})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOpticalField(ctx, width, height, state, field) {
    const from = field.from || [0.16, 0.47];
    const to = field.to || [0.84, 0.56];
    ctx.save();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i += 1) {
      const hue = 210 + i * 20;
      const split = (i - 3) * 0.018;
      ctx.strokeStyle = `hsla(${hue}, 92%, 52%, 0.28)`;
      ctx.beginPath();
      ctx.moveTo(from[0] * width, (from[1] + split * 0.2) * height);
      ctx.bezierCurveTo(width * 0.38, height * from[1], width * 0.56, height * (0.49 + split), to[0] * width, to[1] * height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNetworkField(ctx, width, height, state, plan) {
    ctx.save();
    ctx.setLineDash([3, 12]);
    ctx.lineDashOffset = -state.t * 22;
    ctx.lineWidth = 2;
    for (const relation of plan.relations || []) {
      const from = planObjectCenter(plan, relation.from, width, height);
      const to = planObjectCenter(plan, relation.to, width, height);
      if (!from || !to) continue;
      ctx.strokeStyle = relation.channel === 'energy' ? 'rgba(236, 174, 44, 0.38)' : 'rgba(58, 139, 178, 0.24)';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGravityField(ctx, width, height, state, field) {
    const from = field.from || [0.2, 0.2];
    const to = field.to || [0.75, 0.8];
    ctx.save();
    ctx.strokeStyle = 'rgba(58, 105, 90, 0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      const offset = (i - 3) * 0.045;
      drawArrow(ctx, (from[0] + offset) * width, from[1] * height, (to[0] + offset) * width, to[1] * height);
    }
    ctx.restore();
  }

  function drawEnvelopeField(ctx, width, height, state, field) {
    const center = field.center || [0.52, 0.52];
    const radius = (field.radius || 0.32) * Math.min(width, height);
    ctx.save();
    ctx.strokeStyle = 'rgba(93, 80, 212, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(center[0] * width, center[1] * height, radius * (0.4 + i * 0.16), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlanRelations(ctx, width, height, state, plan) {
    ctx.save();
    ctx.lineWidth = 1.3;
    for (const relation of plan.relations || []) {
      const from = planObjectCenter(plan, relation.from, width, height);
      const to = planObjectCenter(plan, relation.to, width, height);
      if (!from || !to) continue;
      const hue = relation.channel.includes('heat') || relation.channel.includes('fuel') ? 22 :
        relation.channel.includes('light') || relation.channel.includes('spectrum') ? 222 :
          relation.channel.includes('energy') ? 45 : relation.channel.includes('flow') ? 196 : 152;
      ctx.strokeStyle = `hsla(${hue}, 70%, 42%, ${0.12 + relation.strength * 0.08})`;
      ctx.beginPath();
      const midY = (from.y + to.y) / 2 + Math.sin(state.t + from.x * 0.01) * 5;
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo((from.x + to.x) / 2, midY, to.x, to.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlanObjects(ctx, width, height, state, plan) {
    for (const object of plan.objects || []) {
      drawPlanObject(ctx, width, height, state, plan, object);
    }
  }

  function drawPlanObject(ctx, width, height, state, plan, object) {
    const material = plan.materials && plan.materials[object.material] || {};
    const pose = object.pose || {};
    const fill = material.fill || '#d9e8e1';
    const stroke = material.stroke || '#42695d';
    const alpha = material.alpha ?? 0.72;
    if (object.shape === 'flow-path') {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = stroke;
      ctx.fillStyle = fill;
      drawPathShape(ctx, width, height, pose, state);
      ctx.restore();
      return;
    }
    const center = planPoseCenter(pose, width, height);
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((pose.rotation || 0) + animatedRotation(object, state));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = object.required === false ? 1 : 1.6;
    ctx.shadowColor = stroke;
    ctx.shadowBlur = 10;
    drawPlanShape(ctx, width, height, state, object, pose);
    ctx.restore();
  }

  function drawPlanShape(ctx, width, height, state, object, pose) {
    const scale = Math.min(width, height);
    const w = (pose.w || pose.r * 2 || 0.08) * width;
    const h = (pose.h || pose.r * 2 || 0.08) * height;
    const r = (pose.r || Math.min(pose.w || 0.08, pose.h || 0.08) / 2) * scale;
    switch (object.shape) {
      case 'wheel':
        drawWheelShape(ctx, r || Math.min(w, h) / 2, state);
        break;
      case 'magnet':
        drawMagnetShape(ctx, w, h);
        break;
      case 'panel':
        drawPanelShape(ctx, w, h);
        break;
      case 'slider':
        drawSliderShape(ctx, w, h, state);
        break;
      case 'load':
      case 'meter':
        drawMeterShape(ctx, w, h, object.shape);
        break;
      case 'flame-front':
        drawFlameShape(ctx, w, h, state);
        break;
      case 'plume':
        drawPlumeShape(ctx, w, h, state);
        break;
      case 'flow-path':
        drawPathShape(ctx, width, height, pose, state);
        break;
      case 'wall':
      case 'ridge':
        drawWallShape(ctx, w, h);
        break;
      case 'heightfield':
        drawHeightfieldShape(ctx, w, h, state);
        break;
      case 'bank-cut':
      case 'fuel-bed':
      case 'grain-bed':
        drawGrainShape(ctx, w, h, state);
        break;
      case 'lens':
        drawLensShape(ctx, w, h);
        break;
      case 'prism':
        drawPrismShape(ctx, Math.max(w, h));
        break;
      case 'mirror':
      case 'rail':
      case 'bar':
      case 'slab':
        drawMaterialRibbonShape(ctx, w, h, state, object.shape);
        break;
      case 'network-node':
      case 'queue-node':
        drawNetworkNodeShape(ctx, r || 24, object.shape === 'queue-node', state);
        break;
      case 'pool':
        drawPoolShape(ctx, w, h, state);
        break;
      case 'field-envelope':
        drawFieldEnvelopeShape(ctx, r || Math.min(w, h) / 2, state);
        break;
      default:
        drawBodyShape(ctx, w, h, object.kind);
        break;
    }
  }

  function animatedRotation(object, state) {
    if (object.shape === 'wheel') return state.t * 0.65;
    return 0;
  }

  function drawWheelShape(ctx, r, state) {
    const glow = ctx.createRadialGradient(0, 0, r * 0.18, 0, 0, r * 1.08);
    glow.addColorStop(0, 'rgba(255,255,255,0.88)');
    glow.addColorStop(0.34, 'rgba(118,176,255,0.18)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.08, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(82, 96, 118, 0.28)';
    for (let band = 0; band < 4; band += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.28 + band * 0.18), 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i += 1) {
      const a = i * TAU / 12 + state.t * 0.65;
      const hue = 186 + i * 13;
      ctx.strokeStyle = `hsla(${hue}, 92%, 54%, 0.28)`;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
      ctx.lineTo(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88);
      ctx.stroke();
      drawFieldSplat(ctx, Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94, r * 0.045, hue, 0.3, a);
    }
  }

  function drawMagnetShape(ctx, w, h) {
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    for (let side = -1; side <= 1; side += 2) {
      const gradient = ctx.createRadialGradient(side * w * 0.22, 0, 0, side * w * 0.22, 0, Math.max(w, h) * 0.78);
      gradient.addColorStop(0, side < 0 ? 'rgba(74,113,255,0.38)' : 'rgba(244,67,153,0.34)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(side * w * 0.22, 0, w * 0.34, h * 0.62, 0, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 9; i += 1) {
      const y = (i - 4) * h * 0.13;
      ctx.strokeStyle = `hsla(${214 + i * 18}, 88%, 58%, 0.18)`;
      ctx.beginPath();
      ctx.moveTo(-w * 0.52, y);
      ctx.bezierCurveTo(-w * 0.18, y - h * 0.35, w * 0.18, y + h * 0.35, w * 0.52, y);
      ctx.stroke();
    }
  }

  function drawPanelShape(ctx, w, h) {
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    const tilt = h * 0.18;
    const gradient = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    gradient.addColorStop(0, 'rgba(255,245,158,0.44)');
    gradient.addColorStop(0.52, 'rgba(98,202,231,0.22)');
    gradient.addColorStop(1, 'rgba(111,107,227,0.14)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-w * 0.48, -h * 0.38 + tilt);
    ctx.lineTo(w * 0.46, -h * 0.46);
    ctx.lineTo(w * 0.5, h * 0.32 - tilt);
    ctx.lineTo(-w * 0.44, h * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(37,82,130,0.2)';
    for (let i = -3; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo((i / 7) * w, -h * 0.42 + tilt * 0.35);
      ctx.lineTo((i / 7) * w + w * 0.08, h * 0.38 - tilt * 0.35);
      ctx.stroke();
    }
  }

  function drawSliderShape(ctx, w, h, state) {
    const offset = Math.sin(state.t * 1.4) * w * 0.12;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(88,119,170,0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.bezierCurveTo(-w * 0.18, -h * 0.18, w * 0.18, h * 0.18, w * 0.5, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.48)';
    drawFieldSplat(ctx, offset, 0, Math.min(w, h) * 0.36, 286, 0.42, state.t * 0.8);
  }

  function drawMeterShape(ctx, w, h, shape) {
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i += 1) {
      ctx.strokeStyle = `hsla(${176 + i * 24}, 78%, 48%, ${0.22 - i * 0.03})`;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * (0.18 + i * 0.12), Math.PI * 0.1, Math.PI * 1.78);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(36,89,81,0.32)';
    ctx.beginPath();
    for (let i = 0; i <= 8; i += 1) {
      const x = -w * 0.38 + i * w * 0.095;
      const y = Math.sin(i * 0.9) * h * 0.12;
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (shape === 'load') {
      ctx.beginPath();
      ctx.arc(w * 0.28, 0, Math.min(w, h) * 0.14, 0, TAU);
      ctx.stroke();
    }
  }

  function drawFlameShape(ctx, w, h, state) {
    const pulse = 1 + Math.sin(state.t * 2.7) * 0.035;
    const gradient = ctx.createRadialGradient(-w * 0.12, h * 0.08, 0, 0, 0, Math.max(w, h) * 0.76);
    gradient.addColorStop(0, 'rgba(255, 232, 126, 0.46)');
    gradient.addColorStop(0.32, 'rgba(255, 111, 66, 0.24)');
    gradient.addColorStop(0.72, 'rgba(183, 65, 104, 0.08)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.save();
    ctx.globalAlpha *= 0.94;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, h * 0.08, w * 0.54 * pulse, h * 0.42, -0.16, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(207, 78, 82, 0.14)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 7; i += 1) {
      const a = -0.9 + i * 0.28 + Math.sin(state.t * 1.6 + i) * 0.05;
      const sx = -w * 0.42 + i * w * 0.14;
      const sy = h * 0.3 + Math.sin(i) * h * 0.04;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(
        sx + Math.cos(a) * w * 0.16,
        sy - h * (0.18 + i * 0.018),
        sx + Math.cos(a) * w * 0.34,
        sy - h * (0.36 + Math.sin(state.t + i) * 0.04)
      );
      ctx.stroke();
    }
    for (let i = 0; i < 18; i += 1) {
      const x = (hashNoise(212, i) - 0.5) * w * 0.82 + Math.sin(state.t * 2 + i) * 3;
      const y = (hashNoise(214, i) - 0.5) * h * 0.58 - Math.sin(state.t + i) * h * 0.05;
      const r = 1.2 + hashNoise(216, i) * 2.6;
      drawFieldSplat(ctx, x, y, r * 2.2, 28 + hashNoise(217, i) * 42, 0.18 + hashNoise(218, i) * 0.2, state.t + i);
    }
    ctx.restore();
  }

  function drawPlumeShape(ctx, w, h, state) {
    ctx.save();
    for (let i = 0; i < 7; i += 1) {
      const x = (i - 3) * w * 0.09 + Math.sin(state.t * 0.7 + i) * w * 0.05;
      const y = -h * 0.38 + i * h * 0.1 - Math.sin(state.t * 0.9 + i) * h * 0.025;
      const rx = w * (0.2 + i * 0.025);
      const ry = h * (0.12 + i * 0.012);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      gradient.addColorStop(0, `rgba(131, 144, 155, ${0.12 + i * 0.012})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, -0.18 + i * 0.04, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPathShape(ctx, width, height, pose, state) {
    if (!Array.isArray(pose.points) || pose.points.length < 2) return;
    ctx.save();
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha *= 0.62;
    ctx.beginPath();
    pose.points.forEach((point, index) => {
      const x = point[0] * width;
      const y = point[1] * height + Math.sin(state.t * 1.2 + index) * 1.5;
      if (!index) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
    ctx.restore();
  }

  function drawWallShape(ctx, w, h) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(77, 84, 84, 0.24)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      const y = -h * 0.36 + i * h * 0.12;
      ctx.beginPath();
      for (let j = 0; j <= 8; j += 1) {
        const x = -w * 0.48 + j * w * 0.12;
        const yy = y + Math.sin(i * 1.3 + j * 0.8) * h * 0.025;
        if (!j) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 16; i += 1) {
      const x = (hashNoise(401, i) - 0.5) * w;
      const y = (hashNoise(403, i) - 0.5) * h * 0.8;
      ctx.fillStyle = `hsla(${62 + hashNoise(407, i) * 38}, 24%, 34%, 0.12)`;
      ctx.beginPath();
      ctx.arc(x, y, 0.9 + hashNoise(405, i) * 1.7, 0, TAU);
      ctx.fill();
    }
  }

  function drawHeightfieldShape(ctx, w, h, state) {
    ctx.shadowBlur = 0;
    for (let i = 0; i < 11; i += 1) {
      const y = -h * 0.42 + i * h * 0.08;
      ctx.strokeStyle = `hsla(${96 + i * 4}, 38%, 42%, ${0.2 - i * 0.006})`;
      ctx.beginPath();
      for (let j = 0; j <= 18; j += 1) {
        const x = -w * 0.5 + j * w / 18;
        const yy = y + Math.sin(j * 0.8 + i + state.t * 0.25) * h * 0.03;
        if (!j) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    const gradient = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.5, 'rgba(86,153,119,0.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.38);
    ctx.lineTo(-w * 0.12, -h * 0.18);
    ctx.lineTo(w * 0.18, h * 0.05);
    ctx.lineTo(w * 0.5, -h * 0.28);
    ctx.lineTo(w * 0.5, h * 0.5);
    ctx.lineTo(-w * 0.5, h * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function drawGrainShape(ctx, w, h, state) {
    ctx.shadowBlur = 0;
    for (let band = 0; band < 4; band += 1) {
      ctx.strokeStyle = `hsla(${34 + band * 22}, 52%, 48%, ${0.12 + band * 0.02})`;
      ctx.beginPath();
      for (let j = 0; j <= 16; j += 1) {
        const x = -w * 0.46 + j * w * 0.058;
        const y = -h * 0.28 + band * h * 0.18 + Math.sin(j + state.t + band) * h * 0.025;
        if (!j) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 34; i += 1) {
      const x = (hashNoise(81, i) - 0.5) * w * 0.82;
      const y = (hashNoise(91, i) - 0.5) * h * 0.72 + Math.sin(state.t + i) * 0.4;
      const hue = 34 + hashNoise(93, i) * 82;
      ctx.fillStyle = `hsla(${hue}, 46%, 38%, 0.16)`;
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + hashNoise(95, i) * 1.2, 0, TAU);
      ctx.fill();
    }
  }

  function drawMaterialRibbonShape(ctx, w, h, state, shape) {
    const hue = shape === 'bar' ? 212 : shape === 'slab' ? 34 : 188;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 5; band += 1) {
      ctx.strokeStyle = `hsla(${hue + band * 18}, 82%, 54%, ${0.18 - band * 0.018})`;
      ctx.lineWidth = 1.4 + band * 0.35;
      ctx.beginPath();
      for (let i = 0; i <= 16; i += 1) {
        const x = -w * 0.48 + i * w * 0.06;
        const y = (band - 2) * h * 0.09 + Math.sin(state.t * 0.9 + i * 0.7 + band) * h * 0.06;
        if (!i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 16; i += 1) {
      const x = (hashNoise(611, i) - 0.5) * w * 0.9;
      const y = (hashNoise(613, i) - 0.5) * h * 0.58;
      ctx.strokeStyle = `hsla(${hue + hashNoise(619, i) * 46}, 58%, 48%, 0.08)`;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.06, y - h * 0.025);
      ctx.lineTo(x + w * 0.06, y + h * 0.025);
      ctx.stroke();
    }
  }

  function drawLensShape(ctx, w, h) {
    ctx.globalCompositeOperation = 'screen';
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.72);
    gradient.addColorStop(0, 'rgba(255,255,255,0.54)');
    gradient.addColorStop(0.48, 'rgba(121,216,245,0.22)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.48, h * 0.52, 0, 0, TAU);
    ctx.fill();
    for (let i = -2; i <= 2; i += 1) {
      ctx.strokeStyle = `hsla(${196 + i * 18}, 92%, 62%, 0.22)`;
      ctx.beginPath();
      ctx.moveTo(-w * 0.46, i * h * 0.08);
      ctx.bezierCurveTo(-w * 0.12, i * h * 0.02, w * 0.12, -i * h * 0.02, w * 0.46, -i * h * 0.08);
      ctx.stroke();
    }
  }

  function drawPrismShape(ctx, size) {
    ctx.globalCompositeOperation = 'screen';
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.34)');
    gradient.addColorStop(0.46, 'rgba(108,204,240,0.16)');
    gradient.addColorStop(1, 'rgba(220,96,244,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.42, size * 0.3, -0.18, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 7; i += 1) {
      ctx.strokeStyle = `hsla(${190 + i * 22}, 98%, 58%, ${0.2 - i * 0.015})`;
      ctx.lineWidth = 1.1 + i * 0.12;
      ctx.beginPath();
      const y = (-0.2 + i * 0.066) * size;
      ctx.moveTo(-size * 0.52, y);
      ctx.bezierCurveTo(-size * 0.12, y - size * 0.08, size * 0.18, y + size * 0.12, size * 0.52, y + size * 0.04);
      ctx.stroke();
    }
  }

  function drawNetworkNodeShape(ctx, r, queue, state) {
    const pulse = queue ? 1 + Math.sin(state.t * 2.2) * 0.05 : 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.45 * pulse);
    glow.addColorStop(0, queue ? 'rgba(126,158,255,0.28)' : 'rgba(112,229,222,0.22)');
    glow.addColorStop(0.52, queue ? 'rgba(86,98,198,0.11)' : 'rgba(62,186,166,0.09)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45 * pulse, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 4; i += 1) {
      ctx.strokeStyle = queue ? `hsla(${220 + i * 18}, 88%, 58%, ${0.2 - i * 0.035})` : `hsla(${178 + i * 22}, 86%, 50%, ${0.18 - i * 0.03})`;
      ctx.lineWidth = 1.1 + i * 0.25;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (0.42 + i * 0.18) * pulse, r * (0.22 + i * 0.12), Math.sin(state.t + i) * 0.32, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i += 1) {
      const a = state.t * 0.34 + i * TAU / 4;
      ctx.strokeStyle = queue ? `hsla(${222 + i * 12}, 82%, 58%, 0.11)` : `hsla(${176 + i * 14}, 76%, 48%, 0.1)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (0.64 + i * 0.12), r * (0.26 + i * 0.08), a, 0, TAU);
      ctx.stroke();
    }
    if (queue) {
      for (let i = 0; i < 2; i += 1) {
        ctx.strokeStyle = `hsla(${210 + i * 24}, 88%, 55%, ${0.12 - i * 0.03})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.12 + i * 0.22), 0, TAU);
        ctx.stroke();
      }
    }
  }

  function drawPoolShape(ctx, w, h, state) {
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = `hsla(${192 + i * 9}, 90%, 55%, ${0.18 - i * 0.02})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * (0.22 + i * 0.07), h * (0.16 + i * 0.05), Math.sin(state.t + i) * 0.04, 0, TAU);
      ctx.stroke();
    }
    for (let band = 0; band < 6; band += 1) {
      ctx.strokeStyle = `hsla(${188 + band * 6}, 82%, 48%, ${0.09 + band * 0.01})`;
      ctx.beginPath();
      for (let i = 0; i <= 18; i += 1) {
        const x = -w * 0.42 + i * w * 0.047;
        const y = Math.sin(state.t * 0.9 + i * 0.5 + band) * h * 0.04 + (band - 2.5) * h * 0.055;
        if (!i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawFieldEnvelopeShape(ctx, r, state) {
    ctx.globalAlpha *= 0.32;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.4 + i * 0.18 + Math.sin(state.t + i) * 0.01), 0, TAU);
      ctx.stroke();
    }
  }

  function drawBodyShape(ctx, w, h, kind) {
    const sourceLike = kind === 'source' || kind === 'sink';
    const size = Math.min(w, h) * (sourceLike ? 0.56 : 0.46);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    const hue = sourceLike ? 54 : 204;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.6);
    glow.addColorStop(0, `hsla(${hue}, 92%, 66%, 0.22)`);
    glow.addColorStop(0.5, `hsla(${(hue + 74) % 360}, 94%, 58%, 0.12)`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.26, size * 0.72, Math.sin(size) * 0.18, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 3; i += 1) {
      ctx.strokeStyle = `hsla(${hue + i * 38}, 88%, 58%, ${0.2 - i * 0.04})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      const y = (i - 1) * size * 0.2;
      ctx.moveTo(-size * 0.82, y);
      ctx.bezierCurveTo(-size * 0.24, y - size * 0.32, size * 0.24, y + size * 0.32, size * 0.82, y);
      ctx.stroke();
    }
  }

  function drawPlanEmitters(ctx, width, height, state, plan) {
    for (const emitter of plan.emitters || []) {
      const center = planObjectCenter(plan, emitter.source, width, height);
      if (!center) continue;
      const material = plan.materials && plan.materials[emitter.material] || {};
      ctx.save();
      ctx.fillStyle = material.fill || '#98d8ff';
      ctx.globalAlpha = emitter.kind === 'plume' ? 0.18 : 0.34;
      for (let i = 0; i < 32; i += 1) {
        const drift = state.t * (0.08 + (emitter.rate || 0.4) * 0.05);
        const x = center.x + (hashNoise(137, i) - 0.5) * 82 + Math.sin(state.t + i) * 8;
        const y = center.y - ((hashNoise(139, i) + drift + i * 0.013) % 1) * 120;
        const radius = 1.5 + hashNoise(141, i) * 3;
        if (emitter.kind === 'plume') {
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 5);
          gradient.addColorStop(0, 'rgba(112, 124, 132, 0.14)');
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, y, radius * 5, 0, TAU);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(state.t + i);
          ctx.scale(1.8, 0.72);
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  function planObjectCenter(plan, id, width, height) {
    const object = (plan.objects || []).find((item) => item.id === id);
    return object ? planPoseCenter(object.pose || {}, width, height) : null;
  }

  function planPoseCenter(pose, width, height) {
    if (Array.isArray(pose.points) && pose.points.length) {
      const sum = pose.points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
      return { x: sum[0] / pose.points.length * width, y: sum[1] / pose.points.length * height };
    }
    return { x: (pose.x || 0.5) * width, y: (pose.y || 0.5) * height };
  }

  function drawArrow(ctx, x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(angle - 0.5) * 10, y2 - Math.sin(angle - 0.5) * 10);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(angle + 0.5) * 10, y2 - Math.sin(angle + 0.5) * 10);
    ctx.stroke();
  }

  function drawRoundedBox(ctx, x, y, width, height, radius) {
    roundedRect(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.stroke();
  }

  function drawCustomParticleLayer(ctx, canvas, state, spec, alpha) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const objects = spec.objects || [];
    const codes = uniqueComponentCodes(objects);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < state.particles.length; i += 5) {
      const p = state.particles[i];
      const speed = clamp(Math.hypot(p.vx, p.vy) * 12, 0, 1);
      const objectIndex = objects.length ? p.kind % objects.length : 0;
      const object = objects.length ? objects[objectIndex] : null;
      const visualType = componentVisualType(object);
      const hue = componentHue(visualType, p.kind);
      const code = objects.length ? codes[objectIndex] : componentCodeBase(object);
      const size = 6 + speed * 2;
      const rotation = Math.atan2(p.vy || 0.01, p.vx || 0.01) + p.phase * TAU;
      ctx.save();
      ctx.translate(p.x * width, p.y * height);
      ctx.rotate(rotation);
      ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = `hsla(${hue}, 56%, 34%, ${0.06 + speed * alpha * 0.16})`;
      ctx.fillText(code.slice(0, 2), 0, 0);
      ctx.restore();
    }
    ctx.restore();
    drawModuleChips(ctx, width, height, spec.modules);
  }

  function drawLetterWorldFrame(ctx, width, height, spec) {
    const contract = spec.contract || (spec.intent && spec.intent.resolution
      ? spec.intent.resolution.contract || null
      : null);
    const topLevel = contract && contract.topLevel ? contract.topLevel : [];
    const title = topLevel.length ? topLevel.join(' / ') : spec.name;
    const grammar = contract && contract.layout ? contract.layout.grammar : 'component graph';
    ctx.save();
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillStyle = 'rgba(20, 37, 33, 0.08)';
    ctx.strokeStyle = 'rgba(36, 102, 90, 0.12)';
    ctx.lineWidth = 1;
    roundedRect(ctx, width * 0.11, height * 0.15, width * 0.78, height * 0.7, 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20, 37, 33, 0.44)';
    ctx.fillText(title.replace(/-/g, ' ').slice(0, 54), width * 0.13, height * 0.18);
    ctx.fillStyle = 'rgba(20, 37, 33, 0.32)';
    ctx.fillText(grammar, width * 0.13, height * 0.18 + 18);
    ctx.restore();
  }

  function drawModuleChips(ctx, width, height, modules) {
    ctx.save();
    ctx.font = '11px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    let x = 22;
    const y = 28;
    for (const moduleName of modules.slice(0, 10)) {
      const label = moduleName.replace(/-/g, ' ');
      const w = ctx.measureText(label).width + 14;
      ctx.strokeStyle = 'rgba(43, 137, 118, 0.22)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.strokeRect(x, y, w, 22);
      ctx.fillRect(x, y, w, 22);
      ctx.fillStyle = 'rgba(30, 94, 83, 0.78)';
      ctx.fillText(label, x + 7, y + 14);
      x += w + 7;
      if (x > width - 140) break;
    }
    ctx.restore();
  }

  function drawComponentLinks(ctx, points, state) {
    if (points.length < 2) return;
    const drivers = points.filter((point) => (
      point.kind === 'source' ||
      point.kind === 'controller' ||
      point.kind === 'sensor' ||
      point.kind === 'field'
    ));
    const activeDrivers = drivers.length ? drivers : points.slice(0, 1);
    ctx.save();
    ctx.setLineDash([4, 10]);
    ctx.lineDashOffset = -Number(state.t || 0) * 14;
    points.forEach((point, index) => {
      const driver = activeDrivers[index % activeDrivers.length];
      if (driver === point) return;
      const hue = componentHue(point.kind, index);
      ctx.strokeStyle = `hsla(${hue}, 72%, 44%, 0.2)`;
      ctx.lineWidth = point.kind === 'process' || point.kind === 'field' ? 1.6 : 1;
      const midX = (driver.x + point.x) / 2;
      const bend = (index % 2 ? 1 : -1) * 24;
      ctx.beginPath();
      ctx.moveTo(driver.x, driver.y);
      ctx.quadraticCurveTo(midX, (driver.y + point.y) / 2 + bend, point.x, point.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const chain = points.filter((point) => (
      point.kind === 'process' ||
      point.kind === 'material' ||
      point.kind === 'actor'
    )).slice(0, 8);
    ctx.strokeStyle = 'rgba(36, 102, 90, 0.18)';
    ctx.lineWidth = 2.2;
    for (let i = 1; i < chain.length; i += 1) {
      ctx.beginPath();
      ctx.moveTo(chain[i - 1].x, chain[i - 1].y);
      ctx.lineTo(chain[i].x, chain[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function componentCodeBase(object) {
    const id = String(object && object.id || object && object.type || 'node');
    const words = id.split(/[-_\s]+/).filter(Boolean);
    if (!words.length) return 'N';
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.map((word) => word.charAt(0)).join('').slice(0, 4).toUpperCase();
  }

  function uniqueComponentCodes(objects) {
    const counts = new Map();
    return (objects || []).map((object) => {
      const base = componentCodeBase(object);
      const count = counts.get(base) || 0;
      counts.set(base, count + 1);
      if (!count) return base;
      return `${base.slice(0, 3)}${count + 1}`;
    });
  }

  function drawComponentGlyph(ctx, point, width, state) {
    const label = String(point.object.id || 'component').replace(/-/g, ' ').slice(0, 24);
    const hue = componentHue(point.kind, point.index);
    const code = point.code || componentCodeBase(point.object);
    const typeLabel = [
      point.object.layer || point.kind,
      point.object.type || point.kind,
    ].filter(Boolean).join(' / ').slice(0, 28);
    const topLevel = Boolean(point.topLevel);
    const badgeWidth = topLevel ? 52 : 42;
    const badgeHeight = topLevel ? 34 : 28;
    const pulse = Math.sin(Number(state.t || 0) * 1.2 + point.index) * 0.5 + 0.5;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.strokeStyle = `hsla(${hue}, 58%, 32%, ${topLevel ? 0.72 : 0.46})`;
    ctx.fillStyle = `hsla(${hue}, 74%, 62%, ${topLevel ? 0.2 + pulse * 0.04 : 0.12})`;
    ctx.lineWidth = topLevel ? 2 : 1.1;
    roundedRect(ctx, -badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 5);
    ctx.fill();
    ctx.stroke();
    ctx.font = `${topLevel ? 15 : 12}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `hsla(${hue}, 58%, 24%, 0.86)`;
    ctx.fillText(code, 0, 0.5);
    ctx.restore();

    ctx.font = '11px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const labelWidth = Math.min(170, Math.max(ctx.measureText(label).width, ctx.measureText(typeLabel).width) + 14);
    const left = point.x > width * 0.7;
    const x = left ? point.x - labelWidth - 18 : point.x + 18;
    const y = point.y - 15;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.strokeStyle = `hsla(${hue}, 54%, 44%, 0.18)`;
    roundedRect(ctx, x, y, labelWidth, 31, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(20, 37, 33, 0.62)';
    ctx.fillText(label, x + 7, y + 12);
    ctx.fillStyle = 'rgba(20, 37, 33, 0.38)';
    ctx.fillText(typeLabel, x + 7, y + 25);
  }

  function drawObjectLabels(ctx, canvas, state, spec) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const objects = (spec.objects || []).slice(0, 14);
    const layout = spec.contract ? spec.contract.layout : null;
    const codes = uniqueComponentCodes(objects);
    const topLevel = spec.contract && spec.contract.topLevel ? spec.contract.topLevel : [];
    const points = objects.map((object, index) => ({
      ...componentPoint(object, index, objects.length, width, height, state, layout),
      object,
      index,
      code: codes[index],
      topLevel: topLevel.includes(object.id),
    }));
    ctx.save();
    ctx.font = '11px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    drawComponentLinks(ctx, points, state);
    points.forEach((point) => drawComponentGlyph(ctx, point, width, state));
    ctx.restore();
  }

  function clearScene(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    drawGrid(ctx, width, height);
  }

  function drawGrid(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(24, 74, 67, 0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMagnetic(ctx, canvas, state) {
    const { width, height, cx, cy, radius, stator } = simulationGeometry(canvas, state);
    clearScene(ctx, width, height);
    drawMagneticField(ctx, cx, cy, radius, stator, state);
    drawWheel(ctx, cx, cy, radius, state);
    drawStator(ctx, cx, cy, radius, stator, state);
    drawEnergyBars(ctx, width, height, state);
  }

  function drawMagneticField(ctx, cx, cy, radius, stator, state) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const count = 116;
    const hues = [258, 318, 188, 44, 142];
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * TAU + state.t * 0.18;
      const ring = radius * (0.58 + (i % 9) * 0.072);
      const sx = cx + Math.cos(a + state.theta * 0.22) * ring;
      const sy = cy + Math.sin(a + state.theta * 0.22) * ring;
      const dx = stator.x - sx;
      const dy = stator.y - sy;
      const pull = clamp(1 / Math.max(1, Math.hypot(dx, dy) / radius), 0, 1);
      const size = 1.6 + pull * 3.4;
      drawFieldSplat(ctx, sx + dx * pull * 0.2, sy + dy * pull * 0.2, size, hues[i % hues.length], 0.05 + pull * 0.13, a + state.theta * 0.14);
    }
    ctx.restore();
  }

  function drawWheel(ctx, cx, cy, radius, state) {
    ctx.save();
    ctx.strokeStyle = 'rgba(91, 143, 58, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.15, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 10; i += 1) {
      const a = state.theta + (i / 10) * TAU;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      ctx.strokeStyle = i % 2 === 0 ? '#7ac943' : '#e7725f';
      ctx.fillStyle = i % 2 === 0 ? 'rgba(122, 201, 67, 0.16)' : 'rgba(231, 114, 95, 0.16)';
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStator(ctx, cx, cy, radius, stator, state) {
    const target = sliderTargetAngle(state, state.params);
    const targetPoint = {
      x: cx + Math.cos(target) * radius * 1.42,
      y: cy + Math.sin(target) * radius * 1.42,
    };
    ctx.save();
    ctx.strokeStyle = 'rgba(217, 164, 49, 0.42)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.42, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(217, 164, 49, 0.62)';
    ctx.beginPath();
    ctx.moveTo(stator.x, stator.y);
    ctx.lineTo(targetPoint.x, targetPoint.y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(217, 164, 49, 0.14)';
    ctx.strokeStyle = '#d9a431';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stator.x, stator.y, 15, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawEnergyBars(ctx, width, height, state) {
    const ledger = energyLedger(state);
    const items = [
      ['solar in', ledger.solarInputJ, '#7ac943'],
      ['actuator', ledger.actuatorWorkJ, '#d9a431'],
      ['load out', ledger.loadOutputJ, '#2bb8a6'],
      ['losses', ledger.frictionLossJ + ledger.generatorLossJ, '#e7725f'],
    ];
    const max = Math.max(1, ...items.map((item) => item[1]));
    const x = 24;
    const y = height - 128;
    ctx.save();
    ctx.font = '11px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    items.forEach(([label, value, color], index) => {
      const yy = y + index * 27;
      ctx.fillStyle = 'rgba(23, 32, 29, 0.1)';
      ctx.fillRect(x, yy + 15, 180, 3);
      ctx.fillStyle = color;
      ctx.fillText(`${label} ${formatMetric(value, 1)}J`, x, yy);
      ctx.fillRect(x, yy + 15, 180 * clamp(value / max, 0, 1), 3);
    });
    ctx.restore();
  }

  function drawFluid(ctx, canvas, state) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    clearScene(ctx, width, height);
    drawFluidLayer(ctx, canvas, state, 1);
  }

  function drawFluidLayer(ctx, canvas, state, alpha = 1) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const obstacle = { x: width * 0.56, y: height * 0.52, r: Math.min(width, height) * state.params.obstacleRadius };
    ctx.save();
    const band = ctx.createLinearGradient(width * 0.08, 0, width * 0.92, 0);
    band.addColorStop(0, `rgba(43, 184, 166, ${0.16 * alpha})`);
    band.addColorStop(0.5, `rgba(111, 188, 229, ${0.11 * alpha})`);
    band.addColorStop(1, `rgba(122, 201, 67, ${0.07 * alpha})`);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(width * 0.08, height * 0.28);
    for (let i = 0; i <= 16; i += 1) {
      const x = width * (0.08 + i * 0.052);
      const y = height * (0.28 + Math.sin(i * 0.7 + state.t * 0.6) * 0.018);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width * 0.92, height * 0.78);
    for (let i = 16; i >= 0; i -= 1) {
      const x = width * (0.08 + i * 0.052);
      const y = height * (0.78 + Math.sin(i * 0.8 + state.t * 0.5) * 0.016);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = `rgba(32, 154, 150, ${0.34 * alpha})`;
    ctx.lineWidth = 1.45;
    for (let i = 0; i < 14; i += 1) {
      const y = height * (0.26 + i * 0.043);
      ctx.beginPath();
      ctx.moveTo(width * 0.12, y);
      for (let x = width * 0.16; x <= width * 0.86; x += 42) {
        const wake = Math.sin(state.t * 2 + i * 0.9 + x * 0.018) * height * 0.022;
        ctx.lineTo(x, y + wake);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (const p of state.particles) {
      const speed = clamp(Math.hypot(p.vx, p.vy), 0, 2);
      ctx.fillStyle = `rgba(${54 + speed * 42}, ${168 + p.age * 58}, 205, ${(0.18 + speed * 0.38) * alpha})`;
      ctx.beginPath();
      ctx.ellipse(p.x * width, p.y * height, 2 + speed * 4.8, 1.1 + speed * 2.2, Math.atan2(p.vy, p.vx), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.rotate(0.18);
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 8; i += 1) {
      ctx.strokeStyle = `hsla(${42 + i * 16}, 88%, 54%, ${0.22 * alpha - i * 0.014})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, obstacle.r * (0.34 + i * 0.05), obstacle.r * (1.05 + i * 0.1), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(43, 184, 166, 0.58)';
    ctx.beginPath();
    ctx.moveTo(width * 0.08, height * 0.52);
    ctx.lineTo(width * 0.24, height * 0.52);
    ctx.stroke();
    ctx.fillStyle = 'rgba(43, 137, 118, 0.56)';
    ctx.font = '12px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('inlet', width * 0.09, height * 0.49);
    ctx.fillText('outlet', width * 0.81, height * 0.49);
  }

  function drawReaction(ctx, canvas, state) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    clearScene(ctx, width, height);
    drawReactionLayer(ctx, canvas, state, 1);
  }

  function drawReactionLayer(ctx, canvas, state, alpha = 1) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const size = state.size;
    const cell = Math.max(2, Math.min(width, height) * 0.78 / size);
    const left = width * 0.52 - (cell * size) / 2;
    const top = height * 0.52 - (cell * size) / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const b = state.b[idx];
        const heat = state.heat[idx];
        if (b < 0.025 && heat < 0.025) continue;
        ctx.fillStyle = `rgba(${Math.round(80 + heat * 175)}, ${Math.round(120 + b * 120)}, ${Math.round(80 + b * 170)}, ${(0.18 + Math.max(b, heat) * 0.72) * alpha})`;
        ctx.fillRect(left + x * cell, top + y * cell, cell + 0.4, cell + 0.4);
      }
    }
  }

  function start() {
    if (typeof document === 'undefined') return null;
    return createBrowserLab(document);
  }
  return {
    createBrowserLab,
    start,
  };
});
