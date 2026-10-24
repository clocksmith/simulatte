'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js'),O=require('../public/simulatte/system-diagram/engine-observability.js');
const library=require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname,'../public/data/system-diagram')),config=require('../public/data/system-diagram/config.json'),kernels=require('../public/simulatte/system-diagram/kernels-all.js');
const deps={library,config,kernels},plans=require('./fixtures/system-diagram-rich-journeys.json').families,clone=v=>JSON.parse(JSON.stringify(v));
function run(plan,repair,remap=false,probe=null){
 const map=new Map([...plan.nodes,...plan.edges].map((n,i)=>[n.id,remap?`editor-${i+1}`:n.id]));
 const diagram=D.emptyDiagram(config,plan.label);diagram.seed=plan.seed;diagram.run.horizonSec=plan.horizonSec;
 diagram.nodes=plan.nodes.map((n,i)=>({id:map.get(n.id),classId:n.classId,label:n.id,x:i%4*240,y:Math.floor(i/4)*180,params:{...n.params,...(repair?plan.repair.nodes[n.id]:{}),...(probe?plan[probe]?.nodes[n.id]:{})}}));
 diagram.edges=plan.edges.map(e=>({id:map.get(e.id),from:{nodeId:map.get(e.from),portId:e.fromPort},to:{nodeId:map.get(e.to),portId:e.toPort},params:e.params}));diagram.faults=plan.faults.map((f,i)=>({...clone(f),id:`fault-${i+1}`,target:{...f.target,id:map.get(f.target.id)}}));
 const compiled=D.compile(diagram,library,config),state=E.initialize(compiled,deps);E.advance(compiled,state,plan.horizonSec,deps);return {diagram,map,compiled,state,view:E.observe(compiled,state,deps)};
}
function subset(actual,expected,label){for(const [k,v]of Object.entries(expected)){if(v&&typeof v==='object'&&!Array.isArray(v))subset(actual[k],v,label+'.'+k);else assert.equal(actual[k],v,label+'.'+k);}}
function expect(r,expected){const {nodes,...metrics}=expected;assert.equal(r.view.error,null);subset(r.view.global,metrics,'global');for(const [id,n]of Object.entries(nodes||{}))subset(r.view.nodes[r.map.get(id)],n,id);assert.ok(O.reconcile(r.state));assert.equal(r.view.global.memoryMiB,0);}
for(const plan of plans)test(`${plan.id}: rich blank-authored flow executes all declared stages, outage recovery and exact pending-work restoration`,()=>{
 const baseline=run(plan,false),repair=run(plan,true);expect(baseline,plan.expected.baseline);expect(repair,plan.expected.repair);
 assert.deepEqual(baseline.view.requests.map(r=>[r.id,r.arrival,r.sourceId,r.input]),repair.view.requests.map(r=>[r.id,r.arrival,r.sourceId,r.input]));assert.deepEqual(baseline.diagram.faults,repair.diagram.faults);
 for(const variant of [false,true]){const r=variant?repair:baseline;expect(run(plan,variant,true),plan.expected[variant?'repair':'baseline']);const state=E.initialize(r.compiled,deps);E.advance(r.compiled,state,plan.checkpointAtSec,deps);assert.ok(Object.keys(state.jobs).length>0||state.heap.length>0);const restored=clone(state);E.advance(r.compiled,restored,plan.horizonSec,deps);assert.deepEqual(restored,r.state);}
 for(const id of plan.nodes.filter(n=>!['source','crawler'].includes(n.id)).map(n=>n.id))assert.ok(repair.view.nodes[repair.map.get(id)].arrivals>0,id+' executes');
 assert.ok(baseline.view.requests.some(r=>r.status==='failed'||r.status==='rejected'));assert.ok(repair.view.log.some(row=>row.kind==='repair'));
 if(plan.id==='agent'){const malformed=run(plan,true,false,'malformedProbe');expect(malformed,plan.malformedProbe.expected);assert.equal(malformed.view.global.failedBy.invalid,2);const stale=run(plan,true,false,'staleProbe');expect(stale,plan.staleProbe.expected);assert.equal(stale.view.global.failedBy.unavailable,2);}
});
