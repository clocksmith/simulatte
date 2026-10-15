const assert = require('node:assert/strict');
const test = require('node:test');
const cameras = require('../public/simulatte/app/camera-controller.js');
const initial = require('../public/simulatte/app/experience-camera.js');
const tiers = require('../public/simulatte/app/multi-tier-visualizer.js');
const presentation = require('../public/simulatte/app/tier-plugin-presentation.js');
const profiles = require('../public/simulatte/app/application-profile-select.js');
const shell = require('../public/simulatte/app/app-shell.js');

function state() {
  return { mode: 'overview', yaw: -0.72, pitch: 0.84, distance: 2400, followDistance: 62,
    orbitTarget: [4300, 350, -9200], focusId: 'plugin:fixture:network', focusHeading: null,
    targets: [{ id: 'route', kind: 'route', target: [0, 0, 0], distance: 9000 },
      { id: 'plugin:fixture:network', kind: 'plugin', target: [4300, 350, -9200], distance: 2400, viewMode: 'overview' }],
    pose: null, transition: null, transitionProgress: 1, lastFrameAt: null };
}

test('scenario selection never impersonates authored textbox input', () => {
  const prior = global.document;
  global.document = { body: { dataset: {} } };
  try {
    const node = () => ({ hidden: false, textContent: '' });
    const elements = { missionField: node(), scenarioField: node(), scenarioLabel: node(), scenarioDescription: node(),
      scenarioSeed: node(), missionInput: { value: 'previous authoring' }, shuffleLabel: node(), startLabel: node() };
    profiles.renderInteraction({ mode: 'playback', startLabel: 'Run', shuffleLabel: 'Next scenario' },
      { label: 'Structured route', description: 'Governed data', seed: 'fixed', missionText: 'Generated example text' }, elements);
    assert.equal(elements.missionInput.value, '');
    assert.equal(elements.missionField.hidden, true);
    assert.equal(elements.scenarioField.hidden, false);
    assert.equal(elements.scenarioDescription.textContent, 'Governed data');
  } finally { global.document = prior; }
});

test('profile defaults choose declared overview targets even without an explicit target ID', () => {
  const calls = [];
  assert.equal(initial.applyInitialCamera({ configuration: { initialMode: 'bird' },
    renderer: { cameraTargets: () => state().targets, resetCamera: (value) => calls.push(value) },
    onModeSelected: (value) => calls.push(value) }), true);
  assert.deepEqual(calls, [{ targetId: 'plugin:fixture:network', mode: 'overview' }, 'overview']);
});

test('reset view restores pose, zoom, and the non-origin target without changing simulation', () => {
  const camera = state();
  cameras.orbitCamera(camera, 80, 40);
  cameras.zoomCamera(camera, 300);
  cameras.resetCamera(camera, 'plugin:fixture:network', 'top', 100);
  assert.deepEqual(camera.orbitTarget, [4300, 350, -9200]);
  assert.equal(camera.distance, 2400);
  assert.equal(camera.followDistance, 62);
  assert.equal(camera.yaw, -0.72);
  assert.equal(camera.mode, 'top');
  assert.equal(camera.isManualFrame, false);
});

test('updated plugin targets do not undo manually explored framing', () => {
  const camera = state();
  cameras.orbitCamera(camera, 60, 0);
  cameras.zoomCamera(camera, 200);
  const before = { target: [...camera.orbitTarget], distance: camera.distance };
  cameras.replacePluginCameraTargets(camera, [{ ...camera.targets[1], target: [9999, 0, -9999], distance: 8000 }], 16);
  assert.deepEqual(camera.orbitTarget, before.target);
  assert.equal(camera.distance, before.distance);
});

test('narrow camera framing expands distance and clipping around the actual target', () => {
  const snapshot = { state: { position: { x: 0, y: 0 } } };
  const wide = cameras.advanceCamera(state(), snapshot, {}, 2, 0);
  const narrow = cameras.advanceCamera(state(), snapshot, {}, 0.5, 0);
  assert.deepEqual(narrow.target, wide.target);
  const distance = pose => Math.hypot(...pose.eye.map((value, i) => value - pose.target[i]));
  assert.ok(Math.abs(distance(narrow) / distance(wide) - 2) < 1e-8);
  assert.ok(narrow.eye[1] > narrow.target[1]);
  assert.ok(narrow.far > distance(narrow));
});

