(function(root){
  function create(scene,start,length,rate,{geometryStepSamples=160}={}){
    if(!Number.isInteger(geometryStepSamples)||geometryStepSamples<1||geometryStepSamples>rate)throw Error('Invalid acoustic geometry step');
    const M=root.MotorcycleReflection,S=root.MotorcycleSignal,c=M.soundSpeed(scene.config),end=start+length/rate;
    const listeners=[scene.receiver,scene.reference,...scene.observers],locations=scene.sources.flatMap(source=>[M.position(source,0),M.position(source,end)]);
    let maximum=0;for(const p of locations)for(const q of [...listeners,scene.panel])maximum=Math.max(maximum,M.dist(p,q));
    // Keep emission samples on one clock grid. Changing an observer's distance
    // must not shift the fractional-delay interpolation filter for every source.
    const from=Math.floor(Math.max(0,start-(maximum*2+250)/c)*rate)/rate,count=Math.ceil((end-from)*rate)+3;
    const waves=new Map(scene.sources.map(source=>[source.id,Float64Array.from({length:count},(_,i)=>M.pressure(source,from+i/rate))]));
    function receive(point,seed=0,onlySource=null,moving=false){
      const free=new Float64Array(length),direct=new Float64Array(length),returned=new Float64Array(length),rng=S.random(scene.config.seed+seed);
      if(!onlySource){
        const noise=Float64Array.from({length},()=>rng()*2-1),scale=10**((scene.config.background-S.measure(noise,rate).laeq)/20);
        for(let i=0;i<length;i++)free[i]=direct[i]=noise[i]*scale;
      }
      for(const source of onlySource?[onlySource]:scene.sources){
        const filters=new Map(),wave=waves.get(source.id);
        for(let block=0;block<length;block+=geometryStepSamples){
          const last=Math.min(length-1,block+geometryStepSamples),times=[start+block/rate,start+last/rate];
          const paths=times.map(time=>M.fieldPaths(source,moving?M.position(source,time):point,time,scene));
          const ids=new Set(paths.flat().map(path=>path.id));
          for(const id of ids){
            const a=paths[0].find(row=>row.id===id),b=paths[1].find(row=>row.id===id),left=a||b,right=b||a;
            if(onlySource&&left.channel!=='returned')continue;
            let filter=filters.get(id)||0;
            for(let i=block;i<Math.min(length,block+geometryStepSamples);i++){
              const u=(i-block)/Math.max(1,last-block),time=left.emissionTime+(right.emissionTime-left.emissionTime)*u;
              const gain=(a?.gain||0)*(1-u)+(b?.gain||0)*u,cutoff=left.cutoff+(right.cutoff-left.cutoff)*u;
              filter+=(1-Math.exp(-2*Math.PI*cutoff/rate))*(S.sample(wave,(time-from)*rate)-filter);
              if(left.channel==='returned')returned[i]+=filter*gain;
              else{free[i]+=filter*gain;direct[i]+=filter*gain*(left.transmission+(right.transmission-left.transmission)*u);}
            }
            filters.set(id,filter);
          }
        }
      }
      return {free,direct,returned,primary:Float64Array.from(direct,(value,i)=>value+returned[i])};
    }
    return {receive,geometryStepSeconds:geometryStepSamples/rate,emissionStart:from};
  }
  root.MotorcycleAcousticField={create};
})(globalThis);
