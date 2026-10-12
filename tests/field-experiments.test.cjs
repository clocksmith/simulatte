const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const grid = require("../public/shared/core/simulation/field-grid.js");
const program = require("../public/simulatte/field-experiments/program.js");
const world = require("../public/shared/contracts/world-spec.js");
const cases = [
  ["living-tissue", "tissue-growth"],
  ["river-formation", "river-erosion"],
  ["crystal-foundry", "crystal-solidification"],
].map(([id, file]) => ({
  config: JSON.parse(
    fs.readFileSync(`${__dirname}/../public/data/field-experiments/${id}.json`),
  ),
  model: require(`../public/shared/core/simulation/${file}.js`),
}));
test("zero-flux diffusion conserves total mass and converges to an independent cosine mode", () => {
  const errors = [];
  for (const n of [16, 32, 64]) {
    const dx = 1 / n,
      dt = 0.2 * dx * dx,
      duration = 0.01,
      steps = Math.round(duration / dt),
      actualTime = steps * dt;
    let field = Array.from(
      { length: n * n },
      (_, i) => 1 + 0.2 * Math.cos(Math.PI * ((i % n) + 0.5) * dx),
    );
    const initial = grid.sum(field);
    for (let i = 0; i < steps; i++) field = grid.diffuse(field, n, dx, dt, 1);
    assert.ok(Math.abs(grid.sum(field) - initial) < 1e-8);
    errors.push(
      Math.sqrt(
        field.reduce(
          (sum, v, i) =>
            sum +
            (v -
              (1 +
                0.2 *
                  Math.cos(Math.PI * ((i % n) + 0.5) * dx) *
                  Math.exp(-(Math.PI ** 2) * actualTime))) **
              2,
          0,
        ) / field.length,
      ),
    );
  }
  assert.ok(errors[2] < errors[1] && errors[1] < errors[0]);
});
test("cell growth reproduces the independently integrated Hill-rate area law and daughters conserve area", () => {
  const { config, model } = cases[0],
    p = {
      ...config.params,
      diffusion: 0,
      decay: 0,
      growthMin: 0,
      growthMax: 0.04,
      threshold: 1e-6,
    };
  let s = model.initial(p, 17);
  s.cells = s.cells.filter((c) => !c.producer).slice(0, 1);
  s.cells[0].signal = 1;
  s.cells[0].area = Math.PI;
  const initial = s.cells[0].area;
  for (let i = 0; i < 20; i++) s = model.step(s, p);
  assert.ok(
    Math.abs(
      s.cells.reduce((sum, c) => sum + c.area, 0) -
        initial * Math.exp(0.04 * 10),
    ) < 1e-8,
  );
  for (let i = 0; i < 30; i++) s = model.step(s, p);
  assert.ok(s.divisions > 0);
  assert.ok(new Set(s.cells.map((c) => c.id)).size === s.cells.length);
  assert.ok(s.cells.some((c) => c.parentId));
});
test("water and sediment remain accounted after rainfall, terrain edits and export", () => {
  const { config, model } = cases[1];
  let s = model.initial(config.params, 17);
  s = model.apply(s, { kind: "channel", x: 12, y: 12 }, config.params);
  for (let i = 0; i < 500; i++) s = model.step(s, config.params);
  const metrics = model.metrics(s, config.params);
  assert.ok(Math.abs(metrics.waterResidual) < 1e-8);
  assert.ok(Math.abs(metrics.sedimentResidual) < 1e-8);
  assert.ok(s.water.every((v) => v >= 0) && s.sediment.every((v) => v >= 0));
  assert.ok(metrics.sedimentExport > 0);
  const original = model.initial(config.params, 17);
  assert.ok(s.height.some((v, i) => Math.abs(v - original.height[i]) > 1e-4));
});
test("phase-field latent heat conserves enthalpy, with thermal interventions accounted separately", () => {
  const { config, model } = cases[2];
  let s = model.initial(config.params, 17);
  const before = model.metrics(s, config.params);
  s = model.apply(
    s,
    { kind: "thermal", x: 0.8, temperature: -0.75 },
    config.params,
  );
  for (let i = 0; i < 200; i++) s = model.step(s, config.params);
  const after = model.metrics(s, config.params);
  assert.ok(Math.abs(after.enthalpyResidual) < 1e-10);
  assert.ok(after.solidArea > before.solidArea);
  assert.ok(
    s.phase.every((v) => v >= 0 && v <= 1) &&
      s.temperature.every(Number.isFinite),
  );
});
test("phase-field timestep refinement converges for the same geometry and elapsed time", () => {
  const { config, model } = cases[2],
    values = [];
  for (const divisor of [1, 2, 4]) {
    const p = { ...config.params, step: config.params.step / divisor };
    let s = model.initial(p, 17);
    for (let i = 0; i < 100 * divisor; i++) s = model.step(s, p);
    values.push(model.metrics(s, p).solidArea);
  }
  assert.ok(Math.abs(values[2] - values[1]) < Math.abs(values[1] - values[0]));
});
for (const { config, model } of cases)
  test(`${config.id} validates WorldSpec, replay, perturbation baseline and rejects altered model authority`, () => {
    let spec = program.create(config);
    const action = {
      ...config.actions[0],
      x: (config.params.size * config.params.spacing) / 2,
      y: (config.params.size * config.params.spacing) / 2,
      atStep: 12,
    };
    delete action.label;
    spec = program.append(spec, action, config, model);
    const first = program.execute(spec, config, model, 40),
      second = program.execute(
        JSON.parse(world.serializeWorldSpec(spec)),
        config,
        model,
        40,
      );
    assert.deepEqual(first, second);
    assert.notDeepEqual(first.baseline, first.intervention);
    const original = program.execute(program.create(config), config, model, 40);
    assert.deepEqual(first.baseline, original.baseline);
    const edited = structuredClone(spec);
    edited.params.model.step *= 2;
    assert.throws(
      () => program.validate(world.finalizeWorldSpec(edited), config, model),
      /mismatch/,
    );
  });