for (const system of ['wgs84', 'heliocentric-ecliptic-au', 'icrs-cartesian-pc', 'datacenter-cartesian-meters']) {
  for (const viewport of [{ width: 390, height: 360 }, { width: 1440, height: 600 }]) {
    test(`${system} framing is centered and bounded at ${viewport.width} pixels`, () => {
      const coordinates = system === 'wgs84' ? [[-100, 20, 0], [-20, 60, 0]] : [[20, 2, 0], [35, 12, 1]];
      // ICRS Overview frames the whole sky; Follow keeps the evidence-centered frame.
      const viewMode = system === 'icrs-cartesian-pc' ? 'follow' : 'overview';
      const view = tiers.coordinateEvidenceView({ coordinates, coordinateSystem: system, viewMode, ...viewport });
      const points = coordinates.map(point => presentation.projectPoint(point, system, { ...view, rotX: 0, rotY: 0 }));
      const centerX = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2;
      const centerY = (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2;
      assert.ok(Math.abs(centerX - viewport.width / 2) < 1e-6);
      assert.ok(Math.abs(centerY - viewport.height / 2) < 1e-6);
      for (const point of points) {
        assert.ok(point.x >= 0 && point.x <= viewport.width);
        assert.ok(point.y >= 0 && point.y <= viewport.height);
      }
    });
  }
}

test('national framing uses viewport space, not obsolete mobile panel offsets', () => {
  const view = tiers.countryEvidenceView({ countryBounds: { minLon: -125, maxLon: -67, minLat: 24, maxLat: 49 },
    evidenceBounds: { minX: -120, maxX: -72, minY: 26, maxY: 47 }, width: 390, height: 360 });
  assert.ok(view.zoom > 0);
  assert.equal(view.panX, 195);
  assert.equal(view.panY, 180);
});

test('same-profile route edits serialize and only the newest result becomes canonical', async () => {
  const previous = global.document;
  global.document = { body: { dataset: {}, classList: { add() {}, remove() {} } }, getElementById: () => null, querySelectorAll: () => [] };
  let release, active = 0, peak = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const canonical = [];
  const base = { tier: 'world', experience: 'fixture', world: 'earth', profile: 'fixture', camera: 'overview' };
  try {
    const app = shell.create({
      router: { hrefFor: value => JSON.stringify(value), canonicalize: value => canonical.push(value) },
      boot: async () => ({ ...base, dispose() {}, async updateRoute(route) {
        active++; peak = Math.max(peak, active);
        if (route.simulation.scenarioId === 'first') await gate;
        active--;
        return { simulation: route.simulation };
      } }),
      updateExperienceDocLink() {}, labelForProfile: value => value, tierLabels: { world: 'Planet' },
    });
    await app.renderRoute(base);
    const first = app.renderRoute({ ...base, simulation: { scenarioId: 'first' } });
    await new Promise(resolve => setImmediate(resolve));
    const last = app.renderRoute({ ...base, simulation: { scenarioId: 'last' } });
    release();
    await Promise.all([first, last]);
    assert.equal(peak, 1);
    assert.equal(canonical.at(-1).simulation.scenarioId, 'last');
    assert.equal(canonical.some(route => route.simulation?.scenarioId === 'first'), false);
  } finally { global.document = previous; }
});

const cameraFit = require('../public/simulatte/app/camera-fit.js');
test('national bounds fit asymmetric measured insets on short and tall canvases', () => {
  const countryBounds = { minLon: -171, maxLon: -66, minLat: 18, maxLat: 72 };
  const evidenceBounds = { minX: -124, maxX: -71, minY: 25, maxY: 48 };
  for (const [width, height] of [[390, 360], [390, 844], [1440, 600]]) {
    const insets = { left: 20, right: 55, top: 45, bottom: 100 };
    const view = tiers.countryEvidenceView({ countryBounds, evidenceBounds, width, height, insets });
    const scale = Math.min(width / 105, height / 54) * .06 * view.zoom;
    for (const [x, y] of [[-124, 25], [-71, 48]]) {
      const px = view.panX + (x + 118.5) * scale, py = view.panY - (y - 45) * scale;
      assert.ok(px >= insets.left + 31.999 && px <= width - insets.right - 31.999);
      assert.ok(py >= insets.top + 31.999 && py <= height - insets.bottom - 31.999);
    }
  }
});

test('camera insets measure canvas overlap and ignore panels outside the drawing', () => {
  const canvas = { left: 10, right: 400, top: 100, bottom: 460, width: 390, height: 360 };
  assert.deepEqual(cameraFit.measureInsets(canvas, [
    { edge: 'bottom', rect: { left: 20, right: 390, top: 380, bottom: 448 } },
    { edge: 'top', rect: { left: 0, right: 410, top: 10, bottom: 95 } },
    { edge: 'right', rect: { left: 420, right: 500, top: 110, bottom: 300 } },
  ]), { left: 0, right: 0, top: 0, bottom: 80 });
});

test('camera refuses fully occluded space and fits extreme bounds without a minimum zoom clipping them', () => {
  const options = { coordinates: [[-1e8, -1e8], [1e8, 1e8]], coordinateSystem: 'local-m', width: 100, height: 80 };
  assert.equal(cameraFit.fit({ ...options, insets: { top: 80 } }), null);
  assert.equal(cameraFit.fit({ ...options, width: 0 }), null);
  const view = cameraFit.fit(options);
  for (const point of options.coordinates) {
    const p = presentation.projectPoint(point, options.coordinateSystem, view);
    assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 80);
  }
});

