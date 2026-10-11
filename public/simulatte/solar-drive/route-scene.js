(function attachSolarRideScene(root){
  'use strict';
  const g=root.SimulatteSolarGeometry;
  const colors={road:[.25,.31,.32,0],line:[.72,.57,.25,0],edge:[.81,.82,.76,0],building:[.57,.62,.61,0],affected:[.77,.51,.23,0]};
  function create(data){
    function frame(machine,environment,p){
      if(!environment)return machine;
      const point=environment.point,c=Math.cos(point.heading),s=Math.sin(point.heading);
      const local=v=>[(v.x-point.x)*c+(v.y-point.y)*s,(v.elevationM??point.elevationM)-point.elevationM,(v.x-point.x)*s-(v.y-point.y)*c];
      const slope=g.matrix([0,0,0],[1,1,1],[0,0,Math.atan(environment.grade/100)]);
      const transform=v=>{const m=slope;return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];};
      const instances=machine.instances.filter(n=>n.group!=='ground').map(n=>({...n,matrix:g.multiply(slope,n.matrix)}));
      const add=(mesh,matrix,color)=>instances.push({mesh,matrix,color,material:[0,.85,0,0],group:'environment'});
      for(let i=1;i<data.points.length;i++){
        const a=local(data.points[i-1]),b=local(data.points[i]);
        if(Math.min(Math.hypot(a[0],a[2]),Math.hypot(b[0],b[2]))>100)continue;
        add('box',g.multiply(g.between(a,b,1),g.matrix([0,0,0],[data.policy.roadWidthM,.045,1])),colors.road);
        add('cylinder',g.between(a.map((x,j)=>j===1?x+.065:x),b.map((x,j)=>j===1?x+.065:x),.035),colors.line);
      }
      for(const building of data.buildings){
        const footprint=building.footprint;
        if(!footprint.some(v=>Math.hypot(v.x-point.x,v.y-point.y)<32))continue;
        const color=environment.occluderIds.includes(building.id)?colors.affected:colors.building;
        const ground=Number.isFinite(building.groundElevationM)?building.groundElevationM:point.elevationM;
        const height=Number.isFinite(building.heightM)?building.heightM:0;
        for(let i=1;i<footprint.length;i++){
          const a=local({...footprint[i-1],elevationM:ground}),b=local({...footprint[i],elevationM:ground});
          const roofA=[a[0],a[1]+height,a[2]],roofB=[b[0],b[1]+height,b[2]];
          add('cylinder',g.between(a,b,.035),color);add('cylinder',g.between(roofA,roofB,.035),color);
          add('cylinder',g.between(a,roofA,.035),color);
        }
      }
      const panelColor=environment.directFraction*(1-p.shade)<.5?[.05,.08,.12,0]:null;
      return {...machine,instances:panelColor?instances.map(n=>n.group==='solar'&&n.material[2]===3?{...n,color:panelColor}:n):instances,
        anchors:Object.fromEntries(Object.entries(machine.anchors).map(([id,v])=>[id,transform(v)])),sunDirection:environment.sunDirection,
        route:{id:environment.routeId,position:point,timestamp:environment.timestamp,occluderIds:environment.occluderIds}};
    }
    return Object.freeze({frame});
  }
  root.SimulatteSolarRideScene=Object.freeze({create});
})(globalThis);
