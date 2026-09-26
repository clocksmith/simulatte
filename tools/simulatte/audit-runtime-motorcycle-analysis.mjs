import {sourceReceipt} from './runtime-audit-sources.mjs';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {openBrowserAudit} from './browser-session.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,''),out=root+'/'+(process.env.SIMULATTE_EVIDENCE_DIR||'artifacts/runtime-repair')+'/motorcycle-analysis';await fs.mkdir(out,{recursive:true});
const b=await openBrowserAudit({publicRoot:root+'/public',viewport:{width:1440,height:1000},args:['--no-sandbox','--disable-dev-shm-usage']}),c=b.client;
await c.send('Page.enable');await c.send('Runtime.enable');const report={sources:await sourceReceipt(root),errors:[]};c.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails));
const ev=async s=>{const r=await c.send('Runtime.evaluate',{expression:s,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async pred=>{const end=Date.now()+90000;while(Date.now()<end){if(await ev(pred))return;await wait(100);}throw Error('timeout '+pred)};
await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.analysisProbe={results:[],workers:0};const W=Worker;globalThis.Worker=class extends W{constructor(...args){super(...args);if(String(args[0]).includes('reflection-worker')){analysisProbe.workers++;this.addEventListener('message',e=>{if(e.data.type==='result')analysisProbe.results.push({record:e.data.record,spectrum:e.data.spectrum});});const stop=this.terminate.bind(this);let active=true;this.terminate=()=>{if(active){active=false;analysisProbe.workers--;}stop();};}}};const url=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{analysisProbe.exportBlob=blob;return url(blob);};`});
try{
 await c.send('Page.navigate',{url:b.host.baseUrl+'motorcycle'});await until(`document.body?.dataset.state==='running'`);
 report.start=await ev('motorcycleRuntimeReceipt');
 await ev(`document.getElementById('header-advanced').click();const f=document.getElementById('scenario');f.elements.motorcycles.value='2';f.elements.cars.value='0';f.elements.pedestrians.value='0';f.requestSubmit();`);
 await until(`document.getElementById('status').textContent==='New seeded traffic pass.'`);await ev(`document.getElementById('run').click()`);await until(`document.getElementById('progress').value>0`);
 await ev(`document.getElementById('cancel').click()`);await wait(500);report.cancel=await ev(`({status:document.getElementById('status').textContent,workers:analysisProbe.workers,results:analysisProbe.results.length})`);assert.equal(report.cancel.workers,0);assert.equal(report.cancel.results,0);
 await ev(`document.getElementById('run').click()`);await until(`analysisProbe.results.length===1 && !document.getElementById('results').hidden`);
 report.completed=await ev(`analysisProbe.results[0]`);assert.equal(report.completed.spectrum.sampleRate,8000);assert.equal(report.completed.spectrum.transformLength,4096);assert.ok(report.completed.spectrum.bins.some(b=>b.power>0));assert.ok(Number.isFinite(report.completed.record.readings.total.laeq));assert.equal(report.completed.record.interval[1]-report.completed.record.interval[0],1.25);
 await ev(`document.getElementById('export').click()`);await until(`!!analysisProbe.exportBlob`);const bundle=await ev(`analysisProbe.exportBlob.text()`);await fs.writeFile(out+'/replay.json',bundle);
 await ev(`document.getElementById('camera-mode').value='rider';document.getElementById('camera-mode').dispatchEvent(new Event('change'));`);
 await ev(`(async()=>{const transfer=new DataTransfer();transfer.items.add(new File([await analysisProbe.exportBlob.text()],'replay.json',{type:'application/json'}));const input=document.getElementById('import');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await until(`analysisProbe.results.length===2 && !document.getElementById('results').hidden`);report.replayed=await ev('analysisProbe.results[1]');assert.deepEqual(report.completed,report.replayed);report.replayExact=true;
 report.final=await ev(`({status:document.getElementById('status').textContent,workers:analysisProbe.workers,lifecycle:motorcycleRuntimeReceipt})`);assert.equal(report.final.workers,0);assert.equal(report.errors.length,0);
 const shot=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/completed-replay.png',Buffer.from(shot.data,'base64'));report.pass=true;
}catch(error){report.failure=error.stack;}finally{await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));await b.close();}console.log(JSON.stringify({pass:report.pass,failure:report.failure,cancel:report.cancel,final:report.final,errors:report.errors}));

if(!report.pass)process.exitCode=1;