test("river routing and erosion refine at a common elapsed time", () => {
  const { config, model } = cases[1],
    values = [];
  for (const divisor of [1, 2, 4]) {
    const params = { ...config.params, step: config.params.step / divisor };
    let state = model.initial(params, 17);
    for (let i = 0; i < 100 * divisor; i++) state = model.step(state, params);
    values.push(model.metrics(state, params));
  }
  for (const key of ["terrain", "sediment", "water"]) {
    assert.ok(
      Math.abs(values[2][key] - values[1][key]) <
        Math.abs(values[1][key] - values[0][key]),
    );
    assert.ok(
      Math.abs(values[2][key] - values[1][key]) /
        Math.max(1, Math.abs(values[2][key])) <
        0.002,
    );
  }
});
test("governed model identities and bounded parameters reject incompatible imports", () => {
  const { createHash } = require("node:crypto");
  for (const { config, model } of cases) {
    for (const source of config.modelSources) {
      const file = require("node:path").resolve(
        __dirname,
        "../public/simulatte/field-experiments",
        source.path,
      );
      assert.equal(
        createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
        source.sha256,
      );
    }
    assert.throws(() => model.validate({ ...config.params, size: 8.5 }));
    assert.throws(() => model.validate({ ...config.params, spacing: 0 }));
    assert.throws(() => program.create({ ...config, durationSteps: 20001 }));
    const spec = program.create(config),
      altered = structuredClone(spec);
    altered.dependencies.assets[0].sha256 = "0".repeat(64);
    assert.throws(
      () => program.validate(world.finalizeWorldSpec(altered), config, model),
      /contract_mismatch/,
    );
  }
});

test('tissue intervention preview and execution agree on footprint, preserve producer, and do not mutate inputs',()=>{
  const {config,model}=cases[0],state=model.initial(config.params,config.seed),before=structuredClone(state);
  const action={kind:'remove',x:state.source[0],y:state.source[1],atStep:0};
  const region=model.actionRegion(state,action),next=model.apply(state,action,config.params);
  assert.deepEqual(state,before);
  assert.equal(region.radius,3);
  assert.ok(region.affectedIds.length>0);
  assert.equal(next.removed,region.affectedIds.length);
  assert.ok(next.cells.some(cell=>cell.producer));
  assert.ok(next.cells.every(cell=>!region.affectedIds.includes(cell.id)));
  assert.equal(model.actionRegion(state,{kind:'boundary',x:2,y:16}).available,false);
});
test('tissue branches share a camera fit and region picking inverts the actual viewport transform',()=>{
  const drawing=require('../public/simulatte/field-experiments/drawing.js');
  const {config,model}=cases[0],state=model.initial(config.params,17);
  const bounds=drawing.cellBounds([state,state],{id:'region',worldX:24,worldY:15});
  assert.ok(bounds.span>=16);
  const margin=20,scale=10,point={worldX:24,worldY:15};
  const selected=drawing.pick({view:'cells',hits:[],extent:32,margin,scale,origin:bounds.origin},margin+(point.worldX-bounds.origin[0])*scale,margin+(point.worldY-bounds.origin[1])*scale);
  assert.equal(selected.worldX,point.worldX);assert.equal(selected.worldY,point.worldY);
});


