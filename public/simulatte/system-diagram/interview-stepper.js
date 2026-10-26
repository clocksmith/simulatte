(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (node) module.exports = api; else root.SimulatteSystemDiagramInterviewStepper = api;
})(globalThis, function (documentsApi) {
  'use strict';

  function clone(val) {
    return structuredClone(val);
  }

  function buildStepDocument(masterDoc, step, library, config) {
    const docs = documentsApi || globalThis.SimulatteSystemDiagramDocument;
    const activeSet = new Set(step.activeNodes);
    const nodes = masterDoc.nodes.filter(n => activeSet.has(n.id)).map(n => ({ ...n }));
    const activeGroupIds = new Set(nodes.map(n => n.groupId).filter(Boolean));
    const groups = (masterDoc.groups || [])
      .filter(g => activeGroupIds.has(g.id) || g.nodeIds?.some(id => activeSet.has(id)))
      .map(g => {
        const copy = { ...g };
        if (copy.nodeIds) copy.nodeIds = copy.nodeIds.filter(id => activeSet.has(id));
        return copy;
      });
    const keptGroupIds = new Set(groups.map(g => g.id));
    for (const node of nodes) {
      if (node.groupId && !keptGroupIds.has(node.groupId)) {
        delete node.groupId;
      }
    }
    const edges = step.customEdges ? step.customEdges : (masterDoc.edges || []).filter(e => activeSet.has(e.from?.nodeId) && activeSet.has(e.to?.nodeId));
    const faults = (masterDoc.faults || []).filter(f => activeSet.has(f.target?.id));
    const stepDoc = {
      ...masterDoc,
      name: (masterDoc.name + ' (Step ' + step.stepNumber + ')').slice(0, 80),
      nodes,
      edges,
      groups,
      faults
    };
    return docs.validate(stepDoc, library, config);
  }

  function create({ host, model, canvas, library, config, onStepChange, onMessage }) {
    const docs = documentsApi || globalThis.SimulatteSystemDiagramDocument;
    let journeysData = null;
    let masterDocsCache = new Map();
    let currentScenarioId = 'web-service';
    let currentScenario = null;
    let currentStepIndex = 0; // 0 is Blank Canvas, 1..N are evolutionary steps, -1 is Full View
    let customPromptText = '';
    let isDrawerOpen = false;

    // Create Top Interview Task Bar
    const taskBarEl = document.createElement('div');
    taskBarEl.className = 'lucyd-task-bar';
    taskBarEl.setAttribute('role', 'region');
    taskBarEl.setAttribute('aria-label', 'Lucyd interview problem prompt');

    taskBarEl.innerHTML = `
      <div class="lucyd-task-header">
        <div class="lucyd-task-meta">
          <span class="lucyd-task-badge">INTERVIEW PROBLEM</span>
          <select class="lucyd-task-select" aria-label="Select interview problem">
            <option value="web-service" selected>Web Service & Async Jobs (Bitly / High-Traffic API)</option>
            <option value="chat-application">Real-Time Streaming Chat (Slack / Discord)</option>
            <option value="rag-assistant">Enterprise AI Knowledge Assistant (RAG)</option>
            <option value="video-distribution">Global Video Streaming CDN (YouTube / Netflix)</option>
            <option value="social-feed">Social Media News Feed (Twitter / Instagram)</option>
            <option value="custom">Custom Problem (Enter 1-2 sentences)...</option>
          </select>
        </div>
        <div class="lucyd-task-actions">
          <button type="button" class="lucyd-task-btn is-edit-prompt" title="Enter or edit 1-2 sentence problem prompt">Edit Task</button>
          <button type="button" class="lucyd-task-btn is-clear-canvas" title="Clear canvas to blank whiteboard">Clear Canvas</button>
        </div>
      </div>
      <div class="lucyd-task-prompt-display">
        <span class="lucyd-task-prompt-label">Problem Prompt:</span>
        <span class="lucyd-task-prompt-text"></span>
      </div>
      <div class="lucyd-task-custom-editor" hidden>
        <div class="lucyd-task-custom-row">
          <input type="text" class="lucyd-task-custom-input" placeholder="Enter your 1-2 sentence system design task (e.g. Design a URL shortener like Bitly handling 100M writes/day)..." maxlength="300" />
          <button type="button" class="lucyd-task-btn is-save-custom">Set Task</button>
          <button type="button" class="lucyd-task-btn is-cancel-custom">Cancel</button>
        </div>
      </div>
    `;

    // Create Bottom Evolutionary Stepper
    const stepperEl = document.createElement('section');
    stepperEl.className = 'interview-stepper';
    stepperEl.dataset.visible = 'true';
    stepperEl.dataset.expanded = 'false';
    stepperEl.setAttribute('aria-label', 'Lucyd system design interview evolution');

    stepperEl.innerHTML = `
      <div class="interview-stepper-header">
        <div class="interview-stepper-meta">
          <span class="interview-stepper-badge">LUCYD INTERVIEW MODE</span>
          <span class="interview-stepper-title"></span>
          <span class="interview-stepper-subtitle"></span>
        </div>
        <div class="interview-stepper-actions">
          <button type="button" class="interview-stepper-notes-btn" aria-expanded="false" title="Toggle interview challenge and notes (shortcut: \\)">
            <span class="interview-stepper-notes-label">Challenge & Notes</span>
            <span class="interview-stepper-notes-icon">▼</span>
          </button>
        </div>
      </div>
      <div class="interview-stepper-controls">
        <button type="button" class="interview-stepper-nav-btn is-prev" aria-label="Previous step" title="Previous step (shortcut: [)">‹ Prev</button>
        <div class="interview-stepper-pills" role="tablist"></div>
        <button type="button" class="interview-stepper-nav-btn is-next" aria-label="Next step" title="Next step (shortcut: ])">Next ›</button>
        <button type="button" class="interview-stepper-nav-btn is-full" title="Show complete architecture">Full View</button>
      </div>
      <div class="interview-stepper-drawer" hidden>
        <div class="interview-stepper-drawer-content"></div>
      </div>
    `;

    host.appendChild(taskBarEl);
    host.appendChild(stepperEl);

    // Elements
    const problemSelectEl = taskBarEl.querySelector('.lucyd-task-select');
    const promptTextEl = taskBarEl.querySelector('.lucyd-task-prompt-text');
    const editPromptBtn = taskBarEl.querySelector('.lucyd-task-btn.is-edit-prompt');
    const clearCanvasBtn = taskBarEl.querySelector('.lucyd-task-btn.is-clear-canvas');
    const customEditorEl = taskBarEl.querySelector('.lucyd-task-custom-editor');
    const customInputEl = taskBarEl.querySelector('.lucyd-task-custom-input');
    const saveCustomBtn = taskBarEl.querySelector('.lucyd-task-btn.is-save-custom');
    const cancelCustomBtn = taskBarEl.querySelector('.lucyd-task-btn.is-cancel-custom');

    const titleEl = stepperEl.querySelector('.interview-stepper-title');
    const subtitleEl = stepperEl.querySelector('.interview-stepper-subtitle');
    const notesBtn = stepperEl.querySelector('.interview-stepper-notes-btn');
    const notesIcon = stepperEl.querySelector('.interview-stepper-notes-icon');
    const prevBtn = stepperEl.querySelector('.interview-stepper-nav-btn.is-prev');
    const nextBtn = stepperEl.querySelector('.interview-stepper-nav-btn.is-next');
    const fullBtn = stepperEl.querySelector('.interview-stepper-nav-btn.is-full');
    const pillsContainer = stepperEl.querySelector('.interview-stepper-pills');
    const drawerEl = stepperEl.querySelector('.interview-stepper-drawer');
    const drawerContentEl = stepperEl.querySelector('.interview-stepper-drawer-content');

    function toggleDrawer(force) {
      isDrawerOpen = typeof force === 'boolean' ? force : !isDrawerOpen;
      stepperEl.dataset.expanded = String(isDrawerOpen);
      drawerEl.hidden = !isDrawerOpen;
      notesBtn.setAttribute('aria-expanded', String(isDrawerOpen));
      notesIcon.textContent = isDrawerOpen ? '▲' : '▼';
    }

    notesBtn.addEventListener('click', () => toggleDrawer());

    async function loadMasterDoc(scenarioId) {
      if (masterDocsCache.has(scenarioId)) {
        return masterDocsCache.get(scenarioId);
      }
      const example = config.examples.find(e => e.id === scenarioId);
      if (!example) return null;
      try {
        const res = await fetch(example.path);
        if (!res.ok) return null;
        const doc = await res.json();
        masterDocsCache.set(scenarioId, doc);
        return doc;
      } catch {
        return null;
      }
    }

    function renderTaskPrompt() {
      if (currentScenarioId === 'custom') {
        promptTextEl.textContent = customPromptText || 'Enter your custom 1-2 sentence system design task below.';
        titleEl.textContent = 'Custom System Design Task';
        subtitleEl.textContent = 'Whiteboard Mode';
      } else if (currentScenario) {
        promptTextEl.textContent = currentScenario.problemStatement || currentScenario.subtitle;
        titleEl.textContent = currentScenario.title;
        subtitleEl.textContent = `${currentScenario.subtitle} (${currentScenario.targetQps})`;
      } else {
        promptTextEl.textContent = 'Choose an interview problem or enter a custom task to begin.';
        titleEl.textContent = 'Blank Whiteboard';
        subtitleEl.textContent = 'System Design Interview';
      }
    }

    function renderPills() {
      pillsContainer.innerHTML = '';

      if (currentScenarioId === 'custom' || !currentScenario) {
        const pill0 = document.createElement('button');
        pill0.type = 'button';
        pill0.className = 'interview-stepper-pill is-active';
        pill0.setAttribute('role', 'tab');
        pill0.setAttribute('aria-selected', 'true');
        pill0.innerHTML = `<span class="pill-number">0</span><span class="pill-name">Blank Whiteboard</span>`;
        pillsContainer.appendChild(pill0);

        prevBtn.disabled = true;
        nextBtn.disabled = true;
        fullBtn.classList.remove('is-active');
        return;
      }

      // Pill 0: Blank Canvas
      const pill0 = document.createElement('button');
      pill0.type = 'button';
      pill0.className = `interview-stepper-pill${currentStepIndex === 0 ? ' is-active' : ''}`;
      pill0.setAttribute('role', 'tab');
      pill0.setAttribute('aria-selected', String(currentStepIndex === 0));
      pill0.innerHTML = `<span class="pill-number">0</span><span class="pill-name">Blank Canvas</span>`;
      pill0.addEventListener('click', () => goToStep(0));
      pillsContainer.appendChild(pill0);

      // Pills 1..N
      currentScenario.steps.forEach((step, idx) => {
        const stepNum = idx + 1;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `interview-stepper-pill${currentStepIndex === stepNum ? ' is-active' : ''}`;
        pill.setAttribute('role', 'tab');
        pill.setAttribute('aria-selected', String(currentStepIndex === stepNum));
        pill.innerHTML = `
          <span class="pill-number">${step.stepNumber}</span>
          <span class="pill-name">${step.name}</span>
        `;
        pill.addEventListener('click', () => goToStep(stepNum));
        pillsContainer.appendChild(pill);
      });

      const isFull = currentStepIndex === -1;
      fullBtn.classList.toggle('is-active', isFull);
      prevBtn.disabled = currentStepIndex === 0;
      nextBtn.disabled = isFull;
    }

    function renderDrawer() {
      if (currentScenarioId === 'custom' || !currentScenario) {
        drawerContentEl.innerHTML = `
          <div class="interview-step-card is-prompt">
            <div class="card-eyebrow">Custom Problem Statement</div>
            <div class="card-quote">${customPromptText || 'Enter your custom 1-2 sentence system design task above to begin.'}</div>
          </div>
          <div class="interview-step-card is-solution">
            <div class="card-eyebrow">Candidate Whiteboard Plan</div>
            <p class="card-text">Use the Components drawer on the left to drag nodes (API server, database, cache, message queues) onto the canvas, link them with edges, and structure your architecture.</p>
          </div>
        `;
        return;
      }

      if (currentStepIndex === 0) {
        drawerContentEl.innerHTML = `
          <div class="interview-step-card is-prompt">
            <div class="card-eyebrow">Initial Whiteboard Stage · <span class="card-stage">Problem Introduction</span></div>
            <blockquote class="card-quote">${currentScenario.problemStatement}</blockquote>
          </div>
          <div class="interview-step-columns">
            <div class="interview-step-card is-solution">
              <div class="card-eyebrow">Interview Recommendation</div>
              <p class="card-text">Start on this blank whiteboard by clarifying functional requirements (read/write volume, latency SLA) and sketching the primary request path. Click <strong>Next ›</strong> to inspect the baseline MVP architecture.</p>
            </div>
            <div class="interview-step-card is-tradeoffs">
              <div class="card-eyebrow">Scale & Constraints</div>
              <ul class="card-list">
                <li>Target scale: <strong>${currentScenario.targetQps}</strong></li>
                <li>Establish single points of failure before introducing distributed complexity.</li>
                <li>Clarify read/write ratio and data persistence requirements.</li>
              </ul>
            </div>
          </div>
        `;
        return;
      }

      if (currentStepIndex === -1) {
        drawerContentEl.innerHTML = `
          <div class="interview-step-card is-prompt">
            <div class="card-eyebrow">Complete Architecture Overview</div>
            <div class="card-quote">This view represents the fully composed system including all stages, resilience mechanisms, and background pipelines.</div>
          </div>
        `;
        return;
      }

      const step = currentScenario.steps[currentStepIndex - 1];
      const tradeoffsHtml = (step.tradeoffs || []).map(t => `<li>${t}</li>`).join('');

      drawerContentEl.innerHTML = `
        <div class="interview-step-card is-prompt">
          <div class="card-eyebrow">Interviewer Challenge · <span class="card-stage">${step.stage}</span></div>
          <blockquote class="card-quote">${step.interviewerPrompt}</blockquote>
        </div>
        <div class="interview-step-columns">
          <div class="interview-step-card is-solution">
            <div class="card-eyebrow">Candidate Architectural Solution</div>
            <p class="card-text">${step.solution}</p>
          </div>
          <div class="interview-step-card is-tradeoffs">
            <div class="card-eyebrow">Key Trade-offs & Talking Points</div>
            <ul class="card-list">${tradeoffsHtml}</ul>
          </div>
        </div>
      `;
    }

    async function goToStep(stepNum) {
      if (stepNum === 0) {
        // Blank Canvas mode
        currentStepIndex = 0;
        const emptyDoc = docs.emptyDiagram(config);
        model.replace(emptyDoc);
        canvas.render();
        canvas.fit({ readable: true });
        canvas.flush();
        renderPills();
        renderDrawer();
        onStepChange?.(emptyDoc, null);
        onMessage?.(`Whiteboard ready: Blank canvas.`);
        return;
      }

      if (!currentScenario) return;
      const stepIdx = stepNum - 1;
      if (stepIdx < 0 || stepIdx >= currentScenario.steps.length) return;

      currentStepIndex = stepNum;
      const step = currentScenario.steps[stepIdx];

      try {
        const master = await loadMasterDoc(currentScenarioId);
        if (!master) throw Error('Master diagram could not be loaded');

        const stepDoc = buildStepDocument(master, step, library, config);
        const res = model.replace(stepDoc);
        if (!res.ok) throw Error(res.error);

        if (step.highlightNodes && step.highlightNodes.length) {
          model.select({ nodes: step.highlightNodes });
        } else {
          model.select({ nodes: [] });
        }

        canvas.render();
        canvas.fit({ readable: true });
        canvas.flush();

        renderPills();
        renderDrawer();

        onStepChange?.(stepDoc, step);
        onMessage?.(`Interview Step ${step.stepNumber}/${currentScenario.steps.length}: ${step.name}`);
      } catch (err) {
        onMessage?.(`Error applying step: ${err.message}`, true);
      }
    }

    async function showFull() {
      if (!currentScenario) return;
      currentStepIndex = -1;

      try {
        const master = await loadMasterDoc(currentScenarioId);
        if (!master) throw Error('Master diagram could not be loaded');

        const fullDoc = clone(master);
        const res = model.replace(fullDoc);
        if (!res.ok) throw Error(res.error);

        model.select({ nodes: [] });
        canvas.render();
        canvas.fit({ readable: true });
        canvas.flush();

        renderPills();
        renderDrawer();

        onStepChange?.(fullDoc, null);
        onMessage?.(`Showing complete system architecture.`);
      } catch (err) {
        onMessage?.(`Error restoring full diagram: ${err.message}`, true);
      }
    }

    async function setScenario(scenarioId) {
      currentScenarioId = scenarioId;
      problemSelectEl.value = scenarioId;

      if (scenarioId === 'custom') {
        currentScenario = null;
        customEditorEl.hidden = false;
        customInputEl.focus();
        renderTaskPrompt();
        goToStep(0);
        return;
      }

      customEditorEl.hidden = true;
      if (journeysData?.scenarios?.[scenarioId]) {
        currentScenario = journeysData.scenarios[scenarioId];
        await loadMasterDoc(scenarioId);
      } else {
        currentScenario = null;
      }

      renderTaskPrompt();
      // Changing problem always begins with a fresh blank canvas
      goToStep(0);
    }

    // Event Handlers
    problemSelectEl.addEventListener('change', () => {
      setScenario(problemSelectEl.value);
    });

    editPromptBtn.addEventListener('click', () => {
      customEditorEl.hidden = false;
      customInputEl.value = currentScenarioId === 'custom' ? customPromptText : (currentScenario?.problemStatement || '');
      customInputEl.focus();
    });

    clearCanvasBtn.addEventListener('click', () => {
      goToStep(0);
    });

    saveCustomBtn.addEventListener('click', () => {
      const val = customInputEl.value.trim();
      if (val) {
        customPromptText = val;
        currentScenarioId = 'custom';
        problemSelectEl.value = 'custom';
        customEditorEl.hidden = true;
        renderTaskPrompt();
        goToStep(0);
        onMessage?.('Custom interview problem set.');
      }
    });

    cancelCustomBtn.addEventListener('click', () => {
      customEditorEl.hidden = true;
    });

    customInputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        saveCustomBtn.click();
      } else if (e.key === 'Escape') {
        cancelCustomBtn.click();
      }
    });

    prevBtn.addEventListener('click', () => {
      if (!currentScenario) return;
      if (currentStepIndex === -1) {
        goToStep(currentScenario.steps.length);
      } else if (currentStepIndex > 0) {
        goToStep(currentStepIndex - 1);
      }
    });

    nextBtn.addEventListener('click', () => {
      if (!currentScenario) return;
      if (currentStepIndex === -1) {
        goToStep(0);
      } else if (currentStepIndex < currentScenario.steps.length) {
        goToStep(currentStepIndex + 1);
      } else {
        showFull();
      }
    });

    fullBtn.addEventListener('click', () => {
      showFull();
    });

    // Load journeys JSON
    fetch('/data/system-diagram/interview-journeys.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        journeysData = data;
        setScenario('web-service');
      })
      .catch(() => {});

    // Keyboard navigation listener
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, select')) return;

      if (e.key === '[') {
        e.preventDefault();
        prevBtn.click();
      } else if (e.key === ']') {
        e.preventDefault();
        nextBtn.click();
      } else if (e.key === '\\') {
        e.preventDefault();
        toggleDrawer();
      }
    });

    function onDocumentLoaded(doc) {
      if (!journeysData || !journeysData.scenarios) return;
      if (journeysData.scenarios[doc.id]) {
        currentScenarioId = doc.id;
        currentScenario = journeysData.scenarios[doc.id];
        problemSelectEl.value = doc.id;
        renderTaskPrompt();
        renderPills();
        renderDrawer();
      }
    }

    return Object.freeze({
      onDocumentLoaded,
      setScenario,
      goToStep,
      showFull,
      toggleDrawer,
      getScenario: () => currentScenario,
      getStepIndex: () => currentStepIndex,
      isExpanded: () => isDrawerOpen,
    });
  }

  return Object.freeze({
    create,
    buildStepDocument,
  });
});
