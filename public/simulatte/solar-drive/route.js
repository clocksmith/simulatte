(function attachSolarRoute(root, factory) {
  const api=factory(typeof module==='object'&&module.exports?require('../../shared/plugins/sun-walker/sun-exposure.js'):root.SimulatteSunExposure,
    typeof module==='object'&&module.exports?require('../../shared/contracts/world-spec.js'):root.SimulatteWorldSpec);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SimulatteSolarRoute=api;
})(globalThis,function solarRoute(exposure,world){
  'use strict';
  const rad=x=>x*Math.PI/180, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function validate(data){
    if(!data||data.schema!=='simulatte.solarRideRoute.v1'||!Array.isArray(data.points)||data.points.length<2||data.points.length>256||!Array.isArray(data.buildings)||data.buildings.length>5000)throw Error('solar_route_data_invalid');
    const raw=structuredClone(data);delete raw.contentHash;
    if(world.contentHash(raw)!==data.contentHash)throw Error('solar_route_hash_invalid');
    if(!Number.isFinite(Date.parse(data.departureAt)))throw Error('solar_route_departure_invalid');
    for(const [i,p] of data.points.entries()){
      for(const key of ['x','y','distanceM','elevationM','latitude','longitude'])if(!Number.isFinite(p[key]))throw Error('solar_route_point_invalid');
      if(i===0?p.distanceM!==0:p.distanceM<=data.points[i-1].distanceM)throw Error('solar_route_distances_invalid');
      if(i&&Math.abs((p.elevationM-data.points[i-1].elevationM)/(p.distanceM-data.points[i-1].distanceM))>.2)throw Error('solar_route_grade_unsupported');
    }
    const policy=data.policy;
    if(!policy||!['panelLengthM','panelHeightM','maximumTimeS','maximumShadowQueryM','arrivalToleranceM','stopToleranceM','stopApproachS','stopBufferM','stoppedSpeedMs'].every(key=>Number.isFinite(policy[key])&&policy[key]>0)||policy.panelSamplesPerAxis!==3
      ||policy.diffuseFraction<0||policy.diffuseFraction>1||policy.maximumShadowQueryM<=0||policy.minimumSolarElevationDegrees<2
      ||!Number.isFinite(policy.roadWidthM)||policy.roadWidthM<=0||!Number.isFinite(policy.arrivalToleranceM)||policy.arrivalToleranceM<=0)throw Error('solar_route_policy_invalid');
    let previous=0;
    for(const stop of data.stops){if(!stop.id||stop.distanceM<=previous||stop.distanceM>=data.points.at(-1).distanceM||!Number.isFinite(stop.dwellS)||stop.dwellS<0)throw Error('solar_route_stop_invalid');previous=stop.distanceM;}
    for(const b of data.buildings){if(!b.id||!Array.isArray(b.footprint)||b.footprint.length<3||b.footprint.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('solar_route_building_invalid');}
    return data;
  }
  function create(artifact){
    const data=validate(structuredClone(artifact)),points=data.points,policy=data.policy,lengthM=points.at(-1).distanceM;
    const buildings=exposure.buildBuildingScene(data.buildings.map(b=>({...b,heightM:Number.isFinite(b.heightM)&&Number.isFinite(b.groundElevationM)?b.heightM+b.groundElevationM:null,
      heightState:Number.isFinite(b.heightM)&&Number.isFinite(b.groundElevationM)?'known':'unknown'})));
    function position(distanceM){
      const d=clamp(distanceM,0,lengthM);let i=1;while(i<points.length-1&&points[i].distanceM<d)i++;
      const a=points[i-1],b=points[i],t=(d-a.distanceM)/(b.distanceM-a.distanceM),grade=100*(b.elevationM-a.elevationM)/Math.hypot(b.x-a.x,b.y-a.y);
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,elevationM:a.elevationM+(b.elevationM-a.elevationM)*t,
        latitude:a.latitude+(b.latitude-a.latitude)*t,longitude:a.longitude+(b.longitude-a.longitude)*t,grade,heading:Math.atan2(b.y-a.y,b.x-a.x),street:b.street,distanceM:d};
    }
    function sample(p,s){
      if(s.timeS>policy.maximumTimeS+1e-6)throw Error('solar_route_time_outside_coverage');
      const point=position(s.distanceM),timestamp=new Date(Date.parse(data.departureAt)+s.timeS*1000).toISOString();
      const sun=exposure.solarPosition(timestamp,point.latitude,point.longitude),alt=rad(sun.elevationDegrees),az=rad(sun.azimuthDegrees);
      if(sun.elevationDegrees<policy.minimumSolarElevationDegrees||buildings.maximumHeightM/Math.tan(alt)>policy.maximumShadowQueryM)throw Error('solar_route_shadow_outside_coverage');
      const direction=[Math.sin(az)*Math.cos(alt),Math.cos(az)*Math.cos(alt),Math.sin(alt)];
      const tilt=rad(p.tilt)+Math.atan(point.grade/100),normal=[-Math.sin(tilt)*Math.cos(point.heading),-Math.sin(tilt)*Math.sin(point.heading),Math.cos(tilt)];
      const panelLength=p.vehicle==='car'?2.65:policy.panelLengthM,panelHeight=p.vehicle==='car'?1.52:policy.panelHeightM,width=p.panelArea/panelLength;
      const roadAngle=Math.atan(point.grade/100),centerForward=-panelHeight*Math.sin(roadAngle),centerUp=panelHeight*Math.cos(roadAngle);
      const occluders=new Set(),samples=[];let clear=0;
      for(let a=0;a<policy.panelSamplesPerAxis;a++)for(let b=0;b<policy.panelSamplesPerAxis;b++){
        const u=((a+.5)/policy.panelSamplesPerAxis-.5)*panelLength,v=((b+.5)/policy.panelSamplesPerAxis-.5)*width;
        const x=point.x+(centerForward+u*Math.cos(tilt))*Math.cos(point.heading)-v*Math.sin(point.heading),y=point.y+(centerForward+u*Math.cos(tilt))*Math.sin(point.heading)+v*Math.cos(point.heading);
        const heightM=point.elevationM+centerUp+u*Math.sin(tilt);
        const result=exposure.pointSunStateDetailed({x,y},buildings,sun,{receiverHeightM:heightM,minimumSolarElevationDegrees:policy.minimumSolarElevationDegrees});
        if(result.state==='unknown')throw Error('solar_route_panel_exposure_unknown');
        if(result.state==='direct')clear++;if(result.occluderId)occluders.add(result.occluderId);
        samples.push({x,y,heightM,state:result.state,occluderId:result.occluderId});
      }
      const stop=data.stops[s.routeStopIndex||0],dwell=s.routeDwellS||0,remaining=(stop?stop.distanceM:lengthM)-s.distanceM;
      const targetMs=dwell>0?0:Math.min(p.targetKph/3.6,Math.max(0,remaining-policy.stopBufferM)/policy.stopApproachS);
      return {schema:'simulatte.solarRideEnvironment.v1',routeId:data.id,routeHash:data.contentHash,timestamp,point,sun,samples,occluderIds:[...occluders],
        incidence:Math.max(0,direction.reduce((sum,x,i)=>sum+x*normal[i],0)),skyFactor:(1+normal[2])/2,diffuseFraction:policy.diffuseFraction,directFraction:clear/samples.length,
        grade:point.grade,targetMs,lengthM,remainingM:Math.max(0,lengthM-s.distanceM),stop:stop?.label||null,dwellS:dwell,
        sunDirection:[direction[0]*Math.cos(point.heading)+direction[1]*Math.sin(point.heading),direction[2],direction[0]*Math.sin(point.heading)-direction[1]*Math.cos(point.heading)]};
    }
    function afterStep(previous,next){
      const stop=data.stops[previous.routeStopIndex||0];
      next.routeStopIndex=previous.routeStopIndex||0;next.routeDwellS=previous.routeDwellS||0;
      if(next.routeDwellS>0){next.routeDwellS=Math.max(0,next.routeDwellS-(next.timeS-previous.timeS));if(next.routeDwellS===0)next.routeStopIndex++;}
      else if(stop&&next.distanceM>=stop.distanceM-policy.stopToleranceM&&next.speedMs<policy.stoppedSpeedMs)next.routeDwellS=stop.dwellS;
      if(!data.stops[next.routeStopIndex]&&next.distanceM>=lengthM-policy.arrivalToleranceM&&next.speedMs<policy.stoppedSpeedMs)next.status='complete';
      return next;
    }
    return Object.freeze({sample,position,afterStep,lengthM,id:data.id,contentHash:data.contentHash,maximumTimeS:policy.maximumTimeS,data:()=>structuredClone(data)});
  }
  return Object.freeze({validate,create});
});
