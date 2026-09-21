(function(root){
  const M=root.MotorcycleReflection,S=root.MotorcycleSignal;
  function create(scene,time){
    const geometry=scene.acousticContext||root.MotorcycleCityPaths.create(scene.buildings);
    if(!scene.acousticContext)Object.defineProperty(scene,'acousticContext',{value:geometry,configurable:true});
    const c=M.soundSpeed(scene.config);
    if(!scene.spectrumCache)Object.defineProperty(scene,'spectrumCache',{value:new Map(),configurable:true});
    const spectra=scene.spectrumCache;if(spectra.size>512)spectra.clear();
    const treatments=root.MotorcycleTreatments?.states(scene,time)||[];
    const sources=scene.sources.map(source=>{
      const position=M.position(source,time),rpm=Math.max(0,Math.round(position.rpm/150)*150),key=source.kind+':'+source.cylinders+':'+rpm;
      if(!spectra.has(key)){
        const rate=8000,length=1024,start=Math.max(0,time-length/rate),waveform=Float64Array.from({length},(_,i)=>M.pressure(source,start+i/rate));
        const measured=S.measure(waveform,rate);
        const bands=measured.spectrum.map(row=>({hz:row.hz,power:10**(row.dbZ/10)*S.aWeight(row.hz)**2}));
        spectra.set(key,{weighting:Number.isFinite(measured.laeq)?measured.laeq-M.sourceLevel(source,time):0,bands,total:bands.reduce((sum,row)=>sum+row.power,0)});
      }
      return {source,position,spectrum:spectra.get(key)};
    });
    function measure(point,includeAudio=false){
      let original=10**(scene.config.background/10),returned=0,untreated=original;
      const contributors=[],sourceEnergy=new Map();
      for(const {source,position,spectrum}of sources){
        const distance=M.dist(position,point);let paths;
        if(distance<120){paths=M.fieldPaths(source,point,time,scene);}
        else{
          let emission=time-distance/c,path;
          for(let i=0;i<2;i++){path=geometry.direct(M.position(source,emission),point);if(!path)break;emission=time-path.length/c;}
          paths=path?[{...path,id:'far-direct',channel:'original',emissionTime:emission,transmission:1}]:[];
          // A nearby treatment can redirect a distant source too. Do not remove
          // that contribution merely because its emitter is distant.
          if(scene.config.surface!=='none'&&M.dist(scene.panel,point)<160)paths=M.fieldPaths(source,point,time,scene);
        }
        let contribution=0,squareGain=0,firstArrival=Infinity,cutoff=0;
        for(const path of paths){
          if(path.emissionTime<0||!Number.isFinite(path.gain))continue;
          // Match the detailed solver's one-pole propagation filter rather
          // than reporting unfiltered energy behind a roof or facade.
          const memory=Math.exp(-2*Math.PI*(path.cutoff||3500)/8000),alpha=1-memory;
          const filtered=spectrum.total>0?spectrum.bands.reduce((sum,band)=>sum+band.power*alpha*alpha/(1+memory*memory-2*memory*Math.cos(2*Math.PI*band.hz/8000)),0)/spectrum.total:1;
          const power=10**((M.sourceLevel(source,path.emissionTime)+spectrum.weighting)/10)*filtered;
          const energy=power*path.gain*path.gain;
          const transmission=path.channel==='original'?(path.transmission??1):1;
          const gain=path.gain*transmission;
          const zPower=(2e-5*10**(M.sourceLevel(source,path.emissionTime)/20))**2;
          squareGain+=zPower*gain*gain;firstArrival=Math.min(firstArrival,time-path.emissionTime);cutoff=Math.max(cutoff,path.cutoff||3500);
          if(path.channel==='original'){untreated+=energy;const value=energy*(path.transmission??1)**2;original+=value;contribution+=value;}
          else{returned+=energy;contribution+=energy;}
        }
        sourceEnergy.set(source.id,contribution);
        if(contribution>0)contributors.push({id:source.id,level:10*Math.log10(contribution),rms:Math.sqrt(squareGain),delay:Number.isFinite(firstArrival)?firstArrival:0,cutoff});
      }
      const treatment=root.MotorcycleTreatments?.evaluate(scene,time,point,geometry,sourceEnergy,treatments);
      if(treatment){for(const row of contributors){const gain=treatment.adjustments.get(row.id);if(gain!==undefined){row.rms*=gain;row.level+=20*Math.log10(Math.max(1e-6,gain));}}contributors.push(...treatment.tones);}
      const combined=Math.max(10**(scene.config.background/10),original+returned+(treatment?.powerDelta||0));
      contributors.sort((a,b)=>b.level-a.level);
      const db=value=>10*Math.log10(Math.max(1e-12,value));
      return {total:db(combined),direct:db(original),returned:db(returned),baseline:db(untreated),change:db(combined)-db(untreated),traffic:db(Math.max(0,combined-10**(scene.config.background/10))),treatments:treatment?.details||[],contributors:includeAudio?contributors:contributors.slice(0,5)};
    }
    return {measure,geometry};
  }
  root.MotorcycleCitySound={create};
})(globalThis);
