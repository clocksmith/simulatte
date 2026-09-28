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
    const texture=new B.DynamicTexture('mist-soft',{width:64,height:64},scene,false),ctx=texture.getContext();
    const gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(218,245,255,.65)');gradient.addColorStop(.35,'rgba(199,235,250,.35)');gradient.addColorStop(1,'rgba(190,230,250,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);texture.hasAlpha=true;texture.update();
    const cloud=new B.StandardMaterial('mist-cloud',scene);cloud.diffuseTexture=texture;cloud.useAlphaFromDiffuseTexture=true;cloud.disableLighting=true;cloud.emissiveColor=B.Color3.White();cloud.backFaceCulling=false;cloud.disableDepthWrite=true;
    function particles(){
      return Array.from({length:112},(_,i)=>{const mesh=B.MeshBuilder.CreatePlane('mist-'+(i<80?'plume':'contact'),{size:1},scene);mesh.material=cloud;mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;return mesh;});
    }
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
          const mist=row.kind==='mist'?particles():[];
          entry={body,badge,path,mist,material,badgeText:'',meshes:[body,badge,path,...mist]};nodes.set(row.id,entry);
        }
        entry.body.position=vector(row);entry.badge.position=vector({...row,z:row.z+3.5});
        const d=B.Vector3.Distance(scene.activeCamera.globalPosition,entry.body.position);entry.badge.scaling.setAll(Math.max(.65,Math.min(45,d*.012)));entry.body.scaling.setAll(Math.max(1,d*.003));entry.material.alpha=row.active?.85:.3;
        entry.path.setEnabled(row.active&&!!row.target&&(selected===row.id||d<100));
        if(row.target)B.MeshBuilder.CreateLines('treatment-path',{points:[vector(row),vector(row.target.point)],instance:entry.path},scene);
        if(row.kind==='mist'){
          const spraying=!!row.burst&&row.active,hit=row.target?.point;
          if(row.burst){
            const progress=Math.min(1,Math.max(0,(time-row.burst.start)/(row.burst.contact-row.burst.start)));
            const text='M'+row.target.source.id.split('-').pop()+' / '+(row.stalled?'Engine stalled':spraying?'Mist contact '+Math.round(progress*100)+'%':'Restarting');
            if(entry.badgeText!==text){entry.badge.material.diffuseTexture.getContext().clearRect(0,0,512,96);const c=entry.badge.material.diffuseTexture.getContext();c.fillStyle='rgba(10,22,20,.94)';c.fillRect(0,0,512,96);c.fillStyle=row.stalled?'#ffd59d':'#c9f0ff';c.fillRect(0,0,8,96);c.font='600 31px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(text,264,48);entry.badge.material.diffuseTexture.update();entry.badgeText=text;}
            entry.badge.position=vector({...hit,z:hit.z+3});entry.badge.metadata={sourceId:row.target.source.id};
            entry.badge.scaling.setAll(Math.max(.5,Math.min(45,B.Vector3.Distance(scene.activeCamera.globalPosition,entry.badge.position)*.012)));
          }
          entry.path.setEnabled(false);
          entry.mist.forEach((mesh,i)=>{
            const contact=i>=80;mesh.setEnabled(row.active&&(!contact||spraying));if(!row.active)return;
            const phase=i*2.399,age=(time*1.6+i*.137)%1;
            let point,size;
            if(spraying){
              const dx=hit.x-row.x,dy=hit.y-row.y,length=Math.max(.1,Math.hypot(dx,dy)),side={x:-dy/length,y:dx/length};
              if(contact){const radius=.25+age*1.2;point={x:hit.x+Math.sin(phase)*radius,y:hit.y+Math.cos(phase)*radius,z:Math.max(.05,hit.z+.65-age*.95)};size=.35+age*.8;}
              else{const spread=.1+age*.65,wave=Math.sin(phase+time*2)*spread;point={x:row.x+dx*age+side.x*wave,y:row.y+dy*age+side.y*wave,z:row.z+(hit.z-row.z)*age+Math.cos(phase+time)*spread*.5};size=.2+age*.9;}
            }else{const spread=.3+age*.7;point={x:row.x+age*2+Math.sin(phase)*spread,y:row.y+Math.cos(phase)*spread,z:Math.max(.05,row.z+age*.6-age*age*.8)};size=.3+age*.8;}
            mesh.position=vector(point);mesh.scaling.setAll(size);mesh.visibility=(contact?.85:.65)*Math.sin(Math.PI*age);
          });
        }
      }
    }
    return {draw,dispose(){for(const entry of nodes.values())dispose(entry);nodes.clear();cloud.dispose();texture.dispose();}};
  }
  root.MotorcycleTreatmentView={create,label};
})(globalThis);
