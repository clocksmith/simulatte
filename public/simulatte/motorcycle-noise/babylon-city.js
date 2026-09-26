(function(root){
  function create(B,scene,map,origin,sunlight){
    const vector=p=>new B.Vector3(p.x-origin.x,p.z||0,-(p.y-origin.y));
    const material=(name,color)=>{const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.07,.07,.07);return m;};
    const pavement=material('asphalt','#353e3e'),sidewalk=material('sidewalk','#7c8378'),roofMaterial=material('roofs','#87928a'),wallMaterial=material('facades','#c0c1aa'),land=material('land','#435c4b');
    pavement.backFaceCulling=false;sidewalk.backFaceCulling=false;
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
    // Carry through the same sourced park exteriors as Sunwalker with matching luminous perimeter ribbon.
    const parkMaterial=material('park-lawns','#507d50');
    parkMaterial.emissiveColor=new B.Color3(.005,.01,.005);
    const parkRim=new B.StandardMaterial('park-property-rim',scene);
    parkRim.diffuseColor=B.Color3.FromHexString('#57906b');
    parkRim.emissiveColor=B.Color3.FromHexString('#57906b');
    parkRim.specularColor=new B.Color3(.1,.1,.1);
    parkRim.disableLighting=true;
    parkRim.backFaceCulling=false;
    const parkOutlines=[];
    for(const park of map.parks||[]){
      const rings=[park.outerRing,...(park.interiorRings||[])].filter(ring=>ring?.length>=3);if(!rings.length)continue;
      const positions=[],flat=[],holes=[],uv=[];
      for(let r=0;r<rings.length;r++){
        if(r)holes.push(flat.length/2);
        for(const p of rings[r]){flat.push(p.x-origin.x,-(p.y-origin.y));positions.push(p.x-origin.x,.025,-(p.y-origin.y));uv.push(p.x/30,p.y/30);}
      }
      const surface=mesh(park.id,positions,root.earcut(flat,holes),uv,parkMaterial);surface.metadata={ground:true,parkId:park.id,parkLabel:park.label};
      const rawRing=park.outerRing;if(!rawRing?.length)continue;
      const isClosed=rawRing.length>2&&Math.hypot(rawRing[0].x-rawRing[rawRing.length-1].x,rawRing[0].y-rawRing[rawRing.length-1].y)<.01;
      const ring=isClosed?rawRing.slice(0,-1):rawRing;if(ring.length<3)continue;
      const edges=[[],[]],outlinePoints=[];
      for(let i=0;i<ring.length;i++){
        const prev=ring[(i+ring.length-1)%ring.length],next=ring[(i+1)%ring.length],p=ring[i];
        const inDx=p.x-prev.x,inDy=p.y-prev.y,inLen=Math.hypot(inDx,inDy)||1;
        const outDx=next.x-p.x,outDy=next.y-p.y,outLen=Math.hypot(outDx,outDy)||1;
        const normX=-(inDy/inLen+outDy/outLen)*.5,normY=(inDx/inLen+outDx/outLen)*.5,normLen=Math.hypot(normX,normY)||1;
        const nx=normX/normLen,ny=normY/normLen;
        for(let side=0;side<2;side++){
          const amount=side?1.8:-1.8;
          edges[side].push(vector({x:p.x+nx*amount,y:p.y+ny*amount,z:.23}));
        }
        outlinePoints.push(vector({x:p.x,y:p.y,z:.25}));
      }
      edges[0].push(edges[0][0]);edges[1].push(edges[1][0]);
      outlinePoints.push(outlinePoints[0]);parkOutlines.push(outlinePoints);
      const rim=B.MeshBuilder.CreateRibbon('park-boundary-'+park.id,{pathArray:edges,sideOrientation:B.Mesh.DOUBLESIDE},scene);
      rim.material=parkRim;rim.isPickable=false;
    }
    if(parkOutlines.length){
      const parkLines=B.MeshBuilder.CreateLineSystem('park-perimeter-lines',{lines:parkOutlines},scene);
      parkLines.color=B.Color3.FromHexString('#91b5a0');
      parkLines.alpha=.95;parkLines.isPickable=false;
    }
    const trackMaterial=material('running-track-rubber','#b7624b'),fieldMaterial=material('track-infield','#3b713e');
    trackMaterial.backFaceCulling=false;fieldMaterial.backFaceCulling=false;
    function polygon(name,rings,height,mat){
      const flat=[],positions=[],holes=[];
      for(let i=0;i<rings.length;i++){if(i)holes.push(flat.length/2);for(const p of rings[i]){flat.push(p.x-origin.x,-(p.y-origin.y));positions.push(p.x-origin.x,height,-(p.y-origin.y));}}
      const surface=mesh(name,positions,root.earcut(flat,holes),null,mat);surface.metadata={ground:true};return surface;
    }
    function resample(ring,count){
      const points=ring.slice();if(points.length>1&&points[0].x===points.at(-1).x&&points[0].y===points.at(-1).y)points.pop();
      const lengths=points.map((p,i)=>Math.hypot(points[(i+1)%points.length].x-p.x,points[(i+1)%points.length].y-p.y)),total=lengths.reduce((a,b)=>a+b,0);
      return Array.from({length:count},(_,i)=>{let d=i*total/count,k=0;while(k<lengths.length-1&&d>lengths[k])d-=lengths[k++];const p=points[k],q=points[(k+1)%points.length],t=d/Math.max(.0001,lengths[k]);return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};});
    }
    for(const track of map.tracks||[]){
      polygon('mccarren-running-track',[track.outerRing,...track.interiorRings],.10,trackMaterial);
      for(const ring of track.interiorRings)polygon('mccarren-track-infield',[ring],.06,fieldMaterial);
      const outer=resample(track.outerRing,192),inner=resample(track.interiorRings[0],192);
      const area=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p.x*q.y-q.x*p.y;},0);
      if(area(outer)*area(inner)<0)inner.reverse();
      let shift=0;for(let i=1;i<inner.length;i++)if(Math.hypot(inner[i].x-outer[0].x,inner[i].y-outer[0].y)<Math.hypot(inner[shift].x-outer[0].x,inner[shift].y-outer[0].y))shift=i;
      const lines=[];
      for(let lane=0;lane<=track.lanes;lane++){const f=lane/track.lanes,points=outer.map((p,i)=>{const q=inner[(i+shift)%inner.length];return vector({x:p.x+(q.x-p.x)*f,y:p.y+(q.y-p.y)*f,z:.25});});points.push(points[0]);lines.push(points);}
      const markings=B.MeshBuilder.CreateLineSystem('mccarren-track-lanes',{lines},scene);markings.color=B.Color3.FromHexString('#f3e5ce');markings.alpha=.9;markings.isPickable=false;
    }
    const bark=material('tree-bark','#655347'),leaves=material('tree-canopy','#426b38');
    const trunk=B.MeshBuilder.CreateCylinder('tree-trunk-template',{height:1,diameter:1,tessellation:6},scene),crown=B.MeshBuilder.CreateIcoSphere('tree-crown-template',{radius:1,subdivisions:2},scene);
    trunk.material=bark;crown.material=leaves;trunk.isVisible=false;crown.isVisible=false;trunk.isPickable=false;crown.isPickable=false;
    for(const tree of map.trees||[]){
      const seed=Array.from(tree.id).reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,17),height=Math.max(3,Math.min(28,tree.heightM||8+seed%5)),radius=height*.29;
      const stem=trunk.createInstance(tree.id+'-trunk');stem.isVisible=true;stem.isPickable=false;stem.position=vector({...tree,z:height*.26});stem.scaling.set(.35,height*.52,.35);
      const canopy=crown.createInstance(tree.id+'-canopy');canopy.isVisible=true;canopy.isPickable=false;canopy.position=vector({...tree,z:height*.71});canopy.scaling.set(radius,height*.32,radius*.9);canopy.rotation.y=seed%628/100;
      shadow.addShadowCaster(canopy);canopy.receiveShadows=true;
    }
    const wallP=[],wallI=[],wallUv=[],wallColors=[],roofP=[],roofI=[],roofColors=[],wallIds=[],roofIds=[];
    for(const building of map.buildings){
      const height=root.MotorcycleCityPaths.height(building),rings=[building.footprint,...(building.interiorRings||[])].filter(ring=>ring?.length>=3);if(!rings.length)continue;
      if(height===null){
        const outline=B.MeshBuilder.CreateLines('unknown-height-'+building.id,{points:[...rings[0],rings[0][0]].map(p=>vector({...p,z:.05}))},scene);
        outline.color=B.Color3.FromHexString('#e2ac6b');outline.metadata={buildingId:building.id,heightState:'missing'};continue;
      }
      const flat=[],holes=[],base=roofP.length/3,shade=.82+(height%13)/65;
      for(let ri=0;ri<rings.length;ri++){if(ri)holes.push(flat.length/2);for(const p of rings[ri]){flat.push(p.x-origin.x,-(p.y-origin.y));roofP.push(p.x-origin.x,height,-(p.y-origin.y));roofColors.push(shade,shade,shade,1);}}
      const roofTriangles=root.earcut(flat,holes);for(const i of roofTriangles)roofI.push(base+i);
      for(let i=0;i<roofTriangles.length;i+=3)roofIds.push(building.id);
      for(const ring of rings)for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],offset=wallP.length/3,length=Math.hypot(a.x-b.x,a.y-b.y);
        wallP.push(a.x-origin.x,0,-(a.y-origin.y),b.x-origin.x,0,-(b.y-origin.y),b.x-origin.x,height,-(b.y-origin.y),a.x-origin.x,height,-(a.y-origin.y));
        wallIds.push(building.id,building.id);wallI.push(offset,offset+1,offset+2,offset,offset+2,offset+3);wallUv.push(0,0,length/5,0,length/5,height/12,0,height/12);
        for(let j=0;j<4;j++)wallColors.push(shade,shade*.99,shade*.94,1);
      }
    }
    for(const buildingMesh of [mesh('nyc-walls',wallP,wallI,wallUv,wallMaterial,wallColors),mesh('nyc-roofs',roofP,roofI,null,roofMaterial,roofColors)]){buildingMesh.metadata={buildingIds:buildingMesh.name==='nyc-walls'?wallIds:roofIds};buildingMesh.material.backFaceCulling=false;shadow.addShadowCaster(buildingMesh);buildingMesh.isPickable=true;}
    const asphalt=[],walkways=[],laneLines=[],curbLines=[];
    for(const street of map.streets){
      const points=street.geometry;if(points.length<2)continue;const width=Math.max(3,street.widthM||7),edges=[[],[],[],[]];
      for(let i=0;i<points.length;i++){
        const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],d=Math.hypot(b.x-a.x,b.y-a.y)||1;
        for(let side=0;side<4;side++){const amount=(side<2?width/2:width/2+1.7)*(side%2?-1:1);edges[side].push(vector({x:points[i].x+(b.y-a.y)/d*amount,y:points[i].y-(b.x-a.x)/d*amount,z:side<2?.08:.05}));}
        if(i&&width>=7){const p=points[i-1],q=points[i],len=Math.hypot(q.x-p.x,q.y-p.y);for(let at=1;at+2<len;at+=7)laneLines.push([vector({x:p.x+(q.x-p.x)*at/len,y:p.y+(q.y-p.y)*at/len,z:.1}),vector({x:p.x+(q.x-p.x)*(at+2)/len,y:p.y+(q.y-p.y)*(at+2)/len,z:.1})]);}
      }
      if(Math.hypot(points[0].x-origin.x,points[0].y-origin.y)<600)for(const side of [0,1])curbLines.push(edges[side].map(p=>new B.Vector3(p.x,.13,p.z)));
      const road=B.MeshBuilder.CreateRibbon('road',{pathArray:edges.slice(0,2)},scene);road.material=pavement;asphalt.push(road);
      const walk=B.MeshBuilder.CreateRibbon('sidewalk',{pathArray:edges.slice(2,4)},scene);walk.material=sidewalk;walkways.push(walk);
      // Flat street surfaces share upward normals. Coplanar duplicate backfaces
      // otherwise alternate between lit and unlit triangles at intersections.
      for(const surface of [road,walk])surface.setVerticesData(B.VertexBuffer.NormalKind,
        Array.from({length:surface.getTotalVertices()*3},(_,i)=>i%3===1?1:0));
    }
    for(const list of [asphalt,walkways])if(list.length){const merged=B.Mesh.MergeMeshes(list,true,true,undefined,false,true);if(merged){merged.receiveShadows=true;merged.metadata={ground:true};}}
    if(laneLines.length){const lines=B.MeshBuilder.CreateLineSystem('lane-markings',{lines:laneLines},scene);lines.color=B.Color3.FromHexString('#c4c4a8');lines.alpha=.5;lines.isPickable=false;}
    if(curbLines.length){const curbs=B.MeshBuilder.CreateLineSystem('curb-edges',{lines:curbLines},scene);curbs.color=B.Color3.FromHexString('#c1c6b8');curbs.alpha=.7;curbs.isPickable=false;}
    const mats={motorcycle:material('bike-enamel','#de8f58'),car:material('car-enamel','#b7c9c7'),person:material('jackets','#c6b486'),rubber:material('rubber','#202726'),metal:material('metal','#7e9799'),glass:material('glass','#334e59'),skin:material('skin','#b8997d'),lamp:material('lamps','#e4efcb')};
    mats.metal.specularColor=new B.Color3(.4,.4,.4);mats.lamp.emissiveColor=new B.Color3(.3,.35,.25);
    const bikePaints=new Map();
    function bikePaint(id){const color=root.MotorcycleSoundView.colorFor(id);if(!bikePaints.has(color))bikePaints.set(color,material(`paint-${color}`,color));return bikePaints.get(color);}
    const vehicles=new Map(),templates=new Map();
    function setSources(sources){
      for(const node of vehicles.values()){for(const child of node.getChildMeshes())shadow.removeShadowCaster(child);node.dispose();}vehicles.clear();
      for(const source of sources){
        const node=new B.TransformNode(source.id,scene),wheels=[],legs=[];
        const part=(kind,options,pos,mat)=>{
          const key=kind+JSON.stringify(options)+mat.name;
          if(!templates.has(key)){
            const template=kind==='box'?B.MeshBuilder.CreateBox('prototype',options,scene):kind==='sphere'?B.MeshBuilder.CreateSphere('prototype',options,scene):kind==='capsule'?B.MeshBuilder.CreateCapsule('prototype',options,scene):B.MeshBuilder.CreateCylinder('prototype',options,scene);
            template.material=mat;template.isVisible=false;template.isPickable=false;templates.set(key,template);
          }
          const obj=templates.get(key).createInstance(source.id+'-part');obj.isVisible=true;obj.isPickable=true;obj.parent=node;obj.position.set(...pos);obj.metadata={sourceId:source.id};shadow.addShadowCaster(obj);return obj;
        };
        const wheel=(x,z,radius)=>{const tire=part('cylinder',{diameter:radius*2,height:.17,tessellation:12},[x,radius,z],mats.rubber);tire.rotation.z=Math.PI/2;wheels.push(tire);const hub=part('cylinder',{diameter:radius*1.12,height:.18,tessellation:8},[x,radius,z],mats.metal);hub.rotation.z=Math.PI/2;wheels.push(hub);};
        if(source.kind==='car'){
          part('box',{width:1.75,height:.65,depth:4.25},[0,.67,0],mats.car);part('box',{width:1.5,height:.62,depth:2.25},[0,1.2,-.25],mats.glass);
          part('box',{width:1.48,height:.1,depth:2.1},[0,1.55,-.25],mats.car);for(const x of [-.9,.9])for(const z of [-1.32,1.32])wheel(x,z,.33);
          for(const x of [-.55,.55])part('box',{width:.38,height:.12,depth:.05},[x,.82,2.14],mats.lamp);
        }else if(source.kind==='motorcycle'){
          wheel(0,-.72,.31);wheel(0,.72,.31);part('box',{width:.23,height:.2,depth:1.2},[0,.57,0],mats.metal);
          const tank=part('sphere',{diameter:.7,segments:12},[0,.85,.1],bikePaint(source.id));tank.scaling.set(.65,.7,1);
          part('box',{width:.32,height:.12,depth:.55},[0,.89,-.37],mats.rubber);part('box',{width:.66,height:.06,depth:.08},[0,1.04,.61],mats.metal);
          part('box',{width:.28,height:.18,depth:.3},[0,1.04,-.12],mats.metal);
          part('sphere',{diameter:.12,segments:8},[0,1.19,.04],mats.lamp);
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
