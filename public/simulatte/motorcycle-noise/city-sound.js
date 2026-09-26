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
    const result={free:0,direct:0,returned:0,total:0,zPower:0};
    for(const band of bands){
      const w=2*Math.PI*band.hz/RATE,cos=Math.cos(w),sin=Math.sin(w),sums={free:[0,0],direct:[0,0],returned:[0,0]};
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
        }else{sums.returned[0]+=r;sums.returned[1]+=i;}
      }
      for(const key of ['free','direct','returned'])result[key]+=band.power*band.weight*(sums[key][0]**2+sums[key][1]**2);
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
      let original=background,returned=0,untreated=background,total=background;
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
        sourceEnergy.set(source.id,value.total);
        if(value.total>0)contributors.push({id:source.id,level:10*Math.log10(value.total),rms:2e-5*Math.sqrt(value.zPower),
          delay:Math.min(...paths.map(p=>time-p.emissionTime)),cutoff:Math.max(...paths.map(p=>p.cutoff||3500))});
      }
      const treatment=root.MotorcycleTreatments?.evaluate(scene,time,point,geometry,sourceEnergy,treatments);
      if(treatment){for(const row of contributors){const gain=treatment.adjustments.get(row.id);if(gain!==undefined){row.rms*=gain;row.level+=20*Math.log10(Math.max(1e-6,gain));}}contributors.push(...treatment.tones);}
      const combined=Math.max(background,total+(treatment?.powerDelta||0));
      contributors.sort((a,b)=>b.level-a.level);
      const db=value=>10*Math.log10(Math.max(1e-12,value));
      return {total:db(combined),direct:db(original),returned:db(returned),baseline:db(untreated),change:db(combined)-db(untreated),
        traffic:db(Math.max(0,combined-background)),treatments:treatment?.details||[],contributors:includeAudio?contributors:contributors.slice(0,5),
        model:'locally-stationary-coherent-paths-independent-sources',coverage:geometry.coverage,uncertainty:{kind:'unquantified',reason:'Moving spectra, source correlation and omitted distant reflections require evaluation.'}};
    }
    return {measure,geometry};
  }
  root.MotorcycleCitySound={create,sourceSpectrum,energy};
})(globalThis);
