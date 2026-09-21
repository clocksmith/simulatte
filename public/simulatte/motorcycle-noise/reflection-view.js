(function(root){
  async function create(canvas,map,initial,onPick){
    const trackResponse=await fetch('./mccarren-track.json?v=park-vtwin-v3');
    if(!trackResponse.ok)throw new Error('McCarren track geometry HTTP '+trackResponse.status);
    const trackData=await trackResponse.json();
    if(trackData.schema!=='simulatte.mccarrenTrack.v1'||trackData.origin.latitude!==map.origin.latitude||trackData.origin.longitude!==map.origin.longitude)throw new Error('McCarren track coordinate system differs from city map');
    const B=root.BABYLON;let engine;
    if(navigator.gpu){try{engine=new B.WebGPUEngine(canvas,{antialias:true});await engine.initAsync();}catch(error){engine?.dispose();const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;engine=null;}}
    if(!engine)engine=new B.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true});
    engine.setHardwareScalingLevel(Math.max(1,(root.devicePixelRatio||1)/1.5));
    const scene=new B.Scene(engine);scene.clearColor=new B.Color4(.055,.08,.075,1);
    scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=.00018;scene.fogColor=new B.Color3(.13,.19,.19);
    const origin=initial.center,vector=p=>new B.Vector3(p.x-origin.x,p.z||0,-(p.y-origin.y));
    const parkRows=(map.parks||[]).filter(row=>/mccarren/i.test(row.label||''));
    const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-q.x*p.y;},0));
    const parkShape=parkRows.slice().sort((a,b)=>area(b.outerRing)-area(a.outerRing))[0];
    const parkPoints=parkRows.flatMap(row=>row.outerRing);
    const fallback=map.places.find(row=>/mccarren/i.test(row.label))?.position||initial.center;
    const parkCenter=parkPoints.length?{x:(Math.min(...parkPoints.map(p=>p.x))+Math.max(...parkPoints.map(p=>p.x)))/2,y:(Math.min(...parkPoints.map(p=>p.y))+Math.max(...parkPoints.map(p=>p.y)))/2,z:0}:fallback;
    const parkSouth=parkShape?parkShape.outerRing.reduce((lowest,p)=>p.y<lowest.y?p:lowest,parkShape.outerRing[0]):fallback;
    const startCenter=initial.startLocation||root.MotorcycleReflection.startLocation(map);
    const openingTarget={x:startCenter.x,y:(parkSouth.y+parkCenter.y)/2,z:0};
    const openingDistance=Math.max(140,openingTarget.y-startCenter.y),openingHeight=110;
    const openingRadius=Math.hypot(openingDistance,openingHeight),openingBeta=Math.atan2(openingDistance,openingHeight);
    const camera=new B.ArcRotateCamera('city-camera',Math.PI/2,openingBeta,openingRadius,vector(openingTarget),scene);
    camera.lowerRadiusLimit=25;camera.upperRadiusLimit=5000;camera.upperBetaLimit=1.48;camera.lowerBetaLimit=.1;
    camera.wheelDeltaPercentage=.01;camera.panningSensibility=30;camera.inertia=.7;camera.attachControl(canvas,true);
    const onboardRig=new B.TransformNode('onboard-rig',scene);
    const onboard=new B.UniversalCamera('rider-camera',new B.Vector3(0,1.7,.5),scene);
    onboard.parent=onboardRig;onboard.minZ=.05;onboard.fov=.95;onboard.speed=0;onboard.inputs.removeByType('FreeCameraKeyboardMoveInput');
    const observerCamera=new B.UniversalCamera('observer-camera',vector(initial.receiver),scene);
    observerCamera.minZ=.1;observerCamera.fov=.95;observerCamera.speed=2.5;observerCamera.inertia=.7;
    scene.activeCamera=camera;
    let followed=null,openingPending=true;
    let cameraMode='map',current=initial,lastTime=0,lastSource=null,selectedId=null,savedRadius=openingRadius;
    const receiverMarkers=new Map();
    new B.HemisphericLight('sky',new B.Vector3(0,1,0),scene).intensity=.8;
    const sunlight=new B.DirectionalLight('sun',new B.Vector3(-.4,-1,.3),scene);sunlight.intensity=1.2;sunlight.position=new B.Vector3(90,180,-60);
    const material=(name,color,alpha=1)=>{const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.08,.08,.08);m.alpha=alpha;return m;};
    const ground=B.MeshBuilder.CreateGround('water-ground',{width:9000,height:9000},scene);ground.position.y=-.2;ground.material=material('water','#233b43');ground.metadata={ground:true};
    const city=root.MotorcycleBabylonCity.create(B,scene,{...map,tracks:trackData.tracks},origin,sunlight);city.setSources(initial.sources);
    const panel=B.MeshBuilder.CreateBox('redirecting-surface',{size:1},scene);panel.material=material('surface','#75c4be',.8);
    const emitter=B.MeshBuilder.CreateBox('secondary-emitter',{width:.6,height:1,depth:.5},scene);emitter.material=material('emitter','#c5afe6');
    const soundView=root.MotorcycleSoundView.create(B,scene,origin,initial,onPick),heatMeshes=[];
    const treatmentView=root.MotorcycleTreatmentView.create(B,scene,vector);let treatmentSelection=null;
    function setSources(sources){city.setSources(sources);soundView.setSources(sources);}
    function showMeasurements(record,mode='total'){
      for(const mesh of heatMeshes)mesh.dispose();heatMeshes.length=0;
      if(!record?.points?.length)return;
      const rows=record.points,xs=[...new Set(rows.map(row=>row.point.x))].sort((a,b)=>a-b),ys=[...new Set(rows.map(row=>row.point.y))].sort((a,b)=>a-b);
      const positions=[],indices=[],colors=[],lookup=new Map();
      function shade(value){
        if(mode==='change')return B.Color3.Lerp(B.Color3.FromHexString('#a4ada6'),B.Color3.FromHexString(value<0?'#48c7b2':'#f38a64'),Math.min(1,Math.abs(value)/8));
        const stops=['#407fb3','#43afa8','#c1d877','#edb65a','#d96251'],scaled=Math.max(0,Math.min(3.999,(value-30)/25));
        return B.Color3.Lerp(B.Color3.FromHexString(stops[Math.floor(scaled)]),B.Color3.FromHexString(stops[Math.floor(scaled)+1]),scaled%1);
      }
      for(const row of rows){const value=mode==='change'?row.change:row[mode];if(!Number.isFinite(value))continue;const index=positions.length/3,color=shade(value);positions.push(row.point.x-origin.x,.16,-(row.point.y-origin.y));colors.push(color.r,color.g,color.b,.58);lookup.set(xs.indexOf(row.point.x)+':'+ys.indexOf(row.point.y),index);}
      const spacing=record.gridSpacing||12;
      positions.length=0;colors.length=0;indices.length=0;
      for(const row of rows){const value=mode==='change'?row.change:row[mode];if(!Number.isFinite(value))continue;
        const base=positions.length/3,color=shade(value),half=spacing*.49;
        for(const[dx,dy]of [[-half,-half],[half,-half],[half,half],[-half,half]]){positions.push(row.point.x+dx-origin.x,.16,-(row.point.y+dy-origin.y));colors.push(color.r,color.g,color.b,.48);}
        indices.push(base,base+1,base+2,base,base+2,base+3);
      }
      const mesh=new B.Mesh('sampled-sound-map',scene),data=new B.VertexData(),normals=[];
      data.positions=positions;data.indices=indices;data.colors=colors;B.VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(mesh);
      const mat=material('sound-map','#ffffff');mat.disableLighting=true;mat.emissiveColor=B.Color3.White();mat.backFaceCulling=false;mesh.material=mat;mesh.hasVertexAlpha=true;mesh.isPickable=false;heatMeshes.push(mesh);mesh.onDisposeObservable.add(()=>mat.dispose());
    }
    function setReceiverMarkers(markers,selected){
      for(const mesh of receiverMarkers.values()){mesh.metadata?.badge?.dispose();mesh.dispose();}receiverMarkers.clear();
      for(const marker of markers){const mesh=B.MeshBuilder.CreateSphere('receiver-'+marker.id,{diameter:1.4,segments:8},scene),mat=material('receiver-marker-'+marker.id,marker.id===selected?'#ffffff':'#d2f49a');mat.emissiveColor=B.Color3.FromHexString(marker.id===selected?'#ffffff':'#a4c782');mesh.material=mat;mesh.position=vector(marker);const badge=root.MotorcycleTreatmentView.label(B,scene,marker.name,'#d2f49a',{receiverId:marker.id});badge.position=vector({...marker,z:marker.z+3.5});mesh.metadata={receiverId:marker.id,badge};mesh.onDisposeObservable.add(()=>mat.dispose());receiverMarkers.set(marker.id,mesh);}
    }
    function targetPoint(){return {x:camera.target.x+origin.x,y:-camera.target.z+origin.y,z:1.7};}
    function sidewalkAt(point){
      let best=null,bestDistance=Infinity;
      for(const street of map.streets)for(let i=1;i<street.geometry.length;i++){
        const a=street.geometry[i-1],b=street.geometry[i],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(l2<1)continue;
        const f=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/l2)),length=Math.sqrt(l2),offset=(street.widthM||8)/2+1.6;
        for(const side of [-1,1]){
          const candidate={x:a.x+f*dx+dy/length*offset*side,y:a.y+f*dy-dx/length*offset*side,z:1.7};
          const distance=Math.hypot(candidate.x-point.x,candidate.y-point.y);
          if(distance<bestDistance&&!current.acousticContext.occupied(candidate)){best=candidate;bestDistance=distance;}
        }
      }
      return best||{...current.receiver};
    }
    function rooftopAt(point){
      let nearest=null,best=Infinity;
      for(const building of map.buildings){const ring=building.footprint;if(!ring?.length)continue;const middle=ring.reduce((p,q)=>({x:p.x+q.x/ring.length,y:p.y+q.y/ring.length}),{x:0,y:0}),distance=Math.hypot(middle.x-point.x,middle.y-point.y);if(distance<best){best=distance;nearest=building;}}
      if(!nearest)return {...point,z:20};
      const flat=[],holes=[],rings=[nearest.footprint,...(nearest.interiorRings||[])];
      for(let i=0;i<rings.length;i++){if(i)holes.push(flat.length/2);for(const p of rings[i])flat.push(p.x,p.y);}
      const triangle=root.earcut(flat,holes).slice(0,3);
      if(triangle.length<3)return {...point,z:(nearest.heightM||9)+1.7};
      return {x:triangle.reduce((sum,i)=>sum+flat[i*2]/3,0),y:triangle.reduce((sum,i)=>sum+flat[i*2+1]/3,0),z:(nearest.heightM||9)+1.7};
    }
    function trafficCandidates(point,northOnly=false){
      const M=root.MotorcycleReflection,rows=current.sources.filter(source=>source.kind==='motorcycle').map(source=>({id:source.id,...M.position(source,lastTime)}));
      for(const row of rows){
        row.distance=Math.hypot(row.x-point.x,row.y-point.y);
        row.neighbors=0;row.ahead=0;
        for(const other of rows){const dx=other.x-row.x,dy=other.y-row.y,d=Math.hypot(dx,dy);if(d>1&&d<55){row.neighbors++;if(dx*Math.cos(row.heading)+dy*Math.sin(row.heading)>4)row.ahead++;}}
        row.score=row.neighbors*3+Math.min(3,row.speed||0)-row.distance/12;
        if(northOnly)row.score-=Math.abs(row.x-point.x)/5;
      }
      const eligible=northOnly?rows.filter(row=>row.y>point.y+20):rows;
      return eligible.sort((a,b)=>b.score-a.score);
    }
    function visibleTraffic(point,preferred=null){
      const candidates=trafficCandidates(point);
      if(preferred)candidates.unshift(preferred);
      return candidates.find(target=>Math.hypot(target.x-point.x,target.y-point.y)>2&&!current.acousticContext.hits(point,{...target,z:1}).length)||null;
    }
    function trafficView(point,mode){
      const candidates=trafficCandidates(point);
      for(const target of candidates.slice(0,12)){
        const position=mode==='rooftop'?rooftopAt(target):sidewalkAt({x:target.x-Math.cos(target.heading)*12,y:target.y-Math.sin(target.heading)*12});
        if(mode==='free')position.z=3;
        const visible=visibleTraffic(position,target);
        if(visible)return {position,target:visible};
      }
      const position=mode==='rooftop'?rooftopAt(point):sidewalkAt(point);
      return {position,target:visibleTraffic(position)};
    }
    function activateObserver(point,mode,target=visibleTraffic(point)){
      scene.activeCamera.detachControl();cameraMode=mode;observerCamera.position.copyFrom(vector(point));observerCamera.setTarget(vector(target?{...target,z:1}:{x:point.x,y:point.y+30,z:point.z}));observerCamera.speed=mode==='free'?2.5:0;scene.activeCamera=observerCamera;observerCamera.attachControl(canvas,true);
    }
    function setCameraMode(mode){
      followed=null;
      if(!['map','sidewalk','rooftop','rider','free'].includes(mode))return;
      if(cameraMode==='map')savedRadius=camera.radius;
      const point=cameraMode==='map'?targetPoint():getObserver();
      if(['sidewalk','rooftop','free'].includes(mode)){const destination=trafficView(point,mode);activateObserver(destination.position,mode,destination.target);return;}
      scene.activeCamera.detachControl();cameraMode=mode;
      if(mode==='rider'){onboard.rotation.set(0,0,0);scene.activeCamera=onboard;onboard.attachControl(canvas,true);}
      else{scene.activeCamera=camera;const target=trafficCandidates(point)[0];if(target){camera.setTarget(vector(target));camera.radius=145;camera.beta=.78;camera.alpha=Math.PI/2;}else camera.radius=savedRadius;camera.attachControl(canvas,true);}
    }
    function placeObserver(point,mode){activateObserver(point,mode||'sidewalk');}
    function getObserver(){
      const active=scene.activeCamera,p=active.globalPosition||active.position,right=active.getDirection(B.Axis.X);
      return {x:p.x+origin.x,y:-p.z+origin.y,z:p.y,right:{x:right.x,y:-right.z},sourceId:cameraMode==='rider'?selectedId:null,mode:cameraMode};
    }
    function getFocus(){
      const point=cameraMode==='map'?targetPoint():getObserver();
      return {x:point.x,y:point.y,span:cameraMode==='map'?Math.max(80,Math.min(4200,camera.radius*1.35)):200};
    }
    function homePark(){
      followed=null;
      scene.activeCamera.detachControl();cameraMode='map';scene.activeCamera=camera;
      const traffic=trafficCandidates(startCenter,true)[0];
      const target=traffic?{x:traffic.x,y:traffic.y,z:0}:openingTarget;
      camera.alpha=Math.PI/2;camera.beta=traffic?.85:openingBeta;camera.radius=traffic?155:openingRadius;savedRadius=camera.radius;camera.setTarget(vector(target));
      camera.inertialAlphaOffset=0;camera.inertialBetaOffset=0;camera.inertialRadiusOffset=0;camera.inertialPanningX=0;camera.inertialPanningY=0;
      camera.attachControl(canvas,true);
    }
    function nearestMotorcycle(){
      return trafficCandidates(getObserver()).sort((a,b)=>(b.score+b.ahead*5)-(a.score+a.ahead*5))[0]?.id||null;
    }
    function focusSource(id){const source=current.sources.find(item=>item.id===id);if(!source)return;setCameraMode('map');camera.setTarget(vector(root.MotorcycleReflection.position(source,lastTime)));camera.radius=100;followed=id;}
    function pickScene(pick){if(!pick?.hit)return;
      if(pick.pickedMesh.metadata?.treatmentId)onPick({treatmentId:pick.pickedMesh.metadata.treatmentId});
      else if(pick.pickedMesh.metadata?.receiverId)onPick({receiverId:pick.pickedMesh.metadata.receiverId});
      else if(pick.pickedMesh.metadata?.sourceId)onPick({sourceId:pick.pickedMesh.metadata.sourceId});
      else if(pick.pickedPoint&&pick.pickedMesh.name!=='nyc-walls'&&pick.pickedMesh.name!=='water-ground')onPick({point:{x:pick.pickedPoint.x+origin.x,y:-pick.pickedPoint.z+origin.y,z:pick.pickedPoint.y+1.7},surface:pick.pickedMesh.name==='nyc-roofs'?'rooftop':'sidewalk'});
    }
    scene.onPointerObservable.add(info=>{if(info.type===B.PointerEventTypes.POINTERDOWN||info.type===B.PointerEventTypes.POINTERWHEEL)followed=null;if(info.type===B.PointerEventTypes.POINTERTAP)pickScene(info.pickInfo);});
    const gestures=root.MotorcycleMapGestures.create({B,scene,canvas,getCamera:()=>scene.activeCamera,onTap:pickScene,onHome:homePark,onInteract:()=>{followed=null;}});
    const resize=()=>engine.resize();root.addEventListener('resize',resize);
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);
    function draw(state){
      const M=root.MotorcycleReflection,s=state.scene,t=state.time;current=s;lastTime=t;
      if(openingPending){openingPending=false;homePark();}
      if(followed&&cameraMode==='map'){const source=s.sources.find(row=>row.id===followed);if(source)camera.setTarget(vector(M.position(source,t)));}
      for(const source of s.sources){const mesh=city.vehicles.get(source.id),p=M.position(source,t);if(!mesh)continue;mesh.position=vector({...p,z:0});mesh.rotation.y=p.heading+Math.PI/2;city.animate(mesh,p,source.kind);}
      panel.position=vector(s.panel);panel.scaling.set(s.panel.width,s.panel.height,.35);panel.rotation.y=s.panel.angle+Math.PI/2;panel.isVisible=s.config.surface!=='none';
      emitter.position=vector(s.speaker);emitter.isVisible=s.config.cancellation;
      const tracked=s.sources.find(source=>source.id===state.selected)||s.sources.find(source=>source.kind==='motorcycle');
      if(tracked){selectedId=tracked.id;lastSource=M.position(tracked,t);onboardRig.position.copyFrom(vector({...lastSource,z:0}));onboardRig.rotation.set(0,lastSource.heading+Math.PI/2,-(lastSource.lean||0)*.3);}
      for(const marker of receiverMarkers.values()){const scale=Math.max(1,B.Vector3.Distance(scene.activeCamera.globalPosition,marker.position)*.012);marker.scaling.setAll(scale);marker.metadata.badge.scaling.setAll(Math.min(45,scale));}
      treatmentView.draw(root.MotorcycleTreatments.states(s,t),t,treatmentSelection);
      soundView.draw(state);engine.beginFrame();try{scene.render();}finally{engine.endFrame();}
    }
    function focus(name){const place=map.places.find(row=>row.label===name);if(place){setCameraMode('map');const traffic=trafficCandidates(place.position)[0];camera.setTarget(vector(traffic||place.position));camera.radius=190;camera.beta=.78;camera.alpha=Math.PI/2;}}
    homePark();
    return {snapSidewalk:sidewalkAt,setTreatmentSelection(id){treatmentSelection=id;},draw,setSources,showMeasurements,setReceiverMarkers,setCameraMode,getFocus,getObserver,placeObserver,focusSource,focus,homePark,nearestMotorcycle,backend:engine instanceof B.WebGPUEngine?'WebGPU':'WebGL',dispose(){gestures.dispose();resizeObserver.disconnect();root.removeEventListener('resize',resize);treatmentView.dispose();soundView.dispose();city.dispose();scene.dispose();engine.dispose();}};
  }
  root.MotorcycleReflectionView={create};
})(globalThis);
