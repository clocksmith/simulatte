(function attachSolarRideScene(root){
  'use strict';
  const g=root.SimulatteSolarGeometry;
  const PANEL_SAMPLE_COUNT=9,NEAR_BUILDING_M=32;
  const colors={road:[.25,.31,.32,0],line:[.72,.57,.25,0],edge:[.81,.82,.76,0],building:[.57,.62,.61,0],affected:[.77,.51,.23,0]};
  function create(data){
    const roofs=new Map(data.buildings.map(b=>{
      const rings=[b.footprint,...(b.interiorRings||[])],points=[],holes=[];
      for(const ring of rings){if(points.length)holes.push(points.length);points.push(...ring);}
      return [b.id,{points,indices:root.earcut(points.flatMap(v=>[v.x,v.y]),holes)}];
    }));
    function frame(machine,environment,p){
      if(!environment)return machine;
      if(!Array.isArray(environment.samples)||environment.samples.length!==PANEL_SAMPLE_COUNT
        ||environment.samples.some(sample=>!['shade','direct'].includes(sample.state)))throw Error('solar_panel_exposure_invalid');
      const shadeMask=environment.samples.reduce((mask,sample,index)=>mask|(sample.state==='shade'?1<<index:0),0);
      const occluders=new Set(environment.occluderIds);
      const point=environment.point,c=Math.cos(point.heading),s=Math.sin(point.heading);
      const local=v=>[(v.x-point.x)*c+(v.y-point.y)*s,(v.elevationM??point.elevationM)-point.elevationM,(v.x-point.x)*s-(v.y-point.y)*c];
      const slope=g.matrix([0,0,0],[1,1,1],[0,0,Math.atan(environment.grade/100)]);
      const transform=v=>{const m=slope;return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];};
      const instances=machine.instances.filter(n=>n.group!=='ground').map(n=>{
        const item={...n,matrix:g.multiply(slope,n.matrix)};
        if(n.panelUv)item.panelExposure=[shadeMask+1,...n.panelUv];
        return item;
      });
      const add=(mesh,matrix,color,pattern=0,sourceId=null)=>instances.push({mesh,matrix,color,material:[0,.85,pattern,0],group:'environment',sourceId});
      add('box',g.matrix([0,-.20,0],[160,.10,160]),[.38,.40,.38,0]);
      for(let i=1;i<data.points.length;i++){
        const a=local(data.points[i-1]),b=local(data.points[i]);
        if(Math.min(Math.hypot(a[0],a[2]),Math.hypot(b[0],b[2]))>100)continue;
        const length=Math.hypot(b[0]-a[0],b[2]-a[2]),yaw=Math.atan2(-(b[2]-a[2]),b[0]-a[0]),rise=Math.atan2(b[1]-a[1],length);
        add('box',g.matrix(a.map((v,j)=>(v+b[j])/2-(j===1?.045:0)),[Math.hypot(length,b[1]-a[1]),.09,data.policy.roadWidthM],[0,yaw,rise]),colors.road);
        add('cylinder',g.between(a.map((x,j)=>j===1?x+.065:x),b.map((x,j)=>j===1?x+.065:x),.035),colors.line);
      }
      for(const building of data.buildings){
        const footprint=building.footprint;
        if(!occluders.has(building.id)&&!footprint.some(v=>Math.hypot(v.x-point.x,v.y-point.y)<NEAR_BUILDING_M))continue;
        const color=occluders.has(building.id)?colors.affected:colors.building;
        const ground=Number.isFinite(building.groundElevationM)?building.groundElevationM:point.elevationM;
        const height=Number.isFinite(building.heightM)?building.heightM:0;
        const base=Math.min(ground,point.elevationM-.15),wallHeight=ground+height-base;
        if(height<=0)continue;
        for(const ring of [footprint,...(building.interiorRings||[])])for(let i=1;i<ring.length;i++){
          const a=local({...ring[i-1],elevationM:base}),b=local({...ring[i],elevationM:base});
          const length=Math.hypot(b[0]-a[0],b[2]-a[2]);
          if(length<.01)continue;
          const center=[(a[0]+b[0])/2,(a[1]+b[1])/2+wallHeight/2,(a[2]+b[2])/2];
          add('box',g.matrix(center,[length,wallHeight,.08],[0,Math.atan2(-(b[2]-a[2]),b[0]-a[0]),0]),color,7,building.id);
        }
        const roof=roofs.get(building.id);
        for(let i=0;i<roof.indices.length;i+=3){
          const [a,b,c]=roof.indices.slice(i,i+3).map(k=>local({...roof.points[k],elevationM:ground+height}));
          const u=g.sub(b,a),v=g.sub(c,a);
          add('triangle',new Float32Array([...u,0,0,1,0,0,...v,0,...a,1]),[.35,.38,.37,0],0,building.id);
        }
      }
      return {...machine,instances,
        anchors:Object.fromEntries(Object.entries(machine.anchors).map(([id,v])=>[id,transform(v)])),sunDirection:environment.sunDirection,cloudCover:p.cloud,
        route:{id:environment.routeId,position:point,timestamp:environment.timestamp,occluderIds:[...occluders],directFraction:environment.directFraction,
          panelExposure:{samplesPerAxis:3,shadeMask,samples:environment.samples.map(sample=>({...sample}))}}};
    }
    return Object.freeze({frame});
  }
  root.SimulatteSolarRideScene=Object.freeze({create});
})(globalThis);
