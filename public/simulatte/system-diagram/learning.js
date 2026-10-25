(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramWalkthrough = api;
})(globalThis, function () {
  'use strict';
  const SCHEMA = 'simulatte.systemDiagramLearning.v1';
  const ROWS_PER_PAGE = 25;
  function validate(value) {
    if (value?.schema !== SCHEMA || !Array.isArray(value.journeys)) throw Error('Expected system diagram learning journeys v1');
    const ids = new Set();
    for (const row of value.journeys) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw Error('Learning journeys require unique ids');
      ids.add(row.id);
      for (const key of ['title', 'question', 'outcome', 'failure', 'boundary']) if (typeof row[key] !== 'string' || !row[key].trim()) throw Error(`Journey ${row.id} requires ${key}`);
      if (!Array.isArray(row.steps) || !row.steps.length) throw Error(`Journey ${row.id} requires steps`);
      for (const step of row.steps) if (!step || typeof step.label !== 'string' || !step.label.trim() || !Array.isArray(step.classes) || !step.classes.length || step.classes.some(id => typeof id !== 'string' || !id)) throw Error(`Journey ${row.id} has invalid step`);
    }
    return value;
  }
  function tables(diagram, view, selection) {
    const ids = new Set(selection?.nodes || []), selected = ids.size > 0;
    return diagram.nodes.filter(node => !selected || ids.has(node.id)).flatMap(node =>
      Object.entries(view?.nodes?.[node.id]?.records || {}).map(([name, rows]) => ({ nodeId: node.id, label: node.label, name, rows })));
  }
  function matchingNodes(diagram, step) {
    const parents = new Map(diagram.classes.map(row => [row.id, row.extends]));
    return diagram.nodes.filter(node => {
      const visited = new Set();
      for (let id = node.classId; id && !visited.has(id); id = parents.get(id)) {
        if (step.classes.includes(id)) return true;
        visited.add(id);
      }
      return false;
    });
  }
  function create({ host, model, config, getView, isPending = () => false, onMessage = () => {} }) {
    if (!host) throw Error('Learning walkthrough host is required');
    const source = host.dataset.journeysSrc;
    if (!source) throw Error('Learning walkthrough source path is missing');
    const doc = host.ownerDocument, abort = new AbortController();
    const recordItems = new Map(), activityItems = new Map();
    let data = null, disposed = false, lastView = null, flowSignature = '', activeTab = 'flow';
    const element = (tag, text, className) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
    function button(text, action, value, aria) {
      const b = element('button', text, 'learning-button'); b.type = 'button'; b.dataset.learningAction = action;
      if (value !== undefined) b.dataset.learningValue = value;
      if (aria) b.setAttribute('aria-label', aria);
      return b;
    }
    const heading = element('h2', 'What system are you designing?');
    const choices = element('div', undefined, 'learning-choices'), notice = element('p'); notice.hidden = true;
    const body = element('div', undefined, 'learning-body'), question = element('h3');
    const tabs = element('div', undefined, 'learning-tabs'); tabs.setAttribute('aria-label', 'Walkthrough views');
    const tabButtons = new Map();
    for (const [id, label] of [['flow', 'Follow the request'], ['records', 'Inspect stored data'], ['activity', 'Watch execution']]) {
      const b = button(label, 'tab', id); tabs.append(b); tabButtons.set(id, b);
    }
    const flow = element('div'), records = element('div'), activity = element('div');
    const pendingNote = element('p', 'Run to accept this architecture. Stored records and execution state appear here after the simulation advances.');
    const recordNote = element('p'), recordList = element('div'), emptyRecords = element('p', 'No structured records on these components. Select a store, worker, or dashboard.');
    records.append(recordNote, emptyRecords, recordList);
    const activityStatus = element('p'), activityList = element('ul', undefined, 'learning-activity');
    activity.append(activityStatus, activityList, element('p', 'Select a request below for attempts, waits, effects, and their causal history.'));
    const assumptions = element('details'), boundary = element('p');
    assumptions.append(element('summary', 'Model boundary'), boundary);
    body.append(question, tabs, pendingNote, flow, records, activity, assumptions);
    host.replaceChildren(heading, choices, notice, body);

    function currentJourney() { return data?.journeys.find(row => row.id === model.diagram.id); }
    function selectExample(id) {
      const preset = doc.getElementById('preset');
      if (!config.examples.some(row => row.id === id) || !preset) { onMessage('This example is unavailable in the loaded configuration.', true); return; }
      preset.value = id;
      const EventType = doc.defaultView?.Event || Event;
      preset.dispatchEvent(new EventType('change', { bubbles: true }));
    }
    function revealNodes(ids) {
      const selected = new Set(ids);
      for (const group of model.diagram.groups || []) {
        if (!group.collapsed || !model.diagram.nodes.some(node => selected.has(node.id) && node.groupId === group.id)) continue;
        const result = model.apply({ type: 'setGroupCollapsed', id: group.id, collapsed: false });
        if (!result.ok) { onMessage(result.error, true); return; }
      }
      model.select({ nodes: ids });
    }
    // One delegated listener owns controls across all ticks, pages and diagram changes.
    host.addEventListener('click', event => {
      const target = event.target.closest?.('button[data-learning-action]');
      if (!target || !host.contains(target) || target.disabled || disposed) return;
      const action = target.dataset.learningAction, value = target.dataset.learningValue;
      if (action === 'example') selectExample(value);
      else if (action === 'tab') { activeTab = value; render(getView()); }
      else if (action === 'step') {
        const step = currentJourney()?.steps[Number(value)];
        if (step) revealNodes(matchingNodes(model.diagram, step).map(node => node.id));
      } else if (action === 'node') revealNodes([value]);
      else if (action === 'page') {
        const item = recordItems.get(value);
        if (item) { item.page += Number(target.dataset.direction); render(lastView); }
      }
    }, { signal: abort.signal });

    function renderFlow(journey) {
      const key = JSON.stringify([journey || null, Boolean(data), model.diagram.nodes.map(node => [node.id, node.classId]), model.diagram.classes.map(row => [row.id, row.extends])]);
      if (key === flowSignature) return;
      flowSignature = key; flow.replaceChildren();
      if (!journey) {
        flow.append(element('p', data ? 'Choose a question above, or inspect the stored data and execution of your own architecture.' : 'Loading guided questions. Your architecture can already be inspected with the tabs above.'));
        return;
      }
      const list = element('ol', undefined, 'learning-steps');
      journey.steps.forEach((step, index) => {
        const item = element('li'), matches = matchingNodes(model.diagram, step);
        const b = button(step.label, 'step', String(index), `Inspect: ${step.label}`);
        b.disabled = !matches.length; item.append(b);
        if (!matches.length) item.append(element('span', ' Component removed from this diagram.'));
        list.append(item);
      });
      flow.append(list, element('p', `Observe: ${journey.outcome}`), element('p', `Failure experiment: ${journey.failure}`));
    }
    function newTable(id) {
      const box = element('details', undefined, 'learning-records'); box.open = true; box.dataset.recordTable = id;
      const summary = element('summary'), empty = element('p', 'No records yet. Advance the simulation to observe writes.');
      const pager = element('div', undefined, 'learning-tabs'), count = element('span');
      const previous = button('Previous', 'page', id), next = button('Next', 'page', id);
      previous.dataset.direction = '-1'; next.dataset.direction = '1'; pager.append(count, previous, next);
      const scroller = element('div', undefined, 'learning-table-scroll'), grid = element('table'), head = element('thead'), tbody = element('tbody');
      grid.append(head, tbody); scroller.append(grid); box.append(summary, empty, pager, scroller); recordList.append(box);
      return { box, summary, empty, pager, count, previous, next, scroller, head, tbody, page: 0, signature: '' };
    }
    function updateTable(table, item) {
      const count = table.rows.length;
      item.summary.textContent = `${table.label} · ${table.name} · ${count} records`;
      item.empty.hidden = count > 0; item.pager.hidden = !count; item.scroller.hidden = !count;
      item.page = Math.max(0, Math.min(item.page, Math.ceil(count / ROWS_PER_PAGE) - 1));
      const start = item.page * ROWS_PER_PAGE, rows = table.rows.slice(start, start + ROWS_PER_PAGE);
      item.count.textContent = count ? `Records ${start + 1}–${Math.min(start + ROWS_PER_PAGE, count)} of ${count}` : 'No records';
      item.previous.disabled = item.page === 0; item.next.disabled = start + ROWS_PER_PAGE >= count;
      // Inspect at most one page. Other pages can have different fields; no full-record scan per tick.
      const columns = [...new Set(rows.flatMap(row => Object.keys(row)))], key = JSON.stringify([item.page, rows]);
      if (key === item.signature) return;
      item.signature = key;
      const labels = element('tr');
      for (const name of columns) { const cell = element('th', name); cell.scope = 'col'; labels.append(cell); }
      item.head.replaceChildren(labels);
      item.tbody.replaceChildren(...rows.map(row => {
        const tr = element('tr');
        for (const name of columns) tr.append(element('td', row[name] === undefined ? '' : typeof row[name] === 'object' ? JSON.stringify(row[name]) : String(row[name])));
        return tr;
      }));
    }
    function renderRecords(view) {
      const available = tables(model.diagram, view, model.selection), seen = new Set();
      recordNote.textContent = model.selection.nodes.length ? 'Showing selected components. Clear selection to inspect all stores.' : 'These are records from the accepted simulation, not live service data.';
      emptyRecords.hidden = available.length > 0;
      for (const table of available) {
        const id = JSON.stringify([table.nodeId, table.name]); seen.add(id);
        let item = recordItems.get(id);
        if (!item) { item = newTable(id); recordItems.set(id, item); }
        updateTable(table, item);
      }
      for (const [id, item] of recordItems) if (!seen.has(id)) { item.box.remove(); recordItems.delete(id); }
    }
    function renderActivity(view) {
      activityStatus.textContent = `Simulated ${view.t.toFixed(2)} s · ${view.global.completed} completed · ${view.global.failed} failed · ${view.global.inFlight} unfinished`;
      const seen = new Set();
      for (const node of model.diagram.nodes) {
        const state = view.nodes[node.id]; if (!state) continue; seen.add(node.id);
        let item = activityItems.get(node.id);
        if (!item) {
          const row = element('li'), select = button(node.label, 'node', node.id), status = element('span');
          row.append(select, status); activityList.append(row); item = { row, select, status }; activityItems.set(node.id, item);
        }
        item.select.textContent = node.label;
        item.status.textContent = ` ${state.health} · ${state.queue} queued · ${state.busy} active`;
      }
      for (const [id, item] of activityItems) if (!seen.has(id)) { item.row.remove(); activityItems.delete(id); }
    }
    function render(view) {
      if (disposed) return;
      lastView = view;
      const journey = currentJourney(), pending = isPending() || !view;
      question.textContent = journey?.question || 'Explore your architecture';
      boundary.textContent = journey?.boundary || config.claimBoundary;
      for (const b of choices.children) b.setAttribute('aria-pressed', String(b.dataset.exampleId === model.diagram.id));
      for (const [id, b] of tabButtons) b.setAttribute('aria-pressed', String(id === activeTab));
      flow.hidden = activeTab !== 'flow'; pendingNote.hidden = activeTab === 'flow' || !pending;
      records.hidden = activeTab !== 'records' || pending; activity.hidden = activeTab !== 'activity' || pending;
      renderFlow(journey);
      if (activeTab === 'records' && !pending) renderRecords(view);
      if (activeTab === 'activity' && !pending) renderActivity(view);
    }
    const unsubscribe = model.subscribe(() => render(getView()));
    render(getView());
    fetch(source, { signal: abort.signal }).then(response => { if (!response.ok) throw Error(`Learning journeys unavailable: ${response.status}`); return response.json(); }).then(value => {
      if (disposed) return;
      data = validate(value);
      for (const row of data.journeys) { const b = button(row.title, 'example', row.id); b.dataset.exampleId = row.id; choices.append(b); }
      render(lastView || getView());
    }).catch(error => {
      if (!disposed) {
        data = { journeys: [] }; notice.textContent = `Walkthrough unavailable: ${error.message}`; notice.hidden = false;
        render(lastView || getView()); onMessage(error.message, true);
      }
    });
    return { render, destroy() { disposed = true; abort.abort(); unsubscribe(); recordItems.clear(); activityItems.clear(); lastView = null; host.replaceChildren(); } };
  }
  return Object.freeze({ SCHEMA, validate, tables, create });
});
