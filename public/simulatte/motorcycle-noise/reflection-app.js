(async function(root){
  const $=id=>document.getElementById(id),M=root.MotorcycleReflection,form=$('scenario');
  const status=(text,error=false)=>{$('status').textContent=text;$('status').dataset.error=String(error);};
  let map,mapHash,scene,view,time=0,paused=false,last=0,worker=null,generation=0,result=null,audio=null,audioSource=null;
  let selected=null,placement=null,activeAudio=null,lastReadout=-Infinity,audioRequest=0,explorer=null;
  let populationWorker=null,populationRequest=0,cameraSnapshot=null,observationSnapshot=null,expectedReplay=null;
  let lifecycle, cancelPopulation=null, cancelMeasurement=null,mistPreparing=false;
  const statusView=root.SimulatteSimulationSessionStatus.create({host:$('experience-status')});
  const session=root.SimulatteSimulationSession.create({
    id:'motorcycle-noise',
    onChange:snapshot=>statusView.render(snapshot),
    capabilities:{selection:true,camera:true,pause:true,restart:true,replay:'traffic-only',
      liveActions:true,sound:true,measurement:'snapshot'},
    operations:[
      {id:'select-object',category:'observation',perform:pick=>{if(explorer?.pick(pick))return;if(placement&&pick.point)setEquipment(pick.point);else if(pick.sourceId)selected=pick.sourceId;}},
      {id:'camera',category:'observation',perform:mode=>explorer?.setCamera(mode)},
      {id:'follow',category:'observation',perform:()=>explorer?.follow()},
      {id:'onboard',category:'observation',perform:()=>explorer?.setCamera('rider')},
      {id:'mist-spray',category:'live',available:()=>!mistPreparing&&!cancelPopulation,perform:sprayMist},
      {id:'treatment',category:'live',perform:input=>explorer?.treatment(input)},
      {id:'configure',category:'scenario',requiresRestart:true,perform:(config,operation)=>controller.configure(config,operation)},
      {id:'import-replay',category:'reproduction',perform:importReplay},
      {id:'seek',category:'reproduction',perform:value=>controller.seek(value)},
      {id:'pause',category:'execution',perform:()=>controller.pause()},
      {id:'resume',category:'execution',perform:()=>controller.resume()},
      {id:'restart',category:'reproduction',perform:()=>controller.restart()},
      {id:'replay',category:'reproduction',perform:()=>controller.replay()},
      {id:'reset-view',category:'observation',target:'camera',perform:()=>explorer?.setCamera('map')},
      {id:'compare-snapshot',category:'execution',target:'viewpoint',perform:(observer,operation)=>controller.compareSnapshot(observer,operation)},
      {id:'acoustics',category:'live',perform:values=>controller.setAcoustics(values)},
      {id:'panel-angle',category:'live',perform:value=>{if(scene){scene.panel.angle=Number(value)*Math.PI/180;invalidate();}}},
      {id:'technique',category:'live',perform:value=>controller.setTechnique(value)},
      {id:'focus-target',category:'observation',perform:id=>view.focus(id)},
    ],
  });
  root.SimulatteMotorcycleSession=session;
  const controller=Object.freeze({
    pause:()=>setPaused(true),resume:()=>setPaused(false),
    restart:()=>{replayTraffic();setPaused(false);},replay:()=>{replayTraffic();setPaused(false);},
    seek:value=>{invalidate();time=Number(value);explorer?.resetClock();setPaused(true);},
    async configure(config,operation){
      invalidate();session.update({preparation:'preparing'});
      try{
        const next=await createTraffic(config,operation?.signal);
        operation?.throwIfCancelled();
        scene=next;view.setSources(scene.sources);time=0;selected=scene.sources.find(row=>row.kind==='motorcycle')?.id;
        setPaused(false);session.update({preparation:'ready'});
      }catch(error){if(!operation||operation.isCurrent())session.update({preparation:error.name==='AbortError'?'ready':'failed'});throw error;}
    },
    compareSnapshot:run,
    setAcoustics(values){
      if(!scene)return;invalidate();
      for(const key of ['surface','cancellation','reflectivity','latencyMs'])scene.config[key]=values[key];
      status('Acoustic treatment changed; traffic and source positions are unchanged.');
    },
    setTechnique,
    snapshot:()=>({time,paused,selected,scenarioSeed:scene?.config.seed,
    observer:view?.getObserver(),sourceCount:scene?.sources.length,
    motorcycles:scene?.sources.filter(row=>row.kind==='motorcycle').slice(0,8).map(row=>({id:row.id,position:M.position(row,time)})),
    mistBursts:structuredClone(scene?.mistBursts||[]),treatments:structuredClone(scene?.treatments||[])}),invoke:session.invoke});
  root.SimulatteMotorcycleController=controller;
  statusView.render(session.snapshot());
  function createTraffic(config,signal,mistBursts=[]){
    cancelPopulation?.();populationWorker?.terminate();const request=++populationRequest;
    status('Preparing '+config.motorcycles+' autonomous motorcycles on the connected street network');
    return new Promise((resolve,reject)=>{
      const abort=()=>{finish();populationWorker?.terminate();populationWorker=null;reject(Object.assign(new Error('Traffic preparation cancelled'),{name:'AbortError'}));};
      cancelPopulation=abort;signal?.addEventListener('abort',abort,{once:true});
      const finish=()=>{signal?.removeEventListener('abort',abort);if(cancelPopulation===abort)cancelPopulation=null;};
      populationWorker=new Worker('./population-worker.js?v=mist-camera-v20');
      populationWorker.onerror=event=>{finish();reject(new Error(event.message||'Traffic preparation failed'));};
      populationWorker.onmessage=({data})=>{
        if(request!==populationRequest||signal?.aborted)return;
        finish();
        if(data.error){populationWorker.terminate();populationWorker=null;reject(new Error(data.error));return;}
        populationWorker.terminate();populationWorker=null;
        Object.defineProperty(data.scene,'acousticContext',{value:root.MotorcycleCityPaths.create(map.buildings),configurable:true});
        resolve(data.scene);
      };
      populationWorker.postMessage({map,config,mistBursts});
    });
  }
  async function sprayMist(input,operation){
    if(!scene)return;
    const previous=scene,start=time;
    const burst=root.MotorcycleTreatments.planSpray(previous,start,input);
    mistPreparing=true;$('spray-selected').dataset.preparing='true';$('spray-selected').disabled=true;
    try{
      const next=await createTraffic(previous.config,operation.signal,[...(previous.mistBursts||[]),burst]);
      operation.commit(()=>{
        for(const key of ['panel','receiver','reference','speaker','treatments'])if(previous[key])next[key]=structuredClone(previous[key]);
        next.treatmentMode='live';next.treatmentsEnabled=true;$('technique').value='live';
        invalidate();scene=next;selected=burst.sourceId;time=start;view.setSources(scene.sources);
        explorer?.refreshScene();explorer?.followSpray(burst.sourceId);status('Spraying '+burst.sourceId+'. Fictional engine stall after contact.');
      });
    }finally{mistPreparing=false;delete $('spray-selected').dataset.preparing;}
  }
  const labels=()=>{for(const element of form.elements){const output=$(`${element.name}-value`);if(output)output.textContent=element.value;}};
  function stopAudio(){audioRequest++;if(audioSource){audioSource.onended=null;audioSource.stop();audioSource.disconnect();audioSource=null;}$('listen').textContent='Listen';$('listen-source').textContent='Hear selected source';}
  async function playSamples(samples,rate,button){
    stopAudio();const request=audioRequest;if(!audio)audio=new AudioContext();await audio.resume();if(request!==audioRequest)return;
    const buffer=audio.createBuffer(1,samples.length,rate);buffer.getChannelData(0).set(Float32Array.from(samples,value=>Math.max(-.4,Math.min(.4,value*.02))));
    const source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);
    source.onended=()=>{if(audioSource===source){audioSource=null;$('listen').textContent='Listen';$('listen-source').textContent='Hear selected source';}source.disconnect();};
    audioSource=source;source.start();button.textContent='Stop';
  }
  function invalidate(){cancelMeasurement?.();cancelMeasurement=null;lastReadout=-Infinity;generation++;worker?.terminate();worker=null;result=null;activeAudio=null;stopAudio();view?.showMeasurements(null);
    session.update({measurement:'stale'});
    $('results').hidden=true;$('progress').hidden=true;$('cancel').hidden=true;$('run').disabled=!scene;$('export').disabled=true;$('listen').disabled=true;}
  function read(){const p={...M.defaults};for(const key of Object.keys(p)){const element=form.elements.namedItem(key);if(element)p[key]=typeof p[key]==='boolean'?element.checked:typeof p[key]==='number'?Number(element.value):element.value;}return M.validate(p);}
  function showConfig(config){for(const[key,value]of Object.entries(config)){const element=form.elements.namedItem(key);if(!element)continue;if(typeof value==='boolean')element.checked=value;else element.value=value;}labels();}
  function setPaused(value){paused=value;last=0;lifecycle?.setPaused(value);$('pause').textContent=paused?(time>=180?'Replay':'Resume'):'Pause';}
  function setEquipment(point){
    if(scene.acousticContext.occupied(point)) { status('Place equipment outdoors, clear of mapped buildings.', true); return; }

    if(placement==='panel'){scene.panel.x=point.x;scene.panel.y=point.y;}
    if(placement==='listener'){
      const dx=point.x-scene.receiver.x,dy=point.y-scene.receiver.y;
      for(const target of [scene.receiver,scene.reference,scene.speaker,scene.observers[0]]){target.x+=dx;target.y+=dy;}
    }
    placement=null;for(const button of document.querySelectorAll('[data-place]'))button.setAttribute('aria-pressed','false');invalidate();status('Position changed. Compare to calculate the new field.');
  }
  form.addEventListener('input',labels);
  const invoke=(id,input)=>{void session.invoke(id,input).catch(error=>{if(error.name!=='AbortError')status(error.message,true);});};
  form.addEventListener('submit',event=>{event.preventDefault();try{invoke('configure',read());}catch(error){status(error.message,true);}});
  for(const name of ['surface','cancellation','reflectivity','latencyMs'])form.elements.namedItem(name).addEventListener('change',()=>{
    if(!scene)return;try{invoke('acoustics',read());}catch(error){status(error.message,true);}
  });
  $('panel-angle').addEventListener('input',()=>invoke('panel-angle',$('panel-angle').value));
  for(const button of document.querySelectorAll('[data-place]'))button.addEventListener('click',()=>{placement=button.dataset.place;for(const item of document.querySelectorAll('[data-place]'))item.setAttribute('aria-pressed',String(item===button));status(`Tap the map to place the ${placement}.`);});
  document.addEventListener('cancel-equipment-placement',()=>{placement=null;for(const button of document.querySelectorAll('[data-place]'))button.setAttribute('aria-pressed','false');});
  $('pause').addEventListener('click',()=>invoke(paused?(time>=180?'replay':'resume'):'pause'));
  $('reset-view').addEventListener('click',()=>invoke('reset-view'));
  $('replay-traffic').addEventListener('click',()=>invoke('replay'));
  $('reset').addEventListener('click',()=>invoke('replay'));
  $('timeline').addEventListener('input',()=>invoke('seek',$('timeline').value));
  for(const button of document.querySelectorAll('[data-focus]'))button.addEventListener('click',()=>invoke('focus-target',button.dataset.focus));
  function plot(canvas,series){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.font='12px monospace';
    const colors=['#9aa8a1','#68c7c7','#bc9bdc'];
    series.forEach((row,j)=>row.spectrum.forEach((band,i)=>{const x=30+i*(w-50)/row.spectrum.length+j*10,bar=Math.max(0,band.dbZ)*(h-35)/150;
      ctx.fillStyle=colors[j];ctx.fillRect(x,h-25-bar,8,bar);if(j===0){ctx.fillStyle='#a7b7ad';ctx.fillText(String(band.hz),x-4,h-7);}}));
  }
  function display(data){
    if(expectedReplay){
      const expected=expectedReplay;expectedReplay=null;
      if(JSON.stringify(expected.readings)!==JSON.stringify(data.record.readings)||JSON.stringify(expected.scene.receiver)!==JSON.stringify(data.record.scene.receiver)){
        status('Replay differs from the saved observation.',true);return;
      }
    }
    result=data.record;activeAudio=data.audio;$('results').hidden=false;$('export').disabled=false;$('listen').disabled=false;
    session.update({measurement:'fresh'});
    const r=result.readings;$('before').textContent=r.baseline.laeq.toFixed(1);$('surface-level').textContent=r.withSurface.laeq.toFixed(1);$('after').textContent=r.total.laeq.toFixed(1);
    const change=r.total.laeq-r.baseline.laeq;$('change').textContent=`${change>0?'+':''}${change.toFixed(1)} dB`;$('change').dataset.direction=change>.5?'louder':change<-.5?'quieter':'same';
    $('interval').textContent=`${result.interval[0].toFixed(2)}-${result.interval[1].toFixed(2)} s / A-weighted equivalent levels / includes controller startup`;
    const body=$('observer-rows');body.replaceChildren();
    for(const row of result.observers){const tr=document.createElement('tr');for(const value of [row.name,row.baseline===null?'--':row.baseline.toFixed(1),row.total===null?'--':row.total.toFixed(1),row.returned.toFixed(1)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
    $('off-target').textContent=`${result.points.filter(row=>row.change>.5).length}/${result.points.length} grid points louder. Largest increase: ${Math.max(0,...result.points.map(row=>row.change)).toFixed(1)} dB.`;
    $('inference').textContent=`${result.observation.status}${result.observation.dominantHz?` / strongest bin ${result.observation.dominantHz.toFixed(0)} Hz`:''}. This is a mixed microphone signal, not a vehicle identity.`;
    const ledger=result.ledger;$('energy-rows').replaceChildren();
    for(const [key,label]of [['emitted','Traffic source energy'],['bypassing','Not intercepted'],['inbound','Traveling toward panel'],['reflected','Re-emitted by panel'],['absorbed','Absorbed'],['transmitted','Transmitted'],['balanceError','Accounting residual']]){
      const row=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;value.textContent=`${ledger[key].toExponential(3)} J`;row.append(name,value);$('energy-rows').append(row);
    }
    $('active-energy').textContent=`Additional active-emitter energy: ${result.poweredEmitter.energyJ.toExponential(3)} J over the measurement interval. ${result.poweredEmitter.clippedSamples} clipped command samples.`;
    plot($('spectrum'),[r.baseline,r.withSurface,r.total]);view.showMeasurements(result,$('layer').value);status('Comparison ready. Results are tied to this paused snapshot.');
  }
  $('advanced-entry').addEventListener('click',event=>{event.preventDefault();$('advanced-settings').open=true;$('advanced-settings').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
  let replayNoticeTimer=null;
  function replayTraffic(){
    invalidate();time=0;lastReadout=-Infinity;explorer?.resetClock();
    $('playback-state').textContent='Replaying traffic';clearTimeout(replayNoticeTimer);
    replayNoticeTimer=setTimeout(()=>{$('playback-state').textContent='';},4000);
  }
  function run(observerOverride=null,operation=null){
    if(!scene||!view)return;invalidate();setPaused(true);if(time<M.C.duration)time=M.C.duration;
    const observer=observerOverride&&typeof observerOverride.x==='number'?observerOverride:view.getObserver();
    const analysisScene={...scene,receiver:{...observer},reference:{...scene.reference},speaker:{...scene.speaker},panel:{...scene.panel},
      observers:[{name:'Active viewpoint',...observer},...scene.observers.slice(1)]};
    session.update({measurement:'pending'});
    return new Promise((resolve,reject)=>{
    const abort=()=>{finish();worker?.terminate();worker=null;reject(Object.assign(new Error('Measurement cancelled'),{name:'AbortError'}));};
    cancelMeasurement=abort;operation?.signal.addEventListener('abort',abort,{once:true});
    const finish=()=>{operation?.signal.removeEventListener('abort',abort);if(cancelMeasurement===abort)cancelMeasurement=null;};
    const id=generation;worker=new Worker('./reflection-worker.js?v=mist-camera-v20');$('run').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;
    const fail=message=>{worker?.terminate();worker=null;$('run').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;status(message,true);finish();session.update({measurement:'stale'});reject(new Error(message));};
    worker.onerror=event=>{if(id===generation)fail(event.message||'Acoustic worker failed');};worker.onmessage=({data})=>{if(data.id!==id||id!==generation)return;
      if(data.type==='progress'){$('progress').value=data.fraction;status(data.phase);}
      if(data.type==='error')fail(data.message);
      if(data.type==='result'){worker.terminate();worker=null;$('run').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;finish();if(operation)operation.commit(()=>display(data));else display(data);resolve(data.record);}
    };
    worker.postMessage({id,scene:analysisScene,time,mapHash});
    });
  }
  function setTechnique(technique){
    if(!scene)return;
    invalidate();
    scene.treatmentMode=technique;scene.treatmentsEnabled=['live','cancellation'].includes(technique);
    scene.config.surface=technique==='redirection'?'retro':'none';
    scene.config.cancellation=technique==='cancellation';showConfig(scene.config);
    const explanations={live:'Live treatments. Select a marker to inspect its contribution.',untreated:'Untreated traffic. Equipment and vehicle trajectories are unchanged.',redirection:'Live idealized reflection. The surface redirects intercepted sound; traffic keeps moving.',cancellation:'Live output-limited tonal cancellation at marked nodes. Broadband waveform analysis is in Advanced.'};
    $('technique-note').textContent=explanations[technique];
  }
  $('technique').addEventListener('change',()=>invoke('technique',$('technique').value));
  $('run').addEventListener('click',()=>{expectedReplay=null;invoke('compare-snapshot');});$('cancel').addEventListener('click',()=>{invalidate();status('Calculation cancelled.');});
  $('layer').addEventListener('change',()=>{if(result)view.showMeasurements(result,$('layer').value);});
  $('listen').addEventListener('click',async()=>{if(audioSource){stopAudio();return;}try{if(activeAudio)await playSamples(activeAudio[$('audio-mode').value],result.sampleRate,$('listen'));}catch(error){status(error.message,true);}});
  $('listen-source').addEventListener('click',async()=>{if(audioSource){stopAudio();return;}try{
    const source=scene?.sources.find(item=>item.id===selected)||scene?.sources.find(item=>item.kind==='motorcycle');if(!source)return;
    const rate=M.C.rate,start=Math.min(time,180-M.C.duration),samples=Float64Array.from({length:Math.round(M.C.duration*rate)},(_,i)=>M.pressure(source,start+i/rate));
    await playSamples(samples,rate,$('listen-source'));
  }catch(error){status(error.message,true);}});
  $('audio-mode').addEventListener('change',stopAudio);
  $('export').addEventListener('click',()=>{if(!result)return;try{
    const W=root.SimulatteWorldSpec,sourceId='source:nyc-noise-scenario';
    const params={mapHash,config:result.scene.config,panel:result.scene.panel,receiver:result.scene.receiver,reference:result.scene.reference,speaker:result.scene.speaker,time:result.time,mistBursts:result.scene.mistBursts||[]};
    const spec=W.finalizeWorldSpec({id:'motorcycle-noise',kind:'nyc-noise-treatment-v4',templateId:'nyc-noise-treatment-v4',name:'NYC noise treatments',description:'Idealized redistribution, redirection and active cancellation.',params,objects:[],modules:[],controls:[],
      source:{schema:W.SOURCE_SCHEMA,prompt:'',compilerConfig:{adapter:'nyc-noise-treatment-v4'}},authorship:{schema:W.AUTHORING_SCHEMA,revision:0,sources:[{id:sourceId,authority:'userOverride',label:'Scenario controls'}],fieldProvenance:[{path:'/',authority:'userOverride',sourceId}],patches:[],reconciliations:[]},
      determinism:{schema:'simulatte.worldSpecDeterminism.v1',requiredClasses:['simulation-reproducible','replay-identified'],seed:params.config.seed,simulationTolerance:1e-8,pixelPolicy:null},dependencies:{schema:'simulatte.worldSpecDependencies.v1',governedPacks:[],plugins:[],assets:[]},safety:{schema:'simulatte.worldSpecSafety.v1',rules:[],status:'not-declared'},unsupportedRequirements:['Field calibration','Physical reflector design','Hardware control'],unresolvedAmbiguities:[]});
    const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'simulatte.nycNoiseReplay.v4',spec,record:result},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`nyc-noise-${scene.config.seed}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){status(error.message,true);}});
  async function importReplay(file,operation){
    if(file.size>8000000)throw new Error('Replay exceeds 8 MB');
    const bundle=JSON.parse(await file.text());operation.throwIfCancelled();if(bundle.schema!=='simulatte.nycNoiseReplay.v4')throw new Error('Unsupported replay');root.SimulatteWorldSpec.validateWorldSpec(bundle.spec);
    const p=bundle.spec.params;if(bundle.spec.kind!=='nyc-noise-treatment-v4'||p.mapHash!==mapHash)throw new Error('Replay model or NYC map identity differs');M.validate(p.config);
    if(!Number.isFinite(p.time)||p.time<0||p.time>180)throw new Error('Replay time is outside this pass');
    for(const name of ['panel','receiver','reference','speaker'])if(!p[name]||!['x','y','z'].every(key=>Number.isFinite(p[name][key])&&Math.abs(p[name][key])<10000))throw new Error('Invalid replay geometry');
    if(!Number.isFinite(p.panel.angle)||Math.abs(p.panel.angle)>20||p.panel.width!==p.config.panelWidth||p.panel.height!==p.config.panelHeight)throw new Error('Invalid reflector geometry');
    if(!bundle.record?.readings)throw new Error('Replay measurements missing');
    invalidate();const next=await createTraffic(p.config,operation.signal,p.mistBursts||[]);operation.throwIfCancelled();scene=next;for(const name of ['panel','receiver','reference','speaker'])scene[name]={...p[name]};scene.observers[0]={name:'Listener',...scene.receiver};time=p.time;showConfig(p.config);view.setSources(scene.sources);expectedReplay=bundle.record;if(!expectedReplay?.readings)throw new Error('Replay measurements missing');await session.invoke('compare-snapshot',p.receiver);
  }
  $('import').addEventListener('change',event=>{const file=event.target.files[0];if(file)invoke('import-replay',file);event.target.value='';});
  function tick(now){
    if(!view)return;const dt=last?Math.max(0,(now-last)/1000):0;last=now;
    if(!paused&&!mistPreparing&&!document.hidden){time=Math.min(180,time+dt*Number($('playback').value));if(time>=180){if($('repeat-traffic').checked)replayTraffic();else setPaused(true);}if(result)invalidate();}
    $('timeline').value=time;$('clock').textContent=`${time.toFixed(2)} s`;
    $('sound-speed').textContent=`${M.soundSpeed(scene.config).toFixed(1)} m/s`;
    view.draw({scene,time,selected,paths:$('paths').checked});
    if(now-lastReadout>=250){
      lastReadout=now;
      const source=scene.sources.find(row=>row.id===selected)||scene.sources.find(row=>row.kind==='motorcycle');
      if(source){const point=M.position(source,time),value=M.contributions(source,point,time,scene);
        $('selected').textContent=`M${Number(source.id.match(/(\d+)$/)?.[1]||1)} / ${(point.speed*3.6).toFixed(1)} km/h / ${Math.round(point.rpm)} RPM / ${Math.round(point.rpm*source.cylinders/120)} Hz mean firing rate / ${M.sourceLevel(source,time).toFixed(1)} dB at 1 m (modeled)`;
        $('return-status').textContent=value.emissionTime>=0&&Math.abs(value.returned)>1e-12?'Returned contribution reaches the selected motorcycle position at this sampled instant.':'No returned contribution at the selected motorcycle position at this sampled instant.';
      }else{
        $('return-status').textContent='No motorcycle selected in this traffic pass.';
      }
    }
    explorer?.update(now);
    root.MotorcycleTrafficAudio?.update({ scene, time, paused, selected, focus: view.getObserver(),
      cameraMode: $('camera-mode').value, speed: Number($('playback').value) || 1 });
  }
  document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden)stopAudio();});
  async function releaseRenderer(){
    const oldExplorer=explorer,oldView=view;explorer=null;view=null;
    const errors=[];
    for(const resource of [oldExplorer,oldView])try{resource?.dispose();}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'Renderer cleanup failed');
  }
  function suspend(){
    last=0;stopAudio();root.MotorcycleTrafficAudio?.mute();
    cameraSnapshot=view?.captureCamera()||cameraSnapshot;
    observationSnapshot=explorer?.captureObservation()||observationSnapshot;
    $('observer-level').textContent='Measurement paused';
    $('observer-time').textContent='Rendering unavailable';
    $('observer-history').getContext('2d').clearRect(0,0,240,48);
    cancelMeasurement?.();worker?.terminate();worker=null;generation++;
  }
  lifecycle=root.MotorcycleLifecycle.create({
    frame:tick,suspend,release:releaseRenderer,
    onState(state){
      session.update({preparation:cancelPopulation||state.state==='loading'?'preparing':state.state==='failed'?'failed':'ready',
        rendering:state.state==='recovering'?'recovering':state.state==='failed'?'failed':
          ['running','paused'].includes(state.state)?'ready':'idle',
        execution:state.state==='running'?'running':state.state==='paused'?'paused':
          state.state==='failed'?'failed':'idle'});
      const previousState=document.body.dataset.state;
      document.body.dataset.state=state.state;
      if(previousState!==state.state){
        if(['running','paused'].includes(state.state))status(state.state==='running'?'Traffic running':'Traffic paused');
        else if(state.failures.length)status(`Scene ${state.state}: ${state.failures.at(-1).message}`,true);
      }
      $('experience-message').textContent={loading:'Loading city',recovering:'Restoring the scene. Simulation paused.',failed:'The scene could not restart. Your simulation is preserved.'}[state.state]||state.state;
      $('experience-retry').hidden=state.state!=='failed';
      const usable=['running','paused'].includes(state.state);
      for(const element of document.querySelectorAll('[data-ready]'))element.disabled=!usable;
      if(worker)$('run').disabled=true;
      root.motorcycleRuntimeReceipt={...state,time,scenarioSeed:scene?.config.seed,backend:view?.backend,backendFailures:view?.backendFailures||[]};
    },
    async prepare({backend,isCurrent}){
      last=0;
      if(!map){
        const response=await fetch('./nyc-map.json');if(!response.ok)throw new Error(`Map HTTP ${response.status}`);
        const bytes=await response.arrayBuffer();mapHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');map=JSON.parse(new TextDecoder().decode(bytes));
        if(map.schema!=='simulatte.nycReflectionMap.v1')throw new Error('Unsupported NYC map schema');
      }
      if(!scene){scene=await createTraffic({...M.defaults});time=12;showConfig(scene.config);selected=scene.sources.find(row=>row.kind==='motorcycle')?.id;}
      if(!isCurrent())return;
      const previous=$('city'),canvas=previous.cloneNode(false);previous.replaceWith(canvas);
      view=await root.MotorcycleReflectionView.create(canvas,map,scene,pick=>invoke('select-object',pick),{backend});
      if(!isCurrent())return;
      if(cameraSnapshot)view.restoreCamera(cameraSnapshot);
      explorer=root.MotorcycleExplorer.create({view,command:invoke,onMeasurement:measurement=>session.update({measurement}),initialObservation:observationSnapshot,getScene:()=>scene,getTime:()=>time,getSelected:()=>selected,getComparison:()=>result,selectSource:id=>{selected=id;lastReadout=-Infinity;}});
      $('backend').textContent=view.backend;$('panel-angle').value=scene.panel.angle*180/Math.PI;
      status('Drawing the first frame');
    }
  });
  $('experience-retry').addEventListener('click',()=>{void lifecycle.retry();});
  root.addEventListener('pagehide',()=>{cancelPopulation?.();cancelMeasurement?.();populationWorker?.terminate();session.dispose();statusView.dispose();void lifecycle.dispose();audio?.close();});
  await lifecycle.start();
})(globalThis);
