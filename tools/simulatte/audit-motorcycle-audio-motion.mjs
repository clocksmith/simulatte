import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.SIMULATTE_AUDIO_OUT||'/tmp/simulatte-audio-motion';
await fs.mkdir(out,{recursive:true});
const report={sources:await sourceReceipt(root),runs:[]};
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const browser=await openBrowserAudit({publicRoot:root+'public',url:process.env.SIMULATTE_AUDIO_ORIGIN||'',viewport}),c=browser.client;
  const row={viewport,pass:false};report.runs.push(row);
  const ev=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{const until=Date.now()+90000;while(!await ev(expression)){if(Date.now()>until)throw Error('Timeout: '+expression);await new Promise(r=>setTimeout(r,100));}};
  try {
   await c.send('Page.enable');await c.send('Runtime.enable');
   await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__audioProbe={contexts:[],meters:[]};const NativeAudioContext=window.AudioContext;window.AudioContext=class extends NativeAudioContext{constructor(...args){super(...args);__audioProbe.contexts.push(this);}createAnalyser(){const a=super.createAnalyser();__audioProbe.meters.push(a);return a;}};`});
   await c.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<600});
   await c.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<600});
   row.url=new URL('motorcycle',browser.host.baseUrl).href;await c.send('Page.navigate',{url:row.url});
   row.build=await (await fetch(new URL('version.json',browser.host.baseUrl))).json();
   await wait(`document.body?.dataset.state==='running'&&!!document.getElementById('traffic-sound')`);
   await ev(`document.getElementById('sound-start').click()`);
   await wait(`__audioProbe.contexts.some(c=>c.state==='running')&&__audioProbe.meters.length>0&&/Playback/.test(document.getElementById('traffic-audio-status').textContent)`);
   await ev(`(()=>{const observe=MotorcycleTrafficAudio.observe;__audioProbe.samples=0;MotorcycleTrafficAudio.observe=function(data){__audioProbe.samples++;return observe(data);};})()`);
   row.motion=[];
   for(const kind of ['pan','zoom','orbit']) {
    const result=await ev(`new Promise(resolve=>{
      const camera=BABYLON.EngineStore.LastCreatedScene.activeCamera,kind=${JSON.stringify(kind)},alpha=camera.alpha,radius=camera.radius,target=camera.target.clone(),start=performance.now(),records=[];
      const samplesBefore=__audioProbe.samples;
      function frame(now){const elapsed=now-start,t=elapsed/1000;
        if(kind==='pan')camera.setTarget(new BABYLON.Vector3(target.x+70*Math.sin(t*3),target.y,target.z+50*Math.cos(t*3)));
        if(kind==='zoom')camera.radius=radius*(1+.4*Math.sin(t*3));
        if(kind==='orbit')camera.alpha=alpha+.65*Math.sin(t*3);
        const values=new Float32Array(__audioProbe.meters[0].fftSize);__audioProbe.meters[0].getFloatTimeDomainData(values);
        if(elapsed>500)records.push({rms:Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length),status:document.getElementById('traffic-audio-status').textContent});
        if(elapsed<3500)requestAnimationFrame(frame);else resolve({kind,records,samples:__audioProbe.samples-samplesBefore,context:__audioProbe.contexts[0].state});
      }requestAnimationFrame(frame);
    })`);
    row.motion.push({kind:result.kind,samples:result.samples,context:result.context,frames:result.records.length,minRms:Math.min(...result.records.map(r=>r.rms)),silentFrames:result.records.filter(r=>r.rms<1e-6).length,statuses:[...new Set(result.records.map(r=>r.status))]});
   }
   assert.ok(row.motion.every(r=>r.samples>=3),'Completed microphone samples must continue during camera motion');
   assert.ok(row.motion.every(r=>r.frames>10&&r.silentFrames===0&&r.context==='running'),'Audio waveform must remain active during pan, zoom, and orbit');
   await ev(`document.getElementById('pause').click()`);
   await new Promise(r=>setTimeout(r,700));
   row.pausedRms=await ev(`(()=>{const a=__audioProbe.meters[0],v=new Float32Array(a.fftSize);a.getFloatTimeDomainData(v);return Math.sqrt(v.reduce((s,x)=>s+x*x,0)/v.length)})()`);
   assert.ok(row.pausedRms<1e-5,'An explicit simulation pause still silences audio');
   await ev(`(()=>{const button=document.getElementById('traffic-sound');button.checked=false;button.dispatchEvent(new Event('change',{bubbles:true}))})()`);
   await wait(`__audioProbe.contexts[0].state==='suspended'`);row.explicitMute=true;
   row.pass=true;console.log(JSON.stringify(row));
  }catch(error){row.error=error.stack;throw error;}finally{await browser.close();}
 }
}finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');}
