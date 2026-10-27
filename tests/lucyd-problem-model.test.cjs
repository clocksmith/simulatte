'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'../public/data/system-diagram'),C=require('../public/data/system-diagram/config.json'),L=require('../public/simulatte/system-diagram/class-library.js').loadSync(base),D=require('../public/simulatte/system-diagram/diagram.js'),P=require('../public/simulatte/system-diagram/problem-model.js'),E=require('../public/simulatte/system-diagram/engine.js'),K=require('../public/simulatte/system-diagram/kernels-all.js'),data=require('../public/data/system-diagram/problems.json');
const deps={library:L,config:C,kernels:K};
test('canonical public model covers sourced exercises and executes every exact stage deterministically',()=>{
 const collection=P.validateCollection(data,L,C);assert.equal(collection.problems.length,31);
 const sourced=collection.problems.filter(p=>['candidate-reported','company-published'].includes(p.provenance.kind));assert.equal(sourced.length,8);assert.ok(sourced.every(p=>p.solutions.length>0));
 let stages=0;for(const p of collection.problems)for(const solution of p.solutions)for(const stage of solution.stages){if(stage.kind==='design'){assert.equal(stage.diagram.schema,D.DESIGN_SCHEMA);continue;}const c=D.compile(stage.diagram,L,C),a=E.initialize(c,deps),b=E.initialize(c,deps);E.advance(c,a,c.horizonSec,deps);E.advance(c,b,c.horizonSec,deps);const view=E.observe(c,a,deps);assert.equal(view.error,null,p.id+'/'+stage.id);assert.ok(view.global.completed>0,p.id+'/'+stage.id+' performs useful work');assert.deepEqual(a,b,p.id+'/'+stage.id+' replays exactly');stages++;}assert.equal(stages,224);
});
test('comparison stages retain explicit seeded configured demand without claiming matching closed-loop arrivals',()=>{
 for(const p of data.problems)for(const s of p.solutions)if(s.stages.length>1){assert.match(s.workload.comparison,/Closed-loop/);for(const stage of s.stages){if(stage.kind==='design')continue;const workload=stage.workload||s.workload;assert.equal(stage.diagram.seed,workload.seed);assert.equal(stage.diagram.run.horizonSec,workload.horizonSec);for(const expected of workload.sources){const actual=stage.diagram.nodes.find(n=>n.id===expected.id);assert.ok(actual);assert.equal(actual.classId,expected.classId);assert.deepEqual(actual.params,expected.params);}}}
});
test('private legacy payload normalizes into the same branches and exact-stage model',()=>{
 const old={schema:'simulatte.privatePracticeCollection.v1',title:'Private fixture',notesMarkdown:'# Test notes',provenanceNote:'Authored fixture',exercises:[{id:'fixture',title:'Practice',prompt:'Describe a system.',boundary:'Synthetic fixture',diagram:D.emptyDiagram(C)}]};
 const normalized=P.normalizePrivate(old,L,C);assert.equal(normalized.schema,P.SCHEMA);assert.equal(normalized.notesMarkdown,old.notesMarkdown);assert.deepEqual(normalized.problems[0].solutions[0].stages[0].diagram,old.exercises[0].diagram);assert.deepEqual(P.normalizePrivate(normalized,L,C),normalized);
});
test('ambiguous IDs, missing branches and false provenance are refused before registration',()=>{
 const duplicate=structuredClone(data);duplicate.problems.push(duplicate.problems[0]);assert.throws(()=>P.validateCollection(duplicate,L,C),/unique IDs/);
 const badSource=structuredClone(data);badSource.problems[0].provenance.source.kind='authored-practice';assert.throws(()=>P.validateCollection(badSource,L,C),/provenance/);
 const duplicateStage=structuredClone(data);const s=duplicateStage.problems.find(p=>p.solutions.length).solutions[0];s.stages.push(s.stages[0]);assert.throws(()=>P.validateCollection(duplicateStage,L,C),/unique stage IDs/);
});
test('private authored normalization refuses conceptual-stage relabeling, while encrypted drafts retain v5 exactly',async()=>{
 const Crypto=require('../public/simulatte/system-diagram/private-crypto.js'),design=D.addConcept(D.emptyDiagram(C),{label:'Inventory sketch',x:0,y:0},L,C).diagram;
 const collection={schema:P.SCHEMA,problems:[{id:'fixture',title:'Fixture',description:'A practice system.',provenance:{kind:'authored-practice'},followups:[],solutions:[{id:'s',title:'Sketch',boundary:'Unbound',stages:[{id:'stage',title:'Stage',explanation:'Sketch',diagram:design}]}]}]};assert.throws(()=>P.normalizePrivate(collection,L,C),/keep conceptual designs in encrypted draft saves/);
 const payload={schema:'simulatte.privateDiagram.v1',diagram:design,studyState:{own:[['private:fixture:0',design]],branches:[]}},envelope=await Crypto.encrypt(payload,'synthetic-fixture-password'),session=await Crypto.unlock(envelope,'synthetic-fixture-password');try{assert.deepEqual(session.value,payload);assert.deepEqual(D.validate(session.value.diagram,L,C),design);assert.throws(()=>D.compile(session.value.diagram,L,C),/Unbound/);}finally{session.lock();}
});

test('published curriculum refuses missing solutions, short walks and stages distinguished only by layout',()=>{
 const short=structuredClone(data);short.problems[0].solutions[0].stages.pop();assert.throws(()=>P.validateCollection(short,L,C),/eight substantive stages/);
 const empty=structuredClone(data);empty.problems[0].solutions=[];assert.throws(()=>P.validateCollection(empty,L,C),/authored solution/);
 const repeated=structuredClone(data),s=repeated.problems[0].solutions[0];s.stages[3].diagram=structuredClone(s.stages[2].diagram);s.stages[3].diagram.name='Another title';s.stages[3].diagram.nodes[0].x+=100;assert.throws(()=>P.validateCollection(repeated,L,C),/Repeated behavior or design/);
});
test('observation checks use actual final state and cannot pass through unsafe object paths',()=>{
 const Study=require('../public/simulatte/system-diagram/study-contract.js'),check={label:'Committed value',path:['nodes','a','records','commands'],where:{index:1},field:['result','value'],op:'eq',value:3};
 assert.equal(Study.evaluate(check,null).status,'pending');const view={done:false,nodes:{a:{records:{commands:[{index:1,result:{value:3}}]}}}};assert.equal(Study.evaluate(check,view).status,'running');view.done=true;assert.equal(Study.evaluate(check,view).status,'passed');view.nodes.a.records.commands[0].result.value=4;assert.equal(Study.evaluate(check,view).status,'failed');assert.throws(()=>Study.validate({...check,path:['__proto__']}),/Invalid/);
});
