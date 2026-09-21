(function (root) {
  const C = { rho: 1.204, p0: 20e-6, duration: 1.25, rate: 8000 };
  const defaults = { seed: 731, motorcycles: 300, cars: 80, pedestrians: 120, speed: 9, rpm: 2400,
    temperature: 20, background: 20, sourceDb: 136, surface: 'none', reflectivity: 0.7, transmission: 0.1,
    cancellation: false, latencyMs: 2, panelWidth: 16, panelHeight: 3, coneDegrees: 60 };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
  const norm = v => { const d = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / d, y: v.y / d, z: v.z / d }; };
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  function random(seed) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
  const soundSpeed = p => Math.sqrt(1.4 * 287.05 * (p.temperature + 273.15));
  function validate(p) {
    for (const [key, low, high] of [['seed',1,2147483647],['motorcycles',0,600],['cars',0,240],['pedestrians',0,400],['speed',2,14],['rpm',1200,8000],['temperature',-10,40],['background',15,65],['sourceDb',60,145],['reflectivity',0,1],['transmission',0,1],['latencyMs',0,20],['panelWidth',4,24],['panelHeight',1,5],['coneDegrees',45,90]]) {
      if (!Number.isFinite(p[key]) || p[key] < low || p[key] > high) throw new Error(`Invalid ${key}`);
    }
    for (const key of ['seed','motorcycles','cars','pedestrians']) if (!Number.isInteger(p[key])) throw new Error(`Invalid integer ${key}`);
    if (!['none','flat','retro'].includes(p.surface) || typeof p.cancellation !== 'boolean' || p.reflectivity + p.transmission > 1.000001) throw new Error('Invalid surface or energy fractions');
    return p;
  }
  function graph(map) {
    const nodes = new Map(), edges = [];
    const node = p => { const key = `${p.x.toFixed(1)},${p.y.toFixed(1)}`; if (!nodes.has(key)) nodes.set(key, { ...p, exits: [] }); return nodes.get(key); };
    for (const street of map.streets) {
      if (!['primary','secondary','tertiary','residential','unclassified','living_street','service','trunk'].includes(street.highway)) continue;
      for (let i = 1; i < street.geometry.length; i++) {
        const a = node(street.geometry[i - 1]), b = node(street.geometry[i]), length = dist(a, b);
        if (length < 3) continue;
        for (const [from, to] of [[a,b],[b,a]]) { const edge = { from, to, length, width: street.widthM || 8, name: street.name || '', ux: (to.x-from.x)/length, uy: (to.y-from.y)/length }; edges.push(edge); from.exits.push(edge); }
      }
    }
    // Keep one connected street component, rather than distributing actors
    // among disconnected fragments of the packaged street snapshot.
    const visited = new Set(); let largest = new Set();
    for (const start of nodes.values()) {
      if (visited.has(start)) continue;
      const component = new Set(), queue = [start]; visited.add(start);
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i]; component.add(current);
        for (const edge of current.exits) if (!visited.has(edge.to)) { visited.add(edge.to); queue.push(edge.to); }
      }
      if (component.size > largest.size) largest = component;
    }
    return edges.filter(edge => largest.has(edge.from));
  }
  function startLocation(map) {
    const parks=(map.parks||[]).filter(row=>/mccarren/i.test(row.label||''));
    const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-q.x*p.y;},0));
    const ring=parks.slice().sort((a,b)=>area(b.outerRing)-area(a.outerRing))[0]?.outerRing;
    if(!ring?.length)return {x:2100,y:-850,z:0};
    const minX=Math.min(...ring.map(p=>p.x)),minY=Math.min(...ring.map(p=>p.y));
    const width=Math.max(1,Math.max(...ring.map(p=>p.x))-minX),height=Math.max(1,Math.max(...ring.map(p=>p.y))-minY);
    const southwest=ring.reduce((best,p)=>(p.x-minX)/width+(p.y-minY)/height<(best.x-minX)/width+(best.y-minY)/height?p:best,ring[0]);
    return {x:southwest.x,y:southwest.y-180,z:0};
  }
  function create(map, p) {
    validate(p); const rng = random(p.seed), edges = graph(map);
    if (!edges.length) throw new Error('The NYC snapshot contains no usable street segments');
    const anchor = edges.filter(row => /Manhattan Avenue/i.test(row.name) && row.length > 30).sort((a,b) => Math.abs(a.from.y-460)-Math.abs(b.from.y-460))[0] || edges[0];
    const center = { x: (anchor.from.x+anchor.to.x)/2, y: (anchor.from.y+anchor.to.y)/2, z: 0.8 };
    const local = edges.filter(edge => edge.length > 25);
    const sources = [];
    const startPoint=startLocation(map);
    const startEdge=local.filter(edge=>edge.length>65&&edge.uy>0).sort((a,b)=>Math.hypot((a.from.x+a.to.x)/2-startPoint.x,(a.from.y+a.to.y)/2-startPoint.y)-Math.hypot((b.from.x+b.to.x)/2-startPoint.x,(b.from.y+b.to.y)/2-startPoint.y))[0]||anchor;
    const park = (map.places || []).find(place => /mccarren/i.test(place.name || place.label || ''));
    const parkPoint = park?.position || (park && Number.isFinite(park.x) ? park : {x:2200,y:-480});
    const boundaries=(map.parks||[]).filter(row=>/mccarren/i.test(row.label||'')).map(row=>row.outerRing);
    function nearPark(edge){
      if(edge.length<=65)return false;
      const point={x:(edge.from.x+edge.to.x)/2,y:(edge.from.y+edge.to.y)/2};
      if(!boundaries.length)return Math.hypot(point.x-parkPoint.x,point.y-parkPoint.y)<450;
      for(const ring of boundaries)for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y;
        const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/Math.max(1,dx*dx+dy*dy)));
        if(Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t)<85)return true;
      }
      return false;
    }
    const parkEdges=local.filter(nearPark);
    const packs = new Map();
    function packFor(index) {
      const id = Math.floor(index/16);
      if (!packs.has(id)) {
        const pool = id%4!==3 && parkEdges.length ? parkEdges : local;
        const edge = id===0 ? startEdge : pool[Math.floor(rng()*pool.length)] || anchor;
        packs.set(id,{id,edge,route:route(edge,'lane'),speed:p.speed*(.9+.12*rng())});
      }
      return packs.get(id);
    }
    function packRoute(pack,index) {
      const shift = index%2 ? .65 : -.65;
      return {length:pack.route.length,segments:pack.route.segments.map(segment=>({...segment,
        x:segment.x+segment.uy*shift,y:segment.y-segment.ux*shift,
        tx:segment.tx+segment.uy*shift,ty:segment.ty-segment.ux*shift}))};
    }
    function route(first, offset) {
      const segments = []; let edge = first, total = 0;
      for (let i=0; i<120 && total<2500; i++) {
        const lane = offset === 'sidewalk' ? edge.width/2+1.6 : Math.min(2.5, edge.width/4);
        segments.push({ x: edge.from.x+edge.uy*lane, y: edge.from.y-edge.ux*lane, tx: edge.to.x+edge.uy*lane, ty: edge.to.y-edge.ux*lane, start: total, length: edge.length, ux: edge.ux, uy: edge.uy, node: { x: edge.to.x, y: edge.to.y }, signal: edge.to.exits.length > 2 }); total += edge.length;
        const choices = edge.to.exits.filter(next => next.to !== edge.from);
        if (!choices.length) choices.push(...edge.to.exits);
        if (!choices.length) break;
        choices.sort((a,b) => (b.ux*edge.ux+b.uy*edge.uy)-(a.ux*edge.ux+a.uy*edge.uy));
        edge = rng()<0.65 ? choices[0] : choices[Math.floor(rng()*choices.length)];
      }
      return { segments, length: total };
    }
    for (const [kind, count] of [['motorcycle',p.motorcycles],['car',p.cars],['pedestrian',p.pedestrians]]) for (let i=0;i<count*4;i++) {
      const pack = kind==='motorcycle' ? packFor(i) : null;
      const edge = pack ? pack.edge : local[Math.floor(rng()*local.length)] || anchor;
      const speed = pack ? pack.speed : kind==='pedestrian' ? 1+0.5*rng() : p.speed*(0.8+0.3*rng());
      const cylinders = kind==='motorcycle' ? 2 : kind==='car' ? 4 : 0;
      sources.push({ id: `${kind}-${i+1}`, kind, cylinders, packId:pack ? pack.id : null, route:pack ? packRoute(pack,i) : route(edge,kind==='pedestrian'?'sidewalk':'lane'),
        offset:pack ? 4+Math.floor(i%16/2)*8+(i%2)*3 : rng()*edge.length*.7,
        speed, rpm: kind==='motorcycle'?p.rpm*(0.94+rng()*0.12):kind==='car'?1400+speed*80:0,
        phase: rng()*2*Math.PI, db: kind==='motorcycle'?p.sourceDb:kind==='car'?74:48 });
    }
    const n = { x: -anchor.uy, y: anchor.ux };
    const panel = { x:center.x+n.x*(anchor.width/2+2), y:center.y+n.y*(anchor.width/2+2), z:p.panelHeight/2,
      angle:Math.atan2(-n.y,-n.x), width:p.panelWidth, height:p.panelHeight };
    const receiver = { x:center.x-n.x*(anchor.width/2+3), y:center.y-n.y*(anchor.width/2+3), z:1.5 };
    const geometry = root.MotorcycleCityPaths.create(map.buildings);
    const moving = root.MotorcycleTrafficMotion.prepare(sources, geometry, {motorcycle:p.motorcycles,car:p.cars,pedestrian:p.pedestrians});
    for (const [kind, expected] of [['motorcycle',p.motorcycles],['car',p.cars],['pedestrian',p.pedestrians]]) {
      const actual = moving.filter(source => source.kind === kind).length;
      if (actual !== expected) throw new Error('Street placement produced '+actual+'/'+expected+' '+kind+' agents; choose a smaller population or another seed.');
    }
    const state = { schema:'simulatte.nycAcousticScene.v4', config:{...p}, startLocation:{x:(startEdge.from.x+startEdge.to.x)/2,y:(startEdge.from.y+startEdge.to.y)/2,z:0,street:startEdge.name}, sources:moving, panel, receiver, buildings:map.buildings, requestedCounts:{motorcycles:p.motorcycles,cars:p.cars,pedestrians:p.pedestrians},
      reference:{x:receiver.x-anchor.ux*5,y:receiver.y-anchor.uy*5,z:1.5},
      speaker:{x:receiver.x+anchor.ux*1.5,y:receiver.y+anchor.uy*1.5,z:1.5}, center,
      observers:[{name:'Listener',...receiver},{name:'Opposite curb',x:panel.x+n.x*3,y:panel.y+n.y*3,z:1.5},{name:'Along street',x:receiver.x+anchor.ux*25,y:receiver.y+anchor.uy*25,z:1.5}] };
    Object.defineProperty(state,'acousticContext',{value:geometry,enumerable:false,configurable:true});
    return state;
  }
  function position(source,time) {
    if(source.static)return source.static;
    const motion=root.MotorcycleTrafficMotion.sample(source,time);if(motion)return motion;
    const distance = Math.min(source.route.length-0.001, Math.max(0,source.offset+source.speed*Math.max(0,time)));
    const segment = source.route.segments.find(row => distance < row.start+row.length) || source.route.segments[source.route.segments.length-1];
    const u = Math.max(0,Math.min(1,(distance-segment.start)/segment.length));
    return { x:segment.x+(segment.tx-segment.x)*u,y:segment.y+(segment.ty-segment.y)*u,z:source.kind==='pedestrian'?1.5:0.7,heading:Math.atan2(segment.uy,segment.ux) };
  }
  function sourceLevel(source,time) {
    const state=root.MotorcycleTrafficMotion.sample(source,time);
    if(source.kind==='motorcycle'){
      // source.db is the full-load reference, not a continuously revving engine.
      const speed=Math.max(0,Math.min(1,(state?.speed||0)/Math.max(.1,source.speed)));
      const throttle=Math.max(0,Math.min(1,(state?.acceleration||0)/2));
      return source.db-50+28*Math.sqrt(speed)+22*throttle;
    }
    return source.db+(source.kind==='pedestrian'||!state?0:6*(Math.min(1.25,state.speed/Math.max(.1,source.speed))-1)+Math.min(2,Math.max(0,state.acceleration))*1.5);
  }
  function pressure(source,time) {
    if(time<0)return 0;
    const state=root.MotorcycleTrafficMotion.sample(source,time),cycle=state?state.phase:2*Math.PI*source.rpm/120*time+source.phase;
    if(!source.harmonics){
      const angles=source.cylinders===4?[0,180,360,540]:source.cylinders===2?[0,315]:[0];
      source.harmonics=[];
      for(let n=1;n<=20;n++){
        const re=angles.reduce((sum,angle)=>sum+Math.cos(n*angle*Math.PI/360),0)/n**1.15;
        const im=angles.reduce((sum,angle)=>sum+Math.sin(n*angle*Math.PI/360),0)/n**1.15;
        if(Math.hypot(re,im)>1e-8)source.harmonics.push({n,re,im});
      }
      source.harmonicNorm=Math.sqrt(source.harmonics.reduce((sum,row)=>sum+row.re**2+row.im**2,0)/2);
    }
    let tone=0;for(const row of source.harmonics)tone+=row.re*Math.sin(row.n*cycle)-row.im*Math.cos(row.n*cycle);
    tone/=Math.max(1e-8,source.harmonicNorm);
    let noise=0;for(let n=0;n<8;n++)noise+=Math.sin(2*Math.PI*(173+n*211+n*n*7.37)*time+source.phase*(n+1.13));noise/=2;
    const mix=source.kind==='pedestrian'?1:source.kind==='car'?.6:.16;
    const waveform=((1-mix)*tone+mix*noise)/Math.hypot(1-mix,mix);
    return C.p0*10**(sourceLevel(source,time)/20)*waveform;
  }

  function solidAngle(source,panel) {
    const tangent={x:-Math.sin(panel.angle),y:Math.cos(panel.angle),z:0};
    const vertices=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>sub({x:panel.x+tangent.x*a*panel.width/2,y:panel.y+tangent.y*a*panel.width/2,z:panel.z+b*panel.height/2},source));
    const triangle=(a,b,c)=>2*Math.atan2(Math.abs(dot(a,cross(b,c))),Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z)*Math.hypot(c.x,c.y,c.z)+dot(a,b)*Math.hypot(c.x,c.y,c.z)+dot(b,c)*Math.hypot(a.x,a.y,a.z)+dot(c,a)*Math.hypot(b.x,b.y,b.z));
    return Math.min(2*Math.PI,triangle(vertices[0],vertices[1],vertices[2])+triangle(vertices[0],vertices[2],vertices[3]));
  }
  function facing(source,panel) { return (source.x-panel.x)*Math.cos(panel.angle)+(source.y-panel.y)*Math.sin(panel.angle)>0.1; }
  function blocked(source,receiver,panel) {
    const n={x:Math.cos(panel.angle),y:Math.sin(panel.angle),z:0}, direction=sub(receiver,source), denominator=dot(direction,n);
    if (Math.abs(denominator)<1e-9) return false;
    const t=dot(sub(panel,source),n)/denominator;
    if (t<=0 || t>=1) return false;
    const hit={x:source.x+t*direction.x,y:source.y+t*direction.y,z:(source.z||0)+t*direction.z};
    return Math.abs(-(hit.x-panel.x)*n.y+(hit.y-panel.y)*n.x)<=panel.width/2 && Math.abs(hit.z-panel.z)<=panel.height/2;
  }
  function redirectedAxis(source,panel,mode) {
    const incoming=norm(sub(panel,source));
    if (mode==='retro') return {x:-incoming.x,y:-incoming.y,z:-incoming.z};
    const n={x:Math.cos(panel.angle),y:Math.sin(panel.angle),z:0}, d=dot(incoming,n);
    return {x:incoming.x-2*d*n.x,y:incoming.y-2*d*n.y,z:incoming.z};
  }
  function context(scene) {
    if(!scene.acousticContext)Object.defineProperty(scene,'acousticContext',{value:root.MotorcycleCityPaths.create(scene.buildings||[]),enumerable:false,configurable:true});
    return scene.acousticContext;
  }
  function captureFraction(source,scene) {
    const panel=scene.panel;if(scene.config.surface==='none'||!facing(source,panel))return 0;
    const ctx=context(scene),tangent={x:-Math.sin(panel.angle),y:Math.cos(panel.angle)};let fraction=0;
    for(let x=0;x<4;x++)for(let y=0;y<2;y++){
      const patch={...panel,width:panel.width/4,height:panel.height/2,x:panel.x+tangent.x*((x+.5)/4-.5)*panel.width,y:panel.y+tangent.y*((x+.5)/4-.5)*panel.width,z:panel.z+((y+.5)/2-.5)*panel.height};
      if(!ctx.hits(source,patch).length)fraction+=solidAngle(source,patch)/(4*Math.PI);
    }
    return Math.min(.5,fraction);
  }
  function redirectGain(source,receiver,scene) {
    const p=scene.config;if(p.surface==='none')return 0;
    const axis=redirectedAxis(source,scene.panel,p.surface),direction=norm(sub(receiver,scene.panel)),angle=p.coneDegrees*Math.PI/180;
    if(dot(axis,direction)<Math.cos(angle))return 0;
    return Math.sqrt(captureFraction(source,scene)*p.reflectivity*4*Math.PI/(2*Math.PI*(1-Math.cos(angle))))/Math.max(1,dist(scene.panel,receiver));
  }
  function fieldPaths(source,receiver,time,scene) {
    const ctx=context(scene),c=soundSpeed(scene.config),out=[];
    const candidates=ctx.nearby(receiver);
    function original(wall=null){
      let emission=time,path=null,point=null;
      for(let i=0;i<4;i++){
        point=position(source,emission);path=wall?ctx.reflected(point,receiver,wall):ctx.direct(point,receiver);if(!path)return;
        emission=time-path.length/c;
      }
      let transmission=1;
      if(scene.config.surface!=='none'){
        const legs=path.bounce?[[point,path.bounce],[path.bounce,receiver]]:[[point,receiver]];
        for(const[a,b]of legs)if(facing(a,scene.panel)&&blocked(a,b,scene.panel))transmission*=Math.sqrt(scene.config.transmission);
      }
      out.push({...path,id:'original:'+path.id,channel:'original',emissionTime:emission,transmission});
    }
    original();for(const wall of candidates)original(wall);
    if(scene.config.surface==='none')return out;
    const outgoing=[ctx.direct(scene.panel,receiver),...candidates.map(wall=>ctx.reflected(scene.panel,receiver,wall)).filter(Boolean)];
    for(const path of outgoing){
      let emission=time-path.length/c,point;
      for(let i=0;i<4;i++){point=position(source,emission);emission=time-(dist(point,scene.panel)+path.length)/c;}
      const departure=path.bounce||receiver,axis=redirectedAxis(point,scene.panel,scene.config.surface),angle=scene.config.coneDegrees*Math.PI/180;
      if(dot(axis,norm(sub(departure,scene.panel)))<Math.cos(angle))continue;
      const factor=Math.sqrt(captureFraction(point,scene)*scene.config.reflectivity*4*Math.PI/(2*Math.PI*(1-Math.cos(angle))));
      if(factor<=0)continue;
      out.push({...path,id:'returned:'+path.id,channel:'returned',emissionTime:emission,gain:path.gain*factor,transmission:1});
    }
    return out;
  }

  function contributions(source,receiver,time,scene) {
    let free=0,direct=0,returned=0,emissionTime=-1;
    for(const path of fieldPaths(source,receiver,time,scene)){
      const value=pressure(source,path.emissionTime)*path.gain;
      if(path.channel==='original'){free+=value;direct+=value*path.transmission;}
      else{returned+=value;emissionTime=Math.max(emissionTime,path.emissionTime);}
    }
    return {free,direct,returned,emissionTime};
  }

  function secondary(receiver,scene) {
    const taps=[],source={static:scene.speaker};
    for(const path of fieldPaths(source,receiver,30,scene)){
      const gain=path.gain*(path.channel==='original'?path.transmission:1),alpha=1-Math.exp(-2*Math.PI*path.cutoff/C.rate);
      const normalization=1-(1-alpha)**96;
      for(let i=0;i<96;i++)taps.push({delay:(30-path.emissionTime)*C.rate+i,gain:gain*alpha*(1-alpha)**i/normalization});
    }
    return taps;
  }

  function ledger(scene,time,step=0.25) {
    const p=scene.config,c=soundSpeed(p), rows={emitted:0,bypassing:0,inbound:0,reflected:0,absorbed:0,transmitted:0};
    for(const source of scene.sources) for(let t=0;t<time;t+=step) {
      const interval=Math.min(step,time-t), point=position(source,t+interval/2), power=4*Math.PI*(C.p0*10**(sourceLevel(source,t+interval/2)/20))**2/(C.rho*c), energy=power*interval;
      const fraction=captureFraction(point,scene);
      rows.emitted+=energy; rows.bypassing+=energy*(1-fraction);
      if(t+interval/2+dist(point,scene.panel)/c>time) rows.inbound+=energy*fraction;
      else { rows.reflected+=energy*fraction*p.reflectivity; rows.transmitted+=energy*fraction*p.transmission; rows.absorbed+=energy*fraction*(1-p.reflectivity-p.transmission); }
    }
    rows.balanceError=rows.emitted-rows.bypassing-rows.inbound-rows.reflected-rows.absorbed-rows.transmitted;
    return rows;
  }
  root.MotorcycleReflection={C,defaults,validate,startLocation,create,position,pressure,sourceLevel,fieldPaths,contributions,secondary,ledger,soundSpeed,dist,redirectedAxis,solidAngle,facing};
})(globalThis);
