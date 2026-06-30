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
    const webGpuRenderer = root.defaultView && root.defaultView.SimulatteWebGpuRenderer && canvas
      ? root.defaultView.SimulatteWebGpuRenderer.create(canvas, { maxDpr: 1.5 })
      : null;
    const ctx = null;
    const controlStack = root.getElementById('control-stack');
    const nameInput = root.getElementById('simulation-name');
    const promptInput = root.getElementById('build-prompt');
    const specPreview = root.getElementById('spec-preview');
    const componentStack = root.getElementById('component-stack');
    const shuffleButton = root.getElementById('shuffle-prompt');
    const readouts = Array.from({ length: 6 }, (_, index) => ({
      label: root.getElementById(`readout-${index + 1}-label`),
      value: root.getElementById(`readout-${index + 1}`),
    }));
    const stateReadout = root.getElementById('lab-state');
    const runtimeStatus = intentRuntimeElements(root);
    runtimeStatus.canvasLoader = null;
    runtimeStatus.webGpuRenderer = webGpuRenderer;
    if (!webGpuRenderer && stateReadout) {
      stateReadout.textContent = 'WebGPU required';
    }
    const embedder = root.defaultView && root.defaultView.SimulatteIntentEmbedder
      ? root.defaultView.SimulatteIntentEmbedder.create({
        catalog: model,
        onProgress: (event) => syncIntentRuntime(runtimeStatus, event),
      })
      : null;
    const initialPrompt = promptInput ? promptInput.value : EXAMPLE_INTENTS[0].prompt;
    const initialParams = promptInput
      ? readPromptParams(promptInput, EXAMPLE_INTENTS[0].params)
      : EXAMPLE_INTENTS[0].params;
    let spec = createSpecFromPrompt('blank world', { params: initialParams });
    let state = createSimulationState(spec);
    const field = null;
    if (fieldCanvas) {
      fieldCanvas.style.opacity = '0';
      fieldCanvas.dataset.renderer = webGpuRenderer ? 'primary-webgpu-owned' : 'webgpu-required';
      fieldCanvas.dataset.rendererStatus = webGpuRenderer
        ? 'primary renderer owns scene particles'
        : 'primary WebGPU renderer unavailable; canvas fallback disabled';
    }
    const cinematicRenderer = null;
    let last = performance.now();
    let paused = false;
    let lastPreviewSync = 0;
    let buildSerial = 0;

    const setSpec = (nextSpec) => {
      spec = normalizeSpec(nextSpec);
      state = createSimulationState(spec);
      if (nameInput) nameInput.value = spec.name;
      renderControls(controlStack, spec);
      syncComponentStack(componentStack, spec);
      syncShuffleButton(shuffleButton, spec);
      syncReadoutLabels(readouts, spec);
      syncSpecPreview(specPreview, spec);
      logGraphDebug(spec);
      if (webGpuRenderer) webGpuRenderer.setSpec(spec);
      if (cinematicRenderer) cinematicRenderer.setSpec(spec);
      lastPreviewSync = performance.now();
      last = performance.now();
    };

    const buildFromPrompt = (paramsOverride = null) => {
      const prompt = promptInput ? promptInput.value : '';
      const params = paramsOverride || readPromptParams(promptInput, {});
      const serial = buildSerial + 1;
      buildSerial = serial;
      if (!String(prompt || '').trim() || /\b(blank|empty|scratch)\b/i.test(prompt)) {
        syncIntentRuntime(runtimeStatus, {
          stage: 'blank',
          percent: 100,
          message: 'Blank construction plane',
        });
        setSpec(createSpecFromPrompt(prompt, { params }));
        return;
      }
      resolveWithEmbedding(prompt, params, serial, false);
    };

    if (shuffleButton) {
      shuffleButton.addEventListener('click', () => {
        const example = pickShuffleExample(promptInput ? promptInput.value : '');
        if (promptInput && example) {
          promptInput.value = example.prompt;
          promptInput.dataset.exampleParams = JSON.stringify(example.params || {});
        }
        if (example) {
          shuffleButton.dataset.exampleId = example.id;
          shuffleButton.title = example.prompt;
          buildFromPrompt(example.params || {});
        }
      });
    }
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

    async function resolveWithEmbedding(prompt, params, serial, showCanvasLoader = false) {
      if (!String(prompt || '').trim()) return;
      if (!embedder) {
        resolveWithoutEmbedding(prompt, params, serial, 'Intent model unavailable');
        return;
      }
      if (stateReadout) stateReadout.textContent = 'loading model-backed intent retrieval';
      syncIntentRuntime(runtimeStatus, {
        state: 'active',
        stage: 'start',
        percent: 1,
        message: 'Starting intent model',
        canvasLoading: showCanvasLoader,
      });
      try {
        await waitForLoadingPaint();
        if (serial !== buildSerial) return;
        const result = await embedder.rankPrompt(prompt, model.PHYSICAL_PRIMITIVES, {
          max: 36,
          onProgress: (event) => syncIntentRuntime(runtimeStatus, {
            ...event,
            canvasLoading: showCanvasLoader,
          }),
        });
        if (serial !== buildSerial) return;
        setSpec(createSpecFromPrompt(prompt, {
          params,
          embeddingPriors: result.priors,
          embeddingModel: result.model,
          embeddingBackend: result.backend,
          intentRerank: result.rerank,
          semanticRag: result.semanticRag,
          dopplerIntent: result.dopplerIntent,
          cardMatches: result.cardMatches,
          universeMatches: result.universeMatches,
          evidenceRows: result.evidenceRows,
        }));
        syncIntentRuntime(runtimeStatus, {
          state: 'ready',
          stage: 'ready',
          percent: 100,
          message: 'Intent graph ready',
          backend: result.backend,
        });
      } catch (err) {
        if (serial === buildSerial) {
          const diagnostic = err && err.message ? err.message : String(err || 'intent model failed');
          console.error('[simulatte.intent] model-backed intent failed', err);
          resolveWithoutEmbedding(prompt, params, serial, diagnostic);
        }
      }
    }

    function resolveWithoutEmbedding(prompt, params, serial, diagnostic = '') {
      if (serial !== buildSerial) return;
      setSpec(createSpecFromPrompt(prompt, {
        params,
        allowPrototypeFallback: true,
      }));
      if (diagnostic && typeof console !== 'undefined' && console.info) {
        console.info('[simulatte.intent] using local graph fallback', diagnostic);
      }
      syncIntentRuntime(runtimeStatus, {
        state: 'ready',
        stage: 'local-graph',
        percent: 100,
        message: 'Local graph ready',
        detail: diagnostic,
      });
      if (stateReadout) stateReadout.textContent = stateLabel(state, spec);
    }

    function tick(now) {
      const dt = clamp((now - last) / 1000 || 0.016, 0.001, 0.05);
      last = now;
      spec = readSpecFromUi(spec, controlStack, nameInput);
      if (!paused) {
        const substeps = spec.templateId === 'reaction-diffusion' ? 2 : 3;
        for (let i = 0; i < substeps; i += 1) {
          state = stepSimulation(state, spec, dt / substeps);
        }
      }
      if (webGpuRenderer) {
        webGpuRenderer.render(state, spec, now);
      }
      syncField(field, canvas, state, spec);
      syncReadouts(readouts, stateReadout, state, spec);
      syncOpenSpecPreview(specPreview, spec, now, lastPreviewSync, (value) => {
        lastPreviewSync = value;
      });
      requestAnimationFrame(tick);
    }

    setSpec(spec);
    buildSerial += 1;
    resolveWithEmbedding(initialPrompt, initialParams, buildSerial, true);
    requestAnimationFrame(tick);
    return { getSpec: () => spec, getState: () => state, setSpec };
  }

  function intentRuntimeElements(root) {
    return {
      node: root.getElementById('intent-runtime'),
      title: root.getElementById('intent-runtime-title'),
      percent: root.getElementById('intent-runtime-percent'),
      fill: root.getElementById('intent-runtime-fill'),
      message: root.getElementById('intent-runtime-message'),
      stage: root.getElementById('intent-runtime-stage'),
    };
  }

  function syncIntentRuntime(elements, event = {}) {
    if (!elements || !elements.node) return;
    const hasPercent = Number.isFinite(Number(event.percent));
    const percent = Math.max(0, Math.min(100, Number(event.percent || 0)));
    const stage = String(event.stage || event.phase || 'intent');
    const state = event.state || (stage === 'error' ? 'error' : percent >= 100 ? 'ready' : 'active');
    const loading = state === 'active';
    const indeterminate = loading && !hasPercent;
    const canvasLoading = loading && event.canvasLoading === true;
    const runButton = elements.node.closest('.physics-panel')?.querySelector('#build-lab');
    const rawMessage = event.detail || event.message || stage;
    const message = compactIntentRuntimeMessage(event.message || stage);
    elements.node.dataset.state = state;
    elements.node.dataset.progress = indeterminate ? 'indeterminate' : 'determinate';
    elements.node.dataset.loadingVisual = canvasLoading ? 'snake' : loading ? 'simple' : 'idle';
    elements.node.dataset.detail = String(message || '');
    elements.node.title = String(message || '');
    const doc = elements.node.ownerDocument;
    if (doc && doc.documentElement) {
      doc.documentElement.dataset.canvasLoading = canvasLoading ? 'snake' : 'idle';
    }
    if (elements.canvasLoader) {
      elements.canvasLoader.setLoading(canvasLoading, percent, stage);
    }
    if (elements.webGpuRenderer && typeof elements.webGpuRenderer.setLoading === 'function') {
      elements.webGpuRenderer.setLoading(canvasLoading, percent, stage);
    }
    if (runButton) {
      runButton.classList.toggle('is-loading', loading);
      runButton.disabled = loading;
      runButton.setAttribute('aria-disabled', loading ? 'true' : 'false');
      runButton.setAttribute('aria-busy', loading ? 'true' : 'false');
    }
    if (elements.title) elements.title.textContent = event.title || 'Compute activity';
    if (elements.percent) elements.percent.textContent = indeterminate ? 'live' : `${Math.round(percent)}%`;
    if (elements.fill) elements.fill.style.width = `${indeterminate ? 38 : percent}%`;
    if (elements.message) elements.message.textContent = message;
    if (elements.stage) elements.stage.textContent = runtimeDetailText(event, stage, rawMessage);
  }

  function runtimeDetailText(event, stage, rawMessage) {
    const parts = [
      stage.replace(/-/g, ' '),
      event.backend,
      event.model,
      event.bytes ? `${event.bytes} bytes` : '',
      rawMessage && rawMessage !== event.message ? rawMessage : '',
    ].filter(Boolean);
    return parts.join(' | ') || 'standby';
  }

  function compactIntentRuntimeMessage(message) {
    const text = String(message || '').trim();
    if (!text) return 'Intent model busy';
    if (/attention_small\.wgsl|activationDtype|kvDtype|kvcache/i.test(text)) {
      return 'Runtime dtype mismatch';
    }
    if (/cache worker.*controlling|reload and retry/i.test(text)) return 'Reload to finish model cache';
    if (/CacheStorage|Service Worker/i.test(text)) return 'Model cache unavailable';
    if (/model fetch failed|fetch failed|failed to fetch/i.test(text)) return 'Model download failed';
    if (/Doppler module import|no loader found/i.test(text)) return 'Doppler runtime unavailable';
    if (/embedModel(Id|Hash) mismatch|embedding dim mismatch|non-finite value/i.test(text)) {
      return 'Intent model unavailable';
    }
    if (/https?:\/\/|huggingface\.co|Clocksmith\/rdrr/i.test(text)) return 'Intent model unavailable';
    if (/^Caching shard_/i.test(text)) return 'Caching model weights';
    if (/^Cached shard_/i.test(text)) return 'Model weights cached';
    if (text.length <= 72) return text;
    return `${text.slice(0, 69).trim()}...`;
  }

  function waitForLoadingPaint() {
    if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  }

  function createCanvasSnakeLoader() {
    return {
      active: false,
      opacity: 0,
      progress: 0,
      stage: 'idle',
      tile: 24,
      cols: 0,
      rows: 0,
      layoutKey: '',
      stepCount: 0,
      lastStep: 0,
      nextSnakeId: 1,
      snakes: [],
      snakeSignals: [],
      setLoading(active, percent, stage) {
        const wasActive = this.active;
        this.active = Boolean(active);
        this.progress = clamp(Number(percent || 0) / 100, 0, 1);
        this.stage = String(stage || this.stage || 'intent');
        if (this.active && !this.snakes.length) {
          this.layoutKey = '';
          this.lastStep = 0;
        }
        if (this.active && !wasActive) {
          this.opacity = Math.max(this.opacity, 0.16);
          this.lastStep = 0;
          this.snakeSignals = [];
        }
      },
    };
  }

  function drawCanvasLoadingSnakes(ctx, canvas, loader, now) {
    if (!loader) return;
    const targetOpacity = loader.active ? 0.72 : 0;
    loader.opacity += (targetOpacity - loader.opacity) * (loader.active ? 0.1 : 0.16);
    if (!loader.active && loader.opacity < 0.015) {
      loader.opacity = 0;
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    if (width <= 0 || height <= 0) return;
    ensureSnakeLoaderLayout(loader, width, height);
    if (loader.active) {
      const stepMs = 58 - loader.progress * 22;
      if (!loader.lastStep) loader.lastStep = now;
      let steps = 0;
      while (now - loader.lastStep >= stepMs && steps < 5) {
        stepCanvasSnakes(loader);
        loader.lastStep += stepMs;
        steps += 1;
      }
    }
    renderCanvasSnakes(ctx, loader, width, height);
  }

  function ensureSnakeLoaderLayout(loader, width, height) {
    const tile = Math.max(24, Math.min(40, Math.round(Math.min(width, height) / 15)));
    const cols = Math.max(10, Math.ceil(width / tile));
    const rows = Math.max(10, Math.ceil(height / tile));
    const layoutKey = `${cols}x${rows}x${tile}`;
    if (loader.layoutKey === layoutKey && loader.snakes.length) return;
    loader.tile = tile;
    loader.cols = cols;
    loader.rows = rows;
    loader.layoutKey = layoutKey;
    loader.stepCount = 0;
    loader.nextSnakeId = 1;
    loader.snakeSignals = [];
    loader.snakes = createInitialCanvasSnakes(loader);
  }

  function createInitialCanvasSnakes(loader) {
    const start = {
      x: Math.max(2, Math.floor(loader.cols * 0.12)),
      y: Math.max(2, Math.floor(loader.rows * 0.5)),
      dir: { x: 1, y: 0 },
    };
    return [createCanvasSnake(
      loader,
      start.x,
      start.y,
      start.dir,
      202,
      Math.max(16, Math.min(28, Math.floor((loader.cols + loader.rows) * 0.36)))
    )];
  }

  function createCanvasSnake(loader, x, y, dir, hue, length = 14) {
    const snake = {
      id: loader.nextSnakeId,
      dir: { ...dir },
      hue,
      maxLength: length,
      cells: [],
      bitePulse: 0,
      joinPulse: 0,
      splitPulse: 0,
      spawnFade: 0,
      retired: false,
      deathFade: 1,
      deathReason: '',
      targetTail: null,
      targetSnakeId: null,
    };
    loader.nextSnakeId += 1;
    for (let i = 0; i < length; i += 1) {
      snake.cells.push(wrapSnakeCell(loader, {
        x: x - dir.x * i,
        y: y - dir.y * i,
      }));
    }
    return snake;
  }

  function stepCanvasSnakes(loader) {
    loader.stepCount += 1;
    const liveSnakes = loader.snakes.filter((snake) => !snake.retired && snake.cells.length > 2);
    for (const snake of liveSnakes) {
      snake.spawnFade = Math.min(1, (snake.spawnFade || 0) + 0.11);
      if (!snake.targetTail && snake.cells.length > 9 && (loader.stepCount + snake.id * 5) % 9 === 0) {
        snake.targetTail = snake.cells[Math.max(5, Math.floor(snake.cells.length * 0.64))];
      }
      snake.targetSnakeId = null;
      advanceCanvasSnake(loader, snake, buildSnakeOccupancy([snake]));
      snake.bitePulse = Math.max(0, snake.bitePulse - 0.12);
      snake.joinPulse = Math.max(0, snake.joinPulse - 0.1);
      snake.splitPulse = Math.max(0, snake.splitPulse - 0.09);
    }
    for (const snake of loader.snakes) {
      if (snake.retired) {
        snake.deathFade = Math.max(0, snake.deathFade - 0.13);
        snake.bitePulse = Math.max(0, snake.bitePulse - 0.08);
        snake.joinPulse = Math.max(0, snake.joinPulse - 0.08);
        snake.splitPulse = Math.max(0, snake.splitPulse - 0.08);
      } else if (snake.cells.length <= 3) {
        retireCanvasSnake(snake, 'empty');
      }
    }
    loader.snakes = loader.snakes.filter((snake) => snake.cells.length > 3 && (!snake.retired || snake.deathFade > 0.02));
    loader.snakeSignals = loader.snakeSignals
      .map((signal) => ({ ...signal, life: signal.life - 0.075 }))
      .filter((signal) => signal.life > 0);
    let activeCount = loader.snakes.filter((snake) => !snake.retired && snake.cells.length > 3).length;
    while (activeCount < 1) {
      const x = Math.floor(loader.cols * (0.18 + hashNoise(loader.nextSnakeId, 11) * 0.64));
      const y = Math.floor(loader.rows * (0.18 + hashNoise(loader.nextSnakeId, 17) * 0.64));
      const dir = SNAKE_DIRS[loader.nextSnakeId % SNAKE_DIRS.length];
      loader.snakes.push(createCanvasSnake(loader, x, y, dir, 202, Math.max(16, Math.min(28, Math.floor((loader.cols + loader.rows) * 0.36)))));
      activeCount += 1;
    }
  }

  const SNAKE_DIRS = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];

  function advanceCanvasSnake(loader, snake, occupancy) {
    const head = snake.cells[0];
    const nextDir = chooseCanvasSnakeDir(loader, snake, occupancy);
    const next = wrapSnakeCell(loader, {
      x: head.x + nextDir.x,
      y: head.y + nextDir.y,
    });
    const hit = occupancy.get(snakeCellKey(next));
    snake.dir = nextDir;
    if (hit && hit.snakeId === snake.id && hit.index > 4) {
      snake.cells = [next, ...snake.cells.slice(0, hit.index)];
      snake.maxLength = Math.max(8, Math.min(snake.maxLength, snake.cells.length));
      snake.bitePulse = 1;
      snake.targetTail = null;
      addSnakeSignal(loader, next, snake.hue, 'tail');
      return;
    }
    if (hit && hit.snakeId !== snake.id) {
      const other = loader.snakes.find((candidate) => candidate.id === hit.snakeId);
      if (other && !other.retired) {
        snake.cells = [next, ...snake.cells, ...other.cells.slice(hit.index, hit.index + 10)];
        snake.maxLength = Math.min(38, snake.maxLength + Math.ceil(other.maxLength * 0.45));
        snake.hue = (snake.hue + other.hue) / 2;
        snake.joinPulse = 1;
        snake.targetTail = null;
        snake.targetSnakeId = null;
        addSnakeSignal(loader, next, (snake.hue + other.hue) / 2, 'join');
        retireCanvasSnake(other, 'join');
      }
    } else {
      snake.cells.unshift(next);
    }
    if (snake.targetTail && snakeCellDistance(next, snake.targetTail, loader) < 2) {
      snake.targetTail = null;
    }
    while (snake.cells.length > snake.maxLength) snake.cells.pop();
  }

  function chooseCanvasSnakeDir(loader, snake, occupancy) {
    const head = snake.cells[0];
    const reverse = { x: -snake.dir.x, y: -snake.dir.y };
    let best = snake.dir;
    let bestScore = -Infinity;
    for (const dir of SNAKE_DIRS) {
      if (dir.x === reverse.x && dir.y === reverse.y) continue;
      const next = wrapSnakeCell(loader, { x: head.x + dir.x, y: head.y + dir.y });
      const hit = occupancy.get(snakeCellKey(next));
      let score = dir.x === snake.dir.x && dir.y === snake.dir.y ? 1.4 : 0.4;
      score += hashNoise(loader.stepCount + snake.id * 17 + dir.x * 7, dir.y * 13 + snake.id) * 1.2;
      if (snake.targetTail) {
        const currentDistance = snakeCellDistance(head, snake.targetTail, loader);
        const nextDistance = snakeCellDistance(next, snake.targetTail, loader);
        score += (currentDistance - nextDistance) * 3.1;
      }
      if (snake.targetSnakeId) {
        const target = loader.snakes.find((candidate) => candidate.id === snake.targetSnakeId && !candidate.retired);
        if (target) {
          const currentDistance = snakeCellDistance(head, target.cells[0], loader);
          const nextDistance = snakeCellDistance(next, target.cells[0], loader);
          score += (currentDistance - nextDistance) * 1.8;
        } else {
          snake.targetSnakeId = null;
        }
      }
      if (hit && hit.snakeId === snake.id) {
        score += hit.index > 4 ? 3.4 : -6.2;
      } else if (hit && hit.snakeId !== snake.id) {
        score += 2.1;
      }
      if (next.x < 1 || next.x > loader.cols - 2 || next.y < 1 || next.y > loader.rows - 2) {
        score -= 0.35;
      }
      if (score > bestScore) {
        best = dir;
        bestScore = score;
      }
    }
    return best;
  }

  function splitCanvasSnake(loader) {
    const source = loader.snakes
      .filter((snake) => !snake.retired && snake.cells.length > 12)
      .sort((a, b) => b.cells.length - a.cells.length)[0];
    if (!source) return;
    const splitIndex = Math.max(5, Math.min(
      source.cells.length - 6,
      Math.floor(source.cells.length * (0.42 + hashNoise(loader.stepCount, source.id) * 0.24))
    ));
    const sourceCells = source.cells.slice(0, splitIndex).map((cell) => ({ ...cell }));
    const branchCells = source.cells.slice(splitIndex).map((cell) => ({ ...cell }));
    if (sourceCells.length < 5 || branchCells.length < 5) return;
    const origin = branchCells[0];
    const branchDir = snakeDirFromCells(branchCells[0], branchCells[1], loader) || source.dir;
    const branch = createCanvasSnake(
      loader,
      origin.x,
      origin.y,
      branchDir,
      source.hue + 42 + hashNoise(source.id, loader.stepCount) * 70,
      branchCells.length
    );
    source.cells = sourceCells;
    source.maxLength = Math.max(source.cells.length, Math.floor(source.maxLength * 0.62));
    source.targetTail = null;
    source.targetSnakeId = null;
    source.splitPulse = 1;
    branch.cells = branchCells;
    branch.maxLength = Math.max(branch.cells.length, Math.floor(source.maxLength * 0.72));
    branch.dir = branchDir;
    branch.splitPulse = 1;
    branch.spawnFade = 0;
    branch.targetSnakeId = source.id;
    addSnakeSignal(loader, origin, branch.hue, 'split');
    loader.snakes.push(branch);
  }

  function joinNearbyCanvasSnakes(loader) {
    const candidates = loader.snakes.filter((snake) => !snake.retired && snake.cells.length);
    if (candidates.length < 3) return;
    let bestPair = null;
    let bestDistance = Infinity;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i];
        const b = candidates[j];
        const distance = snakeCellDistance(a.cells[0], b.cells[0], loader);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPair = [a, b];
        }
      }
    }
    if (!bestPair || bestDistance > Math.max(7, Math.floor(Math.min(loader.cols, loader.rows) * 0.28))) return;
    const [a, b] = bestPair;
    const hitCell = b.cells[0];
    a.cells = [hitCell, ...a.cells, ...b.cells.slice(0, 16)];
    a.maxLength = Math.min(54, a.maxLength + Math.ceil(b.maxLength * 0.65));
    a.hue = (a.hue * 0.6 + b.hue * 0.4);
    a.joinPulse = 1;
    a.targetSnakeId = null;
    addSnakeSignal(loader, hitCell, a.hue, 'join');
    retireCanvasSnake(b, 'join');
  }

  function nearestSnakeHead(loader, snake) {
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of loader.snakes) {
      if (candidate === snake || candidate.retired || !candidate.cells.length) continue;
      const distance = snakeCellDistance(snake.cells[0], candidate.cells[0], loader);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  function snakeDirFromCells(head, next, loader) {
    if (!head || !next) return null;
    return SNAKE_DIRS.find((dir) => {
      const expected = wrapSnakeCell(loader, { x: next.x + dir.x, y: next.y + dir.y });
      return expected.x === head.x && expected.y === head.y;
    }) || null;
  }

  function retireCanvasSnake(snake, reason = 'join') {
    if (!snake || snake.retired) return;
    snake.retired = true;
    snake.deathFade = 1;
    snake.deathReason = reason;
    snake.targetTail = null;
    snake.targetSnakeId = null;
    snake.joinPulse = Math.max(snake.joinPulse || 0, reason === 'join' ? 0.65 : 0);
    snake.bitePulse = Math.max(snake.bitePulse || 0, reason === 'empty' ? 0.55 : 0);
  }

  function addSnakeSignal(loader, cell, hue, kind) {
    loader.snakeSignals.push({
      x: cell.x,
      y: cell.y,
      hue,
      kind,
      life: 1,
    });
    if (loader.snakeSignals.length > 18) loader.snakeSignals.shift();
  }

  function buildSnakeOccupancy(snakes) {
    const occupancy = new Map();
    for (const snake of snakes) {
      if (snake.retired) continue;
      snake.cells.forEach((cell, index) => {
        const key = snakeCellKey(cell);
        if (!occupancy.has(key)) occupancy.set(key, { snakeId: snake.id, index });
      });
    }
    return occupancy;
  }

  function renderCanvasSnakes(ctx, loader, width, height) {
    const alpha = loader.opacity;
    const tile = loader.tile;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(250, 249, 255, 0.84)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(74, 58, 92, 0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width + tile; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height + tile; y += tile) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    drawSnakeSignals(ctx, loader);
    for (const snake of loader.snakes) {
      drawCanvasSnake(ctx, loader, snake);
    }
    ctx.restore();
  }

  function drawSnakeSignals(ctx, loader) {
    const tile = loader.tile;
    for (const signal of loader.snakeSignals || []) {
      const life = clamp(signal.life, 0, 1);
      const x = (signal.x + 0.5) * tile;
      const y = (signal.y + 0.5) * tile;
      const radius = tile * (0.28 + (1 - life) * 1.15);
      const alpha = life * (signal.kind === 'tail' ? 0.28 : 0.2);
      ctx.strokeStyle = `hsla(${signal.hue}, 78%, 58%, ${alpha})`;
      ctx.lineWidth = Math.max(1, tile * 0.045);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.stroke();
      if (signal.kind === 'split') {
        ctx.strokeStyle = `hsla(${(signal.hue + 52) % 360}, 78%, 62%, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(x - radius * 0.8, y);
        ctx.lineTo(x + radius * 0.8, y);
        ctx.stroke();
      }
    }
  }

  function drawCanvasSnake(ctx, loader, snake) {
    if (!snake.cells.length) return;
    const tile = loader.tile;
    const inset = Math.max(2, Math.floor(tile * 0.18));
    const deathAlpha = snake.retired ? clamp(snake.deathFade, 0, 1) : 1;
    const birthAlpha = clamp(snake.spawnFade === undefined ? 1 : snake.spawnFade, 0, 1);
    if (deathAlpha <= 0 || birthAlpha <= 0) return;
    for (let index = snake.cells.length - 1; index >= 0; index -= 1) {
      const cell = snake.cells[index];
      const isHead = index === 0;
      const age = index / Math.max(1, snake.cells.length - 1);
      const tailFade = Math.pow(1 - age, 2.15);
      const hue = (snake.hue + index * 2.4 + loader.stepCount * 0.9) % 360;
      const pulse = Math.max(snake.bitePulse, snake.joinPulse, snake.splitPulse);
      const light = 58 + tailFade * 11 + pulse * 8 + (isHead ? 7 : 0);
      const alpha = (0.06 + tailFade * 0.46 + pulse * 0.1 + (isHead ? 0.16 : 0)) * deathAlpha * birthAlpha;
      const cellInset = isHead ? Math.max(2, Math.floor(tile * 0.12)) : inset;
      ctx.fillStyle = `hsla(${hue}, 82%, ${light}%, ${alpha})`;
      drawRoundedSnakeCell(ctx, cell.x * tile + cellInset, cell.y * tile + cellInset, tile - cellInset * 2);
    }
  }

  function drawRoundedSnakeCell(ctx, x, y, size) {
    const radius = Math.max(2, size * 0.22);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + size - radius, y);
    ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
    ctx.lineTo(x + size, y + size - radius);
    ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    ctx.lineTo(x + radius, y + size);
    ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();
  }

  function wrapSnakeCell(loader, cell) {
    return {
      x: (cell.x + loader.cols) % loader.cols,
      y: (cell.y + loader.rows) % loader.rows,
    };
  }

  function snakeCellKey(cell) {
    return `${cell.x},${cell.y}`;
  }

  function snakeCellDistance(a, b, loader) {
    if (!a || !b) return Infinity;
    const dx = Math.min(Math.abs(a.x - b.x), loader.cols - Math.abs(a.x - b.x));
    const dy = Math.min(Math.abs(a.y - b.y), loader.rows - Math.abs(a.y - b.y));
    return dx + dy;
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
    const name = nameInput && nameInput.value ? nameInput.value : spec.name;
    if (name === spec.name && sameParamValues(params, spec.params)) return spec;
    return {
      ...spec,
      name,
      params,
    };
  }

  function sameParamValues(next = {}, prev = {}) {
    const keys = new Set([...Object.keys(next || {}), ...Object.keys(prev || {})]);
    for (const key of keys) {
      if (Number(next[key]) !== Number(prev[key])) return false;
    }
    return true;
  }

  function syncTemplateButtons(buttons, templateId) {
    buttons.forEach((button) => {
      const active = button.dataset.templateId === templateId;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    });
  }

  function syncShuffleButton(button, spec) {
    if (!button) return;
    const prompt = spec.renderIR && spec.renderIR.prompt ||
      spec.universeGraph && spec.universeGraph.prompt ||
      '';
    const match = EXAMPLE_INTENTS.find((example) => example.prompt === prompt);
    button.dataset.exampleId = match ? match.id : '';
    button.title = match ? match.prompt : `${EXAMPLE_INTENTS.length} example prompts`;
    button.classList.toggle('is-active', Boolean(match));
    button.setAttribute('aria-pressed', match ? 'true' : 'false');
  }

  function pickShuffleExample(currentPrompt = '') {
    const normalized = String(currentPrompt || '').trim().toLowerCase();
    const pool = EXAMPLE_INTENTS.filter((example) => String(example.prompt || '').toLowerCase() !== normalized);
    const candidates = pool.length ? pool : EXAMPLE_INTENTS;
    if (!candidates.length) return null;
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index] || candidates[0];
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
    const components = spec.objects.map((object) => ({
      id: object.id,
      type: object.type,
      role: object.role,
      params: {},
    }));
    const domains = spec.modules;
    const contract = spec.contract || null;
    const topLevelIds = contract && contract.topLevel || [];
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
      intentReceipt: spec.physicalSpec && spec.physicalSpec.receipt
        ? spec.physicalSpec.receipt.intentBrief || null
        : null,
      semanticRetrievalReceipt: spec.universeGraph ? spec.universeGraph.intentBrief || null : null,
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
      promptParse: spec.promptParse ? {
        schema: spec.promptParse.schema,
        spans: spec.promptParse.spans.length,
        clauses: spec.promptParse.clauses.length,
      } : null,
      universeGraph: spec.universeGraph ? {
        schema: spec.universeGraph.schema,
        nodes: spec.universeGraph.nodes.length,
        edges: spec.universeGraph.edges.length,
        unresolved: spec.universeGraph.unresolved,
      } : null,
      physicsIR: spec.physicsIR ? {
        schema: spec.physicsIR.schema,
        domains: spec.physicsIR.domains.map((domain) => `${domain.kind}:${domain.entityId}`),
        fields: spec.physicsIR.stateFields.map((field) => field.id),
        operators: spec.physicsIR.operators.map((operator) => operator.type),
        couplings: spec.physicsIR.couplings,
      } : null,
      validationReceipt: spec.validationReceipt || null,
      solverGraph: spec.solverGraph ? {
        schema: spec.solverGraph.schema,
        channels: Object.keys(spec.solverGraph.channels || {}),
        steps: spec.solverGraph.steps.map((step) => `${step.stage}:${step.operatorType}`),
        warnings: spec.solverGraph.warnings,
      } : null,
      renderIR: spec.renderIR ? {
        schema: spec.renderIR.schema,
        sceneHint: spec.renderIR.sceneHint,
        objects: spec.renderIR.objects.map((object) => ({
          id: object.physicalRef,
          glyph: object.glyph,
          bindings: object.stateBindings,
        })),
      } : null,
      renderProgram: spec.renderProgram ? {
        schema: spec.renderProgram.schema,
        objects: spec.renderProgram.objects.length,
        relations: spec.renderProgram.relations.length,
        fields: spec.renderProgram.fields.map((field) => field.kind),
        solver: spec.renderProgram.solverPlan ? spec.renderProgram.solverPlan.families : [],
        visualRegimes: spec.renderProgram.provenance.visualRegimes || [],
        signature: spec.renderProgram.provenance.signature,
      } : null,
      physicalSpec: spec.physicalSpec ? {
        schema: spec.physicalSpec.schema,
        sourceGraph: spec.physicalSpec.sourceGraph,
        stateTextures: spec.physicalSpec.stateTextures,
        renderPasses: spec.physicalSpec.renderPasses,
        quality: spec.physicalSpec.quality,
        receipt: spec.physicalSpec.receipt,
      } : null,
      params: Object.fromEntries(Object.entries(spec.params).slice(0, 8)),
      remixOf: spec.remixOf || null,
    }, null, 2);
  }

  function logGraphDebug(spec) {
    if (typeof console === 'undefined' || !spec || typeof spec !== 'object') return;
    if (!spec.compositionGraph && !spec.renderProgram && !spec.physicalSpec) return;
    const graph = spec.compositionGraph || null;
    const renderProgram = spec.renderProgram || null;
    const receipt = spec.physicalSpec && spec.physicalSpec.receipt || null;
    const rendererPlan = renderProgram && renderProgram.rendererPlan || null;
    const prompt = renderProgram && renderProgram.intentText || spec.renderIR && spec.renderIR.prompt || spec.name || 'simulation';
    const scene = rendererPlan && rendererPlan.sceneKind || 'unplanned';
    const label = `[simulatte.graph] ${scene}: ${prompt}`;
    const group = typeof console.groupCollapsed === 'function' ? console.groupCollapsed.bind(console) : console.log.bind(console);
    const groupEnd = typeof console.groupEnd === 'function' ? console.groupEnd.bind(console) : () => {};
    group(label);
    console.log('intentReceipt', spec.physicalSpec && spec.physicalSpec.receipt && spec.physicalSpec.receipt.intentBrief || null);
    console.log('semanticRetrievalReceipt', spec.universeGraph && spec.universeGraph.intentBrief || null);
    console.log('promptParse', spec.promptParse || null);
    console.log('universeGraph', spec.universeGraph || null);
    console.log('semanticGraph', spec.universeGraph && spec.universeGraph.semanticGraph || null);
    console.log('affordanceGraph', spec.universeGraph && spec.universeGraph.affordanceGraph || null);
    console.log('primitiveMapping', spec.universeGraph && spec.universeGraph.primitiveMapping || null);
    console.log('physicsIR', spec.physicsIR || null);
    console.log('validationReceipt', spec.validationReceipt || null);
    console.log('solverGraph', spec.solverGraph || null);
    console.log('renderIR', spec.renderIR || null);
    console.log('compositionGraph', graph);
    console.log('renderProgram', renderProgram);
    console.log('physicalSpec', spec.physicalSpec || null);
    console.log('receipt', receipt);
    if (graph && typeof console.table === 'function') {
      console.table((graph.nodes || []).map((node) => ({
        id: node.id,
        primitive: node.primitiveId,
        type: node.type,
        layer: node.layer,
        regime: node.visualRegime,
        material: node.material,
        source: node.source,
      })));
      console.table((graph.relations || []).map((relation) => ({
        from: relation.from,
        to: relation.to,
        type: relation.type || relation.relation || '',
        operator: relation.operator || '',
      })));
      console.table((graph.operators || []).map((operator) => ({
        id: operator.id,
        kind: operator.kind || operator.type || '',
        inputs: Array.isArray(operator.inputs) ? operator.inputs.join(', ') : '',
        outputs: Array.isArray(operator.outputs) ? operator.outputs.join(', ') : '',
      })));
    }
    if (rendererPlan) {
      console.log('rendererPlan', rendererPlan);
    }
    groupEnd();
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
    void ctx;
    void canvas;
    void state;
    void spec;
    throw new Error('Canvas2D simulation renderer is disabled; Simulatte requires the primary WebGPU renderer.');
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
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 9; band += 1) {
      const rx = w * (0.18 + band * 0.045 + density * 0.018);
      const ry = h * (0.13 + band * 0.034 + density * 0.012);
      const hue = 168 + band * 10;
      ctx.strokeStyle = `hsla(${hue}, 58%, 48%, ${0.09 - band * 0.004})`;
      ctx.lineWidth = 1 + band * 0.08;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, Math.sin(state.t * 0.12 + band) * 0.18, 0, TAU);
      ctx.stroke();
    }
    for (let line = 0; line < 12; line += 1) {
      const y = cy - h * 0.38 + line * h * 0.07;
      ctx.strokeStyle = `hsla(${185 + line * 5}, 54%, 46%, ${0.04 + density * 0.035})`;
      ctx.beginPath();
      for (let x = cx - w * 0.44; x <= cx + w * 0.44; x += w * 0.08) {
        const yy = y + Math.sin(x * 0.016 + line + state.t * 0.2) * h * 0.012;
        if (x === cx - w * 0.44) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
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
    drawFreeformContinuumWorld(ctx, width, height, state, spec);
  }

  function drawFreeformContinuumWorld(ctx, width, height, state, spec) {
    const objects = (spec.objects || []).slice(0, 18);
    if (!objects.length) return;
    const layout = spec.contract ? spec.contract.layout : null;
    const points = objects.map((object, index) => ({
      ...componentPoint(object, index, objects.length, width, height, state, layout),
      object,
      index,
    }));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      const hue = componentHue(componentVisualType(to.object), i);
      ctx.strokeStyle = `hsla(${hue}, 62%, 46%, 0.09)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.bezierCurveTo(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2 + Math.sin(state.t * 0.5 + i) * 18,
        (from.x + to.x) / 2,
        (from.y + to.y) / 2 - Math.cos(state.t * 0.4 + i) * 18,
        to.x,
        to.y
      );
      ctx.stroke();
    }
    points.forEach((point) => {
      const material = objectMaterialKey(point.object);
      const synthetic = {
        id: point.object.id,
        kind: point.object.type,
        material,
        role: point.object.role || point.object.type,
        shape: point.object.type,
        pose: {
          x: point.x / width,
          y: point.y / height,
          w: point.topLevel ? 0.12 : 0.085,
          h: point.topLevel ? 0.09 : 0.065,
          rotation: (point.index / Math.max(1, points.length)) * TAU,
        },
      };
      drawObjectMaterialKernel(ctx, objectExtent(synthetic, width, height), state, synthetic, point.index);
    });
    ctx.restore();
  }

  function drawWorldPlanScene(ctx, width, height, state, plan) {
    const sceneKind = sceneKindForPlan(plan);
    const painterKind = painterKindForScene(sceneKind);
    if (isExpandedSceneKind(sceneKind)) {
      paintExpandedSceneWorld(ctx, width, height, state, plan, sceneKind);
      drawVisualIRProgram(ctx, width, height, state, plan);
      drawSceneCinematicFinish(ctx, width, height, state, plan, sceneKind, painterKind);
      drawSolverChannelContours(ctx, width, height, state, plan, sceneKind);
      return;
    }
    if (painterKind === 'fire') paintFireWorld(ctx, width, height, state, plan);
    else if (painterKind === 'optics') paintOpticsWorld(ctx, width, height, state, plan);
    else if (painterKind === 'city') paintCityWorld(ctx, width, height, state, plan);
    else if (painterKind === 'watershed') paintWatershedWorld(ctx, width, height, state, plan);
    else if (painterKind === 'magnetic-machine') paintMagneticMachineWorld(ctx, width, height, state, plan);
    else if (painterKind === 'mechanical') paintMechanicalWorld(ctx, width, height, state, plan);
    else if (painterKind === 'literal-composite') paintLiteralCompositeWorld(ctx, width, height, state, plan);
    else if (painterKind === 'ferrofluid') paintFerrofluidWorld(ctx, width, height, state, plan);
    else if (painterKind === 'thin-film') paintThinFilmWorld(ctx, width, height, state, plan);
    else if (painterKind === 'granular') paintGranularWorld(ctx, width, height, state, plan);
    else if (painterKind === 'thermal-plume') paintThermalPlumeWorld(ctx, width, height, state, plan);
    else if (painterKind === 'material-tray') paintMaterialTrayWorld(ctx, width, height, state, plan);
    else if (painterKind === 'biology') paintBiologyWorld(ctx, width, height, state, plan);
    else if (painterKind === 'acoustic') paintAcousticWorld(ctx, width, height, state, plan);
    else paintMechanicalWorld(ctx, width, height, state, plan);
    drawVisualIRProgram(ctx, width, height, state, plan);
    drawSceneCinematicFinish(ctx, width, height, state, plan, sceneKind, painterKind);
    drawSolverChannelContours(ctx, width, height, state, plan, sceneKind);
  }

  function isExpandedSceneKind(sceneKind = '') {
    return /^(weather-atmosphere|ocean-cryosphere|grid-energy|robotics-control|manufacturing-line|quantum-instrument|particle-instrument|molecular-biology|advanced-energy|digital-network|civic-market|chemistry-lab|cultural-material|planetary-space|venue-crowd|sport-motion|structural-mechanics|clinical-control|evolution-ecology|restoration-water|hazard-atmosphere|agro-waste-loop|space-instrument)$/.test(String(sceneKind || ''));
  }

  function paintExpandedSceneWorld(ctx, width, height, state, plan, sceneKind) {
    const family = expandedSceneFamily(sceneKind);
    const hue = fineSceneHue(sceneKind, painterKindForScene(sceneKind));
    const seed = expandedSceneSeed(plan, sceneKind);
    drawExpandedBackdrop(ctx, width, height, state, sceneKind, family, hue, seed);
    if (drawExpandedSpecificScene(ctx, width, height, state, hue, seed, sceneKind)) {
      drawExpandedEntityMarks(ctx, width, height, state, plan, hue, seed, family);
      return;
    }
    if (family === 'instrument') drawExpandedInstrumentScene(ctx, width, height, state, hue, seed);
    else if (family === 'orbit') drawExpandedOrbitalScene(ctx, width, height, state, hue, seed);
    else if (family === 'network') drawExpandedNetworkScene(ctx, width, height, state, hue, seed, sceneKind);
    else if (family === 'molecular') drawExpandedMolecularScene(ctx, width, height, state, hue, seed);
    else if (family === 'terrain') drawExpandedTerrainScene(ctx, width, height, state, hue, seed, sceneKind);
    else if (family === 'ecology') drawExpandedEcologyScene(ctx, width, height, state, hue, seed);
    else if (family === 'motion') drawExpandedMotionScene(ctx, width, height, state, hue, seed);
    else drawExpandedLabScene(ctx, width, height, state, hue, seed, sceneKind);
    drawExpandedEntityMarks(ctx, width, height, state, plan, hue, seed, family);
  }

  function drawExpandedSpecificScene(ctx, width, height, state, hue, seed, sceneKind) {
    if (sceneKind === 'weather-atmosphere') return drawExpandedWeatherScene(ctx, width, height, state, hue, seed);
    if (sceneKind === 'ocean-cryosphere') return drawExpandedOceanCryosphereScene(ctx, width, height, state, hue, seed);
    if (sceneKind === 'grid-energy') return drawExpandedGridEnergyScene(ctx, width, height, state, hue, seed);
    if (sceneKind === 'robotics-control') return drawExpandedRoboticsScene(ctx, width, height, state, hue, seed);
    if (sceneKind === 'manufacturing-line') return drawExpandedManufacturingScene(ctx, width, height, state, hue, seed);
    if (sceneKind === 'quantum-instrument') return drawExpandedQuantumScene(ctx, width, height, state, hue, seed);
    if (sceneKind === 'agro-waste-loop') return drawExpandedAgroWasteScene(ctx, width, height, state, hue, seed);
    return false;
  }

  function expandedSceneFamily(sceneKind = '') {
    const scene = String(sceneKind || '').toLowerCase();
    if (/particle|instrument|space-instrument/.test(scene)) return 'instrument';
    if (/quantum/.test(scene)) return 'instrument';
    if (/planetary/.test(scene)) return 'orbit';
    if (/digital|civic|venue|grid/.test(scene)) return 'network';
    if (/molecular/.test(scene)) return 'molecular';
    if (/restoration|hazard|agro|weather|ocean/.test(scene)) return 'terrain';
    if (/evolution|clinical/.test(scene)) return 'ecology';
    if (/sport|structural|robotics|manufacturing/.test(scene)) return 'motion';
    return 'lab';
  }

  function expandedSceneSeed(plan, sceneKind) {
    return localVisualSeed([
      sceneKind,
      plan && plan.intentText,
      plan && plan.provenance && plan.provenance.signature,
      plan && plan.visualGenome && plan.visualGenome.id,
    ].filter(Boolean).join('|'));
  }

  function drawExpandedBackdrop(ctx, width, height, state, sceneKind, family, hue, seed) {
    ctx.save();
    const dark = family === 'orbit' || family === 'instrument';
    const top = dark ? `hsl(${hue}, 36%, 12%)` : `hsl(${hue}, 34%, 20%)`;
    const mid = family === 'network' ? '#ecf7f4' : dark ? `hsl(${hue + 18}, 30%, 22%)` : '#f5fbf7';
    const bottom = family === 'terrain' || family === 'ecology' ? '#f8fff5' : '#fffdf7';
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.5, mid);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    drawCanvasTexture(ctx, width, height, hue);
    ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
    ctx.strokeStyle = `hsla(${hue + 42}, 52%, ${dark ? 74 : 28}%, ${dark ? 0.11 : 0.08})`;
    ctx.lineWidth = 1;
    const spacing = Math.max(30, Math.min(width, height) / (family === 'network' ? 10 : 14));
    for (let i = -2; i < 18; i += 1) {
      const offset = hashNoise(seed, i + 13) * spacing;
      ctx.beginPath();
      ctx.moveTo(-spacing, height * 0.14 + i * spacing * 0.52 + offset * 0.1);
      ctx.lineTo(width + spacing, height * 0.08 + i * spacing * 0.48 - offset * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawExpandedWeatherScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const coreX = width * (0.52 + (hashNoise(seed, 12) - 0.5) * 0.12);
    const coreY = height * 0.36;
    const cloud = ctx.createRadialGradient(coreX, coreY, height * 0.04, coreX, coreY, height * 0.38);
    cloud.addColorStop(0, 'rgba(255,255,255,0.54)');
    cloud.addColorStop(0.48, `hsla(${hue + 160}, 74%, 62%, 0.22)`);
    cloud.addColorStop(1, 'rgba(20,28,40,0)');
    ctx.fillStyle = cloud;
    ctx.fillRect(0, 0, width, height * 0.72);
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 12; band += 1) {
      const y = height * (0.18 + band * 0.045);
      ctx.strokeStyle = `hsla(${hue + 170 + band * 7}, 86%, 68%, ${0.14 + band * 0.006})`;
      ctx.lineWidth = 1.2 + band * 0.1;
      ctx.beginPath();
      for (let step = 0; step <= 42; step += 1) {
        const x = width * (step / 42);
        const yy = y + Math.sin(step * 0.46 + band + state.t * 0.06) * height * 0.018;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (let hail = 0; hail < 36; hail += 1) {
      const x = width * (0.16 + hashNoise(seed, hail + 41) * 0.68);
      const y = height * (0.34 + hashNoise(seed, hail + 61) * 0.42);
      ctx.fillStyle = `hsla(${hue + 190}, 92%, 82%, ${0.18 + hashNoise(seed, hail + 83) * 0.18})`;
      ctx.beginPath();
      ctx.arc(x + Math.sin(state.t * 0.12 + hail) * 8, y, 1.5 + hashNoise(seed, hail + 97) * 3.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    return true;
  }

  function drawExpandedOceanCryosphereScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const water = ctx.createLinearGradient(0, height * 0.24, 0, height);
    water.addColorStop(0, 'rgba(208,244,255,0.28)');
    water.addColorStop(0.42, 'rgba(22,142,188,0.32)');
    water.addColorStop(1, 'rgba(6,45,84,0.34)');
    ctx.fillStyle = water;
    ctx.fillRect(0, height * 0.26, width, height * 0.74);
    for (let wave = 0; wave < 11; wave += 1) {
      ctx.strokeStyle = `hsla(${188 + wave * 5}, 88%, ${58 + wave}%, ${0.14 + wave * 0.006})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let step = 0; step <= 54; step += 1) {
        const x = width * step / 54;
        const y = height * (0.36 + wave * 0.047) + Math.sin(step * 0.5 + state.t * 0.07 + wave) * height * 0.016;
        if (!step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'screen';
    for (let shelf = 0; shelf < 7; shelf += 1) {
      const x = width * (0.12 + shelf * 0.12 + hashNoise(seed, shelf) * 0.03);
      const top = height * (0.22 + hashNoise(seed, shelf + 19) * 0.08);
      ctx.fillStyle = `hsla(${198 + shelf * 6}, 84%, 84%, 0.5)`;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + width * 0.09, top + height * 0.02);
      ctx.lineTo(x + width * 0.06, top + height * (0.22 + hashNoise(seed, shelf + 31) * 0.08));
      ctx.lineTo(x - width * 0.02, top + height * 0.16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return true;
  }

  function drawExpandedGridEnergyScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const grid = ctx.createLinearGradient(0, 0, width, height);
    grid.addColorStop(0, 'rgba(255,252,220,0.22)');
    grid.addColorStop(1, 'rgba(20,34,42,0.16)');
    ctx.fillStyle = grid;
    ctx.fillRect(0, 0, width, height);
    const nodes = [
      [0.18, 0.34, 34, 'substation'],
      [0.42, 0.24, 24, 'inverter'],
      [0.68, 0.44, 30, 'transformer'],
      [0.35, 0.66, 22, 'battery'],
      [0.76, 0.7, 20, 'load'],
    ];
    ctx.lineWidth = 4;
    for (let i = 1; i < nodes.length; i += 1) {
      const from = nodes[i - 1];
      const to = nodes[i];
      const pulse = Math.sin(state.t * 0.11 + i) * 0.5 + 0.5;
      ctx.strokeStyle = `hsla(${48 + i * 12}, 96%, ${42 + pulse * 18}%, 0.38)`;
      ctx.beginPath();
      ctx.moveTo(from[0] * width, from[1] * height);
      ctx.bezierCurveTo(width * 0.5, height * (0.18 + i * 0.09), width * 0.5, height * (0.4 + i * 0.04), to[0] * width, to[1] * height);
      ctx.stroke();
    }
    nodes.forEach((node, index) => {
      const x = node[0] * width;
      const y = node[1] * height;
      const r = node[2] + Math.sin(state.t * 0.08 + index) * 3;
      ctx.fillStyle = `hsla(${44 + index * 28}, 92%, 56%, 0.5)`;
      ctx.strokeStyle = `hsla(${hue + index * 24}, 82%, 20%, 0.58)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(x - r, y - r * 0.64, r * 2, r * 1.28);
      ctx.fill();
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 9; band += 1) {
      ctx.strokeStyle = `hsla(${48 + band * 12}, 98%, 62%, 0.12)`;
      ctx.beginPath();
      ctx.moveTo(width * 0.1, height * (0.15 + band * 0.085));
      ctx.lineTo(width * 0.92, height * (0.2 + band * 0.07 + Math.sin(state.t * 0.06 + band) * 0.02));
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawExpandedRoboticsScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(240,247,252,0.36)';
    ctx.fillRect(width * 0.08, height * 0.62, width * 0.84, height * 0.1);
    ctx.strokeStyle = `hsla(${hue + 160}, 60%, 24%, 0.54)`;
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i += 1) {
      const x = width * (0.12 + i * 0.07 + (state.t * 0.002 % 0.07));
      ctx.beginPath();
      ctx.moveTo(x, height * 0.62);
      ctx.lineTo(x - width * 0.03, height * 0.72);
      ctx.stroke();
    }
    const base = { x: width * 0.32, y: height * 0.56 };
    const elbow = { x: width * (0.48 + Math.sin(state.t * 0.05) * 0.05), y: height * 0.36 };
    const hand = { x: width * (0.66 + Math.cos(state.t * 0.06) * 0.05), y: height * 0.5 };
    ctx.lineCap = 'round';
    ctx.strokeStyle = `hsla(${hue + 180}, 86%, 46%, 0.72)`;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `hsla(${hue + 32}, 96%, 62%, 0.42)`;
    [base, elbow, hand].forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 20 + index * 2, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
    return true;
  }

  function drawExpandedManufacturingScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,248,236,0.38)';
    ctx.fillRect(0, height * 0.6, width, height * 0.18);
    ctx.fillStyle = `hsla(${hue + 12}, 48%, 26%, 0.28)`;
    ctx.fillRect(width * 0.16, height * 0.28, width * 0.28, height * 0.28);
    ctx.fillRect(width * 0.56, height * 0.34, width * 0.22, height * 0.2);
    ctx.strokeStyle = `hsla(${hue + 176}, 82%, 52%, 0.38)`;
    ctx.lineWidth = 2;
    for (let pass = 0; pass < 12; pass += 1) {
      const x = width * (0.1 + pass * 0.075);
      ctx.beginPath();
      ctx.moveTo(x, height * 0.62);
      ctx.lineTo(x + Math.sin(state.t * 0.08 + pass) * 9, height * 0.75);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'screen';
    for (let jet = 0; jet < 16; jet += 1) {
      const x = width * (0.18 + jet * 0.04);
      ctx.strokeStyle = `hsla(${190 + jet * 4}, 84%, 64%, 0.15)`;
      ctx.beginPath();
      ctx.moveTo(x, height * 0.2);
      ctx.quadraticCurveTo(x + Math.sin(state.t * 0.05 + jet) * 16, height * 0.44, x + width * 0.04, height * 0.67);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawExpandedQuantumScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(5,8,20,0.62)';
    ctx.fillRect(width * 0.12, height * 0.16, width * 0.76, height * 0.68);
    ctx.globalCompositeOperation = 'screen';
    const cx = width * 0.5;
    const cy = height * 0.5;
    for (let ring = 0; ring < 10; ring += 1) {
      ctx.strokeStyle = `hsla(${260 + ring * 11}, 92%, ${58 + ring}%, ${0.16 + ring * 0.012})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * (0.08 + ring * 0.032), height * (0.024 + ring * 0.018), ring * 0.2 + state.t * 0.01, 0, TAU);
      ctx.stroke();
    }
    for (let trace = 0; trace < 14; trace += 1) {
      const y = height * (0.25 + trace * 0.038);
      ctx.strokeStyle = `hsla(${hue + trace * 13}, 96%, 70%, 0.18)`;
      ctx.beginPath();
      ctx.moveTo(width * 0.18, y);
      ctx.lineTo(width * 0.34, y);
      ctx.lineTo(width * 0.34, y + height * 0.03);
      ctx.lineTo(width * 0.8, y + height * 0.03 + Math.sin(state.t * 0.05 + trace) * 4);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawExpandedAgroWasteScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let row = 0; row < 8; row += 1) {
      ctx.fillStyle = `hsla(${92 + row * 8}, 54%, ${38 + row}%, 0.18)`;
      ctx.fillRect(width * 0.08, height * (0.3 + row * 0.055), width * 0.84, height * 0.026);
    }
    ctx.globalCompositeOperation = 'screen';
    const center = { x: width * 0.28, y: height * 0.62 };
    const loop = { x: width * 0.62, y: height * 0.46 };
    ctx.strokeStyle = `hsla(${hue + 42}, 82%, 52%, 0.34)`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(loop.x, loop.y, width * 0.22, height * 0.16, -0.14, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(249,115,22,0.32)';
    ctx.beginPath();
    ctx.arc(center.x, center.y, height * 0.085, 0, TAU);
    ctx.fill();
    for (let plume = 0; plume < 18; plume += 1) {
      ctx.strokeStyle = `hsla(${34 + plume * 4}, 86%, 62%, 0.14)`;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - height * 0.05);
      ctx.quadraticCurveTo(center.x + Math.sin(plume + state.t * 0.04) * width * 0.12, height * 0.4 - plume * 2, loop.x, loop.y);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawExpandedInstrumentScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    const cx = width * 0.5;
    const cy = height * 0.52;
    const rx = width * 0.3;
    const ry = height * 0.26;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `hsla(${hue + 178}, 70%, 66%, 0.1)`;
    ctx.strokeStyle = `hsla(${hue + 194}, 82%, 74%, 0.38)`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 28; i += 1) {
      const a = i * TAU / 28;
      const x = cx + Math.cos(a) * rx * 0.86;
      const y = cy + Math.sin(a) * ry * 0.86;
      ctx.fillStyle = `hsla(${hue + i * 9}, 92%, 72%, 0.42)`;
      ctx.beginPath();
      ctx.arc(x, y, 3 + hashNoise(seed, i) * 4, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'screen';
    for (let ray = 0; ray < 6; ray += 1) {
      const x = width * (0.2 + hashNoise(seed, ray + 31) * 0.6);
      ctx.strokeStyle = `hsla(${hue + 72 + ray * 12}, 92%, 70%, 0.2)`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, height * 0.16);
      ctx.lineTo(cx + Math.sin(state.t * 0.04 + ray) * width * 0.08, cy);
      ctx.lineTo(width * (0.24 + hashNoise(seed, ray + 47) * 0.52), height * 0.86);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawExpandedOrbitalScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    const cx = width * 0.52;
    const cy = height * 0.46;
    ctx.globalCompositeOperation = 'screen';
    for (let star = 0; star < 70; star += 1) {
      const x = width * hashNoise(seed, star + 11);
      const y = height * hashNoise(seed, star + 107);
      ctx.fillStyle = `hsla(${hue + star}, 88%, 82%, ${0.08 + hashNoise(seed, star + 211) * 0.16})`;
      ctx.fillRect(x, y, 1.1, 1.1);
    }
    ctx.strokeStyle = `hsla(${hue + 28}, 84%, 70%, 0.3)`;
    ctx.lineWidth = 2;
    for (let ring = 0; ring < 8; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * (0.16 + ring * 0.035), height * (0.035 + ring * 0.01), -0.18, 0, TAU);
      ctx.stroke();
    }
    const moonX = cx + Math.cos(state.t * 0.015) * width * 0.26;
    const moonY = cy + Math.sin(state.t * 0.015) * height * 0.07;
    ctx.fillStyle = `hsla(${hue + 96}, 64%, 62%, 0.78)`;
    ctx.beginPath();
    ctx.arc(moonX, moonY, Math.min(width, height) * 0.035, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawExpandedNetworkScene(ctx, width, height, state, hue, seed, sceneKind) {
    ctx.save();
    const civic = /civic|venue/.test(sceneKind);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `hsla(${hue}, 48%, 28%, 0.16)`;
    ctx.lineWidth = 1.2;
    for (let row = 0; row < 6; row += 1) {
      const y = height * (0.2 + row * 0.105);
      ctx.beginPath();
      ctx.moveTo(width * 0.1, y);
      ctx.lineTo(width * 0.9, y + Math.sin(row + state.t * 0.03) * height * 0.015);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i += 1) {
      const x = width * (0.14 + (i % 6) * 0.14);
      const y = height * (0.24 + Math.floor(i / 6) * 0.18);
      const heat = hashNoise(seed, i + 17);
      ctx.fillStyle = civic ? `hsla(${38 + heat * 44}, 74%, 50%, 0.34)` : `hsla(${hue + heat * 80}, 74%, 42%, 0.34)`;
      ctx.strokeStyle = `hsla(${hue + 32}, 60%, 22%, 0.36)`;
      ctx.fillRect(x - 15, y - 10, 30, 20);
      ctx.strokeRect(x - 15, y - 10, 30, 20);
      if (i % 6) {
        ctx.strokeStyle = `hsla(${hue + 108}, 80%, 48%, 0.18)`;
        ctx.beginPath();
        ctx.moveTo(x - width * 0.14 + 15, y);
        ctx.lineTo(x - 15, y + Math.sin(state.t * 0.08 + i) * 5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawExpandedMolecularScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `hsla(${hue + 44}, 80%, 64%, 0.18)`;
    for (let band = 0; band < 9; band += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 42; step += 1) {
        const x = width * (0.1 + step / 42 * 0.78);
        const y = height * (0.22 + band * 0.06) + Math.sin(step * 0.28 + band) * height * 0.018;
        if (!step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = `hsla(${hue + 90}, 76%, 46%, 0.48)`;
    ctx.beginPath();
    for (let bead = 0; bead < 15; bead += 1) {
      const x = width * (0.18 + bead * 0.046);
      const y = height * (0.54 + Math.sin(bead * 0.82 + state.t * 0.03) * 0.12);
      if (!bead) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let bead = 0; bead < 15; bead += 1) {
      const x = width * (0.18 + bead * 0.046);
      const y = height * (0.54 + Math.sin(bead * 0.82 + state.t * 0.03) * 0.12);
      ctx.fillStyle = `hsla(${hue + bead * 17}, 82%, 58%, 0.68)`;
      ctx.beginPath();
      ctx.arc(x, y, 4 + hashNoise(seed, bead) * 6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawExpandedTerrainScene(ctx, width, height, state, hue, seed, sceneKind) {
    ctx.save();
    const water = /restoration|agro/.test(sceneKind);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = water ? 'rgba(74, 145, 130, 0.18)' : 'rgba(122, 112, 92, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.72);
    for (let step = 0; step <= 28; step += 1) {
      const x = width * step / 28;
      const y = height * (0.66 + Math.sin(step * 0.54 + seed * 0.0001) * 0.045);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'screen';
    for (let front = 0; front < 7; front += 1) {
      ctx.strokeStyle = `hsla(${hue + front * 16}, 78%, 55%, 0.14)`;
      ctx.beginPath();
      const base = height * (0.2 + front * 0.08);
      for (let step = 0; step <= 38; step += 1) {
        const x = width * (0.08 + step / 38 * 0.84);
        const y = base + Math.sin(step * 0.42 + state.t * 0.04 + front) * height * 0.02;
        if (!step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawExpandedEcologyScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let layer = 0; layer < 4; layer += 1) {
      ctx.fillStyle = `hsla(${96 + layer * 22}, 48%, ${34 + layer * 9}%, ${0.1 + layer * 0.035})`;
      ctx.fillRect(0, height * (0.42 + layer * 0.09), width, height * 0.12);
    }
    ctx.globalCompositeOperation = 'screen';
    for (let organism = 0; organism < 34; organism += 1) {
      const x = width * (0.08 + hashNoise(seed, organism + 5) * 0.84);
      const y = height * (0.36 + hashNoise(seed, organism + 41) * 0.44);
      const r = 2.5 + hashNoise(seed, organism + 83) * 6;
      ctx.fillStyle = `hsla(${hue + organism * 13}, 70%, 54%, 0.24)`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.4, r, Math.sin(state.t * 0.04 + organism), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawExpandedMotionScene(ctx, width, height, state, hue, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const y = height * 0.56;
    ctx.strokeStyle = `hsla(${hue + 10}, 44%, 22%, 0.48)`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(width * 0.12, y);
    ctx.bezierCurveTo(width * 0.32, y - height * 0.08, width * 0.66, y + height * 0.08, width * 0.88, y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'screen';
    for (let v = 0; v < 12; v += 1) {
      const x = width * (0.2 + v * 0.052);
      ctx.strokeStyle = `hsla(${hue + 68}, 82%, 58%, ${0.1 + hashNoise(seed, v) * 0.1})`;
      ctx.beginPath();
      ctx.arc(x, y - height * 0.08 + Math.sin(state.t * 0.08 + v) * 10, 12 + v * 1.8, -0.9, 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawExpandedLabScene(ctx, width, height, state, hue, seed, sceneKind) {
    ctx.save();
    const advanced = /advanced/.test(sceneKind);
    ctx.globalCompositeOperation = 'source-over';
    const cx = width * 0.52;
    const cy = height * 0.5;
    ctx.fillStyle = advanced ? 'rgba(58, 70, 88, 0.22)' : 'rgba(255, 255, 255, 0.24)';
    ctx.strokeStyle = `hsla(${hue + 120}, 58%, 34%, 0.42)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(cx - width * 0.22, cy - height * 0.22, width * 0.44, height * 0.42);
    ctx.fill();
    ctx.stroke();
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 8; band += 1) {
      const y = cy - height * 0.14 + band * height * 0.04;
      ctx.strokeStyle = `hsla(${hue + band * 18}, 86%, 58%, 0.2)`;
      ctx.beginPath();
      ctx.moveTo(cx - width * 0.18, y);
      ctx.bezierCurveTo(cx - width * 0.06, y + Math.sin(state.t * 0.05 + band) * 14, cx + width * 0.08, y - 10, cx + width * 0.18, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawExpandedEntityMarks(ctx, width, height, state, plan, hue, seed, family) {
    const entities = plan && plan.visualIR && plan.visualIR.entities || [];
    if (!entities.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    entities.slice(0, 10).forEach((entity, index) => {
      const point = visualIREntityPoint(entity, width, height, index);
      const radius = Math.min(width, height) * (0.012 + hashNoise(seed, index + 71) * 0.018);
      ctx.fillStyle = `hsla(${hue + index * 29}, 74%, 48%, ${family === 'orbit' ? 0.72 : 0.42})`;
      ctx.strokeStyle = `hsla(${hue + index * 29 + 40}, 72%, 24%, 0.38)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (family === 'network') ctx.rect(point.x - radius, point.y - radius * 0.75, radius * 2, radius * 1.5);
      else ctx.arc(point.x, point.y, radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawVisualIRProgram(ctx, width, height, state, plan) {
    const visualIR = plan && plan.visualIR;
    if (!visualIR || visualIR.schema !== 'simulatte.visualIR.v1') return;
    ctx.save();
    drawVisualIRCameraField(ctx, width, height, state, visualIR);
    drawVisualIRMaterialPass(ctx, width, height, state, visualIR);
    drawVisualIRFieldPass(ctx, width, height, state, visualIR);
    drawVisualIRGeometryPass(ctx, width, height, state, visualIR);
    drawVisualIRProcessPass(ctx, width, height, state, visualIR);
    drawVisualIRReceiptMarks(ctx, width, height, state, visualIR);
    ctx.restore();
  }

  function drawVisualIRCameraField(ctx, width, height, state, visualIR) {
    const camera = visualIR.camera || {};
    const lighting = visualIR.lighting || {};
    const hue = finiteVisualNumber(lighting.keyHue, fineSceneHue(visualIR.sceneKind, visualIR.painterKind));
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    if (/cutaway|micro/.test(camera.mode || '')) {
      ctx.strokeStyle = `hsla(${hue}, 42%, 28%, 0.16)`;
      ctx.lineWidth = 1.2;
      for (let slice = 0; slice < 7; slice += 1) {
        const x = width * (0.14 + slice * 0.11);
        ctx.beginPath();
        ctx.moveTo(x, height * 0.16);
        ctx.lineTo(x + Math.sin(state.t * 0.03 + slice) * width * 0.018, height * 0.86);
        ctx.stroke();
      }
    } else if (/map|topographic/.test(camera.mode || '')) {
      ctx.strokeStyle = `hsla(${hue}, 38%, 30%, 0.11)`;
      ctx.lineWidth = 1;
      for (let band = 0; band < 9; band += 1) {
        ctx.beginPath();
        for (let step = 0; step <= 42; step += 1) {
          const x = width * (0.06 + step / 42 * 0.88);
          const y = height * (0.18 + band * 0.075) + Math.sin(step * 0.48 + band) * height * 0.015;
          if (!step) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (/orbital/.test(camera.mode || '')) {
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `hsla(${hue}, 70%, 62%, 0.14)`;
      for (let ring = 0; ring < 6; ring += 1) {
        ctx.beginPath();
        ctx.ellipse(width * 0.58, height * 0.38, width * (0.12 + ring * 0.05), height * (0.035 + ring * 0.018), -0.24, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawVisualIRMaterialPass(ctx, width, height, state, visualIR) {
    const materials = (visualIR.materials || []).slice(0, 8);
    if (!materials.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    materials.forEach((material, index) => {
      const hue = materialHueFromColor(material.fill, index);
      const alpha = Math.min(0.16, 0.035 + finiteVisualNumber(material.opacity, 0.5) * 0.08);
      if (/thermal|emissive|heat/.test(material.shader || material.family || '')) {
        drawVisualIRThermalMaterial(ctx, width, height, state, hue, alpha, index);
      } else if (/fluid|ripple|volume/.test(material.shader || material.family || '')) {
        drawVisualIRFluidMaterial(ctx, width, height, state, hue, alpha, index);
      } else if (/caustic|transparent/.test(material.shader || material.family || '')) {
        drawVisualIRCausticMaterial(ctx, width, height, state, hue, alpha, index);
      } else if (/metal|charged|electric/.test(material.shader || material.family || '')) {
        drawVisualIRTraceMaterial(ctx, width, height, state, hue, alpha, index);
      } else if (/biological|cellular|fibrous/.test(material.shader || material.family || '')) {
        drawVisualIRCellMaterial(ctx, width, height, state, hue, alpha, index);
      } else {
        drawVisualIRParticleMaterial(ctx, width, height, state, hue, alpha, index);
      }
    });
    ctx.restore();
  }

  function drawVisualIRFieldPass(ctx, width, height, state, visualIR) {
    const fields = (visualIR.fields || []).slice(0, 8);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    fields.forEach((field, index) => {
      const hue = visualIRHue(visualIR, index * 31);
      const encoding = String(field.visualEncoding || field.kind || '');
      if (/node-link|network/.test(encoding)) drawVisualIRNetworkField(ctx, width, height, state, hue, field, index);
      else if (/ray|caustic|optical/.test(encoding)) drawVisualIRRayField(ctx, width, height, state, hue, field, index);
      else if (/heat|isoband|thermal/.test(encoding)) drawVisualIRHeatField(ctx, width, height, state, hue, field, index);
      else if (/topographic|stream/.test(encoding)) drawVisualIRStreamField(ctx, width, height, state, hue, field, index);
      else drawVisualIRFluxField(ctx, width, height, state, hue, field, index);
    });
    ctx.restore();
  }

  function drawVisualIRGeometryPass(ctx, width, height, state, visualIR) {
    const entities = visualIREntityMap(visualIR);
    const rows = (visualIR.geometry || []).slice(0, 18);
    ctx.save();
    rows.forEach((row, index) => {
      const entity = entities.get(row.entityId) || {};
      const hue = visualIRHue(visualIR, index * 19);
      if (row.primitive === 'node-link-agent') drawVisualIRAgentNodes(ctx, width, height, state, hue, entity, index);
      else if (row.primitive === 'volume-ribbon') drawVisualIRVolumeRibbon(ctx, width, height, state, hue, entity, index);
      else if (row.primitive === 'sectioned-surface') drawVisualIRSectionSurface(ctx, width, height, state, hue, entity, index);
      else if (row.primitive === 'instrument-glyph') drawVisualIRInstrument(ctx, width, height, state, hue, entity, index);
      else if (row.primitive === 'organic-silhouette') drawVisualIROrganic(ctx, width, height, state, hue, entity, index);
      else if (row.primitive === 'orbital-body') drawVisualIROrbitalBody(ctx, width, height, state, hue, entity, index);
      else if (row.primitive === 'field-sheet') drawVisualIRFluxField(ctx, width, height, state, hue, row, index);
      else drawVisualIRSectionSurface(ctx, width, height, state, hue, entity, index);
    });
    ctx.restore();
  }

  function drawVisualIRProcessPass(ctx, width, height, state, visualIR) {
    const motions = visualIR.motion || [];
    const processes = visualIR.processes || [];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    processes.slice(0, 10).forEach((process, index) => {
      const motion = motions[index] || {};
      const hue = visualIRHue(visualIR, index * 43);
      const op = String(process.operator || '');
      if (/routing|agent/.test(op)) drawVisualIRRoutingMotion(ctx, width, height, state, hue, motion, index);
      else if (/orbit|wave/.test(op)) drawVisualIRWaveMotion(ctx, width, height, state, hue, motion, index);
      else if (/growth/.test(op)) drawVisualIRGrowthMotion(ctx, width, height, state, hue, motion, index);
      else if (/constraint|impulse/.test(op)) drawVisualIRImpulseMotion(ctx, width, height, state, hue, motion, index);
      else if (/thermal|front/.test(op)) drawVisualIRThermalMotion(ctx, width, height, state, hue, motion, index);
      else drawVisualIRParticleMotion(ctx, width, height, state, hue, motion, index);
    });
    ctx.restore();
  }

  function drawVisualIRReceiptMarks(ctx, width, height, state, visualIR) {
    const receipts = visualIR.receipts || [];
    if (!receipts.length) return;
    const hue = visualIRHue(visualIR, 137);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `hsla(${hue}, 68%, 42%, 0.2)`;
    receipts.slice(0, 6).forEach((receipt, index) => {
      const x = width * (0.075 + index * 0.028);
      const y = height * 0.92;
      const h = Math.max(5, Math.min(26, Number(receipt.count || 1) * 2.2));
      ctx.fillRect(x, y - h, width * 0.012, h);
    });
    ctx.restore();
  }

  function drawSceneCinematicFinish(ctx, width, height, state, plan, sceneKind, painterKind) {
    const hue = fineSceneHue(sceneKind, painterKind);
    const pulse = 0.5 + 0.5 * Math.sin((state.t || 0) * 0.42 + hue * 0.013);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, `hsla(${hue}, 88%, 72%, 0.18)`);
    wash.addColorStop(0.46, 'rgba(255, 255, 255, 0.04)');
    wash.addColorStop(1, `hsla(${(hue + 94) % 360}, 76%, 54%, 0.14)`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'screen';
    const beam = ctx.createLinearGradient(width * 0.08, height * 0.04, width * 0.82, height * 0.86);
    beam.addColorStop(0, `hsla(${(hue + 18) % 360}, 90%, 82%, ${0.18 + pulse * 0.05})`);
    beam.addColorStop(0.34, 'rgba(255, 255, 255, 0.03)');
    beam.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(width * 0.04, 0);
    ctx.lineTo(width * 0.46, 0);
    ctx.lineTo(width * 0.92, height);
    ctx.lineTo(width * 0.56, height);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `hsla(${hue}, 70%, 28%, 0.09)`;
    ctx.lineWidth = 1;
    const horizon = height * 0.72;
    for (let i = 0; i < 9; i += 1) {
      const y = horizon + i * height * 0.026;
      ctx.beginPath();
      ctx.moveTo(width * 0.08 - i * width * 0.016, y);
      ctx.quadraticCurveTo(width * 0.5, y - height * 0.035, width * 0.94 + i * width * 0.012, y);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'screen';
    const signature = String(plan && plan.provenance && plan.provenance.signature || sceneKind || '');
    for (let i = 0; i < 18; i += 1) {
      const seed = localVisualSeed(`${signature}:cinematic:${i}`);
      const x = width * (0.08 + 0.84 * hashNoise(seed, 17));
      const y = height * (0.08 + 0.72 * hashNoise(seed, 31));
      const r = 1.5 + hashNoise(seed, 47) * 5.5;
      ctx.fillStyle = `hsla(${(hue + i * 19) % 360}, 95%, 76%, ${0.06 + hashNoise(seed, 59) * 0.1})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'multiply';
    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.48, Math.min(width, height) * 0.22, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(18,24,28,0.18)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function fineSceneHue(sceneKind, painterKind) {
    const scene = String(sceneKind || painterKind || '').toLowerCase();
    if (/chemistry|energy|material|cultural/.test(scene)) return 28;
    if (/space|planetary|instrument|optics/.test(scene)) return 216;
    if (/digital|civic|venue|city/.test(scene)) return 172;
    if (/clinical|biology|ecology|agro|restoration/.test(scene)) return 118;
    if (/hazard|thermal|fire/.test(scene)) return 12;
    if (/sport|mechanical/.test(scene)) return 202;
    if (/acoustic/.test(scene)) return 286;
    if (/watershed/.test(scene)) return 184;
    return 44;
  }

  function localVisualSeed(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function visualIRHue(visualIR, salt = 0) {
    const lighting = visualIR && visualIR.lighting || {};
    const base = finiteVisualNumber(lighting.keyHue, fineSceneHue(visualIR.sceneKind, visualIR.painterKind));
    return normalizeVisualHue(base + salt);
  }

  function materialHueFromColor(value, index = 0) {
    const text = String(value || '');
    const hex = text.match(/#([0-9a-f]{6})/i);
    if (hex) {
      const r = Number.parseInt(hex[1].slice(0, 2), 16) / 255;
      const g = Number.parseInt(hex[1].slice(2, 4), 16) / 255;
      const b = Number.parseInt(hex[1].slice(4, 6), 16) / 255;
      return normalizeVisualHue(rgbHue(r, g, b));
    }
    return normalizeVisualHue(localVisualSeed(`${text}:${index}`) % 360);
  }

  function rgbHue(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (!delta) return 0;
    if (max === r) return 60 * (((g - b) / delta) % 6);
    if (max === g) return 60 * ((b - r) / delta + 2);
    return 60 * ((r - g) / delta + 4);
  }

  function visualIREntityMap(visualIR) {
    return new Map((visualIR.entities || []).map((entity) => [entity.id, entity]));
  }

  function visualIREntityPoint(entity, width, height, index = 0) {
    const pose = entity && entity.pose || {};
    if (Number.isFinite(Number(pose.x)) && Number.isFinite(Number(pose.y))) {
      return { x: Number(pose.x) * width, y: Number(pose.y) * height };
    }
    if (Array.isArray(pose.points) && pose.points.length) {
      const point = pose.points[Math.min(index, pose.points.length - 1)];
      return { x: point[0] * width, y: point[1] * height };
    }
    const seed = localVisualSeed(`${entity && entity.id || 'entity'}:${index}`);
    return {
      x: width * (0.16 + hashNoise(seed, 11) * 0.68),
      y: height * (0.18 + hashNoise(seed, 17) * 0.62),
    };
  }

  function drawVisualIRThermalMaterial(ctx, width, height, state, hue, alpha, index) {
    for (let i = 0; i < 42; i += 1) {
      const seed = localVisualSeed(`thermal:${hue}:${index}:${i}`);
      const x = width * (0.12 + hashNoise(seed, 3) * 0.76);
      const y = height * (0.24 + hashNoise(seed, 5) * 0.58 - Math.sin(state.t * 0.05 + i) * 0.03);
      ctx.fillStyle = `hsla(${normalizeVisualHue(hue + i * 5)}, 94%, 58%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + hashNoise(seed, 7) * 4.6, 0, TAU);
      ctx.fill();
    }
  }

  function drawVisualIRFluidMaterial(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 72%, 46%, ${alpha})`;
    ctx.lineWidth = 1.2;
    for (let band = 0; band < 8; band += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 34; step += 1) {
        const x = width * (0.08 + step / 34 * 0.84);
        const y = height * (0.28 + band * 0.062) + Math.sin(step * 0.48 + state.t * 0.13 + band + index) * height * 0.018;
        if (!step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawVisualIRCausticMaterial(ctx, width, height, state, hue, alpha, index) {
    ctx.lineWidth = 1;
    for (let ray = 0; ray < 12; ray += 1) {
      const y = height * (0.16 + ray * 0.06);
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + ray * 21)}, 94%, 68%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(width * 0.08, y);
      ctx.quadraticCurveTo(width * 0.46, y + Math.sin(state.t * 0.08 + ray + index) * 22, width * 0.9, height * 0.48);
      ctx.stroke();
    }
  }

  function drawVisualIRTraceMaterial(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 72%, 42%, ${alpha})`;
    ctx.lineWidth = 1.1;
    for (let trace = 0; trace < 10; trace += 1) {
      const y = height * (0.18 + trace * 0.07);
      ctx.beginPath();
      ctx.moveTo(width * 0.12, y);
      ctx.lineTo(width * 0.32, y);
      ctx.lineTo(width * 0.32, y + height * 0.035);
      ctx.lineTo(width * (0.78 + Math.sin(state.t * 0.04 + trace + index) * 0.04), y + height * 0.035);
      ctx.stroke();
    }
  }

  function drawVisualIRCellMaterial(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 64%, 36%, ${alpha})`;
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 54)}, 78%, 62%, ${alpha * 0.38})`;
    for (let cell = 0; cell < 34; cell += 1) {
      const seed = localVisualSeed(`cell:${hue}:${index}:${cell}`);
      const x = width * (0.12 + hashNoise(seed, 11) * 0.76);
      const y = height * (0.18 + hashNoise(seed, 13) * 0.66);
      const r = 4 + hashNoise(seed, 17) * 8;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.4, r * (0.65 + Math.sin(state.t * 0.04 + cell) * 0.08), hashNoise(seed, 19) * TAU, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawVisualIRParticleMaterial(ctx, width, height, state, hue, alpha, index) {
    ctx.fillStyle = `hsla(${hue}, 56%, 42%, ${alpha})`;
    for (let dot = 0; dot < 60; dot += 1) {
      const seed = localVisualSeed(`particle:${hue}:${index}:${dot}`);
      const x = width * (0.08 + hashNoise(seed, 23) * 0.84);
      const y = height * (0.18 + hashNoise(seed, 29) * 0.66);
      const s = 1.2 + hashNoise(seed, 31) * 3.6;
      ctx.fillRect(x, y, s, s);
    }
  }

  function drawVisualIRNetworkField(ctx, width, height, state, hue, field, index) {
    ctx.strokeStyle = `hsla(${hue}, 68%, 42%, ${0.08 + field.strength * 0.09})`;
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 70)}, 82%, 58%, 0.18)`;
    for (let row = 0; row < 6; row += 1) {
      const y = height * (0.2 + row * 0.1);
      ctx.beginPath();
      ctx.moveTo(width * 0.12, y);
      ctx.lineTo(width * 0.88, y + Math.sin(state.t * 0.07 + row + index) * height * 0.018);
      ctx.stroke();
      for (let node = 0; node < 7; node += 1) {
        const phase = (state.t * 0.025 + node * 0.11 + row * 0.07) % 1;
        const x = width * (0.15 + node * 0.115 + phase * 0.014);
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }

  function drawVisualIRRayField(ctx, width, height, state, hue, field, index) {
    const geometry = field.geometry || {};
    const from = geometry.from || [0.1, 0.28];
    const to = geometry.to || [0.86, 0.54];
    for (let ray = 0; ray < 10; ray += 1) {
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + ray * 18)}, 94%, 66%, ${0.08 + field.strength * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(from[0] * width, (from[1] + ray * 0.026) * height);
      ctx.quadraticCurveTo(width * 0.48, height * (0.36 + Math.sin(state.t * 0.06 + ray + index) * 0.04), to[0] * width, (to[1] + (ray - 5) * 0.022) * height);
      ctx.stroke();
    }
  }

  function drawVisualIRHeatField(ctx, width, height, state, hue, field, index) {
    const geometry = field.geometry || {};
    const center = geometry.center || [0.52, 0.56];
    const radius = finiteVisualNumber(geometry.radius, 0.34);
    for (let ring = 0; ring < 8; ring += 1) {
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + ring * 8)}, 92%, 58%, ${0.08 + field.strength * 0.05 - ring * 0.004})`;
      ctx.beginPath();
      ctx.ellipse(center[0] * width, center[1] * height, width * radius * (0.22 + ring * 0.1), height * radius * (0.1 + ring * 0.05), 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawVisualIRStreamField(ctx, width, height, state, hue, field, index) {
    ctx.strokeStyle = `hsla(${hue}, 72%, 44%, ${0.09 + field.strength * 0.08})`;
    ctx.lineWidth = 1.4;
    for (let stream = 0; stream < 9; stream += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 36; step += 1) {
        const x = width * (0.1 + step / 36 * 0.8);
        const y = height * (0.18 + stream * 0.072 + step * 0.011) + Math.sin(step * 0.5 + state.t * 0.09 + stream + index) * height * 0.018;
        if (!step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawVisualIRFluxField(ctx, width, height, state, hue, field, index) {
    const geometry = field.geometry || {};
    const center = geometry.center || [0.52, 0.5];
    for (let line = 0; line < 14; line += 1) {
      const angle = line / 14 * TAU + state.t * 0.02;
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + line * 9)}, 72%, 52%, ${0.07 + field.strength * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(center[0] * width, center[1] * height, width * (0.08 + line * 0.012), height * (0.035 + line * 0.006), angle, 0, TAU);
      ctx.stroke();
    }
  }

  function drawVisualIRAgentNodes(ctx, width, height, state, hue, entity, index) {
    const point = visualIREntityPoint(entity, width, height, index);
    ctx.fillStyle = `hsla(${hue}, 72%, 46%, 0.24)`;
    for (let i = 0; i < 12; i += 1) {
      const a = i / 12 * TAU;
      const r = Math.min(width, height) * (0.025 + (i % 4) * 0.012);
      ctx.fillRect(point.x + Math.cos(a) * r - 3, point.y + Math.sin(a) * r - 3, 6, 6);
    }
  }

  function drawVisualIRVolumeRibbon(ctx, width, height, state, hue, entity, index) {
    const point = visualIREntityPoint(entity, width, height, index);
    ctx.strokeStyle = `hsla(${hue}, 76%, 54%, 0.16)`;
    ctx.lineWidth = 3;
    for (let band = 0; band < 5; band += 1) {
      ctx.beginPath();
      ctx.moveTo(point.x - width * 0.18, point.y + band * height * 0.02);
      ctx.bezierCurveTo(point.x - width * 0.05, point.y - height * 0.08, point.x + width * 0.08, point.y + height * 0.08, point.x + width * 0.22, point.y);
      ctx.stroke();
    }
  }

  function drawVisualIRSectionSurface(ctx, width, height, state, hue, entity, index) {
    const point = visualIREntityPoint(entity, width, height, index);
    ctx.fillStyle = `hsla(${hue}, 24%, 34%, 0.14)`;
    ctx.strokeStyle = `hsla(${hue}, 34%, 22%, 0.26)`;
    const w = width * 0.12;
    const h = height * 0.18;
    ctx.fillRect(point.x - w * 0.5, point.y - h * 0.5, w, h);
    ctx.strokeRect(point.x - w * 0.5, point.y - h * 0.5, w, h);
    for (let row = 0; row < 4; row += 1) {
      ctx.beginPath();
      ctx.moveTo(point.x - w * 0.45, point.y - h * 0.3 + row * h * 0.2);
      ctx.lineTo(point.x + w * 0.45, point.y - h * 0.32 + row * h * 0.2);
      ctx.stroke();
    }
  }

  function drawVisualIRInstrument(ctx, width, height, state, hue, entity, index) {
    const point = visualIREntityPoint(entity, width, height, index);
    ctx.strokeStyle = `hsla(${hue}, 70%, 44%, 0.32)`;
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 66)}, 82%, 70%, 0.12)`;
    ctx.beginPath();
    ctx.rect(point.x - width * 0.035, point.y - height * 0.025, width * 0.07, height * 0.05);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(width * (0.55 + Math.sin(index) * 0.2), height * 0.42);
    ctx.stroke();
  }

  function drawVisualIROrganic(ctx, width, height, state, hue, entity, index) {
    const point = visualIREntityPoint(entity, width, height, index);
    ctx.strokeStyle = `hsla(${hue}, 62%, 34%, 0.24)`;
    for (let branch = 0; branch < 9; branch += 1) {
      const a = -Math.PI * 0.72 + branch * 0.18 + Math.sin(state.t * 0.05 + index) * 0.05;
      const len = height * (0.06 + (branch % 4) * 0.018);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.quadraticCurveTo(point.x + Math.cos(a) * len * 0.45, point.y + Math.sin(a) * len * 0.55, point.x + Math.cos(a) * len, point.y + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  function drawVisualIROrbitalBody(ctx, width, height, state, hue, entity, index) {
    const point = visualIREntityPoint(entity, width, height, index);
    ctx.strokeStyle = `hsla(${hue}, 74%, 64%, 0.2)`;
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 62)}, 82%, 68%, 0.18)`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5 + index % 5, 0, TAU);
    ctx.fill();
    for (let orbit = 0; orbit < 3; orbit += 1) {
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, width * (0.045 + orbit * 0.026), height * (0.015 + orbit * 0.01), state.t * 0.015 + orbit, 0, TAU);
      ctx.stroke();
    }
  }

  function drawVisualIRRoutingMotion(ctx, width, height, state, hue, motion, index) {
    ctx.fillStyle = `hsla(${hue}, 86%, 58%, 0.22)`;
    for (let i = 0; i < 24; i += 1) {
      const phase = (state.t * motion.speed * 0.08 + i / 24 + index * 0.07) % 1;
      const x = width * (0.12 + phase * 0.76);
      const y = height * (0.22 + (i % 6) * 0.09);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  function drawVisualIRWaveMotion(ctx, width, height, state, hue, motion, index) {
    ctx.strokeStyle = `hsla(${hue}, 82%, 62%, 0.18)`;
    for (let ring = 0; ring < 7; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(width * 0.54, height * 0.44, width * (0.06 + ring * 0.045), height * (0.02 + ring * 0.018), state.t * 0.03 + index, 0, TAU);
      ctx.stroke();
    }
  }

  function drawVisualIRGrowthMotion(ctx, width, height, state, hue, motion, index) {
    drawProcessGrowth(ctx, width, height, state, hue, 0.12, index);
  }

  function drawVisualIRImpulseMotion(ctx, width, height, state, hue, motion, index) {
    drawProcessFracture(ctx, width, height, state, hue, 0.11, index);
  }

  function drawVisualIRThermalMotion(ctx, width, height, state, hue, motion, index) {
    drawProcessBurnMelt(ctx, width, height, state, hue, 0.1, index);
  }

  function drawVisualIRParticleMotion(ctx, width, height, state, hue, motion, index) {
    drawVisualIRParticleMaterial(ctx, width, height, state, hue, 0.08, index);
  }

  function painterKindForScene(sceneKind = '') {
    const scene = String(sceneKind || '').toLowerCase();
    if (/chemistry-lab|advanced-energy|cultural-material/.test(scene)) return 'material-tray';
    if (/planetary-space|space-instrument/.test(scene)) return 'optics';
    if (/digital-network|civic-market|venue-crowd/.test(scene)) return 'city';
    if (/clinical-control|evolution-ecology|agro-waste-loop|restoration-water/.test(scene)) return 'biology';
    if (/hazard-atmosphere/.test(scene)) return 'watershed';
    if (/sport-motion/.test(scene)) return 'mechanical';
    if (scene === 'generic' || scene === 'literal-composite') return 'mechanical';
    return scene;
  }

  function drawSolverChannelContours(ctx, width, height, state, plan, sceneKind = '') {
    const channels = state && state.solverState && state.solverState.channels || state.channelValues || null;
    if (!channels || !Object.keys(channels).length) return;
    const heat = channelPeak(channels, /temperature|heat|reaction/i);
    const motion = channelPeak(channels, /velocity|angularVelocity|flowVelocity|torque|phase|amplitude/i);
    const damage = channelPeak(channels, /damage|stress|backlog|pressure/i);
    const matter = channelPeak(channels, /density|nutrient|liquidFraction|throughput/i);
    const intensity = clamp01(heat * 0.34 + motion * 0.28 + damage * 0.24 + matter * 0.18);
    if (intensity <= 0.015) return;
    const sceneHue = sceneHueForChannels(plan, sceneKind, heat, motion, damage, matter);
    const cell = Math.max(16, Math.min(width, height) / 31);
    const time = Number(state && state.t || 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let y = height * 0.08; y < height * 0.94; y += cell) {
      for (let x = width * 0.06; x < width * 0.96; x += cell) {
        const noise = Math.sin(x * 0.021 + y * 0.017 + time * (0.42 + motion * 0.18));
        const gate = (noise + Math.cos((x - y) * 0.011 + time * 0.31)) * 0.5;
        if (gate < -0.18) continue;
        const hue = (sceneHue + x * 0.028 + y * 0.019 + damage * 44) % 360;
        const alpha = clamp(0.018 + intensity * 0.09 + gate * 0.028, 0.012, 0.18);
        const size = cell * clamp(0.48 + heat * 0.18 + motion * 0.12 + gate * 0.08, 0.38, 0.78);
        ctx.fillStyle = `hsla(${hue}, ${58 + matter * 18}%, ${48 + heat * 12}%, ${alpha})`;
        ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
      }
    }
    ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.002);
    for (let band = 0; band < 9; band += 1) {
      const y = height * (0.16 + band * 0.085);
      const hue = (sceneHue + band * 17 + motion * 38) % 360;
      ctx.strokeStyle = `hsla(${hue}, 72%, ${56 + heat * 10}%, ${0.045 + intensity * 0.08})`;
      ctx.beginPath();
      for (let step = 0; step <= 56; step += 1) {
        const x = width * (0.05 + step / 62);
        const yy = y +
          Math.sin(step * 0.43 + time * (0.38 + motion * 0.24) + band) * cell * (0.22 + motion * 0.26) +
          Math.cos(step * 0.19 + damage * 4 + band) * cell * (0.08 + damage * 0.18);
        if (step === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `hsla(${(sceneHue + 150) % 360}, 62%, 28%, ${0.035 + damage * 0.08})`;
    ctx.lineWidth = 1;
    for (let band = 0; band < 6; band += 1) {
      const x = width * (0.12 + band * 0.15);
      ctx.beginPath();
      ctx.moveTo(x, height * 0.12);
      ctx.bezierCurveTo(
        x + Math.sin(time * 0.22 + band) * width * 0.05,
        height * 0.34,
        x - Math.cos(time * 0.18 + band) * width * 0.04,
        height * 0.68,
        x + Math.sin(band * 1.7) * width * 0.06,
        height * 0.9
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function channelPeak(channels, matcher) {
    let peak = 0;
    for (const [id, value] of Object.entries(channels || {})) {
      if (id === '__t' || !matcher.test(id)) continue;
      peak = Math.max(peak, channelMagnitude(value));
    }
    return clamp01(peak);
  }

  function channelMagnitude(value) {
    if (value && typeof value === 'object') {
      const x = Number(value.x || 0);
      const y = Number(value.y || 0);
      return Number.isFinite(x + y) ? Math.hypot(x, y) : 0;
    }
    const number = Number(value);
    return Number.isFinite(number) ? Math.abs(number) : 0;
  }

  function sceneHueForChannels(plan, sceneKind, heat, motion, damage, matter) {
    const signature = String(plan && plan.provenance && plan.provenance.signature || sceneKind || '').toLowerCase();
    if (/lava|fire|thermal|heat/.test(signature)) return 18 + heat * 22;
    if (/ice|glass|lens|prism|quartz/.test(signature)) return 192 + matter * 36;
    if (/storm|wave|bridge|acoustic/.test(signature)) return 210 + motion * 42;
    if (/market|queue|network|feedback/.test(signature)) return 154 + damage * 62;
    if (/rain|delta|basalt|terrain|water/.test(signature)) return 128 + matter * 26;
    if (/algae|wetland|growth/.test(signature)) return 112 + matter * 44;
    return 36 + heat * 26 + motion * 34 + damage * 48;
  }

  function sceneKindForPlan(plan) {
    const renderIRScene = nonGenericSceneKind(plan.renderIR && plan.renderIR.sceneHint);
    if (renderIRScene) return renderIRScene;
    const planned = plan.rendererPlan && plan.rendererPlan.sceneKind ||
      plan.provenance && plan.provenance.sceneKind ||
      plan.camera && plan.camera.sceneKind ||
      '';
    const plannedScene = nonGenericSceneKind(planned);
    if (plannedScene) return plannedScene;
    const irScene = sceneKindFromPlanSignals(plan);
    if (irScene) return irScene;
    if (planned) return planned;
    const signature = String(plan.provenance && plan.provenance.signature || '').toLowerCase();
    if (/flame|fuel|plume/.test(signature)) return 'fire';
    if (/lens|prism/.test(signature)) return 'optics';
    if (/queue|network/.test(signature)) return 'city';
    if (/heightfield|flow-path|grain-bed/.test(signature)) return 'watershed';
    if (/ferrofluid|coil|current/.test(signature)) return 'ferrofluid';
    if (/animal-body|wheel|collision/.test(signature)) return 'mechanical';
    if (/singularity|dark-matter|galaxy|lens/.test(signature)) return 'planetary-space';
    if (/wetland|mangrove|peatland|oyster|restoration/.test(signature)) return 'restoration-water';
    if (/hammer|prosthetic|robot|surgery|gait/.test(signature)) return 'clinical-control';
    if (/soap|film|bubble|wire/.test(signature)) return 'thin-film';
    if (/granular|sieve|avalanche|powder/.test(signature)) return 'granular';
    if (/cooling|thermal-plume|heat plume/.test(signature)) return 'thermal-plume';
    if (/wheel|magnet|slider/.test(signature)) return 'magnetic-machine';
    if (/sample|bar|pool|grain-bed/.test(signature)) return 'material-tray';
    if (/colony|membrane/.test(signature)) return 'biology';
    if (/acoustic|sound|wave|pressure|resonance/.test(signature)) return 'acoustic';
    return 'mechanical';
  }

  function nonGenericSceneKind(value) {
    const scene = String(value || '').trim();
    return scene && scene !== 'generic' && scene !== 'literal-composite' ? scene : '';
  }

  function sceneKindFromPlanSignals(plan = {}) {
    const renderIR = plan.renderIR || {};
    const solverPlan = plan.solverPlan || {};
    const text = [
      (renderIR.objects || []).map((object) => [
        object.label,
        object.glyph,
        object.materialId,
        object.visualRegime,
        object.domainKind,
        ...(object.domainTags || []),
        ...(object.operatorHints || []),
        Object.keys(object.stateBindings || {}).join(' '),
      ].join(' ')).join(' '),
      (renderIR.fields || []).map((field) => `${field.name} ${field.channel}`).join(' '),
      (solverPlan.executableSteps || solverPlan.steps || []).join(' '),
      (solverPlan.families || []).join(' '),
    ].join(' ').toLowerCase();
    if (/cyber|blockchain|mempool|recommendation|search|query|index|server|compiler|database|tensor|logic|packet|service graph/.test(text)) return 'digital-network';
    if (/housing|power market|carbon credit|supply demand|bullwhip|transit priority|dispatch|policy|audit ledger|market_network/.test(text)) return 'civic-market';
    if (/chemical clock|belousov|polymer|epoxy|crosslink|electroplat|catalyst|ammonia|electrolyzer|crystal nucleation|reaction dish/.test(text)) return 'chemistry-lab';
    if (/museum|archive|preservation|pigment|paint|varnish|ceramic glaze|canvas|conservation/.test(text)) return 'cultural-material';
    if (/radio telescope|deep space|microwave|beamforming|probe|antenna|planet|asteroid|mars|venus|europa|titan|interstellar|dark matter|galaxy cluster|comet/.test(text)) return 'planetary-space';
    if (/festival|stadium|restaurant|hotel|elevator|venue|crowd agents|fan agents|order queue/.test(text)) return 'venue-crowd';
    if (/skate|ski|surf|sailing|archery|fairground|mountain bike|rider agents/.test(text)) return 'sport-motion';
    if (/robot surgery|prosthetic|rehab|vaccine|hospital|clinical|patient|tissue mesh|sensor skin|muscle activation|bedflow/.test(text)) return 'clinical-control';
    if (/population genetics|allele|succession|predator|prey|pollinator|fish school|bird flock|animal trail|crop|greenhouse|algae bioreactor|compost|landfill|recycling/.test(text)) return 'evolution-ecology';
    if (/water treatment|peatland|oyster reef|desertification|restoration|rewetting|nitrification|living breakwater/.test(text)) return 'restoration-water';
    if (/earthquake|tsunami|hurricane|tornado|mine ventilation|tunnel boring|urban heat|noise pollution|light pollution|air quality|hazard/.test(text)) return 'hazard-atmosphere';
    if (/stellarator|fusion|nuclear waste|hydrogen|electrolyzer|plasma ribbon|geologic repository/.test(text)) return 'advanced-energy';
    if (/thin-film|thin film|soap|surface_tension|wire-loop|bubble/.test(text)) return 'thin-film';
    if (/tray|raw material|heat diffusion sample/.test(text)) return 'material-tray';
    if (/thermal plume|cooling|cooler|smoke over cooling/.test(text) && /thermal|heat|temperature/.test(text)) {
      return 'thermal-plume';
    }
    if (/process-fire|flame|combustion|fuel|burn/.test(text) && /heat_source|reaction_diffusion|burn/.test(text)) {
      return 'fire';
    }
    if (/lava|magma|volcano/.test(text)) return 'thermal-plume';
    if (/black-hole|singularity|spacecraft|rocket/.test(text)) return 'planetary-space';
    if (/swamp|wetland|submarine/.test(text)) return 'watershed';
    if (/hammer|gold/.test(text)) return 'mechanical';
    if (/piano/.test(text)) return 'acoustic';
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
    if (/rigid_collision|fracture_threshold|rotational_torque|projectile|collision/.test(text) &&
      !/acoustic|sound|wave_field|resonance|amplitude/.test(text)) {
      return 'mechanical';
    }
    if (/biology|growth|mycelium|bacteria|membrane|protein|nutrient|density/.test(text)) return 'biology';
    if (/acoustic|sound|wave_field|resonance|amplitude/.test(text)) return 'acoustic';
    if (/fluid|water|flowVelocity|advection/.test(text)) return 'watershed';
    if (/turbine/.test(text)) return 'mechanical';
    if (/ice|storm/.test(text)) return 'watershed';
    if (/instrument/.test(text)) return 'acoustic';
    return '';
  }

  function paintGenericWorld(ctx, width, height, state, plan) {
    drawPlanBackdrop(ctx, width, height, plan, state);
    drawPlanFields(ctx, width, height, state, plan);
    drawMaterialContinuumField(ctx, width, height, state, plan);
    drawPlanRelations(ctx, width, height, state, plan);
    drawPlanObjects(ctx, width, height, state, plan);
    drawPlanEmitters(ctx, width, height, state, plan);
  }

  function paintFireWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#2f211d', '#fff7ee', 24);
    drawHeatHaze(ctx, width, height, state, 0.54);
    drawFuelTerrain(ctx, width, height, state, plan);
    drawFireMoistureChannels(ctx, width, height, state, plan);
    drawFireFront(ctx, width, height, state, plan);
    drawSmokeColumn(ctx, width, height, state, plan);
    drawPlanEmitters(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.36);
  }

  function paintOpticsWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#17263a', '#f7fbff', 208);
    drawOpticalBenchRail(ctx, width, height, state);
    drawSpectralBeamTrace(ctx, width, height, state, plan);
    drawOpticalSurfaces(ctx, width, height, state, plan);
    drawOpticalCaustics(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.44);
  }

  function paintCityWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#162826', '#f7fbfc', 172);
    drawCityRouteGrid(ctx, width, height, state);
    drawNetworkField(ctx, width, height, state, plan);
    drawCityNodes(ctx, width, height, state, plan);
    drawCityFlowPulses(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.24);
  }

  function paintWatershedWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#27311f', '#f4fbff', 194);
    drawWatershedTerrain(ctx, width, height, state);
    drawWatershedRiver(ctx, width, height, state, plan);
    drawSedimentFan(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.46);
  }

  function paintMagneticMachineWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#171d32', '#f8fbfa', 278);
    drawMachineRotorField(ctx, width, height, state, plan);
    drawMachineSolarInput(ctx, width, height, state, plan);
    drawMachineBodies(ctx, width, height, state, plan);
    drawMachineEnergyPath(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.12);
  }

  function paintMaterialTrayWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#2e271d', '#fbfcfa', 42);
    drawMaterialTrayBase(ctx, width, height, state);
    drawMaterialSpecimens(ctx, width, height, state, plan);
    drawMaterialInteractionField(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.16);
  }

  function paintBiologyWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#173021', '#fbf9ff', 116);
    drawNutrientField(ctx, width, height, state);
    drawBiologicalBranches(ctx, width, height, state, plan);
    drawMembranePools(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.46);
  }

  function paintAcousticWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#172333', '#f7fbfb', 196);
    drawAcousticWaveguides(ctx, width, height, state);
    drawAcousticPressureFronts(ctx, width, height, state, plan);
    drawAcousticResonatorNodes(ctx, width, height, state, plan);
    drawMaterialContinuumField(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.42);
  }

  function paintFerrofluidWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#151b26', '#fbfaf7', 238);
    drawFerrofluidCoils(ctx, width, height, state, plan);
    drawFerrofluidSpikes(ctx, width, height, state, plan);
    drawFerrofluidDipoleDust(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.18);
  }

  function paintThinFilmWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#1b2133', '#fff9fb', 302);
    drawThinFilmFrame(ctx, width, height, state, plan);
    drawInterferenceFilm(ctx, width, height, state, plan);
    drawBubbleLenses(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.18);
  }

  function paintGranularWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#2f2419', '#f8fbf7', 38);
    drawGranularSieve(ctx, width, height, state, plan);
    drawGranularStreams(ctx, width, height, state, plan);
    drawGranularPile(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.24);
  }

  function paintThermalPlumeWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#30231e', '#f7fbff', 18);
    drawCoolingFins(ctx, width, height, state, plan);
    drawThermalPlumeColumn(ctx, width, height, state, plan);
    drawSmokeShearLines(ctx, width, height, state, plan);
    drawPlanObjectsWithAlpha(ctx, width, height, state, plan, 0.22);
  }

  function paintMechanicalWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#202837', '#fbf8ef', 206);
    drawMechanicalStage(ctx, width, height, state, plan);
    drawMechanicalImpulseField(ctx, width, height, state, plan);
    drawPlanObjects(ctx, width, height, state, plan);
  }

  function paintLiteralCompositeWorld(ctx, width, height, state, plan) {
    paintGenomeSceneBackground(ctx, width, height, state, plan, '#171523', '#f6fbf4', 148);
    drawCompositeEnvironment(ctx, width, height, state, plan);
    drawCompositeStressField(ctx, width, height, state, plan);
    drawPlanObjects(ctx, width, height, state, plan);
  }

  function drawMechanicalStage(ctx, width, height, state, plan) {
    const wall = firstObjectMatching(plan, /wall|surface-boundary|constraint/);
    const wallCenter = wall ? objectCenter(wall, width, height) : { x: width * 0.78, y: height * 0.56 };
    const floorY = height * 0.72;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const floor = ctx.createLinearGradient(0, floorY - height * 0.08, 0, height);
    floor.addColorStop(0, 'rgba(88, 78, 58, 0.08)');
    floor.addColorStop(1, 'rgba(58, 48, 36, 0.18)');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.moveTo(width * 0.08, floorY);
    ctx.lineTo(width * 0.92, floorY + Math.sin(state.t * 0.12) * 2);
    ctx.lineTo(width * 0.92, height * 0.88);
    ctx.lineTo(width * 0.08, height * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 58, 66, 0.32)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(width * 0.12, floorY);
    ctx.lineTo(width * 0.9, floorY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(78, 84, 92, 0.3)';
    ctx.strokeStyle = 'rgba(36, 42, 50, 0.48)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.rect(wallCenter.x - width * 0.025, wallCenter.y - height * 0.2, width * 0.05, height * 0.4);
    ctx.fill();
    ctx.stroke();
    for (let crack = 0; crack < 6; crack += 1) {
      const y = wallCenter.y - height * 0.13 + crack * height * 0.048;
      ctx.strokeStyle = `rgba(248, 236, 180, ${0.22 - crack * 0.018})`;
      ctx.beginPath();
      ctx.moveTo(wallCenter.x - width * 0.022, y);
      ctx.lineTo(wallCenter.x + Math.sin(state.t * 0.2 + crack) * 7, y + 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMechanicalImpulseField(ctx, width, height, state, plan) {
    const wheels = objectsMatching(plan, /wheel/).slice(0, 2);
    const impact = firstObjectMatching(plan, /collision|impact|crash/) || wheels[1] || null;
    const from = wheels[0] ? objectCenter(wheels[0], width, height) : { x: width * 0.42, y: height * 0.56 };
    const to = impact ? objectCenter(impact, width, height) : { x: width * 0.58, y: height * 0.52 };
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = -0.6 + ray * 0.1 + Math.sin(state.t * 0.7 + ray) * 0.02;
      const r = Math.min(width, height) * (0.05 + ray * 0.006);
      ctx.strokeStyle = `hsla(${34 + ray * 5}, 92%, 58%, ${0.16 - ray * 0.006})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x + Math.cos(angle) * r, to.y + Math.sin(angle) * r);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70, 112, 170, 0.18)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo((from.x + to.x) / 2, from.y - height * 0.08, to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawCompositeEnvironment(ctx, width, height, state, plan) {
    const wetland = firstObjectMatching(plan, /swamp|wetland/);
    const singularity = firstObjectMatching(plan, /black hole|singularity/);
    const wetCenter = wetland ? objectCenter(wetland, width, height) : { x: width * 0.46, y: height * 0.75 };
    const holeCenter = singularity ? objectCenter(singularity, width, height) : { x: width * 0.78, y: height * 0.32 };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const water = ctx.createLinearGradient(0, wetCenter.y - height * 0.08, 0, height);
    water.addColorStop(0, 'rgba(70, 128, 102, 0.08)');
    water.addColorStop(1, 'rgba(38, 74, 62, 0.24)');
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.ellipse(wetCenter.x, wetCenter.y, width * 0.32, height * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 112, 82, 0.32)';
    for (let reed = 0; reed < 28; reed += 1) {
      const x = wetCenter.x - width * 0.28 + reed * width * 0.02;
      const base = wetCenter.y + Math.sin(reed * 0.5) * height * 0.02;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x + Math.sin(state.t * 0.18 + reed) * 5, base - height * (0.08 + (reed % 4) * 0.01));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'screen';
    for (let ring = 0; ring < 6; ring += 1) {
      ctx.strokeStyle = `hsla(${256 + ring * 8}, 86%, 62%, ${0.18 - ring * 0.018})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(
        holeCenter.x,
        holeCenter.y,
        width * (0.08 + ring * 0.018),
        height * (0.028 + ring * 0.008),
        -0.28 + state.t * 0.04,
        0,
        TAU
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCompositeStressField(ctx, width, height, state, plan) {
    const hammer = firstObjectMatching(plan, /hammer/);
    const target = firstObjectMatching(plan, /glass|gold|bar|lens|fractur/);
    if (!hammer || !target) return;
    const a = objectCenter(hammer, width, height);
    const b = objectCenter(target, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(255, 226, 112, 0.34)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (let shard = 0; shard < 12; shard += 1) {
      const angle = shard * TAU / 12 + state.t * 0.03;
      const r = Math.min(width, height) * (0.025 + (shard % 4) * 0.008);
      ctx.strokeStyle = `hsla(${190 + shard * 9}, 86%, 68%, ${0.22 - shard * 0.008})`;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + Math.cos(angle) * r, b.y + Math.sin(angle) * r);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFerrofluidCoils(ctx, width, height, state, plan) {
    const coils = objectsMatching(plan, /coil|current|copper|conductor|magnet|field/).slice(0, 5);
    const anchors = coils.length
      ? coils.map((object) => objectCenter(object, width, height))
      : [
        { x: width * 0.28, y: height * 0.5 },
        { x: width * 0.5, y: height * 0.45 },
        { x: width * 0.72, y: height * 0.52 },
      ];
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    anchors.forEach((center, index) => {
      const radius = Math.min(width, height) * (0.045 + index * 0.007);
      for (let loop = 0; loop < 9; loop += 1) {
        ctx.strokeStyle = `hsla(${22 + loop * 3}, 82%, ${34 + loop * 2}%, ${0.22 - loop * 0.012})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(
          center.x,
          center.y,
          radius * (1.2 + loop * 0.08),
          radius * (0.48 + loop * 0.045),
          state.t * 0.06 + index * 0.5,
          0,
          TAU
        );
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(78, 54, 38, 0.34)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(center.x - radius * 1.5, center.y + radius * 1.05);
      ctx.lineTo(center.x + radius * 1.5, center.y + radius * 1.05);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawFerrofluidSpikes(ctx, width, height, state, plan) {
    const fluid = firstObjectMatching(plan, /ferrofluid/) || firstObjectWithShape(plan, /^pool$/);
    const center = fluid ? objectCenter(fluid, width, height) : { x: width * 0.5, y: height * 0.62 };
    const radius = Math.min(width, height) * 0.13;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const pool = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius * 1.35);
    pool.addColorStop(0, 'rgba(38, 48, 58, 0.28)');
    pool.addColorStop(0.65, 'rgba(38, 42, 54, 0.16)');
    pool.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + radius * 0.24, radius * 1.35, radius * 0.58, 0, 0, TAU);
    ctx.fill();
    for (let spike = 0; spike < 42; spike += 1) {
      const angle = spike * TAU / 42 + Math.sin(state.t * 0.28 + spike) * 0.03;
      const base = radius * (0.32 + hashNoise(301, spike) * 0.72);
      const length = radius * (0.32 + hashNoise(307, spike) * 0.64);
      const x = center.x + Math.cos(angle) * base;
      const y = center.y + Math.sin(angle) * base * 0.48;
      ctx.strokeStyle = `hsla(${218 + spike * 2}, 42%, ${22 + hashNoise(311, spike) * 12}%, 0.42)`;
      ctx.lineWidth = 1.2 + hashNoise(313, spike) * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length * 0.32, y - length * (0.58 + Math.sin(angle) * 0.18));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFerrofluidDipoleDust(ctx, width, height, state, plan) {
    const fluid = firstObjectMatching(plan, /ferrofluid/) || firstObjectWithShape(plan, /^pool$/);
    const center = fluid ? objectCenter(fluid, width, height) : { x: width * 0.5, y: height * 0.62 };
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 54; i += 1) {
      const orbit = i % 9;
      const phase = state.t * (0.05 + orbit * 0.006) + i * 0.71;
      const rx = width * (0.08 + orbit * 0.027);
      const ry = height * (0.04 + orbit * 0.016);
      const x = center.x + Math.cos(phase) * rx;
      const y = center.y + Math.sin(phase * 1.7) * ry;
      drawPrismaticParticle(ctx, x, y, 0.9 + orbit * 0.08, 258 + orbit * 9, 0.07, phase);
    }
    ctx.restore();
  }

  function drawThinFilmFrame(ctx, width, height, state, plan) {
    const film = firstObjectWithShape(plan, /^film$/) || firstObjectWithShape(plan, /^wire-loop$/) ||
      firstObjectMatching(plan, /film|wire|loop|membrane/) || (plan.objects || [])[0];
    const center = film ? objectCenter(film, width, height) : { x: width * 0.5, y: height * 0.48 };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(center.x, center.y);
    ctx.rotate(Math.sin(state.t * 0.08) * 0.04);
    const w = width * 0.48;
    const h = height * 0.42;
    ctx.strokeStyle = 'rgba(72, 84, 98, 0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawInterferenceFilm(ctx, width, height, state, plan) {
    const film = firstObjectWithShape(plan, /^film$/) || firstObjectWithShape(plan, /^wire-loop$/) ||
      firstObjectMatching(plan, /film|wire|loop|membrane/) || (plan.objects || [])[0];
    const center = film ? objectCenter(film, width, height) : { x: width * 0.5, y: height * 0.48 };
    const w = width * 0.48;
    const h = height * 0.42;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(center.x, center.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, TAU);
    ctx.clip();
    for (let band = 0; band < 22; band += 1) {
      const y = -h * 0.5 + band * h / 21;
      const hue = (206 + band * 19 + Math.sin(state.t * 0.12 + band) * 18) % 360;
      ctx.strokeStyle = `hsla(${hue}, 94%, 62%, ${0.13 + (band % 4) * 0.012})`;
      ctx.lineWidth = 3 + (band % 3);
      ctx.beginPath();
      for (let step = 0; step <= 28; step += 1) {
        const x = -w * 0.55 + step * w * 1.1 / 28;
        const yy = y + Math.sin(step * 0.72 + state.t * 0.55 + band) * h * 0.035;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBubbleLenses(ctx, width, height, state, plan) {
    const bubbles = (plan.objects || []).filter((object) => object.shape === 'bubble').slice(0, 9);
    const fallback = objectsMatching(plan, /bubble|air|foam|film|membrane/).slice(0, 5);
    const source = bubbles.length ? bubbles : fallback.length ? fallback : (plan.objects || []).slice(0, 5);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    source.forEach((object, index) => {
      const center = objectCenter(object, width, height);
      const r = Math.min(width, height) * (0.025 + hashNoise(337, index) * 0.052);
      const hue = 188 + index * 23;
      ctx.strokeStyle = `hsla(${hue}, 92%, 62%, 0.42)`;
      ctx.fillStyle = `hsla(${hue + 48}, 96%, 76%, 0.08)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(center.x + Math.sin(state.t * 0.1 + index) * 5, center.y, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawGranularSieve(ctx, width, height, state, plan) {
    const sieve = firstObjectMatching(plan, /sieve|grid|screen|constraint/);
    const center = sieve ? objectCenter(sieve, width, height) : { x: width * 0.5, y: height * 0.38 };
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(-0.12 + Math.sin(state.t * 0.18) * 0.03);
    ctx.strokeStyle = 'rgba(104, 82, 48, 0.3)';
    ctx.lineWidth = 1.4;
    const w = width * 0.52;
    const h = height * 0.09;
    ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
    for (let i = 1; i < 18; i += 1) {
      const x = -w * 0.5 + i * w / 18;
      ctx.beginPath();
      ctx.moveTo(x, -h * 0.5);
      ctx.lineTo(x + Math.sin(state.t * 0.8 + i) * 1.4, h * 0.5);
      ctx.stroke();
    }
    for (let row = 1; row < 4; row += 1) {
      const y = -h * 0.5 + row * h / 4;
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, y);
      ctx.lineTo(w * 0.5, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGranularStreams(ctx, width, height, state, plan) {
    const grains = objectsMatching(plan, /grain|bead|sand|powder|granular/);
    const count = grains.length ? 96 : 64;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < count; i += 1) {
      const lane = i % 9;
      const fall = (state.t * 0.055 + hashNoise(353, i)) % 1;
      const x = width * (0.28 + lane * 0.055) + Math.sin(state.t * 0.42 + i) * 6;
      const y = height * (0.25 + fall * 0.56);
      const hue = 34 + hashNoise(359, i) * 28;
      ctx.fillStyle = `hsla(${hue}, 58%, 38%, ${0.18 + hashNoise(367, i) * 0.16})`;
      ctx.beginPath();
      ctx.arc(x, y, 1 + hashNoise(373, i) * 2.1, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGranularPile(ctx, width, height, state, plan) {
    const pile = firstObjectMatching(plan, /pile|sand|grain|bead|powder|avalanche/);
    const center = pile ? objectCenter(pile, width, height) : { x: width * 0.53, y: height * 0.76 };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let layer = 0; layer < 12; layer += 1) {
      const w = width * (0.09 + layer * 0.028);
      const y = center.y + layer * 5;
      ctx.strokeStyle = `hsla(${38 + layer * 2}, 48%, ${34 + layer * 1.4}%, ${0.2 - layer * 0.009})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(center.x - w, y);
      ctx.quadraticCurveTo(center.x, y - height * (0.08 + layer * 0.005), center.x + w, y);
      ctx.stroke();
    }
    drawSedimentFan(ctx, width, height, state, plan);
    ctx.restore();
  }

  function drawCoolingFins(ctx, width, height, state, plan) {
    const finObject = firstObjectWithShape(plan, /^cooling-fins$/) || firstObjectMatching(plan, /cooling|fin|metal|conductor|sensor/);
    const center = finObject ? objectCenter(finObject, width, height) : { x: width * 0.5, y: height * 0.68 };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const finCount = 13;
    for (let i = 0; i < finCount; i += 1) {
      const x = center.x - width * 0.24 + i * width * 0.04;
      const h = height * (0.16 + hashNoise(383, i) * 0.08);
      const gradient = ctx.createLinearGradient(x, center.y - h, x, center.y + h * 0.2);
      gradient.addColorStop(0, 'rgba(188, 208, 218, 0.08)');
      gradient.addColorStop(1, 'rgba(78, 98, 110, 0.26)');
      ctx.fillStyle = gradient;
      ctx.strokeStyle = 'rgba(74, 92, 102, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x - width * 0.011, center.y - h + Math.sin(state.t * 0.2 + i) * 1.2, width * 0.022, h);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawThermalPlumeColumn(ctx, width, height, state, plan) {
    const source = firstObjectMatching(plan, /thermal plume|open-thermal-plume|plume/) ||
      firstObjectWithShape(plan, /^flow-path$/) ||
      firstObjectMatching(plan, /thermal|smoke|heat|cooling|fin/);
    const center = source ? objectCenter(source, width, height) : { x: width * 0.5, y: height * 0.62 };
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let column = 0; column < 24; column += 1) {
      const lane = (column - 12) / 12;
      const hue = 22 + hashNoise(397, column) * 34;
      ctx.strokeStyle = `hsla(${hue}, 88%, 56%, ${0.12 + hashNoise(401, column) * 0.08})`;
      ctx.lineWidth = 1.1 + hashNoise(409, column) * 2.2;
      ctx.beginPath();
      ctx.moveTo(center.x + lane * width * 0.11, center.y);
      ctx.bezierCurveTo(
        center.x + lane * width * 0.06 + Math.sin(state.t * 0.6 + column) * 18,
        center.y - height * 0.12,
        center.x - lane * width * 0.08 + Math.cos(state.t * 0.44 + column) * 24,
        center.y - height * 0.28,
        center.x + lane * width * 0.14,
        center.y - height * 0.5
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSmokeShearLines(ctx, width, height, state, plan) {
    const center = firstObjectMatching(plan, /smoke|plume|thermal/)
      ? objectCenter(firstObjectMatching(plan, /smoke|plume|thermal/), width, height)
      : { x: width * 0.5, y: height * 0.36 };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let band = 0; band < 13; band += 1) {
      const y = center.y - height * 0.18 + band * height * 0.033;
      ctx.strokeStyle = `hsla(${202 + band * 3}, 32%, 48%, ${0.1 - band * 0.004})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let step = 0; step <= 26; step += 1) {
        const x = width * (0.16 + step * 0.028);
        const yy = y + Math.sin(step * 0.8 + state.t * 0.35 + band) * 7;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintGenomeSceneBackground(ctx, width, height, state, plan, top, bottom, accentHue = 178) {
    const genome = visualGenomeForPlan(plan);
    const palette = genome.palette || {};
    const contrast = finiteVisualNumber(palette.contrast, 0.68);
    const lightness = finiteVisualNumber(palette.lightness, 0.52);
    const hue = finiteVisualNumber(palette.hue, accentHue);
    const accent = finiteVisualNumber(palette.accentHue, accentHue);
    const shadow = finiteVisualNumber(palette.shadowHue, accentHue + 188);
    const topColor = visualGenomeColor(shadow, 26 + contrast * 24, 13 + lightness * 13, 1);
    const bottomColor = visualGenomeColor(hue, 24 + contrast * 30, 86 + lightness * 8, 1);
    paintSceneBackground(ctx, width, height, topColor || top, bottomColor || bottom, accent);
    drawGenomeTexture(ctx, width, height, state, genome);
  }

  function visualGenomeForPlan(plan = {}) {
    const direct = plan.visualGenome ||
      plan.rendererPlan && plan.rendererPlan.visualGenome ||
      plan.provenance && plan.provenance.visualGenome;
    if (direct && direct.schema === 'simulatte.visualGenome.v1') return direct;
    const text = [
      plan.intentText,
      plan.name,
      plan.rendererPlan && plan.rendererPlan.sceneKind,
      plan.provenance && plan.provenance.signature,
    ].filter(Boolean).join('|');
    const seed = visualHash(text || 'simulatte-generic-world') || 1;
    const hue = Math.round(visualUnit(seed, 1) * 360);
    return {
      schema: 'simulatte.visualGenome.v1',
      id: `fallback_${seed.toString(36)}`,
      seed,
      palette: {
        hue,
        accentHue: normalizeVisualHue(hue + 136),
        shadowHue: normalizeVisualHue(hue + 212),
        contrast: 0.62,
        lightness: 0.52,
      },
      morphology: {
        layoutMode: 'field-map',
        textureKind: 'contour-hatch',
        strokeWeight: 1,
        grain: 0.34,
        bandCount: 8,
        particleDensity: 32,
        flowCurl: 0.42,
        objectScale: 1,
        fieldComplexity: 5,
        asymmetry: 0.32,
      },
      motifs: ['fallback-field'],
      visualDna: fallbackVisualDna(seed),
    };
  }

  function drawGenomeTexture(ctx, width, height, state, genome) {
    const morphology = genome.morphology || {};
    const mode = morphology.layoutMode || 'field-map';
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    if (mode === 'network') drawGenomeNetworkTexture(ctx, width, height, state, genome);
    else if (mode === 'section') drawGenomeSectionTexture(ctx, width, height, state, genome);
    else if (mode === 'radial') drawGenomeRadialTexture(ctx, width, height, state, genome);
    else if (mode === 'strata') drawGenomeStrataTexture(ctx, width, height, state, genome);
    else drawGenomeContourTexture(ctx, width, height, state, genome);
    drawVisualFingerprintTexture(ctx, width, height, state, genome);
    drawSemanticWorldLayers(ctx, width, height, state, genome);
    drawGenomeMotifMarks(ctx, width, height, state, genome);
    ctx.restore();
  }

  function drawSemanticWorldLayers(ctx, width, height, state, genome) {
    const semantic = semanticVisualPlanForGenome(genome);
    const archetypes = semanticRows(semantic, 'archetypes').slice(0, 6);
    const materials = semanticRows(semantic, 'materials').slice(0, 5);
    const processes = semanticRows(semantic, 'processes').slice(0, 5);
    if (!archetypes.length && !materials.length && !processes.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    archetypes.forEach((row, index) => drawSemanticArchetype(ctx, width, height, state, genome, row, index));
    materials.forEach((row, index) => drawSemanticMaterialShader(ctx, width, height, state, genome, row, index));
    processes.forEach((row, index) => drawSemanticProcessOverlay(ctx, width, height, state, genome, row, index));
    ctx.restore();
  }

  function semanticVisualPlanForGenome(genome) {
    const semantic = genome && genome.semanticVisuals;
    return semantic && semantic.schema === 'simulatte.semanticVisualPlan.v1'
      ? semantic
      : { archetypes: [], materials: [], processes: [], overlays: [] };
  }

  function semanticRows(semantic, key) {
    return semantic && Array.isArray(semantic[key]) ? semantic[key] : [];
  }

  function drawSemanticArchetype(ctx, width, height, state, genome, row, index) {
    const family = String(row.family || row.overlay || '');
    const hue = finiteVisualNumber(row.hue, genome.palette && genome.palette.accentHue || 180);
    const alpha = semanticAlpha(row, 0.035, 0.11);
    if (family === 'architecture') {
      drawSemanticArchitecture(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'hydrology') {
      drawSemanticHydrology(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'optics') {
      drawSemanticOptics(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'electromagnetism' || family === 'electronics') {
      drawSemanticCircuitFlux(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'biology' || family === 'ecology') {
      drawSemanticBiology(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'granular' || family === 'geology') {
      drawSemanticGranularGeology(ctx, width, height, state, hue, alpha, index, family);
    } else if (family === 'acoustics') {
      drawSemanticAcoustics(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'civic' || family === 'transport') {
      drawSemanticRoutes(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'astronomy' || family === 'aerospace') {
      drawSemanticOrbitSystem(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'weather' || family === 'thermal') {
      drawSemanticWeatherShear(ctx, width, height, state, hue, alpha, index);
    } else {
      drawSemanticMachineCutaway(ctx, width, height, state, hue, alpha, index);
    }
  }

  function drawSemanticMaterialShader(ctx, width, height, state, genome, row, index) {
    const family = String(row.family || row.shader || '');
    const hue = finiteVisualNumber(row.hue, genome.palette && genome.palette.hue || 180);
    const alpha = semanticAlpha(row, 0.026, 0.092);
    if (family === 'transparent' || family === 'ice') drawMaterialCausticShader(ctx, width, height, state, hue, alpha, index);
    else if (family === 'metal' || family === 'electric') drawMaterialMetalShader(ctx, width, height, state, hue, alpha, index);
    else if (family === 'biological' || family === 'organic') drawMaterialFibrousShader(ctx, width, height, state, hue, alpha, index);
    else if (family === 'fluid' || family === 'gel' || family === 'foam') drawMaterialFluidShader(ctx, width, height, state, hue, alpha, index);
    else if (family === 'thermal' || family === 'plasma') drawMaterialThermalShader(ctx, width, height, state, hue, alpha, index);
    else if (family === 'concrete' || family === 'mineral' || family === 'ceramic') {
      drawMaterialAggregateShader(ctx, width, height, state, hue, alpha, index);
    } else {
      drawMaterialParticleShader(ctx, width, height, state, hue, alpha, index);
    }
  }

  function drawSemanticProcessOverlay(ctx, width, height, state, genome, row, index) {
    const family = String(row.family || row.overlay || '');
    const hue = finiteVisualNumber(row.hue, genome.palette && genome.palette.accentHue || 180);
    const alpha = semanticAlpha(row, 0.038, 0.12);
    if (family === 'burn' || family === 'melt') drawProcessBurnMelt(ctx, width, height, state, hue, alpha, index);
    else if (family === 'flow' || family === 'erode' || family === 'pump' || family === 'leak') {
      drawProcessFlow(ctx, width, height, state, hue, alpha, index);
    } else if (family === 'growth') drawProcessGrowth(ctx, width, height, state, hue, alpha, index);
    else if (family === 'fracture' || family === 'collide') drawProcessFracture(ctx, width, height, state, hue, alpha, index);
    else if (family === 'queue' || family === 'sort') drawProcessQueue(ctx, width, height, state, hue, alpha, index);
    else if (family === 'focus') drawProcessFocus(ctx, width, height, state, hue, alpha, index);
    else if (family === 'levitate' || family === 'resonate') drawProcessLevitate(ctx, width, height, state, hue, alpha, index);
    else if (family === 'crystallize') drawProcessCrystallize(ctx, width, height, state, hue, alpha, index);
    else if (family === 'orbit' || family === 'rotate') drawProcessOrbit(ctx, width, height, state, hue, alpha, index);
    else drawProcessCharge(ctx, width, height, state, hue, alpha, index);
  }

  function semanticAlpha(row, base, max) {
    const score = finiteVisualNumber(row && row.score, 0.72);
    return Math.min(max, base + score * max * 0.72);
  }

  function drawSemanticArchitecture(ctx, width, height, state, hue, alpha, index) {
    const baseX = width * (0.12 + index * 0.055);
    const baseY = height * 0.72;
    ctx.strokeStyle = `hsla(${hue}, 28%, 18%, ${alpha})`;
    ctx.fillStyle = `hsla(${hue}, 18%, 36%, ${alpha * 0.36})`;
    for (let block = 0; block < 5; block += 1) {
      const w = width * (0.052 + block * 0.004);
      const h = height * (0.18 + ((block + index) % 3) * 0.055);
      const x = baseX + block * width * 0.064;
      ctx.fillRect(x, baseY - h, w, h);
      ctx.strokeRect(x, baseY - h, w, h);
      for (let row = 0; row < 4; row += 1) {
        for (let col = 0; col < 2; col += 1) {
          const glow = 0.22 + Math.sin(state.t * 0.08 + row + col + block) * 0.12;
          ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 44)}, 72%, 66%, ${alpha * glow})`;
          ctx.fillRect(x + w * (0.22 + col * 0.34), baseY - h + h * (0.2 + row * 0.17), w * 0.14, h * 0.06);
        }
      }
      ctx.fillStyle = `hsla(${hue}, 18%, 36%, ${alpha * 0.36})`;
    }
  }

  function drawSemanticHydrology(ctx, width, height, state, hue, alpha, index) {
    ctx.lineWidth = 2 + index * 0.35;
    for (let band = 0; band < 5; band += 1) {
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + band * 8)}, 70%, 45%, ${alpha * (0.7 + band * 0.08)})`;
      ctx.beginPath();
      for (let step = 0; step <= 38; step += 1) {
        const x = width * (0.06 + step / 38 * 0.88);
        const y = height * (0.34 + band * 0.052 + index * 0.018) +
          Math.sin(step * 0.42 + state.t * 0.14 + band) * height * 0.025;
        if (!step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawSemanticOptics(ctx, width, height, state, hue, alpha, index) {
    const focusX = width * (0.62 + index * 0.035);
    const focusY = height * (0.42 + Math.sin(state.t * 0.05 + index) * 0.04);
    ctx.lineWidth = 1.4;
    for (let ray = 0; ray < 9; ray += 1) {
      const y = height * (0.22 + ray * 0.055);
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + ray * 19)}, 88%, 62%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(width * 0.08, y);
      ctx.quadraticCurveTo(width * 0.36, y + Math.sin(ray + state.t * 0.08) * 12, focusX, focusY);
      ctx.lineTo(width * 0.9, focusY + (ray - 4) * height * 0.028);
      ctx.stroke();
    }
  }

  function drawSemanticCircuitFlux(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 70%, 38%, ${alpha})`;
    ctx.lineWidth = 1.2;
    for (let trace = 0; trace < 8; trace += 1) {
      const y = height * (0.18 + trace * 0.08);
      const x0 = width * (0.14 + index * 0.028);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(width * 0.32, y);
      ctx.lineTo(width * 0.32, y + height * 0.036);
      ctx.lineTo(width * (0.72 + Math.sin(trace + state.t * 0.05) * 0.03), y + height * 0.036);
      ctx.stroke();
      ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 72)}, 84%, 58%, ${alpha * 0.72})`;
      ctx.beginPath();
      ctx.arc(width * 0.32, y + height * 0.036, 2.2 + trace % 3, 0, TAU);
      ctx.fill();
    }
  }

  function drawSemanticBiology(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 62%, 34%, ${alpha})`;
    ctx.lineWidth = 1.4;
    const rootX = width * (0.28 + index * 0.08);
    const rootY = height * 0.72;
    for (let branch = 0; branch < 11; branch += 1) {
      const angle = -Math.PI * (0.22 + branch * 0.045) + Math.sin(state.t * 0.04 + branch) * 0.08;
      const len = height * (0.12 + (branch % 4) * 0.025);
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.bezierCurveTo(
        rootX + Math.cos(angle) * len * 0.45,
        rootY + Math.sin(angle) * len * 0.45,
        rootX + Math.cos(angle) * len * 0.74,
        rootY + Math.sin(angle) * len * 0.86,
        rootX + Math.cos(angle) * len,
        rootY + Math.sin(angle) * len
      );
      ctx.stroke();
    }
  }

  function drawSemanticGranularGeology(ctx, width, height, state, hue, alpha, index, family) {
    ctx.fillStyle = `hsla(${hue}, 54%, 42%, ${alpha})`;
    const count = family === 'geology' ? 24 : 52;
    for (let i = 0; i < count; i += 1) {
      const x = width * (0.12 + visualUnit(`${hue}:${index}:${i}`, 1) * 0.76);
      const y = height * (0.42 + visualUnit(`${hue}:${index}:${i}`, 2) * 0.38);
      const size = family === 'geology' ? 4 + (i % 5) * 2.2 : 1.8 + (i % 4);
      ctx.beginPath();
      if (family === 'geology') {
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
      } else {
        ctx.arc(x + Math.sin(state.t * 0.08 + i) * 2, y, size, 0, TAU);
      }
      ctx.fill();
    }
  }

  function drawSemanticAcoustics(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 70%, 44%, ${alpha})`;
    ctx.lineWidth = 1.2;
    const cx = width * (0.42 + index * 0.06);
    const cy = height * 0.5;
    for (let ring = 0; ring < 9; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * (0.05 + ring * 0.035), height * (0.025 + ring * 0.018), 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawSemanticRoutes(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 58%, 32%, ${alpha})`;
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 70)}, 74%, 48%, ${alpha})`;
    ctx.lineWidth = 1.1;
    for (let row = 0; row < 5; row += 1) {
      const y = height * (0.22 + row * 0.12);
      ctx.beginPath();
      ctx.moveTo(width * 0.12, y);
      ctx.lineTo(width * 0.86, y + Math.sin(state.t * 0.04 + row + index) * height * 0.012);
      ctx.stroke();
      for (let node = 0; node < 6; node += 1) {
        const x = width * (0.16 + node * 0.13);
        ctx.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
      }
    }
  }

  function drawSemanticOrbitSystem(ctx, width, height, state, hue, alpha, index) {
    const cx = width * (0.58 + index * 0.035);
    const cy = height * 0.36;
    ctx.strokeStyle = `hsla(${hue}, 66%, 46%, ${alpha})`;
    ctx.lineWidth = 1.2;
    for (let ring = 0; ring < 5; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * (0.12 + ring * 0.045), height * (0.034 + ring * 0.018), ring * 0.26, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 76)}, 88%, 64%, ${alpha * 1.3})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(state.t * 0.12 + index) * width * 0.18, cy + Math.sin(state.t * 0.12 + index) * height * 0.05, 4, 0, TAU);
    ctx.fill();
  }

  function drawSemanticWeatherShear(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 50%, 36%, ${alpha})`;
    ctx.lineWidth = 1.3;
    for (let band = 0; band < 9; band += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 30; step += 1) {
        const x = width * (0.08 + step / 30 * 0.84);
        const y = height * (0.18 + band * 0.06) + Math.sin(step * 0.55 + state.t * 0.09 + band) * height * 0.018;
        if (!step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawSemanticMachineCutaway(ctx, width, height, state, hue, alpha, index) {
    const cx = width * (0.44 + index * 0.05);
    const cy = height * 0.55;
    ctx.strokeStyle = `hsla(${hue}, 42%, 28%, ${alpha})`;
    ctx.lineWidth = 1.5;
    for (let gear = 0; gear < 4; gear += 1) {
      const r = Math.min(width, height) * (0.035 + gear * 0.01);
      const x = cx + gear * width * 0.07;
      ctx.beginPath();
      for (let tooth = 0; tooth < 16; tooth += 1) {
        const a = tooth / 16 * TAU + state.t * 0.04 * (gear % 2 ? -1 : 1);
        const rr = r * (tooth % 2 ? 1 : 1.18);
        const px = x + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (!tooth) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  function drawMaterialCausticShader(ctx, width, height, state, hue, alpha, index) {
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 1.1;
    for (let rib = 0; rib < 10; rib += 1) {
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + rib * 22)}, 92%, 68%, ${alpha})`;
      ctx.beginPath();
      const y = height * (0.18 + rib * 0.058);
      for (let step = 0; step <= 28; step += 1) {
        const x = width * (0.12 + step / 28 * 0.76);
        const yy = y + Math.sin(step * 0.72 + state.t * 0.08 + rib + index) * height * 0.018;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawMaterialMetalShader(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 34%, 34%, ${alpha})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i += 1) {
      const x = width * (0.1 + i * 0.046);
      const y = height * (0.2 + ((i + index) % 9) * 0.07);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width * 0.08, y - height * 0.044 + Math.sin(state.t * 0.05 + i) * 3);
      ctx.stroke();
    }
  }

  function drawMaterialFibrousShader(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 58%, 35%, ${alpha})`;
    ctx.lineWidth = 0.9;
    for (let strand = 0; strand < 36; strand += 1) {
      const x = width * (0.12 + visualUnit(`${hue}:fiber:${index}:${strand}`, 1) * 0.76);
      const y = height * (0.24 + visualUnit(`${hue}:fiber:${index}:${strand}`, 2) * 0.52);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + Math.sin(strand) * width * 0.018,
        y - height * 0.026,
        x + Math.cos(strand) * width * 0.03,
        y - height * 0.06,
        x + Math.sin(state.t * 0.04 + strand) * width * 0.032,
        y - height * 0.096
      );
      ctx.stroke();
    }
  }

  function drawMaterialFluidShader(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 72%, 42%, ${alpha})`;
    ctx.lineWidth = 1.1;
    for (let ring = 0; ring < 18; ring += 1) {
      const x = width * (0.14 + visualUnit(`${hue}:fluid:${index}:${ring}`, 1) * 0.72);
      const y = height * (0.22 + visualUnit(`${hue}:fluid:${index}:${ring}`, 2) * 0.55);
      const r = Math.min(width, height) * (0.01 + (ring % 4) * 0.006);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.7, r * (0.7 + Math.sin(state.t * 0.08 + ring) * 0.12), 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawMaterialThermalShader(ctx, width, height, state, hue, alpha, index) {
    ctx.globalCompositeOperation = 'screen';
    for (let ember = 0; ember < 38; ember += 1) {
      const x = width * (0.12 + visualUnit(`${hue}:heat:${index}:${ember}`, 1) * 0.76);
      const y = height * (0.28 + visualUnit(`${hue}:heat:${index}:${ember}`, 2) * 0.52) -
        Math.sin(state.t * 0.08 + ember) * height * 0.018;
      const r = 1.4 + ember % 5;
      ctx.fillStyle = `hsla(${normalizeVisualHue(hue + ember * 4)}, 94%, 58%, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawMaterialAggregateShader(ctx, width, height, state, hue, alpha, index) {
    ctx.fillStyle = `hsla(${hue}, 20%, 35%, ${alpha})`;
    for (let chip = 0; chip < 70; chip += 1) {
      const x = width * (0.08 + visualUnit(`${hue}:aggregate:${index}:${chip}`, 1) * 0.84);
      const y = height * (0.18 + visualUnit(`${hue}:aggregate:${index}:${chip}`, 2) * 0.66);
      const r = 1.5 + visualUnit(`${hue}:aggregate:${index}:${chip}`, 3) * 4.5;
      ctx.beginPath();
      ctx.rect(x - r * 0.5, y - r * 0.35, r, r * 0.7);
      ctx.fill();
    }
  }

  function drawMaterialParticleShader(ctx, width, height, state, hue, alpha, index) {
    ctx.fillStyle = `hsla(${hue}, 58%, 42%, ${alpha})`;
    for (let dot = 0; dot < 56; dot += 1) {
      const x = width * (0.12 + visualUnit(`${hue}:particle:${index}:${dot}`, 1) * 0.76);
      const y = height * (0.22 + visualUnit(`${hue}:particle:${index}:${dot}`, 2) * 0.56);
      ctx.fillRect(x, y, 1.5 + dot % 3, 1.5 + dot % 3);
    }
  }

  function drawProcessBurnMelt(ctx, width, height, state, hue, alpha, index) {
    ctx.globalCompositeOperation = 'screen';
    for (let flame = 0; flame < 8; flame += 1) {
      const x = width * (0.2 + flame * 0.075 + index * 0.018);
      const base = height * 0.72;
      const h = height * (0.08 + (flame % 4) * 0.024);
      ctx.fillStyle = `hsla(${normalizeVisualHue(hue + flame * 8)}, 96%, 58%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x - width * 0.015, base);
      ctx.bezierCurveTo(x - width * 0.01, base - h * 0.5, x + Math.sin(state.t * 0.12 + flame) * width * 0.025, base - h, x, base - h * 1.22);
      ctx.bezierCurveTo(x + width * 0.026, base - h * 0.52, x + width * 0.016, base - h * 0.18, x - width * 0.015, base);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawProcessFlow(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 72%, 42%, ${alpha})`;
    ctx.lineWidth = 1.5;
    for (let stream = 0; stream < 7; stream += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 26; step += 1) {
        const x = width * (0.12 + step / 26 * 0.76);
        const y = height * (0.26 + stream * 0.07) + Math.sin(step * 0.5 + state.t * 0.16 + stream + index) * height * 0.018;
        if (!step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawProcessGrowth(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 64%, 34%, ${alpha})`;
    ctx.lineWidth = 1.2;
    for (let sprout = 0; sprout < 12; sprout += 1) {
      const x = width * (0.18 + sprout * 0.055);
      const y = height * (0.7 - (sprout % 4) * 0.035);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(state.t * 0.05 + sprout) * width * 0.02, y - height * 0.055, x + width * 0.012, y - height * 0.095);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + width * 0.018, y - height * 0.06, width * 0.012, height * 0.007, -0.5, 0, TAU);
      ctx.stroke();
    }
  }

  function drawProcessFracture(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 34%, 18%, ${alpha})`;
    ctx.lineWidth = 1.4;
    for (let crack = 0; crack < 11; crack += 1) {
      const x = width * (0.18 + visualUnit(`${hue}:crack:${index}:${crack}`, 1) * 0.62);
      const y = height * (0.2 + visualUnit(`${hue}:crack:${index}:${crack}`, 2) * 0.54);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let kink = 1; kink <= 4; kink += 1) {
        ctx.lineTo(x + Math.sin(kink * crack + index) * width * 0.035, y + kink * height * 0.032);
      }
      ctx.stroke();
    }
  }

  function drawProcessQueue(ctx, width, height, state, hue, alpha, index) {
    ctx.fillStyle = `hsla(${hue}, 68%, 42%, ${alpha})`;
    for (let lane = 0; lane < 5; lane += 1) {
      for (let node = 0; node < 9; node += 1) {
        const phase = (state.t * 0.04 + node * 0.12 + lane * 0.05 + index) % 1;
        const x = width * (0.16 + ((node + phase) % 9) * 0.075);
        const y = height * (0.3 + lane * 0.08);
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }

  function drawProcessFocus(ctx, width, height, state, hue, alpha, index) {
    const fx = width * (0.64 + index * 0.025);
    const fy = height * 0.46;
    ctx.strokeStyle = `hsla(${hue}, 92%, 58%, ${alpha})`;
    ctx.lineWidth = 1.1;
    for (let ray = 0; ray < 12; ray += 1) {
      ctx.beginPath();
      ctx.moveTo(width * 0.08, height * (0.18 + ray * 0.052));
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }
  }

  function drawProcessLevitate(ctx, width, height, state, hue, alpha, index) {
    ctx.fillStyle = `hsla(${hue}, 76%, 50%, ${alpha})`;
    ctx.strokeStyle = `hsla(${hue}, 58%, 32%, ${alpha * 0.7})`;
    for (let grain = 0; grain < 34; grain += 1) {
      const x = width * (0.2 + visualUnit(`${hue}:hover:${index}:${grain}`, 1) * 0.6);
      const y = height * (0.28 + visualUnit(`${hue}:hover:${index}:${grain}`, 2) * 0.34) + Math.sin(state.t * 0.13 + grain) * 8;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + grain % 4, 0, TAU);
      ctx.fill();
    }
    for (let band = 0; band < 5; band += 1) {
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * (0.35 + band * 0.065), width * 0.28, height * 0.018, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawProcessCrystallize(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 70%, 45%, ${alpha})`;
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 46)}, 72%, 62%, ${alpha * 0.32})`;
    for (let crystal = 0; crystal < 14; crystal += 1) {
      const x = width * (0.18 + visualUnit(`${hue}:crystal:${index}:${crystal}`, 1) * 0.64);
      const y = height * (0.28 + visualUnit(`${hue}:crystal:${index}:${crystal}`, 2) * 0.42);
      const r = 5 + crystal % 6;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.5);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r * 1.5);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawProcessOrbit(ctx, width, height, state, hue, alpha, index) {
    drawSemanticOrbitSystem(ctx, width, height, state, hue, alpha, index + 1);
  }

  function drawProcessCharge(ctx, width, height, state, hue, alpha, index) {
    ctx.strokeStyle = `hsla(${hue}, 86%, 48%, ${alpha})`;
    ctx.lineWidth = 1.4;
    for (let bolt = 0; bolt < 10; bolt += 1) {
      const x = width * (0.18 + bolt * 0.07);
      const y = height * (0.24 + ((bolt + index) % 6) * 0.08);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width * 0.018, y + height * 0.028);
      ctx.lineTo(x - width * 0.004, y + height * 0.028);
      ctx.lineTo(x + width * 0.024, y + height * 0.07);
      ctx.stroke();
    }
  }

  function drawVisualFingerprintTexture(ctx, width, height, state, genome) {
    const rows = visualDnaRows(genome).slice(0, 32);
    if (!rows.length) return;
    const dna = genome.visualDna || {};
    const morphology = genome.morphology || {};
    const laneBias = Math.round(finiteVisualNumber(dna.laneBias, 0));
    const density = finiteVisualNumber(dna.densityBias, 1);
    const scale = Math.min(width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = Math.max(0.8, finiteVisualNumber(morphology.strokeWeight, 1) * 0.85);
    for (let lane = 0; lane < 7; lane += 1) {
      const y = height * (0.13 + lane * 0.12);
      const hue = normalizeVisualHue((genome.palette && genome.palette.hue || 180) + lane * 37 + laneBias * 9);
      ctx.strokeStyle = `hsla(${hue}, 38%, 28%, ${0.02 + density * 0.006})`;
      ctx.beginPath();
      ctx.moveTo(width * 0.06, y);
      ctx.lineTo(width * 0.94, y + Math.sin(lane * 0.9 + state.t * 0.025) * height * 0.01);
      ctx.stroke();
    }
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const n = Math.max(1, Math.min(3, Number(row.n) || 1));
      const lane = (Number(row.lane) + laneBias + 14) % 7;
      const column = (Number(row.index) * 3 + n + Math.round(visualUnit(row.hash || genome.seed, 5) * 8)) % 11;
      const x = width * (0.08 + column * 0.082) + (visualUnit(row.hash || genome.seed, 7) - 0.5) * width * 0.045;
      const y = height * (0.13 + lane * 0.12) + (n - 2) * height * 0.025;
      const weight = finiteVisualNumber(row.weight, 0.72);
      const size = scale * (0.013 + n * 0.004 + weight * 0.012);
      const hue = normalizeVisualHue(Number(row.hue) || row.hash || genome.seed);
      const angle = visualUnit(row.hash || genome.seed, 11) * TAU + state.t * 0.012 * n;
      const alpha = Math.min(0.18, 0.045 + n * 0.026 + density * 0.014);
      drawVisualDnaMark(ctx, Number(row.mark) || 0, x, y, size, angle, hue, alpha);
      if (index > 0 && index % 2 === 0) {
        const previous = rows[index - 1];
        const px = width * (0.08 + ((Number(previous.index) * 3 + previous.n) % 11) * 0.082);
        const py = height * (0.13 + ((Number(previous.lane) + laneBias + 14) % 7) * 0.12);
        ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + 48)}, 56%, 38%, ${alpha * 0.42})`;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo((px + x) * 0.5, (py + y) * 0.5 - height * 0.035 * n, x, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function visualDnaRows(genome) {
    const rows = genome && genome.visualDna && Array.isArray(genome.visualDna.ngrams)
      ? genome.visualDna.ngrams
      : [];
    return rows.length ? rows : fallbackVisualDna(genome && genome.seed || 1).ngrams;
  }

  function fallbackVisualDna(seed) {
    const rows = [];
    for (let index = 0; index < 9; index += 1) {
      const hash = visualHash(`${seed}:fallback:${index}`);
      rows.push({
        text: `fallback-${index}`,
        n: index % 3 + 1,
        index,
        hash,
        lane: hash % 7,
        mark: hash % 9,
        hue: normalizeVisualHue(hash),
        weight: 0.55 + visualUnit(hash, 3) * 0.42,
      });
    }
    return {
      schema: 'simulatte.compiledVisualDna.v1',
      hash: visualHash(rows.map((row) => row.hash).join('|')),
      tokenCount: 1,
      ngramCount: rows.length,
      ngrams: rows,
      paletteShift: 0,
      densityBias: 1,
      laneBias: 0,
    };
  }

  function drawVisualDnaMark(ctx, mark, x, y, size, angle, hue, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = `hsla(${hue}, 72%, 42%, ${alpha})`;
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 44)}, 84%, 58%, ${alpha * 0.38})`;
    ctx.lineWidth = Math.max(0.8, size * 0.09);
    const kind = ((mark % 9) + 9) % 9;
    if (kind === 0) {
      ctx.strokeRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);
    } else if (kind === 1) {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.54, 0, TAU);
      ctx.stroke();
    } else if (kind === 2) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.65, size * 0.42);
      ctx.lineTo(0, -size * 0.58);
      ctx.lineTo(size * 0.65, size * 0.42);
      ctx.closePath();
      ctx.stroke();
    } else if (kind === 3) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.7, 0);
      ctx.lineTo(-size * 0.18, -size * 0.42);
      ctx.lineTo(size * 0.18, size * 0.42);
      ctx.lineTo(size * 0.7, 0);
      ctx.stroke();
    } else if (kind === 4) {
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.72, size * 0.32, 0, 0, TAU);
      ctx.stroke();
    } else if (kind === 5) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.62, -size * 0.5);
      ctx.lineTo(size * 0.62, size * 0.5);
      ctx.moveTo(size * 0.62, -size * 0.5);
      ctx.lineTo(-size * 0.62, size * 0.5);
      ctx.stroke();
    } else if (kind === 6) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.72, -size * 0.22);
      ctx.bezierCurveTo(-size * 0.26, -size * 0.72, size * 0.26, size * 0.72, size * 0.72, size * 0.22);
      ctx.stroke();
    } else if (kind === 7) {
      for (let spoke = 0; spoke < 5; spoke += 1) {
        const a = spoke * TAU / 5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * size * 0.18, Math.sin(a) * size * 0.18);
        ctx.lineTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
        ctx.stroke();
      }
    } else {
      ctx.fillRect(-size * 0.42, -size * 0.42, size * 0.84, size * 0.84);
      ctx.strokeRect(-size * 0.42, -size * 0.42, size * 0.84, size * 0.84);
    }
    ctx.restore();
  }

  function drawGenomeStrataTexture(ctx, width, height, state, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.accentHue, 178);
    const morphology = genome.morphology || {};
    const bands = Math.max(5, Math.min(18, Math.round(morphology.bandCount || 8)));
    const curl = finiteVisualNumber(morphology.flowCurl, 0.4);
    ctx.lineWidth = Math.max(0.8, finiteVisualNumber(morphology.strokeWeight, 1));
    for (let band = 0; band < bands; band += 1) {
      const y = height * (0.14 + band / Math.max(1, bands - 1) * 0.74);
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + band * 9)}, 62%, 38%, ${0.035 + band * 0.002})`;
      ctx.beginPath();
      for (let step = 0; step <= 34; step += 1) {
        const x = width * (step / 34);
        const noise = visualNoise(genome, 101 + band, step) - 0.5;
        const yy = y + Math.sin(step * 0.62 + state.t * 0.12 + band) * height * 0.008 * curl + noise * height * 0.018;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawGenomeNetworkTexture(ctx, width, height, state, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.accentHue, 178);
    const morphology = genome.morphology || {};
    const cols = Math.max(4, Math.min(11, Math.round(4 + finiteVisualNumber(morphology.fieldComplexity, 5))));
    const rows = Math.max(3, Math.min(8, Math.round(cols * 0.68)));
    ctx.lineWidth = Math.max(0.8, finiteVisualNumber(morphology.strokeWeight, 1));
    ctx.strokeStyle = `hsla(${hue}, 62%, 34%, 0.05)`;
    for (let col = 0; col < cols; col += 1) {
      const x = width * (0.08 + col / Math.max(1, cols - 1) * 0.84);
      ctx.beginPath();
      ctx.moveTo(x, height * 0.08);
      ctx.lineTo(x + Math.sin(col * 1.7 + state.t * 0.05) * width * 0.018, height * 0.92);
      ctx.stroke();
    }
    for (let row = 0; row < rows; row += 1) {
      const y = height * (0.12 + row / Math.max(1, rows - 1) * 0.76);
      ctx.beginPath();
      ctx.moveTo(width * 0.06, y);
      ctx.lineTo(width * 0.94, y + Math.cos(row * 1.4 + state.t * 0.05) * height * 0.012);
      ctx.stroke();
    }
    ctx.fillStyle = `hsla(${normalizeVisualHue(hue + 82)}, 64%, 54%, 0.055)`;
    for (let i = 0; i < cols * rows; i += 3) {
      const col = i % cols;
      const row = Math.floor(i / cols) % rows;
      const size = 2 + visualNoise(genome, 131, i) * 4;
      const x = width * (0.08 + col / Math.max(1, cols - 1) * 0.84);
      const y = height * (0.12 + row / Math.max(1, rows - 1) * 0.76);
      ctx.fillRect(x - size * 0.5, y - size * 0.5, size, size);
    }
  }

  function drawGenomeSectionTexture(ctx, width, height, state, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.accentHue, 178);
    const bands = Math.max(5, Math.min(14, genome.morphology && genome.morphology.bandCount || 8));
    ctx.lineWidth = Math.max(1, finiteVisualNumber(genome.morphology && genome.morphology.strokeWeight, 1));
    for (let i = 0; i < bands; i += 1) {
      const x = width * (0.1 + i / Math.max(1, bands - 1) * 0.8);
      const top = height * (0.16 + visualNoise(genome, 151, i) * 0.18);
      const bottom = height * (0.72 + visualNoise(genome, 157, i) * 0.16);
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + i * 13)}, 48%, 32%, 0.048)`;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + Math.sin(i + state.t * 0.04) * width * 0.012, bottom);
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.strokeRect(x - width * 0.018, top + height * 0.04, width * 0.036, height * 0.026);
      }
    }
  }

  function drawGenomeRadialTexture(ctx, width, height, state, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.accentHue, 178);
    const count = Math.max(9, Math.min(26, finiteVisualNumber(genome.morphology && genome.morphology.particleDensity, 36) * 0.32));
    const cx = width * (0.36 + visualNoise(genome, 167, 1) * 0.28);
    const cy = height * (0.32 + visualNoise(genome, 173, 1) * 0.24);
    ctx.lineWidth = Math.max(0.8, finiteVisualNumber(genome.morphology && genome.morphology.strokeWeight, 1));
    for (let i = 0; i < count; i += 1) {
      const angle = i / count * TAU + visualNoise(genome, 179, i) * 0.16 + state.t * 0.006;
      const inner = Math.min(width, height) * (0.04 + visualNoise(genome, 181, i) * 0.08);
      const outer = Math.min(width, height) * (0.32 + visualNoise(genome, 191, i) * 0.34);
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + i * 11)}, 72%, 54%, 0.035)`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
  }

  function drawGenomeContourTexture(ctx, width, height, state, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.accentHue, 178);
    const count = Math.max(7, Math.min(18, genome.morphology && genome.morphology.bandCount || 9));
    ctx.lineWidth = Math.max(0.8, finiteVisualNumber(genome.morphology && genome.morphology.strokeWeight, 1));
    for (let ring = 0; ring < count; ring += 1) {
      const y = height * (0.16 + ring * 0.052);
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + ring * 7)}, 58%, 34%, ${0.032 + ring * 0.002})`;
      ctx.beginPath();
      for (let step = 0; step <= 40; step += 1) {
        const x = width * (0.04 + step / 40 * 0.92);
        const yy = y + Math.sin(step * 0.5 + ring * 0.7 + state.t * 0.04) * height * 0.014;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawGenomeMotifMarks(ctx, width, height, state, genome) {
    const motifs = Array.isArray(genome.motifs) ? genome.motifs : [];
    if (motifs.includes('architectural-grid')) drawGenomeArchitectureMarks(ctx, width, height, genome);
    if (motifs.includes('ember-shear')) drawGenomeEmberShear(ctx, width, height, state, genome);
    if (motifs.includes('caustic-ribs') || motifs.includes('ray-stack')) drawGenomeCausticRibs(ctx, width, height, state, genome);
    if (motifs.includes('fracture-lines')) drawGenomeFractureMarks(ctx, width, height, genome);
  }

  function drawGenomeArchitectureMarks(ctx, width, height, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.shadowHue, 218);
    const cols = 5 + Math.round(visualNoise(genome, 211, 1) * 5);
    const rows = 3 + Math.round(visualNoise(genome, 223, 1) * 4);
    ctx.strokeStyle = `hsla(${hue}, 34%, 18%, 0.065)`;
    ctx.lineWidth = 1;
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const x = width * (0.1 + col * 0.8 / cols);
        const y = height * (0.16 + row * 0.46 / rows);
        ctx.strokeRect(x, y, width * 0.034, height * 0.026);
      }
    }
  }

  function drawGenomeEmberShear(ctx, width, height, state, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.hue, 24);
    const count = Math.max(12, Math.min(54, finiteVisualNumber(genome.morphology && genome.morphology.particleDensity, 32)));
    ctx.lineWidth = 1.1;
    for (let i = 0; i < count; i += 1) {
      const x = width * (0.12 + visualNoise(genome, 229, i) * 0.76);
      const y = height * (0.28 + visualNoise(genome, 233, i) * 0.56);
      const drift = Math.sin(state.t * 0.16 + i) * 5;
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + i * 5)}, 86%, 62%, ${0.035 + visualNoise(genome, 239, i) * 0.05})`;
      ctx.beginPath();
      ctx.moveTo(x + drift, y);
      ctx.lineTo(x + drift + width * 0.018, y - height * 0.026);
      ctx.stroke();
    }
  }

  function drawGenomeCausticRibs(ctx, width, height, state, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.accentHue, 208);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i += 1) {
      const y = height * (0.18 + i * 0.067);
      ctx.strokeStyle = `hsla(${normalizeVisualHue(hue + i * 18)}, 86%, 62%, 0.044)`;
      ctx.beginPath();
      for (let step = 0; step <= 20; step += 1) {
        const x = width * (0.12 + step * 0.04);
        const yy = y + Math.sin(step * 0.8 + state.t * 0.08 + i) * height * 0.018;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawGenomeFractureMarks(ctx, width, height, genome) {
    const hue = finiteVisualNumber(genome.palette && genome.palette.shadowHue, 220);
    ctx.strokeStyle = `hsla(${hue}, 46%, 20%, 0.07)`;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i += 1) {
      const x = width * (0.18 + visualNoise(genome, 251, i) * 0.64);
      const y = height * (0.18 + visualNoise(genome, 257, i) * 0.58);
      const angle = visualNoise(genome, 263, i) * TAU;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * width * 0.08, y + Math.sin(angle) * height * 0.06);
      ctx.stroke();
    }
  }

  function visualGenomeColor(hue, saturation, lightness, alpha = 1) {
    if (![hue, saturation, lightness, alpha].every(Number.isFinite)) return '';
    return `hsla(${normalizeVisualHue(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, ${alpha})`;
  }

  function visualNoise(genome, salt, index) {
    const seed = Number(genome && genome.seed) || 1;
    return hashNoise(seed + salt * 1009, index + salt * 37);
  }

  function visualUnit(seed, salt) {
    return visualHash(`${seed}:${salt}`) / 4294967295;
  }

  function visualHash(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function normalizeVisualHue(value) {
    return ((Math.round(value) % 360) + 360) % 360;
  }

  function finiteVisualNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function paintSceneBackground(ctx, width, height, top, bottom, accentHue = 178) {
    ctx.save();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.42, `hsla(${accentHue}, 58%, 86%, 0.72)`);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    drawCanvasTexture(ctx, width, height, accentHue);
    ctx.restore();
  }

  function drawCanvasTexture(ctx, width, height, accentHue = 178) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const diagonal = ctx.createLinearGradient(0, 0, width, height);
    diagonal.addColorStop(0, 'rgba(255,255,255,0)');
    diagonal.addColorStop(0.34, `hsla(${accentHue}, 72%, 58%, 0.035)`);
    diagonal.addColorStop(0.68, `hsla(${(accentHue + 54) % 360}, 76%, 56%, 0.025)`);
    diagonal.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = diagonal;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = `hsla(${accentHue}, 42%, 24%, 0.045)`;
    ctx.lineWidth = 1;
    const spacing = Math.max(24, Math.min(width, height) / 15);
    for (let x = -height; x < width + height; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height * 0.45, height);
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${(accentHue + 126) % 360}, 38%, 34%, 0.025)`;
    for (let y = spacing * 0.5; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y + Math.sin(y * 0.01) * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAcousticWaveguides(ctx, width, height, state) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 2;
    for (let guide = 0; guide < 7; guide += 1) {
      const y = height * (0.22 + guide * 0.088);
      const hue = 188 + guide * 9;
      ctx.strokeStyle = `hsla(${hue}, 78%, 46%, ${0.13 + guide * 0.008})`;
      ctx.beginPath();
      for (let x = width * 0.08; x <= width * 0.92; x += 30) {
        const yy = y + Math.sin(x * 0.014 + state.t * 2.4 + guide) * height * 0.018;
        if (x === width * 0.08) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAcousticPressureFronts(ctx, width, height, state, plan) {
    const centers = acousticPlanCenters(plan, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let c = 0; c < centers.length; c += 1) {
      const center = centers[c];
      for (let ring = 0; ring < 11; ring += 1) {
        const travel = (state.t * 0.08 + ring * 0.075 + c * 0.11) % 1;
        const rx = width * (0.035 + travel * 0.22);
        const ry = height * (0.025 + travel * 0.14);
        const alpha = Math.max(0.05, 0.34 * (1 - travel));
        ctx.strokeStyle = `hsla(${202 + c * 18 + ring * 4}, 82%, 54%, ${alpha})`;
        ctx.lineWidth = 1.4 + (1 - travel) * 1.8;
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, rx, ry, Math.sin(c + ring) * 0.18, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawAcousticResonatorNodes(ctx, width, height, state, plan) {
    const centers = acousticPlanCenters(plan, width, height).slice(0, 8);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < centers.length; i += 1) {
      const center = centers[i];
      const pulse = 0.5 + 0.5 * Math.sin(state.t * 3.2 + i * 0.9);
      const r = Math.min(width, height) * (0.018 + pulse * 0.018);
      const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, r * 4.8);
      glow.addColorStop(0, `hsla(${186 + i * 17}, 92%, 62%, 0.42)`);
      glow.addColorStop(0.42, `hsla(${228 + i * 11}, 78%, 54%, 0.18)`);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r * 4.8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `hsla(${196 + i * 13}, 76%, 40%, 0.36)`;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function acousticPlanCenters(plan, width, height) {
    const acousticObjects = (plan.objects || []).filter((object) => {
      const text = `${object.id || ''} ${object.shape || ''} ${object.role || ''} ${object.material || ''}`.toLowerCase();
      return object.visualRegime === 'acoustic' || /acoustic|sound|wave|pressure|resonance|tube|emitter/.test(text);
    });
    const objects = acousticObjects.length ? acousticObjects : (plan.objects || []).slice(0, 5);
    const centers = objects.map((object) => planObjectCenter(plan, object.id, width, height)).filter(Boolean);
    if (centers.length) return centers;
    return [
      { x: width * 0.22, y: height * 0.42 },
      { x: width * 0.48, y: height * 0.5 },
      { x: width * 0.74, y: height * 0.36 },
    ];
  }

  function drawPlanObjectsWithAlpha(ctx, width, height, state, plan, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0.42, alpha));
    drawPlanObjects(ctx, width, height, state, plan);
    ctx.restore();
  }

  function drawHeatHaze(ctx, width, height, state, centerY) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 18; band += 1) {
      const y = height * (centerY - 0.26 + band * 0.024);
      const hue = 18 + band * 3;
      ctx.strokeStyle = `hsla(${hue}, 92%, 58%, ${0.035 + band * 0.001})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = width * 0.1; x <= width * 0.9; x += 24) {
        const yy = y + Math.sin(x * 0.018 + state.t * 0.9 + band) * 7;
        if (x === width * 0.1) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFuelTerrain(ctx, width, height, state, plan) {
    ctx.save();
    const baseY = height * 0.72;
    const gradient = ctx.createLinearGradient(0, baseY - height * 0.12, 0, height);
    gradient.addColorStop(0, 'rgba(130, 98, 50, 0.09)');
    gradient.addColorStop(0.55, 'rgba(86, 74, 44, 0.16)');
    gradient.addColorStop(1, 'rgba(42, 38, 30, 0.2)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(width * 0.05, baseY);
    for (let i = 0; i <= 28; i += 1) {
      const x = width * (0.05 + i * 0.032);
      const y = baseY + Math.sin(i * 0.64 + state.t * 0.08) * 9 + hashNoise(23, i) * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width * 0.96, height * 0.92);
    ctx.lineTo(width * 0.04, height * 0.92);
    ctx.closePath();
    ctx.fill();
    for (let layer = 0; layer < 7; layer += 1) {
      ctx.strokeStyle = `rgba(88, 65, 36, ${0.08 + layer * 0.012})`;
      ctx.beginPath();
      for (let i = 0; i <= 22; i += 1) {
        const x = width * (0.08 + i * 0.038);
        const y = baseY + layer * 12 + Math.sin(i * 0.7 + layer) * 4;
        if (!i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const rocks = objectsMatching(plan, /rock|wall|soil|sand|wood|fuel|biomass/).slice(0, 16);
    rocks.forEach((object, index) => {
      const center = objectCenter(object, width, height);
      drawGroundKernel(ctx, center.x, Math.max(center.y, baseY - 20), index, state);
    });
    ctx.restore();
  }

  function drawGroundKernel(ctx, x, y, index, state) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((hashNoise(41, index) - 0.5) * 0.8);
    ctx.fillStyle = `rgba(${95 + index * 4}, ${72 + index * 2}, 46, 0.16)`;
    ctx.beginPath();
    ctx.ellipse(0, Math.sin(state.t * 0.08 + index), 18 + hashNoise(43, index) * 24, 7 + hashNoise(47, index) * 12, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawFireMoistureChannels(ctx, width, height, state, plan) {
    const water = objectsMatching(plan, /water|moisture|river|flow/);
    if (!water.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 5; band += 1) {
      ctx.strokeStyle = `hsla(${190 + band * 7}, 80%, 56%, ${0.12 - band * 0.012})`;
      ctx.lineWidth = 1.6 + band * 0.8;
      ctx.beginPath();
      for (let i = 0; i <= 18; i += 1) {
        const x = width * (0.16 + i * 0.038);
        const y = height * (0.75 + Math.sin(i * 0.7 + state.t * 0.5 + band) * 0.018);
        if (!i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFireFront(ctx, width, height, state, plan) {
    const flame = firstObjectMatching(plan, /flame|fire|combust/);
    const center = flame ? objectCenter(flame, width, height) : { x: width * 0.48, y: height * 0.62 };
    ctx.save();
    for (let column = 0; column < 42; column += 1) {
      const lane = column / 41;
      const x = width * (0.22 + lane * 0.48);
      const base = center.y + Math.sin(column * 0.43) * height * 0.025;
      const heightScale = 0.42 + hashNoise(53, column) * 0.58;
      const hue = 16 + hashNoise(59, column) * 36;
      ctx.strokeStyle = `hsla(${hue}, 96%, ${42 + heightScale * 14}%, ${0.28 + heightScale * 0.22})`;
      ctx.lineWidth = 1.8 + heightScale * 3.4;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.bezierCurveTo(
        x + Math.sin(state.t * 1.2 + column) * 16,
        base - height * 0.08,
        x + Math.cos(state.t * 1.5 + column) * 24,
        base - height * 0.18 * heightScale,
        x + Math.sin(state.t * 1.8 + column) * 10,
        base - height * 0.28 * heightScale
      );
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'screen';
    for (let glow = 0; glow < 5; glow += 1) {
      const r = Math.min(width, height) * (0.08 + glow * 0.05);
      const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, r);
      gradient.addColorStop(0, `rgba(255, 116, 46, ${0.12 - glow * 0.014})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSmokeColumn(ctx, width, height, state, plan) {
    const plume = firstObjectMatching(plan, /smoke|plume/);
    const center = plume ? objectCenter(plume, width, height) : { x: width * 0.52, y: height * 0.42 };
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 28; i += 1) {
      const rise = ((state.t * 0.035 + i / 28) % 1);
      const x = center.x + Math.sin(i * 0.8 + state.t * 0.24) * width * 0.09;
      const y = center.y - rise * height * 0.44;
      const r = (18 + rise * 54) * (0.5 + hashNoise(67, i));
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(116, 126, 130, ${0.055 * (1 - rise * 0.5)})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOpticalBenchRail(ctx, width, height, state) {
    ctx.save();
    const y = height * 0.58;
    const rail = ctx.createLinearGradient(width * 0.12, y, width * 0.9, y);
    rail.addColorStop(0, 'rgba(40, 74, 94, 0.08)');
    rail.addColorStop(0.5, 'rgba(40, 74, 94, 0.26)');
    rail.addColorStop(1, 'rgba(40, 74, 94, 0.08)');
    ctx.strokeStyle = rail;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(width * 0.12, y);
    ctx.lineTo(width * 0.9, y + Math.sin(state.t * 0.2) * 1.5);
    ctx.stroke();
    for (let i = 0; i < 12; i += 1) {
      const x = width * (0.14 + i * 0.065);
      ctx.strokeStyle = 'rgba(25, 62, 88, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 18);
      ctx.lineTo(x + 8, y + 18);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSpectralBeamTrace(ctx, width, height, state, plan) {
    const source = firstObjectMatching(plan, /sun|lamp|light-source|panel/) || (plan.objects || [])[0];
    const lens = firstObjectMatching(plan, /lens|glass/);
    const prism = firstObjectMatching(plan, /prism/);
    const sensor = firstObjectMatching(plan, /sensor|meter|load/);
    const a = source ? objectCenter(source, width, height) : { x: width * 0.16, y: height * 0.48 };
    const b = lens ? objectCenter(lens, width, height) : { x: width * 0.4, y: height * 0.5 };
    const c = prism ? objectCenter(prism, width, height) : { x: width * 0.58, y: height * 0.5 };
    const d = sensor ? objectCenter(sensor, width, height) : { x: width * 0.84, y: height * 0.56 };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 9; i += 1) {
      const split = (i - 4) * 0.018;
      const hue = 206 + i * 18;
      ctx.strokeStyle = `hsla(${hue}, 96%, 52%, 0.46)`;
      ctx.lineWidth = 2 + (i % 3) * 0.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + split * height * 0.18);
      ctx.bezierCurveTo(
        b.x - width * 0.04,
        b.y + Math.sin(state.t + i) * 2,
        b.x + width * 0.04,
        b.y - split * height * 0.08,
        c.x,
        c.y + split * height * 0.18
      );
      ctx.bezierCurveTo(c.x + width * 0.08, c.y + split * height, d.x - width * 0.04, d.y + split * height * 0.6, d.x, d.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOpticalSurfaces(ctx, width, height, state, plan) {
    const optical = objectsMatching(plan, /lens|prism|mirror|glass|sensor/).slice(0, 8);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    optical.forEach((object, index) => {
      const center = objectCenter(object, width, height);
      const isPrism = /prism/.test(`${object.id} ${object.shape}`);
      const isMirror = /mirror/.test(`${object.id} ${object.role}`);
      const h = Math.min(width, height) * (isPrism ? 0.12 : 0.16);
      const w = Math.min(width, height) * (isPrism ? 0.14 : 0.08);
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate((object.pose && object.pose.rotation || 0) + Math.sin(state.t * 0.12 + index) * 0.02);
      const gradient = ctx.createLinearGradient(-w, -h, w, h);
      gradient.addColorStop(0, 'rgba(255,255,255,0.08)');
      gradient.addColorStop(0.5, isMirror ? 'rgba(108,140,154,0.38)' : 'rgba(64,178,232,0.3)');
      gradient.addColorStop(1, 'rgba(255,255,255,0.04)');
      ctx.fillStyle = gradient;
      ctx.strokeStyle = isMirror ? 'rgba(80, 110, 120, 0.42)' : 'rgba(48, 146, 214, 0.42)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      if (isPrism) {
        ctx.moveTo(0, -h * 0.7);
        ctx.lineTo(w * 0.9, h * 0.62);
        ctx.lineTo(-w * 0.9, h * 0.62);
        ctx.closePath();
      } else {
        ctx.ellipse(0, 0, w * 0.68, h * 0.72, 0, 0, TAU);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  }

  function drawOpticalCaustics(ctx, width, height, state, plan) {
    const target = firstObjectMatching(plan, /sensor|meter|wall|screen/);
    const center = target ? objectCenter(target, width, height) : { x: width * 0.78, y: height * 0.63 };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let ring = 0; ring < 12; ring += 1) {
      ctx.strokeStyle = `hsla(${198 + ring * 12}, 92%, 56%, ${0.17 - ring * 0.008})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(
        center.x + Math.sin(state.t * 0.3 + ring) * 6,
        center.y + Math.cos(state.t * 0.2 + ring) * 5,
        width * (0.02 + ring * 0.008),
        height * (0.012 + ring * 0.004),
        ring * 0.18,
        0,
        TAU
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCityRouteGrid(ctx, width, height, state) {
    ctx.save();
    ctx.strokeStyle = 'rgba(42, 96, 94, 0.13)';
    ctx.lineWidth = 2.2;
    for (let col = 0; col < 5; col += 1) {
      const x = width * (0.18 + col * 0.16);
      ctx.beginPath();
      ctx.moveTo(x, height * 0.18);
      ctx.lineTo(x + Math.sin(state.t * 0.12 + col) * 2, height * 0.82);
      ctx.stroke();
    }
    for (let row = 0; row < 4; row += 1) {
      const y = height * (0.24 + row * 0.16);
      ctx.beginPath();
      ctx.moveTo(width * 0.12, y);
      ctx.lineTo(width * 0.88, y + Math.cos(state.t * 0.1 + row) * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCityNodes(ctx, width, height, state, plan) {
    const nodes = objectsMatching(plan, /queue|network|grid|traffic|power|market|ledger|sensor/).slice(0, 18);
    ctx.save();
    nodes.forEach((object, index) => {
      const center = objectCenter(object, width, height);
      const size = 9 + (index % 4) * 3;
      const hue = /queue|market/.test(`${object.id} ${object.role}`) ? 34 : /power/.test(object.id) ? 58 : 184;
      const pulse = (Math.sin(state.t * 1.1 + index) + 1) * 0.5;
      ctx.fillStyle = `hsla(${hue}, 72%, 54%, ${0.14 + pulse * 0.08})`;
      ctx.strokeStyle = `hsla(${hue + 24}, 70%, 38%, 0.28)`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.rect(center.x - size, center.y - size * 0.6, size * 2, size * 1.2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawCityFlowPulses(ctx, width, height, state, plan) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const relation of plan.relations || []) {
      const from = planObjectCenter(plan, relation.from, width, height);
      const to = planObjectCenter(plan, relation.to, width, height);
      if (!from || !to) continue;
      for (let i = 0; i < 3; i += 1) {
        const t = (state.t * 0.12 + i / 3 + hashNoise(relation.from.length, relation.to.length)) % 1;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        drawPrismaticParticle(ctx, x, y, 1.6 + i * 0.3, 170 + i * 34, 0.08, t * TAU);
      }
    }
    ctx.restore();
  }

  function drawWatershedTerrain(ctx, width, height, state) {
    ctx.save();
    for (let band = 0; band < 18; band += 1) {
      const y = height * (0.18 + band * 0.041);
      const hue = 74 - band * 1.4;
      ctx.strokeStyle = `hsla(${hue}, 42%, ${38 + band * 0.65}%, ${0.16 + band * 0.006})`;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      for (let i = 0; i <= 28; i += 1) {
        const x = width * (0.08 + i * 0.031);
        const yy = y + Math.sin(i * 0.65 + band * 0.7 + state.t * 0.06) * (7 + band * 0.6);
        if (!i) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWatershedRiver(ctx, width, height, state, plan) {
    const flow = firstObjectMatching(plan, /river|erosion|water|flow/);
    const base = flow && flow.pose && Array.isArray(flow.pose.points)
      ? flow.pose.points.map((point) => ({ x: point[0] * width, y: point[1] * height }))
      : [
        { x: width * 0.18, y: height * 0.2 },
        { x: width * 0.36, y: height * 0.42 },
        { x: width * 0.52, y: height * 0.58 },
        { x: width * 0.78, y: height * 0.82 },
      ];
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let band = 0; band < 8; band += 1) {
      ctx.strokeStyle = `hsla(${190 + band * 6}, 82%, 48%, ${0.24 - band * 0.014})`;
      ctx.lineWidth = 5 + band * 2.6;
      ctx.beginPath();
      base.forEach((point, index) => {
        const x = point.x + Math.sin(state.t * 0.3 + band + index) * (band + 1);
        const y = point.y + Math.cos(state.t * 0.2 + band + index) * (band + 1);
        if (!index) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSedimentFan(ctx, width, height, state, plan) {
    const sediment = objectsMatching(plan, /sand|soil|sediment|rock|terrain/).slice(0, 24);
    ctx.save();
    sediment.forEach((object, index) => {
      const center = objectCenter(object, width, height);
      const spread = 18 + hashNoise(101, index) * 46;
      for (let grain = 0; grain < 8; grain += 1) {
        const x = center.x + (hashNoise(index * 23, grain) - 0.5) * spread;
        const y = center.y + (hashNoise(index * 29, grain) - 0.5) * spread * 0.6 + Math.sin(state.t * 0.16 + grain) * 0.8;
        ctx.fillStyle = `rgba(116, 82, 40, ${0.14 + hashNoise(index * 31, grain) * 0.1})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + hashNoise(index * 37, grain) * 1.6, 0, TAU);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  function drawMachineRotorField(ctx, width, height, state, plan) {
    const rotor = firstObjectMatching(plan, /rotor|wheel|motor|magnetic-motor/);
    const center = rotor ? objectCenter(rotor, width, height) : { x: width * 0.5, y: height * 0.5 };
    const radius = Math.min(width, height) * 0.15;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let ring = 0; ring < 18; ring += 1) {
      const r = radius * (0.34 + ring * 0.055);
      ctx.strokeStyle = `hsla(${218 + ring * 5}, 84%, 48%, ${0.18 - ring * 0.006})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, r * 1.25, r * 0.66, state.t * 0.08 + ring * 0.16, 0, TAU);
      ctx.stroke();
    }
    for (let spoke = 0; spoke < 16; spoke += 1) {
      const a = state.t * 0.22 + spoke * TAU / 16;
      ctx.strokeStyle = `hsla(${282 + spoke * 4}, 88%, 58%, 0.09)`;
      ctx.beginPath();
      ctx.moveTo(center.x + Math.cos(a) * radius * 0.22, center.y + Math.sin(a) * radius * 0.22);
      ctx.lineTo(center.x + Math.cos(a) * radius * 0.92, center.y + Math.sin(a) * radius * 0.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMachineSolarInput(ctx, width, height, state, plan) {
    const panel = firstObjectMatching(plan, /solar|panel|sun|lamp/);
    const target = firstObjectMatching(plan, /rotor|wheel/);
    const a = panel ? objectCenter(panel, width, height) : { x: width * 0.18, y: height * 0.18 };
    const b = target ? objectCenter(target, width, height) : { x: width * 0.5, y: height * 0.5 };
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 9; i += 1) {
      const offset = (i - 4) * 0.018;
      ctx.strokeStyle = `hsla(${42 + i * 5}, 92%, 48%, 0.28)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + offset * height);
      ctx.lineTo(b.x - width * 0.08, b.y + offset * height * 0.32 + Math.sin(state.t + i) * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMachineBodies(ctx, width, height, state, plan) {
    const rotor = firstObjectMatching(plan, /rotor|wheel/);
    const slider = firstObjectMatching(plan, /slider|stator|magnet/);
    const panel = firstObjectMatching(plan, /solar|panel|sun|lamp/);
    const load = firstObjectMatching(plan, /load|ledger|meter|generator/);
    const center = rotor ? objectCenter(rotor, width, height) : { x: width * 0.5, y: height * 0.5 };
    const radius = Math.min(width, height) * 0.12;
    ctx.save();
    const rotorGlow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius * 1.8);
    rotorGlow.addColorStop(0, 'rgba(255,255,255,0.36)');
    rotorGlow.addColorStop(0.42, 'rgba(78, 150, 224, 0.28)');
    rotorGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rotorGlow;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 1.8, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 14; i += 1) {
      const a = state.t * 0.18 + i * TAU / 14;
      ctx.strokeStyle = `hsla(${206 + i * 7}, 82%, 40%, 0.42)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(center.x + Math.cos(a) * radius * 0.34, center.y + Math.sin(a) * radius * 0.34);
      ctx.lineTo(center.x + Math.cos(a) * radius * 0.96, center.y + Math.sin(a) * radius * 0.96);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(62, 98, 138, 0.48)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, TAU);
    ctx.stroke();
    if (slider) drawMachineCapsule(ctx, objectCenter(slider, width, height), 66, 22, 292, state.t * 0.08);
    if (panel) drawMachinePanel(ctx, objectCenter(panel, width, height), state);
    if (load) drawMachineCapsule(ctx, objectCenter(load, width, height), 70, 28, 44, -0.16);
    ctx.restore();
  }

  function drawMachineCapsule(ctx, center, width, height, hue, rotation) {
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rotation);
    const gradient = ctx.createLinearGradient(-width * 0.5, 0, width * 0.5, 0);
    gradient.addColorStop(0, `hsla(${hue}, 76%, 52%, 0.12)`);
    gradient.addColorStop(0.5, `hsla(${hue + 24}, 86%, 52%, 0.34)`);
    gradient.addColorStop(1, `hsla(${hue + 52}, 76%, 52%, 0.12)`);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = `hsla(${hue + 18}, 68%, 34%, 0.46)`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.ellipse(0, 0, width * 0.5, height * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawMachinePanel(ctx, center, state) {
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(-0.22);
    ctx.fillStyle = 'rgba(230, 186, 72, 0.28)';
    ctx.strokeStyle = 'rgba(126, 105, 54, 0.46)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.rect(-38, -22, 76, 44);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = `rgba(255, 232, 132, ${0.08 + i * 0.018})`;
      ctx.beginPath();
      ctx.moveTo(-32 + i * 16, -20);
      ctx.lineTo(-38 + i * 16 + Math.sin(state.t * 0.2 + i) * 2, 22);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMachineEnergyPath(ctx, width, height, state, plan) {
    const rotor = firstObjectMatching(plan, /rotor|wheel/);
    const load = firstObjectMatching(plan, /load|ledger|meter|generator/);
    if (!rotor || !load) return;
    const a = objectCenter(rotor, width, height);
    const b = objectCenter(load, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 7; i += 1) {
      const t = (state.t * 0.09 + i / 7) % 1;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t + Math.sin(t * TAU + state.t) * 8;
      drawPrismaticParticle(ctx, x, y, 1.4 + i * 0.2, 48 + i * 14, 0.08, t * TAU);
    }
    ctx.restore();
  }

  function drawMaterialTrayBase(ctx, width, height, state) {
    ctx.save();
    const x = width * 0.09;
    const y = height * 0.66;
    const w = width * 0.82;
    const h = height * 0.2;
    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, 'rgba(188, 178, 150, 0.12)');
    gradient.addColorStop(1, 'rgba(104, 92, 70, 0.18)');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(92, 84, 68, 0.14)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.rect(x, y + Math.sin(state.t * 0.06) * 2, w, h);
    ctx.fill();
    ctx.stroke();
    for (let i = 1; i < 6; i += 1) {
      const xx = x + w * i / 6;
      ctx.strokeStyle = 'rgba(90, 84, 68, 0.06)';
      ctx.beginPath();
      ctx.moveTo(xx, y + 8);
      ctx.lineTo(xx, y + h - 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMaterialSpecimens(ctx, width, height, state, plan) {
    const specimens = objectsMatching(plan, /water|air|rock|wood|metal|glass|magnet|sand|soil|fire|heat|sample|bar|pool/)
      .slice(0, 14);
    const fallback = plan.objects || [];
    const source = specimens.length ? specimens : fallback.slice(0, 12);
    ctx.save();
    source.forEach((object, index) => {
      const col = index % 7;
      const row = Math.floor(index / 7);
      const center = {
        x: width * (0.16 + col * 0.115),
        y: height * (0.7 + row * 0.095),
      };
      const material = objectMaterialKey(object);
      drawSpecimenKernel(ctx, center, material, index, state);
    });
    ctx.restore();
  }

  function drawSpecimenKernel(ctx, center, material, index, state) {
    const hue = materialHueFor(material, index);
    ctx.save();
    ctx.translate(center.x, center.y + Math.sin(state.t * 0.12 + index) * 1.2);
    const r = 22 + (index % 3) * 5;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    glow.addColorStop(0, `hsla(${hue}, 86%, 56%, 0.3)`);
    glow.addColorStop(0.44, `hsla(${hue + 28}, 76%, 48%, 0.14)`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    if (/water|brine|mercury/.test(material)) {
      ctx.ellipse(0, 0, r * 1.2, r * 0.42, Math.sin(state.t * 0.16 + index) * 0.2, 0, TAU);
    } else if (/glass/.test(material)) {
      ctx.moveTo(0, -r * 0.9);
      ctx.lineTo(r * 0.92, r * 0.62);
      ctx.lineTo(-r * 0.92, r * 0.62);
      ctx.closePath();
    } else if (/metal|magnet|copper|silicon|carbon/.test(material)) {
      ctx.rect(-r * 0.9, -r * 0.34, r * 1.8, r * 0.68);
    } else {
      ctx.ellipse(0, 0, r, r * 0.68, (hashNoise(211, index) - 0.5) * 0.7, 0, TAU);
    }
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue + 12}, 62%, 30%, 0.42)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (/magnet/.test(material)) {
      for (let i = 0; i < 5; i += 1) {
        ctx.strokeStyle = `hsla(${284 + i * 10}, 84%, 44%, ${0.18 - i * 0.016})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (0.8 + i * 0.22), r * (0.38 + i * 0.12), state.t * 0.05 + i, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawMaterialInteractionField(ctx, width, height, state, plan) {
    const magnet = firstObjectMatching(plan, /magnet/);
    const glass = firstObjectMatching(plan, /glass|lens|prism/);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 12; i += 1) {
      const y = height * (0.35 + i * 0.026);
      const hue = magnet ? 270 + i * 6 : glass ? 196 + i * 8 : 46 + i * 3;
      ctx.strokeStyle = `hsla(${hue}, 78%, 58%, ${0.08 - i * 0.003})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let step = 0; step <= 22; step += 1) {
        const x = width * (0.18 + step * 0.03);
        const yy = y + Math.sin(step * 0.72 + state.t * 0.2 + i) * 7;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNutrientField(ctx, width, height, state) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 18; i += 1) {
      const x = width * (0.18 + hashNoise(151, i) * 0.64);
      const y = height * (0.18 + hashNoise(157, i) * 0.62);
      const r = Math.min(width, height) * (0.08 + hashNoise(163, i) * 0.12);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `hsla(${104 + i * 5}, 68%, 50%, 0.13)`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x + Math.sin(state.t * 0.08 + i) * 4, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBiologicalBranches(ctx, width, height, state, plan) {
    const roots = objectsMatching(plan, /mycelium|bacteria|colony|growth|infection|protein|leaf/);
    const anchors = roots.length ? roots : (plan.objects || []).slice(0, 4);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    anchors.slice(0, 8).forEach((object, index) => {
      const center = objectCenter(object, width, height);
      for (let branch = 0; branch < 11; branch += 1) {
        const angle = branch * TAU / 11 + Math.sin(state.t * 0.1 + index) * 0.18;
        const length = Math.min(width, height) * (0.08 + hashNoise(index * 41, branch) * 0.16);
        ctx.strokeStyle = `hsla(${96 + branch * 9}, 64%, 38%, ${0.23 - branch * 0.008})`;
        ctx.lineWidth = 1.4 + hashNoise(index * 43, branch) * 1.2;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.bezierCurveTo(
          center.x + Math.cos(angle) * length * 0.28,
          center.y + Math.sin(angle) * length * 0.18,
          center.x + Math.cos(angle + 0.42) * length * 0.64,
          center.y + Math.sin(angle + 0.42) * length * 0.5,
          center.x + Math.cos(angle) * length,
          center.y + Math.sin(angle) * length * 0.72
        );
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawMembranePools(ctx, width, height, state, plan) {
    const membranes = objectsMatching(plan, /membrane|gel|foam|soft|cell|bacteria/).slice(0, 10);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    membranes.forEach((object, index) => {
      const center = objectCenter(object, width, height);
      const r = Math.min(width, height) * (0.035 + hashNoise(173, index) * 0.055);
      const hue = 150 + index * 13;
      ctx.strokeStyle = `hsla(${hue}, 64%, 45%, 0.34)`;
      ctx.fillStyle = `hsla(${hue + 18}, 74%, 60%, 0.11)`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, r * 1.4, r * 0.84, Math.sin(state.t * 0.12 + index) * 0.3, 0, TAU);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function objectsMatching(plan, pattern) {
    return (plan.objects || []).filter((object) => pattern.test([
      object.id,
      object.shape,
      object.role,
      object.material,
      object.visualRegime,
      object.assembly,
    ].join(' ').toLowerCase()));
  }

  function firstObjectMatching(plan, pattern) {
    return objectsMatching(plan, pattern)[0] || null;
  }

  function firstObjectWithShape(plan, pattern) {
    return (plan.objects || []).find((object) => pattern.test(String(object.shape || '').toLowerCase())) || null;
  }

  function objectCenter(object, width, height) {
    return planPoseCenter(object && object.pose || {}, width, height);
  }

  function drawPlanBackdrop(ctx, width, height, plan, state = { t: 0 }) {
    ctx.save();
    const signature = String(plan.provenance && plan.provenance.signature || '');
    const thermal = /flame|fuel|plume/.test(signature);
    const optical = /prism|lens/.test(signature);
    const network = /queue|network/.test(signature);
    const top = thermal ? '#2f211d' : optical ? '#17263a' : network ? '#162826' : '#182723';
    const bottom = network ? '#f8fbfb' : '#f9fcfb';
    const accentHue = thermal ? 24 : optical ? 208 : network ? 172 : 156;
    paintGenomeSceneBackground(ctx, width, height, state, plan, top, bottom, accentHue);
    ctx.strokeStyle = `hsla(${accentHue}, 58%, 22%, 0.16)`;
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
    const genome = visualGenomeForPlan(plan);
    const morphology = genome.morphology || {};
    const fieldComplexity = finiteVisualNumber(morphology.fieldComplexity, 5);
    const density = finiteVisualNumber(morphology.particleDensity, 32);
    const objectLimit = Math.max(8, Math.min(16, Math.round(6 + fieldComplexity + density / 28)));
    const objects = visiblePlanObjects(plan).filter((object) => (
      object.shape !== 'body' && object.shape !== 'field-envelope'
    )).slice(0, objectLimit);
    if (!objects.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < objects.length; i += 1) {
      const object = objects[i];
      const extent = objectExtentWithVisualGenome(object, width, height, plan, i);
      if (!extent) continue;
      const family = materialFamily(object);
      if (family === 'thermal') drawThermalContinuum(ctx, extent, state, object, i);
      else if (family === 'fluid') drawFluidContinuum(ctx, extent, state, object, i);
      else if (family === 'optical') drawOpticalContinuum(ctx, extent, state, object, i);
      else if (family === 'magnetic') drawMagneticContinuum(ctx, extent, state, object, i);
      else if (family === 'granular') drawGranularContinuum(ctx, extent, state, object, i);
      else if (family === 'biological') drawBiologicalContinuum(ctx, extent, state, object, i);
      else if (family === 'soft') drawSoftContinuum(ctx, extent, state, object, i);
      else if (family === 'atomic') drawAtomicContinuum(ctx, extent, state, object, i);
      else if (family === 'electrical') drawElectricalContinuum(ctx, extent, state, object, i);
      else if (family === 'acoustic') drawAcousticContinuum(ctx, extent, state, object, i);
      else if (family === 'phase') drawPhaseContinuum(ctx, extent, state, object, i);
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

  function objectExtentWithVisualGenome(object, width, height, plan, index) {
    const extent = objectExtent(object, width, height);
    if (!extent) return null;
    const genome = visualGenomeForPlan(plan);
    const morphology = genome.morphology || {};
    const asymmetry = finiteVisualNumber(morphology.asymmetry, 0.32);
    const baseScale = finiteVisualNumber(morphology.objectScale, 1);
    const literalBoost = isConcreteShape(object && object.shape) ? 1 : 0.74;
    const jitterScale = 0.91 + visualNoise(genome, 271, index) * 0.2;
    const scale = Math.max(0.72, Math.min(1.52, baseScale * jitterScale * literalBoost));
    const nudgeX = (visualNoise(genome, 277, index) - 0.5) * width * 0.045 * asymmetry;
    const nudgeY = (visualNoise(genome, 281, index) - 0.5) * height * 0.052 * asymmetry;
    const rotationJitter = (visualNoise(genome, 283, index) - 0.5) * 0.42 * asymmetry;
    return {
      ...extent,
      x: clamp(extent.x + nudgeX, width * 0.05, width * 0.95),
      y: clamp(extent.y + nudgeY, height * 0.06, height * 0.95),
      w: extent.w * scale,
      h: extent.h * scale,
      r: extent.r * scale,
      rotation: extent.rotation + rotationJitter,
    };
  }

  function materialFamily(object) {
    if (object && object.visualRegime) return object.visualRegime;
    const text = `${object.material || ''} ${object.shape || ''} ${object.role || ''} ${object.kind || ''}`.toLowerCase();
    if (/mycelium|bacteria|protein|leaf|biology|colony|infection/.test(text)) return 'biological';
    if (/membrane|gel|foam|soft|adhesion|cohesion/.test(text)) return 'soft';
    if (/atom|electron|ion|molecule|crystal|lattice|carbon/.test(text)) return 'atomic';
    if (/electric|charge|current|copper|silicon|conductor/.test(text)) return 'electrical';
    if (/sound|acoustic|wave|resonance/.test(text)) return 'acoustic';
    if (/phase|melt|freeze|boil|ice|steam/.test(text)) return 'phase';
    if (/fire|flame|plasma|combust|heat|thermal|smoke|plume/.test(text)) return 'thermal';
    if (/water|river|fluid|flow|pool|air|wind|brine|mercury/.test(text)) return 'fluid';
    if (/glass|light|lens|prism|ray|mirror|sensor|panel/.test(text)) return 'optical';
    if (/ferrofluid|gold|magnet|metal|electro|wheel|motor|bar|rail|field/.test(text)) return 'magnetic';
    if (/rock|wood|soil|sand|terrain|grain|fuel|biomass|wall|ridge/.test(text)) return 'granular';
    return 'generic';
  }

  function objectMaterialKey(object) {
    const text = `${object && object.id || ''} ${object && object.type || ''} ${object && object.role || ''}`.toLowerCase();
    if (/mycelium|bacteria|protein|leaf|cell|biology|colony/.test(text)) return 'bacteria';
    if (/membrane|gel|foam|soft/.test(text)) return 'membrane';
    if (/copper|silicon|carbon|electron|ion|electric|atomic/.test(text)) return 'copper';
    if (/fire|flame|plasma|heat|combust|smoke/.test(text)) return 'fire';
    if (/water|river|fluid|flow|pool|air|wind|brine|mercury/.test(text)) return 'water';
    if (/glass|lens|prism|light|ray|sensor|panel/.test(text)) return 'glass';
    if (/magnet|metal|wheel|motor|bar|rail|ledger/.test(text)) return 'metal';
    if (/wood|fuel|biomass|soil|sand|rock|terrain|wall/.test(text)) return 'soil';
    return 'light';
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

  function drawBiologicalContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let branch = 0; branch < 9; branch += 1) {
      const angle = branch * TAU / 9 + Math.sin(state.t * 0.18 + branch) * 0.16;
      const length = extent.w * (0.2 + hashNoise(index * 71, branch) * 0.34);
      ctx.strokeStyle = `hsla(${hue + branch * 11}, 58%, 46%, ${0.1 + branch * 0.006})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(
        Math.cos(angle) * length * 0.22,
        Math.sin(angle) * length * 0.18,
        Math.cos(angle + 0.4) * length * 0.62,
        Math.sin(angle + 0.4) * length * 0.5,
        Math.cos(angle) * length,
        Math.sin(angle) * length * 0.72
      );
      ctx.stroke();
    }
    for (let i = 0; i < 16; i += 1) {
      const a = i * TAU / 16 + state.t * 0.06;
      const r = extent.w * (0.08 + hashNoise(index * 73, i) * 0.36);
      ctx.fillStyle = `hsla(${hue + 42}, 64%, 54%, ${0.08 + hashNoise(index * 79, i) * 0.08})`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a * 1.3) * r * 0.62, 1.2 + hashNoise(index * 83, i) * 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSoftContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let band = 0; band < 8; band += 1) {
      const y = (band - 3.5) * extent.h * 0.09;
      ctx.strokeStyle = `hsla(${hue + band * 8}, 70%, 64%, ${0.13 - band * 0.007})`;
      ctx.lineWidth = 1.2 + band * 0.08;
      ctx.beginPath();
      for (let step = 0; step <= 18; step += 1) {
        const x = -extent.w * 0.52 + step * extent.w / 18;
        const yy = y + Math.sin(step * 0.78 + state.t * 0.8 + band + index) * extent.h * 0.045;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(extent.w, extent.h) * 0.58);
    glow.addColorStop(0, `hsla(${hue}, 90%, 74%, 0.08)`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, extent.w * 0.52, extent.h * 0.38, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawAtomicContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let shell = 0; shell < 5; shell += 1) {
      ctx.strokeStyle = `hsla(${hue + shell * 24}, 82%, 58%, ${0.12 - shell * 0.012})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, 0, extent.w * (0.16 + shell * 0.065), extent.h * 0.2, state.t * 0.14 + shell, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 10; i += 1) {
      const orbit = i % 5;
      const a = state.t * (0.2 + orbit * 0.03) + i * 1.73;
      const x = Math.cos(a) * extent.w * (0.18 + orbit * 0.05);
      const y = Math.sin(a * 1.4) * extent.h * (0.12 + orbit * 0.035);
      drawPrismaticParticle(ctx, x, y, 1.4 + orbit * 0.2, hue + orbit * 32, 0.12, a);
    }
    ctx.restore();
  }

  function drawElectricalContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let line = -4; line <= 4; line += 1) {
      ctx.strokeStyle = `hsla(${hue + line * 9}, 92%, 58%, 0.12)`;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.55, line * extent.h * 0.055);
      ctx.bezierCurveTo(
        -extent.w * 0.2,
        line * extent.h * 0.02 + Math.sin(state.t + line) * extent.h * 0.08,
        extent.w * 0.18,
        -line * extent.h * 0.02,
        extent.w * 0.55,
        -line * extent.h * 0.055
      );
      ctx.stroke();
    }
    for (let i = 0; i < 12; i += 1) {
      const x = -extent.w * 0.48 + ((state.t * 0.08 + i / 12) % 1) * extent.w * 0.96;
      const y = (hashNoise(index * 89, i) - 0.5) * extent.h * 0.42;
      drawPrismaticParticle(ctx, x, y, 1.2 + hashNoise(index * 91, i), hue + 68, 0.13, 0);
    }
    ctx.restore();
  }

  function drawAcousticContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    for (let ring = 0; ring < 9; ring += 1) {
      const radius = extent.w * (0.1 + ring * 0.055 + (state.t * 0.04) % 0.05);
      ctx.strokeStyle = `hsla(${hue + ring * 7}, 78%, 46%, ${0.24 - ring * 0.014})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.62, Math.sin(index + ring) * 0.1, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPhaseContinuum(ctx, extent, state, object, index) {
    const hue = materialHueFor(object.material, index);
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let band = 0; band < 10; band += 1) {
      const y = -extent.h * 0.42 + band * extent.h * 0.092;
      const phase = Math.sin(state.t * 0.45 + band + index) * extent.h * 0.04;
      ctx.strokeStyle = `hsla(${hue + band * 12}, 82%, ${44 + band}%, ${0.12 - band * 0.006})`;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.5, y + phase);
      ctx.bezierCurveTo(-extent.w * 0.18, y - phase, extent.w * 0.18, y + phase, extent.w * 0.5, y - phase);
      ctx.stroke();
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

  function drawPrismaticParticle(ctx, x, y, radius, hue, alpha, phase = 0) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4.5);
    glow.addColorStop(0, `hsla(${hue}, 96%, 72%, ${alpha * 1.4})`);
    glow.addColorStop(0.36, `hsla(${hue + 42}, 96%, 64%, ${alpha * 0.72})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 4.5, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = `hsla(${hue + 86}, 98%, 62%, ${alpha * 0.72})`;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(phase) * radius * 4.2, y - Math.sin(phase) * radius * 1.2);
    ctx.lineTo(x + Math.cos(phase) * radius * 4.2, y + Math.sin(phase) * radius * 1.2);
    ctx.stroke();
  }

  function materialHueFor(material, index = 0) {
    const hues = {
      air: 190,
      bacteria: 126,
      brine: 184,
      carbon: 230,
      copper: 24,
      ferrofluid: 226,
      fire: 24,
      foam: 176,
      gel: 164,
      glass: 205,
      gold: 46,
      leaf: 112,
      light: 52,
      magnet: 288,
      membrane: 276,
      metal: 218,
      mercury: 204,
      mycelium: 68,
      protein: 286,
      rock: 78,
      sand: 42,
      silicon: 210,
      smoke: 238,
      soil: 34,
      water: 198,
      wood: 30,
    };
    return (hues[material] || 168) + index * 11;
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
      ctx.beginPath();
      ctx.moveTo((from[0] + offset) * width, from[1] * height);
      ctx.bezierCurveTo(
        (from[0] + offset * 0.4) * width,
        (from[1] * 0.65 + to[1] * 0.35) * height,
        (to[0] + offset * 0.6) * width,
        (from[1] * 0.3 + to[1] * 0.7) * height,
        (to[0] + offset) * width,
        to[1] * height
      );
      ctx.stroke();
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
    const visibleIds = visiblePlanObjectIds(plan);
    const relations = (plan.relations || [])
      .filter((relation) => visibleIds.has(relation.from) && visibleIds.has(relation.to))
      .slice(0, 14);
    if (!relations.length) return;
    ctx.save();
    for (const relation of relations) {
      const from = planObjectCenter(plan, relation.from, width, height);
      const to = planObjectCenter(plan, relation.to, width, height);
      if (!from || !to) continue;
      const hue = relation.channel.includes('heat') || relation.channel.includes('fuel') ? 22 :
        relation.channel.includes('light') || relation.channel.includes('spectrum') ? 222 :
          relation.channel.includes('energy') ? 45 : relation.channel.includes('flow') ? 196 : 152;
      const strength = Number.isFinite(Number(relation.strength)) ? Number(relation.strength) : 0.48;
      ctx.beginPath();
      const midY = (from.y + to.y) / 2 + Math.sin(state.t + from.x * 0.01) * 5;
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo((from.x + to.x) / 2, midY, to.x, to.y);
      ctx.strokeStyle = `hsla(${hue}, 54%, 18%, ${0.08 + strength * 0.08})`;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.strokeStyle = `hsla(${hue + 18}, 86%, 56%, ${0.14 + strength * 0.16})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      for (let pulse = 0; pulse < 2; pulse += 1) {
        const t = (state.t * 0.08 + pulse * 0.5 + hashNoise(relation.from.length, relation.to.length)) % 1;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t + Math.sin(t * TAU + state.t) * 6;
        drawPrismaticParticle(ctx, x, y, 1.5 + strength * 1.4, hue + pulse * 38, 0.11 + strength * 0.08, t * TAU);
      }
    }
    ctx.restore();
  }

  function drawPlanObjects(ctx, width, height, state, plan) {
    const objects = visiblePlanObjects(plan);
    for (let index = 0; index < objects.length; index += 1) {
      drawPlanObject(ctx, width, height, state, plan, objects[index], index);
    }
  }

  function visiblePlanObjects(plan) {
    const objects = plan.objects || [];
    const sceneKind = sceneKindForPlan(plan);
    const direct = objects.filter((object) => isPromptDerivedVisualObject(object, sceneKind));
    if (direct.length >= 2) {
      const directIds = new Set(direct.map((object) => object.id));
      const contextLimit = visibleContextLimit(sceneKind, direct.length);
      const context = objects
        .filter((object) => !directIds.has(object.id) && isEssentialSceneContext(object, sceneKind))
        .slice(0, contextLimit);
      return orderVisibleObjects(uniqueObjectsById([...direct, ...context])).slice(0, 16);
    }
    const primary = objects.filter((object) => isPrimaryVisualObject(object));
    if (primary.length >= 3) return orderVisibleObjects(primary).slice(0, 16);
    return orderVisibleObjects(objects.filter((object) => isSceneVisualObject(object))).slice(0, 16);
  }

  function visiblePlanObjectIds(plan) {
    return new Set(visiblePlanObjects(plan).map((object) => object.id));
  }

  function uniqueObjectsById(objects) {
    const seen = new Set();
    return (objects || []).filter((object) => {
      if (!object || seen.has(object.id)) return false;
      seen.add(object.id);
      return true;
    });
  }

  function visibleContextLimit(sceneKind, directCount) {
    const painterKind = painterKindForScene(sceneKind);
    const limits = {
      mechanical: 2,
      'thin-film': 1,
      ferrofluid: 3,
      'thermal-plume': 2,
      'material-tray': 5,
      optics: 4,
      watershed: 6,
      biology: 7,
      acoustic: 4,
      city: 10,
    };
    return Math.max(0, Math.min(limits[painterKind] ?? 4, 12 - directCount));
  }

  function orderVisibleObjects(objects) {
    return (objects || []).slice().sort((a, b) => visualObjectDepth(a) - visualObjectDepth(b));
  }

  function visualObjectDepth(object) {
    const text = literalObjectText(object);
    const shape = String(object && object.shape || '');
    if (/wetland|swamp|heightfield|fuel-bed|grain-bed|volcano|storm/.test(text)) return 0;
    if (/singularity|black hole/.test(text)) return 1;
    if (/rocket|submarine|castle|tower|building|lava-flow/.test(shape)) return 1;
    if (/film|wire-loop|wheel|cooling-fins|sieve|pool|instrument|turbine/.test(shape)) return 2;
    if (/bar|slab|slider|lens|prism|magnet|network-node|queue-node|plant-cluster/.test(shape)) return 3;
    if (/bubble|coil|hammer/.test(shape)) return 4;
    if (/animal-body/.test(shape)) return 5;
    if (/collision|fractur|impact|meter/.test(text)) return 6;
    return 3;
  }

  function isPromptDerivedVisualObject(object, sceneKind = '') {
    const source = String(object && object.source || '');
    const shape = String(object && object.shape || '');
    if (!/^embedding-guided-synth|open-semantic-rag|doppler-residual/.test(source)) return false;
    if (/embedding-guided-synth-event/.test(source)) return false;
    if (shape === 'field-envelope') return false;
    if (shape === 'meter' && sceneKind !== 'city') return false;
    return true;
  }

  function isEssentialSceneContext(object, sceneKind) {
    if (!object) return false;
    const painterKind = painterKindForScene(sceneKind);
    const text = literalObjectText(object);
    const shape = String(object.shape || '');
    if (object.kind === 'field' || shape === 'field-envelope') return false;
    if (painterKind === 'mechanical') return /wall|constraint|surface-boundary|collision|energy-ledger|robot|vehicle|rider|prosthetic|force/.test(text);
    if (painterKind === 'thin-film') return /film|bubble|wire|loop|air|foam|membrane/.test(text);
    if (painterKind === 'ferrofluid') return /ferrofluid|coil|current|copper|conductor|magnet|metal|plasma|field/.test(text);
    if (painterKind === 'thermal-plume') return /thermal|plume|heat|cooling|fin|air|smoke|lava|magma|reentry/.test(text);
    if (painterKind === 'material-tray') return /reaction|chemical|material|sample|tray|catalyst|resin|crystal|paint|repository|electrolyzer/.test(text);
    if (painterKind === 'city') return /network|queue|traffic|market|sensor|ledger|controller|power|packet|blockchain|search|housing|carbon/.test(text);
    if (painterKind === 'watershed') return /water|terrain|storm|river|delta|hazard|earthquake|tsunami|hurricane|tornado|peat|oyster/.test(text);
    if (painterKind === 'biology') return /biology|cell|patient|organ|ecology|plant|animal|fish|bird|crop|greenhouse|waste|microbe/.test(text);
    if (painterKind === 'optics') return /space|orbit|planet|telescope|probe|lens|light|radiation|galaxy|asteroid|mars|venus|europa|titan/.test(text);
    if (painterKind === 'acoustic') return /sound|acoustic|wave|instrument|cochlea|music|pressure/.test(text);
    return isSceneVisualObject(object);
  }

  function isPrimaryVisualObject(object) {
    return isPromptDerivedVisualObject(object, '') ||
      isConcreteShape(object && object.shape);
  }

  function isSceneVisualObject(object) {
    if (!object) return false;
    const shape = String(object.shape || '');
    const source = String(object.source || '');
    if ((object.kind === 'field' || shape === 'field-envelope') && source === 'catalog') return false;
    if (shape === 'body' && source === 'catalog') return false;
    return isConcreteShape(shape);
  }

  function isConcreteShape(shape = '') {
    return /animal-body|wheel|coil|wire-loop|film|bubble|cooling-fins|sieve|singularity|wetland|rocket|submarine|volcano|lava-flow|instrument|castle|tower|building|turbine|storm|plant-cluster|bridge|hammer|bar|slab|slider|prism|lens|magnet|queue-node|network-node|fuel-bed|flame-front|plume|flow-path|heightfield|grain-bed|pool|panel|meter|wall/.test(String(shape));
  }

  function drawPlanObject(ctx, width, height, state, plan, object, index) {
    const boundObject = applyRenderStateBindings(object, state);
    const material = plan.materials && plan.materials[boundObject.material] || {};
    const stroke = material.stroke || '#42695d';
    const alpha = material.alpha ?? 0.72;
    const extent = objectExtentWithVisualGenome(boundObject, width, height, plan, index);
    if (!extent) return;
    const hue = boundObject.boundHue ?? materialHueFor(boundObject.material, index);
    const isField = boundObject.kind === 'field' || boundObject.shape === 'field-envelope';
    const isLiteral = isConcreteShape(boundObject.shape) && !isField;
    ctx.save();
    const inheritedAlpha = ctx.globalAlpha;
    const hasBindings = boundObject.stateBindings && Object.keys(boundObject.stateBindings).length > 0;
    const baseAlpha = isField ? 0.3 : isLiteral ? (hasBindings ? 0.58 : 0.68) : 0.56;
    ctx.globalAlpha = inheritedAlpha * Math.min(0.84, Math.max(baseAlpha, alpha));
    if (Number.isFinite(boundObject.boundAlpha)) {
      ctx.globalAlpha = Math.min(1, ctx.globalAlpha * Math.max(0.22, boundObject.boundAlpha));
    }
    ctx.strokeStyle = stroke;
    if (drawLiteralPlanObject(ctx, extent, state, boundObject, index, hue)) {
      drawBoundObjectField(ctx, extent, state, boundObject, index, hue);
      ctx.restore();
      return;
    }
    drawObjectSilhouette(ctx, extent, boundObject, index, hue);
    drawObjectMaterialKernel(ctx, extent, state, boundObject, index);
    drawObjectAccentDetails(ctx, extent, state, boundObject, index, hue);
    drawBoundObjectField(ctx, extent, state, boundObject, index, hue);
    ctx.restore();
  }

  function applyRenderStateBindings(object, state) {
    const bindings = object && object.stateBindings || {};
    const channels = state && state.solverState && state.solverState.channels || state.channelValues || {};
    if (!bindings || !Object.keys(bindings).length || !channels) return object;
    const pose = { ...(object.pose || {}) };
    const next = { ...object, pose };
    const temperature = boundScalar(channels, bindings.hue || bindings.glow);
    const damage = boundScalar(channels, bindings.crackDensity);
    const opacity = boundScalar(channels, bindings.opacity);
    const rotation = boundScalar(channels, bindings.rotation);
    const rotationRate = boundScalar(channels, bindings.rotationRate);
    const motion = boundVector(channels, bindings.motion || bindings.flow);
    if (Number.isFinite(temperature)) {
      next.boundHue = Math.max(0, Math.min(360, 12 + temperature * 52));
      next.boundHeat = temperature;
    }
    if (Number.isFinite(opacity)) next.boundAlpha = 0.42 + opacity * 0.58;
    if (Number.isFinite(damage)) next.boundDamage = damage;
    if (Number.isFinite(rotation)) pose.rotation = rotation;
    if (Number.isFinite(rotationRate)) pose.rotation = (pose.rotation || 0) + rotationRate * 0.04;
    if (motion) {
      pose.x = Math.max(0.06, Math.min(0.94, (pose.x || 0.5) + motion.x * 0.012));
      pose.y = Math.max(0.08, Math.min(0.92, (pose.y || 0.5) + motion.y * 0.012));
      next.boundMotion = Math.hypot(motion.x, motion.y);
    }
    return next;
  }

  function boundScalar(channels, id) {
    if (!id || !(id in channels)) return NaN;
    const value = channels[id];
    if (value && typeof value === 'object') return Math.hypot(Number(value.x || 0), Number(value.y || 0));
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function boundVector(channels, id) {
    if (!id || !(id in channels)) return null;
    const value = channels[id];
    if (!value || typeof value !== 'object') return null;
    const x = Number(value.x || 0);
    const y = Number(value.y || 0);
    if (!Number.isFinite(x + y)) return null;
    return { x, y };
  }

  function drawLiteralPlanObject(ctx, extent, state, object, index, hue) {
    const shape = String(object && object.shape || '').toLowerCase();
    const text = literalObjectText(object);
    if (shape === 'animal-body') return drawLiteralAnimal(ctx, extent, state, text, hue);
    if (shape === 'wheel') return drawLiteralWheel(ctx, extent, state, hue);
    if (shape === 'coil') return drawLiteralCoil(ctx, extent, state, hue);
    if (shape === 'wire-loop') return drawLiteralLoop(ctx, extent, state, hue);
    if (shape === 'film') return drawLiteralFilm(ctx, extent, state, hue);
    if (shape === 'bubble') return drawLiteralBubble(ctx, extent, state, hue);
    if (shape === 'cooling-fins') return drawLiteralFins(ctx, extent, state, hue);
    if (shape === 'sieve') return drawLiteralSieve(ctx, extent, state, hue);
    if (shape === 'singularity') return drawLiteralSingularity(ctx, extent, state);
    if (shape === 'wetland') return drawLiteralWetland(ctx, extent, state, hue);
    if (shape === 'rocket') return drawLiteralRocket(ctx, extent, state, hue);
    if (shape === 'submarine') return drawLiteralSubmarine(ctx, extent, state, hue);
    if (shape === 'volcano') return drawLiteralVolcano(ctx, extent, state, hue);
    if (shape === 'lava-flow') return drawLiteralLavaFlow(ctx, extent, state, object);
    if (shape === 'instrument') return drawLiteralInstrument(ctx, extent, state, hue);
    if (shape === 'castle') return drawLiteralCastle(ctx, extent, state, hue, object);
    if (shape === 'tower') return drawLiteralTower(ctx, extent, state, hue);
    if (shape === 'building') return drawLiteralBuilding(ctx, extent, state, hue, object);
    if (shape === 'turbine') return drawLiteralTurbine(ctx, extent, state, hue, object);
    if (shape === 'storm') return drawLiteralStorm(ctx, extent, state, hue);
    if (shape === 'plant-cluster') return drawLiteralPlantCluster(ctx, extent, state, hue);
    if (shape === 'bridge') return drawLiteralBridge(ctx, extent, hue);
    if (shape === 'hammer') return drawLiteralHammer(ctx, extent, hue);
    if (shape === 'wall') return drawLiteralWall(ctx, extent, state, hue);
    if (shape === 'bar' || shape === 'slab' || shape === 'slider') return drawLiteralBar(ctx, extent, state, hue, shape);
    if (shape === 'prism') return drawLiteralPrism(ctx, extent);
    if (shape === 'lens') return drawLiteralLens(ctx, extent, state);
    if (shape === 'magnet') return drawLiteralMagnet(ctx, extent, state);
    if (shape === 'queue-node' || shape === 'network-node') return drawLiteralNetworkNode(ctx, extent, state, text, hue);
    if (/laser|lamp|light-source|sun/.test(text)) return drawLiteralLightSource(ctx, extent);
    return false;
  }

  function drawBoundObjectField(ctx, extent, state, object, index, hue) {
    const heat = Number.isFinite(object.boundHeat) ? clamp01(object.boundHeat) : 0;
    const motion = Number.isFinite(object.boundMotion) ? clamp01(object.boundMotion) : 0;
    const damage = Number.isFinite(object.boundDamage) ? clamp01(object.boundDamage) : 0;
    const strength = clamp01(heat * 0.42 + motion * 0.32 + damage * 0.46);
    if (strength <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation * 0.35);
    const radius = Math.max(extent.w, extent.h) * (0.58 + strength * 0.32);
    const bands = 4 + Math.round(strength * 3);
    for (let band = 0; band < bands; band += 1) {
      const phase = state.t * (0.18 + motion * 0.18) + index * 0.71 + band;
      const rx = radius * (0.62 + band * 0.15 + Math.sin(phase) * 0.018);
      const ry = radius * (0.38 + band * 0.11 + Math.cos(phase * 0.7) * 0.018);
      ctx.strokeStyle = `hsla(${(hue + band * 18 + damage * 58) % 360}, ${62 + heat * 18}%, ${58 + heat * 12}%, ${0.035 + strength * 0.08})`;
      ctx.lineWidth = Math.max(1, Math.min(extent.w, extent.h) * (0.006 + band * 0.001));
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, Math.sin(phase) * 0.18, 0, TAU);
      ctx.stroke();
    }
    if (damage > 0.04) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `hsla(${(hue + 42) % 360}, 82%, 72%, ${0.08 + damage * 0.18})`;
      ctx.lineWidth = Math.max(1, Math.min(extent.w, extent.h) * 0.012);
      for (let crack = 0; crack < 5; crack += 1) {
        const angle = crack * TAU / 5 + Math.sin(state.t * 0.09 + crack) * 0.12;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * extent.w * 0.08, Math.sin(angle) * extent.h * 0.06);
        ctx.lineTo(Math.cos(angle) * extent.w * (0.32 + damage * 0.2), Math.sin(angle) * extent.h * (0.24 + damage * 0.18));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function literalObjectText(object) {
    return [
      object && object.id,
      object && object.kind,
      object && object.shape,
      object && object.material,
      object && object.role,
      object && object.visualRegime,
      object && object.phrase,
      object && object.assembly,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function drawLiteralAnimal(ctx, extent, state, text, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.12) * 0.04);
    const fur = /gerbil|hamster/.test(text) ? 34 : 208;
    ctx.shadowColor = 'rgba(20, 24, 28, 0.28)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = `hsla(${fur}, 36%, ${/mouse/.test(text) ? 48 : 42}%, 0.95)`;
    ctx.strokeStyle = `hsla(${fur}, 42%, 18%, 0.78)`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(-extent.w * 0.06, 0, extent.w * 0.46, extent.h * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(extent.w * 0.36, -extent.h * 0.05, extent.w * 0.18, extent.h * 0.17, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `hsla(${fur + 16}, 48%, 68%, 0.98)`;
    for (const y of [-0.18, 0.07]) {
      ctx.beginPath();
      ctx.arc(extent.w * 0.36, y * extent.h, extent.h * 0.1, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = `hsla(${fur}, 46%, 24%, 0.58)`;
    ctx.beginPath();
    ctx.moveTo(-extent.w * 0.5, extent.h * 0.02);
    ctx.bezierCurveTo(-extent.w * 0.82, -extent.h * 0.1, -extent.w * 0.78, extent.h * 0.26, -extent.w * 0.94, 0);
    ctx.stroke();
    ctx.fillStyle = '#17201d';
    ctx.beginPath();
    ctx.arc(extent.w * 0.43, -extent.h * 0.08, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `hsla(${fur}, 46%, 18%, 0.6)`;
    for (let foot = -1; foot <= 1; foot += 2) {
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.16, extent.h * 0.24 * foot);
      ctx.lineTo(extent.w * 0.22, extent.h * 0.34 * foot);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralWheel(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + state.t * 0.18);
    const r = Math.min(extent.w, extent.h) * 0.46;
    ctx.strokeStyle = `hsla(${hue}, 48%, 22%, 0.78)`;
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1.35;
    for (let spoke = 0; spoke < 12; spoke += 1) {
      const a = spoke * TAU / 12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
      ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${hue + 62}, 86%, 58%, 0.32)`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, TAU);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralCoil(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    ctx.strokeStyle = `hsla(${hue || 24}, 76%, 42%, 0.82)`;
    ctx.lineWidth = 2;
    for (let loop = 0; loop < 8; loop += 1) {
      const x = -extent.w * 0.34 + loop * extent.w * 0.1;
      ctx.beginPath();
      ctx.ellipse(x, 0, extent.w * 0.09, extent.h * 0.34, Math.sin(state.t * 0.14) * 0.08, 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${hue + 158}, 76%, 54%, 0.34)`;
    ctx.beginPath();
    ctx.moveTo(-extent.w * 0.54, extent.h * 0.28);
    ctx.lineTo(extent.w * 0.54, -extent.h * 0.28);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralLoop(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.12) * 0.04);
    ctx.strokeStyle = `hsla(${hue || 24}, 52%, 28%, 0.78)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, extent.w * 0.48, extent.h * 0.42, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `hsla(${hue + 78}, 86%, 66%, 0.34)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralFilm(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.09) * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, 0, extent.w * 0.48, extent.h * 0.42, 0, 0, TAU);
    ctx.clip();
    for (let band = 0; band < 12; band += 1) {
      const y = -extent.h * 0.46 + band * extent.h / 11;
      ctx.strokeStyle = `hsla(${(hue + band * 28 + state.t * 8) % 360}, 96%, 62%, 0.3)`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.54, y);
      ctx.quadraticCurveTo(0, y + Math.sin(state.t + band) * 7, extent.w * 0.54, y);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralBubble(ctx, extent, state, hue) {
    ctx.save();
    const r = Math.min(extent.w, extent.h) * 0.44;
    const x = extent.x;
    const y = extent.y + Math.sin(state.t * 0.3) * 2;
    const gradient = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255,255,255,0.58)');
    gradient.addColorStop(0.45, `hsla(${hue + 42}, 94%, 72%, 0.18)`);
    gradient.addColorStop(1, `hsla(${hue}, 82%, 50%, 0.08)`);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = `hsla(${hue + 24}, 86%, 62%, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralFins(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    for (let fin = 0; fin < 11; fin += 1) {
      const x = -extent.w * 0.45 + fin * extent.w * 0.09;
      const h = extent.h * (0.52 + hashNoise(613, fin) * 0.22);
      ctx.fillStyle = `hsla(${hue || 210}, 28%, ${48 + fin}%, 0.46)`;
      ctx.strokeStyle = `hsla(${hue}, 36%, 22%, 0.36)`;
      ctx.beginPath();
      ctx.rect(x, -h * 0.5 + Math.sin(state.t * 0.2 + fin), extent.w * 0.045, h);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralSieve(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation - 0.12 + Math.sin(state.t * 0.16) * 0.02);
    ctx.strokeStyle = `hsla(${hue || 34}, 42%, 28%, 0.58)`;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-extent.w * 0.5, -extent.h * 0.35, extent.w, extent.h * 0.7);
    for (let i = 1; i < 9; i += 1) {
      const x = -extent.w * 0.5 + i * extent.w / 9;
      ctx.beginPath();
      ctx.moveTo(x, -extent.h * 0.35);
      ctx.lineTo(x, extent.h * 0.35);
      ctx.stroke();
    }
    for (let i = 1; i < 4; i += 1) {
      const y = -extent.h * 0.35 + i * extent.h * 0.7 / 4;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.5, y);
      ctx.lineTo(extent.w * 0.5, y);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralSingularity(ctx, extent, state) {
    ctx.save();
    const r = Math.min(extent.w, extent.h) * 0.44;
    const gradient = ctx.createRadialGradient(extent.x, extent.y, r * 0.12, extent.x, extent.y, r * 1.7);
    gradient.addColorStop(0, 'rgba(0,0,0,0.94)');
    gradient.addColorStop(0.34, 'rgba(8,10,20,0.92)');
    gradient.addColorStop(0.66, 'rgba(106,74,190,0.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(extent.x, extent.y, r * 1.7, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 206, 94, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(extent.x, extent.y, r * 1.24, r * 0.38, state.t * 0.08, 0, TAU);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralWetland(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.fillStyle = `hsla(${hue || 146}, 46%, 34%, 0.24)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, extent.w * 0.5, extent.h * 0.34, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue + 58}, 64%, 42%, 0.4)`;
    for (let reed = 0; reed < 14; reed += 1) {
      const x = -extent.w * 0.42 + reed * extent.w * 0.064;
      ctx.beginPath();
      ctx.moveTo(x, extent.h * 0.2);
      ctx.lineTo(x + Math.sin(state.t * 0.2 + reed) * 4, -extent.h * 0.28);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralRocket(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation - 0.08 + Math.sin(state.t * 0.08) * 0.03);
    ctx.shadowColor = 'rgba(28, 36, 60, 0.24)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    const body = ctx.createLinearGradient(-extent.w * 0.32, 0, extent.w * 0.34, 0);
    body.addColorStop(0, `hsla(${hue || 212}, 32%, 34%, 0.92)`);
    body.addColorStop(0.52, 'rgba(235, 244, 252, 0.96)');
    body.addColorStop(1, `hsla(${hue + 42}, 44%, 48%, 0.88)`);
    ctx.fillStyle = body;
    ctx.strokeStyle = `hsla(${hue || 212}, 42%, 22%, 0.62)`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(extent.w * 0.48, 0);
    ctx.bezierCurveTo(extent.w * 0.28, -extent.h * 0.32, -extent.w * 0.28, -extent.h * 0.28, -extent.w * 0.42, 0);
    ctx.bezierCurveTo(-extent.w * 0.28, extent.h * 0.28, extent.w * 0.28, extent.h * 0.32, extent.w * 0.48, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `hsla(${(hue + 154) % 360}, 74%, 64%, 0.58)`;
    ctx.beginPath();
    ctx.arc(extent.w * 0.14, -extent.h * 0.02, Math.min(extent.w, extent.h) * 0.1, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `hsla(${hue + 16}, 82%, 42%, 0.82)`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.24, side * extent.h * 0.2);
      ctx.lineTo(-extent.w * 0.46, side * extent.h * 0.5);
      ctx.lineTo(-extent.w * 0.06, side * extent.h * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'screen';
    const flame = ctx.createRadialGradient(-extent.w * 0.52, 0, 0, -extent.w * 0.52, 0, extent.w * 0.34);
    flame.addColorStop(0, 'rgba(255, 236, 108, 0.82)');
    flame.addColorStop(0.48, 'rgba(255, 92, 44, 0.36)');
    flame.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.ellipse(-extent.w * 0.55, 0, extent.w * 0.32, extent.h * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    return true;
  }

  function drawLiteralSubmarine(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y + Math.sin(state.t * 0.12) * 2);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.09) * 0.025);
    const body = ctx.createLinearGradient(-extent.w * 0.5, 0, extent.w * 0.5, 0);
    body.addColorStop(0, `hsla(${hue || 194}, 36%, 32%, 0.9)`);
    body.addColorStop(0.5, `hsla(${hue + 20}, 52%, 52%, 0.88)`);
    body.addColorStop(1, `hsla(${hue || 194}, 34%, 28%, 0.9)`);
    ctx.fillStyle = body;
    ctx.strokeStyle = `hsla(${hue || 194}, 44%, 18%, 0.58)`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, extent.h * 0.08, extent.w * 0.5, extent.h * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `hsla(${hue + 12}, 42%, 38%, 0.86)`;
    ctx.fillRect(-extent.w * 0.1, -extent.h * 0.22, extent.w * 0.22, extent.h * 0.22);
    ctx.strokeRect(-extent.w * 0.1, -extent.h * 0.22, extent.w * 0.22, extent.h * 0.22);
    ctx.strokeStyle = `hsla(${hue + 150}, 70%, 62%, 0.44)`;
    ctx.beginPath();
    ctx.moveTo(0, -extent.h * 0.22);
    ctx.lineTo(0, -extent.h * 0.42);
    ctx.lineTo(extent.w * 0.16, -extent.h * 0.42);
    ctx.stroke();
    for (let port = 0; port < 4; port += 1) {
      const x = -extent.w * 0.28 + port * extent.w * 0.16;
      ctx.fillStyle = 'rgba(176, 232, 248, 0.58)';
      ctx.beginPath();
      ctx.arc(x, extent.h * 0.05, Math.min(extent.w, extent.h) * 0.045, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${hue + 168}, 80%, 58%, 0.22)`;
    ctx.lineWidth = 1.2;
    for (let wave = 0; wave < 3; wave += 1) {
      const y = extent.h * (0.32 + wave * 0.1);
      ctx.beginPath();
      for (let step = 0; step <= 9; step += 1) {
        const x = -extent.w * 0.46 + step * extent.w * 0.12;
        const yy = y + Math.sin(state.t * 0.8 + step + wave) * extent.h * 0.025;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralVolcano(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    const rockHue = hue || 28;
    const rock = ctx.createLinearGradient(0, -extent.h * 0.42, 0, extent.h * 0.48);
    rock.addColorStop(0, `hsla(${rockHue}, 26%, 38%, 0.88)`);
    rock.addColorStop(1, `hsla(${rockHue}, 28%, 20%, 0.92)`);
    ctx.fillStyle = rock;
    ctx.strokeStyle = `hsla(${rockHue}, 32%, 18%, 0.58)`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-extent.w * 0.54, extent.h * 0.46);
    ctx.lineTo(-extent.w * 0.18, -extent.h * 0.36);
    ctx.lineTo(extent.w * 0.06, -extent.h * 0.2);
    ctx.lineTo(extent.w * 0.28, -extent.h * 0.38);
    ctx.lineTo(extent.w * 0.56, extent.h * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 84, 40, 0.82)';
    ctx.beginPath();
    ctx.ellipse(extent.w * 0.04, -extent.h * 0.26, extent.w * 0.2, extent.h * 0.07, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'screen';
    for (let jet = 0; jet < 5; jet += 1) {
      const x = extent.w * (-0.12 + jet * 0.06);
      const lift = extent.h * (0.3 + hashNoise(221, jet) * 0.2);
      ctx.strokeStyle = `hsla(${18 + jet * 8}, 96%, ${54 + jet * 4}%, 0.42)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, -extent.h * 0.28);
      ctx.bezierCurveTo(
        x + Math.sin(state.t * 0.7 + jet) * extent.w * 0.08,
        -extent.h * 0.48,
        x + extent.w * 0.08,
        -lift,
        x + Math.sin(jet) * extent.w * 0.12,
        -extent.h * 0.58
      );
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralLavaFlow(ctx, extent, state, object = {}) {
    const heat = Number.isFinite(object.boundHeat) ? object.boundHeat : 0.9;
    const motion = Number.isFinite(object.boundMotion) ? object.boundMotion : 0.4;
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.08 + motion) * 0.035);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(108, ${Math.round(28 + heat * 12)}, 24, 0.72)`;
    ctx.lineWidth = Math.max(5, extent.h * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-extent.w * 0.48, -extent.h * 0.12);
    ctx.bezierCurveTo(-extent.w * 0.18, -extent.h * 0.34, extent.w * 0.08, extent.h * 0.24, extent.w * 0.5, extent.h * 0.06);
    ctx.stroke();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255, ${Math.round(86 + heat * 42)}, 42, ${Math.min(0.88, 0.48 + heat * 0.22)})`;
    ctx.lineWidth = Math.max(3, extent.h * 0.07);
    ctx.beginPath();
    ctx.moveTo(-extent.w * 0.46, -extent.h * 0.12);
    for (let step = 1; step <= 12; step += 1) {
      const x = -extent.w * 0.46 + step * extent.w * 0.08;
      const y = Math.sin(step * 0.9 + state.t * (0.45 + motion * 0.36)) * extent.h * 0.15;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 230, ${Math.round(92 + heat * 52)}, ${Math.min(0.7, 0.28 + heat * 0.2)})`;
    ctx.lineWidth = Math.max(1.4, extent.h * 0.025);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralInstrument(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.1) * 0.02);
    ctx.fillStyle = `hsla(${hue || 32}, 42%, 28%, 0.9)`;
    ctx.strokeStyle = `hsla(${hue || 32}, 42%, 16%, 0.62)`;
    ctx.lineWidth = 1.6;
    ctx.fillRect(-extent.w * 0.48, -extent.h * 0.24, extent.w * 0.96, extent.h * 0.5);
    ctx.strokeRect(-extent.w * 0.48, -extent.h * 0.24, extent.w * 0.96, extent.h * 0.5);
    ctx.fillStyle = 'rgba(244, 238, 220, 0.9)';
    ctx.fillRect(-extent.w * 0.42, extent.h * 0.02, extent.w * 0.84, extent.h * 0.16);
    ctx.fillStyle = 'rgba(24, 28, 34, 0.82)';
    for (let key = 0; key < 8; key += 1) {
      const x = -extent.w * 0.38 + key * extent.w * 0.1;
      ctx.fillRect(x, extent.h * 0.02, extent.w * 0.035, extent.h * 0.1);
    }
    ctx.strokeStyle = `hsla(${hue + 172}, 82%, 68%, 0.32)`;
    ctx.lineWidth = 1.1;
    for (let string = 0; string < 6; string += 1) {
      const y = -extent.h * 0.18 + string * extent.h * 0.055;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.36, y);
      ctx.quadraticCurveTo(0, y + Math.sin(state.t * 0.5 + string) * 2.4, extent.w * 0.36, y);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralCastle(ctx, extent, state, hue, object = {}) {
    const damage = Number.isFinite(object.boundDamage) ? object.boundDamage : 0;
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.08) * 0.015);
    const iceHue = hue || 196;
    ctx.fillStyle = `hsla(${iceHue}, 62%, 78%, 0.72)`;
    ctx.strokeStyle = `hsla(${iceHue}, 56%, 38%, 0.52)`;
    ctx.lineWidth = 1.5;
    const baseY = extent.h * 0.28;
    ctx.fillRect(-extent.w * 0.42, -extent.h * 0.04, extent.w * 0.84, extent.h * 0.34);
    ctx.strokeRect(-extent.w * 0.42, -extent.h * 0.04, extent.w * 0.84, extent.h * 0.34);
    for (const x of [-0.34, 0, 0.34]) {
      const towerH = x === 0 ? extent.h * 0.68 : extent.h * 0.5;
      const towerW = extent.w * 0.18;
      ctx.fillRect(extent.w * x - towerW * 0.5, baseY - towerH, towerW, towerH);
      ctx.strokeRect(extent.w * x - towerW * 0.5, baseY - towerH, towerW, towerH);
      ctx.beginPath();
      ctx.moveTo(extent.w * x - towerW * 0.62, baseY - towerH);
      ctx.lineTo(extent.w * x, baseY - towerH - extent.h * 0.16);
      ctx.lineTo(extent.w * x + towerW * 0.62, baseY - towerH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${iceHue + 34}, 82%, 92%, 0.34)`;
    for (let facet = 0; facet < 7; facet += 1) {
      const x = -extent.w * 0.36 + facet * extent.w * 0.12;
      ctx.beginPath();
      ctx.moveTo(x, extent.h * 0.22);
      ctx.lineTo(x + Math.sin(facet) * extent.w * 0.05, -extent.h * 0.3);
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${iceHue + 46}, 88%, 82%, ${Math.min(0.62, 0.12 + damage * 0.66)})`;
    ctx.lineWidth = Math.max(1, extent.w * 0.012);
    for (let crack = 0; crack < Math.ceil(2 + damage * 8); crack += 1) {
      const x = -extent.w * 0.32 + crack * extent.w * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, -extent.h * 0.2);
      ctx.lineTo(x + Math.sin(crack * 1.7) * extent.w * 0.08, extent.h * 0.24);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralTower(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.1) * 0.025);
    const towerHue = hue || 188;
    const gradient = ctx.createLinearGradient(0, -extent.h * 0.52, 0, extent.h * 0.5);
    gradient.addColorStop(0, `hsla(${towerHue}, 72%, 82%, 0.72)`);
    gradient.addColorStop(1, `hsla(${towerHue + 18}, 48%, 42%, 0.62)`);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = `hsla(${towerHue}, 52%, 30%, 0.56)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -extent.h * 0.52);
    ctx.lineTo(extent.w * 0.32, extent.h * 0.46);
    ctx.lineTo(-extent.w * 0.24, extent.h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = `hsla(${towerHue + 62}, 92%, 90%, 0.34)`;
    for (let facet = 0; facet < 4; facet += 1) {
      ctx.beginPath();
      ctx.moveTo(0, -extent.h * 0.46);
      ctx.lineTo((-0.18 + facet * 0.12) * extent.w, extent.h * 0.42);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralTurbine(ctx, extent, state, hue, object = {}) {
    const motion = Number.isFinite(object.boundMotion) ? object.boundMotion : 0;
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + state.t * (0.16 + motion * 0.08));
    const bladeHue = hue || 206;
    ctx.fillStyle = `hsla(${bladeHue}, 38%, 42%, 0.64)`;
    ctx.strokeStyle = `hsla(${bladeHue}, 42%, 20%, 0.54)`;
    ctx.lineWidth = 1.4;
    for (let blade = 0; blade < 4; blade += 1) {
      ctx.save();
      ctx.rotate(blade * TAU / 4);
      ctx.beginPath();
      ctx.moveTo(extent.w * 0.04, -extent.h * 0.05);
      ctx.bezierCurveTo(extent.w * 0.42, -extent.h * 0.18, extent.w * 0.54, extent.h * 0.04, extent.w * 0.16, extent.h * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = `hsla(${bladeHue + 44}, 48%, 72%, 0.88)`;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(extent.w, extent.h) * 0.13, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralStorm(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    const stormHue = hue || 216;
    ctx.globalAlpha *= 0.86;
    ctx.fillStyle = `hsla(${stormHue}, 36%, 34%, 0.34)`;
    ctx.strokeStyle = `hsla(${stormHue + 20}, 64%, 58%, 0.26)`;
    ctx.lineWidth = 1.6;
    for (let cloud = 0; cloud < 5; cloud += 1) {
      const x = -extent.w * 0.32 + cloud * extent.w * 0.16;
      const y = -extent.h * 0.12 + Math.sin(state.t * 0.12 + cloud) * extent.h * 0.04;
      ctx.beginPath();
      ctx.ellipse(x, y, extent.w * 0.18, extent.h * 0.14, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    for (let band = 0; band < 6; band += 1) {
      const y = -extent.h * 0.02 + band * extent.h * 0.1;
      ctx.strokeStyle = `hsla(${stormHue + band * 12}, 72%, 54%, ${0.16 + band * 0.025})`;
      ctx.beginPath();
      for (let step = 0; step <= 12; step += 1) {
        const x = -extent.w * 0.44 + step * extent.w * 0.08;
        const yy = y + Math.sin(state.t * 0.9 + step * 0.8 + band) * extent.h * 0.04;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(118, 196, 255, 0.24)';
    for (let drop = 0; drop < 12; drop += 1) {
      const x = -extent.w * 0.44 + drop * extent.w * 0.08;
      const y = extent.h * (0.18 + hashNoise(447, drop) * 0.26);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - extent.w * 0.04, y + extent.h * 0.14);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralPlantCluster(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    const plantHue = hue || 118;
    ctx.strokeStyle = `hsla(${plantHue}, 48%, 30%, 0.54)`;
    ctx.lineWidth = 1.5;
    for (let stem = 0; stem < 9; stem += 1) {
      const x = -extent.w * 0.38 + stem * extent.w * 0.095;
      const sway = Math.sin(state.t * 0.18 + stem) * extent.w * 0.035;
      ctx.beginPath();
      ctx.moveTo(x, extent.h * 0.34);
      ctx.quadraticCurveTo(x + sway, 0, x + sway * 1.6, -extent.h * (0.18 + hashNoise(593, stem) * 0.18));
      ctx.stroke();
      ctx.fillStyle = `hsla(${plantHue + stem * 6}, 62%, ${38 + stem}%, 0.54)`;
      ctx.beginPath();
      ctx.ellipse(x + sway, -extent.h * 0.05, extent.w * 0.06, extent.h * 0.12, sway * 0.03, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `hsla(${plantHue + 70}, 92%, 68%, 0.28)`;
      ctx.beginPath();
      ctx.arc(x + sway * 1.5, -extent.h * 0.2, Math.min(extent.w, extent.h) * 0.035, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralBridge(ctx, extent, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    ctx.strokeStyle = `hsla(${hue || 32}, 42%, 28%, 0.76)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-extent.w * 0.5, extent.h * 0.25);
    ctx.lineTo(extent.w * 0.5, extent.h * 0.25);
    ctx.moveTo(-extent.w * 0.42, extent.h * 0.25);
    ctx.lineTo(-extent.w * 0.18, -extent.h * 0.28);
    ctx.lineTo(extent.w * 0.08, extent.h * 0.25);
    ctx.lineTo(extent.w * 0.34, -extent.h * 0.28);
    ctx.lineTo(extent.w * 0.48, extent.h * 0.25);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralHammer(ctx, extent, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation - 0.45);
    ctx.fillStyle = `hsla(${hue || 34}, 38%, 36%, 0.76)`;
    ctx.fillRect(-extent.w * 0.08, -extent.h * 0.48, extent.w * 0.16, extent.h * 0.9);
    ctx.fillStyle = 'rgba(92, 96, 100, 0.82)';
    ctx.fillRect(-extent.w * 0.38, -extent.h * 0.54, extent.w * 0.76, extent.h * 0.22);
    ctx.restore();
    return true;
  }

  function drawLiteralWall(ctx, extent, state, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    const w = Math.max(extent.w, extent.h * 0.28);
    const h = Math.max(extent.h, extent.w * 1.8);
    const gradient = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    gradient.addColorStop(0, `hsla(${hue || 88}, 24%, 48%, 0.64)`);
    gradient.addColorStop(1, `hsla(${hue || 88}, 28%, 28%, 0.78)`);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = `hsla(${hue || 88}, 26%, 18%, 0.62)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.rect(-w * 0.5, -h * 0.5, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = `hsla(${hue + 42}, 46%, 72%, 0.22)`;
    for (let row = 1; row < 7; row += 1) {
      const y = -h * 0.5 + row * h / 7;
      ctx.beginPath();
      ctx.moveTo(-w * 0.46, y);
      ctx.lineTo(w * 0.46, y + Math.sin(state.t * 0.12 + row) * 1.2);
      ctx.stroke();
    }
    for (let col = 1; col < 3; col += 1) {
      const x = -w * 0.5 + col * w / 3;
      ctx.beginPath();
      ctx.moveTo(x, -h * 0.44);
      ctx.lineTo(x + Math.sin(col) * 2, h * 0.44);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function drawLiteralBuilding(ctx, extent, state, hue, object) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    const heat = Number.isFinite(object && object.boundHeat) ? clamp01(object.boundHeat) : 0;
    const damage = Number.isFinite(object && object.boundDamage) ? clamp01(object.boundDamage) : 0;
    const w = Math.max(extent.w * 1.25, extent.h * 0.72);
    const h = Math.max(extent.h * 1.9, extent.w * 0.92);
    const roof = h * 0.12;
    const gradient = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    gradient.addColorStop(0, `hsla(${hue || 92}, 18%, ${52 + heat * 18}%, 0.76)`);
    gradient.addColorStop(1, `hsla(${hue || 92}, 22%, ${30 + heat * 10}%, 0.86)`);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = `hsla(${hue || 92}, 24%, 18%, 0.7)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.46, -h * 0.42 + roof);
    ctx.lineTo(-w * 0.18, -h * 0.52);
    ctx.lineTo(w * 0.48, -h * 0.42);
    ctx.lineTo(w * 0.46, h * 0.5);
    ctx.lineTo(-w * 0.46, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const rows = 4;
    const cols = 3;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = -w * 0.28 + col * w * 0.23;
        const y = -h * 0.2 + row * h * 0.16;
        const flicker = heat * (0.28 + hashNoise(row * 13, col) * 0.34) * (0.7 + Math.sin(state.t * 0.18 + row + col) * 0.3);
        ctx.fillStyle = flicker > 0.04
          ? `rgba(255, ${130 + flicker * 90}, ${42 + flicker * 80}, ${0.24 + flicker * 0.52})`
          : 'rgba(218, 235, 236, 0.22)';
        ctx.fillRect(x, y, w * 0.12, h * 0.075);
      }
    }
    if (heat > 0.05) {
      ctx.globalCompositeOperation = 'screen';
      for (let flame = 0; flame < 5; flame += 1) {
        const x = -w * 0.34 + flame * w * 0.18;
        const y = -h * (0.18 + hashNoise(37, flame) * 0.34);
        const sway = Math.sin(state.t * 0.22 + flame) * w * 0.035;
        ctx.fillStyle = `rgba(255, ${94 + flame * 18}, 38, ${0.18 + heat * 0.32})`;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.04, y + h * 0.08);
        ctx.bezierCurveTo(x + sway, y - h * 0.06, x + sway * 1.4, y - h * 0.16, x + w * 0.02, y - h * 0.24);
        ctx.bezierCurveTo(x + w * 0.08, y - h * 0.06, x + w * 0.08, y + h * 0.06, x - w * 0.04, y + h * 0.08);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (damage > 0.03 || heat > 0.2) {
      ctx.strokeStyle = `rgba(28, 32, 30, ${0.22 + Math.max(damage, heat * 0.35) * 0.38})`;
      ctx.lineWidth = 1.2;
      for (let crack = 0; crack < 4; crack += 1) {
        const x = -w * 0.32 + crack * w * 0.19;
        const y = -h * 0.22 + hashNoise(101, crack) * h * 0.48;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(crack + state.t * 0.04) * w * 0.05, y + h * 0.18);
        ctx.stroke();
      }
    }
    ctx.restore();
    return true;
  }

  function drawLiteralBar(ctx, extent, state, hue, shape) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + (shape === 'slider' ? Math.sin(state.t * 0.18) * 0.08 : 0));
    const gradient = ctx.createLinearGradient(-extent.w * 0.5, 0, extent.w * 0.5, 0);
    gradient.addColorStop(0, `hsla(${hue}, 42%, 30%, 0.62)`);
    gradient.addColorStop(0.5, `hsla(${hue + 16}, 58%, 62%, 0.5)`);
    gradient.addColorStop(1, `hsla(${hue}, 42%, 28%, 0.62)`);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = `hsla(${hue}, 44%, 18%, 0.54)`;
    ctx.lineWidth = 1.3;
    ctx.fillRect(-extent.w * 0.46, -extent.h * 0.24, extent.w * 0.92, extent.h * 0.48);
    ctx.strokeRect(-extent.w * 0.46, -extent.h * 0.24, extent.w * 0.92, extent.h * 0.48);
    if (shape === 'slab') {
      ctx.strokeStyle = `hsla(${hue + 12}, 44%, 70%, 0.24)`;
      for (let line = 0; line < 4; line += 1) {
        const y = -extent.h * 0.16 + line * extent.h * 0.1;
        ctx.beginPath();
        ctx.moveTo(-extent.w * 0.38, y);
        ctx.lineTo(extent.w * 0.38, y + Math.sin(line) * 1.5);
        ctx.stroke();
      }
    }
    ctx.restore();
    return true;
  }

  function drawLiteralPrism(ctx, extent) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    const gradient = ctx.createLinearGradient(-extent.w * 0.4, -extent.h * 0.4, extent.w * 0.4, extent.h * 0.4);
    gradient.addColorStop(0, 'rgba(255,255,255,0.42)');
    gradient.addColorStop(0.5, 'rgba(72,180,226,0.36)');
    gradient.addColorStop(1, 'rgba(188,92,228,0.28)');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(42, 132, 188, 0.66)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -extent.h * 0.46);
    ctx.lineTo(extent.w * 0.46, extent.h * 0.38);
    ctx.lineTo(-extent.w * 0.46, extent.h * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralLens(ctx, extent, state) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.12) * 0.02);
    const gradient = ctx.createLinearGradient(-extent.w * 0.4, 0, extent.w * 0.4, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(0.48, 'rgba(84,196,238,0.38)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.1)');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(34, 140, 210, 0.58)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, extent.w * 0.28, extent.h * 0.48, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawLiteralMagnet(ctx, extent, state) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.1) * 0.03);
    ctx.fillStyle = 'rgba(212, 56, 86, 0.8)';
    ctx.fillRect(-extent.w * 0.44, -extent.h * 0.24, extent.w * 0.44, extent.h * 0.48);
    ctx.fillStyle = 'rgba(44, 94, 206, 0.8)';
    ctx.fillRect(0, -extent.h * 0.24, extent.w * 0.44, extent.h * 0.48);
    ctx.strokeStyle = 'rgba(30, 38, 60, 0.6)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(-extent.w * 0.44, -extent.h * 0.24, extent.w * 0.88, extent.h * 0.48);
    ctx.restore();
    return true;
  }

  function drawLiteralNetworkNode(ctx, extent, state, text, hue) {
    ctx.save();
    ctx.translate(extent.x, extent.y);
    const isQueue = /queue|market|traffic/.test(text);
    ctx.fillStyle = `hsla(${isQueue ? 34 : hue}, 62%, ${isQueue ? 48 : 40}%, 0.58)`;
    ctx.strokeStyle = `hsla(${isQueue ? 28 : hue + 30}, 62%, 24%, 0.52)`;
    ctx.lineWidth = 1.2;
    ctx.fillRect(-extent.w * 0.38, -extent.h * 0.28, extent.w * 0.76, extent.h * 0.56);
    ctx.strokeRect(-extent.w * 0.38, -extent.h * 0.28, extent.w * 0.76, extent.h * 0.56);
    if (isQueue) {
      ctx.fillStyle = 'rgba(255,255,255,0.46)';
      for (let dot = 0; dot < 4; dot += 1) {
        ctx.beginPath();
        ctx.arc(-extent.w * 0.24 + dot * extent.w * 0.16, 0, 2.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    return true;
  }

  function drawLiteralLightSource(ctx, extent) {
    ctx.save();
    const r = Math.min(extent.w, extent.h) * 0.32;
    const gradient = ctx.createRadialGradient(extent.x, extent.y, 0, extent.x, extent.y, r * 2.4);
    gradient.addColorStop(0, 'rgba(255, 238, 118, 0.86)');
    gradient.addColorStop(0.32, 'rgba(255, 192, 58, 0.36)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(extent.x, extent.y, r * 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
    return true;
  }

  function drawObjectSilhouette(ctx, extent, object, index, hue) {
    const shape = String(object && object.shape || '').toLowerCase();
    const isField = object && (object.kind === 'field' || shape === 'field-envelope');
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = `hsla(${hue}, 44%, 10%, ${isField ? 0.12 : 0.4})`;
    ctx.shadowBlur = isField ? 8 : 18;
    ctx.shadowOffsetY = isField ? 2 : 8;
    ctx.fillStyle = `hsla(${hue}, ${isField ? 38 : 48}%, ${isField ? 42 : 20}%, ${isField ? 0.055 : 0.34})`;
    ctx.strokeStyle = `hsla(${(hue + 22) % 360}, 78%, ${isField ? 34 : 32}%, ${isField ? 0.34 : 0.72})`;
    ctx.lineWidth = isField ? 1.1 : 2;
    beginObjectSilhouettePath(ctx, extent, shape, index);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.strokeStyle = `hsla(${(hue + 68) % 360}, 90%, 74%, ${isField ? 0.16 : 0.34})`;
    ctx.lineWidth = isField ? 0.75 : 1;
    ctx.beginPath();
    ctx.ellipse(0, -extent.h * 0.08, extent.w * 0.36, extent.h * 0.22, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function beginObjectSilhouettePath(ctx, extent, shape, index) {
    ctx.beginPath();
    if (shape === 'prism') {
      ctx.moveTo(0, -extent.h * 0.48);
      ctx.lineTo(extent.w * 0.52, extent.h * 0.4);
      ctx.lineTo(-extent.w * 0.52, extent.h * 0.4);
      ctx.closePath();
      return;
    }
    if (shape === 'field-envelope') {
      ctx.ellipse(0, 0, extent.w * 0.46, extent.h * 0.3, Math.sin(index) * 0.08, 0, TAU);
      return;
    }
    if (shape === 'wheel' || shape === 'lens' || shape === 'colony-field' || shape === 'pool') {
      ctx.ellipse(0, 0, extent.w * 0.5, extent.h * 0.5, Math.sin(index) * 0.08, 0, TAU);
      return;
    }
    if (shape === 'wall' || shape === 'building' || shape === 'bar' || shape === 'panel' || shape === 'meter' || shape === 'slider') {
      ctx.rect(-extent.w * 0.52, -extent.h * 0.36, extent.w * 1.04, extent.h * 0.72);
      return;
    }
    if (shape === 'flame-front' || shape === 'plume') {
      ctx.moveTo(-extent.w * 0.45, extent.h * 0.42);
      ctx.bezierCurveTo(-extent.w * 0.22, -extent.h * 0.2, -extent.w * 0.04, -extent.h * 0.46, 0, -extent.h * 0.56);
      ctx.bezierCurveTo(extent.w * 0.2, -extent.h * 0.18, extent.w * 0.46, extent.h * 0.12, extent.w * 0.4, extent.h * 0.42);
      ctx.closePath();
      return;
    }
    if (shape === 'fuel-bed' || shape === 'grain-bed' || shape === 'slab' || shape === 'sample') {
      ctx.moveTo(-extent.w * 0.5, extent.h * 0.18);
      ctx.lineTo(-extent.w * 0.3, -extent.h * 0.34);
      ctx.lineTo(extent.w * 0.35, -extent.h * 0.28);
      ctx.lineTo(extent.w * 0.52, extent.h * 0.2);
      ctx.lineTo(extent.w * 0.12, extent.h * 0.42);
      ctx.lineTo(-extent.w * 0.42, extent.h * 0.34);
      ctx.closePath();
      return;
    }
    ctx.ellipse(0, 0, extent.w * 0.52, extent.h * 0.38, Math.sin(index * 0.7) * 0.12, 0, TAU);
  }

  function drawObjectAccentDetails(ctx, extent, state, object, index, hue) {
    const text = [
      object.id,
      object.kind,
      object.shape,
      object.material,
      object.role,
      object.visualRegime,
    ].join(' ').toLowerCase();
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (/smoke|plume|vapor/.test(text)) {
      drawSmokeObjectMarks(ctx, extent, state, index, hue);
    } else if (/flame|fire|combust|plasma|thermal/.test(text)) {
      drawThermalObjectMarks(ctx, extent, state, index, hue);
    } else if (/wind|air|water|fluid|flow|river|field-envelope/.test(text)) {
      drawFluidObjectMarks(ctx, extent, state, index, hue);
    } else if (/wood|fuel|sand|rock|grain|granular|soil|wall|slab/.test(text)) {
      drawGranularObjectMarks(ctx, extent, state, index, hue);
    } else if (/lens|prism|glass|light|spectrum|mirror/.test(text)) {
      drawOpticalObjectMarks(ctx, extent, state, index, hue);
    } else if (/magnet|coil|wheel|rotor|slider|current/.test(text)) {
      drawMagneticObjectMarks(ctx, extent, state, index, hue);
    } else if (/cell|colony|membrane|biology|nutrient/.test(text)) {
      drawBiologyObjectMarks(ctx, extent, state, index, hue);
    } else if (/sound|acoustic|wave|pressure|resonance/.test(text)) {
      drawAcousticObjectMarks(ctx, extent, state, index, hue);
    } else {
      drawFacetObjectMarks(ctx, extent, state, index, hue);
    }
    ctx.restore();
  }

  function drawThermalObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'source-over';
    for (let tongue = 0; tongue < 7; tongue += 1) {
      const x = -extent.w * 0.34 + tongue * extent.w * 0.11;
      const lift = 0.36 + hashNoise(881, index * 17 + tongue) * 0.34;
      ctx.strokeStyle = `hsla(${18 + tongue * 7}, 96%, ${46 + tongue * 3}%, 0.7)`;
      ctx.lineWidth = 2.2 + hashNoise(883, tongue) * 2.6;
      ctx.beginPath();
      ctx.moveTo(x, extent.h * 0.34);
      ctx.bezierCurveTo(
        x + Math.sin(state.t * 1.4 + tongue) * extent.w * 0.08,
        extent.h * 0.04,
        x + extent.w * 0.1,
        -extent.h * lift,
        x + Math.sin(index + tongue) * extent.w * 0.04,
        -extent.h * (0.48 + lift * 0.22)
      );
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'screen';
    const core = ctx.createRadialGradient(0, extent.h * 0.08, 0, 0, extent.h * 0.08, extent.w * 0.52);
    core.addColorStop(0, 'rgba(255, 220, 92, 0.45)');
    core.addColorStop(0.45, `hsla(${hue + 16}, 96%, 54%, 0.2)`);
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, extent.h * 0.05, extent.w * 0.48, extent.h * 0.52, 0, 0, TAU);
    ctx.fill();
  }

  function drawFluidObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'source-over';
    const streams = 7;
    for (let stream = 0; stream < streams; stream += 1) {
      const y = -extent.h * 0.3 + stream * extent.h * 0.1;
      ctx.strokeStyle = `hsla(${190 + stream * 9 + hue * 0.04}, 84%, 42%, ${0.28 + stream * 0.015})`;
      ctx.lineWidth = 1.2 + stream * 0.12;
      ctx.beginPath();
      for (let step = 0; step <= 18; step += 1) {
        const x = -extent.w * 0.5 + step * extent.w / 18;
        const yy = y + Math.sin(step * 0.72 + state.t * 1.1 + index + stream) * extent.h * 0.035;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (let droplet = 0; droplet < 9; droplet += 1) {
      const x = -extent.w * 0.4 + hashNoise(887, index * 19 + droplet) * extent.w * 0.8;
      const y = -extent.h * 0.26 + hashNoise(889, index * 23 + droplet) * extent.h * 0.52;
      ctx.fillStyle = `hsla(${196 + droplet * 6}, 80%, 48%, 0.24)`;
      ctx.beginPath();
      ctx.ellipse(x, y, 2.4, 4.2, Math.sin(droplet) * 0.6, 0, TAU);
      ctx.fill();
    }
  }

  function drawGranularObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `hsla(${hue + 18}, 58%, 25%, 0.48)`;
    for (let layer = 0; layer < 5; layer += 1) {
      const y = -extent.h * 0.25 + layer * extent.h * 0.12;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.42, y);
      ctx.bezierCurveTo(-extent.w * 0.16, y + Math.sin(state.t * 0.2 + layer) * 4, extent.w * 0.16, y - 4, extent.w * 0.42, y + 1);
      ctx.stroke();
    }
    for (let grain = 0; grain < 26; grain += 1) {
      const x = -extent.w * 0.42 + hashNoise(891, index * 29 + grain) * extent.w * 0.84;
      const y = -extent.h * 0.28 + hashNoise(893, index * 31 + grain) * extent.h * 0.62;
      ctx.fillStyle = `hsla(${hue + grain * 3}, 54%, ${30 + hashNoise(895, grain) * 20}%, 0.36)`;
      ctx.fillRect(x, y, 2 + hashNoise(897, grain) * 4, 1.5 + hashNoise(899, grain) * 3);
    }
  }

  function drawSmokeObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'source-over';
    for (let puff = 0; puff < 8; puff += 1) {
      const rise = puff / 8;
      const x = Math.sin(state.t * 0.25 + index + puff) * extent.w * 0.2;
      const y = extent.h * 0.18 - rise * extent.h * 0.74;
      ctx.fillStyle = `hsla(${hue + 30}, 12%, ${34 + puff * 3}%, ${0.18 - rise * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(x, y, extent.w * (0.13 + rise * 0.07), extent.h * (0.09 + rise * 0.05), 0, 0, TAU);
      ctx.fill();
    }
  }

  function drawOpticalObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'screen';
    for (let ray = 0; ray < 8; ray += 1) {
      const split = (ray - 3.5) / 8;
      ctx.strokeStyle = `hsla(${206 + ray * 18}, 96%, 56%, 0.42)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.55, split * extent.h * 0.22);
      ctx.bezierCurveTo(
        -extent.w * 0.12,
        split * extent.h * 0.12 + Math.sin(state.t + ray) * 2,
        extent.w * 0.18,
        -split * extent.h * 0.2,
        extent.w * 0.58,
        -split * extent.h * 0.3
      );
      ctx.stroke();
    }
  }

  function drawMagneticObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'source-over';
    for (let spoke = 0; spoke < 10; spoke += 1) {
      const angle = spoke * TAU / 10 + state.t * 0.1;
      ctx.strokeStyle = `hsla(${hue + spoke * 11}, 72%, 38%, 0.36)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * extent.w * 0.12, Math.sin(angle) * extent.h * 0.12);
      ctx.lineTo(Math.cos(angle) * extent.w * 0.44, Math.sin(angle) * extent.h * 0.38);
      ctx.stroke();
    }
    ctx.strokeStyle = `hsla(${hue + 80}, 82%, 42%, 0.5)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, extent.w * 0.36, extent.h * 0.28, 0, 0, TAU);
    ctx.stroke();
  }

  function drawBiologyObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'source-over';
    for (let cell = 0; cell < 11; cell += 1) {
      const angle = cell * TAU / 11 + index * 0.3;
      const r = 0.12 + hashNoise(901, cell) * 0.3;
      const x = Math.cos(angle) * extent.w * r;
      const y = Math.sin(angle) * extent.h * r;
      ctx.strokeStyle = `hsla(${hue + cell * 13}, 64%, 36%, 0.38)`;
      ctx.fillStyle = `hsla(${hue + cell * 11}, 70%, 56%, 0.16)`;
      ctx.beginPath();
      ctx.ellipse(x, y, extent.w * 0.055, extent.h * 0.045, Math.sin(state.t + cell) * 0.2, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawAcousticObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'source-over';
    for (let ring = 0; ring < 7; ring += 1) {
      const grow = 0.16 + ring * 0.06 + (Math.sin(state.t * 0.8 + index) + 1) * 0.01;
      ctx.strokeStyle = `hsla(${hue + ring * 12}, 76%, 42%, ${0.28 - ring * 0.022})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(0, 0, extent.w * grow, extent.h * grow * 0.72, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawFacetObjectMarks(ctx, extent, state, index, hue) {
    ctx.globalCompositeOperation = 'source-over';
    for (let facet = 0; facet < 5; facet += 1) {
      const x = -extent.w * 0.34 + facet * extent.w * 0.17;
      ctx.strokeStyle = `hsla(${hue + facet * 18}, 62%, 38%, 0.26)`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x, -extent.h * 0.28);
      ctx.lineTo(x + Math.sin(state.t * 0.2 + facet) * extent.w * 0.04, extent.h * 0.28);
      ctx.stroke();
    }
  }

  function drawObjectMaterialKernel(ctx, extent, state, object, index) {
    const family = materialFamily(object);
    const hue = materialHueFor(object.material, index);
    if (object.primitiveProgram) {
      drawPrimitiveProgram(ctx, extent, state, object, index, hue);
      if (object.source === 'open-semantic-rag') return;
    }
    if (extent.points && extent.points.length > 1) {
      drawFlowObjectKernel(ctx, extent, state, hue, family);
      return;
    }
    if (family === 'biological') return drawBiologicalContinuum(ctx, extent, state, object, index);
    if (family === 'soft') return drawSoftContinuum(ctx, extent, state, object, index);
    if (family === 'atomic') return drawAtomicContinuum(ctx, extent, state, object, index);
    if (family === 'electrical') return drawElectricalContinuum(ctx, extent, state, object, index);
    if (family === 'acoustic') return drawAcousticContinuum(ctx, extent, state, object, index);
    if (family === 'phase') return drawPhaseContinuum(ctx, extent, state, object, index);

    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation + Math.sin(state.t * 0.11 + index) * 0.012);
    ctx.globalCompositeOperation = 'screen';
    const scale = Math.max(extent.w, extent.h, extent.r * 2);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 0.68);
    const alpha = family === 'granular' ? 0.18 : family === 'thermal' ? 0.3 : 0.24;
    core.addColorStop(0, `hsla(${hue}, 76%, 64%, ${alpha})`);
    core.addColorStop(0.48, `hsla(${hue + 32}, 76%, 52%, ${alpha * 0.48})`);
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, 0, extent.w * 0.5, extent.h * 0.42, 0, 0, TAU);
    ctx.fill();

    const bands = family === 'thermal' ? 8 : family === 'granular' ? 7 : 6;
    for (let band = 0; band < bands; band += 1) {
      const phase = state.t * (family === 'thermal' ? 0.42 : 0.18) + band * 0.83 + index;
      const rx = extent.w * (0.22 + band * 0.052);
      const ry = extent.h * (0.13 + band * 0.035);
      const tilt = Math.sin(phase) * 0.16;
      ctx.strokeStyle = `hsla(${hue + band * 9}, 82%, ${family === 'granular' ? 34 : 50}%, ${0.24 - band * 0.012})`;
      ctx.lineWidth = 1.2 + band * 0.18;
      ctx.beginPath();
      ctx.ellipse(0, Math.sin(phase) * extent.h * 0.018, rx, ry, tilt, 0, TAU);
      ctx.stroke();
    }

    if (family === 'granular') drawKernelTexture(ctx, extent, state, hue, index);
    if (family === 'thermal') drawHeatKernel(ctx, extent, state, hue, index);
    ctx.restore();
  }

  function drawPrimitiveProgram(ctx, extent, state, object, index, hue) {
    const program = object.primitiveProgram || {};
    const parts = Array.isArray(program.parts) ? program.parts : [];
    if (!parts.length) return;
    ctx.save();
    ctx.translate(extent.x, extent.y);
    ctx.rotate(extent.rotation);
    ctx.globalCompositeOperation = 'screen';
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part = parts[partIndex];
      const count = Math.max(1, Math.min(64, Number(part.count || 1)));
      const alpha = Number(part.alpha || 0.08);
      const ph = state.t * (0.28 + partIndex * 0.04) + index * 0.9 + partIndex;
      drawPrimitiveProgramPart(ctx, extent, part.kind, count, hue + partIndex * 31, alpha, ph, index);
    }
    ctx.restore();
  }

  function drawPrimitiveProgramPart(ctx, extent, kind, count, hue, alpha, phase, seed) {
    if (kind === 'stream') return programStream(ctx, extent, count, hue, alpha, phase);
    if (kind === 'spectral-ray') return programSpectralRay(ctx, extent, count, hue, alpha, phase);
    if (kind === 'flux-loop') return programFluxLoop(ctx, extent, count, hue, alpha, phase);
    if (kind === 'ring' || kind === 'ripple') return programRings(ctx, extent, count, hue, alpha, phase);
    if (kind === 'droplet' || kind === 'particle' || kind === 'spark') {
      return programParticles(ctx, extent, count, hue, alpha, phase, seed, kind);
    }
    if (kind === 'grain' || kind === 'lattice') return programParticles(ctx, extent, count, hue, alpha, phase, seed, kind);
    if (kind === 'plume') return programPlume(ctx, extent, count, hue, alpha, phase);
    if (kind === 'branch') return programBranches(ctx, extent, count, hue, alpha, phase, seed);
    if (kind === 'membrane') return programMembrane(ctx, extent, count, hue, alpha, phase);
    if (kind === 'arc') return programArcs(ctx, extent, count, hue, alpha, phase, seed);
    if (kind === 'pulse') return programPulses(ctx, extent, count, hue, alpha, phase, seed);
    if (kind === 'strata' || kind === 'phase-band') return programBands(ctx, extent, count, hue, alpha, phase, kind);
    if (kind === 'cell') return programCells(ctx, extent, count, hue, alpha, phase, seed);
    if (kind === 'orbital') return programOrbitals(ctx, extent, count, hue, alpha, phase);
    if (kind === 'wavefront') return programWavefronts(ctx, extent, count, hue, alpha, phase);
    if (kind === 'network-thread') return programNetworkThreads(ctx, extent, count, hue, alpha, phase, seed);
    return programRings(ctx, extent, count, hue, alpha, phase);
  }

  function programStream(ctx, extent, count, hue, alpha, phase) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < count; i += 1) {
      const y = -extent.h * 0.36 + i * extent.h / Math.max(1, count - 1);
      ctx.strokeStyle = `hsla(${hue + i * 5}, 86%, 54%, ${alpha * (0.58 + i / count)})`;
      ctx.lineWidth = 0.9 + i * 0.08;
      ctx.beginPath();
      for (let step = 0; step <= 20; step += 1) {
        const x = -extent.w * 0.58 + step * extent.w * 1.16 / 20;
        const yy = y + Math.sin(step * 0.78 + phase + i) * extent.h * 0.045;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function programSpectralRay(ctx, extent, count, hue, alpha, phase) {
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i += 1) {
      const split = (i - count / 2) / Math.max(1, count);
      ctx.strokeStyle = `hsla(${hue + i * 18}, 96%, 58%, ${alpha})`;
      ctx.lineWidth = 0.8 + (i % 3) * 0.22;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.72, split * extent.h * 0.32);
      ctx.bezierCurveTo(
        -extent.w * 0.18,
        split * extent.h * 0.08 + Math.sin(phase + i) * 2,
        extent.w * 0.22,
        -split * extent.h * 0.18,
        extent.w * 0.78,
        -split * extent.h * 0.34
      );
      ctx.stroke();
    }
  }

  function programFluxLoop(ctx, extent, count, hue, alpha, phase) {
    for (let i = 0; i < count; i += 1) {
      const rx = extent.w * (0.16 + i * 0.035);
      const ry = extent.h * (0.12 + i * 0.028);
      ctx.strokeStyle = `hsla(${hue + i * 8}, 82%, 52%, ${Math.max(0.025, alpha - i * 0.004)})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, phase * 0.2 + i * 0.19, 0, TAU);
      ctx.stroke();
    }
  }

  function programRings(ctx, extent, count, hue, alpha, phase) {
    for (let i = 0; i < count; i += 1) {
      const pulse = (Math.sin(phase * 1.4 + i) + 1) * 0.018;
      const r = Math.max(extent.w, extent.h) * (0.08 + i * 0.035 + pulse);
      ctx.strokeStyle = `hsla(${hue + i * 7}, 78%, 56%, ${Math.max(0.02, alpha - i * 0.006)})`;
      ctx.lineWidth = 0.75 + i * 0.04;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * (0.58 + (i % 3) * 0.07), Math.sin(phase + i) * 0.18, 0, TAU);
      ctx.stroke();
    }
  }

  function programParticles(ctx, extent, count, hue, alpha, phase, seed, kind) {
    for (let i = 0; i < count; i += 1) {
      const lane = kind === 'spark' ? -0.35 : kind === 'grain' ? 0.34 : 0;
      const x = (hashNoise(seed * 131 + 7, i) - 0.5) * extent.w * 0.92;
      const y = (hashNoise(seed * 131 + 11, i) - 0.5 + lane) * extent.h * 0.82;
      const drift = Math.sin(phase * (kind === 'spark' ? 2.2 : 0.7) + i) * extent.h * 0.035;
      const radius = 0.7 + hashNoise(seed * 131 + 17, i) * (kind === 'grain' ? 1.2 : 2.1);
      drawPrismaticParticle(ctx, x, y + drift, radius, hue + hashNoise(seed, i) * 80, alpha, phase + i);
    }
  }

  function programPlume(ctx, extent, count, hue, alpha, phase) {
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i += 1) {
      const x = -extent.w * 0.36 + i * extent.w / Math.max(1, count - 1);
      ctx.strokeStyle = `hsla(${hue + i * 4}, 90%, 58%, ${alpha})`;
      ctx.lineWidth = 0.8 + i * 0.06;
      ctx.beginPath();
      ctx.moveTo(x, extent.h * 0.36);
      ctx.bezierCurveTo(
        x + Math.sin(phase + i) * extent.w * 0.08,
        extent.h * 0.04,
        x + Math.cos(phase * 0.8 + i) * extent.w * 0.16,
        -extent.h * 0.38,
        x + Math.sin(phase * 1.3 + i) * extent.w * 0.06,
        -extent.h * 0.66
      );
      ctx.stroke();
    }
  }

  function programBranches(ctx, extent, count, hue, alpha, phase, seed) {
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i += 1) {
      const angle = i * TAU / count + Math.sin(phase + i) * 0.12;
      const length = extent.w * (0.18 + hashNoise(seed * 43, i) * 0.34);
      ctx.strokeStyle = `hsla(${hue + i * 11}, 62%, 46%, ${alpha})`;
      ctx.lineWidth = 0.8 + hashNoise(seed * 47, i) * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(
        Math.cos(angle) * length * 0.28,
        Math.sin(angle) * length * 0.18,
        Math.cos(angle + 0.34) * length * 0.62,
        Math.sin(angle + 0.34) * length * 0.48,
        Math.cos(angle) * length,
        Math.sin(angle) * length * 0.72
      );
      ctx.stroke();
    }
  }

  function programMembrane(ctx, extent, count, hue, alpha, phase) {
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(extent.w, extent.h) * 0.62);
    glow.addColorStop(0, `hsla(${hue}, 96%, 76%, ${alpha * 0.8})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 0, extent.w * 0.54, extent.h * 0.35, Math.sin(phase) * 0.1, 0, TAU);
    ctx.fill();
    programStream(ctx, extent, count, hue + 20, alpha * 0.72, phase);
  }

  function programArcs(ctx, extent, count, hue, alpha, phase, seed) {
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i += 1) {
      const y = (hashNoise(seed * 67, i) - 0.5) * extent.h * 0.56;
      ctx.strokeStyle = `hsla(${hue + i * 13}, 96%, 60%, ${alpha})`;
      ctx.lineWidth = 0.8 + hashNoise(seed * 71, i) * 0.8;
      ctx.beginPath();
      ctx.moveTo(-extent.w * 0.52, y);
      ctx.bezierCurveTo(-extent.w * 0.18, y - extent.h * 0.28, extent.w * 0.2, y + extent.h * 0.28, extent.w * 0.52, -y);
      ctx.stroke();
    }
  }

  function programPulses(ctx, extent, count, hue, alpha, phase, seed) {
    for (let i = 0; i < count; i += 1) {
      const t = (i / count + phase * 0.04) % 1;
      const angle = hashNoise(seed * 79, i) * TAU;
      const x = Math.cos(angle) * extent.w * (t - 0.5);
      const y = Math.sin(angle) * extent.h * (t - 0.5);
      drawPrismaticParticle(ctx, x, y, 1 + t * 2, hue + i * 9, alpha * (1 - t * 0.35), angle);
    }
  }

  function programBands(ctx, extent, count, hue, alpha, phase, kind) {
    for (let i = 0; i < count; i += 1) {
      const y = -extent.h * 0.42 + i * extent.h / Math.max(1, count - 1);
      const amp = kind === 'phase-band' ? extent.h * 0.048 : extent.h * 0.022;
      ctx.strokeStyle = `hsla(${hue + i * 8}, 62%, ${kind === 'strata' ? 38 + i : 56}%, ${alpha})`;
      ctx.beginPath();
      for (let step = 0; step <= 18; step += 1) {
        const x = -extent.w * 0.56 + step * extent.w * 1.12 / 18;
        const yy = y + Math.sin(step * 0.7 + phase + i) * amp;
        if (!step) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function programCells(ctx, extent, count, hue, alpha, phase, seed) {
    for (let i = 0; i < count; i += 1) {
      const angle = i * TAU / count + phase * 0.06;
      const r = Math.max(extent.w, extent.h) * (0.12 + hashNoise(seed * 83, i) * 0.36);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle * 1.33) * r * 0.58;
      const radius = 1.8 + hashNoise(seed * 89, i) * 3.2;
      drawPrismaticParticle(ctx, x, y, radius, hue + i * 5, alpha, angle);
    }
  }

  function programOrbitals(ctx, extent, count, hue, alpha, phase) {
    for (let i = 0; i < count; i += 1) {
      ctx.strokeStyle = `hsla(${hue + i * 19}, 90%, 58%, ${alpha})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, 0, extent.w * (0.15 + i * 0.04), extent.h * 0.18, phase * 0.28 + i * 0.62, 0, TAU);
      ctx.stroke();
    }
  }

  function programWavefronts(ctx, extent, count, hue, alpha, phase) {
    for (let i = 0; i < count; i += 1) {
      const x = -extent.w * 0.48 + i * extent.w / Math.max(1, count - 1);
      ctx.strokeStyle = `hsla(${hue + i * 6}, 80%, 54%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x, -extent.h * 0.4);
      ctx.bezierCurveTo(
        x + Math.sin(phase + i) * extent.w * 0.08,
        -extent.h * 0.12,
        x - Math.sin(phase + i) * extent.w * 0.08,
        extent.h * 0.12,
        x,
        extent.h * 0.4
      );
      ctx.stroke();
    }
  }

  function programNetworkThreads(ctx, extent, count, hue, alpha, phase, seed) {
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i += 1) {
      const a = hashNoise(seed * 101, i) * TAU;
      const b = hashNoise(seed * 103, i) * TAU;
      ctx.strokeStyle = `hsla(${hue + i * 12}, 82%, 54%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * extent.w * 0.48, Math.sin(a) * extent.h * 0.38);
      ctx.quadraticCurveTo(
        Math.sin(phase + i) * extent.w * 0.1,
        Math.cos(phase + i) * extent.h * 0.08,
        Math.cos(b) * extent.w * 0.48,
        Math.sin(b) * extent.h * 0.38
      );
      ctx.stroke();
    }
  }

  function drawFlowObjectKernel(ctx, extent, state, hue, family) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let band = 0; band < 7; band += 1) {
      ctx.strokeStyle = `hsla(${hue + band * 7}, ${family === 'thermal' ? 88 : 74}%, 52%, ${0.09 + band * 0.012})`;
      ctx.lineWidth = 1.4 + band * 0.85;
      ctx.beginPath();
      extent.points.forEach((point, pointIndex) => {
        const drift = Math.sin(state.t * 0.92 + pointIndex + band) * (band + 1) * 0.55;
        if (!pointIndex) ctx.moveTo(point.x, point.y + drift);
        else ctx.lineTo(point.x, point.y + drift);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKernelTexture(ctx, extent, state, hue, index) {
    for (let i = 0; i < 22; i += 1) {
      const x = (hashNoise(index * 97 + 1, i) - 0.5) * extent.w * 0.78;
      const y = (hashNoise(index * 97 + 3, i) - 0.5) * extent.h * 0.58;
      ctx.fillStyle = `hsla(${hue + hashNoise(index * 97 + 5, i) * 18}, 36%, 34%, 0.09)`;
      ctx.beginPath();
      ctx.arc(x, y + Math.sin(state.t * 0.18 + i) * 0.2, 0.7 + hashNoise(index * 97 + 7, i), 0, TAU);
      ctx.fill();
    }
  }

  function drawHeatKernel(ctx, extent, state, hue, index) {
    for (let i = 0; i < 9; i += 1) {
      const x = -extent.w * 0.35 + i * extent.w * 0.085;
      ctx.strokeStyle = `hsla(${hue + 8 + i * 4}, 88%, 54%, ${0.08 + i * 0.004})`;
      ctx.beginPath();
      ctx.moveTo(x, extent.h * 0.24);
      ctx.bezierCurveTo(
        x + Math.sin(state.t * 0.9 + i + index) * extent.w * 0.06,
        0,
        x + Math.cos(state.t * 0.7 + i) * extent.w * 0.1,
        -extent.h * 0.34,
        x,
        -extent.h * 0.52
      );
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

  function clearScene(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#172822');
    gradient.addColorStop(0.44, '#eef8f4');
    gradient.addColorStop(1, '#fffdf8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    drawCanvasTexture(ctx, width, height, 156);
    drawGrid(ctx, width, height);
  }

  function drawGrid(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(24, 74, 67, 0.12)';
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
    ctx.lineWidth = 1.1;
    for (let ring = 0; ring < 18; ring += 1) {
      const r = radius * (0.36 + ring * 0.052);
      const phase = state.theta * 0.24 + ring * 0.19;
      ctx.strokeStyle = `hsla(${210 + ring * 5}, 82%, 54%, ${0.045 + ring * 0.004})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.18, r * 0.62, phase, 0, TAU);
      ctx.stroke();
    }
    const statorAngle = Math.atan2(stator.y - cy, stator.x - cx);
    for (let band = -5; band <= 5; band += 1) {
      const offset = band * radius * 0.04;
      ctx.strokeStyle = `hsla(${286 + band * 8}, 86%, 56%, ${0.07 + (5 - Math.abs(band)) * 0.014})`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(statorAngle + 1.3) * offset, cy + Math.sin(statorAngle + 1.3) * offset);
      ctx.bezierCurveTo(
        cx + Math.cos(statorAngle) * radius * 0.46,
        cy + Math.sin(statorAngle) * radius * 0.46,
        stator.x - Math.cos(statorAngle) * radius * 0.34,
        stator.y - Math.sin(statorAngle) * radius * 0.34,
        stator.x,
        stator.y
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWheel(ctx, cx, cy, radius, state) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const core = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius * 1.08);
    core.addColorStop(0, 'rgba(255,255,255,0.32)');
    core.addColorStop(0.38, 'rgba(108, 172, 230, 0.11)');
    core.addColorStop(0.78, 'rgba(82, 64, 206, 0.08)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.08, 0, TAU);
    ctx.fill();
    for (let band = 0; band < 9; band += 1) {
      ctx.strokeStyle = `hsla(${190 + band * 11}, 78%, 54%, ${0.12 - band * 0.008})`;
      ctx.lineWidth = 1 + band * 0.16;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.22 + band * 0.082), state.theta * 0.18 + band * 0.08, TAU + state.theta * 0.18 + band * 0.08);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i += 1) {
      const a = state.theta * 0.36 + i * TAU / 18;
      const inner = radius * (0.18 + (i % 3) * 0.05);
      const outer = radius * (0.82 + (i % 4) * 0.018);
      ctx.strokeStyle = `hsla(${220 + i * 4}, 76%, 58%, 0.055)`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.bezierCurveTo(
        cx + Math.cos(a + 0.22) * radius * 0.44,
        cy + Math.sin(a + 0.22) * radius * 0.44,
        cx + Math.cos(a + 0.42) * radius * 0.68,
        cy + Math.sin(a + 0.42) * radius * 0.68,
        cx + Math.cos(a + 0.58) * outer,
        cy + Math.sin(a + 0.58) * outer
      );
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
    ctx.globalCompositeOperation = 'screen';
    const angle = Math.atan2(stator.y - cy, stator.x - cx);
    const lobe = ctx.createRadialGradient(stator.x, stator.y, 0, stator.x, stator.y, radius * 0.38);
    lobe.addColorStop(0, 'rgba(237, 181, 70, 0.2)');
    lobe.addColorStop(0.44, 'rgba(160, 98, 226, 0.08)');
    lobe.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lobe;
    ctx.beginPath();
    ctx.ellipse(stator.x, stator.y, radius * 0.3, radius * 0.16, angle, 0, TAU);
    ctx.fill();
    for (let i = -4; i <= 4; i += 1) {
      ctx.strokeStyle = `hsla(${42 + i * 7}, 84%, 55%, ${0.08 + (4 - Math.abs(i)) * 0.012})`;
      ctx.beginPath();
      ctx.moveTo(stator.x + Math.cos(angle + 1.57) * i * 5, stator.y + Math.sin(angle + 1.57) * i * 5);
      ctx.bezierCurveTo(
        targetPoint.x * 0.34 + stator.x * 0.66,
        targetPoint.y * 0.34 + stator.y * 0.66,
        targetPoint.x * 0.7 + cx * 0.3,
        targetPoint.y * 0.7 + cy * 0.3,
        targetPoint.x,
        targetPoint.y
      );
      ctx.stroke();
    }
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
    ctx.globalCompositeOperation = 'screen';
    items.forEach(([, value, color], index) => {
      const yy = y + index * 27;
      const widthRatio = clamp(value / max, 0, 1);
      const gradient = ctx.createLinearGradient(x, yy, x + 180, yy);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = 'rgba(23, 32, 29, 0.035)';
      ctx.fillRect(x, yy, 180, 4);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, yy, 180 * widthRatio, 4);
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
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = `hsla(${184 + i * 8}, 72%, 46%, ${0.12 - i * 0.012})`;
      ctx.beginPath();
      ctx.moveTo(width * 0.08, height * (0.46 + i * 0.024));
      ctx.bezierCurveTo(
        width * 0.28,
        height * (0.42 + i * 0.018),
        width * 0.66,
        height * (0.58 - i * 0.014),
        width * 0.92,
        height * (0.5 + i * 0.012)
      );
      ctx.stroke();
    }
    ctx.restore();
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
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'blur(1.2px)';
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const b = state.b[idx];
        const heat = state.heat[idx];
        if (b < 0.025 && heat < 0.025) continue;
        const activity = Math.max(b, heat);
        ctx.fillStyle = `rgba(${Math.round(80 + heat * 175)}, ${Math.round(120 + b * 120)}, ${Math.round(80 + b * 170)}, ${(0.08 + activity * 0.34) * alpha})`;
        ctx.beginPath();
        ctx.ellipse(
          left + (x + 0.5) * cell,
          top + (y + 0.5) * cell,
          cell * (0.6 + heat * 0.9),
          cell * (0.45 + b * 0.7),
          Math.sin(x * 0.4 + y * 0.3 + state.t) * 0.8,
          0,
          TAU
        );
        ctx.fill();
      }
    }
    ctx.filter = 'none';
    for (let band = 0; band < 12; band += 1) {
      const y = top + size * cell * (0.18 + band * 0.055);
      ctx.strokeStyle = `hsla(${146 + band * 8}, 70%, 48%, ${0.045 + band * 0.002})`;
      ctx.beginPath();
      for (let x = left; x <= left + size * cell; x += cell * 2.4) {
        const yy = y + Math.sin(x * 0.018 + band + state.t * 0.35) * cell * 2.4;
        if (x === left) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
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
