(function(root){
  const palette=['#efad72','#75d3cf','#d4b2ee','#d3d77f','#82b6ee','#ec969c','#8cd3ac','#d8b88e','#bcadee','#9bcede','#e8c36d','#d6a2c8'];
  const colorFor=id=>palette[((Number(String(id).match(/(\d+)$/)?.[1])||1)-1)%palette.length];
  function create(B,scene,origin,initial,onPick){
    const M=root.MotorcycleReflection,vector=p=>new B.Vector3(p.x-origin.x,p.z||0,-(p.y-origin.y));
    const markers=new Map(),prototypes=new Map(),host=document.getElementById('sound-sources');
    const hidden=()=>new B.Vector3(0,-500,0),empty=()=>Array.from({length:48},()=>[hidden(),hidden()]);
    const lines={};for(const [key,color]of [['original','#e6b47e'],['reflected','#9aadc8'],['returned','#7ed6ce']]){lines[key]=B.MeshBuilder.CreateLineSystem('selected-'+key,{lines:empty(),updatable:true},scene);lines[key].color=B.Color3.FromHexString(color);lines[key].isPickable=false;lines[key].alwaysSelectAsActiveMesh=true;lines[key].alpha=.65;}
    const texture=new B.DynamicTexture('selected-source-label',{width:160,height:64},scene,false),labelMaterial=new B.StandardMaterial('selected-source-label',scene);
    labelMaterial.diffuseTexture=texture;labelMaterial.emissiveColor=B.Color3.White();labelMaterial.disableLighting=true;labelMaterial.useAlphaFromDiffuseTexture=true;labelMaterial.backFaceCulling=false;
    const label=B.MeshBuilder.CreatePlane('selected-source-label',{width:5,height:2},scene);label.material=labelMaterial;label.billboardMode=B.Mesh.BILLBOARDMODE_ALL;label.isPickable=false;
    let selected=null,lastAt=-Infinity,sourceList=initial.sources;
    function prototype(color){
      if(prototypes.has(color))return prototypes.get(color);
      const tex=new B.DynamicTexture('traffic-dot-'+color,{width:32,height:32},scene,false),ctx=tex.getContext();ctx.clearRect(0,0,32,32);ctx.fillStyle='#10231ddd';ctx.beginPath();ctx.arc(16,16,15,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.arc(16,16,10,0,Math.PI*2);ctx.fill();tex.update(false);
      const material=new B.StandardMaterial('traffic-dot-'+color,scene);material.diffuseTexture=tex;material.emissiveColor=B.Color3.White();material.disableLighting=true;material.useAlphaFromDiffuseTexture=true;material.backFaceCulling=false;
      const mesh=B.MeshBuilder.CreatePlane('traffic-dot',{size:1},scene);mesh.material=material;mesh.isVisible=false;mesh.isPickable=false;mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;prototypes.set(color,mesh);return mesh;
    }
    function setSources(sources){
      sourceList=sources;for(const marker of markers.values())marker.dispose();markers.clear();host?.replaceChildren();
      for(const source of sources)if(source.kind==='motorcycle'){const dot=prototype(colorFor(source.id)).createInstance(source.id+'-dot');dot.isVisible=true;dot.isPickable=true;dot.billboardMode=B.Mesh.BILLBOARDMODE_ALL;dot.metadata={sourceId:source.id};markers.set(source.id,dot);}
      lastAt=-Infinity;selected=null;
    }
    setSources(initial.sources);
    function draw(state){
      const active=scene.activeCamera,eye=active.globalPosition;
      for(const source of sourceList){const marker=markers.get(source.id);if(!marker)continue;const position=M.position(source,state.time);marker.position=vector({...position,z:3});const distance=B.Vector3.Distance(eye,marker.position);marker.scaling.setAll(Math.max(1.1,Math.min(22,distance*.009)));marker.isVisible=distance>35&&!(active.name==='rider-camera'&&source.id===state.selected);}
      const source=sourceList.find(item=>item.id===state.selected);
      if(!source){label.isVisible=false;for(const line of Object.values(lines))line.isVisible=false;return;}
      const position=M.position(source,state.time);label.position=vector({...position,z:4.3});label.scaling.setAll(Math.max(.7,Math.min(8,B.Vector3.Distance(eye,label.position)*.008)));label.isVisible=active.name!=='rider-camera';
      if(selected!==source.id){selected=source.id;const ctx=texture.getContext();ctx.clearRect(0,0,160,64);ctx.fillStyle='#10231de8';ctx.fillRect(8,5,144,54);ctx.fillStyle=colorFor(source.id);ctx.font='bold 32px monospace';ctx.textAlign='center';ctx.fillText('M'+source.id.split('-').pop(),80,44);texture.update(false);}
      const inspecting=!document.getElementById('inspection').hidden&&!document.getElementById('source-actions').hidden;
      const visible=state.paths||inspecting;for(const line of Object.values(lines))line.isVisible=visible;if(!visible)return;
      if(Math.abs(state.time-lastAt)<.1)return;lastAt=state.time;
      const observer={x:eye.x+origin.x,y:-eye.z+origin.y,z:eye.y};
      const rows={original:[],reflected:[],returned:[]};
      for(const path of M.fieldPaths(source,observer,state.time,state.scene)){
        if(path.emissionTime<0)continue;
        const emitted=M.position(source,path.emissionTime),returned=path.channel==='returned',points=[emitted];
        if(returned)points.push(state.scene.panel);
        if(path.bounce)points.push(path.bounce);
        points.push(observer);
        const key=returned?'returned':path.bounce?'reflected':'original';
        for(let i=1;i<points.length&&rows[key].length<48;i++){
          const a=points[i-1],b=points[i];
          // Do not draw a straight line through a building for a solver path
          // that represents roof diffraction rather than straight visibility.
          if(state.scene.acousticContext.hits(a,b).length&&!path.bounce)continue;
          rows[key].push([vector(a),vector(b)]);
        }
      }
      for(const key of Object.keys(rows)){while(rows[key].length<48)rows[key].push([hidden(),hidden()]);B.MeshBuilder.CreateLineSystem(null,{lines:rows[key],instance:lines[key]},scene);}
    }
    function dispose(){for(const marker of markers.values())marker.dispose();for(const mesh of prototypes.values()){mesh.material.diffuseTexture.dispose();mesh.material.dispose();mesh.dispose();}for(const line of Object.values(lines))line.dispose();label.dispose();texture.dispose();labelMaterial.dispose();}
    return {setSources,draw,dispose};
  }
  root.MotorcycleSoundView={create,colorFor};
})(globalThis);
