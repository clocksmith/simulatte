(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  root.SimulatteShadeRouter=api;
})(globalThis,function(){
  // Labels retain arrival time as well as cost. A cheaper arrival at a node
  // does not dominate all later arrivals when its outgoing shadows change.
  function search({worldModel,originNodeId,destinationNodeId,eligible,walkingSpeedMps,
    directSunWeight,unknownWeight,evaluateEdge,timeBucketSeconds,maximumLabels,
    maximumAddedTimeSeconds,maximumAddedRatio}) {
    const incoming=new Map();
    for(const segment of worldModel.world.segments) {
      if(!eligible(segment))continue;
      const rows=incoming.get(segment.toNodeId)||[];rows.push(segment);incoming.set(segment.toNodeId,rows);
    }
    const remaining=new Map([[destinationNodeId,0]]),toward=new Map(),reverse=heap();
    reverse.push({node:destinationNodeId,cost:0});
    while(reverse.size) {
      const current=reverse.pop();if(current.cost!==remaining.get(current.node))continue;
      for(const segment of incoming.get(current.node)||[]) {
        const cost=current.cost+segment.lengthM/walkingSpeedMps;
        if(cost>=(remaining.get(segment.fromNodeId)??Infinity))continue;
        remaining.set(segment.fromNodeId,cost);toward.set(segment.fromNodeId,segment);
        reverse.push({node:segment.fromNodeId,cost});
      }
    }
    const shortestSeconds=remaining.get(originNodeId);
    if(!Number.isFinite(shortestSeconds))throw new Error('sun_route_not_found');
    const baseline=[];let node=originNodeId;
    while(node!==destinationNodeId){const segment=toward.get(node);baseline.push(segment.id);node=segment.toNodeId;}
    const baselineRoute={segmentIds:baseline};
    if(!directSunWeight)return {baseline:baselineRoute,selected:baselineRoute,receipt:{algorithm:'walking_time_dijkstra',expandedLabels:remaining.size,timeBucketSeconds:0}};
    const deadline=shortestSeconds+Math.min(maximumAddedTimeSeconds,shortestSeconds*maximumAddedRatio);
    const costOf=row=>row.travelSeconds+directSunWeight*(row.directSunSeconds+row.unknownSeconds)+unknownWeight*row.unknownSeconds;
    let elapsed=0,upperCost=0;
    for(const id of baseline){const segment=worldModel.segment(id),row=evaluateEdge(segment,elapsed);upperCost+=costOf(row);elapsed+=segment.lengthM/walkingSpeedMps;}
    let winner=null,expanded=0,coalesced=0;
    const open=heap(),best=new Map();
    const start={node:originNodeId,elapsed:0,objective:0,cost:shortestSeconds,parent:null,segment:null,key:`${originNodeId}:0`};
    open.push(start);best.set(start.key,start);
    while(open.size) {
      const current=open.pop();if(best.get(current.key)!==current)continue;
      if(current.cost>=upperCost-1e-9)break;
      if(++expanded>maximumLabels)throw new Error('sun_route_search_limit: narrow the detour limit or reduce shade preference');
      if(current.node===destinationNodeId){winner=current;upperCost=current.objective;continue;}
      for(const segment of worldModel.outgoing(current.node)) {
        if(!eligible(segment)||!remaining.has(segment.toNodeId))continue;
        const arrival=current.elapsed+segment.lengthM/walkingSpeedMps;
        const lowerBound=remaining.get(segment.toNodeId);
        if(arrival+lowerBound>deadline+1e-6||current.objective+segment.lengthM/walkingSpeedMps+lowerBound>=upperCost)continue;
        // Walking routes must not loop to wait for the sun to move.
        let ancestor=current,cycle=false;
        while(ancestor){if(ancestor.node===segment.toNodeId){cycle=true;break;}ancestor=ancestor.parent;}
        if(cycle)continue;
        const objective=current.objective+costOf(evaluateEdge(segment,current.elapsed));
        if(objective+lowerBound>=upperCost-1e-9)continue;
        const key=`${segment.toNodeId}:${Math.floor(arrival/timeBucketSeconds)}`;
        const previous=best.get(key);
        if(previous)coalesced++;
        if(previous&&previous.objective<=objective)continue;
        const next={node:segment.toNodeId,elapsed:arrival,objective,cost:objective+lowerBound,parent:current,segment:segment.id,key};
        best.set(key,next);open.push(next);
      }
    }
    const selected=[];for(let current=winner;current?.parent;current=current.parent)selected.push(current.segment);
    return {baseline:baselineRoute,selected:winner?{segmentIds:selected.reverse()}:baselineRoute,
      receipt:{algorithm:'arrival_time_shadow_graph_a_star',expandedLabels:expanded,coalescedLabels:coalesced,timeBucketSeconds,
        objective:upperCost,shortestSeconds,maximumTravelSeconds:deadline,
        claimBoundary:'Arrival times are evaluated along each path. Cost labels within an arrival-time bucket are coalesced; this is a bounded temporal approximation, not a proof of continuous-time global optimality.'}};
  }
  function heap(){
    const rows=[];let sequence=0;
    function less(a,b){return a.cost<b.cost||a.cost===b.cost&&a.order<b.order;}
    return {get size(){return rows.length;},push(row){row.order=sequence++;rows.push(row);let i=rows.length-1;
      while(i){const p=(i-1)>>1;if(!less(rows[i],rows[p]))break;[rows[i],rows[p]]=[rows[p],rows[i]];i=p;}},
      pop(){const first=rows[0],last=rows.pop();if(rows.length){rows[0]=last;let i=0;
        while(true){let n=i,l=i*2+1,r=l+1;if(l<rows.length&&less(rows[l],rows[n]))n=l;if(r<rows.length&&less(rows[r],rows[n]))n=r;if(n===i)break;[rows[i],rows[n]]=[rows[n],rows[i]];i=n;}}return first;}};
  }
  return {search};
});
