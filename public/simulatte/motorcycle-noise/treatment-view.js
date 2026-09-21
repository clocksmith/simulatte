(function(root){
  function label(B,scene,text,color,metadata){
    const texture=new B.DynamicTexture('marker-text',{width:512,height:96},scene,false),ctx=texture.getContext();texture.hasAlpha=true;
    ctx.fillStyle='rgba(10,22,20,.94)';ctx.fillRect(0,0,512,96);ctx.fillStyle=color;ctx.fillRect(0,0,8,96);ctx.font='600 31px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,264,48);texture.update();
    const mat=new B.StandardMaterial('marker-label',scene);mat.diffuseTexture=texture;mat.emissiveColor=B.Color3.White();mat.disableLighting=true;mat.backFaceCulling=false;mat.useAlphaFromDiffuseTexture=true;
    const mesh=B.MeshBuilder.CreatePlane('label-'+text,{width:10.6,height:2},scene);mesh.material=mat;mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.metadata=metadata;mesh.renderingGroupId=2;
    mesh.onDisposeObservable.add(()=>{mat.dispose();texture.dispose();});return mesh;
  }
  function create(B,scene,vector){
    const nodes=new Map();
    function dispose(entry){for(const mesh of entry.meshes)mesh.dispose();entry.material.dispose();}
    function draw(rows,time,selected){
      const ids=new Set(rows.map(row=>row.id));for(const[id,entry]of nodes)if(!ids.has(id)){dispose(entry);nodes.delete(id);}
      for(const row of rows){
        let entry=nodes.get(row.id);const definition=root.MotorcycleTreatments.kinds[row.kind];if(!definition)continue;
        if(!entry){
          const material=new B.StandardMaterial('treatment-'+row.id,scene);material.diffuseColor=B.Color3.FromHexString(definition.color);material.emissiveColor=material.diffuseColor.scale(.35);material.alpha=.8;
          const body=B.MeshBuilder.CreateCylinder('treatment-'+row.id,{height:1.8,diameter:.9,tessellation:12},scene);body.material=material;body.metadata={treatmentId:row.id};
          const badge=label(B,scene,definition.name+' '+row.id.split('-').pop(),definition.color,{treatmentId:row.id});
          const path=B.MeshBuilder.CreateLines('treatment-path',{points:[B.Vector3.Zero(),B.Vector3.One()],updatable:true},scene);path.color=B.Color3.FromHexString(definition.color);path.isPickable=false;
          const mist=[];if(row.kind==='mist')for(let i=0;i<72;i++){const p=B.MeshBuilder.CreateSphere('mist-droplet',{diameter:.18,segments:6},scene);p.material=material;p.isPickable=false;mist.push(p);}
          entry={body,badge,path,mist,material,meshes:[body,badge,path,...mist]};nodes.set(row.id,entry);
        }
        entry.body.position=vector(row);entry.badge.position=vector({...row,z:row.z+3.5});
        const d=B.Vector3.Distance(scene.activeCamera.globalPosition,entry.body.position);entry.badge.scaling.setAll(Math.max(.65,Math.min(45,d*.012)));entry.body.scaling.setAll(Math.max(1,d*.003));entry.material.alpha=row.active?.85:.3;
        entry.path.setEnabled(row.active&&!!row.target&&(selected===row.id||d<100));
        if(row.target)B.MeshBuilder.CreateLines('treatment-path',{points:[vector(row),vector(row.target.point)],instance:entry.path},scene);
        entry.mist.forEach((mesh,i)=>{mesh.setEnabled(row.active);const age=(time+i*.137)%4.5,phase=i*2.399,spread=.18+age*.24;mesh.position=vector({x:row.x+age*.7+Math.sin(phase+age*.6)*spread,y:row.y+Math.cos(phase+age*.35)*spread,z:Math.max(.05,row.z+age*.45-age*age*.09+Math.sin(phase)*spread*.3)});mesh.scaling.setAll(Math.max(.1,(.8+(i%5)*.18)*(1-age/4.5)));});
      }
    }
    return {draw,dispose(){for(const entry of nodes.values())dispose(entry);nodes.clear();}};
  }
  root.MotorcycleTreatmentView={create,label};
})(globalThis);
