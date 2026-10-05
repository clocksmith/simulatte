const test=require('node:test');
const assert=require('node:assert/strict');
const router=require('../public/shared/plugins/sun-walker/shade-router.js');
function fixture(edges) {
  const segments=edges.map(([id,from,to,seconds,sun])=>({id,fromNodeId:from,toNodeId:to,lengthM:seconds,sun}));
  return {world:{segments},segment:id=>segments.find(row=>row.id===id),outgoing:id=>segments.filter(row=>row.fromNodeId===id)};
}
function run(worldModel,weight,evaluateEdge,overrides={}) {
  return router.search({worldModel,originNodeId:'A',destinationNodeId:'B',eligible:()=>true,walkingSpeedMps:1,
    directSunWeight:weight,unknownWeight:2,timeBucketSeconds:1,maximumLabels:10000,
    maximumAddedTimeSeconds:1000,maximumAddedRatio:100,
    evaluateEdge:evaluateEdge||((s)=>({travelSeconds:s.lengthM,directSunSeconds:s.sun,unknownSeconds:0})),...overrides});
}
test('shade search finds a detour beyond the first three ordinary shortest routes',()=>{
  const w=fixture([['short','A','B',10,10],['second','A','B',11,10],['third','A','B',12,10],['shade','A','B',20,0]]);
  assert.deepEqual(run(w,0,()=>{throw Error('Shortest routing must not inspect shadows');}).selected.segmentIds,['short']);
  assert.deepEqual(run(w,0.5).selected.segmentIds,['short']);
  assert.deepEqual(run(w,2).selected.segmentIds,['shade']);
  assert.deepEqual(run(w,100,null,{maximumAddedTimeSeconds:5}).selected.segmentIds,['short']);
});
test('arrival-dependent shadows retain later labels instead of one cheapest visit per intersection',()=>{
  const w=fixture([['early','A','C',5,0],['late','A','C',15,0],['finish','C','B',10,10]]);
  const arrivals=[];
  const evaluate=(s,t)=>{arrivals.push([s.id,t]);return {travelSeconds:s.lengthM,directSunSeconds:s.id==='finish'&&t<10?10:0,unknownSeconds:0};};
  assert.deepEqual(run(w,5,evaluate).selected.segmentIds,['late','finish']);
  assert.ok(arrivals.some(([id,t])=>id==='finish'&&t===5));
  assert.ok(arrivals.some(([id,t])=>id==='finish'&&t===15));
});
test('graph results match independently enumerated paths across time/shade weights',()=>{
  const w=fixture([['ab','A','B',20,20],['ac','A','C',6,6],['cb','C','B',20,0],['ad','A','D',12,0],['dc','D','C',8,0],['db','D','B',30,0]]);
  const paths=[];
  function visit(node,ids,time,sun){if(node==='B'){paths.push({ids,time,sun});return;}for(const s of w.outgoing(node))visit(s.toNodeId,[...ids,s.id],time+s.lengthM,sun+s.sun);}
  visit('A',[],0,0);
  for(const weight of [0,0.25,0.5,1,2,10,100]) {
    const result=run(w,weight),actual=result.selected.segmentIds.map(w.segment);
    const actualCost=actual.reduce((n,s)=>n+s.lengthM+weight*s.sun,0);
    assert.equal(actualCost,Math.min(...paths.map(p=>p.time+weight*p.sun)));
  }
});
test('blocked paths and exhausted budgets fail explicitly; loops are never returned',()=>{
  const w=fixture([['ac','A','C',5,0],['ca','C','A',5,0],['cb','C','B',5,10]]);
  assert.throws(()=>run(w,1,null,{eligible:s=>s.id!=='cb'}),/sun_route_not_found/);
  assert.throws(()=>run(w,100,null,{maximumLabels:1}),/sun_route_search_limit/);
  const path=run(w,100).selected.segmentIds;
  assert.deepEqual(path,['ac','cb']);
});

test('unknown geometry cannot become a cheap substitute for verified shade',()=>{
  const w=fixture([['missing','A','B',10,0],['shade','A','B',12,0]]);
  const result=run(w,100,s=>({travelSeconds:s.lengthM,directSunSeconds:0,unknownSeconds:s.id==='missing'?10:0}));
  assert.deepEqual(result.selected.segmentIds,['shade']);
});
