import {sourceReceipt} from './runtime-audit-sources.mjs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {openBrowserAudit} from './browser-session.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,''), out=root+'/artifacts/runtime-repair/motorcycle';
await fs.mkdir(out,{recursive:true});
const b=await openBrowserAudit({publicRoot:root+'/public',viewport:{width:1440,height:1000},webgpu:false,linuxVulkan:false,args:['--no-sandbox','--disable-dev-shm-usage']});
const c=b.client, report={sources:await sourceReceipt(root),head:'8a6ad6ce66041116e060ab12f706e2b756b948b0',startedAt:new Date().toISOString(),cases:[],errors:[]};
await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Network.enable');
c.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails));
const ev=async s=>{const r=await c.send('Runtime.evaluate',{expression:s,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const snap=()=>ev(`(()=>{const $=id=>document.getElementById(id);const vis=e=>e?.checkVisibility({visibilityProperty:true});const scene=globalThis.BABYLON?.EngineStore?.LastCreatedScene;return {url:location.href,title:document.title,lifecycle:globalThis.motorcycleRuntimeReceipt,status:$('status')?.textContent,backend:$('backend')?.textContent,time:$('timeline')?.value,pause:$('pause')?.textContent,observer:$('observer-level')?.textContent,observerPosition:$('observer-position')?.textContent,observerTime:$('observer-time')?.textContent,traffic:$('traffic-summary')?.textContent,camera:$('camera-mode')?.value,actualCamera:scene?.activeCamera?.name,cameraPosition:scene?.activeCamera?.globalPosition?.asArray(),rig:scene?.getTransformNodeByName('onboard-rig')?.position?.asArray(),meshCount:scene?.meshes.length,sources:scene?.meshes.filter(m=>m.metadata?.sourceId).filter((m,i,rows)=>rows.findIndex(n=>n.metadata.sourceId===m.metadata.sourceId)===i).slice(0,20).map(m=>({name:m.name,id:m.metadata.sourceId,pos:m.getAbsolutePosition().asArray()})),advanced:$('advanced-settings')?.open,overflow:document.documentElement.scrollWidth>innerWidth,visibleControls:[...document.querySelectorAll('button,select,input')].filter(vis).map(e=>({id:e.id,name:e.name,text:e.textContent.slice(0,100),disabled:e.disabled})),phase:document.body.dataset.journeyPhase,progress:$('playback-timeline')?.value,total:$('playback-timeline')?.max,worldStatus:$('runtime-status')?.textContent,contributions:globalThis.__simulattePluginPlatformV4?.contributions,renderer:$('overlay-canvas')?.__simulatteRenderReceipt?.()};})()`);
const shot=async name=>{const s=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/'+name+'.png',Buffer.from(s.data,'base64'));};
const click=id=>ev(`document.getElementById(${JSON.stringify(id)}).click()`);
try {
 report.browser=await c.send('Browser.getVersion');
 for(const width of [1440,390]){
  const row={width,steps:[]};report.cases.push(row);
  await c.send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
  await c.send('Page.navigate',{url:b.host.baseUrl+'motorcycle'});
  const until=Date.now()+90000;while(Date.now()<until){if(await ev(`['running','paused','failed'].includes(document.body?.dataset.state)`))break;await wait(250);}
  await wait(1500);row.steps.push({name:'initial',state:await snap()});console.log(JSON.stringify({width,initial:row.steps[0].state.status,backend:row.steps[0].state.backend,time:row.steps[0].state.time}));await shot('motorcycle-'+width+'-initial');assert.equal(row.steps[0].state.lifecycle.state,'running');
  await wait(1200);row.steps.push({name:'autonomous',state:await snap()});assert.ok(Number(row.steps[1].state.time)>Number(row.steps[0].state.time));assert.notDeepEqual(row.steps[1].state.sources,row.steps[0].state.sources);
  await click('header-advanced');await wait(800);row.steps.push({name:'advanced-running',state:await snap()});await shot('motorcycle-'+width+'-advanced');await click('advanced-close');
  await click('pause');await wait(250);row.steps.push({name:'paused',state:await snap()});
  await ev(`document.getElementById('camera-mode').value='rider';document.getElementById('camera-mode').dispatchEvent(new Event('change'))`);await wait(1000);row.steps.push({name:'onboard-paused',state:await snap()});await shot('motorcycle-'+width+'-onboard');assert.equal(row.steps.at(-1).state.actualCamera,'rider-camera');assert.equal(row.steps.at(-1).state.time,row.steps.at(-2).state.time);
  await click('pause');await wait(1500);row.steps.push({name:'onboard-running',state:await snap()});
  await click('pause');
  await ev(`document.getElementById('technique').value='untreated';document.getElementById('technique').dispatchEvent(new Event('change'))`);await wait(1000);row.steps.push({name:'untreated-paused',state:await snap()});

 }
 report.requests=b.host.requests;
} catch(e){report.failure=e.stack;} finally{await fs.writeFile(out+'/motorcycle-browser.json',JSON.stringify(report,null,2));await b.close();}
console.log(JSON.stringify({out,cases:report.cases.map(r=>({width:r.width,steps:r.steps.map(s=>({name:s.name,time:s.state.time,status:s.state.status,level:s.state.observer,camera:s.state.actualCamera,result:s.result}))})),errors:report.errors.length,failure:report.failure},null,2));

if(report.failure||report.errors.length)process.exitCode=1;
