(function(root){
  'use strict';
  const M=root.MotorcycleReflection;
  const kinds={mist:{name:'Water mist',color:'#b8deec'},directional:{name:'Directional sound',color:'#f1be79'},cancellation:{name:'Tonal cancellation',color:'#c2b5ec'}};
  const db=power=>10*Math.log10(Math.max(1e-12,power));
  function weight(hz){const f2=hz*hz;return 20*Math.log10(Math.max(1e-12,12194**2*f2*f2/((f2+20.6**2)*Math.sqrt((f2+107.7**2)*(f2+737.9**2))*(f2+12194**2))))+2;}
  function states(scene,time){
    return (scene.treatments||[]).map(node=>{
      let target=null,score=-Infinity;
      if(node.kind!=='mist')for(const source of scene.sources){if(source.kind!=='motorcycle')continue;const point=M.position(source,Math.max(0,time-.02)),distance=M.dist(node,point);if(distance>100)continue;
        const level=M.sourceLevel(source,time)-20*Math.log10(Math.max(1,distance));if(level>score){score=level;target={source,point,distance};}}
      const enabled=node.enabled!==false&&scene.treatmentsEnabled!==false;
      let frequency=node.frequency||500,harmonic=null;
      if(node.kind==='cancellation'&&target){M.pressure(target.source,time);harmonic=target.source.harmonics.reduce((a,b)=>a.re*a.re+a.im*a.im>b.re*b.re+b.im*b.im?a:b);frequency=harmonic.n*target.point.rpm/120;}
      return {...node,enabled,target,frequency,harmonic,active:enabled&&(node.kind==='mist'||!!target)};
    });
  }
  // Educational, output-limited emitters. No vehicle dynamics or hardware commands.
  function evaluate(scene,time,point,geometry,sourceEnergy,prepared){
    const c=M.soundSpeed(scene.config),rows=prepared||states(scene,time),groups=new Map(),tones=[],details=[];let added=0;
    for(const row of rows){
      if(!row.active){details.push({id:row.id,kind:row.kind,active:false,targetId:row.target?.source.id||null});continue;}
      if(row.kind==='mist'){details.push({id:row.id,kind:row.kind,active:true,acousticDelta:0,model:'Advected droplet visualization; no calibrated attenuation or engine effect'});continue;}
      const {target,frequency}=row,path=geometry.direct(row,point),aim=target.point,dx=aim.x-row.x,dy=aim.y-row.y,dz=aim.z-row.z,length=Math.max(.001,Math.hypot(dx,dy,dz));
      const beam=(p)=>{const x=p.x-row.x,y=p.y-row.y,z=p.z-row.z,d=Math.max(.001,Math.hypot(x,y,z)),cos=(dx*x+dy*y+dz*z)/(length*d);return cos<=0?0:Math.exp(-Math.pow(Math.acos(Math.min(1,cos))/Math.max(.22,Math.min(1.3,c/frequency)),2));};
      const reference=2e-5*10**(60/20),delay=path.length/c;
      if(row.kind==='directional'){
        const rms=time>=delay?reference*path.gain*beam(point):0,energy=(rms/2e-5)**2*10**(weight(frequency)/10);added+=energy;
        tones.push({id:'treatment:'+row.id,level:db(energy),rms,delay,cutoff:frequency,source:{id:'treatment:'+row.id,kind:'tone',frequency,static:{x:row.x,y:row.y,z:row.z}}});
        details.push({id:row.id,kind:row.kind,active:true,targetId:target.source.id,frequency,received:db(energy),referenceDb:60,delayMs:delay*1000});continue;
      }
      // Delayed narrowband feed-forward estimate, not broadband or perfect cancellation.
      const oldTime=Math.max(0,time-.02),oldTarget=M.position(target.source,oldTime),calibration=geometry.direct(row,oldTarget);
      const h=row.harmonic,normal=target.source.harmonicNorm||1,toneFraction=Math.min(1,(h.re*h.re+h.im*h.im)/(2*normal*normal)*.98);
      const original=geometry.direct(M.position(target.source,Math.max(0,time-M.dist(target.point,point)/c)),point);
      const emittedTime=time-original.length/c,sourceState=M.position(target.source,Math.max(0,emittedTime));
      const tonePower=(2e-5*10**(M.sourceLevel(target.source,emittedTime)/20))**2*toneFraction;
      const weighting=10**(weight(frequency)/10),available=sourceEnergy.get(target.source.id)||0;
      const amplitude=Math.sqrt(Math.min(available,tonePower*original.gain**2/(2e-5)**2*weighting));
      const phase=h.n*sourceState.phase-Math.atan2(h.im,h.re);
      const wanted=2e-5*10**(M.sourceLevel(target.source,oldTime)/20)*Math.sqrt(toneFraction)/Math.max(1e-9,calibration.gain);
      const drive=Math.min(reference,wanted),received=drive*path.gain*beam(point)/(2e-5)*Math.sqrt(weighting);
      const commandState=M.position(target.source,Math.max(0,time-delay-.02));
      const commandPhase=h.n*commandState.phase-Math.atan2(h.im,h.re)+2*Math.PI*frequency*calibration.length/c+Math.PI;
      let group=groups.get(target.source.id);if(!group){group={re:amplitude*Math.cos(phase),im:amplitude*Math.sin(phase),power:amplitude**2,energy:available};groups.set(target.source.id,group);}
      if(time>delay+.02){group.re+=received*Math.cos(commandPhase);group.im+=received*Math.sin(commandPhase);}
      details.push({id:row.id,kind:row.kind,active:true,targetId:target.source.id,frequency,referenceDb:60,outputLimited:wanted>reference,delayMs:(delay+.02)*1000});
    }
    const adjustments=new Map();let delta=0;
    for(const[id,g]of groups){const change=g.re*g.re+g.im*g.im-g.power;delta+=change;adjustments.set(id,Math.sqrt(Math.max(0,g.energy+change)/Math.max(1e-12,g.energy)));}
    return {powerDelta:added+delta,emittedPower:added,tones,adjustments,details};
  }
  root.MotorcycleTreatments={kinds,states,evaluate};
})(globalThis);