test('same-profile scenario replacement starts the new controller after activation and controls', async () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../public/simulatte/app/world-tiers-boot.js'), 'utf8');
  const start = source.indexOf('    async function updateSimulationFromRoute(');
  const end = source.indexOf('    async function updateRouteFromUrl(', start);
  // Exercise the route coordinator with isolated boundary ports, including an aborted activation.
  for (const mode of ['automatic', 'paused', 'aborted']) {
    const calls = [];
    const next = { id: 'new', seed: 'new-seed' };
    const controller = { dispose() { calls.push('dispose'); },
      async applyControls() { calls.push('controls'); }, async start() { calls.push('start'); },
      snapshot() { return { state: 'idle', scenarioId: next.id }; } };
    const root = { sessionStorage: {}, SimulatteTierRunController: { clearStoredReceipt() {} } };
    const ports = { root, options: {}, ctx: { setJourneyPhase() {}, setRuntimeStatus() {} }, elements: {},
      lifecycle: { throwIfAborted() { if (mode === 'aborted') throw new Error('aborted'); } },
      scenarioForRoute: () => next, acceptedRouteParameters: () => ({ fixture: { value: 2 } }),
      data: { applicationProfile: { id: 'profile', interaction: { simulationOwnerPluginId: 'fixture' } } },
      runtime: { activePluginIds: ['fixture'] }, pluginUi: { resetValues() {} }, renderScenario() {},
      async activateScenario() { await Promise.resolve(); calls.push('activate'); },
      configureRunController() { calls.push('configure'); }, simulationRouteState: () => next,
      controller };
    const update = new Function(...Object.keys(ports), `let activeScenario={id:'old',seed:'old-seed'};
      let runController=controller; ${source.slice(start, end)}; return updateSimulationFromRoute;`)(...Object.values(ports));
    const operation = update({ autoStart: mode !== 'paused' });
    if (mode === 'aborted') {
      await assert.rejects(operation, /aborted/);
      assert.deepEqual(calls, ['dispose', 'activate']);
    } else {
      await operation;
      assert.deepEqual(calls, ['dispose', 'activate', 'configure', 'controls', ...(mode === 'automatic' ? ['start'] : [])]);
      if (mode === 'paused') assert.deepEqual(root.__simulatteTierRunState, { state: 'idle', scenarioId: 'new' });
    }
  }
});

test('opening inspectors and rotating mobile viewports fits each scene within the remaining space', () => {
  for (const coordinateSystem of ['wgs84', 'heliocentric-ecliptic-au', 'icrs-cartesian-pc', 'datacenter-cartesian-meters']) {
    for (const [width, height] of [[390,844],[844,390],[1440,1000]]) {
      for (const coordinates of [[[0,0,0]], [[-1e4,-1e3,10],[4e3,9e3,-4]], [[1,2,0],[1.001,2.002,0]]]) {
        const insets={bottom:Math.min(220,height/3),left:20,right:10,top:20};
        const view=cameraFit.fit({coordinates,coordinateSystem,width,height,insets,rotX:.2,rotY:-.4});
        const viewport=cameraFit.usableViewport({width,height,insets});
        for(const point of coordinates){
          const projected=presentation.projectPoint(point,coordinateSystem,{...view,rotX:.2,rotY:-.4});
          assert.ok(projected.x>=viewport.left-1e-6&&projected.x<=viewport.right+1e-6);
          assert.ok(projected.y>=viewport.top-1e-6&&projected.y<=viewport.bottom+1e-6);
        }
      }
    }
  }
});

