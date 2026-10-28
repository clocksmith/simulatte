(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./vendor/elk/elk.bundled.js'):root.ELK,node?require('./spatial-text.js'):root.SimulatteSpatialText,node?require('../../../data/system-diagram/spatial-policy.json'):null,node?require('../../../data/system-diagram/study-font-metrics.json'):null);if(node)module.exports=api;else root.SimulatteSpatialLayout=api;})(globalThis,function(ELK,Text,initialPolicy,initialMetrics){
 'use strict';let policy,metrics,engine;let byDocument=new WeakMap(),byContent=new Map();
 function configure(p,m){policy=p;metrics=m;Text.configure(p,m);byDocument=new WeakMap();byContent=new Map();engine=new ELK(typeof window==='object'?{workerUrl:new URL('vendor/elk/elk-worker.min.js',document.baseURI).href}:{});}
 if(initialPolicy)configure(initialPolicy,initialMetrics);
 function resolve(graph,subsystems,endpoint,closed=new Set()){
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));let n=nodes.get(endpoint.nodeId),portId=endpoint.portId;const seen=new Set();
  let collapsedParent=null;while(n?.parentId){if(closed.has(n.parentId))collapsedParent=n.parentId;n=nodes.get(n.parentId);}if(collapsedParent)return collapsedParent;n=nodes.get(endpoint.nodeId);
  while(n?.subsystemId&&!closed.has(n.id)){if(seen.has(n.id))throw Error('Cyclic spatial exposure');seen.add(n.id);const sub=subsystems.get(n.subsystemId),binding=sub?.ports.find(p=>p.id===portId);if(!binding)break;n=nodes.get(binding.target.nodeId);portId=binding.target.portId;}
  if(!n)throw Error('Unresolved spatial endpoint');return n.id;
 }
 async function solution(document,solution){
  const all=new Map(),subsystems=new Map(document.subsystems.map(s=>[s.id,s])),edges=new Map();
  for(const graph of [solution.initialGraph,...solution.stages.map(s=>s.graph)]){
   for(const n of graph.nodes){const size=Text.node(n.label),old=all.get(n.id);if(old&&(old.parentId||null)!==(n.parentId||null))throw Error('Spatial lineage changes containment for '+n.id);if(!old)all.set(n.id,{...n,size});else{old.size.w=Math.max(old.size.w,size.w);old.size.h=Math.max(old.size.h,size.h);}}
   for(const e of graph.edges){const from=resolve(graph,subsystems,e.from),to=resolve(graph,subsystems,e.to);if(from!==to)edges.set(from+'>'+to,{id:'layout-'+edges.size,sources:[from],targets:[to]});}
  }
  if(all.size>policy.limits.maxNodes||edges.size>policy.limits.maxEdges)throw Error('Study graph exceeds spatial policy bounds');
  const make=n=>{const children=[...all.values()].filter(c=>c.parentId===n.id).sort((a,b)=>a.id.localeCompare(b.id));return {id:n.id,width:n.size.w,height:n.size.h,...(children.length?{children:children.map(make),layoutOptions:{'elk.spacing.nodeNode':String(policy.layout.nodeGap),'elk.layered.spacing.nodeNodeBetweenLayers':String(policy.layout.layerGap),'elk.padding':`[top=${policy.boundary.padding+policy.boundary.header},left=${policy.boundary.padding},bottom=${policy.boundary.padding},right=${policy.boundary.padding}]`}}:{})};};
  const input={id:'root',layoutOptions:{'elk.algorithm':'layered','elk.layered.wrapping.strategy':'MULTI_EDGE','elk.aspectRatio':String(policy.layout.aspectRatio),'elk.hierarchyHandling':'INCLUDE_CHILDREN','elk.direction':policy.layout.direction,'elk.randomSeed':String(policy.seed),'elk.spacing.nodeNode':String(policy.layout.nodeGap),'elk.layered.spacing.nodeNodeBetweenLayers':String(policy.layout.layerGap),'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES'},children:[...all.values()].filter(n=>!n.parentId).sort((a,b)=>a.id.localeCompare(b.id)).map(make),edges:[...edges.values()]};
  const laid=await engine.layout(input),boxes={};
  function visit(node,x,y){for(const child of node.children||[]){const xx=Math.round(x+child.x),yy=Math.round(y+child.y);boxes[child.id]={x:xx,y:yy,w:Math.ceil(child.width),h:Math.ceil(child.height),leafW:all.get(child.id).size.w,leafH:all.get(child.id).size.h};visit(child,xx,yy);}}visit(laid,0,0);
  // ELK wrapping may place siblings closer than the requested routing clearance.
  // Separate complete subtrees, then recompute enclosing bounds bottom-up.
  const kids=id=>[...all.values()].filter(n=>(n.parentId||null)===id).map(n=>n.id).sort();
  const shift=(id,dx,dy)=>{boxes[id].x+=dx;boxes[id].y+=dy;for(const child of kids(id))shift(child,dx,dy);};
  function separate(parent){const ids=kids(parent);for(const id of ids)separate(id);
   for(let pass=0;pass<ids.length*ids.length+1;pass++){let changed=false;for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=boxes[ids[i]],b=boxes[ids[j]],gap=policy.layout.nodeGap;
    if(a.x<b.x+b.w+gap&&b.x<a.x+a.w+gap&&a.y<b.y+b.h+gap&&b.y<a.y+a.h+gap){const dx=a.x<=b.x?a.x+a.w+gap-b.x:b.x+b.w+gap-a.x,dy=a.y<=b.y?a.y+a.h+gap-b.y:b.y+b.h+gap-a.y;if(dx<dy)shift(a.x<=b.x?ids[j]:ids[i],dx,0);else shift(a.y<=b.y?ids[j]:ids[i],0,dy);changed=true;}}
    if(!changed)break;
   }
   if(parent&&ids.length){const b=boxes[parent],pad=policy.boundary.padding;const right=Math.max(...ids.map(id=>boxes[id].x+boxes[id].w))+pad,bottom=Math.max(...ids.map(id=>boxes[id].y+boxes[id].h))+pad;b.w=Math.max(b.w,right-b.x);b.h=Math.max(b.h,bottom-b.y);}
  }separate(null);
  return {boxes};
 }
 async function prepare(document){if(!policy||!engine)throw Error('Spatial layout is not configured');if(byDocument.has(document))return byDocument.get(document);const key=JSON.stringify(document);if(!byContent.has(key))byContent.set(key,(async()=>{const plans={};for(const s of document.solutions){if(s.stages.length>policy.limits.maxStages)throw Error('Too many spatial stages');plans[s.id]=await solution(document,s);}return plans;})());const promise=byContent.get(key);byDocument.set(document,promise);return promise;}
 function shapes(document,solution,graph,{collapsed=[]}={}){
  const cached=byDocument.get(document)||byContent.get(JSON.stringify(document));if(!cached?.resolved)throw Error('Prepare spatial layout before building a scene');const boxes=cached.resolved[solution.id].boxes,nodes=new Map(graph.nodes.map(n=>[n.id,n])),children=new Map(),hidden=new Set(),closed=new Set(collapsed);
  for(const n of graph.nodes)if(n.parentId){if(!children.has(n.parentId))children.set(n.parentId,[]);children.get(n.parentId).push(n.id);}
  for(const n of graph.nodes){let parent=n.parentId;while(parent){if(closed.has(parent))hidden.add(n.id);parent=nodes.get(parent)?.parentId;}}
  const shapes=new Map();for(const n of graph.nodes){if(hidden.has(n.id))continue;const b=boxes[n.id];if(!b)throw Error('No spatial box for '+n.id);const expanded=n.subsystemId&&!closed.has(n.id)&&(children.get(n.id)||[]).length;shapes.set(n.id,{mode:expanded?'boundary':'box',r:{x:b.x,y:b.y,w:expanded?b.w:b.leafW,h:expanded?b.h:b.leafH}});}
  return {shapes,hidden,children,closed};
 }
 const prepareBase=prepare;
 async function ready(document){const result=await prepareBase(document);byDocument.get(document).resolved=result;return result;}
 return {configure,prepare:ready,shapes,resolve,get policy(){return policy;},get metrics(){return metrics;}};
});