test('visible fixed-step replay applies zero-step and terminal-boundary actions exactly once', () => {
  const config=require('../public/data/field-experiments/river-formation.json');
  const program=require('../public/simulatte/field-experiments/program.js');
  const model=require('../public/shared/core/simulation/river-erosion.js');
  let spec=program.create(config);
  for(const atStep of [0,4])spec=program.append(spec,{kind:'ridge',x:10,y:10,atStep},config,model);
  let pair=program.execute(spec,config,model,0);
  for(let i=0;i<4;i++)pair=program.advance(pair,spec,model);
  assert.deepEqual(pair,program.execute(spec,config,model,4));
});

test('terrain framing fits real elevation, every yaw and a non-square viewport', () => {
  const drawing=require('../public/simulatte/field-experiments/drawing.js');
  const {config,model}=cases[1],state=model.initial(config.params,config.seed);
  const ctx=new Proxy({scale(){},get fillStyle(){return '';},set fillStyle(v){}},{get:(object,key)=>key in object?object[key]:()=>{}});
  const canvas={clientWidth:390,clientHeight:260,getContext:()=>ctx};
  const style={getPropertyValue:()=> '#222'};
  for(const yaw of [-2.7,-1.3,0,.65,2.1])for(const top of [false,true]) {
    const frame=drawing.draw(canvas,config,state,null,yaw,{top,style});
    assert.ok(frame.bounds.left>=frame.margin-1e-8 && frame.bounds.right<=frame.width-frame.margin+1e-8);
    assert.ok(frame.bounds.top>=frame.margin-1e-8 && frame.bounds.bottom<=frame.height-frame.margin+1e-8);
    assert.ok(frame.bounds.right-frame.bounds.left>frame.width*.25,'Terrain occupies useful bounds');
  }
});
test('empty tissue bounds remain finite after removal and include cell radii',()=>{
  const drawing=require('../public/simulatte/field-experiments/drawing.js');
  const empty=drawing.cellBounds([{cells:[]}]);assert.ok(empty.origin.every(Number.isFinite));
  const bounds=drawing.cellBounds([{cells:[{x:0,y:0,area:Math.PI*100}]}]);
  assert.ok(bounds.origin[0]<=-10&&bounds.origin[0]+bounds.span>=10);
});

test('terrain zoom out makes the rendered terrain smaller without changing model state',()=>{
  const drawing=require('../public/simulatte/field-experiments/drawing.js');
  const {config,model}=cases[1],state=model.initial(config.params,config.seed),before=structuredClone(state);
  const ctx=new Proxy({}, {get:()=>()=>{}}),canvas={clientWidth:390,clientHeight:260,getContext:()=>ctx};
  const span=config.params.size*config.params.spacing,style={getPropertyValue:()=> '#222'};
  const initial=drawing.draw(canvas,config,state,null,.65,{style,bounds:{origin:[0,0],span}});
  const wider=drawing.draw(canvas,config,state,null,.65,{style,bounds:{origin:[-span/2,-span/2],span:span*2}});
  assert.ok(wider.bounds.right-wider.bounds.left<(initial.bounds.right-initial.bounds.left)*.75);
  assert.deepEqual(state,before);
});

