(function attachDataWorkbench(root) {
  if (typeof module === 'object' && module.exports) return;
  const { SimulatteInputSource: input, SimulatteDataWorldSpec: dataSpec, SimulatteWorldSpec: world,
    SimulatteDataRun: runs, SimulattePointSceneView: scenes, SimulatteProgramEditor: editorUi, SimulatteDataTable: tables } = root;
  if (!input || !dataSpec || !world || !runs || !scenes || !editorUi || !tables) throw new Error('data_workbench_dependency_missing');
  const host = document.getElementById('data-workbench');
  if (!host) throw new Error('data_workbench_mount_missing');
  const el = (id) => document.getElementById(`data-${id}`);
  const listeners = new AbortController();
  let acquisition = null, generation = 0, source = null, spec = null, result = null, previous = null, comparison = null;
  let view = null, sceneBounds = null, selectedId = null;
  const draft = editorUi.createDraft({ editor: el('editor'), apply: el('apply'), status: el('edit-status') });
  const engine = runs.create({ onProgress(value) { status(`${value.stageId}: ${value.status}`, value.status); } });
  function on(id, event, handler) { el(id).addEventListener(event, handler, { signal: listeners.signal }); }
  function status(message, state = 'ready') {
    editorUi.setStatus(el('status'), message, state);
    host.dataset.state = state;
  }
  function report(error) { status(`${error.code || error.name}: ${error.message}`, 'error'); }
  function invalidate({ keepPrevious = true } = {}) {
    generation += 1;
    acquisition?.abort(); acquisition = null;
    engine.cancel();
    if (keepPrevious && result) previous = result;
    if (!keepPrevious) { previous = null; selectedId = null; }
    result = null; comparison = null;
    el('replay').disabled = true; el('export-result').disabled = true; el('step').disabled = true;
    el('result').hidden = true;
    host.dataset.replay = 'not-run';
    el('run').disabled = true;
    el('cancel').disabled = true;
  }
  function syncProgram(next) {
    spec = next;
    draft.setValue(world.serializeWorldSpec(spec));
    editorUi.setStatus(el('edit-status'), `Applied revision ${spec.authorship.revision}`, 'ready');
    el('program').hidden = false;
    el('run').disabled = false;
    el('export').disabled = false;
    status(`Prepared ${spec.objects.length} points. Review the program, then Run.`);
  }
  function renderTable(target, columns, rows) {
    return tables.render(target, { columns, rows, limit: 20 });
  }
  async function acquire(read) {
    invalidate({ keepPrevious: false });
    source = null; spec = null;
    el('prepare-panel').hidden = true; el('program').hidden = true; el('export').disabled = true;
    acquisition = new AbortController();
    const current = generation;
    el('cancel').disabled = false;
    status('Reading and validating input', 'running');
    try {
      const decoded = await read(acquisition.signal);
      if (current !== generation) return;
      source = decoded;
      el('source').textContent = `${decoded.source.name} · ${decoded.source.byteLength} bytes · SHA-256 ${decoded.source.sha256}`;
      if (decoded.kind === 'worldSpec') syncProgram(dataSpec.validate(decoded.spec));
      else {
        if (decoded.kind !== 'table') throw new Error('Legacy scene programs require the Prompt import and migration workflow');
        for (const field of dataSpec.FIELDS) {
          const select = el(`map-${field}`);
          select.replaceChildren();
          const none = document.createElement('option'); none.value = ''; none.textContent = field === 'id' ? 'Row number' : field === 'label' ? 'Use ID' : ['vx', 'vy'].includes(field) ? 'Constant 0' : 'Choose column';
          select.append(none);
          decoded.columns.forEach((column) => { const option = document.createElement('option'); option.value = column; option.textContent = column; select.append(option); });
          select.value = decoded.columns.includes(field) ? field : '';
        }
        renderTable(el('preview'), decoded.columns, decoded.rows);
        el('prepare-panel').hidden = false;
        status(`${decoded.rows.length} rows loaded. Preview shows up to 20. Confirm the column mapping before preparing.`);
      }
    } catch (error) { if (current === generation) report(error); }
    finally { if (current === generation) { acquisition = null; el('cancel').disabled = true; } }
  }
  function prepare() {
    invalidate();
    try {
      if (!el('duration').value.trim() || !el('steps').value.trim()) throw new Error('Declare duration and step count');
      const mapping = Object.fromEntries(dataSpec.FIELDS.map((field) => [field, el(`map-${field}`).value || null]));
      syncProgram(dataSpec.compile(source, { mapping, duration: Number(el('duration').value), steps: Number(el('steps').value), units: el('units').value }));
    } catch (error) { report(error); }
  }
  function displayStep(step) {
    if (!result) return;
    const scene = result.frames[step];
    view.render(scene, sceneBounds);
    el('time').textContent = `Step ${step}/${result.frames.length - 1} · t = ${scene.time.toFixed(3)} s · ${scene.units}`;
    renderTable(el('output'), ['id', 'label', 'x', 'y'], scene.points);
    updateSelection(scene);
  }
  function updateSelection(scene) {
    const point = scene.points.find((row) => row.id === selectedId);
    if (!point) selectedId = null;
    el('selection').textContent = point ? `${point.id}: x=${point.x}, y=${point.y}` : 'Select a point to inspect its coordinates.';
  }
  async function execute(replay = false) {
    const before = result || previous;
    invalidate();
    const current = generation;
    el('cancel').disabled = false;
    try {
      const output = await engine.run(spec);
      if (current !== generation) return;
      result = output;
      comparison = before ? runs.compare(before, output) : null;
      sceneBounds = scenes.bounds(output.frames);
      el('result').hidden = false;
      view ||= scenes.create(el('canvas'), { onSelect(point) { selectedId = point.id; updateSelection(result.frames[Number(el('step').value)]); } });
      el('step').max = String(output.frames.length - 1); el('step').value = el('step').max; el('step').disabled = false;
      displayStep(output.frames.length - 1);
      const replayPassed = replay && comparison?.sameProgram && comparison?.sameOutput;
      host.dataset.replay = replay ? replayPassed ? 'pass' : 'fail' : 'not-run';
      el('evidence').textContent = JSON.stringify({ receipt: output.receipt, comparison, replay: host.dataset.replay }, null, 2);
      el('comparison').textContent = comparison ? `${comparison.changed} changed, ${comparison.added} added, ${comparison.removed} removed final points. ${comparison.sameOutput ? 'Identical trajectory.' : 'Trajectory changed.'}` : 'First run. Edit the program to compare results.';
      el('replay').disabled = false; el('export-result').disabled = false;
      status(replay ? replayPassed ? 'Replay passed: exact program and complete trajectory match.' : 'Replay failed: program or trajectory differs.' : 'Run complete. Inspect, edit, replay, or export.', replay && !replayPassed ? 'error' : 'ready');
    } catch (error) { if (current === generation) report(error); }
    finally { if (current === generation) { el('cancel').disabled = true; el('run').disabled = draft.isDirty() || !spec; } }
  }
  async function download(value, name) {
    try { await editorUi.downloadJson(document, name, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); }
    catch (error) { report(error); }
  }
  on('read', 'click', () => void acquire((signal) => input.decode(el('input').value, { signal })));
  on('file', 'change', () => { const file = el('file').files[0]; if (file) void acquire((signal) => input.readFile(file, { signal })); el('file').value = ''; });
  on('fetch', 'click', () => void acquire((signal) => input.readUrl(el('url').value, { signal })));
  on('sample', 'click', () => {
    el('input').value = 'id,label,x,y,vx,vy\na,Alpha,0,0,1,0.4\nb,Beta,8,2,-0.5,0.2\nc,Gamma,3,8,0,-0.6';
    void acquire((signal) => input.decode(el('input').value, { name: 'Point motion example.csv', signal }));
  });
  on('prepare', 'click', prepare);
  [...dataSpec.FIELDS.map((field) => `map-${field}`), 'duration', 'steps', 'units'].forEach((id) => on(id, 'change', () => { invalidate(); status('Preparation changed. Prepare again before running.', 'dirty'); }));
  on('editor', 'input', () => { invalidate(); el('export').disabled = true; draft.markDirty('Unapplied program edit'); });
  on('apply', 'click', () => {
    invalidate();
    try { syncProgram(dataSpec.validate(world.prepareUserEdit(spec, el('editor').value, { rationale: 'User edited the data workbench program' }))); }
    catch (error) { report(error); }
  });
  on('reset', 'click', () => { if (spec) { invalidate(); syncProgram(spec); } });
  on('run', 'click', () => void execute());
  on('replay', 'click', () => void execute(true));
  on('cancel', 'click', () => { invalidate(); el('run').disabled = !spec || draft.isDirty(); status('Cancelled', 'cancelled'); });
  on('step', 'input', () => displayStep(Number(el('step').value)));
  on('export', 'click', () => { if (spec) void download(world.serializeWorldSpec(spec), `${editorUi.safeFilePart(spec.name)}.world.json`); });
  on('export-result', 'click', () => { if (result) void download({ ...result, comparison }, 'simulation-result.json'); });
  function dispose() { invalidate(); engine.dispose(); view?.dispose(); listeners.abort(); }
  root.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); });
  root.SimulatteDataWorkbench = Object.freeze({ getSpec: () => spec, getResult: () => result, getComparison: () => comparison, dispose });
})(typeof globalThis !== 'undefined' ? globalThis : window);
