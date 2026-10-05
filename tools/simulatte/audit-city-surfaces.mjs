import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.SIMULATTE_SURFACES_OUT||'/tmp/simulatte-city-surfaces';
await fs.mkdir(out,{recursive:true});
const origin=process.env.SIMULATTE_SURFACES_ORIGIN||'';
const report={sources:await sourceReceipt(root),origin:origin||'local static server',servedHashes:{},runs:[]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 if(origin) {
  report.build=await (await fetch(new URL('version.json',origin))).json();
  for(const file of ['simulatte/app/webgpu-math.js','simulatte/app/webgpu-pass.js','simulatte/app/webgpu-renderer.js','simulatte/app/webgpu-geometry.js','simulatte/motorcycle-noise/babylon-city.js','simulatte/motorcycle-noise/reflection-view.js']) {
    const response=await fetch(new URL(file,origin));assert.ok(response.ok);
    const served=Buffer.from(await response.arrayBuffer()),local=await fs.readFile(root+'public/'+file);
    assert.ok(served.equals(local),`Hosted bytes differ: ${file}`);
    report.servedHashes[file]=createHash('sha256').update(served).digest('hex');
  }
 }
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const browser=await openBrowserAudit({publicRoot:root+'public',url:origin,viewport,webgpu:true});
  const c=browser.client,row={viewport,pass:false};report.runs.push(row);
  const ev=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{const until=Date.now()+90000;while(!await ev(expression)){if(Date.now()>until)throw Error('Timeout: '+expression);await pause(150);}};
  const capture=async name=>{const shot=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(`${out}/${viewport.width}-${name}.png`,Buffer.from(shot.data,'base64'));};
  try {
   await c.send('Page.enable');await c.send('Runtime.enable');
   await c.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<600});
   await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`
     globalThis.__depthAudit={pipelines:[],textures:[],errors:[]};
     if(globalThis.GPUDevice) {
       for(const name of ['createRenderPipeline','createTexture']) {
         const original=GPUDevice.prototype[name];
         GPUDevice.prototype[name]=function(d){
           if(!this.__audit){this.__audit=true;this.addEventListener('uncapturederror',e=>__depthAudit.errors.push(e.error.message));}
           if(name==='createRenderPipeline')__depthAudit.pipelines.push({label:d.label,depth:d.depthStencil});
           else if(d.format.startsWith('depth'))__depthAudit.textures.push({label:d.label,format:d.format});
           return original.call(this,d);
         };
       }
     }`});
   await c.send('Page.navigate',{url:new URL('motorcycle',browser.host.baseUrl).href});
   await wait(`document.body?.dataset.state==='running'`);
   await ev(`document.getElementById('pause').click()`);
   row.motorcycle=[];
   for(const [name,radius,beta] of [['street',190,.78],['city',3000,1],['grazing',5000,1.4]]) {
     await ev(`(()=>{const s=BABYLON.EngineStore.LastCreatedScene,c=s.activeCamera;c.radius=${radius};c.beta=${beta};c.alpha=1.2;c.inertialAlphaOffset=c.inertialBetaOffset=c.inertialRadiusOffset=0;})()`);
     await pause(350);
     const camera=await ev(`(()=>{const s=BABYLON.EngineStore.LastCreatedScene,c=s.activeCamera;return {radius:c.radius,near:c.minZ,far:c.maxZ,engine:s.getEngine().constructor.name};})()`);
     assert.ok(Math.abs(camera.near-camera.radius*.01)<.001);
     row.motorcycle.push({name,...camera});await capture(`motorcycle-${name}`);
   }
   row.motion=await ev(`new Promise(resolve=>{const s=BABYLON.EngineStore.LastCreatedScene,c=s.activeCamera,start=performance.now(),target=c.target.clone();let frames=0,minRatio=1;function frame(t){const phase=(t-start)/1000;c.radius=2000+1500*Math.sin(phase*2);c.alpha+=.004;c.setTarget(new BABYLON.Vector3(target.x+80*Math.sin(phase),target.y,target.z+80*Math.cos(phase)));frames++;minRatio=Math.min(minRatio,c.minZ/c.radius);if(phase<2)requestAnimationFrame(frame);else resolve({frames,minRatio});}requestAnimationFrame(frame);})`);
   assert.ok(row.motion.frames>5);
   row.motorcycleGpuErrors=await ev('__depthAudit.errors');assert.deepEqual(row.motorcycleGpuErrors,[]);
   await c.send('Page.navigate',{url:new URL('sunwalker',browser.host.baseUrl).href});
   await wait(`document.querySelector('.sun-walk-controls') && Number(document.querySelector('#autonomy-canvas')?.dataset.frameCount)>25`);
   await ev(`document.querySelector('#autonomy-canvas').scrollIntoView({block:'center'})`);
   const center=await ev(`(()=>{const r=document.querySelector('#autonomy-canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:Math.min(innerHeight-80,Math.max(80,r.y+r.height/2))}})()`);
   row.sunwalkerMotion=[];
   for(const [kind,modifiers] of [['orbit',0],['pan',8]]) {
     const before=await ev(`document.querySelector('#autonomy-canvas').dataset.cameraEye`);
     await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...center,button:'left',buttons:1,clickCount:1,modifiers});
     for(let step=1;step<=12;step++) {
       await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:center.x+step*3,y:center.y+step,button:'left',buttons:1,modifiers});await pause(25);
     }
     await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:center.x+36,y:center.y+12,button:'left',buttons:0,clickCount:1,modifiers});
     await pause(300);
     const after=await ev(`document.querySelector('#autonomy-canvas').dataset.cameraEye`);
     assert.notEqual(after,before);row.sunwalkerMotion.push({kind,before,after});await capture(`sunwalker-${kind}`);
   }
   const beforeZoom=await ev(`document.querySelector('#autonomy-canvas').dataset.cameraEye`);
   await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',...center,deltaX:0,deltaY:-250});await pause(300);
   const afterZoom=await ev(`document.querySelector('#autonomy-canvas').dataset.cameraEye`);assert.notEqual(afterZoom,beforeZoom);
   row.sunwalkerMotion.push({kind:'zoom',before:beforeZoom,after:afterZoom});await capture('sunwalker-zoom');
   row.sunwalker=[];
   for(const mode of ['overview','follow','pov']) {
     if(mode!=='overview')await ev(`document.querySelector('#camera-menu').open=true;document.querySelector('#camera-${mode}').click();document.querySelector('#camera-menu').open=false`);
     await wait(`document.querySelector('#autonomy-canvas').dataset.cameraTransition==='settled'`);
     await ev(`document.querySelector('#autonomy-canvas').scrollIntoView({block:'center'})`);
     await pause(300);
     const canvas=await ev(`({...document.querySelector('#autonomy-canvas').dataset})`);
     assert.equal(canvas.sunShadow,'depth-map');assert.ok(Number(canvas.sunShadowCasterVertices)>900000);
     if(mode!=='overview')assert.equal(canvas.cameraMode,mode);
     row.sunwalker.push({mode,canvas});await capture(`sunwalker-${mode}`);
   }
   row.depth=await ev('__depthAudit');
   const map=row.depth.pipelines.find(p=>p.label==='autonomy-map-pipeline');
   assert.equal(map.depth.format,'depth32float');assert.equal(map.depth.depthCompare,'greater');
   const overlay=row.depth.pipelines.find(p=>p.label==='autonomy-overlay-pipeline');assert.equal(overlay.depth.depthCompare,'greater-equal');
   assert.ok(row.depth.textures.some(t=>t.format==='depth32float'));
   assert.deepEqual(row.depth.errors,[]);
   assert.equal(await ev(`globalThis.__simulatteLastFailError?.message||''`),'');
   row.pass=true;console.log(JSON.stringify({viewport,pass:true,motorcycle:row.motorcycle,motion:row.motion}));
  } catch(error){row.error=error.stack;await capture('failure');throw error;}
  finally {await browser.close();}
 }
} finally {await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
