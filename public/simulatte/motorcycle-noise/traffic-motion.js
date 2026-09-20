(function(root){
  const STEP=.1,STRIDE=9,STEPS=1801;
  const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const angleLerp=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
  function pathFor(source,geometry){
    const points=[],junctions=[];let distance=0;
    const add=(p,key)=>{if(points.length){const d=length(points[points.length-1],p);if(d<1e-6)return;distance+=d;}points.push({...p,distance,key});};
    const segments=source.route.segments;
    for(let i=0;i<segments.length;i++){
      const segment=segments[i],next=segments[i+1],trim=Math.min(4,segment.length/4),key=`${segment.x.toFixed(1)},${segment.y.toFixed(1)}:${segment.tx.toFixed(1)},${segment.ty.toFixed(1)}`;
      if(!points.length)add({x:segment.x,y:segment.y},key);
      const end={x:segment.tx-segment.ux*(next?trim:0),y:segment.ty-segment.uy*(next?trim:0)};
      const beginning=points[points.length-1],steps=Math.max(1,Math.ceil(length(beginning,end)/5));
      let obstructed=geometry.hits({...beginning,z:.4},{...end,z:.4}).length>0;
      for(let j=1;j<=steps&&!obstructed;j++){const p={x:beginning.x+(end.x-beginning.x)*j/steps,y:beginning.y+(end.y-beginning.y)*j/steps};add(p,key);}
      if(obstructed||!next)break;
      const nextTrim=Math.min(4,next.length/4),target={x:next.x+next.ux*nextTrim,y:next.y+next.uy*nextTrim},curve=[];
      for(let j=1;j<=12;j++){const t=j/12,s=1-t;curve.push({x:s*s*s*end.x+3*s*s*t*segment.tx+3*s*t*t*next.x+t*t*t*target.x,y:s*s*s*end.y+3*s*s*t*segment.ty+3*s*t*t*next.y+t*t*t*target.y});}
      if(curve.some((p,j)=>geometry.hits({...((j?curve[j-1]:end)),z:.4},{...p,z:.4}).length))break;
      const entry=distance,center=segment.node||{x:(segment.tx+next.x)/2,y:(segment.ty+next.y)/2};
      const id=`${center.x.toFixed(0)},${center.y.toFixed(0)}`;
      for(const p of curve)add(p,`junction:${id}`);
      if(segment.signal)junctions.push({id,entry,exit:distance+3,stop:Math.max(0,entry-3),axis:Math.abs(segment.ux)>Math.abs(segment.uy)?0:1});
    }
    return {points,junctions,length:distance};
  }
  function at(path,distance){
    const rows=path.points;if(rows.length<2)return {x:rows[0]?.x||0,y:rows[0]?.y||0,heading:0,key:'end'};
    const d=Math.max(0,Math.min(path.length,distance));let low=0,high=rows.length-1;
    while(high-low>1){const middle=(low+high)>>1;if(rows[middle].distance<=d)low=middle;else high=middle;}
    const a=rows[low],b=rows[high],t=(d-a.distance)/Math.max(1e-9,b.distance-a.distance);
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:Math.atan2(b.y-a.y,b.x-a.x),key:a.key};
  }
  function prepare(sources,geometry,quotas={}){
    const agents=[],counts={motorcycle:0,car:0,pedestrian:0};
    function overlaps(source,point,other) {
      if(source.kind==='pedestrian'||other.source.kind==='pedestrian')return false;
      const dx=other.point.x-point.x,dy=other.point.y-point.y;
      const halfLength=(source.kind==='car'?2.2:1.1)+(other.source.kind==='car'?2.2:1.1)+1;
      const halfWidth=(source.kind==='car'?.9:.35)+(other.source.kind==='car'?.9:.35)+.3;
      if(Math.abs(Math.cos(other.point.heading-point.heading))<.8)return Math.hypot(dx,dy)<halfLength;
      return Math.abs(dx*Math.cos(point.heading)+dy*Math.sin(point.heading))<halfLength
        &&Math.abs(-dx*Math.sin(point.heading)+dy*Math.cos(point.heading))<halfWidth;
    }
    for(const source of sources){
      if(counts[source.kind]>=(quotas[source.kind]??Infinity))continue;
      const path=pathFor(source,geometry);if(path.length<(source.kind==='pedestrian'?30:160))continue;
      let progress=Math.min(source.offset,path.length-5),point=at(path,progress),attempt=0;
      while(attempt++<24&&agents.some(other=>overlaps(source,point,other))){
        progress+=7;if(progress>Math.min(path.length-5,160))break;point=at(path,progress);
      }
      if(progress>path.length-5||geometry.occupied(point)||agents.some(other=>overlaps(source,point,other)))continue;
      const states=new Float32Array(STEPS*STRIDE);source.motion={step:STEP,stride:STRIDE,states};
      const idle=source.kind==='motorcycle'?(source.cylinders===2?1100:1500):source.kind==='car'?800:0;
      counts[source.kind]++;
      agents.push({source,path,progress,point,speed:source.kind==='pedestrian'?source.speed:0,phase:source.phase,idle});
    }
    const reservations=new Map();
    function record(agent,index,acceleration=0,lean=0){
      const p=agent.point,rpm=agent.idle+Math.max(0,agent.source.rpm-agent.idle)*Math.min(1.25,agent.speed/Math.max(.1,agent.source.speed));
      agent.source.motion.states.set([p.x,p.y,p.heading,agent.speed,agent.phase,agent.progress,acceleration,lean,rpm],index*STRIDE);
    }
    agents.forEach(agent=>record(agent,0));
    for(let step=1;step<STEPS;step++){
      const time=step*STEP;
      for(const[id,entry]of reservations)if(entry.agent.progress>entry.exit||entry.agent.progress>=entry.agent.path.length-.2)reservations.delete(id);
      const next=[],buckets=new Map();
      for(const agent of agents){const key=Math.floor(agent.point.x/50)+','+Math.floor(agent.point.y/50);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(agent);}
      function neighbors(agent){const rows=[],x=Math.floor(agent.point.x/50),y=Math.floor(agent.point.y/50);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)rows.push(...(buckets.get((x+dx)+','+(y+dy))||[]));return rows;}
      for(const agent of agents){
        const source=agent.source,pedestrian=source.kind==='pedestrian',brake=pedestrian?2:4;
        let target=Math.min(source.speed,Math.sqrt(2*brake*Math.max(0,agent.path.length-agent.progress-.1))),limit=Infinity;
        const ahead=at(agent.path,Math.min(agent.path.length,agent.progress+5));
        const turn=Math.abs(Math.atan2(Math.sin(ahead.heading-agent.point.heading),Math.cos(ahead.heading-agent.point.heading)));
        if(turn>.05)target=Math.min(target,Math.sqrt(2.5*5/turn));
        if(!pedestrian)for(const other of neighbors(agent)){
          if(other===agent||other.source.kind==='pedestrian')continue;
          const dx=other.point.x-agent.point.x,dy=other.point.y-agent.point.y,forward=dx*Math.cos(agent.point.heading)+dy*Math.sin(agent.point.heading),side=Math.abs(-dx*Math.sin(agent.point.heading)+dy*Math.cos(agent.point.heading));
          if(forward>0&&forward<50&&side<((source.kind==='car'?.9:.35)+(other.source.kind==='car'?.9:.35)+.3)&&Math.cos(other.point.heading-agent.point.heading)>.5){
            const body=(source.kind==='car'?2.2:1.1)+(other.source.kind==='car'?2.2:1.1),gap=Math.max(0,forward-body-1.5);
            target=Math.min(target,Math.max(0,(gap-1.3*agent.speed)*.8+other.speed));limit=Math.min(limit,gap);
          }
        }
        const junction=agent.path.junctions.find(row=>row.exit>agent.progress);
        if(junction&&agent.progress<junction.entry){
          let hash=0;for(const char of junction.id)hash=(hash*31+char.charCodeAt(0))>>>0;
          const phase=(time+hash%9)%30,green=pedestrian?phase>=26:junction.axis===0?phase<11:phase>=13&&phase<24;
          const holder=reservations.get(junction.id),distance=Math.max(0,junction.stop-agent.progress);
          if(!green||(holder&&holder.agent!==agent)){target=Math.min(target,Math.sqrt(2*brake*distance));limit=Math.min(limit,distance);}
          else if(distance<Math.max(.6,agent.speed*STEP+0.2))reservations.set(junction.id,{agent,exit:junction.exit});
        }
        const oldSpeed=agent.speed,change=Math.max(-brake*STEP,Math.min((pedestrian?1:1.7)*STEP,target-oldSpeed));
        const speed=Math.max(0,oldSpeed+change),travel=Math.max(0,Math.min(limit,(oldSpeed+speed)*STEP/2));
        const progress=Math.min(agent.path.length-.001,agent.progress+travel),point=at(agent.path,progress);
        const actualSpeed=travel+1e-9<(oldSpeed+speed)*STEP/2?0:speed,acceleration=(actualSpeed-oldSpeed)/STEP,headingChange=Math.atan2(Math.sin(point.heading-agent.point.heading),Math.cos(point.heading-agent.point.heading));
        const lean=source.kind==='motorcycle'?Math.max(-.4,Math.min(.4,Math.atan(actualSpeed*headingChange/(STEP*9.81)))):0;
        const rpm=agent.idle+Math.max(0,source.rpm-agent.idle)*Math.min(1.25,actualSpeed/Math.max(.1,source.speed));
        next.push({agent,progress,point,speed:actualSpeed,phase:agent.phase+2*Math.PI*rpm/120*STEP,acceleration,lean});
      }
      for(const row of next){Object.assign(row.agent,{progress:row.progress,point:row.point,speed:row.speed,phase:row.phase});record(row.agent,step,row.acceleration,row.lean);}
    }
    return agents.map(agent=>agent.source);
  }
  function sample(source,time){
    const motion=source.motion;if(!motion)return null;
    const t=Math.max(0,Math.min((motion.states.length/STRIDE-1)*motion.step,time))/motion.step,low=Math.min(STEPS-2,Math.floor(t)),f=Math.min(1,t-low),a=low*STRIDE,b=(low+1)*STRIDE,rows=motion.states;
    const value=i=>rows[a+i]+(rows[b+i]-rows[a+i])*f;
    return {x:value(0),y:value(1),heading:angleLerp(rows[a+2],rows[b+2],f),speed:value(3),phase:value(4),distance:value(5),acceleration:value(6),lean:value(7),rpm:value(8),z:source.kind==='pedestrian'?1.5:.7};
  }
  root.MotorcycleTrafficMotion={prepare,sample};
})(globalThis);
