import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.SIMULATTE_MIST_OUT||'/tmp/simulatte-mist-proof';
await fs.mkdir(out,{recursive:true});
const browser=await openBrowserAudit({publicRoot:root+'public',viewport:{width:1440,height:1000}}),c=browser.client;
const baseUrl=process.env.SIMULATTE_MIST_ORIGIN||browser.host.baseUrl;
const report={schema:'simulatte.mistInteractionAudit.v1',baseUrl,sources:await sourceReceipt(root),errors:[]};
const ev=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{const until=Date.now()+90000;while(Date.now()<until){if(await ev(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+expression);};
async function click(selector){const r=await ev(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);assert.ok(r.width&&r.height);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:r.x+r.width/2,y:r.y+r.height/2});}
const snapshot=()=>ev('SimulatteMotorcycleController.snapshot()');
const shot=async name=>{const r=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/'+name+'.png',Buffer.from(r.data,'base64'));};
try{
 await c.send('Page.enable');await c.send('Runtime.enable');c.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails));report.browser=await c.send('Browser.getVersion');
 await c.send('Page.navigate',{url:new URL('motorcycle',baseUrl).href});await wait(`document.body?.dataset.state==='running'`);
 await ev(`SimulatteMotorcycleController.invoke('pause')`);
 report.initial=await snapshot();assert.equal(report.initial.observer.trackId,null,'initial Greenpoint must not follow a bike');
 await click('[data-camera-mode="area:North Williamsburg"]');report.williamsburg=await snapshot();
 const expected=await ev(`fetch('./nyc-map.json').then(r=>r.json()).then(map=>MotorcycleReflectionView.williamsburgAnchor(map))`);
 assert.ok(Math.abs(report.williamsburg.observer.x-expected.x-35)<.02);assert.ok(Math.abs(report.williamsburg.observer.y-expected.y+35)<.02);
 await shot('williamsburg');
 const before=report.williamsburg.observer;
 await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:900,y:550,deltaX:0,deltaY:-240});
 await new Promise(r=>setTimeout(r,300));report.wheel=await snapshot();assert.ok(Math.hypot(before.x-report.wheel.observer.x,before.y-report.wheel.observer.y)>2,'unmodified wheel moves camera');
 await ev(`document.getElementById('city').focus()`);
 for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39,nativeVirtualKeyCode:39});
 await new Promise(r=>setTimeout(r,150));report.arrow=await snapshot();assert.ok(Math.hypot(report.wheel.observer.x-report.arrow.observer.x,report.wheel.observer.y-report.arrow.observer.y)>2,'arrow key pans');
 await click('[data-pan="up"]');await new Promise(r=>setTimeout(r,150));report.direction=await snapshot();assert.ok(Math.hypot(report.arrow.observer.x-report.direction.observer.x,report.arrow.observer.y-report.direction.observer.y)>2,'direction button pans');
 const sourceId=report.initial.motorcycles.find(s=>s.position.speed>1)?.id||report.initial.motorcycles[0].id;report.sourceId=sourceId;
 await ev(`SimulatteMotorcycleController.invoke('select-object',{sourceId:${JSON.stringify(sourceId)}})`);
 await click('#follow-selected');for(let i=0;i<6;i++)await click('#map-zoom-in');
 await ev(`window.sprayClicks=[];document.getElementById('spray-selected').addEventListener('click',e=>sprayClicks.push(e.isTrusted));`);
 await click('#spray-selected');await wait(`SimulatteMotorcycleController.snapshot().mistBursts.length===1`);report.spray=await snapshot();assert.deepEqual(await ev('sprayClicks'),[true]);
 const event=report.spray.mistBursts[0];
 // Seek uses the same recorded interaction history and shared motion model.
 await ev(`SimulatteMotorcycleController.invoke('seek',${event.start+1.5})`);await new Promise(r=>setTimeout(r,500));await shot('spray-contact');
 report.visual=await ev(`(()=>{const scene=BABYLON.EngineStore.LastCreatedScene;return {plume:scene.meshes.filter(m=>m.name==='mist-plume'&&m.isEnabled()).length,contact:scene.meshes.filter(m=>m.name==='mist-contact'&&m.isEnabled()).length};})()`);
 assert.ok(report.visual.plume>=80);assert.ok(report.visual.contact>=32);
 await ev(`SimulatteMotorcycleController.invoke('seek',${event.contact+4})`);await new Promise(r=>setTimeout(r,500));report.stalled=await snapshot();const bike=report.stalled.motorcycles.find(s=>s.id===sourceId);assert.equal(bike.position.rpm,0);assert.equal(bike.position.speed,0);assert.equal(bike.position.stalled,true);await shot('stalled');
 await ev(`SimulatteMotorcycleController.invoke('seek',${event.restart+2})`);await new Promise(r=>setTimeout(r,200));report.restarted=await snapshot();assert.equal(report.restarted.motorcycles.find(s=>s.id===sourceId).position.stalled,false);assert.ok(report.restarted.motorcycles.find(s=>s.id===sourceId).position.rpm>0);
 await ev(`SimulatteMotorcycleController.invoke('seek',${event.contact+4})`);await new Promise(r=>setTimeout(r,200));assert.deepEqual((await snapshot()).motorcycles,report.stalled.motorcycles,'seeking reproduces the same stalled traffic');
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(error){report.pass=false;report.failure=error.stack;process.exitCode=1;}
finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({out,pass:report.pass,failure:report.failure}));