test('tier actors do not move between model updates when wall time advances', () => {
  const translations=[];
  const context=new Proxy({}, { get(_target,key) {return key==='translate'?(x,y)=>translations.push([x,y]):()=>{};},set(){return true;} });
  const layer=presentation.createLayer({view:()=>({panX:0,panY:0,zoom:1}),width:()=>500,height:()=>500});
  const contribution=x=>[{pluginId:'fixture',presentation:{schema:'simulatte.pluginPresentation.v3',coordinateSystem:'local-m',actors:[{id:'walker',position:[x,10],quantityKind:'actor.pedestrian'}]}}];
  layer.set(contribution(10),{simulationTimeMs:0});layer.render(context);
  layer.set(contribution(20),{simulationTimeMs:1000});layer.render(context);layer.render(context);
  assert.deepEqual(translations[1],translations[2]);
  assert.notDeepEqual(translations[0],translations[1]);
});


test('3D projection frames the focus above an inspector without mutating camera geometry', () => {
  const fit = require('../public/simulatte/app/camera-fit.js');
  const identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for (const [width,height,bottom] of [[390,404,265],[844,390,180],[1440,500,300]]) {
    const framed = fit.frameProjection(identity,{width,height,insets:{bottom}});
    const focusY = (1-framed[13])*height/2;
    assert.ok(focusY > 0 && focusY < height-bottom);
    assert.equal(framed[10],1);assert.equal(framed[15],1);
    assert.equal(identity[13],0,'the original camera transform remains unchanged');
  }
});

test('camera route identity uses accepted input, independent of measurements and editing drafts', () => {
  const scenario = { id: 'cable', seed: 'seed' };
  const contributions = [{ pluginId: 'subsea', controls: { controls: [{ id: 'failed', value: ['currently-broken'] }] } }];
  const accepted = { pluginId: 'subsea', values: { failed: ['accepted-fault'] } };
  const route = require('../public/simulatte/app/world-tiers-boot.js').appliedSimulationRouteState(scenario, contributions, accepted);
  assert.deepEqual(route.parameters.subsea.failed, ['accepted-fault']);
  accepted.values.failed.push('later-draft');
  assert.deepEqual(route.parameters.subsea.failed, ['accepted-fault']);
  assert.deepEqual(contributions[0].controls.controls[0].value, ['currently-broken']);
});


test('perspective camera fits actual geometry inside desktop and mobile overlay margins', () => {
  const fit=require('../public/simulatte/app/camera-fit.js');
  const points=[[-3,-1,-2],[3,2,2],[-3,2,2],[3,-1,-2],[0,4,0]];
  for(const [width,height] of [[1100,530],[390,420]]) {
    const insets={top:90,bottom:58},padding=12;
    const camera=fit.fitPerspective(points,{width,height,insets,padding});
    const {yaw,pitch,target,distance}=camera, dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
    const right=[Math.cos(yaw),0,-Math.sin(yaw)];
    const up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];
    const forward=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
    for(const p of points){const d=p.map((v,i)=>v-target[i]),z=distance-dot(d,forward);
      const x=width/2+dot(d,right)/z/Math.tan(.65/2)*height/2;
      const y=height/2-dot(d,up)/z/Math.tan(.65/2)*height/2;
      assert.ok(x>=padding&&x<=width-padding);assert.ok(y>=insets.top+padding&&y<=height-insets.bottom-padding);
    }
  }
});

