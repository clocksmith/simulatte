(function(root){
  async function create(canvas,map,initial,onPick){
    const B=root.BABYLON; let engine;
    if(navigator.gpu) {
      try { engine=new B.WebGPUEngine(canvas,{antialias:true}); await engine.initAsync(); }
      catch(error) { engine?.dispose(); const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;engine=null; }
    }
    if(!engine) engine=new B.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true});
    engine.setHardwareScalingLevel(Math.max(1, (root.devicePixelRatio || 1) / 1.5));
    const scene=new B.Scene(engine); scene.clearColor=new B.Color4(0.055,0.08,0.075,1);
    scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=0.00035;scene.fogColor=new B.Color3(0.13,0.19,0.19);
    const origin=initial.center;
    const vector=p=>new B.Vector3(p.x-origin.x,p.z||0,-(p.y-origin.y));
    const camera=new B.ArcRotateCamera('city-camera',-Math.PI/2.5,0.75,180,new B.Vector3(0,0,0),scene);
    camera.attachControl(canvas,true); camera.lowerRadiusLimit=25; camera.upperRadiusLimit=1800; camera.upperBetaLimit=1.48; camera.lowerBetaLimit=0.15;
    camera.wheelDeltaPercentage=0.01; camera.panningSensibility=30; camera.inertia=0.7;
    new B.HemisphericLight('sky',new B.Vector3(0,1,0),scene).intensity=0.8;
    const sunlight=new B.DirectionalLight('sun',new B.Vector3(-0.4,-1,0.3),scene); sunlight.intensity=1.2;
    sunlight.position=new B.Vector3(90,180,-60);
    const material=(name,color,alpha=1)=>{const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(0.08,0.08,0.08);m.alpha=alpha;return m;};
    const ground=B.MeshBuilder.CreateGround('water-ground',{width:9000,height:9000},scene);
    ground.position.y=-0.2;ground.material=material('water','#233b43');ground.metadata={ground:true};
    const cityRendering=root.MotorcycleBabylonCity.create(B,scene,map,origin,sunlight);
    const vehicles=cityRendering.vehicles;
    const setSources=sources=>cityRendering.setSources(sources);
    setSources(initial.sources);
    const panel=B.MeshBuilder.CreateBox('redirecting-surface',{size:1},scene);panel.material=material('surface','#75c4be',0.8);
    const listener=B.MeshBuilder.CreateSphere('listener',{diameter:1.1,segments:12},scene);listener.material=material('listener','#d2f49a');
    const emitter=B.MeshBuilder.CreateBox('secondary-emitter',{width:0.6,height:1,depth:0.5},scene);emitter.material=material('emitter','#c5afe6');
    const reference=B.MeshBuilder.CreateSphere('reference-microphone',{diameter:0.7,segments:8},scene);reference.material=material('microphone','#90bbf0');
    const waveLines=[];for(let i=0;i<16;i++){const mesh=B.MeshBuilder.CreateLines(`wave-${i}`,{points:Array.from({length:49},()=>B.Vector3.Zero()),updatable:true},scene);mesh.isPickable=false;waveLines.push(mesh);}
    const heatMeshes=[];let record=null,heatMode='total';
    function showMeasurements(next,mode='total'){
      record=next;heatMode=mode;for(const mesh of heatMeshes)mesh.dispose();heatMeshes.length=0;
      if(!record?.points.length)return;
      const rows=record.points,geometry=root.MotorcycleCityPaths.create(map.buildings);
      const minX=Math.min(...rows.map(row=>row.point.x)),maxX=Math.max(...rows.map(row=>row.point.x));
      const minY=Math.min(...rows.map(row=>row.point.y)),maxY=Math.max(...rows.map(row=>row.point.y));
      const positions=[],indices=[],colors=[];
      function valueAt(x,y){
        if(geometry.occupied({x,y}))return null;
        let weight=0,energy=0,baseline=0,nearest=Infinity;
        for(const row of rows){
          const distance=Math.hypot(x-row.point.x,y-row.point.y);nearest=Math.min(nearest,distance);
          if(distance>18)continue;
          const value=mode==='change'?row.total:row[mode];
          if(!Number.isFinite(value))continue;
          const w=1/Math.max(.25,distance*distance);weight+=w;energy+=w*Math.pow(10,value/10);
          if(mode==='change')baseline+=w*Math.pow(10,row.baseline/10);
        }
        if(!weight||nearest>13)return null;
        return mode==='change'?10*Math.log10(energy/Math.max(1e-12,baseline)):10*Math.log10(energy/weight);
      }
      function shade(value){
        if(mode==='change'){
          const amount=Math.min(1,Math.abs(value)/8);
          return B.Color3.Lerp(B.Color3.FromHexString('#a4ada6'),B.Color3.FromHexString(value<0?'#48c7b2':'#f38a64'),amount);
        }
        const stops=['#407fb3','#43afa8','#c1d877','#edb65a','#d96251'];
        const scaled=Math.max(0,Math.min(3.999,(value-35)/15));
        return B.Color3.Lerp(B.Color3.FromHexString(stops[Math.floor(scaled)]),B.Color3.FromHexString(stops[Math.floor(scaled)+1]),scaled%1);
      }
      for(let y=minY;y<maxY;y+=2)for(let x=minX;x<maxX;x+=2){
        const corners=[[x,y],[x+2,y],[x+2,y+2],[x,y+2]],values=corners.map(([px,py])=>valueAt(px,py));
        if(values.some(value=>value===null))continue;
        const offset=positions.length/3;
        corners.forEach(([px,py],i)=>{const color=shade(values[i]);positions.push(px-origin.x,.14,-(py-origin.y));colors.push(color.r,color.g,color.b,.64);});
        indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
      }
      const mesh=new B.Mesh('interpolated-street-samples',scene),data=new B.VertexData();
      data.positions=positions;data.indices=indices;data.colors=colors;
      const normals=[];B.VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(mesh);
      const mat=material('sound-map','#ffffff');mat.disableLighting=true;mat.emissiveColor=B.Color3.White();mat.backFaceCulling=false;
      mesh.material=mat;mesh.hasVertexAlpha=true;mesh.isPickable=false;mesh.renderingGroupId=0;heatMeshes.push(mesh);
      mesh.onDisposeObservable.add(()=>mat.dispose());
    }
    scene.onPointerObservable.add(info=>{if(info.type!==B.PointerEventTypes.POINTERTAP)return;const pick=info.pickInfo;if(!pick?.hit)return;
      if(pick.pickedMesh.metadata?.sourceId)onPick({sourceId:pick.pickedMesh.metadata.sourceId});
      else if(pick.pickedPoint)onPick({point:{x:pick.pickedPoint.x+origin.x,y:-pick.pickedPoint.z+origin.y,z:1.5}});
    });
    const resize=()=>engine.resize();root.addEventListener('resize',resize);
    function draw(state){
      const M=root.MotorcycleReflection,s=state.scene,t=state.time,c=M.soundSpeed(s.config);
      for(const source of s.sources){const mesh=vehicles.get(source.id),p=M.position(source,t);if(!mesh)continue;mesh.position=vector({...p,z:0});mesh.rotation.y=p.heading+Math.PI/2;cityRendering.animate(mesh,p,source.kind);}
      panel.position=vector(s.panel);panel.scaling.set(s.panel.width,s.panel.height,0.35);panel.rotation.y=s.panel.angle+Math.PI/2;panel.isVisible=s.config.surface!=='none';
      listener.position=vector(s.receiver);emitter.position=vector(s.speaker);emitter.isVisible=s.config.cancellation;reference.position=vector(s.reference);
      const selected=s.sources.find(row=>row.id===state.selected)||s.sources.find(row=>row.kind==='motorcycle');
      waveLines.forEach(line=>line.isVisible=false);
      if(state.paths&&selected){
        for(let k=0;k<8;k++){
          const emitted=Math.floor(t/0.25)*0.25-k*0.25;if(emitted<0)continue;
          const point=M.position(selected,emitted),radius=(t-emitted)*c;
          if(radius<500){const points=Array.from({length:49},(_,i)=>vector({x:point.x+Math.cos(i/48*2*Math.PI)*radius,y:point.y+Math.sin(i/48*2*Math.PI)*radius,z:0.4}));B.MeshBuilder.CreateLines('wave',{points,instance:waveLines[k]},scene);waveLines[k].color=B.Color3.FromHexString('#efa969');waveLines[k].alpha=0.3;waveLines[k].isVisible=true;}
          const arrival=emitted+M.dist(point,s.panel)/c,returnedRadius=(t-arrival)*c;
          if(s.config.surface==='none'||returnedRadius<=0||returnedRadius>500||!M.facing(point,s.panel))continue;
          const axis=M.redirectedAxis(point,s.panel,s.config.surface),angle=Math.atan2(axis.y,axis.x),half=s.config.coneDegrees*Math.PI/180;
          const points=Array.from({length:49},(_,i)=>vector({x:s.panel.x+Math.cos(angle-half+2*half*i/48)*returnedRadius,y:s.panel.y+Math.sin(angle-half+2*half*i/48)*returnedRadius,z:0.6}));
          B.MeshBuilder.CreateLines('returned-wave',{points,instance:waveLines[k+8]},scene);waveLines[k+8].color=B.Color3.FromHexString('#79dfd8');waveLines[k+8].alpha=0.55;waveLines[k+8].isVisible=true;
        }
      }
      engine.beginFrame();
      try {
        scene.render();
      } finally {
        engine.endFrame();
      }
    }
    function focus(name){const place=map.places.find(row=>row.label===name);if(place){camera.setTarget(vector(place.position));camera.radius=350;}}
    return {draw,setSources,showMeasurements,focus,backend:engine instanceof B.WebGPUEngine?'WebGPU':'WebGL',
      dispose(){root.removeEventListener('resize',resize);cityRendering.dispose();scene.dispose();engine.dispose();}};
  }
  root.MotorcycleReflectionView={create};
})(globalThis);
