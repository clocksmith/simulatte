'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js'),O=require('../public/simulatte/system-diagram/engine-observability.js');
const library=require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname,'../public/data/system-diagram'));
const config=require('../public/data/system-diagram/config.json'),kernels=require('../public/simulatte/system-diagram/kernels-all.js');
const deps={library,config,kernels},plans=require('./fixtures/system-diagram-blank-journeys.json').families;
const clone=v=>JSON.parse(JSON.stringify(v));
// These authoring plans start with an empty graph. They neither read presets nor write runtime state.
function authored(plan,repair=false,remap=false){
 const map=new Map([...plan.nodes,...plan.edges].map((row,i)=>[row.id,remap?`authored-${i+1}`:row.id]));
 const d=D.emptyDiagram(config,plan.label);d.id=`blank-${plan.id}`;d.seed=plan.seed;d.run.horizonSec=plan.horizonSec;
 d.nodes=plan.nodes.map((n,i)=>({id:map.get(n.id),classId:n.classId,label:n.label||n.id,x:(i%3)*240,y:Math.floor(i/3)*180,params:{...n.params,...(repair?plan.repair.nodes[n.id]:{})}}));
 d.edges=plan.edges.map(e=>({id:map.get(e.id),from:{nodeId:map.get(e.from),portId:e.fromPort},to:{nodeId:map.get(e.to),portId:e.toPort},params:{...e.params,...(repair?plan.repair.edges?.[e.id]:{})}}));
 d.faults=plan.faults.map((f,i)=>({...clone(f),id:`fault-${i+1}`,target:{...f.target,id:map.get(f.target.id)}}));return {diagram:d,map};
}
function execute(plan,repair=false,remap=false){const {diagram,map}=authored(plan,repair,remap),compiled=D.compile(diagram,library,config),state=E.initialize(compiled,deps);E.advance(compiled,state,plan.horizonSec,deps);return {diagram,map,compiled,state,view:E.observe(compiled,state,deps)};}
function assertSubset(actual,expected,label){for(const [key,value]of Object.entries(expected)){if(value&&typeof value==='object'&&!Array.isArray(value))assertSubset(actual[key],value,`${label}.${key}`);else assert.equal(actual[key],value,`${label}.${key}`);}}
function outcomes(run,golden){const {nodes,...metrics}=golden;assert.equal(run.view.error,null);assertSubset(run.view.global,metrics,'global');for(const [id,fields]of Object.entries(nodes||{}))assertSubset(run.view.nodes[run.map.get(id)],fields,id);assert.equal(run.view.requests.length,golden.offered);assert.equal(run.view.global.inFlight,0);assert.ok(O.reconcile(run.state));}
function demand(view){return view.requests.map(r=>[r.id,r.sourceId,r.arrival,r.payloadType,r.deadline,r.input]);}

test('six blank authoring plans have explicit independent numerical derivations and no preset document imports',()=>{
 assert.deepEqual(plans.map(p=>p.id).sort(),['agent','finance','healthcare','lakehouse','replica','streaming']);
 for(const p of plans){assert.ok(p.derivation.length>80);assert.ok(p.nodes.length>=3&&p.nodes.length<=6);assert.ok(p.repair.nodes);assert.equal(p.seed,42);}
});
for(const plan of plans)test(`${plan.id}: independently expected blank baseline/repair outcomes survive ID allocation and exact checkpoints`,()=>{
 const baseline=execute(plan),repair=execute(plan,true);outcomes(baseline,plan.expected.baseline);outcomes(repair,plan.expected.repair);assert.deepEqual(demand(baseline.view),demand(repair.view),'repair preserves exact workload and fault timing');assert.deepEqual(baseline.diagram.faults,repair.diagram.faults);
 for(const mode of [false,true]){const r=mode?repair:baseline,changedIds=execute(plan,mode,true);outcomes(changedIds,plan.expected[mode?'repair':'baseline']);
  const state=E.initialize(r.compiled,deps);E.advance(r.compiled,state,.015,deps);const cp=clone(state);E.advance(r.compiled,cp,plan.horizonSec,deps);assert.deepEqual(cp,r.state,'serialized pending jobs, receipts, timers, RNG and causal records reproduce');
 }
 if(plan.id==='finance'){assert.equal(baseline.view.requests.filter(r=>r.blockers.some(b=>b.kind==='awaiting-counterpart')).length,2);assert.equal(repair.view.global.memoryMiB,0);}
 if(plan.id==='lakehouse'){const sum=r=>Object.values(r.state.kernel.window.windows).reduce((n,w)=>n+w.sum,0);assert.equal(sum(baseline),200);assert.equal(sum(repair),400);assert.ok(repair.state.kernel.shuffle.spillKb>0);}
 if(plan.id==='replica'){assert.equal(baseline.view.global.unknownEffects,1);assert.equal(repair.view.global.unknownEffects,0);assert.ok(baseline.view.requests[0].blockers.some(b=>b.kind==='replication-outbox'));for(const r of [baseline,repair]){const down=r.view.requests.find(q=>Math.abs(q.arrival-.4)<1e-8),after=r.view.requests.find(q=>Math.abs(q.arrival-.8)<1e-8);assert.equal(down.err,'down');assert.equal(after.status,'completed');assert.ok(after.completedAt>.7);}}
 const sample=baseline.view.requests.find(r=>r.status!=='completed')||baseline.view.requests[0],info=E.inspect(baseline.compiled,baseline.state,sample.id,deps);assert.ok(info.history.length>1);assert.ok(info.attempts.length>0);
});