test('segmented groups project accepted state without claiming rejected or pending clicks', async () => {
  const controls = require('../public/shared/design/control-components.js');
  class Button {
    constructor(checked) { this.attrs = new Map([['aria-checked', String(checked)]]); this.listeners = {}; this.hidden = false; this.disabled = false; }
    setAttribute(key,value) { this.attrs.set(key,value); }
    getAttribute(key) { return this.attrs.get(key); }
    removeAttribute(key) { this.attrs.delete(key); }
    addEventListener(key,fn) { (this.listeners[key] ||= []).push(fn); }
    click() { for(const fn of this.listeners.click || []) fn(); }
    focus() { this.focused = true; }
  }
  const buttons = [new Button(true),new Button(false)], group = {setAttribute(){},querySelectorAll:()=>buttons};
  const widget = controls.decorateGroup(group);
  assert.equal(controls.decorateGroup(group),widget,'Repeated mounting must not add competing listeners');
  let release;
  const pending = new Promise(resolve=>release=resolve);
  buttons[1].addEventListener('click',()=>pending.then(()=>widget.sync(buttons[1])));
  buttons[1].click();
  assert.equal(buttons[0].getAttribute('aria-checked'),'true');
  assert.equal(buttons[1].getAttribute('aria-checked'),'false','Pending choice is not accepted state');
  release(); await pending; await Promise.resolve();
  assert.equal(buttons[1].getAttribute('aria-checked'),'true');
  // Programmatic restoration, then a rejected/cancelled request with no commit.
  widget.sync(buttons[0]); buttons[0].click();
  assert.equal(buttons[0].getAttribute('aria-checked'),'true');
  buttons[1].listeners.click = [];
  buttons[1].click();
  assert.equal(buttons[1].getAttribute('aria-checked'),'false');
  const event={key:'ArrowRight',preventDefault(){}};
  buttons[0].listeners.keydown[0](event);
  assert.equal(buttons[1].focused,true);
  assert.equal(buttons[0].tabIndex,0,'Roving tab stop follows accepted state after refusal');
  widget.sync(buttons[1]);
  assert.equal(buttons[1].tabIndex,0);
  assert.equal(buttons[0].tabIndex,-1);
});


test('World Focus bounds include the rendered marker height, not only its ground anchor', () => {
  const sceneApi=require('../public/simulatte/app/world-render-scene.js');
  const geometry=require('../public/simulatte/app/webgpu-geometry.js');
  const fit=require('../public/simulatte/app/camera-fit.js');
  const camera=require('../public/simulatte/app/camera-controller.js');
  const scene={actors:[],paths:[],areas:[],markers:[{id:'plugin:test:tower',point:{x:400,y:200},heightM:30,radiusM:4,intensity:1,style:{tone:'cyan'}}]};
  const points=sceneApi.objectBounds(geometry,scene,'tower',{state:{simulatedTimeSeconds:0}});
  assert.equal(points.length,8);assert.ok(Math.max(...points.map(p=>p[1]))>=30);
  assert.deepEqual(sceneApi.objectBounds(geometry,scene,'missing',{state:{}}),[]);
  for(const [width,height,insets] of [[1375,754,{bottom:338}],[364,564,{bottom:314}]]) {
    const state={mode:'top',yaw:-.72,pitch:.84};
    assert.equal(sceneApi.fitObject(state,points,{width,height,insets},fit),true);
    assert.ok(state.distance<140,'A small object must be framed independently of city-scale limits');
    state.targets=[{id:'tower',target:state.orbitTarget,distance:state.distance}];state.focusId='tower';
    const pose=camera.advanceCamera({...state,pose:null,transition:null,lastFrameAt:null},{state:{position:{x:0,y:0}}},{},width/height,0);
    assert.ok(pose.eye[1]-pose.target[1]<80,'Fitted views must not inherit a city-scale minimum height');
  }
});

test('tier picking bounds use the same visible marker radius as drawing', () => {
  const presentation=require('../public/simulatte/app/tier-plugin-presentation.js');
  const layer=presentation.createLayer({view:()=>({panX:100,panY:100,zoom:100,rotX:0,rotY:0}),width:()=>300,height:()=>300});
  layer.set([{pluginId:'fixture',presentation:{schema:'simulatte.pluginPresentation.v3',coordinateSystem:'icrs-cartesian-pc',markers:[{id:'star',position:[0,0,0],radius:2,tone:'cyan'}]}}]);
  const bounds=layer.objectBounds('fixture','star');
  assert.equal(bounds.length,4);assert.equal(bounds[1].x-bounds[0].x,8);
  const arcs=[];const ctx=new Proxy({arc(x,y,r){arcs.push({x,y,r});}},{get:(o,k)=>k in o?o[k]:()=>{}});
  layer.render(ctx);
  assert.ok(arcs.some(a=>a.x===(bounds[0].x+bounds[1].x)/2&&a.y===(bounds[0].y+bounds[2].y)/2&&a.r===4));
  assert.equal(layer.objectBounds('fixture','missing'),null);
});
