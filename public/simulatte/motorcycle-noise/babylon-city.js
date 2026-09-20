(function(root){
  function create(B,scene,map,origin,sunlight){
    const vector=p=>new B.Vector3(p.x-origin.x,p.z||0,-(p.y-origin.y));
    const material=(name,color)=>{const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.07,.07,.07);return m;};
    const pavement=material('asphalt','#353e3e'),sidewalk=material('sidewalk','#7c8378'),roofMaterial=material('roofs','#87928a'),wallMaterial=material('facades','#c0c1aa'),land=material('land','#435c4b');
    const facadeTexture=new B.DynamicTexture('facade-pattern',{width:64,height:128},scene,false),paint=facadeTexture.getContext();
    paint.fillStyle='#b7b8a6';paint.fillRect(0,0,64,128);paint.fillStyle='#5e706d';
    for(let y=12;y<128;y+=32)for(let x=10;x<64;x+=27){paint.fillRect(x,y,16,20);paint.fillStyle='#899c93';paint.fillRect(x+2,y+2,11,2);paint.fillStyle='#5e706d';}
    paint.fillStyle='#9c9e90';for(let y=0;y<128;y+=32)paint.fillRect(0,y,64,2);facadeTexture.update(false);wallMaterial.diffuseTexture=facadeTexture;
    let shadow;try{shadow=new B.CascadedShadowGenerator(1024,sunlight);shadow.numCascades=3;shadow.shadowMaxZ=650;shadow.lambda=.65;shadow.usePercentageCloserFiltering=true;}
    catch(error){shadow=new B.ShadowGenerator(1024,sunlight);shadow.useBlurExponentialShadowMap=true;shadow.blurKernel=16;}
    shadow.bias=.001;shadow.normalBias=.03;shadow.setDarkness(.35);
    function mesh(name,positions,indices,uvs,mat,colors=null){
      const out=new B.Mesh(name,scene),data=new B.VertexData(),normals=[];B.VertexData.ComputeNormals(positions,indices,normals);
      data.positions=positions;data.indices=indices;data.normals=normals;if(uvs)data.uvs=uvs;if(colors)data.colors=colors;data.applyToMesh(out);out.material=mat;out.receiveShadows=true;return out;
    }
    for(const item of map.land){const ring=item.outerRing;if(!ring?.length)continue;const flat=ring.flatMap(p=>[p.x-origin.x,-(p.y-origin.y)]),positions=[];for(let i=0;i<flat.length;i+=2)positions.push(flat[i],0,flat[i+1]);const surface=mesh(item.id,positions,root.earcut(flat),null,land);surface.metadata={ground:true};}
    const wallP=[],wallI=[],wallUv=[],wallColors=[],roofP=[],roofI=[],roofColors=[];
    for(const building of map.buildings){
      const height=Math.max(3,building.heightM||9),rings=[building.footprint,...(building.interiorRings||[])].filter(ring=>ring?.length>=3);if(!rings.length)continue;
      const flat=[],holes=[],base=roofP.length/3,shade=.82+(height%13)/65;
      for(let ri=0;ri<rings.length;ri++){if(ri)holes.push(flat.length/2);for(const p of rings[ri]){flat.push(p.x-origin.x,-(p.y-origin.y));roofP.push(p.x-origin.x,height,-(p.y-origin.y));roofColors.push(shade,shade,shade,1);}}
      for(const i of root.earcut(flat,holes))roofI.push(base+i);
      for(const ring of rings)for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],offset=wallP.length/3,length=Math.hypot(a.x-b.x,a.y-b.y);
        wallP.push(a.x-origin.x,0,-(a.y-origin.y),b.x-origin.x,0,-(b.y-origin.y),b.x-origin.x,height,-(b.y-origin.y),a.x-origin.x,height,-(a.y-origin.y));
        wallI.push(offset,offset+1,offset+2,offset,offset+2,offset+3);wallUv.push(0,0,length/5,0,length/5,height/12,0,height/12);
        for(let j=0;j<4;j++)wallColors.push(shade,shade*.99,shade*.94,1);
      }
    }
    for(const buildingMesh of [mesh('nyc-walls',wallP,wallI,wallUv,wallMaterial,wallColors),mesh('nyc-roofs',roofP,roofI,null,roofMaterial,roofColors)]){buildingMesh.material.backFaceCulling=false;shadow.addShadowCaster(buildingMesh);buildingMesh.isPickable=true;}
    const asphalt=[],walkways=[],laneLines=[];
    for(const street of map.streets){
      const points=street.geometry;if(points.length<2)continue;const width=Math.max(3,street.widthM||7),edges=[[],[],[],[]];
      for(let i=0;i<points.length;i++){
        const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],d=Math.hypot(b.x-a.x,b.y-a.y)||1;
        for(let side=0;side<4;side++){const amount=(side<2?width/2:width/2+1.7)*(side%2?-1:1);edges[side].push(vector({x:points[i].x+(b.y-a.y)/d*amount,y:points[i].y-(b.x-a.x)/d*amount,z:side<2?.08:.05}));}
        if(i&&width>=7){const p=points[i-1],q=points[i],len=Math.hypot(q.x-p.x,q.y-p.y);for(let at=1;at+2<len;at+=7)laneLines.push([vector({x:p.x+(q.x-p.x)*at/len,y:p.y+(q.y-p.y)*at/len,z:.1}),vector({x:p.x+(q.x-p.x)*(at+2)/len,y:p.y+(q.y-p.y)*(at+2)/len,z:.1})]);}
      }
      const road=B.MeshBuilder.CreateRibbon('road',{pathArray:edges.slice(0,2),sideOrientation:B.Mesh.DOUBLESIDE},scene);road.material=pavement;asphalt.push(road);
      const walk=B.MeshBuilder.CreateRibbon('sidewalk',{pathArray:edges.slice(2,4),sideOrientation:B.Mesh.DOUBLESIDE},scene);walk.material=sidewalk;walkways.push(walk);
    }
    for(const list of [asphalt,walkways])if(list.length){const merged=B.Mesh.MergeMeshes(list,true,true,undefined,false,true);if(merged){merged.receiveShadows=true;merged.metadata={ground:true};}}
    if(laneLines.length){const lines=B.MeshBuilder.CreateLineSystem('lane-markings',{lines:laneLines},scene);lines.color=B.Color3.FromHexString('#c4c4a8');lines.alpha=.5;lines.isPickable=false;}
    const mats={motorcycle:material('bike-enamel','#de8f58'),car:material('car-enamel','#b7c9c7'),person:material('jackets','#c6b486'),rubber:material('rubber','#202726'),metal:material('metal','#7e9799'),glass:material('glass','#334e59'),skin:material('skin','#b8997d'),lamp:material('lamps','#e4efcb')};
    mats.metal.specularColor=new B.Color3(.4,.4,.4);mats.lamp.emissiveColor=new B.Color3(.3,.35,.25);
    const vehicles=new Map();
    function setSources(sources){
      for(const node of vehicles.values()){for(const child of node.getChildMeshes())shadow.removeShadowCaster(child);node.dispose();}vehicles.clear();
      for(const source of sources){
        const node=new B.TransformNode(source.id,scene),wheels=[],legs=[];
        const part=(kind,options,pos,mat)=>{const obj=kind==='box'?B.MeshBuilder.CreateBox('body',options,scene):kind==='sphere'?B.MeshBuilder.CreateSphere('body',options,scene):kind==='capsule'?B.MeshBuilder.CreateCapsule('body',options,scene):B.MeshBuilder.CreateCylinder('body',options,scene);obj.parent=node;obj.position.set(...pos);obj.material=mat;obj.metadata={sourceId:source.id};shadow.addShadowCaster(obj);return obj;};
        const wheel=(x,z,radius)=>{const tire=part('cylinder',{diameter:radius*2,height:.17,tessellation:12},[x,radius,z],mats.rubber);tire.rotation.z=Math.PI/2;wheels.push(tire);const hub=part('cylinder',{diameter:radius*1.12,height:.18,tessellation:8},[x,radius,z],mats.metal);hub.rotation.z=Math.PI/2;wheels.push(hub);};
        if(source.kind==='car'){
          part('box',{width:1.75,height:.65,depth:4.25},[0,.67,0],mats.car);part('box',{width:1.5,height:.62,depth:2.25},[0,1.2,-.25],mats.glass);
          part('box',{width:1.48,height:.1,depth:2.1},[0,1.55,-.25],mats.car);for(const x of [-.9,.9])for(const z of [-1.32,1.32])wheel(x,z,.33);
          for(const x of [-.55,.55])part('box',{width:.38,height:.12,depth:.05},[x,.82,2.14],mats.lamp);
        }else if(source.kind==='motorcycle'){
          wheel(0,-.72,.31);wheel(0,.72,.31);part('box',{width:.23,height:.2,depth:1.2},[0,.57,0],mats.metal);
          const tank=part('sphere',{diameter:.7,segments:12},[0,.85,.1],mats.motorcycle);tank.scaling.set(.65,.7,1);
          part('box',{width:.32,height:.12,depth:.55},[0,.89,-.37],mats.rubber);part('box',{width:.66,height:.06,depth:.08},[0,1.04,.61],mats.metal);
          const rider=part('capsule',{height:.65,radius:.16,tessellation:8},[0,1.23,-.12],mats.rubber);rider.rotation.x=.2;
          part('sphere',{diameter:.35,segments:12},[0,1.66,.04],mats.lamp);
        }else{
          part('capsule',{height:.72,radius:.19,tessellation:8},[0,1.03,0],mats.person);part('sphere',{diameter:.29,segments:10},[0,1.58,0],mats.skin);
          for(const x of [-.12,.12])legs.push(part('capsule',{height:.7,radius:.075,tessellation:6},[x,.38,0],mats.rubber));
        }
        node.metadata={wheels,legs};vehicles.set(source.id,node);
      }
    }
    function animate(node,state,kind){
      node.rotation.z=state.lean||0;
      for(const wheel of node.metadata.wheels)wheel.rotation.x=-(state.distance||0)/.32;
      node.metadata.legs.forEach((leg,i)=>leg.rotation.x=Math.sin((state.distance||0)*5+i*Math.PI)*.45*Math.min(1,state.speed||0));
    }
    return {vehicles,setSources,animate,dispose(){shadow.dispose();}};
  }
  root.MotorcycleBabylonCity={create};
})(globalThis);
