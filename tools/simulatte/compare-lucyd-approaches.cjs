#!/usr/bin/env node
'use strict';
// Owner: Lucyd CATSCAN. Graph/observation evidence, not a production recommendation.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'public/data/system-diagram'),read=name=>JSON.parse(fs.readFileSync(path.join(base,name))),sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const D=require('../../public/simulatte/system-diagram/diagram.js'),P=require('../../public/simulatte/system-diagram/problem-model.js'),L=require('../../public/simulatte/system-diagram/class-library.js').loadSync(base),C=read('config.json'),E=require('../../public/simulatte/system-diagram/engine.js'),K=require('../../public/simulatte/system-diagram/kernels-all.js'),Crypto=require('../../public/simulatte/system-diagram/private-crypto.js'),deps={library:L,config:C,kernels:K};
function structure(compiled){
 let labels=Object.fromEntries(compiled.nodes.map(n=>[n.id,n.kernel]));
 // Bounded neighborhood refinement ignores names, positions, instance IDs and all numeric policies.
 for(let round=0;round<Math.min(compiled.nodes.length,6);round++){const prior=labels;labels=Object.fromEntries(compiled.nodes.map(n=>[n.id,sha([prior[n.id],compiled.edges.filter(e=>e.from===n.id).map(e=>[e.fromPort,e.toPort,prior[e.to]]).sort(),compiled.edges.filter(e=>e.to===n.id).map(e=>[e.toPort,e.fromPort,prior[e.from]]).sort()]) ]));}
 return sha(Object.values(labels).sort());
}
function metrics(view){return {offered:view.global.offered,completed:view.global.completed,failed:view.global.failed,inFlight:view.global.inFlight,p95Ms:view.global.latency?.p95??null,modelTimeSec:view.t,attempts:view.attempts.length,effects:view.global.effects};}
async function compare(password=process.env.LUCYD_PASSWORD){const report={schema:'simulatte.lucydApproachComparison.v1',publicHash:sha(fs.readFileSync(path.join(base,'problems.json'),'utf8')),privateCiphertextHash:sha(fs.readFileSync(path.join(base,'private-collection.enc.json'),'utf8')),boundary:'Fresh no-fault runs of each final architecture under declared workload contracts. Structural signatures distinguish implementations/topology, not pedagogical quality or production capacity.',problems:[],failures:[]};const collections=[['public',read('problems.json')]];let session;
 try{if(password){session=await Crypto.unlock(read('private-collection.enc.json'),password);collections.push(['private',session.value]);}
 for(const [scope,raw]of collections){let collection;try{collection=P.validateCollection(raw,L,C);}catch(error){if(scope==='private')throw Error('Encrypted collection validation failed; inspect locally');throw error;}for(const [problemIndex,p]of collection.problems.entries()){
  const row={scope,...(scope==='public'?{problemId:p.id}:{problemIndex}),approaches:[]};report.problems.push(row);
  for(const [solutionIndex,s]of p.solutions.entries()){const diagram=structuredClone(s.stages.at(-1).diagram);diagram.faults=[];const c=D.compile(diagram,L,C),state=E.initialize(c,deps);E.advance(c,state,c.horizonSec,deps);const view=E.observe(c,state,deps);if(view.error)throw Error('Final-stage engine failed');const sources=(s.stages.at(-1).workload||s.workload)?.sources;
   row.approaches.push({...(scope==='public'?{solutionId:s.id}:{solutionIndex}),runnableStages:s.stages.length,structureHash:structure(c),kernelCounts:Object.fromEntries([...new Set(c.nodes.map(n=>n.kernel))].sort().map(k=>[k,c.nodes.filter(n=>n.kernel===k).length])),workloadHash:sha({seed:diagram.seed,horizon:diagram.run.horizonSec,sources}),faultsInjected:0,metrics:metrics(view)});
  }
  if(new Set(row.approaches.map(a=>a.structureHash)).size!==row.approaches.length)report.failures.push({scope,...(scope==='public'?{problemId:p.id}:{problemIndex}),error:'Approaches have identical kernel topology; a numeric parameter or label change is not structural evidence'});
  row.identicalConfiguredSource=row.approaches.every(a=>a.workloadHash===row.approaches[0].workloadHash);if(scope==='private'){row.structurallyDistinct=new Set(row.approaches.map(a=>a.structureHash)).size===row.approaches.length;for(const a of row.approaches)for(const key of ['structureHash','kernelCounts','workloadHash','metrics'])delete a[key];}
 }}
 }finally{session?.lock();}return report;}
if(require.main===module)compare().then(report=>{const at=process.argv.indexOf('--output');if(at>=0){const file=path.resolve(process.argv[at+1]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify({problems:report.problems.length,approaches:report.problems.reduce((n,p)=>n+p.approaches.length,0),failures:report.failures},null,2));if(report.failures.length)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={compare,structure,metrics};
