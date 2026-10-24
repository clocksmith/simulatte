const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const documentApi = require('../public/simulatte/system-diagram/diagram.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(__dirname, '../public/data/system-diagram'));
const deps = { library, config, kernels };
function example(id, edit = () => {}) {
  const diagram = structuredClone(require(`../public/data/system-diagram/examples/${id}.json`));
  edit(diagram); const compiled = documentApi.compile(diagram, library, config);
  return { diagram, compiled, state: engine.initialize(compiled, deps) };
}
function finish(run) { engine.advance(run.compiled, run.state, run.compiled.horizonSec, deps); return engine.observe(run.compiled, run.state, deps); }
function terminal(run) { const view = finish(run); assert.equal(view.error, null); assert.equal(view.global.offered, view.global.completed + view.global.failed + view.global.inFlight); return view; }

test('canonical kernel declarations all register actual behavior and every shipped class resolves', () => {
  assert.deepEqual(kernels.ids(), Object.keys(library.kernels).sort());
  assert.deepEqual(kernels.ids().sort(), Object.keys(library.kernels).sort(), 'every declared kernel has executable behavior and every behavior has an authoring declaration');
  for (const classId of library.classOrder) {
    const definition = library.classes[classId]; assert.ok(kernels.has(definition.kernel), classId);
  }
});

for (const id of ['web-service', 'rag-assistant', 'crawler-pipeline']) test(`${id} executes its composed kernels and serialized continuation equals uninterrupted execution`, () => {
  const a = example(id), b = example(id), view = terminal(a);
  engine.advance(b.compiled, b.state, 2.7, deps); const restored = JSON.parse(JSON.stringify(b.state));
  engine.advance(b.compiled, restored, b.compiled.horizonSec, deps);
  assert.deepEqual(restored, a.state, 'event ordering, RNG and owned work survive JSON serialization');
  assert.ok(view.global.offered > 0); assert.ok(view.global.completed > 0); assert.equal(view.global.inFlight, 0);
  assert.ok(view.global.attempts > view.global.offered);
  const allocated = Object.values(a.state.observability.allocations).reduce((sum, row) => sum + row.amount, 0);
  assert.ok(Math.abs(allocated - view.global.memoryMiB) < 1e-6);
  assert.ok(Math.abs(Object.values(view.nodes).reduce((sum, node) => sum + node.heldMiB, 0) - allocated) < 1e-6);
  assert.equal(view.requests.length, view.global.offered);
  const info = engine.inspect(a.compiled, a.state, view.requests[0].id, deps);
  assert.ok(info.attempts.length > 0); assert.ok(info.history.length > 2); assert.ok(info.history.some(row => row.causes.length));
  const historyIds = new Set(info.history.map(row => row.id));
  for (const row of info.history) for (const cause of row.causes) assert.ok(historyIds.has(cause), `Missing causal ancestor ${cause}`);
  if (id === 'web-service') {
    for (const name of ['api','cache','replicas','queue','worker','results','deadletters']) assert.ok(view.nodes[name].arrivals > 0, name);
    assert.ok(view.nodes.cache.detail.Hits > 0); assert.ok(view.nodes.queue.detail.redeliveries > 0);
    assert.ok(view.nodes.deadletters.detail.retained > 0); assert.ok(view.global.effects > 0);
  }
  if (id === 'rag-assistant') {
    for (const name of ['api','gpu','rag','embed-timing','candidates','generator','validation','ranker','chunks']) assert.ok(view.nodes[name].served > 0, name);
    assert.ok(view.nodes['embed-timing'].detail.embedded > 0);
    assert.ok(view.nodes.candidates.detail.upserts > 0); assert.ok(view.nodes.candidates.detail.queries > 0);
    assert.ok(view.nodes.candidates.detail.vectors > 100); assert.ok(view.nodes.ranker.detail.reranked > 0);
    assert.ok(view.nodes.chunks.detail.chunks > view.nodes.chunks.detail.documents);
    assert.ok(view.global.cost > 0);
    const jobs = view.requests.flatMap(request => engine.inspect(a.compiled, a.state, request.id, deps).jobs);
    assert.ok(jobs.some(j => j.nodeId === 'candidates' && j.msg.ptype === 'embedding'));
    assert.ok(jobs.some(j => j.nodeId === 'validation' && j.msg.ptype === 'text'));
    assert.ok(jobs.some(j => j.nodeId === 'chunks' && j.msg.ptype === 'document'));
    assert.equal(view.global.memoryMiB, 0);
  }
  if (id === 'crawler-pipeline') {
    assert.ok(view.nodes.crawler.detail['pages fetched'] > 0); assert.ok(view.nodes.schedule.detail.jobs > 0);
    for (const name of ['website','parser','validator','records','archive']) assert.ok(view.nodes[name].served > 0, name);
    assert.ok(view.global.effects > 0);
  }
});

test('rewiring RAG generation changes the executed graph and measured cost', () => {
  const full = example('rag-assistant'), bypass = example('rag-assistant', d => { d.edges.find(e => e.id === 'generate').to.nodeId = 'candidates'; });
  const a = terminal(full), b = terminal(bypass);
  assert.ok(a.nodes.generator.arrivals > 0); assert.equal(b.nodes.generator.arrivals, 0);
  assert.ok(a.global.cost > 0); assert.equal(b.global.cost, 0);
  assert.notDeepEqual(engine.metrics(full.compiled, full.state, deps), engine.metrics(bypass.compiled, bypass.state, deps));
});

test('failed GPU work reaches terminal requests without stranding batch siblings', () => {
  const run = example('rag-assistant', d => {
    d.nodes = d.nodes.filter(n => !['documents','chunks'].includes(n.id));
    d.edges = d.edges.filter(e => !['ingest','embed-chunks','index-chunks'].includes(e.id));
    d.nodes.find(n => n.id === 'questions').params = { pattern:'burst', burstAtSec:0, burstCount:6, burstSpacingMs:0, maxRequests:6, payload:'text', timeoutMs:1000, retries:0, tokensMean:5 };
    Object.assign(d.nodes.find(n => n.id === 'gpu').params, { maxBatch:4, batchWindowMs:5, batchBaseMs:20, perItemMs:1, errorRate:1 });
  });
  const view = terminal(run);
  assert.equal(view.global.offered, 6); assert.equal(view.global.completed, 0); assert.equal(view.global.failed, 6);
  assert.equal(view.nodes.gpu.busy, 0); assert.equal(view.nodes.gpu.queue, 0); assert.equal(view.global.memoryMiB, 0);
  assert.equal(view.requests.length, 6); assert.ok(view.requests.every(r => r.status !== 'in-flight'));
});

function sharedAccelerators(capacity, faults = []) {
  const diagram = {
    schema: documentApi.SCHEMA, id:'shared-accelerators', name:'Shared accelerator slots', seed:42, run:{horizonSec:1}, classes:[],
    nodes:[
      {id:'arrivals',classId:'nl-input',label:'Arrivals',x:0,y:0,params:{pattern:'burst',burstCount:2,burstAtSec:0,burstSpacingMs:0,maxRequests:2,retries:0,timeoutMs:1000,tokensMean:10}},
      {id:'gpu-a',classId:'gpu-worker',label:'GPU A',x:240,y:0,params:{maxBatch:1,batchWindowMs:0,batchBaseMs:100,perItemMs:0},groupId:'shared'},
      {id:'gpu-b',classId:'embedder',label:'Embedding GPU B',x:240,y:160,params:{workers:1,maxBatch:1,batchWindowMs:0,batchBaseMs:100,perKTokensMs:0},groupId:'shared'}
    ],
    edges:[['a','gpu-a'],['b','gpu-b']].map(([id,to])=>({id,from:{nodeId:'arrivals',portId:'out'},to:{nodeId:to,portId:'in'},params:{latencyMs:0,jitterMs:0}})),
    groups:[{id:'shared',label:'Shared accelerator budget',kind:'resource',capacity,x:200,y:-50,w:250,h:300}],notes:[],faults,view:{x:0,y:0,zoom:1}
  };
  const compiled=documentApi.compile(diagram,library,config);return {compiled,state:engine.initialize(compiled,deps)};
}

test('GPU batch and embedding workers consume the same executable resource-group slots', () => {
  const serial=sharedAccelerators(1),parallel=sharedAccelerators(2);
  engine.advance(serial.compiled,serial.state,.15,deps);engine.advance(parallel.compiled,parallel.state,.15,deps);
  const a=engine.observe(serial.compiled,serial.state,deps),b=engine.observe(parallel.compiled,parallel.state,deps);
  assert.equal(a.error,null);assert.equal(b.error,null);assert.equal(a.global.completed,1);assert.equal(b.global.completed,2);
  assert.equal(a.nodes['gpu-a'].busy+a.nodes['gpu-b'].busy,1);assert.equal(a.nodes['gpu-a'].queue+a.nodes['gpu-b'].queue,0);
  engine.advance(serial.compiled,serial.state,.3,deps);const done=engine.observe(serial.compiled,serial.state,deps);
  assert.equal(done.global.completed,2);assert.equal(done.nodes['gpu-a'].busy+done.nodes['gpu-b'].busy,0);
  assert.equal(Object.values(serial.state.observability.slots).reduce((n,v)=>n+Object.keys(v).length,0),0);
});

test('accelerator crash releases its shared slot and deferred wake starts the waiting peer', () => {
  const run=sharedAccelerators(1,[{id:'crash-a',atSec:.04,untilSec:.06,target:{kind:'node',id:'gpu-a'},type:'crash',params:{}}]);
  engine.advance(run.compiled,run.state,.15,deps);const view=engine.observe(run.compiled,run.state,deps);
  assert.equal(view.error,null);assert.equal(view.global.completed,1);assert.equal(view.global.failed,1);
  assert.equal(view.nodes['gpu-b'].queue,0);assert.equal(view.nodes['gpu-b'].busy,0);
});

test('memory-rejected and unfinished requests remain visible with model-owned causal blockers', () => {
  const rejected = sharedAccelerators(1);
  engine.applyControl(rejected.compiled, rejected.state, { kind:'setParams', target:{kind:'node',id:'gpu-a'}, params:{memoryLimitMiB:.001,memoryPerRequestMiB:1} }, deps);
  engine.advance(rejected.compiled,rejected.state,.3,deps);const a=engine.observe(rejected.compiled,rejected.state,deps);
  assert.equal(a.requests.length,2);assert.ok(a.requests.some(r=>r.status==='rejected'));assert.equal(a.global.failedBy.rejected,1);
  const request=a.requests.find(r=>r.status==='rejected'),info=engine.inspect(rejected.compiled,rejected.state,request.id,deps);
  assert.ok(info.history.some(row=>row.kind==='memory-rejected'));assert.equal(a.global.memoryMiB,0);
  const unfinished=sharedAccelerators(1);engine.advance(unfinished.compiled,unfinished.state,.02,deps);const b=engine.observe(unfinished.compiled,unfinished.state,deps);
  assert.equal(b.requests.length,2);assert.equal(b.global.inFlight,2);assert.ok(b.global.memoryMiB>0);
  assert.ok(b.requests.every(r=>r.blockers.length>0));
  const allocations=Object.values(unfinished.state.observability.allocations).reduce((sum,row)=>sum+row.amount,0);
  assert.ok(Math.abs(allocations-b.global.memoryMiB)<1e-6);
});
