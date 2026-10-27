'use strict';
// problems.json is the only authored public study registry. These files are compatibility exports.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'public/data/system-diagram');
const D=require('../../public/simulatte/system-diagram/diagram.js'),P=require('../../public/simulatte/system-diagram/problem-model.js');
const config=JSON.parse(fs.readFileSync(path.join(base,'config.json'))),library=require('../../public/simulatte/system-diagram/class-library.js').loadSync(base);
const data=P.validateCollection(JSON.parse(fs.readFileSync(path.join(base,'problems.json'))),library,config);
const generatedFrom='problems.json; node tools/simulatte/build-lucyd-compat.cjs';
const files=new Map(),old={schema:'simulatte.lucydProblems.v1',version:'1.2.0',generatedFrom,followupAttribution:data.followupAttribution,sources:{},problems:[]},journeys={schema:'simulatte.systemDiagramInterview.v1',generatedFrom,scenarios:{}},solutions={schema:'simulatte.interviewSolutions.v1',version:'1.1.0',generatedFrom,solutions:{}};
for(const p of data.problems){const c=p.compatibility;if(!c)continue;
 if(c.registry==='interview-problems'){
  if(p.provenance.sourceId)old.sources[p.provenance.sourceId]=p.provenance.source;
  old.problems.push({id:p.id,title:p.title,...(p.attribution?{company:p.attribution.company}:{}),sourceId:p.provenance.sourceId,sourceKind:p.provenance.kind,problemStatement:p.description,steps:p.followups.map(f=>({name:f.title,interviewerPrompt:f.prompt})),...(c.solutionId?{solutionId:c.solutionId}:{})});
  if(c.solutionId){const s=p.solutions.find(s=>s.id===c.solutionId);solutions.solutions[s.id]={id:s.id,title:s.title,boundary:s.boundary,steps:s.stages.map((st,i)=>{const diagramPath=`/data/system-diagram/solutions/${p.id}/step-${i+1}.json`;files.set(diagramPath.slice('/data/system-diagram/'.length),st.diagram);return {name:st.title,explanation:st.explanation,diagramPath};})};}
 }
 if(c.registry==='interview-journeys'){
  const stages=p.solutions[0].stages;
  journeys.scenarios[p.id]={id:p.id,title:p.title,subtitle:p.studyContext?.subtitle||p.title,targetQps:p.studyContext?.targetQps||'Bounded synthetic demand',problemStatement:p.description,steps:stages.map((st,i)=>({stepNumber:i+1,name:st.title,stage:st.studyPhase||st.title,interviewerPrompt:st.challenge||p.description,solution:st.explanation,tradeoffs:st.tradeoffs||[p.solutions[0].boundary],activeNodes:st.diagram.nodes.map(n=>n.id),customEdges:st.diagram.edges,highlightNodes:st.highlightNodes||[],diagram:st.diagram}))};
 }
 if(c.examplePath){const s=p.solutions[0],diagram=c.masterDiagram||s.stages.at(-1).diagram;files.set(c.examplePath.replace('/data/system-diagram/',''),diagram);}
}
files.set('interview-problems.json',old);files.set('interview-journeys.json',journeys);files.set('interview-solutions.json',solutions);
let changed=0;for(const [relative,value]of files){const dest=path.join(base,relative),text=JSON.stringify(value,null,2)+'\n';if(fs.existsSync(dest)&&fs.readFileSync(dest,'utf8')===text)continue;changed++;if(process.argv.includes('--check'))throw Error(`Stale Lucyd compatibility export: ${relative}`);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}
console.log(`Lucyd compatibility exports ${process.argv.includes('--check')?'verified':'generated'}: ${files.size} files, ${changed} changed`);
