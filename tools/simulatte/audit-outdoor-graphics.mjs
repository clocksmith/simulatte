import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.env.SIMULATTE_GRAPHICS_OUT||path.join(root,'artifacts/outdoor-graphics');
await fs.mkdir(output,{recursive:true});
const displayRoot=path.join(root,'artifacts/solar-drive/browser-deps/root');
const displayBinary=process.env.SIMULATTE_XVFB||(await fs.access('/usr/bin/Xvfb').then(()=>'/usr/bin/Xvfb',()=>path.join(displayRoot,'usr/bin/Xvfb')));
const display=spawn(displayBinary,['-displayfd','3','-screen','0','1600x1100x24','-nolisten','tcp'],{env:{...process.env,LD_LIBRARY_PATH:path.join(displayRoot,'usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH||'')},stdio:['ignore','ignore','pipe','pipe']});
const displayId=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Display startup timed out')),15000);display.once('error',reject);display.stdio[3].once('data',d=>{clearTimeout(timer);resolve(':'+d.toString().trim());});});
const previousDisplay=process.env.DISPLAY;process.env.DISPLAY=displayId;
const report={source:await sourceReceipt(root),boundary:'Headed Chrome using explicit software WebGPU; desktop and touch-emulated mobile. No measured weather, hardware performance, or physical-device claim.',cases:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const browser=await openBrowserAudit({publicRoot:path.join(root,'public'),viewport,webgpu:true,headed:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']});
 const c=browser.client;
 const evaluate=async expression=>{const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const until=async expression=>{const end=Date.now()+90000;while(!await evaluate(expression)){if(Date.now()>end)throw Error('Timed out: '+expression);await delay(250);}};
 try{
  await c.send('Page.enable');await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<700});await c.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<700});
  for(const route of ['motorcycle','sunwalker']){
   const row={route,viewport,status:'running'};report.cases.push(row);
   try{
    await c.send('Page.navigate',{url:process.env.SIMULATTE_GRAPHICS_ORIGIN?new URL(route,process.env.SIMULATTE_GRAPHICS_ORIGIN).href:browser.host.baseUrl+route});
    await until(route==='motorcycle'?"globalThis.SimulatteMotorcycleSession?.snapshot().execution==='running'":"document.body?.dataset.journeyPhase==='running'");
    await until("document.querySelector('canvas[data-sky=modeled-atmosphere]')!==null");
    if(route==='motorcycle'){
      await evaluate("document.querySelector('#pause').click()");
      assert.equal(await evaluate("document.querySelector('canvas').dataset.trafficGeometry"),'articulated-figures-detailed-motorcycles');
      row.geometry=await evaluate("(()=>{const s=BABYLON.EngineStore.LastCreatedScene;const bike=s.transformNodes.find(n=>n.name.startsWith('motorcycle-')&&n.getChildMeshes().length>30);if(!bike)return null;return {id:bike.name,parts:bike.getChildMeshes().length,vertices:bike.getChildMeshes().reduce((n,m)=>n+m.getTotalVertices(),0),sky:s.meshes.some(m=>m.name==='modeled-sky')};})()");
      assert.ok(row.geometry?.parts>30);
      await evaluate("(()=>{const b=document.querySelector('[data-camera-mode=sidewalk]');b?.click();})()");
    }else{
      await evaluate("SimulatteActiveSession.invoke('pause')");
      row.lighting=await evaluate("(()=>{const c=document.querySelector('canvas[data-sky]');return {azimuth:Number(c.dataset.sunAzimuthDegrees),elevation:Number(c.dataset.sunElevationDegrees),shadow:c.dataset.sunShadow,casters:Number(c.dataset.sunShadowCasterVertices)};})()");
      assert.equal(row.lighting.shadow,'depth-map');assert.ok(row.lighting.casters>0);
      await evaluate("(()=>{const b=document.querySelector('#camera-pov');b?.click();})()");
    }
    await delay(2500);
    if(route==='motorcycle') { await until("globalThis.motorcycleRuntimeReceipt?.state==='paused'");row.runtime=await evaluate('motorcycleRuntimeReceipt');assert.deepEqual(row.runtime.failures,[]); }
    row.diagnostics=c.diagnosticEvents;
    row.layout=await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth+1,canvas:[...document.querySelectorAll('canvas')].filter(c=>!c.hidden).map(c=>({width:c.width,height:c.height}))})");assert.equal(row.layout.overflow,false);
    row.capture=path.join(output,`${route}-${viewport.width}.png`);
    const png=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(row.capture,Buffer.from(png.data,'base64'));
    row.pixels=await evaluate(`(async()=>{const image=new Image();image.src='data:image/png;base64,${png.data}';await image.decode();const source=document.querySelector('canvas[data-sky=modeled-atmosphere]'),r=source.getBoundingClientRect(),canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const ctx=canvas.getContext('2d');ctx.drawImage(image,r.left,Math.max(0,r.top),r.width,Math.min(r.height,innerHeight-r.top),0,0,96,64);const data=ctx.getImageData(0,0,96,64).data;let sum=0,squares=0;const colors=new Set();for(let i=0;i<data.length;i+=4){const l=(data[i]+data[i+1]+data[i+2])/3;sum+=l;squares+=l*l;colors.add((data[i]>>4)*256+(data[i+1]>>4)*16+(data[i+2]>>4));}return {std:Math.sqrt(Math.max(0,squares/6144-(sum/6144)**2)),colors:colors.size};})()`);
    assert.ok(row.pixels.std>12&&row.pixels.colors>25,'Blank or unvaried rendered scene');row.status='pass';
   }catch(error){row.status='fail';row.error=error.message;}
  }
 }finally{await browser.close();}
}
report.sourceAfter=await sourceReceipt(root);report.status=report.cases.every(r=>r.status==='pass')?'pass':'fail';
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.map(r=>({route:r.route,viewport:r.viewport.width,status:r.status,error:r.error})),output}));if(report.status!=='pass')process.exitCode=1;
}finally{display.kill('SIGTERM');if(previousDisplay===undefined)delete process.env.DISPLAY;else process.env.DISPLAY=previousDisplay;}
