(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./spatial-layout.js'):root.SimulatteSpatialLayout,node?require('./spatial-text.js'):root.SimulatteSpatialText);if(node)module.exports=api;else root.SimulatteSpatialRouting=api;})(globalThis,function(Layout,Text){
 'use strict';
 const overlap=(a,b,p=0)=>a.x<b.x+b.w+p&&b.x<a.x+a.w+p&&a.y<b.y+b.h+p&&b.y<a.y+a.h+p;
 const inflate=(r,p)=>({x:r.x-p,y:r.y-p,w:r.w+2*p,h:r.h+2*p});
 const center=r=>[r.x+r.w/2,r.y+r.h/2];
 function segmentHits(a,b,r){return a[0]===b[0]?a[0]>r.x&&a[0]<r.x+r.w&&Math.max(a[1],b[1])>r.y&&Math.min(a[1],b[1])<r.y+r.h:a[1]>r.y&&a[1]<r.y+r.h&&Math.max(a[0],b[0])>r.x&&Math.min(a[0],b[0])<r.x+r.w;}
 function relation(a,b,c,d,inclusive=false){const h=a[1]===b[1],k=c[1]===d[1];if(h===k){if((h?a[1]!==c[1]:a[0]!==c[0]))return 0;const axis=h?0:1;return Math.min(Math.max(a[axis],b[axis]),Math.max(c[axis],d[axis]))-Math.max(Math.min(a[axis],b[axis]),Math.min(c[axis],d[axis]))>0?2:0;}const [p,q,r,s]=h?[a,b,c,d]:[c,d,a,b];return (inclusive?r[0]>=Math.min(p[0],q[0])&&r[0]<=Math.max(p[0],q[0])&&p[1]>=Math.min(r[1],s[1])&&p[1]<=Math.max(r[1],s[1]):r[0]>Math.min(p[0],q[0])&&r[0]<Math.max(p[0],q[0])&&p[1]>Math.min(r[1],s[1])&&p[1]<Math.max(r[1],s[1]))?1:0;}
 const segments=points=>points.slice(1).map((p,i)=>[points[i],p]);
 function simplify(points){points=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);return points.filter((p,i)=>!i||i===points.length-1||!((points[i-1][0]===p[0]&&p[0]===points[i+1][0])||(points[i-1][1]===p[1]&&p[1]===points[i+1][1])));}
 class Heap{constructor(){this.a=[];}push(v){const a=this.a;let i=a.length;a.push(v);while(i){const p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;}pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].f<a[j].f)j++;if(a[j].f>=last.f)break;a[i]=a[j];i=j;}a[i]=last;}return top;}}
 function path(start,end,obstacles,prior,extra=[]){
  const p=Layout.policy.routing,xs=new Set([start[0],end[0]]),ys=new Set([start[1],end[1]]);
  for(const r of obstacles){xs.add(r.x);xs.add(r.x+r.w);ys.add(r.y);ys.add(r.y+r.h);}
  for(const points of prior)for(const q of points){for(const d of [-p.laneGap,p.laneGap]){xs.add(q[0]+d);ys.add(q[1]+d);}}
  for(const q of extra){xs.add(q[0]);ys.add(q[1]);}
  const X=[...xs].sort((a,b)=>a-b),Y=[...ys].sort((a,b)=>a-b),outer=p.clearance*3;
  X.unshift(X[0]-outer);X.push(X[X.length-1]+outer);Y.unshift(Y[0]-outer);Y.push(Y[Y.length-1]+outer);
  const ix=X.indexOf(start[0]),iy=Y.indexOf(start[1]),tx=X.indexOf(end[0]),ty=Y.indexOf(end[1]);
  const key=(x,y,d)=>(y*X.length+x)*3+d,heap=new Heap(),best=new Map(),previous=new Map(),coords=new Map(),allSegments=prior.flatMap(segments);
  const first=key(ix,iy,0);heap.push({x:ix,y:iy,d:0,g:0,f:0,k:first});best.set(first,0);let visited=0,found;
  while(heap.a.length){const n=heap.pop();if(n.g!==best.get(n.k))continue;if(++visited>p.maxSearchStates)throw Error('Spatial routing search limit exceeded');if(n.x===tx&&n.y===ty){found=n;break;}
   const a=[X[n.x],Y[n.y]];
   for(const [dx,dy,d]of [[1,0,1],[0,1,2],[-1,0,1],[0,-1,2]]){const x=n.x+dx,y=n.y+dy;if(x<0||y<0||x>=X.length||y>=Y.length)continue;const b=[X[x],Y[y]];
    if(obstacles.some(r=>segmentHits(a,b,r)))continue;
    let crossing=0,shared=false;for(const [c,e]of allSegments){const rel=relation(a,b,c,e,true);if(rel===2){shared=true;break;}if(rel===1)crossing++;}if(shared)continue;
    const g=n.g+Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1])+(n.d&&d!==n.d?p.bendCost:0)+crossing*p.crossingCost,k=key(x,y,d);
    if(g>=(best.get(k)??Infinity))continue;best.set(k,g);previous.set(k,n.k);coords.set(k,b);heap.push({x,y,d,g,f:g+Math.abs(b[0]-end[0])+Math.abs(b[1]-end[1]),k});
   }
  }
  if(!found)throw Error('No obstacle-free connection route');let k=found.k,out=[];while(k!==first){out.push(coords.get(k));k=previous.get(k);}out.push(start);return simplify(out.reverse());
 }
 function project(document,graph,view){
  const subs=new Map(document.subsystems.map(s=>[s.id,s]));
  return graph.edges.map(e=>({...e,source:Layout.resolve(graph,subs,e.from,view.closed),target:Layout.resolve(graph,subs,e.to,view.closed)})).filter(e=>e.source!==e.target&&view.shapes.has(e.source)&&view.shapes.has(e.target));
 }
 function route(document,graph,view){
  const p=Layout.policy.routing,edges=project(document,graph,view),slots=new Map(),plans=[];
  for(const e of edges){const from=view.shapes.get(e.source).r,to=view.shapes.get(e.target).r,a=center(from),b=center(to),horizontal=Math.abs(a[0]-b[0])>Math.abs(a[1]-b[1]);const plan={...e};plans.push(plan);
   for(const [field,id,r,c,other]of [['start',e.source,from,a,b],['end',e.target,to,b,a]]){const side=horizontal?(other[0]>c[0]?'right':'left'):(other[1]>c[1]?'bottom':'top'),key=id+':'+side;if(!slots.has(key))slots.set(key,[]);slots.get(key).push({plan,field,id,r,side,along:horizontal?other[1]:other[0]});}
  }
  for(const list of slots.values()){list.sort((a,b)=>a.along-b.along||a.plan.id.localeCompare(b.plan.id));list.forEach((s,i)=>{const r=s.r,f=(i+1)/(list.length+1);let point,escape;if(s.side==='left'||s.side==='right'){point=[s.side==='left'?r.x:r.x+r.w,r.y+r.h*f];escape=[point[0]+(s.side==='left'?-1:1)*(p.clearance+2),point[1]];}else{point=[r.x+r.w*f,s.side==='top'?r.y:r.y+r.h];escape=[point[0],point[1]+(s.side==='top'?-1:1)*(p.clearance+2)];}s.plan[s.field]={point,escape,side:s.side,id:s.id};});}
  const leaf=[...view.shapes].filter(([,s])=>s.mode!=='boundary').map(([id,s])=>({id,...s.r})),headers=[...view.shapes].filter(([,s])=>s.mode==='boundary').map(([id,s])=>({id,x:s.r.x,y:s.r.y,w:s.r.w,h:Layout.policy.boundary.header})),labels=[],routed=[];
  for(const plan of plans.sort((a,b)=>Math.hypot(a.start.point[0]-a.end.point[0],a.start.point[1]-a.end.point[1])-Math.hypot(b.start.point[0]-b.end.point[0],b.start.point[1]-b.end.point[1])||a.id.localeCompare(b.id))){
   const obstacles=leaf.map(r=>inflate(r,p.clearance)).concat(headers.map(r=>inflate(r,4)),labels.map(r=>inflate(r,6))),prior=routed.map(r=>r.points);
   const a=plan.start,b=plan.end;let points;try{points=path(a.escape,b.escape,obstacles,prior);}catch(error){throw Error(plan.id+': '+error.message+' '+JSON.stringify({a,b,blocked:obstacles.filter(r=>[a.escape,b.escape].some(q=>q[0]>r.x&&q[0]<r.x+r.w&&q[1]>r.y&&q[1]<r.y+r.h))}));}let label=Text.label(plan.label||plan.contractId);
   const free=(r,ownPoints)=>!leaf.some(b=>overlap(r,b,8))&&!plans.some(q=>[q.start.escape,q.end.escape].some(c=>overlap(r,{x:c[0]-4,y:c[1]-4,w:8,h:8},8)))&&!headers.some(b=>overlap(r,b,8))&&!labels.some(b=>overlap(r,b,6))&&!prior.some(ps=>segments(ps).some(([s,t])=>segmentHits(s,t,inflate(r,5))));
   let placement;
   function place(ps){for(const [s,t]of segments(ps).sort((a,b)=>Math.hypot(b[1][0]-b[0][0],b[1][1]-b[0][1])-Math.hypot(a[1][0]-a[0][0],a[1][1]-a[0][1]))){for(const f of [.5,.35,.65]){const c=[s[0]+(t[0]-s[0])*f,s[1]+(t[1]-s[1])*f],r={x:c[0]-label.w/2,y:c[1]-label.h/2,w:label.w,h:label.h};if(free(r,ps))return {r,c};}}return null;}
   placement=place(points);
   if(!placement){
    const maxX=Math.max(...leaf.map(r=>r.x+r.w),...labels.map(r=>r.x+r.w)),minY=Math.min(...leaf.map(r=>r.y));let success=false;
    for(let attempt=0;attempt<12&&!success;attempt++){const c=[maxX+p.laneGap*(attempt+2)+label.w/2,minY-p.clearance-label.h*(attempt+1)],r={x:c[0]-label.w/2,y:c[1]-label.h/2,w:label.w,h:label.h};if(!free(r))continue;try{const left=[c[0]-label.w/2-8,c[1]],right=[c[0]+label.w/2+8,c[1]],one=path(a.escape,left,obstacles.concat(inflate(r,1)),prior,[left,right]),two=path(right,b.escape,obstacles.concat(inflate(r,1)),prior.concat([one]),[left,right]);points=simplify([...one,right,...two.slice(1)]);placement={r,c};success=true;}catch{}}
    if(!success)throw Error('No readable label placement for '+plan.id);
   }
   labels.push(placement.r);points=simplify([a.point,...points,b.point]);
   // Keep the native bound label at an explicit middle vertex, not at a diagonal midpoint.
   let index=points.findIndex(q=>q[0]===placement.c[0]&&q[1]===placement.c[1]);if(index<0){for(let i=1;i<points.length;i++){if(segmentHits(points[i-1],points[i],{x:placement.c[0]-.1,y:placement.c[1]-.1,w:.2,h:.2})){points.splice(i,0,placement.c);index=i;break;}}}
   if(index<0)throw Error('Label is not on connection '+plan.id+' '+JSON.stringify({points,c:placement.c}));
   while(index<points.length-1-index){points.splice(1,0,[(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2]);index++;}
   while(index>points.length-1-index){const n=points.length;points.splice(n-1,0,[(points[n-2][0]+points[n-1][0])/2,(points[n-2][1]+points[n-1][1])/2]);}
   routed.push({...plan,points,label:{...label,...placement.r,center:placement.c}});
  }
  return routed;
 }
 return {route,project,overlap,segmentHits,segments,relation,inflate};
});
