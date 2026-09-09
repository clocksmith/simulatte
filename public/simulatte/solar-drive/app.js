(function solarDriveApp(root) {
  'use strict';
  const program = root.SimulatteSolarDriveProgram, model = root.SimulatteSolarDriveModel, world = root.SimulatteWorldSpec;
  if (!program || !model || !world || !root.SimulatteSolarScene || !root.SimulatteSolarRenderer) throw new Error('solar_instance_dependency_missing');
  const el = (id) => document.getElementById(id);
  const nf = (v, digits = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const signed = (v, digits = 0) => `${v > 0 ? '+' : ''}${nf(v, digits)}`;
  const canvas = el('scene'), events = new AbortController();
  const on = (node, event, fn, options = {}) => node.addEventListener(event, fn, { ...options, signal: events.signal });
  let spec = program.validate(program.create('bicycle')), state = model.initial(spec.params);
  let scene = root.SimulatteSolarScene.create(spec.params), drawing = null, currentFrame = null;
  let running = false, disposed = false, raf = 0, generation = 0, accumulator = 0, lastTime = 0, lastUi = 0, lastSample = -1;
  let history = [], selected = 'solar', timer = 0, cameraGoal = null;
  const view = { explode: 0.88, targetExplode: 0.88, cutaway: true, fields: false, flows: true, labels: true };
  const camera = { yaw: 0.40, pitch: 0.32, distance: 5.7, target: [0, 1.14, 0] };
  const labels = new Map(), partRows = new Map();
  function notify(message) {
    el('status-message').textContent = message; clearTimeout(timer);
    timer = setTimeout(() => { el('status-message').textContent = ''; }, 7000);
  }
  function failure(error) {
    running = false; el('gpu-status').dataset.state = 'error'; el('gpu-status').textContent = 'WebGPU unavailable';
    el('gpu-message').hidden = false; el('gpu-message').replaceChildren();
    const title = document.createElement('strong'), detail = document.createElement('span');
    title.textContent = 'The 3D view could not start'; detail.textContent = error.message || String(error);
    el('gpu-message').append(title, detail); el('run').disabled = true; document.body.dataset.runtimeError = detail.textContent;
  }
  function resetCamera() {
    cameraGoal = { yaw: 0.40, pitch: 0.32, distance: canvas.clientWidth < 600 ? 9.5 : spec.params.vehicle === 'car' ? 7.3 : 5.7, target: [0, 1.14, 0] };
  }
  function select(id, focus = false) {
    if (!program.COMPONENTS.some((row) => row.id === id)) return;
    selected = id;
    for (const [key, row] of partRows) row.setAttribute('aria-pressed', String(key === id));
    for (const [key, label] of labels) label.setAttribute('aria-pressed', String(key === id));
    if (focus && currentFrame) cameraGoal = { ...camera, focus: id, target: [...currentFrame.anchors[id]],
      distance: id === 'chassis' ? 5.7 : id === 'solar' ? 4.9 : spec.params.vehicle === 'car' && id === 'battery' ? 3.2 : 2.35 };
    updateDetail();
  }
  function buildComponents() {
    const icons = ['#', '=', '+', 'O', '@', '/'];
    program.COMPONENTS.forEach((part, index) => {
      const button = document.createElement('button'); button.className = 'component-row'; button.dataset.component = part.id;
      button.setAttribute('aria-pressed', String(selected === part.id));
      const number = document.createElement('span'), icon = document.createElement('span'), text = document.createElement('span'), arrow = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0'); icon.className = 'component-icon'; icon.textContent = icons[index]; icon.setAttribute('aria-hidden', 'true');
      text.textContent = part.label; arrow.textContent = '+'; button.append(number, icon, text, arrow);
      on(button, 'click', () => select(part.id, true)); el('component-list').append(button); partRows.set(part.id, button);
      const label = document.createElement('button'), labelNumber = document.createElement('strong');
      label.className = 'component-label'; label.dataset.component = part.id; label.setAttribute('aria-pressed', String(selected === part.id));
      labelNumber.textContent = number.textContent; label.append(labelNumber, document.createTextNode(part.label));
      on(label, 'click', () => select(part.id, true)); el('component-labels').append(label); labels.set(part.id, label);
    });
    program.SOURCES.forEach((source) => {
      const row = document.createElement('li'), link = document.createElement('a');
      link.href = source.url; link.textContent = source.label; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link); el('sources').append(row);
    });
  }
  function formatParam(key, value) {
    if (['shade', 'batterySoc'].includes(key)) return `${nf(value * 100)}%`;
    if (key === 'irradiance') return `${nf(value)} W/m2`;
    if (key === 'targetKph') return `${nf(value)} km/h`;
    if (key === 'grade') return `${signed(value, 1)}%`;
    if (key === 'wind') return `${nf(value, 1)} m/s`;
    if (key === 'panelArea') return `${nf(value, 1)} m2`;
    if (key === 'flywheelTip') return `${nf(value)} m/s`;
    return String(value);
  }
  function syncControls() {
    document.querySelectorAll('[data-param]').forEach((control) => {
      const key = control.dataset.param;
      if (control.type === 'checkbox') control.checked = spec.params[key]; else control.value = spec.params[key];
      if (el(`${key}-value`)) el(`${key}-value`).textContent = formatParam(key, spec.params[key]);
    });
    document.querySelectorAll('[data-vehicle]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.vehicle === spec.params.vehicle)));
    el('program-identity').textContent = `${spec.contentHash} / revision ${spec.authorship.revision}\n${program.MODEL_VERSION}`;
  }
  function apply(next, message = '') {
    program.validate(next);
    const wasRunning = running;
    generation += 1; running = false; spec = next; state = model.initial(spec.params);
    scene = root.SimulatteSolarScene.create(spec.params); accumulator = 0; history = []; lastSample = -1;
    el('comparison-result').textContent = ''; syncControls(); updateUi();
    if (wasRunning && drawing) running = true;
    if (message) notify(message);
    return structuredClone(spec);
  }
  function setParameters(changes) { return apply(program.edit(spec, changes), 'Parameters applied. Restarted from declared initial reserves.'); }
  function setVehicle(vehicle) { apply(program.create(vehicle)); resetCamera(); notify(`${vehicle[0].toUpperCase() + vehicle.slice(1)} preset loaded.`); }
  function setView(changes) {
    if (Object.hasOwn(changes, 'explode')) view.targetExplode = Math.max(0, Math.min(1, changes.explode));
    for (const key of ['cutaway', 'fields', 'flows', 'labels']) if (Object.hasOwn(changes, key)) view[key] = Boolean(changes[key]);
    el('assembled').setAttribute('aria-pressed', String(view.targetExplode === 0)); el('exploded').setAttribute('aria-pressed', String(view.targetExplode > 0));
    for (const key of ['cutaway', 'fields', 'flows', 'labels']) el(key).setAttribute('aria-pressed', String(view[key]));
  }
  function updateDetail() {
    const p = spec.params, t = model.telemetry(p, state);
    const index = program.COMPONENTS.findIndex((row) => row.id === selected), part = program.COMPONENTS[index];
    el('part-number').textContent = `${String(index + 1).padStart(2, '0')} / ${part.role.toUpperCase()}`;
    el('part-title').textContent = part.label; el('part-badge').textContent = selected.toUpperCase();
    const details = {
      solar: ['Direct sunlight becomes DC electricity. Shade, incidence, and cell heating reduce available output.', [
        ['Collector area', `${nf(p.panelArea, 2)} m2`], ['Plane irradiance', `${nf(t.poa)} W/m2`], ['Cell temperature', `${nf(t.panelC, 1)} C`], ['Available bus power', `${nf(t.busW, 1)} W`]]],
      controller: ['The DC bus sends solar power straight to traction. Surplus charges storage; braking can feed auxiliaries and reserves.', [
        ['MPPT efficiency', `${nf(p.mpptEfficiency * 100, 1)}%`], ['Traction rating', `${nf(p.motorRatedW)} W`], ['Auxiliary load', `${nf(t.auxiliaryW, 1)} W`], ['Curtailed solar', `${nf(t.curtailedW, 1)} W`]]],
      battery: ['A reserve for shade and sustained demand. Charge and discharge are constrained by power, capacity, and efficiency.', [
        ['Nameplate capacity', `${nf(p.batteryWh)} Wh`], ['Stored energy', `${nf(state.batteryJ / 3600, 1)} Wh`], ['Bus power (+ out)', `${signed(t.batteryW)} W`], ['Estimated pack mass', `${nf(p.batteryWh / p.batteryWhKg, 1)} kg`]]],
      flywheel: [p.flywheel ? 'Two opposing rim rotors buffer transients. Magnetic bearings still need power; windage and conversion dissipate energy.' : 'The module is removed from the model: its energy, mass, and parasitic loads are zero.', [
        ['Rotor / housing mass', p.flywheel ? `${nf(p.flywheelMass, 1)} / ${nf(p.housingKg, 1)} kg` : 'Not fitted'], ['Total / accessible', `${nf(state.flywheelJ / 3600, 2)} / ${nf(t.flywheelUsableWh, 2)} Wh`],
        ['Current / max tip speed', `${nf(t.flywheelFraction * p.flywheelTip)} / ${nf(p.flywheelTip)} m/s`], ['Opposing rotor speed', `${nf(t.rpm)} rpm`]]],
      motor: ['Copper stator windings act on permanent rotor magnets. The same machine recovers braking energy when storage can accept it.', [
        ['Mechanical output', `${nf(t.driveW, 1)} W`], ['Recovered to bus', `${nf(t.regenW, 1)} W`], ['Motor temperature', `${nf(state.motorC, 1)} C`], ['Conversion heat', `${nf(t.motorLossW, 1)} W`]]],
      chassis: ['Motion accounts for payload, collector drag, tire losses, rotating wheels, and changing gravitational potential.', [
        ['Complete moving mass', `${nf(t.massKg, 1)} kg`], ['Effective drag area', `${nf(t.cdA, 3)} m2`], ['Current road grade', `${signed(t.grade, 2)}%`], ['Elevation change', `${signed(state.elevationM, 1)} m`]]],
    };
    el('part-description').textContent = details[selected][0]; el('part-values').replaceChildren();
    for (const [label, value] of details[selected][1]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; el('part-values').append(dt, dd);
    }
  }
  function metric(id, value, unit) {
    const small = document.createElement('small'); small.textContent = unit; el(id).replaceChildren(document.createTextNode(`${value} `), small);
  }
  function updateUi() {
    const p = spec.params, t = model.telemetry(p, state);
    metric('metric-solar', nf(t.pvW), 'W'); metric('metric-drive', nf(t.driveW), 'W'); metric('metric-rpm', nf(t.rpm), 'rpm'); metric('metric-battery', nf(t.batterySoc * 100, 1), '%');
    el('solar-detail').textContent = `${nf(t.poa)} W/m2 on the collector`; el('speed-detail').textContent = `${nf(t.speedKph, 1)} km/h actual / ${nf(p.targetKph)} target`;
    el('flywheel-detail').textContent = `${nf(t.flywheelUsableWh, 2)} Wh above minimum speed`; el('battery-detail').textContent = `${nf(state.batteryJ / 3600, 1)} / ${nf(p.batteryWh)} Wh remaining`;
    el('clock').textContent = `${String(Math.floor(state.timeS / 60)).padStart(2, '0')}:${String(Math.floor(state.timeS % 60)).padStart(2, '0')}`;
    el('run-state').textContent = state.status === 'complete' ? 'CYCLE COMPLETE' : running ? state.status.toUpperCase().replaceAll('-', ' ') : state.step ? 'PAUSED' : 'READY';
    el('run').querySelector('span').textContent = running ? 'Pause simulation' : state.status === 'complete' ? 'Run again' : state.step ? 'Resume simulation' : 'Run simulation';
    el('energy-error').textContent = `${nf(state.residualJ / 3600, 6)} Wh`; el('distance').textContent = `${nf(state.distanceM / 1000, 3)} km`; el('recovered').textContent = `${nf(state.ledger.regenJ / 3600, 2)} Wh`;
    el('reserve-change').textContent = signed(t.reserveW);
    const positive = t.reserveW >= 0;
    el('reserve-state').textContent = !state.step ? 'READY' : positive ? 'REPLENISHING' : 'DRAWING RESERVES'; el('reserve-state').dataset.positive = String(positive);
    const netWh = (state.batteryJ + state.flywheelJ - state.initialJ) / 3600;
    el('reserve-copy').textContent = !state.step ? 'Run the model to see whether sunlight covers motion and system losses.'
      : `${positive ? 'Reserves are increasing at this operating point.' : 'Motion and losses currently exceed available solar power.'} Net reserve change: ${signed(netWh, 2)} Wh. Repeated cycles and adverse weather still determine autonomy.`;
    updateDetail(); updateChart();
  }
  function sample() {
    const bucket = Math.floor(state.timeS); if (bucket === lastSample) return; lastSample = bucket;
    history.push({ time: state.timeS, solar: state.flows.pvW, drive: state.flows.driveW, reserve: state.flows.reserveW });
    if (history.length > 360) history.shift();
  }
  function updateChart() {
    if (history.length < 2) {
      for (const key of ['solar', 'drive', 'reserve']) el(`chart-${key}`).setAttribute('d', '');
      el('chart-end').textContent = 'Waiting for Run'; return;
    }
    const max = Math.max(200, ...history.flatMap((r) => [r.solar, r.drive, Math.abs(r.reserve)]));
    for (const key of ['solar', 'drive', 'reserve']) el(`chart-${key}`).setAttribute('d', history.map((r, i) =>
      `${i ? 'L' : 'M'}${(i / (history.length - 1) * 700).toFixed(2)},${(75 - r[key] / max * 64).toFixed(2)}`).join(' '));
    el('chart-max').textContent = `+/- ${nf(max)} W`; el('chart-start').textContent = `${nf(history[0].time)} s`; el('chart-end').textContent = `${nf(history.at(-1).time)} s`;
  }
  function updateLabels() {
    if (!currentFrame || !drawing) return;
    const offsets = { solar: [0, -32], controller: [72, -28], battery: [-50, -28], flywheel: [-16, 60], motor: [60, 36], chassis: [0, 45] }, placed = [];
    for (const [id, label] of labels) {
      const point = drawing.project(currentFrame.anchors[id]);
      label.hidden = !view.labels || !point || point.z < 0 || point.z > 1 || id === 'flywheel' && !spec.params.flywheel || id === 'solar' && !spec.params.panelArea;
      if (label.hidden) continue;
      const half = label.offsetWidth / 2 + 6, x = Math.max(half, Math.min(canvas.clientWidth - half, point.x + offsets[id][0]));
      let y = Math.max(106, Math.min(canvas.clientHeight - 58, point.y + offsets[id][1]));
      for (const prev of placed) if (Math.abs(prev.x - x) < 115 && Math.abs(prev.y - y) < 25) y += 27;
      y = Math.min(canvas.clientHeight - 50, y); placed.push({ x, y }); label.style.left = `${x}px`; label.style.top = `${y}px`;
    }
    const a = drawing.project([0, 0, 0]), b = drawing.project([1, 0, 0]);
    if (a && b) document.querySelector('.scene-scale>span').style.width = `${Math.hypot(b.x - a.x, b.y - a.y)}px`;
  }
  function advance(count) {
    if (!Number.isInteger(count) || count < 0 || count > 100000) throw new Error('solar_manual_step_budget_invalid');
    for (let i = 0; i < count && state.status !== 'complete'; i += 1) { state = model.step(spec.params, state); sample(); }
    if (state.status === 'complete') running = false;
    return state;
  }
  async function replay() {
    running = false; accumulator = 0;
    const epoch = ++generation, original = state, active = spec;
    let candidate = model.initial(active.params); el('replay').disabled = true;
    try {
      for (let i = 0; i < original.step; i += 1) {
        candidate = model.step(active.params, candidate);
        if (i % 800 === 0) { await new Promise((resolve) => setTimeout(resolve, 0)); if (epoch !== generation) return { status: 'cancelled' }; }
      }
      const pass = world.canonicalJson(candidate) === world.canonicalJson(original);
      document.body.dataset.replay = pass ? 'pass' : 'fail'; notify(pass ? `Replay matches every state field across ${original.step} fixed steps.` : 'Replay differs from the recorded state.');
      return { status: pass ? 'pass' : 'fail', stepCount: original.step, worldSpecHash: active.contentHash };
    } finally { el('replay').disabled = false; updateUi(); }
  }
  async function compare() {
    const epoch = generation, active = spec;
    const count = Math.min(Math.ceil(active.params.durationS / active.params.stepS), Math.max(state.step, Math.round(300 / active.params.stepS)));
    const hybridP = { ...active.params, flywheel: true }, batteryP = { ...active.params, flywheel: false };
    let hybrid = model.initial(hybridP), battery = model.initial(batteryP);
    el('compare').disabled = true; el('comparison-result').textContent = 'Running both configurations against identical conditions...';
    try {
      for (let i = 0; i < count; i += 1) {
        hybrid = model.step(hybridP, hybrid); battery = model.step(batteryP, battery);
        if (i % 500 === 0) { await new Promise((resolve) => setTimeout(resolve, 0)); if (epoch !== generation) return { status: 'cancelled' }; }
      }
      const net = (s) => (s.initialJ - s.batteryJ - s.flywheelJ) / 3600;
      const result = { schema: 'simulatte.solarDriveComparison.v1', worldSpecHash: active.contentHash, durationS: hybrid.timeS,
        hybrid: { storeUsedWh: net(hybrid), distanceM: hybrid.distanceM, initialJ: hybrid.initialJ },
        batteryOnly: { storeUsedWh: net(battery), distanceM: battery.distanceM, initialJ: battery.initialJ },
        interpretation: 'Net store use counts each branch initial reserve; compare distance as well as energy. Negative consumption means charging.' };
      el('comparison-result').textContent = `${nf(hybrid.timeS)} s matched cycle. Hybrid: ${nf(net(hybrid), 2)} Wh used / ${nf(hybrid.distanceM / 1000, 2)} km. Battery only: ${nf(net(battery), 2)} Wh / ${nf(battery.distanceM / 1000, 2)} km. Initial rotor energy is counted.`;
      return result;
    } finally { el('compare').disabled = false; }
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportData() { return { worldSpec: structuredClone(spec), run: program.receipt(spec, state, drawing?.receipt() || null), samples: structuredClone(history) }; }
  function importSpec(text) {
    if (typeof text !== 'string' || text.length > 2000000) throw new Error('solar_import_size_invalid');
    const parsed = JSON.parse(text); return apply(program.validate(parsed.worldSpec || parsed), 'Imported WorldSpec; run from its initial state.');
  }
  function loop(now) {
    if (disposed) return;
    const delta = lastTime ? Math.min(0.12, (now - lastTime) / 1000) : 0; lastTime = now;
    if (running) {
      accumulator += delta * Number(el('playback').value);
      const steps = Math.min(128, Math.floor(accumulator / spec.params.stepS)); accumulator -= steps * spec.params.stepS; advance(steps);
    }
    const ease = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1 - Math.exp(-delta * 10);
    view.explode += (view.targetExplode - view.explode) * ease;
    currentFrame = scene.frame(state, view);
    if (cameraGoal) {
      if (cameraGoal.focus) cameraGoal.target = [...currentFrame.anchors[cameraGoal.focus]];
      for (const key of ['yaw', 'pitch', 'distance']) camera[key] += (cameraGoal[key] - camera[key]) * ease;
      camera.target = camera.target.map((v, i) => v + (cameraGoal.target[i] - v) * ease);
    }
    try {
      if (drawing) { drawing.render(currentFrame, camera, program.COMPONENTS.findIndex((p) => p.id === selected) + 1); updateLabels(); }
    } catch (error) { failure(error); return; }
    if (now - lastUi > 180) { updateUi(); lastUi = now; }
    raf = requestAnimationFrame(loop);
  }
  buildComponents(); syncControls(); updateUi(); resetCamera();
  document.querySelectorAll('[data-vehicle]').forEach((button) => on(button, 'click', () => setVehicle(button.dataset.vehicle)));
  document.querySelectorAll('[data-param]').forEach((control) => {
    on(control, 'input', () => { const key = control.dataset.param; if (el(`${key}-value`)) el(`${key}-value`).textContent = formatParam(key, Number(control.value)); });
    on(control, 'change', () => {
      const value = control.type === 'checkbox' ? control.checked : control.tagName === 'SELECT' ? control.value : Number(control.value);
      try { setParameters({ [control.dataset.param]: value }); } catch (error) { notify(error.message); syncControls(); }
    });
  });
  on(el('run'), 'click', () => { if (state.status === 'complete') apply(spec); running = !running; accumulator = 0; updateUi(); });
  on(el('reset'), 'click', () => { running = false; apply(spec); });
  on(el('replay'), 'click', () => void replay().catch((error) => notify(error.message)));
  on(el('compare'), 'click', () => void compare().catch((error) => { el('comparison-result').textContent = error.message; }));
  on(el('export'), 'click', () => download(exportData(), 'solar-drive-run.json'));
  on(el('assembled'), 'click', () => { setView({ explode: 0 }); resetCamera(); });
  on(el('exploded'), 'click', () => { setView({ explode: 0.88 }); resetCamera(); });
  for (const key of ['cutaway', 'fields', 'flows', 'labels']) on(el(key), 'click', () => setView({ [key]: !view[key] }));
  on(el('reset-camera'), 'click', resetCamera);
  on(el('open-program'), 'click', () => { el('program-editor').value = world.serializeWorldSpec(spec); el('editor-status').textContent = ''; el('program-dialog').showModal(); });
  on(el('close-program'), 'click', () => el('program-dialog').close());
  on(el('apply-program'), 'click', () => {
    try { apply(program.validate(world.prepareUserEdit(spec, el('program-editor').value, { rationale: 'User edited solar drive WorldSpec' })), 'WorldSpec edit applied.'); el('program-dialog').close(); }
    catch (error) { el('editor-status').textContent = error.message; }
  });
  on(el('export-program'), 'click', () => download(world.serializeWorldSpec(spec), 'solar-drive.world.json'));
  on(el('import-program'), 'change', async () => {
    const file = el('import-program').files[0]; if (!file) return;
    try { if (file.size > 2000000) throw new Error('Import must be smaller than 2 MB.'); importSpec(await file.text()); el('program-editor').value = world.serializeWorldSpec(spec); el('editor-status').textContent = 'WorldSpec imported and validated.'; }
    catch (error) { el('editor-status').textContent = error.message; }
    el('import-program').value = '';
  });
  const pointers = new Map(); let travel = 0, pinch = 0;
  on(canvas, 'pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId, [event.clientX, event.clientY]); travel = 0; cameraGoal = null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  on(canvas, 'pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const before = pointers.get(event.pointerId), dx = event.clientX - before[0], dy = event.clientY - before[1];
    pointers.set(event.pointerId, [event.clientX, event.clientY]); travel += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch && distance) camera.distance = Math.max(0.65, Math.min(18, camera.distance * pinch / distance)); pinch = distance;
    } else { camera.yaw -= dx * 0.007; camera.pitch = Math.max(-0.04, Math.min(1.42, camera.pitch + dy * 0.005)); }
  });
  on(canvas, 'pointerup', (event) => {
    pointers.delete(event.pointerId); if (travel > 6 || !currentFrame || !drawing) return;
    const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    let picked = null, best = Infinity;
    for (const item of currentFrame.instances) {
      if (item.group === 'ground') continue;
      const point = drawing.project([item.matrix[12], item.matrix[13], item.matrix[14]]); if (!point) continue;
      const distance = Math.hypot(point.x - x, point.y - y), score = distance + point.z * 4;
      if (distance < 22 && score < best) { best = score; picked = item.group; }
    }
    if (picked) select(picked);
  });
  on(canvas, 'pointercancel', (event) => pointers.delete(event.pointerId));
  on(canvas, 'wheel', (event) => { event.preventDefault(); cameraGoal = null; camera.distance = Math.max(0.65, Math.min(18, camera.distance * Math.exp(event.deltaY * 0.001))); }, { passive: false });
  on(canvas, 'keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '=', 'Home'].includes(event.key)) return;
    event.preventDefault(); cameraGoal = null;
    if (event.key === 'Home') resetCamera();
    if (event.key === 'ArrowLeft') camera.yaw -= 0.12;
    if (event.key === 'ArrowRight') camera.yaw += 0.12;
    if (event.key === 'ArrowUp') camera.pitch = Math.min(1.42, camera.pitch + 0.08);
    if (event.key === 'ArrowDown') camera.pitch = Math.max(-0.04, camera.pitch - 0.08);
    if (event.key === '+' || event.key === '=') camera.distance = Math.max(0.65, camera.distance * 0.9);
    if (event.key === '-') camera.distance = Math.min(18, camera.distance * 1.1);
  });
  on(document, 'visibilitychange', () => { if (document.hidden) { running = false; accumulator = 0; updateUi(); } });
  function dispose() { if (disposed) return; disposed = true; generation += 1; running = false; cancelAnimationFrame(raf); clearTimeout(timer); events.abort(); drawing?.dispose(); }
  on(root, 'pagehide', (event) => { if (!event.persisted) dispose(); });
  root.SimulatteSolarDrive = Object.freeze({ getSpec: () => structuredClone(spec), getState: () => structuredClone(state),
    getReceipt: () => program.receipt(spec, state, drawing?.receipt() || null), exportData, importSpec,
    setParameters, setVehicle, setView, select, replay, compare,
    isViewSettled: () => Math.abs(view.explode - view.targetExplode) < 0.002 && (!cameraGoal ||
      ['yaw', 'pitch', 'distance'].every((key) => Math.abs(camera[key] - cameraGoal[key]) < 0.004)
      && camera.target.every((value, i) => Math.abs(value - cameraGoal.target[i]) < 0.004)),
    runSteps(count) { running = false; const result = advance(count); updateUi(); return structuredClone(result); }, dispose });
  root.SimulatteSolarRenderer.create(canvas, failure).then((renderer) => {
    if (disposed) { renderer.dispose(); return; }
    drawing = renderer; el('gpu-message').hidden = true; el('gpu-status').dataset.state = 'ready';
    el('gpu-status').innerHTML = '<i></i>WebGPU / live'; el('run').disabled = false; raf = requestAnimationFrame(loop);
  }).catch(failure);
})(globalThis);
