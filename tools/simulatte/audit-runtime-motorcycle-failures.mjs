import {sourceReceipt} from './runtime-audit-sources.mjs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {openBrowserAudit} from './browser-session.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,''),out=root+'/artifacts/runtime-repair/motorcycle-failures';await fs.mkdir(out,{recursive:true});
const report={sources:await sourceReceipt(root),cases:[],errors:[]};
for(const mode of ['first','late','persistent']){
 const b=await openBrowserAudit({publicRoot:root+'/public',viewport:{width:390,height:844},args:['--no-sandbox','--disable-dev-shm-usage']});const c=b.client;
 await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});c.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails));
 const ev=async s=>{const r=await c.send('Runtime.evaluate',{expression:s,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const until=async pred=>{const end=Date.now()+90000;while(Date.now()<end){if(await ev(pred))return;await new Promise(r=>setTimeout(r,100));}throw Error('timeout '+pred)};
 await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.inject={mode:${JSON.stringify(mode)},draws:0,creates:0,disposes:0,workers:0,scenes:[],enabled:true};
 const OriginalWorker=Worker;globalThis.Worker=class extends OriginalWorker{constructor(...args){super(...args);inject.workers++;const close=this.terminate.bind(this);let active=true;this.terminate=()=>{if(active){active=false;inject.workers--;}close();};}};
 let viewApi,firstScene;Object.defineProperty(globalThis,'MotorcycleReflectionView',{configurable:true,get:()=>viewApi,set(value){const create=value.create;viewApi={...value,async create(...args){inject.creates++;firstScene ||= args[2];inject.sameScene=args[2]===firstScene;inject.scenes.push(JSON.stringify({config:args[2].config,panel:args[2].panel,sources:args[2].sources},(key,value)=>['harmonics','harmonicNorm'].includes(key)?undefined:value));if(inject.creates>1)await new Promise(r=>setTimeout(r,800));const view=await create(...args);const draw=view.draw,dispose=view.dispose;return {...view,draw(...a){inject.draws++;if(inject.enabled&&(inject.mode==='persistent'||inject.draws===(inject.mode==='late'?3:1)))throw Error('Injected renderer failure');return draw(...a);},dispose(){inject.disposes++;return dispose();}};}};}});`});
 const row={mode};report.cases.push(row);
 try{await c.send('Page.navigate',{url:b.host.baseUrl+'motorcycle'});await until(`document.body?.dataset.state==='recovering'`);row.recovering=await ev(`({receipt:motorcycleRuntimeReceipt,banner:document.getElementById('experience-message').textContent,level:document.getElementById('observer-level').textContent})`);
 await until(`document.body?.dataset.state===${JSON.stringify(mode==='persistent'?'failed':'running')}`);
 row.after=await ev(`({receipt:motorcycleRuntimeReceipt,inject:{...inject,scenes:inject.scenes.map(s=>s===inject.scenes[0])},visible:document.getElementById('experience-status').checkVisibility({visibilityProperty:true})})`);
 assert.equal(row.after.receipt.state,mode==='persistent'?'failed':'running');assert.equal(row.after.inject.creates,2);assert.equal(row.after.inject.disposes,mode==='persistent'?2:1);assert.ok(row.after.inject.scenes.every(Boolean));assert.equal(row.after.inject.sameScene,true);assert.ok(row.after.inject.workers<=2);assert.equal(row.recovering.level,'Measurement paused');
 let shot=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/'+mode+'.png',Buffer.from(shot.data,'base64'));
 if(mode==='persistent'){const t=await ev('motorcycleRuntimeReceipt.time');await new Promise(r=>setTimeout(r,500));row.frozenTimePreserved=await ev(`motorcycleRuntimeReceipt.time===${t}`);await ev(`inject.enabled=false;document.getElementById('experience-retry').click()`);await until(`document.body.dataset.state==='running'`);row.retry=await ev(`({receipt:motorcycleRuntimeReceipt,draws:inject.draws,creates:inject.creates,disposes:inject.disposes,workers:inject.workers,scenarioPreserved:inject.scenes.every(s=>s===inject.scenes[0])})`);}
 if(row.retry){assert.equal(row.frozenTimePreserved,true);assert.equal(row.retry.scenarioPreserved,true);assert.equal(row.retry.creates,3);assert.equal(row.retry.disposes,2);assert.ok(row.retry.workers<=2);}
 }catch(error){row.failure=error.stack;}finally{await b.close();await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));}
 console.log(JSON.stringify({mode,failure:row.failure,after:row.after?.receipt,retry:row.retry}));
}

if(report.errors.length||report.cases.some(row=>row.failure))process.exitCode=1;
