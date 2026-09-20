(function(root){
  'use strict';
  const M=()=>root.MotorcycleReflection;
  let state,reading,context,master,limiter,bed,bedGain,enabled=false,button,volume,statusNode,world;
  let sequence=0,previousTime=null,voices=new Map(),waves=new Map(),noiseBuffer,appliedReading=null,fadePending=false;
  const MAX_VOICES=32;
  // Playback-only motorcycle emphasis and gentler distance falloff. Measurements remain unchanged.
  const MOTORCYCLE_PLAYBACK_GAIN=10**(18/20);
  function playbackGain(id){
    const source=world?.sources.find(source=>source.id===id);if(source?.kind!=='motorcycle')return 1;
    const point=M().position(source,state?.time||0),focus=state?.focus||point;
    const distance=Math.hypot(point.x-focus.x,point.y-focus.y,(point.z||0)-(focus.z||0));
    return MOTORCYCLE_PLAYBACK_GAIN*Math.min(6,Math.max(1,(distance/25)**.6));
  }
  function status(text){if(statusNode)statusNode.textContent=text;}
  function gain(node,value,time){node.gain.cancelScheduledValues(time);node.gain.setTargetAtTime(Math.max(0,value),time,.055);}
  function wave(cylinders){
    if(waves.has(cylinders))return waves.get(cylinders);
    const real=new Float32Array(21),imaginary=new Float32Array(21),angles=cylinders===4?[0,180,360,540]:cylinders===2?[0,270]:[0];let square=0;
    for(let n=1;n<=20;n++){
      imaginary[n]=angles.reduce((sum,angle)=>sum+Math.cos(n*angle*Math.PI/360),0)/n**1.15;
      real[n]=-angles.reduce((sum,angle)=>sum+Math.sin(n*angle*Math.PI/360),0)/n**1.15;
      square+=real[n]**2+imaginary[n]**2;
    }
    const rms=Math.sqrt(square/2)||1;for(let n=1;n<=20;n++){real[n]/=rms;imaginary[n]/=rms;}
    const result=context.createPeriodicWave(real,imaginary,{disableNormalization:true});waves.set(cylinders,result);return result;
  }
  function makeNoise(){
    const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),samples=buffer.getChannelData(0);let seed=731,filtered=0,square=0;
    for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;filtered=.92*filtered+.08*(seed/2147483648-1);samples[i]=filtered;square+=filtered*filtered;}
    const rms=Math.sqrt(square/samples.length)||1;for(let i=0;i<samples.length;i++)samples[i]/=rms;return buffer;
  }
  function voice(source){
    const oscillator=context.createOscillator(),tone=context.createGain(),noise=context.createBufferSource(),filter=context.createBiquadFilter(),rough=context.createGain(),panner=context.createStereoPanner(),level=context.createGain();
    if(source.kind!=='tone')oscillator.setPeriodicWave(wave(source.cylinders));oscillator.frequency.value=source.frequency||10;
    noise.buffer=noiseBuffer;noise.loop=true;filter.type='lowpass';filter.frequency.value=1100;filter.Q.value=.4;
    tone.gain.value=source.kind==='tone'?Math.SQRT2:source.kind==='pedestrian'?0:source.kind==='car'?.55:.85;rough.gain.value=source.kind==='tone'?0:source.kind==='pedestrian'?1:source.kind==='car'?.45:.15;level.gain.value=0;
    oscillator.connect(tone).connect(panner);noise.connect(filter).connect(rough).connect(panner);panner.connect(level).connect(master);
    oscillator.start();noise.start(0,((Number(source.id.match(/(\d+)$/)?.[1])||1)*.137)%2);
    return {source,oscillator,tone,noise,filter,rough,panner,level};
  }
  function disposeVoice(value){for(const node of [value.oscillator,value.noise]){try{node.stop();}catch(_error){}}for(const node of [value.oscillator,value.tone,value.noise,value.filter,value.rough,value.panner,value.level])node.disconnect();}
  function quiet(){if(!context)return;for(const item of voices.values())gain(item.level,0,context.currentTime);if(bedGain)gain(bedGain,0,context.currentTime);}
  function mute(){
    sequence++;enabled=false;quiet();if(context)void context.suspend();
    if(button)button.checked=false;
    if(volume)volume.hidden=true;status('');
  }
  function fail(error){mute();if(button){button.checked=false;button.title=error.message||String(error);}status(error.message||String(error));}
  function install(){
    if(button)return;const toolbar=document.querySelector('.city-toolbar');if(!toolbar)return;
    const soundControl=document.createElement('label');soundControl.className='sound-switch';
    const soundLabel=document.createElement('span');soundLabel.textContent='Sound';
    button=document.createElement('input');button.id='traffic-sound';button.type='checkbox';button.setAttribute('role','switch');button.setAttribute('aria-label','Traffic sound');
    const track=document.createElement('span');track.className='sound-switch-track';track.setAttribute('aria-hidden','true');soundControl.append(soundLabel,button,track);
    button.title='Continuous synthesized traffic at your viewpoint. Playback volume is independent of modeled dBA. The strongest 32 sources have individual voices; remaining traffic contributes to the ambient mix. No live phase-cancellation claim.';
    volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.value='.55';volume.hidden=true;volume.setAttribute('aria-label','Traffic playback volume');volume.className='traffic-volume';
    statusNode=document.createElement('span');statusNode.id='traffic-audio-status';statusNode.className='muted';statusNode.setAttribute('role','status');statusNode.style.fontSize='.75rem';
    toolbar.append(soundControl,volume,statusNode);
    button.addEventListener('change',async()=>{
      if(!button.checked){mute();return;}
      const attempt=++sequence;
      try{
        const AudioContext=root.AudioContext||root.webkitAudioContext;if(!AudioContext)throw new Error('This browser does not support Web Audio.');
        if(!context){
          context=new AudioContext({latencyHint:'interactive'});master=context.createGain();master.gain.value=Number(volume.value)*1.8;
          limiter=context.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=12;limiter.ratio.value=16;limiter.attack.value=.003;limiter.release.value=.15;master.connect(limiter).connect(context.destination);
          noiseBuffer=makeNoise();bed=context.createBufferSource();bed.buffer=noiseBuffer;bed.loop=true;bedGain=context.createGain();bedGain.gain.value=0;bed.connect(bedGain).connect(master);bed.start();
        }
        await context.resume();if(attempt!==sequence)return;
        enabled=true;button.checked=true;volume.hidden=false;appliedReading=null;fadePending=false;
        status(state?.paused?'Paused with simulation':'Listening at your viewpoint');
      }catch(error){fail(error);}
    });
    volume.addEventListener('input',()=>{if(master)gain(master,Number(volume.value)*1.8,context.currentTime);});
    document.addEventListener('click',event=>{if(event.target.closest('#listen, #listen-source'))mute();},true);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)mute();});
    root.addEventListener('pagehide',()=>{mute();for(const item of voices.values())disposeVoice(item);voices.clear();try{bed?.stop();}catch(_error){}if(context)void context.close();},{once:true});
  }
  function observe(data){reading=data;}
  function update(next){
    state=next;install();
    if(state.scene!==world){world=state.scene;reading=null;appliedReading=null;previousTime=null;for(const item of voices.values())disposeVoice(item);voices.clear();}
    if(previousTime!==null&&(state.time<previousTime||state.time-previousTime>1)){reading=null;appliedReading=null;quiet();}
    previousTime=state.time;
    if(!enabled||!context)return;
    if(state.paused||document.hidden){if(!fadePending){quiet();fadePending=true;}status('Paused with simulation');return;}
    if(context.state!=='running'){status('Audio interrupted; toggle sound to resume');return;}
    const observer=reading?.observer;
    const moved=observer&&Math.hypot(observer.point.x-state.focus.x,observer.point.y-state.focus.y,(observer.point.z||0)-(state.focus.z||0));
    if(!observer||moved>20){if(!fadePending){quiet();fadePending=true;}status('Updating microphone');return;}
    const now=context.currentTime;
    if(appliedReading!==reading||fadePending){
      appliedReading=reading;fadePending=false;
      const ranked=observer.contributors.filter(row=>row.rms>0),selected=ranked.slice(0,MAX_VOICES),ids=new Set(selected.map(row=>row.id));
      for(const[id,item]of voices)if(!ids.has(id)){gain(item.level,0,now);voices.delete(id);setTimeout(()=>disposeVoice(item),220);}
      for(const contribution of selected){
        const source=world.sources.find(item=>item.id===contribution.id)||contribution.source;if(!source)continue;
        let item=voices.get(source.id);if(!item){item=voice(source);voices.set(source.id,item);}
        item.source=source;item.contribution=contribution;gain(item.level,contribution.rms*playbackGain(source.id),now);
      }
      const remaining=ranked.slice(MAX_VOICES).reduce((sum,row)=>sum+(row.rms*playbackGain(row.id))**2,0),background=.18*2e-5*10**((reading.background??world.config.background)/20);
      gain(bedGain,Math.sqrt(remaining+background*background),now);
    }
    const model=M(),c=model.soundSpeed(world.config),right=state.focus.right||{x:1,y:0};
    for(const item of voices.values()){
      const delay=item.contribution.delay||0,p=model.position(item.source,Math.max(0,state.time-delay)),dx=p.x-state.focus.x,dy=p.y-state.focus.y,length=Math.max(1,Math.hypot(dx,dy));
      const toward=(p.speed||0)*(Math.cos(p.heading)*(-dx/length)+Math.sin(p.heading)*(-dy/length));
      const frequency=item.source.kind==='tone'?item.source.frequency:Math.max(7,(p.rpm||800)/120*c/Math.max(c*.5,c-toward));
      item.oscillator.frequency.setTargetAtTime(frequency,now,.035);
      item.filter.frequency.setTargetAtTime(Math.max(160,Math.min(3500,item.contribution.cutoff||1800)),now,.06);
      item.panner.pan.setTargetAtTime(Math.max(-1,Math.min(1,(dx*right.x+dy*right.y)/length)),now,.04);
    }
    status(state.cameraMode==='rider'?'Onboard microphone':'Viewpoint microphone');
  }
  root.MotorcycleTrafficAudio={update,observe,mute};
})(window);
