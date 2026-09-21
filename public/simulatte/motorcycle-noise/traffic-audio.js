(function(root){
  'use strict';
  const M=()=>root.MotorcycleReflection;
  let state,reading,context,master,limiter,bed,bedGain,enabled=false,button,volume,statusNode,world;
  let wanted=false,starting=false;
  let sequence=0,previousTime=null,voices=new Map(),waves=new Map(),noiseBuffer,appliedReading=null,fadePending=false;
  const MAX_VOICES=32;
  // Map the synthetic source pressure into playback headroom, not speaker dBA.
  // Extra perceptual distance loss applies only to playback, never measurements.
  const MOTORCYCLE_PLAYBACK_GAIN=8/(2e-5*10**(136/20));
  const BACKGROUND_PLAYBACK_GAIN=10**(-55/20);
  const exhaustCurve=Float32Array.from({length:2049},(_,i)=>Math.tanh(1.8*(i/1024-1)));
  const outputCurve=Float32Array.from({length:2049},(_,i)=>.85*Math.tanh(1.25*(i/1024-1)));
  function playbackGain(id){
    const source=world?.sources.find(source=>source.id===id);if(source?.kind!=='motorcycle')return source?.kind==='car'||source?.kind==='pedestrian' ? .04 : 1;
    const point=M().position(source,state?.time||0),focus=state?.focus||point;
    const distance=Math.hypot(point.x-focus.x,point.y-focus.y,(point.z||0)-(focus.z||0));
    return MOTORCYCLE_PLAYBACK_GAIN/(1+(distance/25)**2);
  }
  function status(text){if(statusNode)statusNode.textContent=text;}
  function gain(node,value,time){node.gain.cancelScheduledValues(time);node.gain.setTargetAtTime(Math.max(0,value),time,.055);}
  function wave(cylinders){
    if(waves.has(cylinders))return waves.get(cylinders);
    const real=new Float32Array(33),imaginary=new Float32Array(33),angles=cylinders===4?[0,180,360,540]:cylinders===2?[0,315]:[0];let square=0;
    for(let n=1;n<=32;n++){
      const envelope=Math.exp(-n/26)/n**.85;
      imaginary[n]=angles.reduce((sum,angle)=>sum+Math.cos(n*angle*Math.PI/360),0)*envelope;
      real[n]=-angles.reduce((sum,angle)=>sum+Math.sin(n*angle*Math.PI/360),0)*envelope;
      square+=real[n]**2+imaginary[n]**2;
    }
    const rms=Math.sqrt(square/2)||1;for(let n=1;n<=32;n++){real[n]/=rms;imaginary[n]/=rms;}
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
    tone.gain.value=source.kind==='tone'?Math.SQRT2:source.kind==='pedestrian'?0:source.kind==='car'?.55:1.1;rough.gain.value=source.kind==='tone'?0:source.kind==='pedestrian'?1:source.kind==='car'?.18:.025;level.gain.value=0;
    const extra=[],engine=source.kind==='motorcycle';let body=null,exhaust=null;
    if(engine){
      const drive=context.createWaveShaper();drive.curve=exhaustCurve;drive.oversample='2x';
      body=context.createBiquadFilter();body.type='peaking';body.frequency.value=145;body.Q.value=.7;body.gain.value=7;
      exhaust=context.createBiquadFilter();exhaust.type='lowpass';exhaust.frequency.value=1350;exhaust.Q.value=.55;
      oscillator.connect(drive).connect(body).connect(exhaust).connect(tone);extra.push(drive,body,exhaust);
    }else oscillator.connect(tone);
    tone.connect(panner);noise.connect(filter).connect(rough).connect(panner);panner.connect(level).connect(master);
    oscillator.start();noise.start(0,((Number(source.id.match(/(\d+)$/)?.[1])||1)*.137)%2);
    return {source,oscillator,tone,noise,filter,rough,panner,level,body,exhaust,extra};
  }
  function disposeVoice(value){for(const node of [value.oscillator,value.noise]){try{node.stop();}catch(_error){}}for(const node of [value.oscillator,value.tone,value.noise,value.filter,value.rough,value.panner,value.level,...value.extra])node.disconnect();}
  function quiet(){if(!context)return;for(const item of voices.values())gain(item.level,0,context.currentTime);if(bedGain)gain(bedGain,0,context.currentTime);}
  function mute(){
    sequence++;wanted=false;starting=false;enabled=false;quiet();if(context)void context.suspend();
    if(button)button.checked=false;
    if(volume)volume.hidden=false;status('');
  }
  function fail(error){mute();if(button){button.checked=false;button.title=error.message||String(error);}status(error.message||String(error));}
  function install(){
    if(button)return;const toolbar=document.getElementById('sound-controls');if(!toolbar)return;
    const soundControl=document.createElement('label');soundControl.className='sound-switch';
    const soundLabel=document.createElement('span');soundLabel.textContent='Sound';
    button=document.createElement('input');button.id='traffic-sound';button.type='checkbox';button.checked=false;button.setAttribute('role','switch');button.setAttribute('aria-label','Traffic sound');
    const track=document.createElement('span');track.className='sound-switch-track';track.setAttribute('aria-hidden','true');soundControl.append(soundLabel,button,track);
    button.title='Continuous synthesized traffic at your viewpoint. Playback volume is independent of modeled dBA. The strongest 32 sources have individual voices; remaining traffic contributes to the ambient mix. No live phase-cancellation claim.';
    volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.value='.55';volume.hidden=false;volume.setAttribute('aria-label','Traffic playback volume');volume.className='traffic-volume';
    statusNode=document.createElement('span');statusNode.id='traffic-audio-status';statusNode.className='muted';statusNode.setAttribute('role','status');statusNode.style.fontSize='.75rem';
    toolbar.prepend(soundControl);document.getElementById('volume-controls').append(volume,statusNode);
    const prompt=document.getElementById('sound-prompt'),startButton=document.getElementById('sound-start'),dismissButton=document.getElementById('sound-dismiss');
    startButton.disabled=false;dismissButton.disabled=false;
    function dismissPrompt(){if(prompt.contains(document.activeElement))button.focus({preventScroll:true});prompt.hidden=true;}
    async function enableSound(){
      if(!wanted)return;
      if(starting){if(context)void context.resume().catch(error=>status(error.message||'Tap to enable sound'));return;}
      if(enabled&&context?.state==='running')return;
      const attempt=++sequence;starting=true;
      status('Starting sound');
      try{
        const AudioContext=root.AudioContext||root.webkitAudioContext;if(!AudioContext)throw new Error('This browser does not support Web Audio.');
        if(!context){
          context=new AudioContext({latencyHint:'interactive'});master=context.createGain();master.gain.value=Number(volume.value)*1.8;
          limiter=context.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=8;limiter.ratio.value=10;limiter.attack.value=.003;limiter.release.value=.18;
          const ceiling=context.createWaveShaper();ceiling.curve=outputCurve;ceiling.oversample='2x';master.connect(limiter).connect(ceiling).connect(context.destination);
          noiseBuffer=makeNoise();bed=context.createBufferSource();bed.buffer=noiseBuffer;bed.loop=true;bedGain=context.createGain();bedGain.gain.value=0;bed.connect(bedGain).connect(master);bed.start();
        }
        await context.resume();if(attempt!==sequence)return;
        if(context.state!=='running')throw new Error('Sound is unavailable. Try the Sound switch again.');
        enabled=true;button.checked=true;volume.hidden=false;appliedReading=null;fadePending=false;
        dismissPrompt();
        status(state?.paused?'Paused with simulation':'Listening at your viewpoint');
      }catch(error){
        if(attempt!==sequence)return;
        fail(error);
      }finally{if(attempt===sequence)starting=false;}
    }
    button.addEventListener('change',()=>{wanted=button.checked;if(!wanted)mute();else void enableSound();});
    startButton.addEventListener('click',()=>{wanted=true;void enableSound();});
    dismissButton.addEventListener('click',dismissPrompt);
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
      const remaining=ranked.slice(MAX_VOICES).reduce((sum,row)=>{
        const source=world.sources.find(item=>item.id===row.id);
        const scale=source?.kind==='motorcycle'?10**((86-source.db)/20):1;
        return sum+(row.rms*scale)**2;
      },0)*BACKGROUND_PLAYBACK_GAIN**2,background=BACKGROUND_PLAYBACK_GAIN*.18*2e-5*10**((reading.background??world.config.background)/20);
      gain(bedGain,Math.sqrt(remaining+background*background),now);
    }
    const model=M(),c=model.soundSpeed(world.config),right=state.focus.right||{x:1,y:0};
    for(const item of voices.values()){
      const delay=item.contribution.delay||0,p=model.position(item.source,Math.max(0,state.time-delay)),dx=p.x-state.focus.x,dy=p.y-state.focus.y,length=Math.max(1,Math.hypot(dx,dy));
      const toward=(p.speed||0)*(Math.cos(p.heading)*(-dx/length)+Math.sin(p.heading)*(-dy/length));
      const frequency=item.source.kind==='tone'?item.source.frequency:Math.max(7,(p.rpm||800)/120*c/Math.max(c*.5,c-toward));
      item.oscillator.frequency.setTargetAtTime(frequency,now,.035);
      if(item.exhaust){
        const load=Math.max(0,Math.min(1,(p.speed||0)/Math.max(1,item.source.speed))),throttle=Math.max(0,Math.min(1,(p.acceleration||0)/2));
        const pulse=1+.07*Math.sin(state.time*11.7+(item.source.phase||0));
        gain(item.tone,(1+.25*load+.35*throttle)*pulse,now);
        gain(item.rough,.012+.025*throttle,now);
        item.body.frequency.setTargetAtTime(95+Math.min(110,(p.rpm||900)/35),now,.1);
        item.exhaust.frequency.setTargetAtTime(Math.max(180,Math.min(item.contribution.cutoff||2200,850+1000*load+600*throttle)),now,.06);
      }
      item.filter.frequency.setTargetAtTime(Math.max(160,Math.min(3500,item.contribution.cutoff||1800)),now,.06);
      item.panner.pan.setTargetAtTime(Math.max(-1,Math.min(1,(dx*right.x+dy*right.y)/length)),now,.04);
    }
    status(state.cameraMode==='rider'?'Onboard microphone':'Viewpoint microphone');
  }
  root.MotorcycleTrafficAudio={update,observe,mute};
})(window);
