(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./spatial-routing.js'):root.SimulatteSpatialRouting,node?require('./spatial-layout.js'):root.SimulatteSpatialLayout);if(node)module.exports=api;else root.SimulatteSpatialCheck=api;})(globalThis,function(R,Layout){
 'use strict';
 function check(graph,view,routes){
  const errors=[],crossings=[],nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  function ancestor(a,b){let n=nodes.get(b);while(n?.parentId){if(n.parentId===a)return true;n=nodes.get(n.parentId);}return false;}
  const shapes=[...view.shapes];
  for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){const [a,s]=shapes[i],[b,t]=shapes[j];if(!ancestor(a,b)&&!ancestor(b,a)&&R.overlap(s.r,t.r,2))errors.push({kind:'node-overlap',ids:[a,b]});}
  const leaf=shapes.filter(([,s])=>s.mode!=='boundary');
  const headers=shapes.filter(([,s])=>s.mode==='boundary').map(([id,s])=>({id,x:s.r.x,y:s.r.y,w:s.r.w,h:Layout.policy.boundary.header}));
  for(const route of routes){for(const header of headers){if(R.overlap(route.label,header,2))errors.push({kind:'label-header-overlap',ids:[route.id,header.id]});if(R.segments(route.points).some(([a,b])=>R.segmentHits(a,b,header)))errors.push({kind:'edge-through-header',ids:[route.id,header.id]});}
   for(const [id,s]of leaf){if(id!==route.source&&id!==route.target&&R.segments(route.points).some(([a,b])=>R.segmentHits(a,b,R.inflate(s.r,4))))errors.push({kind:'edge-through-node',ids:[route.id,id]});if(R.overlap(route.label,s.r,4))errors.push({kind:'label-node-overlap',ids:[route.id,id]});}
   for(const [a,b]of R.segments(route.points))if(a[0]!==b[0]&&a[1]!==b[1])errors.push({kind:'non-orthogonal-edge',ids:[route.id]});
  }
  for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){const a=routes[i],b=routes[j];if(R.overlap(a.label,b.label,4))errors.push({kind:'label-overlap',ids:[a.id,b.id]});for(const [one,two]of [[a,b],[b,a]])if(R.segments(one.points).some(([s,t])=>R.segmentHits(s,t,R.inflate(two.label,3))))errors.push({kind:'edge-through-label',ids:[one.id,two.id]});
   for(const [p,q]of R.segments(a.points))for(const [r,s]of R.segments(b.points)){const rel=R.relation(p,q,r,s);if(rel===2)errors.push({kind:'shared-edge-segment',ids:[a.id,b.id]});else if(rel===1)crossings.push({ids:[a.id,b.id]});}
  }
  return {ok:errors.length===0,errors,crossings,nodeCount:view.shapes.size,edgeCount:routes.length};
 }
 return {check};
});
