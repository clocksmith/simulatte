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
    let journeysData = null;
    let masterDoc = null;
    let currentScenario = null;
    let currentStepIndex = -1; // -1 means Full Architecture View
    let isDrawerOpen = false;

    // Load journeys JSON
    fetch('/data/system-diagram/interview-journeys.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        journeysData = data;
        if (model?.diagram) {
          onDocumentLoaded(model.diagram);
        }
      })
      .catch(() => {
        // Quietly degrade if journeys not found
      });

    // Create Stepper Container
    const root = document.createElement('section');
    root.className = 'interview-stepper';
    root.dataset.visible = 'false';
    root.dataset.expanded = 'false';
    root.setAttribute('aria-label', 'Lucyd system design interview journey');

    root.innerHTML = `
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

    host.appendChild(root);

    const titleEl = root.querySelector('.interview-stepper-title');
    const subtitleEl = root.querySelector('.interview-stepper-subtitle');
    const notesBtn = root.querySelector('.interview-stepper-notes-btn');
    const notesIcon = root.querySelector('.interview-stepper-notes-icon');
    const prevBtn = root.querySelector('.interview-stepper-nav-btn.is-prev');
    const nextBtn = root.querySelector('.interview-stepper-nav-btn.is-next');
    const fullBtn = root.querySelector('.interview-stepper-nav-btn.is-full');
    const pillsContainer = root.querySelector('.interview-stepper-pills');
    const drawerEl = root.querySelector('.interview-stepper-drawer');
    const drawerContentEl = root.querySelector('.interview-stepper-drawer-content');

    function toggleDrawer(force) {
      isDrawerOpen = typeof force === 'boolean' ? force : !isDrawerOpen;
      root.dataset.expanded = String(isDrawerOpen);
      drawerEl.hidden = !isDrawerOpen;
      notesBtn.setAttribute('aria-expanded', String(isDrawerOpen));
      notesIcon.textContent = isDrawerOpen ? '▲' : '▼';
    }

    notesBtn.addEventListener('click', () => toggleDrawer());

    prevBtn.addEventListener('click', () => {
      if (!currentScenario) return;
      if (currentStepIndex === -1) {
        goToStep(currentScenario.steps.length - 1);
      } else if (currentStepIndex > 0) {
        goToStep(currentStepIndex - 1);
      }
    });

    nextBtn.addEventListener('click', () => {
      if (!currentScenario) return;
      if (currentStepIndex === -1) {
        goToStep(0);
      } else if (currentStepIndex < currentScenario.steps.length - 1) {
        goToStep(currentStepIndex + 1);
      } else {
        showFull();
      }
    });

    fullBtn.addEventListener('click', () => {
      showFull();
    });

    function renderPills() {
      pillsContainer.innerHTML = '';
      if (!currentScenario) return;

      currentScenario.steps.forEach((step, idx) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `interview-stepper-pill${idx === currentStepIndex ? ' is-active' : ''}`;
        pill.setAttribute('role', 'tab');
        pill.setAttribute('aria-selected', String(idx === currentStepIndex));
        pill.innerHTML = `
          <span class="pill-number">${step.stepNumber}</span>
          <span class="pill-name">${step.name}</span>
        `;
        pill.addEventListener('click', () => goToStep(idx));
        pillsContainer.appendChild(pill);
      });

      const isFull = currentStepIndex === -1;
      fullBtn.classList.toggle('is-active', isFull);
      prevBtn.disabled = currentStepIndex === 0;
      nextBtn.disabled = isFull;
    }

    function renderDrawer() {
      if (!currentScenario) {
        drawerContentEl.innerHTML = '';
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

      const step = currentScenario.steps[currentStepIndex];
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

    function goToStep(idx) {
      if (!currentScenario || !masterDoc) return;
      if (idx < 0 || idx >= currentScenario.steps.length) return;

      currentStepIndex = idx;
      const step = currentScenario.steps[idx];

      try {
        const stepDoc = buildStepDocument(masterDoc, step, library, config);
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
        onMessage?.(`Error applying interview step: ${err.message}`, true);
      }
    }

    function showFull() {
      if (!currentScenario || !masterDoc) return;
      currentStepIndex = -1;

      try {
        const fullDoc = clone(masterDoc);
        const res = model.replace(fullDoc);
        if (!res.ok) throw Error(res.error);

        model.select({ nodes: [] });
        canvas.render();
        canvas.fit({ readable: true });
        canvas.flush();

        renderPills();
        renderDrawer();

        onStepChange?.(fullDoc, null);
        onMessage?.(`Showing full system architecture.`);
      } catch (err) {
        onMessage?.(`Error restoring full diagram: ${err.message}`, true);
      }
    }

    function onDocumentLoaded(doc) {
      if (!journeysData || !journeysData.scenarios) return;

      const scenario = journeysData.scenarios[doc.id];
      if (!scenario) {
        currentScenario = null;
        masterDoc = null;
        currentStepIndex = -1;
        root.dataset.visible = 'false';
        toggleDrawer(false);
        return;
      }

      masterDoc = clone(doc);
      currentScenario = scenario;
      root.dataset.visible = 'true';
      titleEl.textContent = scenario.title;
      subtitleEl.textContent = `${scenario.subtitle} (${scenario.targetQps})`;

      goToStep(0);
    }

    // Keyboard navigation listener
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, select')) return;
      if (!currentScenario || root.dataset.visible !== 'true') return;

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

    return Object.freeze({
      onDocumentLoaded,
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
