import fs from 'node:fs/promises';
import {openBrowserAudit} from '/home/clocksmith/deco/simulatte/tools/simulatte/browser-session.mjs';
const root='/home/clocksmith/deco/simulatte', out=root+'/artifacts/interaction-gap-8a6ad6c/webgl';
await fs.mkdir(out,{recursive:true});
const b=await openBrowserAudit({publicRoot:root+'/public',viewport:{width:1440,height:1000},webgpu:false,linuxVulkan:false,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const c=b.client, report={head:'8a6ad6ce66041116e060ab12f706e2b756b948b0',startedAt:new Date().toISOString(),cases:[],errors:[]};
await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Network.enable');
c.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails));
const ev=async s=>{const r=await c.send('Runtime.evaluate',{expression:s,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const snap=()=>ev(`(()=>{const $=id=>document.getElementById(id);const vis=e=>e?.checkVisibility({visibilityProperty:true});const scene=globalThis.BABYLON?.EngineStore?.LastCreatedScene;return {url:location.href,title:document.title,status:$('status')?.textContent,backend:$('backend')?.textContent,time:$('timeline')?.value,pause:$('pause')?.textContent,observer:$('observer-level')?.textContent,observerPosition:$('observer-position')?.textContent,observerTime:$('observer-time')?.textContent,traffic:$('traffic-summary')?.textContent,camera:$('camera-mode')?.value,actualCamera:scene?.activeCamera?.name,cameraPosition:scene?.activeCamera?.globalPosition?.asArray(),rig:scene?.getTransformNodeByName('onboard-rig')?.position?.asArray(),meshCount:scene?.meshes.length,sources:scene?.meshes.filter(m=>m.metadata?.sourceId).slice(0,4).map(m=>({name:m.name,id:m.metadata.sourceId,pos:m.position.asArray()})),advanced:$('advanced-sheet')?.open,overflow:document.documentElement.scrollWidth>innerWidth,visibleControls:[...document.querySelectorAll('button,select,input')].filter(vis).map(e=>({id:e.id,name:e.name,text:e.textContent.slice(0,100),disabled:e.disabled})),phase:document.body.dataset.journeyPhase,progress:$('playback-timeline')?.value,total:$('playback-timeline')?.max,worldStatus:$('runtime-status')?.textContent,contributions:globalThis.__simulattePluginPlatformV4?.contributions,renderer:$('overlay-canvas')?.__simulatteRenderReceipt?.()};})()`);
const shot=async name=>{const s=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/'+name+'.png',Buffer.from(s.data,'base64'));};
const click=id=>ev(`document.getElementById(${JSON.stringify(id)}).click()`);
try {
 report.browser=await c.send('Browser.getVersion');
 for(const width of [1440,390]){
  const row={width,steps:[]};report.cases.push(row);
  await c.send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
  await c.send('Page.navigate',{url:b.host.baseUrl+'motorcycle'});
  const until=Date.now()+60000;while(Date.now()<until){if(await ev(`document.getElementById('pause')?.disabled===false`))break;await wait(250);}
  await wait(1500);row.steps.push({name:'initial',state:await snap()});console.log(JSON.stringify({width,initial:row.steps[0].state.status,backend:row.steps[0].state.backend,time:row.steps[0].state.time}));await shot('motorcycle-'+width+'-initial');
  await wait(1200);row.steps.push({name:'autonomous',state:await snap()});
  await click('header-advanced');await wait(800);row.steps.push({name:'advanced-running',state:await snap()});await shot('motorcycle-'+width+'-advanced');await click('advanced-close');
  await click('pause');await wait(250);row.steps.push({name:'paused',state:await snap()});
  await ev(`document.getElementById('camera-mode').value='rider';document.getElementById('camera-mode').dispatchEvent(new Event('change'))`);await wait(1000);row.steps.push({name:'onboard-paused',state:await snap()});await shot('motorcycle-'+width+'-onboard');
  await click('pause');await wait(1500);row.steps.push({name:'onboard-running',state:await snap()});
  await click('pause');
  await ev(`document.getElementById('technique').value='untreated';document.getElementById('technique').dispatchEvent(new Event('change'))`);await wait(1000);row.steps.push({name:'untreated-paused',state:await snap()});
  await click('header-advanced');
  await ev(`(()=>{const f=document.getElementById('scenario');f.elements.motorcycles.value='2';f.elements.cars.value='0';f.elements.pedestrians.value='0';f.requestSubmit();})()`);await wait(4000);await click('pause');row.steps.push({name:'reduced-traffic',state:await snap()});await click('run');
  const deadline=Date.now()+60000;while(Date.now()<deadline){if(await ev(`!document.getElementById('results').hidden`))break;await wait(500);}
  row.steps.push({name:'comparison',state:await snap(),result:await ev(`({before:document.getElementById('before').textContent,after:document.getElementById('after').textContent,visible:!document.getElementById('results').hidden})`)});await shot('motorcycle-'+width+'-comparison');
 }
 report.requests=b.host.requests;
} catch(e){report.failure=e.stack;} finally{await fs.writeFile(out+'/motorcycle-browser.json',JSON.stringify(report,null,2));await b.close();}
console.log(JSON.stringify({out,cases:report.cases.map(r=>({width:r.width,steps:r.steps.map(s=>({name:s.name,time:s.state.time,status:s.state.status,level:s.state.observer,camera:s.state.actualCamera,result:s.result}))})),errors:report.errors.length,failure:report.failure},null,2));
