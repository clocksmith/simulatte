(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./diagram.js'):root.SimulatteSystemDiagramDocument);if(node)module.exports=api;else root.SimulatteLucydProblems=api;})(globalThis,function(D){
 'use strict';
 const SCHEMA='simulatte.lucydProblems.v2',KINDS=['company-published','candidate-reported','authored-practice','custom'];
 const clone=v=>structuredClone(v),id=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9._-]{0,119}$/.test(value);
 function text(v,name,max=4000){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`Lucyd ${name} must be nonempty text under ${max} characters`);}
 function validateCollection(value,library,config){
  if(value?.schema!==SCHEMA||!Array.isArray(value.problems))throw Error('Lucyd requires a v2 problem collection');
  const result=clone(value),ids=new Set();
  for(const p of result.problems){
   if(!id(p.id)||ids.has(p.id))throw Error('Lucyd problems require unique IDs');ids.add(p.id);text(p.title,'title',180);text(p.description,'description',2000);
   if(!KINDS.includes(p.provenance?.kind))throw Error(`Problem ${p.id} requires classified provenance`);
   if(p.provenance.source){const source=p.provenance.source;let secure=false;try{secure=new URL(source.url).protocol==='https:';}catch{}if(!secure||source.kind!==p.provenance.kind)throw Error(`Problem ${p.id} has invalid source provenance`);}
   if(['company-published','candidate-reported'].includes(p.provenance.kind)&&!p.provenance.source)throw Error(`Problem ${p.id} requires a source`);
   if(p.attribution!==undefined)text(p.attribution.company,'company attribution',180);
   if(!Array.isArray(p.followups)||new Set(p.followups.map(f=>f.id)).size!==p.followups.length||p.followups.some(f=>!id(f.id)||typeof f.title!=='string'||!f.title.trim()||typeof f.prompt!=='string'||!f.prompt.trim()))throw Error(`Problem ${p.id} needs ordered followups`);
   if(!Array.isArray(p.solutions))throw Error(`Problem ${p.id} needs an explicit solutions array`);
   const solutions=new Set();
   for(const s of p.solutions){
    if(!id(s.id)||solutions.has(s.id))throw Error(`Problem ${p.id} needs unique solution IDs`);solutions.add(s.id);text(s.title,'solution title',180);text(s.boundary,'solution boundary');
    if(!Array.isArray(s.stages)||!s.stages.length)throw Error(`Solution ${s.id} needs ordered stages`);
    const stages=new Set();
    for(const stage of s.stages){if(!id(stage.id)||stages.has(stage.id))throw Error(`Solution ${s.id} needs unique stage IDs`);stages.add(stage.id);text(stage.title,'stage title',180);text(stage.explanation,'stage explanation');stage.diagram=D.validate(stage.diagram,library,config);if(stage.diagram.schema!==D.SCHEMA)throw Error('Authored study stages require an exact v4 executable diagram');if(s.workload){if(stage.diagram.seed!==s.workload.seed||stage.diagram.run.horizonSec!==s.workload.horizonSec||!Array.isArray(s.workload.sources))throw Error('Stage does not match its configured workload');for(const source of s.workload.sources){const n=stage.diagram.nodes.find(n=>n.id===source.id);if(!n||n.classId!==source.classId||JSON.stringify(n.params)!==JSON.stringify(source.params))throw Error('Stage source differs from its configured workload: '+source.id);}}}
   }
  }
  return result;
 }
 function privateStageDiagram(value,library,config){const diagram=D.validate(value,library,config);if(diagram.schema===D.DESIGN_SCHEMA)throw Error('Authored solution stages require executable v4 diagrams; keep conceptual designs in encrypted draft saves');return {...diagram,schema:D.SCHEMA};}
 function normalizePrivate(value,library,config){
  if(value?.schema===SCHEMA){const copy=clone(value);for(const p of copy.problems||[])for(const s of p.solutions||[])for(const stage of s.stages||[])stage.diagram=privateStageDiagram(stage.diagram,library,config);return validateCollection(copy,library,config);}
  if(value?.schema!=='simulatte.privatePracticeCollection.v1'||!Array.isArray(value.exercises)||typeof value.notesMarkdown!=='string')throw Error('Unsupported private collection');
  return validateCollection({schema:SCHEMA,version:'2.0.0',title:value.title,notesMarkdown:value.notesMarkdown,provenanceNote:value.provenanceNote,problems:value.exercises.map(e=>({id:e.id,title:e.title,description:e.prompt,provenance:{kind:'authored-practice',note:value.provenanceNote||'Private authored exercise'},followups:[],solutions:[{id:'reference',title:e.title,boundary:e.boundary||'Synthetic private practice model',stages:[{id:'architecture',title:'Architecture',explanation:e.boundary||e.prompt,diagram:privateStageDiagram(e.diagram,library,config)}]}]}))},library,config);
 }
 return Object.freeze({SCHEMA,validateCollection,normalizePrivate});
});
