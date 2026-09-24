import {sourceReceipt} from './runtime-audit-sources.mjs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {openBrowserAudit} from './browser-session.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,''),out=root+'/artifacts/runtime-repair/gpu';await fs.mkdir(out,{recursive:true});
const b=await openBrowserAudit({publicRoot:root+'/public',viewport:{width:390,height:844},args:['--no-sandbox','--disable-dev-shm-usage']});const c=b.client;
await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});const report={sources:await sourceReceipt(root),cases:[],errors:[]};c.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails));
const ev=async s=>{const r=await c.send('Runtime.evaluate',{expression:s,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async pred=>{const end=Date.now()+45000;while(Date.now()<end){if(await ev(pred))return;await wait(150);}throw Error('timeout '+pred)};
const snap=()=>ev(`(()=>{const p=globalThis.__simulattePluginPlatformV4;return {run:globalThis.__simulatteTierRunState,contribution:p?.contributions[0],camera:p?.view,canvas:document.getElementById('overlay-canvas').getBoundingClientRect().toJSON(),render:document.getElementById('overlay-canvas').__simulatteRenderReceipt?.(),panel:document.querySelector('.cluster-interaction')?.textContent,rect:document.querySelector('.cluster-interaction')?.getBoundingClientRect().toJSON(),scroll:{x:scrollX,y:scrollY,width:document.documentElement.scrollWidth,height:innerHeight},receipt:globalThis.__simulatteTierRunReceipt,error:globalThis.__simulatteLastFailError};})()`);
const rackPoints=()=>ev(`(()=>{const c=document.getElementById('overlay-canvas'),view=c.__simulatteRenderReceipt().view;return __simulattePluginPlatformV4.contributions[0].presentation.layers.filter(row=>row.id.startsWith('rack:')).map(row=>({id:row.id.slice(5),...SimulatteTierPluginPresentation.projectPoint(row.geometry.coordinates[0],'datacenter-cartesian-meters',view)}));})()`);
async function checkFraming(){const state=await snap(),points=await rackPoints();assert.equal(points.length,32);const usableBottom=state.rect.top-state.canvas.top;assert.ok(points.every(p=>p.x>16&&p.x<state.canvas.width-16&&p.y>22&&p.y<usableBottom-22));assert.ok(points.every(p=>state.canvas.top+p.y<state.scroll.height));assert.equal(state.scroll.y,0);assert.ok(state.rect.bottom<=state.scroll.height+2);return {canvas:state.canvas,usableBottom,points};}
const shot=async name=>{const s=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/'+name+'.png',Buffer.from(s.data,'base64'));};
try{await c.send('Page.navigate',{url:b.host.baseUrl+'datacenter'});await until(`globalThis.__simulatteTierRunState?.state==='running'`);await until(`!document.getElementById('loading-screen').checkVisibility({visibilityProperty:true})`);
await ev(`document.getElementById('pause-button').click()`);await wait(300);report.cases.push({name:'portrait',state:await snap()});await shot('portrait');report.initialFraming=await checkFraming();
 const point=(await rackPoints()).find(p=>p.id==='R4-8'),rect=(await snap()).canvas;
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.left+point.x,y:rect.top+point.y,button:'left',clickCount:1});
 await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.left+point.x,y:rect.top+point.y,button:'left',clickCount:1});
 assert.equal(await ev(`document.querySelector('.cluster-interaction').dataset.rack`),'R4-8');report.selectedRack='R4-8';
 for(const [width,height] of [[844,390],[390,844]]){
   await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await wait(400);
   (report.automaticOrientationFraming||=[]).push(await checkFraming());
 }

await ev(`document.querySelector('.cluster-interaction button').click()`);await wait(300);report.cases.push({name:'intervention',state:await snap()});
await ev(`document.getElementById('resume-button').click()`);await until(`document.querySelector('.cluster-interaction').dataset.task==='backward' && globalThis.__simulattePluginPlatformV4?.contributions[0].inspections.some(i=>i.fields.some(f=>f.id==='task'&&f.value==='waiting'))`);await ev(`document.getElementById('pause-button').click()`);report.cases.push({name:'barrier-waits',state:await snap()});await shot('straggler');
await ev(`document.querySelector('.cluster-interaction button').click()`);await wait(200);report.cases.push({name:'removed',state:await snap()});
 await ev(`document.getElementById('overlay-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
 const manual=(await snap()).render.view;
 for(let i=0;i<3;i++){await ev(`document.getElementById('step-button').click()`);await wait(100);}
 assert.deepEqual((await snap()).render.view,manual);report.manualCameraPreserved=true;

for(const [width,height] of [[844,390],[390,844],[1440,1000]]){await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000});await wait(400);report.cases.push({name:'orientation-before-reset-'+width,state:await snap()});await ev(`document.getElementById('camera-reset').click()`);await wait(300);report.cases.push({name:'resize-'+width,state:await snap()});await shot('resize-'+width);(report.framing||=[]).push(await checkFraming());}
await ev(`(()=>{const e=document.getElementById('playback-speed');e.value='4';e.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('resume-button').click();})()`);await until(`globalThis.__simulatteTierRunState?.state==='settled'`);report.cases.push({name:'completed',state:await snap()});
await ev(`document.getElementById('replay-button').click()`);await until(`globalThis.__simulatteTierRunState?.state==='settled'`);report.cases.push({name:'replayed',state:await snap()});
 assert.deepEqual(report.cases.at(-1).state.receipt.actionResult.scenario.workload,report.cases.at(-2).state.receipt.actionResult.scenario.workload);assert.equal(report.errors.length,0);
}catch(e){report.failure=e.stack;report.diagnostics=await ev(`document.body.innerText.slice(-4500)`);await shot('failure');}finally{await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));await b.close();}console.log(JSON.stringify({failure:report.failure,errors:report.errors,cases:report.cases.map(r=>({name:r.name,run:r.state.run,panel:r.state.panel}))},null,2));

if(report.failure||report.errors.length)process.exitCode=1;
