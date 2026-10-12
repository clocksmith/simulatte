(async function solarDriveApp(root) {
  'use strict';
  const program = root.SimulatteSolarDriveProgram, model = root.SimulatteSolarDriveModel, world = root.SimulatteWorldSpec;
  if (!program || !model || !world || !root.SimulatteSolarScene || !root.SimulatteSolarRenderer) throw new Error('solar_instance_dependency_missing');
  const el = (id) => document.getElementById(id);
  const nf = (v, digits = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const signed = (v, digits = 0) => `${v > 0 ? '+' : ''}${nf(v, digits)}`;
  const canvas = el('scene'), events = new AbortController();
  const on = (node, event, fn, options = {}) => node.addEventListener(event, fn, { ...options, signal: events.signal });
  const routeResponse = await fetch('../../data/solar-drive/union-square-route-v1.json');
  if (!routeResponse.ok) throw Error('Solar route could not load: '+routeResponse.status);
  const routeData = await routeResponse.json(); program.registerRoute(routeData);
  const referenceResponse=await fetch('../../data/solar-drive/published-ride-reference-v1.json');if(!referenceResponse.ok)throw Error('Published ride reference could not load');program.registerReference(await referenceResponse.json());
  const rideScene = root.SimulatteSolarRideScene.create(routeData);
  let spec = program.createRide('bicycle'), state = model.initial(spec.params);
  let initialSpec = structuredClone(spec), liveActions = [], matchedInitialSpec = null, matchedActions = [], comparisonStartS = 0, replayActions = null, matchedReplayActions = null;
  let scene = root.SimulatteSolarScene.create(spec.params), drawing = null, currentFrame = null;
  let running = false, disposed = false, raf = 0, generation = 0, lastTime = 0, lastUi = 0, lastSample = -1;
  let cameraMode = 'overview';
  let history = [], selected = 'solar', timer = 0, cameraGoal = null, matchedParams = null, matchedState = null, matchedSpec = null, interventionLabel = '';
  const flowLabels = new Map();
  const view = { mode:'ride', explode:0, targetExplode:0, cutaway:false, fields:false, flows:true, labels:false, selected:'solar' };
  let inspectView = {explode:0.88,cutaway:true,labels:true};
  const camera = { yaw: 0.40, pitch: 0.32, distance: 5.7, target: [0, 1.14, 0] };
  const labels = new Map(), partRows = new Map();
  let scheduler = root.SimulatteSimulationClock.createFixedStepScheduler({ stepsPerSecond: 1 / spec.params.stepS });
  let replayTarget = null;
  function notify(message) {
    el('status-message').textContent = message; clearTimeout(timer);
    timer = setTimeout(() => { el('status-message').textContent = ''; }, 7000);
  }
  function failure(error) {
    running = false; el('gpu-status').dataset.state = 'error'; el('gpu-status').textContent = drawing?'Ride stopped':'WebGPU unavailable';
    el('gpu-message').hidden = false; el('gpu-message').replaceChildren();
    const title = document.createElement('strong'), detail = document.createElement('span');
    title.textContent = drawing?'The ride stopped after an error':'The 3D view could not start'; detail.textContent = error.message || String(error);
    el('gpu-message').append(title, detail); el('run').disabled = true; document.body.dataset.runtimeError = detail.textContent;
  }
  function renderFrame(candidateView=view) { const machine=scene.frame(state,candidateView);return view.mode==='ride'?rideScene.frame(machine,program.environment(spec,state),spec.params):machine; }
  function geometryPoints(id = null, frame = renderFrame({ ...view, explode: view.targetExplode })) {
    const points = [];
    for (const instance of frame.instances) {
      if (!instance.group || !program.COMPONENTS.some(part=>part.id===instance.group) || (id && instance.group !== id)) continue;
      const radius = instance.mesh === 'box' ? 0.5 : 1;
      const m = instance.matrix;
      for (const x of [-radius, radius]) for (const y of [-radius, radius]) for (const z of [-radius, radius])
        points.push([m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]]);
    }
    return points;
  }
  function fittedCamera(id = null) {
    return root.SimulatteCameraFit.fitPerspective(geometryPoints(id), { width: canvas.clientWidth, height: canvas.clientHeight,
      insets: {}, padding: 24 });
  }
  function resetCamera() { const goal=fittedCamera();cameraMode='overview';cameraGoal=goal; }
  function setCameraView(mode) {
    if(!['overview','top'].includes(mode))throw Error('Unsupported solar camera view');
    const goal=root.SimulatteCameraFit.fitPerspective(geometryPoints(),{width:canvas.clientWidth,height:canvas.clientHeight,padding:24,yaw:0.4,pitch:mode==='top'?Math.PI/2-.001:.32});
    cameraMode=mode;cameraGoal=goal;
  }
  function focusSelection() { const goal={...fittedCamera(selected),focus:selected};cameraMode='overview';cameraGoal=goal; }
  function select(id) {
    if (!program.COMPONENTS.some((row) => row.id === id)) return;
    selected = id; view.selected=id;
    updateActions();
    for (const [key, row] of partRows) row.setAttribute('aria-pressed', String(key === id));
    for (const [key, label] of labels) label.setAttribute('aria-pressed', String(key === id));
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
      on(button, 'click', () => select(part.id)); el('component-list').append(button); partRows.set(part.id, button);
      const label = document.createElement('button'), labelNumber = document.createElement('strong');
      label.className = 'component-label'; label.dataset.component = part.id; label.setAttribute('aria-pressed', String(selected === part.id));
      labelNumber.textContent = number.textContent; label.append(labelNumber, document.createTextNode(part.label));
      on(label, 'click', () => select(part.id)); el('component-labels').append(label); labels.set(part.id, label);
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
    document.querySelectorAll('[data-vehicle]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.vehicle === spec.params.vehicle)));
    el('grade').disabled = spec.params.route === 'identified';
    el('ride').disabled=spec.params.route!=='identified';
    el('program-identity').textContent = `${spec.contentHash} / revision ${spec.authorship.revision}\n${program.MODEL_VERSION}`;
  }
  function apply(next, message = '') {
    program.validate(next);
    const wasRunning = running;
    generation += 1; running = false; spec = next; state = model.initial(spec.params);
    if(spec.params.route!=='identified'&&view.mode==='ride')setMode('inspect');
    scene = root.SimulatteSolarScene.create(spec.params); scheduler = root.SimulatteSimulationClock.createFixedStepScheduler({stepsPerSecond:1/spec.params.stepS}); replayTarget = null; history = []; lastSample = -1;
    matchedParams=null;matchedState=null;matchedSpec=null;interventionLabel='';
    initialSpec=structuredClone(spec);liveActions=[];matchedInitialSpec=null;matchedActions=[];comparisonStartS=0;replayActions=null;matchedReplayActions=null;
    el('comparison-result').textContent = ''; syncControls(); updateActions(); updateUi();
    if (wasRunning && drawing) running = true;
    if (message) notify(message);
    return structuredClone(spec);
  }
  function updateActions() {
    el('focus-selection').disabled=selected==='flywheel'&&!spec.params.flywheel||selected==='solar'&&!spec.params.panelArea;
    const actions=selected==='solar'?(view.mode==='ride'?[]:[{label:spec.params.shade>0?'Remove panel cover':'Shade the panel',values:{shade:spec.params.shade>0?0:0.65}}])
      : ['motor','chassis'].includes(selected)?[{label:spec.params.targetKph>10?'Try a slower ride':'Try a faster ride',values:{targetKph:spec.params.targetKph>10?Math.max(5,spec.params.targetKph-5):20}}]
      : selected==='flywheel'?[{label:spec.params.flywheel?'Try without the flywheel':'Fit the flywheel',values:{flywheel:!spec.params.flywheel}}]:[];
    el('part-actions').replaceChildren(...actions.map(action=>{const button=document.createElement('button');button.disabled=selected==='solar'&&state.status==='complete';button.textContent=selected==='solar'?(spec.params.shade>0?'Remove panel cover':'Shade the panel'):action.label+' · Restart comparison';button.dataset.solarAction=selected;button.addEventListener('click',()=>{
      if(selected==='solar'){shadePanel();return;}
      const baseline=structuredClone(spec),wasRunning=running;
      apply(program.edit(spec,action.values));matchedSpec=baseline;matchedParams=baseline.params;matchedState=model.initial(matchedParams);interventionLabel=action.label;
      matchedInitialSpec=structuredClone(baseline);matchedActions=[];
      running=wasRunning;updateUi();notify('Both branches restarted from their declared reserves. Same drive cycle and simulated interval.');
    },{signal:events.signal});return button;}));
  }
  function setParameters(changes) { return apply(program.edit(spec, changes), 'Parameters applied. Restarted from declared initial reserves.'); }
  function shadePanel() {
    if(state.status==='complete'){notify('Replay the ride to compare another intervention.');return;}
    const shade=spec.params.shade>0?0:.65,next=program.edit(spec,{shade});
    generation++;replayActions=null;matchedReplayActions=null;replayTarget=null;
    matchedSpec=structuredClone(spec);matchedParams=matchedSpec.params;matchedState=structuredClone(state);
    matchedInitialSpec=structuredClone(initialSpec);matchedActions=structuredClone(liveActions);comparisonStartS=state.timeS;
    spec=next;liveActions.push({step:state.step,changes:{shade}});scene=root.SimulatteSolarScene.create(spec.params);
    interventionLabel=shade?'Panel cover added':'Panel cover removed';scheduler.rebase();syncControls();updateActions();updateUi();
  }
  function setMode(mode) {
    if(!['ride','inspect'].includes(mode))throw Error('solar_view_unsupported');
    if(mode==='ride'&&spec.params.route!=='identified')throw Error('solar_ride_route_required');
    if(view.mode===mode)return;
    if(view.mode==='inspect')inspectView={explode:view.targetExplode,cutaway:view.cutaway,labels:view.labels};
    view.mode=mode;setView(mode==='ride'?{explode:0,cutaway:false,labels:false}:inspectView);
    el('ride').setAttribute('aria-checked',String(mode==='ride'));el('inspect').setAttribute('aria-checked',String(mode==='inspect'));
    el('assembly-tools').hidden=mode!=='inspect';el('component-drawer').open=mode==='inspect';document.querySelector('.ride-action').hidden=mode==='inspect';updateActions();resetCamera();
  }
  function applyReplayActions() {
    for(const [queue,isBaseline] of [[replayActions,false],[matchedReplayActions,true]]){
      const activeState=isBaseline?matchedState:state;if(!queue||!activeState)continue;
      while(queue[0]?.step<=activeState.step){const action=queue.shift();
        if(isBaseline){matchedSpec=program.edit(matchedSpec,action.changes);matchedParams=matchedSpec.params;}
        else {spec=program.edit(spec,action.changes);liveActions.push(structuredClone(action));scene=root.SimulatteSolarScene.create(spec.params);syncControls();updateActions();}
      }
    }
  }
  const mapBounds={minX:Math.min(...routeData.points.map(p=>p.x)),maxX:Math.max(...routeData.points.map(p=>p.x)),minY:Math.min(...routeData.points.map(p=>p.y)),maxY:Math.max(...routeData.points.map(p=>p.y))};
  const mapScale=Math.min(280/(mapBounds.maxX-mapBounds.minX),64/(mapBounds.maxY-mapBounds.minY));
  const mapPoint=p=>[160+(p.x-(mapBounds.minX+mapBounds.maxX)/2)*mapScale,45-(p.y-(mapBounds.minY+mapBounds.maxY)/2)*mapScale];
  el('route-line').setAttribute('d',routeData.points.map((p,i)=>`${i?'L':'M'}${mapPoint(p).join(',')}`).join(' '));
  function updateRide(t) {
    const env=program.environment(spec,state);el('ride-summary').hidden=!env;
    el('shade-panel').disabled=state.status==='complete';el('shade-panel').textContent=spec.params.shade>0?'Remove panel cover':'Shade the panel';
    if(env){const pos=mapPoint(env.point);el('route-marker').setAttribute('cx',pos[0]);el('route-marker').setAttribute('cy',pos[1]);
      el('route-position').textContent=`${env.point.street} · ${nf(env.point.distanceM)} / ${nf(env.lengthM)} m · grade ${signed(env.grade,1)}%`;
      el('route-condition').textContent=(env.dwellS>0?`Stopped: ${nf(env.dwellS,1)} s remaining · `:'')+`${nf(env.directFraction*100)}% direct panel exposure · `+new Intl.DateTimeFormat('en-US',{timeZone:routeData.timeZone,hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date(env.timestamp));
    }
    let copy=`Solar supplies ${nf(t.busW)} W. Battery ${t.batteryW>=0?'supplies':'receives'} ${nf(Math.abs(t.batteryW))} W${spec.params.flywheel?`; flywheel ${signed(t.flywheelW)} W`:''}.`;
    if(matchedState){const bt=program.telemetry(matchedSpec,matchedState);copy+=` ${interventionLabel}: ${signed(t.busW-bt.busW)} W solar and ${signed((matchedState.batteryJ-state.batteryJ)/3600,3)} Wh extra battery use since ${nf(comparisonStartS,1)} s. Baseline: same ride without this change.`;}
    el('ride-consequence').textContent=copy;
    const reference=program.referenceComparison(spec,state);el('reference-comparison').textContent=`This ride: ${reference.modeledElectricalWhKm===null?'starting':nf(reference.modeledElectricalWhKm,1)+' Wh/km electrical demand'}. Published touring median: ${nf(reference.publishedMedianWhKm,1)} Wh/km across ${reference.evaluationCount} reserved rides. Different routes, terrain, rider input and vehicle shape; this is a scale comparison.`;
  }
  function setVehicle(vehicle) { apply(vehicle==='bicycle'?program.createRide(vehicle):program.create(vehicle)); resetCamera(); notify(`${vehicle[0].toUpperCase() + vehicle.slice(1)} preset loaded.`); }
  function setView(changes) {
    if(view.mode==='ride'&&changes.explode>0)setMode('inspect');
    if (Object.hasOwn(changes, 'explode')) view.targetExplode = Math.max(0, Math.min(1, changes.explode));
    for (const key of ['cutaway', 'fields', 'flows', 'labels']) if (Object.hasOwn(changes, key)) view[key] = Boolean(changes[key]);
    el('assembled').setAttribute('aria-checked', String(view.targetExplode === 0)); el('exploded').setAttribute('aria-checked', String(view.targetExplode > 0));
    for (const key of ['cutaway', 'fields', 'flows', 'labels']) el(key).setAttribute('aria-checked', String(view[key]));
  }
  function updateDetail() {
    const p = spec.params, t = program.telemetry(spec, state);
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
    const p = spec.params, t = program.telemetry(spec, state);
    metric('metric-solar', nf(t.busW), 'W'); metric('metric-speed', nf(t.speedKph,1), 'km/h'); metric('metric-battery', nf(t.batterySoc * 100, 1), '%');
    el('solar-detail').textContent = `${nf(t.poa)} W/m2 on the collector`; el('speed-detail').textContent = `${nf(t.speedKph, 1)} km/h actual / ${nf(p.targetKph)} target`;
    el('battery-detail').textContent = `${nf(state.batteryJ / 3600, 1)} / ${nf(p.batteryWh)} Wh remaining`;
    el('clock').textContent = `${String(Math.floor(state.timeS / 60)).padStart(2, '0')}:${String(Math.floor(state.timeS % 60)).padStart(2, '0')}`;
    el('run-state').textContent = state.status === 'complete' ? 'CYCLE COMPLETE' : running ? state.status.toUpperCase().replaceAll('-', ' ') : state.step ? 'PAUSED' : 'READY';
    el('run').querySelector('span').textContent = running ? 'Pause' : state.status === 'complete' || (replayTarget !== null && state.step >= replayTarget) ? 'Replay' : state.step ? 'Resume' : 'Resume';
    el('energy-error').textContent = `${nf(state.residualJ / 3600, 6)} Wh`; el('distance').textContent = `${nf(state.distanceM / 1000, 3)} km`; el('recovered').textContent = `${nf(state.ledger.regenJ / 3600, 2)} Wh`;
    el('reserve-change').textContent = signed(t.reserveW);
    const positive = t.reserveW >= 0;
    el('reserve-state').textContent = !state.step ? 'READY' : positive ? 'REPLENISHING' : 'DRAWING RESERVES'; el('reserve-state').dataset.positive = String(positive);
    const netWh = (state.batteryJ + state.flywheelJ - state.initialJ) / 3600;
    el('reserve-copy').textContent = !state.step ? ''
      : `${positive ? 'Reserves are increasing at this operating point.' : 'Motion and losses currently exceed available solar power.'} Net change: ${signed(netWh, 2)} Wh.`;
    if(matchedState){const bt=program.telemetry(matchedSpec,matchedState);const used=s=>(s.initialJ-s.batteryJ-s.flywheelJ)/3600;
      el('part-effect').textContent=`${interventionLabel}: solar ${signed(t.busW-bt.busW)} W; reserve use ${signed(used(state)-used(matchedState),2)} Wh; distance ${signed(state.distanceM-matchedState.distanceM,1)} m versus the same ride without this change, from ${nf(comparisonStartS,1)} to ${nf(state.timeS,1)} s. Both branches count initial stored energy.`;
    }else el('part-effect').textContent='';
    updateRide(t); updateDetail(); updateChart();
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
    for(const node of flowLabels.values()) node.hidden=true;
    for(const link of currentFrame.flowLinks){
      const key=link.from+'-'+link.to;
      if(!flowLabels.has(key)){const node=document.createElement('span');node.className='flow-label';el('flow-labels').append(node);flowLabels.set(key,node);}
      const node=flowLabels.get(key),point=drawing.project(currentFrame.anchors[link.from].map((v,i)=>(v+currentFrame.anchors[link.to][i])/2));
      node.hidden=!view.flows||!point||Math.abs(link.watts)<.2||![link.from,link.to].includes(selected);
      if(node.hidden)continue;
      node.textContent=`${nf(Math.abs(link.watts))} W ${link.watts>=0?'→':'←'}`;
      node.style.left=`${Math.max(50,Math.min(canvas.clientWidth-50,point.x))}px`;node.style.top=`${Math.max(115,Math.min(canvas.clientHeight-70,point.y))}px`;
    }
    const a = drawing.project([0, 0, 0]), b = drawing.project([1, 0, 0]);
    if (a && b) document.querySelector('.scene-scale>span').style.width = `${Math.hypot(b.x - a.x, b.y - a.y)}px`;
  }
  function advance(count) {
    if (!Number.isInteger(count) || count < 0 || count > 100000) throw new Error('solar_manual_step_budget_invalid');
    for (let i = 0; i < count && state.status !== 'complete'; i += 1) { applyReplayActions(); state = program.step(spec, state); if(matchedState) matchedState=program.step(matchedSpec,matchedState); sample(); }
    if (state.status === 'complete') running = false;
    applyReplayActions();return state;
  }
  async function verifyReplay() {
    const wasRunning = running; running = false; scheduler.rebase();
    const epoch = ++generation, original = state, active = spec;
    const candidate=program.execution(initialSpec,liveActions),candidateBaseline=matchedInitialSpec?program.execution(matchedInitialSpec,matchedActions):null;
    const recordedBaseline=matchedState;el('verify-replay').disabled = true;
    try {
      for (let i = 0; i < original.step; i += 1) {
        candidate.advance();if(candidateBaseline)candidateBaseline.advance();
        if (i % 800 === 0) { await new Promise((resolve) => setTimeout(resolve, 0)); if (epoch !== generation) return { status: 'cancelled' }; }
      }
      const reproduced=candidate.snapshot();
      const pass = world.canonicalJson(reproduced.state) === world.canonicalJson(original) && reproduced.worldSpec.contentHash===active.contentHash && (!candidateBaseline || world.canonicalJson(candidateBaseline.snapshot().state)===world.canonicalJson(recordedBaseline));
      document.body.dataset.replay = pass ? 'pass' : 'fail'; notify(pass ? `Replay matches every state field across ${original.step} fixed steps.` : 'Replay differs from the recorded state.');
      return { status: pass ? 'pass' : 'fail', stepCount: original.step, worldSpecHash: active.contentHash };
    } finally { if (epoch === generation) running = wasRunning; el('verify-replay').disabled = false; updateUi(); }
  }
  function replay() {
    const target = state.step || Math.ceil(spec.params.durationS / spec.params.stepS);
    const baseline=matchedInitialSpec,label=interventionLabel,actions=structuredClone(liveActions),baselineActions=structuredClone(matchedActions),start=comparisonStartS;
    const beginning=structuredClone(initialSpec);apply(beginning);replayActions=actions;matchedInitialSpec=baseline;matchedSpec=baseline;matchedParams=baseline?.params||null;matchedState=matchedParams?model.initial(matchedParams):null;matchedActions=baselineActions;matchedReplayActions=structuredClone(baselineActions);comparisonStartS=start;interventionLabel=label;applyReplayActions();
    replayTarget = target; running = true; scheduler.reset(); updateUi();
    notify('Replaying the accepted run from the beginning.');
  }
  async function compare() {
    const epoch = generation, active = spec;
    const count = Math.min(Math.ceil(active.params.durationS / active.params.stepS), Math.max(state.step, Math.round(300 / active.params.stepS)));
    const hybridSpec=active.params.flywheel?active:program.edit(active,{flywheel:true}),batterySpec=!active.params.flywheel?active:program.edit(active,{flywheel:false});
    const hybridP=hybridSpec.params,batteryP=batterySpec.params;
    let hybrid = model.initial(hybridP), battery = model.initial(batteryP);
    el('compare').disabled = true; el('comparison-result').textContent = 'Running both configurations against identical conditions...';
    try {
      for (let i = 0; i < count; i += 1) {
        hybrid = program.step(hybridSpec, hybrid); battery = program.step(batterySpec, battery);
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
  function exportData() { return { initialWorldSpec:structuredClone(initialSpec),actions:structuredClone(liveActions),worldSpec: structuredClone(spec), run: program.receipt(spec, state, drawing?.receipt() || null), samples: structuredClone(history), matchedComparison:matchedSpec?{schema:'simulatte.solarDriveIntervention.v1',baselineWorldSpec:structuredClone(matchedSpec),baselineInitialWorldSpec:structuredClone(matchedInitialSpec),baselineActions:structuredClone(matchedActions),baselineRun:program.receipt(matchedSpec,matchedState,null),interventionWorldSpecHash:spec.contentHash,interval:{start:comparisonStartS,end:state.timeS,unit:'s'}}:null }; }
  function importSpec(text) {
    if (typeof text !== 'string' || text.length > 2000000) throw new Error('solar_import_size_invalid');
    const parsed=JSON.parse(text),finalSpec=program.validate(parsed.worldSpec||parsed);
    if(!parsed.initialWorldSpec)return apply(finalSpec,'Imported WorldSpec; run from its initial state.');
    const plan=program.execution(parsed.initialWorldSpec,parsed.actions||[]);
    if(plan.finalSpec().contentHash!==finalSpec.contentHash)throw Error('solar_import_action_identity_mismatch');
    let base=null;
    if(parsed.matchedComparison){const base=parsed.matchedComparison,baseline=program.execution(base.baselineInitialWorldSpec,base.baselineActions);
      if(baseline.finalSpec().contentHash!==program.validate(base.baselineWorldSpec).contentHash)throw Error('solar_import_baseline_identity_mismatch');
      if(!Number.isFinite(base.interval?.start)||base.interval.start<0)throw Error('solar_import_interval_invalid');
    }
    base=parsed.matchedComparison;
    apply(parsed.initialWorldSpec);replayActions=structuredClone(parsed.actions||[]);
    if(base){matchedInitialSpec=structuredClone(base.baselineInitialWorldSpec);matchedSpec=structuredClone(matchedInitialSpec);matchedParams=matchedSpec.params;matchedState=model.initial(matchedParams);matchedActions=structuredClone(base.baselineActions||[]);matchedReplayActions=structuredClone(matchedActions);comparisonStartS=base.interval.start;interventionLabel='Imported panel intervention';}
    applyReplayActions();updateUi();return structuredClone(spec);
  }
  function loop(now) {
    if (disposed) return;
    const delta = lastTime ? Math.max(0, (now - lastTime) / 1000) : 0; lastTime = now;
    try { scheduler.frame(now, { running, visible: !document.hidden, speed: Number(el('playback').value), advance: () => {
      if (state.status === 'complete' || (replayTarget !== null && state.step >= replayTarget)) { running = false; return false; }
      advance(1); return true;
    } }); } catch(error) { failure(error);return; }
    el('playback-health').textContent = `${Number(el('playback').value)} simulated seconds / real second` + (scheduler.snapshot().slowerPlayback ? ' · Slower playback: computing every fixed step.' : '');
    const ease = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1 - Math.exp(-delta * 10);
    view.explode += (view.targetExplode - view.explode) * ease;
    try {currentFrame=renderFrame();}catch(error){failure(error);return;}
    if (cameraGoal) {
      for (const key of ['yaw', 'pitch', 'distance']) camera[key] += (cameraGoal[key] - camera[key]) * ease;
      camera.target = camera.target.map((v, i) => v + (cameraGoal.target[i] - v) * ease);
      if(['yaw','pitch','distance'].every(key=>Math.abs(camera[key]-cameraGoal[key])<0.001)&&camera.target.every((v,i)=>Math.abs(v-cameraGoal.target[i])<0.001)){
        Object.assign(camera,{yaw:cameraGoal.yaw,pitch:cameraGoal.pitch,distance:cameraGoal.distance,target:[...cameraGoal.target]});cameraGoal=null;
      }
    }
    try {
      if (drawing) { drawing.render(currentFrame, camera, program.COMPONENTS.findIndex((p) => p.id === selected) + 1); updateLabels(); }
    } catch (error) { failure(error); return; }
    if (now - lastUi > 180) { updateUi(); lastUi = now; }
    raf = requestAnimationFrame(loop);
  }
  buildComponents(); syncControls(); updateActions(); updateUi(); resetCamera();
  document.querySelectorAll('[data-vehicle]').forEach((button) => on(button, 'click', () => setVehicle(button.dataset.vehicle)));
  document.querySelectorAll('[data-param]').forEach((control) => {
    on(control, 'input', () => { const key = control.dataset.param; if (el(`${key}-value`)) el(`${key}-value`).textContent = formatParam(key, Number(control.value)); });
    on(control, 'change', () => {
      const value = control.type === 'checkbox' ? control.checked : control.tagName === 'SELECT' ? control.value : Number(control.value);
      try { setParameters({ [control.dataset.param]: value }); } catch (error) { notify(error.message); syncControls(); }
    });
  });
  on(el('run'), 'click', () => { if (state.status === 'complete' || (replayTarget !== null && state.step >= replayTarget)) { replay(); return; } running = !running; scheduler.rebase(); updateUi(); });
  on(el('reset'), 'click', () => apply(initialSpec));
  on(el('replay'), 'click', replay);
  on(el('verify-replay'), 'click', () => void verifyReplay().catch(error => notify(error.message)));
  on(el('focus-selection'), 'click', focusSelection);
  on(el('compare'), 'click', () => void compare().catch((error) => { el('comparison-result').textContent = error.message; }));
  on(el('export'), 'click', () => download(exportData(), 'solar-drive-run.json'));
  on(el('ride'),'click',()=>setMode('ride')); on(el('inspect'),'click',()=>setMode('inspect')); on(el('shade-panel'),'click',shadePanel);
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
    if (event.pointerType !== 'touch') canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]); travel = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  on(canvas, 'pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const before = pointers.get(event.pointerId), dx = event.clientX - before[0], dy = event.clientY - before[1];
    pointers.set(event.pointerId, [event.clientX, event.clientY]); travel += Math.abs(dx) + Math.abs(dy);
    if (event.pointerType === 'touch' && pointers.size === 1 && Math.abs(dy) >= Math.abs(dx)) return;
    if(!dx&&!dy)return;cameraGoal=null;cameraMode='manual';
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch && distance) zoom(pinch / distance); pinch = distance;
    } else { camera.yaw -= dx * 0.007; camera.pitch = Math.max(-0.04, Math.min(1.42, camera.pitch + dy * 0.005)); }
  });
  on(canvas, 'pointerup', (event) => {
    pointers.delete(event.pointerId); if (travel > 6 || !currentFrame || !drawing) return;
    const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    let picked = null, best = Infinity;
    for (const item of currentFrame.instances) {
      if (!program.COMPONENTS.some(part=>part.id===item.group)) continue;
      const point = drawing.project([item.matrix[12], item.matrix[13], item.matrix[14]]); if (!point) continue;
      const distance = Math.hypot(point.x - x, point.y - y), score = distance + point.z * 4;
      if (distance < 22 && score < best) { best = score; picked = item.group; }
    }
    if (picked) select(picked);
  });
  on(canvas, 'pointercancel', (event) => pointers.delete(event.pointerId));
  function zoom(factor) {
    if(!Number.isFinite(factor)||factor<=0)throw Error('solar_zoom_factor_invalid');
    if(disposed||!drawing)throw Error('solar_view_not_ready');
    cameraGoal=null;cameraMode='manual';camera.distance=Math.max(0.65,Math.min(18,camera.distance*factor));
    return structuredClone(camera);
  }
  on(canvas, 'wheel', (event) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); zoom(Math.exp(event.deltaY * 0.001)); }, { passive: false });
  on(canvas, 'keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '=', 'Home'].includes(event.key)) return;
    event.preventDefault(); cameraGoal = null; cameraMode='manual';
    if (event.key === 'Home') resetCamera();
    if (event.key === 'ArrowLeft') camera.yaw -= 0.12;
    if (event.key === 'ArrowRight') camera.yaw += 0.12;
    if (event.key === 'ArrowUp') camera.pitch = Math.min(1.42, camera.pitch + 0.08);
    if (event.key === 'ArrowDown') camera.pitch = Math.max(-0.04, camera.pitch - 0.08);
    if (event.key === '+' || event.key === '=') zoom(0.9);
    if (event.key === '-') zoom(1.1);
  });
  on(document, 'visibilitychange', () => scheduler.rebase());
  function dispose() { if (disposed) return; disposed = true; generation += 1; running = false; cancelAnimationFrame(raf); clearTimeout(timer); events.abort(); drawing?.dispose(); }
  on(root, 'pagehide', (event) => { if (!event.persisted) dispose(); });
  root.SimulatteSolarDrive = Object.freeze({ getSpec: () => structuredClone(spec), getState: () => structuredClone(state),
    getReceipt: () => program.receipt(spec, state, drawing?.receipt() || null), exportData, importSpec,
    setParameters, setVehicle, setView, setMode, shadePanel, select, replay, verifyReplay, compare, focus: focusSelection, resetCamera, setCameraView, zoom, cameraView:()=>cameraMode, controlState:()=>({ready:Boolean(drawing)&&!disposed,running,complete:state.status==='complete',failed:Boolean(document.body.dataset.runtimeError)}),
    snapshot: () => ({ mode:view.mode, viewState:structuredClone(view), route:program.environment(spec,state), actions:structuredClone(liveActions), camera: structuredClone(camera), selected, running, playback: scheduler.snapshot(), frame: currentFrame && {anchors:currentFrame.anchors},
      view: {width:canvas.clientWidth,height:canvas.clientHeight,insets:{},points:currentFrame&&drawing?geometryPoints(selected,currentFrame).map(point=>drawing.project(point)):[]} }),
    getMatchedState:()=>matchedState?{params:structuredClone(matchedParams),state:structuredClone(matchedState)}:null,
    isViewSettled: () => Math.abs(view.explode - view.targetExplode) < 0.002 && !cameraGoal,
    runSteps(count) { running = false; const result = advance(count); updateUi(); return structuredClone(result); }, dispose });
  root.SimulatteSolarRenderer.create(canvas, failure).then((renderer) => {
    if (disposed) { renderer.dispose(); return; }
    drawing = renderer; el('gpu-message').hidden = true; el('gpu-status').dataset.state = 'ready';
    el('gpu-status').innerHTML = '<i></i>WebGPU / live'; el('run').disabled = false; running=true;updateUi(); raf = requestAnimationFrame(loop);
  }).catch(failure);
})(globalThis).catch(error=>{document.body.dataset.runtimeError=error.message;document.getElementById('gpu-status').textContent='Ride unavailable';const panel=document.getElementById('gpu-message');panel.hidden=false;panel.textContent=error.message;});
