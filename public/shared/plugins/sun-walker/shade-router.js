(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  root.SimulatteShadeRouter=api;
})(globalThis,function(){
  // Labels retain arrival time as well as cost. A cheaper arrival at a node
  // does not dominate all later arrivals when its outgoing shadows change.
  function search({worldModel,originNodeId,destinationNodeId,eligible,walkingSpeedMps,
    directSunWeight,unknownWeight,evaluateEdge,timeBucketSeconds,maximumLabels,
    maximumAddedTimeSeconds,maximumAddedRatio,coalesceArrivalTimes=false,maximumLabelsPerNode=Infinity}) {
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
    const costOf=(row,segment)=>segment.lengthM/walkingSpeedMps+directSunWeight*(row.directSunSeconds+row.unknownSeconds)+unknownWeight*row.unknownSeconds;
    let elapsed=0,upperCost=0;
    for(const id of baseline){const segment=worldModel.segment(id),row=evaluateEdge(segment,elapsed);upperCost+=costOf(row,segment);elapsed+=segment.lengthM/walkingSpeedMps;}
    // Find a feasible incumbent cheaply before the qualified search. This pass
    // may discard alternatives; its only authority is an actually evaluated,
    // loop-free route whose cost is an upper bound on the final objective.
    const seedOpen=heap(),seedBest=new Map();
    seedOpen.push({node:originNodeId,elapsed:0,objective:0,cost:shortestSeconds,parent:null,segment:null,visited:new Set([originNodeId])});
    let winner=null,seedExpanded=0;
    while(seedOpen.size && seedExpanded<Math.min(maximumLabels,5000)) {
      const current=seedOpen.pop();seedExpanded++;
      if(current.cost>=upperCost)continue;
      if(current.node===destinationNodeId){winner=current;upperCost=current.objective;break;}
      for(const segment of worldModel.outgoing(current.node)) {
        if(!eligible(segment)||!remaining.has(segment.toNodeId)||current.visited.has(segment.toNodeId))continue;
        const arrival=current.elapsed+segment.lengthM/walkingSpeedMps,lowerBound=remaining.get(segment.toNodeId);
        if(arrival+lowerBound>deadline+1e-6)continue;
        const objective=current.objective+costOf(evaluateEdge(segment,current.elapsed),segment);
        const key=`${segment.toNodeId}:${Math.floor(arrival/timeBucketSeconds)}`;
        if(objective+lowerBound>=upperCost || objective>=(seedBest.get(key)??Infinity))continue;
        seedBest.set(key,objective);
        seedOpen.push({node:segment.toNodeId,elapsed:arrival,objective,cost:objective+lowerBound,parent:current,segment:segment.id,visited:new Set([...current.visited,segment.toNodeId])});
      }
    }
    let expanded=0,coalesced=0,generated=1,retained=1,peakRetained=1,beamPruned=0;
    const nodeLabels=new Map();
    const open=heap(),best=new Map();
    const start={node:originNodeId,elapsed:0,objective:0,cost:shortestSeconds,parent:null,segment:null,key:`${originNodeId}:0`,visited:new Set([originNodeId])};
    open.push(start);best.set(start.key,[start]);nodeLabels.set(originNodeId,[start]);
    while(open.size) {
      const current=open.pop();if(!best.get(current.key)?.includes(current))continue;
      if(current.cost>=upperCost-1e-9)break;
      if(++expanded>maximumLabels)throw new Error('sun_route_search_limit: narrow the detour limit or reduce shade preference');
      if(current.node===destinationNodeId){winner=current;upperCost=current.objective;continue;}
      for(const segment of worldModel.outgoing(current.node)) {
        if(!eligible(segment)||!remaining.has(segment.toNodeId))continue;
        const arrival=current.elapsed+segment.lengthM/walkingSpeedMps;
        const lowerBound=remaining.get(segment.toNodeId);
        if(arrival+lowerBound>deadline+1e-6||current.objective+segment.lengthM/walkingSpeedMps+lowerBound>=upperCost)continue;
        // Walking routes must not loop to wait for the sun to move.
        if(current.visited.has(segment.toNodeId))continue;
        const objective=current.objective+costOf(evaluateEdge(segment,current.elapsed),segment);
        if(objective+lowerBound>=upperCost-1e-9)continue;
        const key=`${segment.toNodeId}:${Math.floor(arrival/timeBucketSeconds)}`;
        const labels=best.get(key)||[],visited=new Set([...current.visited,segment.toNodeId]);
        // A lower prefix cost cannot dominate a path with more legal continuations.
        const subset=(a,b)=>[...a].every(id=>b.has(id));
        const sameArrival=row=>coalesceArrivalTimes ? row.elapsed<=arrival : row.elapsed===arrival;
        if(labels.some(row=>sameArrival(row)&&row.objective<=objective&&subset(row.visited,visited))){coalesced++;continue;}
        const survivors=labels.filter(row=>!((coalesceArrivalTimes?arrival<=row.elapsed:arrival===row.elapsed)&&objective<=row.objective&&subset(visited,row.visited)));
        coalesced+=labels.length-survivors.length;retained+=1+survivors.length-labels.length;
        if(retained>maximumLabels)throw new Error('sun_route_search_limit: retained path labels exceed the search budget');
        generated++;peakRetained=Math.max(peakRetained,retained);
        const next={node:segment.toNodeId,elapsed:arrival,objective,cost:objective+lowerBound,parent:current,segment:segment.id,key,visited};
        best.set(key,[...survivors,next]);open.push(next);
        if(coalesceArrivalTimes && Number.isFinite(maximumLabelsPerNode)) {
          const active=(nodeLabels.get(next.node)||[]).filter(row=>best.get(row.key)?.includes(row));active.push(next);
          active.sort((a,b)=>a.objective-b.objective||a.elapsed-b.elapsed||a.order-b.order);
          for(const row of active.slice(maximumLabelsPerNode)) {
            best.set(row.key,best.get(row.key).filter(candidate=>candidate!==row));retained--;beamPruned++;
          }
          nodeLabels.set(next.node,active.slice(0,maximumLabelsPerNode));
        }
      }
    }
    const selected=[];for(let current=winner;current?.parent;current=current.parent)selected.push(current.segment);
    return {baseline:baselineRoute,selected:winner?{segmentIds:selected.reverse()}:baselineRoute,
      receipt:{algorithm:'arrival_time_shadow_graph_a_star',seedExpandedLabels:seedExpanded,expandedLabels:expanded,coalescedLabels:coalesced,generatedLabels:generated,peakRetainedLabels:peakRetained,beamPrunedLabels:beamPruned,maximumLabelsPerNode:Number.isFinite(maximumLabelsPerNode)?maximumLabelsPerNode:null,
        dominance:coalesceArrivalTimes?'bucketed-earlier-arrival-objective-and-visited-node-subset':'same-arrival-objective-and-visited-node-subset',
        precision:coalesceArrivalTimes?'bucketed-approximation':'exact-arrival',timeBucketSeconds,
        objective:upperCost,shortestSeconds,maximumTravelSeconds:deadline,
        claimBoundary:(coalesceArrivalTimes?'Temporal buckets and the declared per-node label beam approximate different arrivals and path histories; qualification measures cost regret against an exact-arrival reference. ':'')+'Buckets index arrivals without rounding them. Exact reference dominance requires equal arrival time and a subset of visited nodes. Search considers modeled eligible simple paths within the detour bound; budget exhaustion refuses instead of returning an unqualified route. This is not empirical shadow validation.'}};
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
