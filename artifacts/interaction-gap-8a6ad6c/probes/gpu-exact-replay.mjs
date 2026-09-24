import fs from 'node:fs/promises';
import {openBrowserAudit} from '/home/clocksmith/deco/simulatte/tools/simulatte/browser-session.mjs';
const root='/home/clocksmith/deco/simulatte',out=root+'/artifacts/interaction-gap-8a6ad6c';
const b=await openBrowserAudit({publicRoot:root+'/public',viewport:{width:1440,height:1000},args:['--no-sandbox','--disable-dev-shm-usage']});const c=b.client;
await c.send('Page.enable');await c.send('Runtime.enable');const report={head:'8a6ad6ce66041116e060ab12f706e2b756b948b0',startedAt:new Date().toISOString(),cases:[],errors:[]};
c.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails));
const ev=async s=>{const r=await c.send('Runtime.evaluate',{expression:s,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const snap=()=>ev(`(()=>{const $=id=>document.getElementById(id);return {url:location.href,phase:document.body.dataset.journeyPhase,time:$('playback-timeline')?.value,total:$('playback-timeline')?.max,status:$('runtime-status')?.textContent,controls:[...document.querySelectorAll('[data-plugin-control]')].map(e=>({id:e.dataset.pluginControl,value:e.value,visible:e.checkVisibility({visibilityProperty:true})})),contributions:globalThis.__simulattePluginPlatformV4?.contributions,receipt:globalThis.__simulatteTierRunReceipt,proof:$('profile-world-proof')?.textContent,canvas:$('overlay-canvas')?.getBoundingClientRect(),canvasDataset:{...$('overlay-canvas')?.dataset},renderer:$('overlay-canvas')?.__simulatteRenderReceipt?.(),inspection:$('plugin-inspector')?.textContent,drawer:$('decisions-drawer')?.getBoundingClientRect(),summary:$('experience-summary')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button')].filter(e=>e.checkVisibility({visibilityProperty:true})).map(e=>({id:e.id,text:e.textContent.trim(),disabled:e.disabled,top:e.getBoundingClientRect().top}))};})()`);
const shot=async name=>{const s=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/'+name+'.png',Buffer.from(s.data,'base64'));};
const click=id=>ev(`document.getElementById(${JSON.stringify(id)}).click()`);
const until=async pred=>{const end=Date.now()+30000;while(Date.now()<end){if(await ev(pred))return;await wait(100);}throw Error('timeout '+pred)};
try {
report.browser=await c.send('Browser.getVersion');
await c.send('Page.navigate',{url:b.host.baseUrl+'datacenter'});await until(`document.body?.dataset.journeyPhase==='completed'`);await until(`!document.getElementById('replay-profile-world-spec').disabled`);
await click('decisions-button');await ev(`document.getElementById('profile-program-section').open=true`);await click('replay-profile-world-spec');await until(`document.getElementById('profile-world-proof-status').textContent!=='Replaying exact WorldSpec'`);await wait(500);
report.cases.push({name:'exact-replay',state:await snap()});await shot('gpu-exact-replay');
} catch(e){report.failure=e.stack;}finally{await fs.writeFile(out+'/gpu-exact-replay.json',JSON.stringify(report,null,2));await b.close();}
console.log(JSON.stringify({failure:report.failure,errors:report.errors.length,proof:report.cases[0]?.state.proof?.slice(0,120)},null,2));
