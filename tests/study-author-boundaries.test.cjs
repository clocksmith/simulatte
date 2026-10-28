'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {problem,contract,component,builder}=require('../tools/simulatte/study-solution-author.cjs');
function fixture(){
 const p=problem('L001','Boundary routing','Nested instances',[],[]),cid=contract(p,'work',{task:'string'},{done:'boolean'});
 for(const [id,kind]of [['caller','client'],['outer','service'],['control','service'],['worker','worker']])component(p,id,id,kind,'Own '+id,[]);
 const b=builder(p,'nested','Nested instances','Explicit routing',[],[]),add=(title,fn)=>b.stage(title,title,title,fn,['Preserve endpoints'],[]);
 add('Outer boundary',s=>{s.add('caller','caller');s.add('outer','outer');});
 add('Control boundary',s=>s.expand('outer','outer-binding',[['control','control']],[],[]));
 add('Two workers',s=>s.expand('control','control-binding',[['worker-a','worker'],['worker-b','worker']],[],[]));
 add('First worker',s=>{s.link('a-out','worker-a','caller',cid);s.link('a-in','caller','worker-a',cid);});
 add('Second worker',s=>{s.link('b-out','worker-b','caller',cid);s.link('b-in','caller','worker-b',cid);});
 add('Reuse second exposure',s=>s.link('b-again','worker-b','caller',cid));return p;
}
function leaf(p,g,endpoint){let result=endpoint;const visited=new Set();while(true){const n=g.nodes.find(n=>n.id===result.nodeId);assert.ok(n);if(!n.subsystemId)return result;assert.ok(!visited.has(n.id));visited.add(n.id);const sub=p.subsystems.find(s=>s.id===n.subsystemId),port=sub.ports.find(q=>q.id===result.portId);assert.ok(port);result=port.target;}}
test('nested boundary exposure distinguishes sibling workers for both input and output',()=>{
 const p=fixture(),stages=p.solutions[0].stages,g=stages.at(-1).graph;
 for(const [id,side,expected]of [['a-out','from','worker-a'],['a-in','to','worker-a'],['b-out','from','worker-b'],['b-in','to','worker-b']]){const e=g.edges.find(e=>e.id===id);assert.equal(leaf(p,g,e[side]).nodeId,expected,id);}
 const old=stages[3].graph.edges.find(e=>e.id==='a-out'),now=g.edges.find(e=>e.id==='a-out');assert.deepEqual(now,old);assert.equal(leaf(p,g,old.from).nodeId,'worker-a');
});
test('repeated endpoint reuses its exposure and deterministic builds preserve identities',()=>{
 const p=fixture(),g=p.solutions[0].stages.at(-1).graph;assert.deepEqual(g.edges.find(e=>e.id==='b-again').from,g.edges.find(e=>e.id==='b-out').from);assert.deepEqual(fixture(),p);
});
