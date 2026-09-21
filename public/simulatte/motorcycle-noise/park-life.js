(function(root){
  'use strict';
  function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
  function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
  async function create(B,scene,vector,map,getTime){
    const response=await fetch('./mccarren-amenities.json?v=park-life-v15');
    if(!response.ok)throw new Error('Park amenities HTTP '+response.status);
    const data=await response.json();
    if(data.schema!=='simulatte.mccarrenAmenities.v1'||data.origin.latitude!==map.origin.latitude||data.origin.longitude!==map.origin.longitude)throw new Error('Park amenities coordinate mismatch');
    const meshes=[],materials=[],actors=[],templates=new Map();
    const parks=map.parks.filter(p=>/mccarren/i.test(p.label||''));
    let seed=731;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const material=(name,color)=>{const m=new B.StandardMaterial('park-'+name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=B.Color3.Black();materials.push(m);return m;};
    const stone=material('paths','#b6aa91'),white=material('markings','#ede9d5'),trunk=material('trunk','#61503c'),rubber=material('rubber','#252a29');
    const foliage=['#456e43','#628548','#7b9654','#557e56'].map((color,i)=>material('foliage-'+i,color));
    const clothes=['#d8ad61','#7190a0','#b56551','#799578','#c5b9a3'].map((color,i)=>material('clothes-'+i,color));
    const skin=material('skin','#be9272'),dogCoat=material('dog','#ac8962');
    function own(mesh){mesh.isPickable=false;meshes.push(mesh);return mesh;}
    function prototype(kind,mat){
      const key=kind+mat.name;if(templates.has(key))return templates.get(key);
      const mesh=kind==='sphere'?B.MeshBuilder.CreateSphere(key,{diameter:1,segments:6},scene):kind==='cylinder'?B.MeshBuilder.CreateCylinder(key,{height:1,diameter:1,tessellation:8},scene):B.MeshBuilder.CreateBox(key,{size:1},scene);
      mesh.material=mat;mesh.isVisible=false;own(mesh);templates.set(key,mesh);return mesh;
    }
    function part(kind,mat,parent,position,scale){const mesh=own(prototype(kind,mat).createInstance('park-part'));mesh.parent=parent;mesh.position.set(...position);mesh.scaling.set(...scale);return mesh;}
    function line(name,points,color=white.diffuseColor,parent=null){const mesh=own(B.MeshBuilder.CreateLines(name,{points},scene));mesh.color=color;mesh.parent=parent;return mesh;}
    function polygon(name,ring,mat,height=.22){
      const points=ring.slice();if(points.length>1&&Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<.01)points.pop();
      if(points.length<3)return;
      const mesh=own(new B.Mesh(name,scene)),vd=new B.VertexData();
      vd.positions=points.flatMap(p=>{const q=vector({...p,z:height});return[q.x,q.y,q.z];});
      vd.indices=root.earcut(points.flatMap(p=>[p.x,p.y]));vd.normals=[];B.VertexData.ComputeNormals(vd.positions,vd.indices,vd.normals);vd.applyToMesh(mesh);mesh.material=mat;mat.backFaceCulling=false;return mesh;
    }
    const colors={basketball:'#557e82',tennis:'#5a8272',soccer:'#6a905d',baseball:'#b89869',swimming:'#65bac6',dog_park:'#a69d7e',playground:'#b28a73',skateboard:'#9eaaa3',american_handball:'#7d8d87'};
    const facilityMaterials=new Map();
    for(const feature of data.facilities){
      if(!facilityMaterials.has(feature.kind))facilityMaterials.set(feature.kind,material(feature.kind,colors[feature.kind]||'#aca185'));
      polygon(feature.id,feature.ring,facilityMaterials.get(feature.kind));
      const ring=feature.ring.slice();if(Math.hypot(ring[0].x-ring.at(-1).x,ring[0].y-ring.at(-1).y)<.01)ring.pop();
      line(feature.id+'-boundary',[...ring,ring[0]].map(p=>vector({...p,z:.27})));
      if(!['basketball','tennis','soccer'].includes(feature.kind))continue;
      let edge=0;for(let i=1;i<ring.length;i++)if(Math.hypot(ring[(i+1)%ring.length].x-ring[i].x,ring[(i+1)%ring.length].y-ring[i].y)>Math.hypot(ring[(edge+1)%ring.length].x-ring[edge].x,ring[(edge+1)%ring.length].y-ring[edge].y))edge=i;
      const a=ring[edge],b=ring[(edge+1)%ring.length],len=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/len,uy=(b.y-a.y)/len;
      const center={x:ring.reduce((s,p)=>s+p.x,0)/ring.length,y:ring.reduce((s,p)=>s+p.y,0)/ring.length};
      const along=ring.map(p=>(p.x-center.x)*ux+(p.y-center.y)*uy),across=ring.map(p=>-(p.x-center.x)*uy+(p.y-center.y)*ux);
      const L=(Math.max(...along)-Math.min(...along))*.45,W=(Math.max(...across)-Math.min(...across))*.43;
      const point=(x,y,z=.3)=>vector({x:center.x+x*ux-y*uy,y:center.y+x*uy+y*ux,z});
      const draw=points=>line(feature.id+'-lines',points.map(([x,y])=>point(x,y)));
      draw([[-L,-W],[L,-W],[L,W],[-L,W],[-L,-W]]);draw([[0,-W],[0,W]]);
      if(feature.kind==='tennis'){
        draw([[-L*.52,-W],[ -L*.52,W]]);draw([[L*.52,-W],[L*.52,W]]);draw([[-L*.52,0],[L*.52,0]]);
        line('tennis-net',[point(0,-W,.95),point(0,W,.95)],rubber.diffuseColor);
      }else{
        draw(Array.from({length:33},(_,i)=>[Math.cos(i*Math.PI/16)*Math.min(2,W*.28),Math.sin(i*Math.PI/16)*Math.min(2,W*.28)]));
        for(const end of [-1,1]){
          draw([[end*L,-W*.38],[end*L*.65,-W*.38],[end*L*.65,W*.38],[end*L,W*.38]]);
          if(feature.kind==='basketball'){
            const pole=own(B.MeshBuilder.CreateCylinder('basketball-post',{height:3.4,diameter:.12,tessellation:8},scene));pole.position=point(end*(L+.35),0,1.7);pole.material=rubber;
            const board=own(B.MeshBuilder.CreateBox('basketball-backboard',{width:.12,height:1.05,depth:1.8},scene));board.position=point(end*(L-.35),0,3.25);board.rotation.y=-Math.atan2(uy,ux);board.material=white;
            const rim=own(B.MeshBuilder.CreateTorus('basketball-rim',{diameter:.48,thickness:.055,tessellation:16},scene));rim.position=point(end*(L-.7),0,3.05);rim.material=clothes[0];
          }
        }
      }
    }
    const routes=[];
    for(const path of data.paths){
      const lengths=[0];for(let i=1;i<path.points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(path.points[i].x-path.points[i-1].x,path.points[i].y-path.points[i-1].y));
      if(lengths.at(-1)>20)routes.push({...path,lengths,total:lengths.at(-1)});
      const left=[],right=[];
      path.points.forEach((p,i)=>{const a=path.points[Math.max(0,i-1)],b=path.points[Math.min(path.points.length-1,i+1)],d=Math.max(.01,Math.hypot(b.x-a.x,b.y-a.y)),r=Math.min(2.5,path.width/2);left.push(vector({x:p.x-(b.y-a.y)/d*r,y:p.y+(b.x-a.x)/d*r,z:.24}));right.push(vector({x:p.x+(b.y-a.y)/d*r,y:p.y-(b.x-a.x)/d*r,z:.24}));});
      const mesh=own(B.MeshBuilder.CreateRibbon('park-path',{pathArray:[left,right],sideOrientation:B.Mesh.DOUBLESIDE},scene));mesh.material=stone;
    }
    const points=parks.flatMap(p=>p.outerRing),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const treePoints=[];
    for(let attempt=0;attempt<10000&&treePoints.length<180;attempt++){
      const p={x:minX+random()*(maxX-minX),y:minY+random()*(maxY-minY)};
      if(!parks.some(park=>inside(p,park.outerRing)&&!(park.holes||park.innerRings||[]).some(h=>inside(p,h))))continue;
      if(data.facilities.some(f=>inside(p,f.ring))||data.trackExclusions.some(r=>inside(p,r)))continue;
      if(map.buildings.some(b=>inside(p,b.footprint)&&!(b.interiorRings||[]).some(ring=>inside(p,ring))))continue;
      if(data.paths.some(path=>path.points.some((a,i)=>i&&segmentDistance(p,path.points[i-1],a)<4)))continue;
      if(treePoints.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<8))continue;
      treePoints.push(p);const height=7+random()*6,canopy=foliage[Math.floor(random()*foliage.length)];
      const stem=part('cylinder',trunk,null,[0,0,0],[.38,height*.65,.38]);stem.position=vector({...p,z:height*.325});
      for(let k=0;k<3;k++){const crown=part('sphere',canopy,null,[0,0,0],[4.5+k*.35,height*.42,4.5+k*.35]);crown.position=vector({x:p.x+Math.cos(k*2.1)*1.25,y:p.y+Math.sin(k*2.1)*1.25,z:height*.68+(k%2)});}
    }
    for(let i=0;i<64&&routes.length;i++){
      const route=routes[i%routes.length],node=new B.TransformNode('illustrative-park-visitor-'+i,scene),shirt=clothes[i%clothes.length],legs=[];meshes.push(node);
      part('cylinder',shirt,node,[0,1.05,0],[.4,.65,.3]);part('sphere',skin,node,[0,1.58,0],[.28,.32,.28]);
      for(const side of [-1,1]){legs.push(part('cylinder',rubber,node,[side*.12,.4,0],[.12,.7,.13]));part('cylinder',shirt,node,[side*.26,1.01,.05],[.11,.58,.11]);}
      const kind=i%8===0?'stroller':i%4===0?'dog':'walker';
      if(kind==='stroller'){
        part('box',rubber,node,[0,.55,.95],[.58,.1,.72]);part('sphere',shirt,node,[0,.9,1.05],[.65,.55,.7]);
        for(const side of [-1,1])for(const end of [.68,1.22]){const wheel=part('cylinder',rubber,node,[side*.34,.19,end],[.3,.09,.3]);wheel.rotation.z=Math.PI/2;}
        line('stroller-handle',[new B.Vector3(-.29,1.1,.55),new B.Vector3(.29,1.1,.55)],rubber.diffuseColor,node);
      }else if(kind==='dog'){
        part('sphere',dogCoat,node,[.75,.44,.95],[.28,.36,.64]);part('sphere',dogCoat,node,[.75,.64,1.27],[.27,.3,.32]);
        for(const side of [-1,1])for(const end of [.72,1.15])part('cylinder',dogCoat,node,[.75+side*.1,.19,end],[.075,.32,.075]);
        line('dog-leash',[new B.Vector3(.28,.86,.1),new B.Vector3(.75,.6,1.1)],rubber.diffuseColor,node);
      }
      actors.push({node,route,legs,offset:random()*route.total*2,speed:kind==='stroller'?.85:1+random()*.4,index:i});
    }
    function draw(){
      const time=getTime();
      for(const actor of actors){
        const phase=(time*actor.speed+actor.offset)%(actor.route.total*2),reverse=phase>actor.route.total,distance=reverse?actor.route.total*2-phase:phase;
        let j=1;while(j<actor.route.lengths.length-1&&actor.route.lengths[j]<distance)j++;
        const a=actor.route.points[j-1],b=actor.route.points[j],fraction=(distance-actor.route.lengths[j-1])/Math.max(.001,actor.route.lengths[j]-actor.route.lengths[j-1]);
        actor.node.position=vector({x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,z:.27});
        actor.node.rotation.y=Math.atan2(b.x-a.x,-(b.y-a.y))+(reverse?Math.PI:0);
        actor.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(time*actor.speed*7+actor.index+i*Math.PI)*.35;});
      }
    }
    const observer=scene.onBeforeRenderObservable.add(draw);
    return {dispose(){scene.onBeforeRenderObservable.remove(observer);for(const mesh of meshes)mesh.dispose();for(const mat of materials)mat.dispose();}};
  }
  root.MotorcycleParkLife={create};
})(globalThis);
