(function(root){
  const M=root.MotorcycleReflection,S=root.MotorcycleSignal,RATE=8000;
  // Stationary source spectrum from the same declared engine harmonics and
  // broadband components. Frequencies are not rounded into octave bands.
  function sourceSpectrum(source,time){
    M.pressure(source,time);
    const rpm=M.position(source,time).rpm??source.rpm;
    const mix=source.kind==='pedestrian'?1:source.kind==='car'?.6:.16;
    const normalization=(1-mix)**2+mix**2;
    const bands=source.harmonics.map(h=>({hz:h.n*rpm/120,
      power:(h.re*h.re+h.im*h.im)/(2*source.harmonicNorm**2)*(1-mix)**2/normalization}));
    for(let n=0;n<8;n++)bands.push({hz:173+n*211+n*n*7.37,power:mix**2/(8*normalization)});
    return bands.filter(b=>b.hz>0&&b.hz<RATE/2).map(b=>({...b,weight:S.aWeight(b.hz)**2}));
  }
  function energy(paths,bands,time,source){
    const prepared=paths.filter(p=>p.emissionTime>=0&&Number.isFinite(p.gain)).map(p=>{
      const samples=(time-p.emissionTime)*RATE-(time*RATE-Math.floor(time*RATE)),delay=Math.floor(samples);
      return {...p,delay,fraction:samples-delay,memory:Math.exp(-2*Math.PI*(p.cutoff||3500)/RATE),amplitude:10**(M.sourceLevel(source,p.emissionTime)/20)*p.gain};
    });
    const result={free:0,direct:0,returned:0,outward:0,facade:0,total:0,zPower:0};
    for(const band of bands){
      const w=2*Math.PI*band.hz/RATE,cos=Math.cos(w),sin=Math.sin(w),sums={free:[0,0],direct:[0,0],returned:[0,0],outward:[0,0],facade:[0,0]};
      for(const p of prepared){
        // Fractional sample delay followed by the detailed solver's one-pole
        // filter. Retarded path phases combine before squaring within a source.
        const a=1-p.fraction+p.fraction*cos,b=-p.fraction*sin;
        const c=1-p.memory*cos,d=p.memory*sin,den=c*c+d*d;
        const re=(a*c+b*d)*(1-p.memory)/den,im=(b*c-a*d)*(1-p.memory)/den;
        const angle=w*p.delay,r=(re*Math.cos(angle)+im*Math.sin(angle))*p.amplitude,
          i=(im*Math.cos(angle)-re*Math.sin(angle))*p.amplitude;
        if(p.channel==='original'){
          sums.free[0]+=r;sums.free[1]+=i;
          sums.direct[0]+=r*(p.transmission??1);sums.direct[1]+=i*(p.transmission??1);
          const component=p.kind==='facade-reflection'?sums.facade:sums.outward;
          component[0]+=r*(p.transmission??1);component[1]+=i*(p.transmission??1);
        }else{sums.returned[0]+=r;sums.returned[1]+=i;}
      }
      for(const key of ['free','direct','returned','outward','facade'])result[key]+=band.power*band.weight*(sums[key][0]**2+sums[key][1]**2);
      const square=(sums.direct[0]+sums.returned[0])**2+(sums.direct[1]+sums.returned[1])**2;
      result.total+=band.power*band.weight*square;result.zPower+=band.power*square;
    }
    return result;
  }
  function create(scene,time){
    const geometry=scene.acousticContext||root.MotorcycleCityPaths.create(scene.buildings);
    if(!scene.acousticContext)Object.defineProperty(scene,'acousticContext',{value:geometry,configurable:true});
    const c=M.soundSpeed(scene.config),treatments=root.MotorcycleTreatments?.states(scene,time)||[];
    const sources=scene.sources.map(source=>({source,position:M.position(source,time),bands:sourceSpectrum(source,time)}));
    function measure(point,includeAudio=false){
      const background=10**(scene.config.background/10);
      let original=background,returned=0,untreated=background,total=background,outward=0,facade=0;
      const contributors=[],sourceEnergy=new Map();
      for(const {source,position,bands}of sources){
        const distance=M.dist(position,point);let paths;
        if(distance<120||(scene.config.surface!=='none'&&M.dist(scene.panel,point)<160))paths=M.fieldPaths(source,point,time,scene);
        else{
          let emission=time-distance/c,path;
          for(let i=0;i<4;i++){path=geometry.direct(M.position(source,emission),point);emission=time-path.length/c;}
          paths=[{...path,id:'far-direct',channel:'original',emissionTime:emission,transmission:1}];
        }
        const value=energy(paths,bands,time,source);
        untreated+=value.free;original+=value.direct;returned+=value.returned;total+=value.total;
        outward+=value.outward;facade+=value.facade;
        sourceEnergy.set(source.id,value.total);
        if(value.total>0)contributors.push({id:source.id,level:10*Math.log10(value.total),rms:2e-5*Math.sqrt(value.zPower),
          outward:value.outward>0?10*Math.log10(value.outward):null,facade:value.facade>0?10*Math.log10(value.facade):null,
          returned:value.returned>0?10*Math.log10(value.returned):null,
          pathTotal:10*Math.log10(value.total),
          delay:Math.min(...paths.map(p=>time-p.emissionTime)),cutoff:Math.max(...paths.map(p=>p.cutoff||3500))});
      }
      const treatment=root.MotorcycleTreatments?.evaluate(scene,time,point,geometry,sourceEnergy,treatments);
      if(treatment){for(const row of contributors){const gain=treatment.adjustments.get(row.id);if(gain!==undefined){row.rms*=gain;row.level+=20*Math.log10(Math.max(1e-6,gain));}}contributors.push(...treatment.tones);}
      const combined=Math.max(background,total+(treatment?.powerDelta||0));
      contributors.sort((a,b)=>b.level-a.level);
      const db=value=>10*Math.log10(Math.max(1e-12,value));
      // Re-evaluate coherent treatment groups with one emitter removed. Subtracting
      // its dBA or isolated power would discard interference with other emitters.
      if(includeAudio && treatment && !scene.mistBursts?.length)for(const detail of treatment.details){
        if(detail.kind==='mist')continue;
        const without=root.MotorcycleTreatments.evaluate(scene,time,point,geometry,sourceEnergy,treatments.filter(row=>row.id!==detail.id));
        const withoutDb=db(Math.max(background,total+without.powerDelta));
        detail.comparison={withDb:db(combined),withoutDb,changeDb:db(combined)-withoutDb};
      }
      return {total:db(combined),direct:db(original),returned:db(returned),baseline:db(untreated),change:db(combined)-db(untreated),
        outward:outward>0?db(outward):null,facade:facade>0?db(facade):null,panelReturns:returned>0?db(returned):null,
        powered:treatment?.emittedPower>0?db(treatment.emittedPower):null,treatmentChangeDb:db(combined)-db(total),
        traffic:db(Math.max(0,combined-background)),treatments:treatment?.details||[],contributors:includeAudio?contributors:contributors.slice(0,5),
        model:'locally-stationary-coherent-paths-independent-sources',coverage:geometry.coverage,uncertainty:{kind:'unquantified',reason:'Moving spectra, source correlation and omitted distant reflections require evaluation.'}};
    }
    return {measure,geometry};
  }
  function compareTreatment(scene,time,observer,treatmentId) {
    const treatment=scene.treatments.find(row=>row.id===treatmentId);
    if(!treatment||treatment.kind==='mist'||scene.mistBursts?.length) throw Error('Acoustic comparison requires a supported treatment and traffic without fictional event history');
    const geometry=scene.acousticContext||root.MotorcycleCityPaths.create(scene.buildings);
    const without={...scene,treatments:scene.treatments.filter(row=>row.id!==treatmentId)};
    const baseline=create(without,time),intervention=create(scene,time);
    const points=[['Here',0,0],['3 m east',3,0],['3 m west',-3,0],['3 m north',0,3],['3 m south',0,-3]];
    const rows=[],excluded=[];
    for(const [label,x,y]of points){
      const point={x:observer.x+x,y:observer.y+y,z:observer.z};
      if(geometry.occupied(point)){excluded.push({label,point,reason:'inside-modeled-building'});continue;}
      const before=baseline.measure(point),after=intervention.measure(point);
      rows.push({label,point,baseline:before.total,intervention:after.total,differenceDb:after.total-before.total,
        components:{baseline:{outward:before.outward,reflected:before.facade,returned:before.panelReturns,powered:before.powered},
          intervention:{outward:after.outward,reflected:after.facade,returned:after.panelReturns,powered:after.powered}}});
    }
    return {schema:'simulatte.matchedObserverComparison.v1',scope:'current-observation',time,treatmentId,
      observer:{x:observer.x,y:observer.y,z:observer.z},configuration:JSON.stringify([scene.config,scene.panel,scene.treatments,scene.treatmentsEnabled,scene.treatmentMode]),
      sourceStates:scene.sources.map(source=>({id:source.id,position:M.position(source,time)})),rows,excluded,
      claimBoundary:'Locally stationary modeled dBA at one frozen traffic instant. Baseline removes only the selected acoustic treatment. Components are inspectable contributions and their dBA values do not add. No field calibration or guaranteed quieting.',
    };
  }
  root.MotorcycleCitySound={create,sourceSpectrum,energy,compareTreatment};
})(globalThis);
