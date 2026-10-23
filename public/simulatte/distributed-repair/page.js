(async function () {
  'use strict';
  const ui = globalThis.SimulatteWorldUI, architecture = globalThis.SimulatteRepairArchitecture;
  const model = globalThis.SimulatteDistributedRepair, runners = globalThis.SimulatteDistributedRepairRunner;
  const $ = id => document.getElementById(id), clone = value => structuredClone(value);
  const routeState = globalThis.SimulatteRouter.parsePath('/system-diagram', location.search);
  const profileResponse = await fetch('/data/distributed-repair/legacy-profile.json');
  if (!profileResponse.ok) throw Error('Legacy experiment profile unavailable');
  const profile = await profileResponse.json();
  if (profile.model !== model.MODEL || !['baseline','bounded'].includes(profile.defaultPolicy) || !Number.isInteger(profile.defaultSeed)) throw Error('Invalid legacy experiment profile');
  const initialSeed = routeState.simulation?.seed === null || routeState.simulation?.seed === undefined ? profile.defaultSeed : Number(routeState.simulation.seed);
  if (!Number.isInteger(initialSeed) || initialSeed < 0 || initialSeed > 4294967295) throw Error('Invalid simulation seed');
  document.body.dataset.simulationProfile = profile.id; document.title = `${profile.name} · Simulatte World`;
  const response = await fetch(profile.configPath);
  if (!response.ok) throw Error('Model configuration unavailable');
  let config = model.validateConfig(await response.json());
  let accepted = architecture.initial(), draft = clone(accepted), dirty = false, policy = profile.defaultPolicy, seed = initialSeed;
  let runner = await runners.create(policy, seed, accepted, config, profile.id), running = true, busy = false, selectedRequest = 'request-1', saved = null;
  let comparison = null, interventions = [], replayArtifact = null;
  const requestButtons = new Map();
  const inspector = ui.SimInspector({ host: $('inspector'), placement: 'inline', onSelect: id => { selectedRequest = id; render(); }, onAction: () => {}, prominentFields: ['status', 'blocker', 'attempts', 'effects'] });
  function button(host, label, action, variant = 'secondary') { const b = ui.SimButton({ label, variant, onAction: () => exclusive(action), onError: error => message(error.message, true) }); $(host).append(b.element); return b; }
  async function exclusive(action) { if (busy) throw Error('Wait for the current operation'); busy = true; try { await action(); } finally { busy = false; document.body.dataset.operationSequence = String(Number(document.body.dataset.operationSequence || 0) + 1); render(); } }
  function message(text, error = false) { $('editor-status').textContent = text; $('editor-status').dataset.error = String(error); }
  function edit(action) { action(); dirty = true; comparison = null; message('Pending changes. Running revision is unchanged until Accept & restart.'); editor(); render(); }
  async function reset(nextPolicy = policy) {
    running = false; await runner.dispose(); policy = nextPolicy; runner = await runners.create(policy, seed, accepted, config, profile.id);
    saved = null; interventions = []; comparison = null; selectedRequest = 'request-1'; message(`Accepted revision restarted with seed ${seed}.`);
  }
  const play = button('playback', 'Pause', () => { running = !running; });
  button('playback', 'Step 1 s', async () => { running = false; await runner.runUntil(Math.min(40, runner.snapshot().time + 1)); });
  button('playback', 'Finish run', async () => { running = false; await runner.runUntil(40); });
  button('playback', 'Replay', async () => { const previous = [...interventions]; await reset(); for (const time of previous) { await runner.runUntil(time); await runner.repair(); interventions.push(time); } running = true; });
  button('playback', 'Compare policies', async () => {
    running = false;
    const rows = [];
    for (const name of ['baseline', 'bounded']) { const other = await runners.create(name, seed, accepted, config, profile.id); for (const time of interventions) { await other.runUntil(time); await other.repair(); } await other.runUntil(40); rows.push({ policy: name, ...other.snapshot().metrics }); await other.dispose(); }
    comparison = rows; message('Same architecture, seed, arrivals, scheduled faults and user repair times; 0–40 seconds. Rejected requests remain in the denominator.');
  }, 'primary');
  const togglePolicy = button('playback', 'Use bounded policy', async () => { await reset(policy === 'baseline' ? 'bounded' : 'baseline'); });
  button('playback', 'Repair store now', async () => { running = false; const time = runner.snapshot().time; await runner.repair(); interventions.push(time); });
  button('playback', 'Save checkpoint', async () => { running = false; saved = await runner.checkpoint(); message(`Checkpoint saved at ${saved.time.toFixed(2)} s, including pending events, leases, resource ownership, RNG and retry state.`); });
  button('playback', 'Restore checkpoint', async () => { running = false; if (!saved) throw Error('Save a checkpoint first'); await runner.restore(saved); interventions = interventions.filter(t => t <= saved.time); message('Checkpoint restored.'); });
  button('playback', 'Verify replay', async () => { running = false; const proof = await runner.verify(); if (proof.status !== 'match') throw Error('Replay diverged'); message(`Exact coordinator replay matched ${proof.rounds} rounds.`); });
  button('add-node', 'Add node', () => edit(() => { architecture.addNode(draft, $('node-type').value); }));
  button('connect', 'Connect', () => edit(() => architecture.connect(draft, $('from').value, $('to').value, Number($('link-capacity').value), Number($('link-latency').value))));
  button('remove', 'Remove selected', () => edit(() => architecture.remove(draft, $('selected').value)), 'danger');
  button('group', 'Create shared cluster', () => edit(() => architecture.group(draft, [...$('group-members').selectedOptions].map(o => o.value), Number($('cluster-capacity').value))));
  button('update', 'Update selected resource / link', () => edit(() => {
    const item = [...draft.nodes, ...draft.links, ...draft.clusters].find(n => n.id === $('selected').value);
    if (!item) throw Error('Select an object'); if (['source', 'store'].includes(item.type)) throw Error('Source and store throughput are fixed in this experiment; edit CPU/GPU or link capacity'); item.capacity = Number($('object-capacity').value);
    if (Object.hasOwn(item, 'latency')) item.latency = Number($('link-latency').value);
  }));
  button('author-actions', 'Accept & restart', async () => { architecture.validate(draft); accepted = clone(draft); accepted.revision++; draft = clone(accepted); dirty = false; await reset(); editor(); }, 'primary');
  button('author-actions', 'Discard pending', () => { draft = clone(accepted); dirty = false; editor(); message('Pending changes discarded.'); });
  button('import-export', 'Export replay', async () => {
    $('document').value = JSON.stringify({ schema: 'simulatte.distributedRepairReplay.v1', architecture: accepted, config, worldSpec: runner.program(), seed, policy, interventions, until: runner.snapshot().time }, null, 2);
    message('Exported accepted architecture and replay inputs. Pending edits are excluded.');
  });
  button('import-export', 'Import as pending', () => {
    const value = JSON.parse($('document').value);
    if (Object.keys(value).sort().join(',') !== 'architecture,config,interventions,policy,schema,seed,until,worldSpec' || value.interventions?.length > 128 || value.schema !== 'simulatte.distributedRepairReplay.v1' || !value.config?.policies?.[value.policy] || !Number.isInteger(value.seed) || !Array.isArray(value.interventions) || value.interventions.some((t, i) => !Number.isFinite(t) || t < 0 || t > 40 || (i && t < value.interventions[i - 1])) || !Number.isFinite(value.until) || value.until < 0 || value.until > 40 || value.interventions.some(t => t > value.until)) throw Error('Invalid bounded replay input');
    architecture.validate(value.architecture); model.validateConfig(value.config);
    globalThis.SimulatteWorldSpec.validateWorldSpec(value.worldSpec);
    if (value.worldSpec.params.profileId && value.worldSpec.params.profileId !== profile.id) throw Error('Replay belongs to another simulation profile');
    if (value.worldSpec.contentHash !== runners.program(value.policy, value.seed, value.architecture, value.config, value.worldSpec.params.profileId || null).contentHash) throw Error('WorldSpec does not match replay inputs'); replayArtifact = clone(value); edit(() => { draft = clone(value.architecture); }); message('Valid import pending. Use Accept imported replay to replace the current run explicitly.');
  });
  button('import-export', 'Accept imported replay', async () => {
    if (!replayArtifact) throw Error('Import a valid replay first');
    architecture.validate(draft); accepted = clone(draft); dirty = false; seed = replayArtifact.seed; config = clone(replayArtifact.config); await reset(replayArtifact.policy);
    for (const time of replayArtifact.interventions) { await runner.runUntil(time); await runner.repair(); interventions.push(time); }
    await runner.runUntil(replayArtifact.until); replayArtifact = null; draft = clone(accepted); editor(); message('Imported architecture and replay accepted.');
  });
  function options(id, items) { const el = $(id), previous = el.value; el.replaceChildren(...items.map(item => { const o = document.createElement('option'); o.value = item.id; o.textContent = item.label || item.id; return o; })); if (items.some(i => i.id === previous)) el.value = previous; }
  function editor() {
    options('from', draft.nodes); options('to', draft.nodes); options('selected', [...draft.nodes, ...draft.links, ...draft.clusters]); options('group-members', draft.nodes.filter(n => n.type === 'gpu'));
    $('selected').dispatchEvent(new Event('change'));
  }
  $('selected').addEventListener('change', () => { const item = [...draft.nodes, ...draft.links, ...draft.clusters].find(n => n.id === $('selected').value); if (item) { $('object-capacity').value = item.capacity; if (Object.hasOwn(item, 'latency')) $('link-latency').value = item.latency; } });
  function element(name, attrs, text) { const el = document.createElementNS('http://www.w3.org/2000/svg', name); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); if (text !== undefined) el.textContent = text; return el; }
  function diagram(s) {
    const graph = dirty ? draft : accepted, positions = new Map();
    const depths = new Map(graph.nodes.map(n => [n.id, n.type === 'source' ? 0 : n.type === 'store' ? 3 : n.type === 'cpu' ? 1 : 2]));
    try { for (const route of architecture.paths(graph)) route.nodeIds.forEach((id, index) => depths.set(id, Math.max(depths.get(id), index))); } catch { /* Invalid pending connections keep a readable staged preview. */ }
    const rows = new Map();
    for (const node of graph.nodes) { const depth = depths.get(node.id), row = rows.get(depth) || 0; positions.set(node.id, [35 + depth * 190, 65 + row * 100]); rows.set(depth, row + 1); }
    const height = Math.max(240, 160 + Math.max(...rows.values()) * 100);
    const svg = element('svg', { viewBox: `0 0 ${Math.max(780, 210 + Math.max(...depths.values()) * 190)} ${height}`, role: 'group', 'aria-label': dirty ? 'Pending architecture, not executing' : 'Accepted executing architecture' });
    const defs = element('defs', {}), marker = element('marker', { id: 'task-arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }); marker.append(element('path', { d: 'M0 0 L8 4 L0 8 Z', fill: 'var(--wui-muted)' })); defs.append(marker); svg.append(defs);
    for (const c of graph.clusters) { const members = graph.nodes.filter(n => n.clusterId === c.id).map(n => positions.get(n.id)); if (members.length) { const left = Math.min(...members.map(p => p[0])) - 15, right = Math.max(...members.map(p => p[0])) + 145, top = Math.min(...members.map(p => p[1])) - 30, bottom = Math.max(...members.map(p => p[1])) + 70; svg.append(element('rect', { x: left, y: top, width: right - left, height: bottom - top, rx: 4, class: 'cluster' }), element('text', { x: left + 10, y: top + 15, class: 'diagram-detail' }, `${c.id} · ${c.capacity} work/s`)); } }
    for (const link of graph.links) { const from = positions.get(link.from), to = positions.get(link.to); if (!from || !to) continue; svg.append(element('path', { d: `M${from[0] + 130} ${from[1] + 20} L${to[0]} ${to[1] + 20}`, class: 'diagram-link', 'marker-end': 'url(#task-arrow)' }), element('text', { x: (from[0] + 130 + to[0]) / 2, y: (from[1] + to[1]) / 2 + 9, class: 'diagram-detail', 'text-anchor': 'middle' }, `${link.capacity} MiB/s`), element('text', { x: (from[0] + 130 + to[0]) / 2, y: (from[1] + to[1]) / 2 + 35, class: 'diagram-detail', 'text-anchor': 'middle' }, `${link.latency}s`)); }
    for (const node of graph.nodes) {
      const [x, y] = positions.get(node.id), attempts = s.attempts.filter(a => a.route.nodeIds[a.stage] === node.id && a.phase !== 'acknowledged' && a.phase !== 'expired');
      const count = node.type === 'gpu' ? attempts.filter(a => a.phase === 'gpu').length : node.type === 'cpu' ? attempts.filter(a => a.phase === 'cpu').length : node.type === 'store' ? s.effects.length : s.requests.length;
      const group = element('g', { tabindex: 0, role: 'button', 'aria-label': `Select ${node.id}`, transform: `translate(${x},${y})` });
      const select = () => { $('selected').value = node.id; $('selected').dispatchEvent(new Event('change')); $('selected').focus(); };
      group.addEventListener('click', select); group.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); select(); } });
      group.append(element('rect', { width: 130, height: 56, rx: 4, class: 'diagram-node', 'data-active': !dirty && count > 0 }), element('text', { x: 10, y: 20, class: 'diagram-label' }, node.id), element('text', { x: 10, y: 40, class: 'diagram-detail' }, dirty ? 'pending' : node.type === 'store' ? `${s.store ? 'online' : 'OFFLINE'} · ${count} effects` : `${count} ${node.type === 'source' ? 'arrivals' : 'active'}`)); svg.append(group);
    }
    $('diagram').replaceChildren(svg);
  }
  function render() {
    const view = runner.snapshot(), s = view.state, m = view.metrics;
    play.element.textContent = running ? 'Pause' : 'Play';
    togglePolicy.element.textContent = policy === 'baseline' ? 'Use bounded policy' : 'Use baseline policy';
    $('revision').textContent = `Accepted r${accepted.revision}${dirty ? ' · edits pending' : ''}`;
    $('status').textContent = `${policy === 'baseline' ? 'Baseline · admission 128, 12 attempts, no store backpressure' : 'Bounded · admission 4, 2 active attempts, 3 attempts/request, idempotent commits'} · ${view.time.toFixed(2)} / 40 s · seed ${seed} · ${running ? 'running' : 'paused'}`;
    diagram(s);
    const values = [['Completed / offered', `${m.completed} / ${m.offered}`], ['Rejected · unfinished', `${m.rejected} · ${m.unfinished}`], ['Deadline misses', m.deadlineMisses], ['Retained / peak MiB', `${m.memory} / ${m.peakMemory}`], ['Duplicate GPU work', m.duplicateCompute.toFixed(2)], ['Queued · attempts', `${m.backlog} · ${m.attempts}`]];
    $('metrics').replaceChildren(...values.map(([subject, value]) => ui.SimMetric({ data: { subject, value, unit: '', timeBasis: `0–${view.time.toFixed(2)} s`, freshness: 'fresh', validity: 'synthetic-model', level: 'supporting' } }).element));
    $('comparison').replaceChildren();
    if (comparison) { const table = document.createElement('table'); const head = document.createElement('tr'); ['40 s paired result', 'Baseline', 'Bounded'].forEach(text => { const th = document.createElement('th'); th.textContent = text; head.append(th); }); table.append(head); for (const [key, label] of [['completed', 'Completed'], ['rejected', 'Rejected'], ['unfinished', 'Unfinished'], ['deadLetter', 'Dead-letter'], ['deadlineMisses', 'Deadline misses'], ['peakMemory', 'Peak MiB'], ['duplicateCompute', 'Duplicate GPU work'], ['effects', 'Committed effects']]) { const row = document.createElement('tr'); [label, ...comparison.map(c => Number(c[key].toFixed(2)))].forEach(value => { const td = document.createElement('td'); td.textContent = value; row.append(td); }); table.append(row); } $('comparison').append(table); }
    for (const r of s.requests) { let b = requestButtons.get(r.id); if (!b) { b = ui.SimButton({ label: r.id, variant: 'quiet', onAction: () => { selectedRequest = r.id; render(); } }); requestButtons.set(r.id, b); $('requests').append(b.element); } b.element.textContent = `${r.id} · ${r.status}`; b.setState({ selected: r.id === selectedRequest }); }
    for (const [id, b] of requestButtons) if (!s.requests.some(r => r.id === id)) { b.element.remove(); requestButtons.delete(id); }
    const info = runner.inspect(selectedRequest);
    inspector.render({ selectedId: info ? selectedRequest : null, prompt: 'Inspect a request', objects: s.requests.map(r => ({ id: r.id, label: r.id, condition: r.status })), label: selectedRequest, description: info ? `Causal records link attempts to arrivals, failures, lease expiry and committed effects. Deadline ${info.request.deadline.toFixed(2)} s.` : '', fields: info ? [{ id: 'status', label: 'Status', value: info.request.status }, { id: 'blocker', label: 'Blocked by', value: info.blocker ? `${info.blocker.kind} · ${info.blocker.eventId || info.blocker.attemptId || (info.blocker.attemptIds || []).join(', ')}` : 'None' }, { id: 'attempts', label: 'Delivery attempts', value: info.attempts.length }, { id: 'effects', label: 'Committed effects', value: info.effects.length }, { id: 'route', label: 'Latest executed route', value: info.attempts.at(-1)?.route.nodeIds.join(' → ') || 'Not admitted' }] : [], actions: [] });
    $('history').replaceChildren(...(info?.history || []).map(e => { const li = document.createElement('li'); li.textContent = `${e.time.toFixed(3)} s · ${e.kind} · ${e.attemptId || e.requestId || 'result store'}${e.causes.length ? ` ← ${e.causes.join(', ')}` : ''}${e.detail ? ` · ${e.detail}` : ''}`; return li; }));
  }
  ui.adoptTree(document.body);
  editor(); await runner.runUntil(0); render();
  setInterval(async () => { if (!running || busy) return; try { await exclusive(async () => { const time = Math.min(40, runner.snapshot().time + 0.5); await runner.runUntil(time); if (time === 40) running = false; }); } catch (error) { running = false; message(error.message, true); } }, 350);
})().catch(error => { const status = document.getElementById('status'); status.textContent = `Unable to prepare experiment: ${error.message}`; status.setAttribute('role', 'alert'); });
