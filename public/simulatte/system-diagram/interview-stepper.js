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

  function validateProblems(data) {
    if (data?.schema !== 'simulatte.lucydProblems.v1' || !Array.isArray(data.problems) || !data.problems.length) throw Error('Interview problem registry is required');
    const ids = new Set();
    for (const problem of data.problems) {
      const source = data.sources?.[problem.sourceId];
      if (!problem.id || ids.has(problem.id) || !problem.title || !problem.problemStatement?.trim() || problem.problemStatement.length > 300) throw Error('Interview problems need unique IDs and concise statements');
      if (!source || !/^https:\/\//.test(source.url) || !['company-published', 'candidate-reported', 'authored-practice'].includes(source.kind) || problem.sourceKind !== source.kind) throw Error('Interview problem needs matching source provenance');
      if (!Array.isArray(problem.steps) || !problem.steps.length || problem.steps.some(step => !step.name || !step.interviewerPrompt)) throw Error('Interview followups are required');
      ids.add(problem.id);
    }
    return clone(data);
  }

  // Stage snapshots never go to storage; private locking clears this owner too.
  function createProgress(model, config) {
    const snapshots = new Map();
    let problemId = null, index = 0;
    function save() { if (problemId) snapshots.set(`${problemId}:${index}`, clone(model.diagram)); }
    function restore(doc) { const result = model.replace(clone(doc)); if (!result.ok) throw Error(result.error); }
    return {
      select(id) { save(); problemId = id; index = 0; restore(snapshots.get(`${id}:0`) || documentsApi.emptyDiagram(config)); },
      move(next) { save(); const prior = snapshots.get(`${problemId}:${next}`); index = next; if (prior) restore(prior); },
      save,
      clear() { snapshots.clear(); problemId = null; index = 0; },
      get index() { return index; },
    };
  }

  function create({ host, model, canvas, library, config, onStepChange, onMessage, onSimulate }) {
    const doc = host.ownerDocument, events = new AbortController();
    const progress = createProgress(model, config), problems = new Map();
    let sourceData = null, current = null, reference = null, generation = 0, solutions = {}, walkthrough = null;
    const make = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; };
    const listen = (el, type, fn) => el.addEventListener(type, fn, { signal: events.signal });
    const button = (text, label, action) => {
      const el = make('button', 'wui-btn lucyd-task-action', text); el.type = 'button'; el.setAttribute('aria-label', label);
      listen(el, 'click', () => { Promise.resolve().then(action).catch(error => onMessage?.(error.message, true)); });
      return el;
    };
    const bar = make('section', 'lucyd-task-bar'); bar.setAttribute('aria-label', 'Interview task');
    const prompt = make('p', 'lucyd-task-prompt');
    const choose = button('Choose problem', 'Choose interview problem or write a task', () => picker.showModal());
    const details = button('Details', 'Problem details and source', () => { renderDetails(); info.showModal(); });
    const solutionButton = button('Play solution', 'Open step-by-step example solution', () => showSolution());
    bar.append(prompt, choose, details, solutionButton); host.append(bar);
    const stepper = make('nav', 'interview-stepper'); stepper.setAttribute('aria-label', 'Interview stages');
    const prev = button('Previous', 'Previous interview stage', () => goToStep((walkthrough?.index ?? progress.index) - 1));
    const stage = make('span', 'interview-stepper-title'); stage.setAttribute('aria-live', 'polite');
    const next = button('Next', 'Next interview stage', () => walkthrough && walkthrough.index === walkthrough.solution.steps.length - 1 ? onSimulate?.() : goToStep((walkthrough?.index ?? progress.index) + 1));
    const returnButton = button('Back to my diagram', 'Return from reference', () => leaveReference());
    stepper.append(prev, stage, next); bar.append(returnButton); host.append(stepper);

    function dialog(title) {
      const el = make('dialog', 'lucyd-dialog'); el.setAttribute('aria-label', title);
      const heading = make('div', 'panel-heading'); heading.append(make('h2', '', title), button('Close', `Close ${title}`, () => el.close()));
      el.append(heading); host.append(el); return el;
    }
    const picker = dialog('Choose a problem');
    const select = make('select', 'wui-field'); select.setAttribute('aria-label', 'Interview problem'); select.dataset.layout = 'fill';
    const preview = make('p', 'lucyd-picker-preview'), provenance = make('div', 'lucyd-source');
    const start = button('Start problem', 'Start selected problem', () => { setScenario(select.value); picker.close(); });
    picker.append(select, preview, provenance, start);
    const form = make('form', 'lucyd-custom-task'), label = make('label', '', 'Or write a task');
    const custom = make('textarea', 'wui-field'); custom.dataset.layout = 'fill'; custom.rows = 2; custom.maxLength = 300; custom.placeholder = 'Describe the problem in one or two sentences'; custom.setAttribute('aria-label', 'Custom task');
    label.append(custom); const submit = make('button', 'wui-btn', 'Start custom task'); submit.type = 'submit'; form.append(label, submit); picker.append(form);
    const info = dialog('Problem details');
    const infoBody = make('div', 'lucyd-details'); info.append(infoBody);

    function sourceElement(problem) {
      const el = make('div', 'lucyd-source');
      if (problem.sourceKind === 'practice') { el.textContent = 'Lucyd practice scenario'; return el; }
      if (problem.sourceKind === 'custom') { el.textContent = 'Your task'; return el; }
      const source = sourceData.sources[problem.sourceId];
      const label = problem.sourceKind === 'authored-practice' ? 'Authored practice · technical reference' : problem.sourceKind === 'company-published' ? 'Published exercise' : 'Candidate report';
      const link = make('a', '', `${label} · ${problem.company}`);
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; el.append(link); return el;
    }
    function renderPicker() {
      select.replaceChildren(new Option('Select a problem', ''));
      for (const [kind, name] of [['company-published', 'Published interview exercises'], ['candidate-reported', 'Firsthand interview reports'], ['authored-practice', 'Company-inspired practice'], ['practice', 'Practice examples']]) {
        const group = make('optgroup'); group.label = name;
        for (const p of problems.values()) if (p.sourceKind === kind) group.append(new Option(`${p.title}${p.company ? ` · ${p.company}` : ''}`, p.id));
        select.append(group);
      }
      start.disabled = true;
    }
    listen(select, 'change', () => {
      const p = problems.get(select.value); start.disabled = !p;
      preview.textContent = p?.problemStatement || ''; provenance.replaceChildren();
      if (p) provenance.append(sourceElement(p));
    });
    const startCustom = event => {
      event.preventDefault(); const text = custom.value.trim(); if (!text) return;
      problems.set('custom', {id: 'custom', title: 'Custom task', sourceKind: 'custom', problemStatement: text, steps: [
        {name: 'Requirements', interviewerPrompt: 'Which requirements and constraints matter first?'},
        {name: 'Architecture', interviewerPrompt: 'Trace the main request through your design.'},
        {name: 'Failures', interviewerPrompt: 'What happens when one component is unavailable?'},
      ]});
      setScenario('custom'); picker.close();
    };
    listen(form, 'submit', startCustom); listen(submit, 'click', startCustom);

    function render() {
      const activeStep = walkthrough?.solution.steps[walkthrough.index];
      prompt.textContent = activeStep ? activeStep.explanation : current ? (progress.index ? current.steps[progress.index - 1].interviewerPrompt : current.problemStatement) : 'What are you designing?';
      choose.textContent = current ? 'Change' : 'Choose problem';
      details.hidden = !current; stepper.hidden = !current;
      prev.disabled = walkthrough ? walkthrough.index === 0 : !current || progress.index === 0 || !!reference;
      next.disabled = walkthrough ? false : !current || progress.index >= current.steps.length || !!reference;
      next.textContent = walkthrough && walkthrough.index === walkthrough.solution.steps.length - 1 ? 'Simulate' : 'Next';
      next.setAttribute('aria-label', next.textContent === 'Simulate' ? 'Simulate completed solution' : 'Next interview stage');
      stage.textContent = activeStep ? `${walkthrough.index + 1}/${walkthrough.solution.steps.length} · ${activeStep.name}` : reference ? 'Example architecture' : current ? `${progress.index + 1}/${current.steps.length + 1} · ${progress.index ? current.steps[progress.index - 1].name : 'Problem'}` : '';
      solutionButton.hidden = !current || !solutions[current.solutionId] || Boolean(reference);
      returnButton.hidden = !reference;
    }
    function refresh() { canvas.render(); canvas.flush(); render(); onStepChange?.(model.diagram, current?.steps[progress.index - 1] || null); }
    function leaveReference() {
      if (!reference) return;
      const result = model.replace(reference); if (!result.ok) throw Error(result.error);
      generation++; reference = null; walkthrough = null; refresh(); canvas.fit({readable: true});
    }
    function setScenario(id) {
      const p = problems.get(id); if (!p) throw Error(`Unknown problem: ${id}`);
      generation++; leaveReference(); progress.select(id); current = p;
      refresh(); canvas.fit({readable: true});
    }
    async function goToStep(index) {
      if (walkthrough) return loadSolutionStep(index);
      if (!current || !Number.isInteger(index) || index < 0 || index > current.steps.length) return;
      generation++; leaveReference(); progress.move(index); refresh();
    }
    async function loadSolutionStep(index) {
      const owner = walkthrough;
      if (!owner || !Number.isInteger(index) || index < 0 || index >= owner.solution.steps.length) return;
      if (owner.loaded) owner.snapshots.set(owner.index, clone(model.diagram));
      const token = ++generation, step = owner.solution.steps[index], expected = model.diagram;
      let diagram = owner.snapshots.get(index);
      if (!diagram) {
        const response = await fetch(step.diagramPath); if (!response.ok) throw Error('Solution stage is unavailable');
        diagram = documentsApi.validate(await response.json(), library, config);
      }
      if (token !== generation || owner !== walkthrough) return;
      if (model.diagram !== expected) throw Error('Kept your newer diagram edits; select the solution step again when ready.');
      const result = model.replace(diagram); if (!result.ok) throw Error(result.error);
      owner.index = index; owner.loaded = true; refresh(); canvas.fit({readable:true});
    }
    async function showSolution() {
      const solution = solutions[current?.solutionId]; if (!solution) throw Error('This problem has no solution walkthrough');
      if (reference) leaveReference();
      const expected = model.diagram;
      reference = clone(model.diagram); walkthrough = {solution, index:0, loaded:false, snapshots:new Map()};
      try { await loadSolutionStep(0); }
      catch (error) { if(model.diagram === expected) leaveReference(); else {reference=null;walkthrough=null;render();} throw error; }
    }
    async function showFull() {
      if (!current?.referenceExampleId) return;
      const token = ++generation, example = config.examples.find(e => e.id === current.referenceExampleId);
      const response = await fetch(example.path); if (!response.ok) throw Error('Example architecture is unavailable');
      const diagram = documentsApi.validate(await response.json(), library, config);
      if (token !== generation) return;
      if (!reference) reference = clone(model.diagram);
      const result = model.replace(diagram); if (!result.ok) throw Error(result.error);
      info.close(); refresh(); canvas.fit({readable: true});
    }
    function renderDetails() {
      infoBody.replaceChildren(); if (!current) return;
      infoBody.append(make('p', '', current.problemStatement), sourceElement(current));
      if (walkthrough) infoBody.append(make('p', '', walkthrough.solution.boundary));
      const step = current.steps[progress.index - 1];
      if (step) {
        infoBody.append(make('h3', '', step.name), make('p', '', step.interviewerPrompt));
        if (step.solution || step.tradeoffs?.length) {
          const hint = make('details'); hint.append(make('summary', '', 'Practice notes'));
          if (step.solution) hint.append(make('p', '', step.solution));
          if (step.tradeoffs?.length) { const list = make('ul'); for (const text of step.tradeoffs) list.append(make('li', '', text)); hint.append(list); }
          infoBody.append(hint);
        }
      }
      if (current.sourceKind !== 'practice' && current.sourceKind !== 'custom') infoBody.append(make('small', '', sourceData.followupAttribution));
      if (current.referenceExampleId) infoBody.append(button('Open example', 'Open optional example architecture', showFull));
    }
    function reset() {
      generation++; progress.clear(); current = null; reference = null; walkthrough = null; problems.delete('custom');
      picker.close(); info.close(); custom.value = ''; preview.textContent = ''; provenance.replaceChildren(); infoBody.replaceChildren();
      select.value = ''; render();
    }
    const keydown = event => {
      if (event.target.closest('input,textarea,select,[contenteditable=true]') || doc.querySelector('dialog[open]')) return;
      if (event.key === '[' || event.key === ']') { event.preventDefault(); goToStep(progress.index + (event.key === '[' ? -1 : 1)); }
    };
    listen(doc, 'keydown', keydown);
    choose.disabled = true; render();
    const ready = Promise.all([config.interviewProblemsPath, config.interviewJourneysPath, config.interviewSolutionsPath].map(async path => {
      if (!path) throw Error('Interview data path is required');
      const response = await fetch(path); if (!response.ok) throw Error(`Interview data unavailable: ${path}`); return response.json();
    })).then(([data, journeys, solutionData]) => {
      if (journeys?.schema !== 'simulatte.systemDiagramInterview.v1' || !journeys.scenarios) throw Error('Interview practice journeys are required');
      sourceData = validateProblems(data);
      solutions = validateSolutions(solutionData, sourceData, config);
      for (const p of sourceData.problems) problems.set(p.id, p);
      for (const [id, p] of Object.entries(journeys.scenarios || {})) problems.set(id, {...p, id, sourceKind: 'practice', referenceExampleId: id});
      renderPicker(); choose.disabled = false; render();
    }).catch(error => { onMessage?.(error.message, true); throw error; });
    // The page reports a failed load while callers can also await readiness.
    ready.catch(() => {});
    return Object.freeze({ready, setScenario, goToStep, showFull, showSolution, leaveReference, reset, onDocumentLoaded: reset,
      toggleDrawer() { if (info.open) info.close(); else if (current) { renderDetails(); info.showModal(); } },
      getScenario: () => current, getStepIndex: () => progress.index, isExpanded: () => info.open,
      dispose() { generation++; progress.clear(); events.abort(); bar.remove(); stepper.remove(); picker.remove(); info.remove(); },
    });
  }
  function validateSolutions(data, problems, config) {
    if (data?.schema !== 'simulatte.interviewSolutions.v1' || !data.solutions || Array.isArray(data.solutions)) throw Error('Solution registry is required');
    for (const [id, solution] of Object.entries(data.solutions)) {
      if (solution.id !== id || !solution.title || !solution.boundary || !Array.isArray(solution.steps) || !solution.steps.length || solution.steps.some(s=>!s.name || !s.explanation || !/^\/data\/system-diagram\/solutions\/[a-z0-9-]+\/step-[1-9][0-9]*\.json$/.test(s.diagramPath))) throw Error(`Invalid solution: ${id}`);
      if (!config.examples.some(e=>e.id===id)) throw Error(`Solution ${id} needs an example architecture`);
    }
    for (const problem of problems.problems) if (problem.solutionId && !data.solutions[problem.solutionId]) throw Error(`Missing solution for ${problem.id}`);
    return clone(data.solutions);
  }
  return Object.freeze({create, buildStepDocument, validateProblems, validateSolutions, createProgress});
});
