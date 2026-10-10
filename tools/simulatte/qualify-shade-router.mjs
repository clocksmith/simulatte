import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),router=require('../../public/shared/plugins/sun-walker/shade-router.js');
const rows=[];
let seed=9187;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let fixture=0;fixture<64;fixture++) {
 const nodes=fixture<32?['A','C','D','E','F','B']:['A','C','D','E','F','G','H','I','B'],segments=[{id:'direct',fromNodeId:'A',toNodeId:'B',lengthM:10,threshold:5}];
 for(const a of nodes.filter(n=>n!=='B'))for(const b of nodes.filter(n=>n!=='A'))if(a!==b&&random()<(fixture<32?.35:.65))segments.push({id:a+b,fromNodeId:a,toNodeId:b,lengthM:Math.round((.2+random()*4)*100)/100,threshold:Math.round(random()*1000)/100});
 const worldModel={world:{segments},outgoing:id=>segments.filter(e=>e.fromNodeId===id),segment:id=>segments.find(e=>e.id===id)};
 const evaluateEdge=(s,t)=>({travelSeconds:s.lengthM,directSunSeconds:t<s.threshold?s.lengthM:0,unknownSeconds:0});
 for(const weight of [1,5,20]) {
  let reference=Infinity;
  const enumerate=(node,seen,time,cost)=>{if(node==='B'){reference=Math.min(reference,cost);return;}for(const e of worldModel.outgoing(node))if(!seen.has(e.toNodeId)){const q=evaluateEdge(e,time);enumerate(e.toNodeId,new Set([...seen,e.toNodeId]),time+e.lengthM,cost+q.travelSeconds+weight*q.directSunSeconds);}};
  enumerate('A',new Set(['A']),0,0);
  const options={worldModel,originNodeId:'A',destinationNodeId:'B',eligible:()=>true,walkingSpeedMps:1,directSunWeight:weight,unknownWeight:2,evaluateEdge,maximumLabels:50000,maximumAddedTimeSeconds:1000,maximumAddedRatio:100,timeBucketSeconds:1};
  const exact=router.search(options);assert.ok(Math.abs(exact.receipt.objective-reference)<1e-8);
  for(const bucket of [10,1,.1,.01]) {
   const candidate=router.search({...options,timeBucketSeconds:bucket,coalesceArrivalTimes:true,maximumLabelsPerNode:8});
   const regret=Math.max(0,candidate.receipt.objective-reference);
   rows.push({fixture,weight,bucket,reference,objective:candidate.receipt.objective,regret,relativeRegret:regret/reference,expanded:candidate.receipt.expandedLabels,beamPruned:candidate.receipt.beamPrunedLabels});
  }
 }
}
// Force the production eight-label beam to prune competing path histories.
// Random small graphs alone need not exercise that approximation.
for(const spacing of [.09,.05]) {
 const segments=[];
 for(let i=0;i<12;i++)segments.push({id:`a${i}`,fromNodeId:'A',toNodeId:`X${i}`,lengthM:1+i*spacing},
  {id:`m${i}`,fromNodeId:`X${i}`,toNodeId:'M',lengthM:1});
 segments.push({id:'end',fromNodeId:'M',toNodeId:'B',lengthM:1});
 const worldModel={world:{segments},outgoing:id=>segments.filter(e=>e.fromNodeId===id),segment:id=>segments.find(e=>e.id===id)};
 const evaluateEdge=(s,t)=>({travelSeconds:s.lengthM,directSunSeconds:s.id==='end'&&t<2+10.9*spacing?1:0,unknownSeconds:0});
 for(const weight of [1,5,20]) {
  const reference=Math.min(3+weight,3+11*spacing);
  const options={worldModel,originNodeId:'A',destinationNodeId:'B',eligible:()=>true,walkingSpeedMps:1,directSunWeight:weight,unknownWeight:2,evaluateEdge,maximumLabels:50000,maximumAddedTimeSeconds:1000,maximumAddedRatio:100,timeBucketSeconds:1};
  assert.ok(Math.abs(router.search(options).receipt.objective-reference)<1e-8);
  for(const bucket of [10,1,.1,.01]) {
   const candidate=router.search({...options,timeBucketSeconds:bucket,coalesceArrivalTimes:true,maximumLabelsPerNode:8});
   const regret=Math.max(0,candidate.receipt.objective-reference);
   rows.push({fixture:`fan-${spacing}`,weight,bucket,reference,objective:candidate.receipt.objective,regret,relativeRegret:regret/reference,expanded:candidate.receipt.expandedLabels,beamPruned:candidate.receipt.beamPrunedLabels});
  }
 }
}
const summaries=[10,1,.1,.01].map(bucket=>{const matches=rows.filter(r=>r.bucket===bucket);return {bucket,maximumLabelsPerNode:8,prunedLabels:matches.reduce((a,r)=>a+r.beamPruned,0),comparisons:matches.length,nonzeroRegret:matches.filter(r=>r.regret>1e-8).length,meanRelativeRegret:matches.reduce((a,r)=>a+r.relativeRegret,0)/matches.length,maximumRelativeRegret:Math.max(...matches.map(r=>r.relativeRegret))};});
assert.ok(summaries.at(-1).meanRelativeRegret<=summaries[0].meanRelativeRegret+1e-12,'Finer temporal resolution must improve aggregate regret');
assert.ok(rows.some(row=>row.beamPruned>0),'Qualification must exercise the configured eight-label beam');
const file='public/shared/plugins/sun-walker/shade-router.js';
const configFile='public/shared/plugins/sun-walker/default-config.json';
const configuredBucket=JSON.parse(fs.readFileSync(new URL('../../'+configFile,import.meta.url))).routeTimeBucketSeconds;
const configuredSummary=summaries.find(row=>row.bucket===configuredBucket);
assert.ok(configuredSummary && configuredSummary.maximumRelativeRegret<.05,'Configured precision exceeds the qualification fixture regret budget');
const report={schema:'simulatte.shadeRouterQualification.v1',sources:[file,configFile].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../../'+file,import.meta.url))).digest('hex')})),seed:9187,configuredBucket,configuredSummary,configuredRegretBudget:0.05,summaries,rows,scope:'Exhaustive simple-path reference on 64 bounded synthetic cyclic graphs with six or nine nodes, plus two twelve-branch fixtures that force the eight-label beam to prune. Arrival-dependent shadows, three preference weights and four bucket widths. Measures temporal and per-node beam approximation regret; not a bound on large NYC graphs, empirical shade or exact optimality of the production approximation.'};
fs.mkdirSync(new URL('../../artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../../artifacts/shade-router-qualification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summaries));
