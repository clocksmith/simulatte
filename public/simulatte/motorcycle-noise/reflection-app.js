(async function(root){
  const $=id=>document.getElementById(id),M=root.MotorcycleReflection,form=$('scenario');
  const status=(text,error=false)=>{$('status').textContent=text;$('status').dataset.error=String(error);};
  let map,mapHash,scene,view,time=0,paused=false,last=0,worker=null,generation=0,result=null,audio=null,audioSource=null;
  let selected=null,placement=null,frameId=null,activeAudio=null,lastReadout=-Infinity,audioRequest=0,explorer=null;
  let populationWorker=null,populationRequest=0;
  function createTraffic(config){
    populationWorker?.terminate();const request=++populationRequest;
    status('Preparing '+config.motorcycles+' autonomous motorcycles on the connected street network');
    return new Promise((resolve,reject)=>{
      populationWorker=new Worker('./population-worker.js?v=city-controls-v7');
      populationWorker.onerror=event=>reject(new Error(event.message||'Traffic preparation failed'));
      populationWorker.onmessage=({data})=>{
        if(request!==populationRequest)return;
        if(data.error){populationWorker.terminate();populationWorker=null;reject(new Error(data.error));return;}
        populationWorker.terminate();populationWorker=null;
        Object.defineProperty(data.scene,'acousticContext',{value:root.MotorcycleCityPaths.create(map.buildings),configurable:true});
        resolve(data.scene);
      };
      populationWorker.postMessage({map,config});
    });
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
  function invalidate(){lastReadout=-Infinity;generation++;worker?.terminate();worker=null;result=null;activeAudio=null;stopAudio();view?.showMeasurements(null);
    $('results').hidden=true;$('progress').hidden=true;$('cancel').hidden=true;$('run').disabled=!scene;$('export').disabled=true;$('listen').disabled=true;}
  function read(){const p={...M.defaults};for(const key of Object.keys(p)){const element=form.elements.namedItem(key);if(element)p[key]=typeof p[key]==='boolean'?element.checked:typeof p[key]==='number'?Number(element.value):element.value;}return M.validate(p);}
  function showConfig(config){for(const[key,value]of Object.entries(config)){const element=form.elements.namedItem(key);if(!element)continue;if(typeof value==='boolean')element.checked=value;else element.value=value;}labels();}
  function setPaused(value){paused=value;last=0;$('pause').textContent=paused?(time>=180?'Replay':'Play'):'Pause';}
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
  form.addEventListener('submit',async event=>{event.preventDefault();try{const p=read();invalidate();scene=await createTraffic(p);view.setSources(scene.sources);time=0;selected=scene.sources.find(row=>row.kind==='motorcycle')?.id;setPaused(false);status('New seeded traffic pass.');}catch(error){status(error.message,true);}});
  for(const name of ['surface','cancellation','reflectivity','latencyMs'])form.elements.namedItem(name).addEventListener('change',()=>{
    if(!scene)return;try{const p=read();invalidate();for(const key of ['surface','cancellation','reflectivity','latencyMs'])scene.config[key]=p[key];status('Acoustic treatment changed; traffic and source positions are unchanged.');}catch(error){status(error.message,true);}
  });
  $('panel-angle').addEventListener('input',()=>{if(!scene)return;scene.panel.angle=Number($('panel-angle').value)*Math.PI/180;invalidate();});
  for(const button of document.querySelectorAll('[data-place]'))button.addEventListener('click',()=>{placement=button.dataset.place;for(const item of document.querySelectorAll('[data-place]'))item.setAttribute('aria-pressed',String(item===button));status(`Tap the map to place the ${placement}.`);});
  $('pause').addEventListener('click',()=>{if(paused&&time>=180){replayTraffic();}setPaused(!paused);});
  $('reset').addEventListener('click',()=>{replayTraffic();setPaused(false);});
  $('timeline').addEventListener('input',()=>{invalidate();time=Number($('timeline').value);explorer?.resetClock();setPaused(true);});
  for(const button of document.querySelectorAll('[data-focus]'))button.addEventListener('click',()=>view.focus(button.dataset.focus));
  function plot(canvas,series){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.font='12px monospace';
    const colors=['#9aa8a1','#68c7c7','#bc9bdc'];
    series.forEach((row,j)=>row.spectrum.forEach((band,i)=>{const x=30+i*(w-50)/row.spectrum.length+j*10,bar=Math.max(0,band.dbZ)*(h-35)/150;
      ctx.fillStyle=colors[j];ctx.fillRect(x,h-25-bar,8,bar);if(j===0){ctx.fillStyle='#a7b7ad';ctx.fillText(String(band.hz),x-4,h-7);}}));
  }
  function display(data){
    result=data.record;activeAudio=data.audio;$('results').hidden=false;$('export').disabled=false;$('listen').disabled=false;
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
  function run(){
    if(!scene)return;invalidate();setPaused(true);if(time<M.C.duration)time=M.C.duration;
    const observer=view.getObserver();
    const analysisScene={...scene,receiver:{...observer},reference:{...scene.reference},speaker:{...scene.speaker},panel:{...scene.panel},
      observers:[{name:'Active viewpoint',...observer},...scene.observers.slice(1)]};
    const id=generation;worker=new Worker('./reflection-worker.js?v=city-controls-v7');$('run').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;
    const fail=message=>{worker?.terminate();worker=null;$('run').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;status(message,true);};
    worker.onerror=event=>fail(event.message||'Acoustic worker failed');worker.onmessage=({data})=>{if(data.id!==id)return;
      if(data.type==='progress'){$('progress').value=data.fraction;status(data.phase);}
      if(data.type==='error')fail(data.message);
      if(data.type==='result'){worker.terminate();worker=null;$('run').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;display(data);}
    };
    worker.postMessage({id,scene:analysisScene,time,mapHash});
  }
  $('technique').addEventListener('change',()=>{
    if(!scene)return;
    invalidate();
    const technique=$('technique').value;scene.treatmentMode=technique;scene.treatmentsEnabled=['live','cancellation'].includes(technique);
    scene.config.surface=technique==='redirection'?'retro':'none';
    scene.config.cancellation=technique==='cancellation';showConfig(scene.config);
    const explanations={live:'Live treatments. Select a marker to inspect its contribution.',untreated:'Untreated traffic. Equipment and vehicle trajectories are unchanged.',redirection:'Live idealized reflection. The surface redirects intercepted sound; traffic keeps moving.',cancellation:'Live output-limited tonal cancellation at marked nodes. Broadband waveform analysis is in Advanced.'};
    $('technique-note').textContent=explanations[technique];
  });
  $('run').addEventListener('click',run);$('cancel').addEventListener('click',()=>{invalidate();status('Calculation cancelled.');});
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
    const params={mapHash,config:result.scene.config,panel:result.scene.panel,receiver:result.scene.receiver,reference:result.scene.reference,speaker:result.scene.speaker,time:result.time};
    const spec=W.finalizeWorldSpec({id:'motorcycle-noise',kind:'nyc-noise-treatment-v4',templateId:'nyc-noise-treatment-v4',name:'NYC noise treatments',description:'Idealized redistribution, redirection and active cancellation.',params,objects:[],modules:[],controls:[],
      source:{schema:W.SOURCE_SCHEMA,prompt:'',compilerConfig:{adapter:'nyc-noise-treatment-v4'}},authorship:{schema:W.AUTHORING_SCHEMA,revision:0,sources:[{id:sourceId,authority:'userOverride',label:'Scenario controls'}],fieldProvenance:[{path:'/',authority:'userOverride',sourceId}],patches:[],reconciliations:[]},
      determinism:{schema:'simulatte.worldSpecDeterminism.v1',requiredClasses:['simulation-reproducible','replay-identified'],seed:params.config.seed,simulationTolerance:1e-8,pixelPolicy:null},dependencies:{schema:'simulatte.worldSpecDependencies.v1',governedPacks:[],plugins:[],assets:[]},safety:{schema:'simulatte.worldSpecSafety.v1',rules:[],status:'not-declared'},unsupportedRequirements:['Field calibration','Physical reflector design','Hardware control'],unresolvedAmbiguities:[]});
    const url=URL.createObjectURL(new Blob([JSON.stringify({schema:'simulatte.nycNoiseReplay.v4',spec,record:result},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`nyc-noise-${scene.config.seed}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){status(error.message,true);}});
  $('import').addEventListener('change',async event=>{try{
    const file=event.target.files[0];if(!file)return;if(file.size>8000000)throw new Error('Replay exceeds 8 MB');
    const bundle=JSON.parse(await file.text());if(bundle.schema!=='simulatte.nycNoiseReplay.v4')throw new Error('Unsupported replay');root.SimulatteWorldSpec.validateWorldSpec(bundle.spec);
    const p=bundle.spec.params;if(bundle.spec.kind!=='nyc-noise-treatment-v4'||p.mapHash!==mapHash)throw new Error('Replay model or NYC map identity differs');M.validate(p.config);
    if(!Number.isFinite(p.time)||p.time<0||p.time>180)throw new Error('Replay time is outside this pass');
    for(const name of ['panel','receiver','reference','speaker'])if(!p[name]||!['x','y','z'].every(key=>Number.isFinite(p[name][key])&&Math.abs(p[name][key])<10000))throw new Error('Invalid replay geometry');
    if(!Number.isFinite(p.panel.angle)||Math.abs(p.panel.angle)>20||p.panel.width!==p.config.panelWidth||p.panel.height!==p.config.panelHeight)throw new Error('Invalid reflector geometry');
    invalidate();scene=await createTraffic(p.config);for(const name of ['panel','receiver','reference','speaker'])scene[name]={...p[name]};scene.observers[0]={name:'Listener',...scene.receiver};time=p.time;showConfig(p.config);view.setSources(scene.sources);run();
  }catch(error){status(error.message,true);}event.target.value='';});
  function tick(now){
    if(!view)return;const dt=last?Math.max(0,(now-last)/1000):0;last=now;
    if(!paused&&!document.hidden){time=Math.min(180,time+dt*Number($('playback').value));if(time>=180){if($('repeat-traffic').checked)replayTraffic();else setPaused(true);}if(result)invalidate();}
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
    frameId=requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden)stopAudio();});
  root.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);worker?.terminate();populationWorker?.terminate();stopAudio();audio?.close();explorer?.dispose();view?.dispose();view=null;});
  try{
    status('Loading NYC geometry');const response=await fetch('./nyc-map.json');if(!response.ok)throw new Error(`Map HTTP ${response.status}`);
    const bytes=await response.arrayBuffer();mapHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');map=JSON.parse(new TextDecoder().decode(bytes));
    if(map.schema!=='simulatte.nycReflectionMap.v1')throw new Error('Unsupported NYC map schema');
    scene=await createTraffic({...M.defaults});time=12;showConfig(scene.config);selected=scene.sources.find(row=>row.kind==='motorcycle')?.id;
    status('Starting Babylon renderer');view=await root.MotorcycleReflectionView.create($('city'),map,scene,pick=>{if(explorer?.pick(pick))return;if(placement&&pick.point)setEquipment(pick.point);else if(pick.sourceId){selected=pick.sourceId;$('selected').textContent=`Selected scenario source: ${selected}`;}});
    explorer=root.MotorcycleExplorer.create({view,getScene:()=>scene,getTime:()=>time,getSelected:()=>selected,getComparison:()=>result,selectSource:id=>{selected=id;lastReadout=-Infinity;}});
    $('backend').textContent=view.backend;$('panel-angle').value=scene.panel.angle*180/Math.PI;
    for(const element of document.querySelectorAll('[data-ready]'))element.disabled=false;
    status('Ready. Select a motorcycle or place a receiver to inspect the scene.');frameId=requestAnimationFrame(tick);
  }catch(error){status(`Unable to start: ${error.message}`,true);}
})(globalThis);