test('field failures preserve both accepted branches and recover explicitly without retrying each frame',async()=>{
  const vm=require('node:vm'),path=require('node:path'),{webcrypto}=require('node:crypto');
  const config=cases[2].config,sourceModel=cases[2].model;
  let numericalFailure=false,renderFailure=false,metricFailure=false,modelCalls=0,drawCalls=0,callback;
  const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}})}, {get:(obj,key)=>key in obj?obj[key]:()=>{}});
  class Node {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.dataset={};this.attrs={};this.clientWidth=320;this.clientHeight=320;this.value='1';this.published=0;}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=[...nodes];}
    addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
    setAttribute(key,value){this.attrs[key]=value;}
    querySelectorAll(){return this.children.filter(node=>node.tagName==='BUTTON');}
    closest(){return this;}
    getContext(){return new Proxy(ctx,{get:(obj,key)=>key==='drawImage'?()=>this.published++:obj[key]});}
    click(){for(const fn of this.listeners.click||[])fn({});}
  }
  const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,new Node(id==='scene'||id==='baseline'?'canvas':'div'));return nodes.get(id);};
  for(const mode of ['overview','top']){const button=new Node('button');button.dataset.view=mode;el('camera-views').append(button);}
  const model={...sourceModel,step(...args){modelCalls++;if(numericalFailure)throw Error('injected numerical failure');return sourceModel.step(...args);},metrics(...args){const values=sourceModel.metrics(...args);return metricFailure?{...values,solidArea:Infinity}:values;}};
  const drawing=require('../public/simulatte/field-experiments/drawing.js');
  const document={getElementById:el,createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text}),body:{dataset:{}},baseURI:'http://localhost/simulatte/field-experiments/',addEventListener(){},hidden:false};
  const context={document,location:{pathname:'/crystal-foundry'},performance:{now:()=>1000},AbortController,URL,URLSearchParams,structuredClone,crypto:webcrypto,
    getComputedStyle:()=>({getPropertyValue:()=> '#222'}),requestAnimationFrame:fn=>{callback=fn;return 1;},cancelAnimationFrame(){},addEventListener(){},
    SimulattePublicRoutes:{forPath:()=>({experimentId:config.id})},SimulatteFieldExperimentProgram:program,SimulatteWorldSpec:world,
    SimulatteFieldExperimentDrawing:{...drawing,draw(...args){drawCalls++;if(renderFailure)throw Error('injected rendering failure');return drawing.draw(...args);}},
    SimulatteSimulationClock:require('../public/simulatte/platform/runtime/simulation-clock.js'),[config.model]:model,
    fetch:async url=>{if(String(url).endsWith(config.id+'.json'))return {ok:true,json:async()=>structuredClone(config)};
      const file=path.join(__dirname,'../public',new URL(url).pathname);return {ok:true,arrayBuffer:async()=>{const b=fs.readFileSync(file);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}};}};
  await vm.runInNewContext(fs.readFileSync(__dirname+'/../public/simulatte/field-experiments/app.js','utf8'),context);
  const beforeZoom=context.__fieldExperimentSnapshot();
  assert.equal(context.SimulatteFieldView.canZoom(2),true);
  context.SimulatteFieldView.zoom(2);
  const afterZoom=context.__fieldExperimentSnapshot();
  assert.equal(afterZoom.camera.bounds.span,beforeZoom.camera.bounds.span*2);
  assert.equal(afterZoom.stateHash,beforeZoom.stateHash);
  callback(0);callback(100);
  for(const type of ['numerical','renderer','metrics','action-renderer']) {
    const previous=context.__fieldExperimentSnapshot(),visible=el('scene').published;
    if(type==='numerical')numericalFailure=true;else if(type==='metrics')metricFailure=true;else renderFailure=true;
    if(type==='action-renderer')el('actions').children[0].click();else callback(200);
    assert.equal(context.document.body.dataset.executionState,'failed');
    assert.equal(el('pause').textContent,'Retry accepted run');
    assert.equal(context.__fieldExperimentSnapshot().stateHash,previous.stateHash);
    assert.equal(context.__fieldExperimentSnapshot().specHash,previous.specHash);
    assert.equal(el('scene').published,visible,'Failed drawing never replaces the visible scene');
    const calls=[modelCalls,drawCalls];callback(250);callback(300);
    assert.deepEqual([modelCalls,drawCalls],calls,'Failed execution is quiescent, not retried every animation frame');
    numericalFailure=false;renderFailure=false;metricFailure=false;el('pause').click();
    assert.equal(context.__fieldExperimentError,null);
    assert.equal(context.__fieldExperimentSnapshot().stateHash,previous.stateHash);
    assert.equal(context.__fieldExperimentSnapshot().specHash,previous.specHash);
    assert.equal(context.__fieldExperimentState.running,true);
    assert.equal(el('pause').textContent,'Pause');
  }
});
