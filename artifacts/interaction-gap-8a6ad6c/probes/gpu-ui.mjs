import fs from 'node:fs/promises';
import {openBrowserAudit} from '/home/clocksmith/deco/simulatte/tools/simulatte/browser-session.mjs';
const root='/home/clocksmith/deco/simulatte',out=root+'/artifacts/interaction-gap-8a6ad6c/gpu-ui';
await fs.mkdir(out,{recursive:true});
const b=await openBrowserAudit({publicRoot:root+'/public',viewport:{width:1440,height:1000},args:['--no-sandbox','--disable-dev-shm-usage']});const c=b.client;
await c.send('Page.enable');await c.send('Runtime.enable');const report={head:'8a6ad6ce66041116e060ab12f706e2b756b948b0',startedAt:new Date().toISOString(),cases:[],errors:[]};
c.on('Runtime.exceptionThrown',e=>report.errors.push(e.exceptionDetails));
const ev=async s=>{const r=await c.send('Runtime.evaluate',{expression:s,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const snap=()=>ev(`(()=>{const $=id=>document.getElementById(id);return {url:location.href,phase:document.body.dataset.journeyPhase,time:$('playback-timeline')?.value,total:$('playback-timeline')?.max,status:$('runtime-status')?.textContent,controls:[...document.querySelectorAll('[data-plugin-control]')].map(e=>({id:e.dataset.pluginControl,value:e.value,visible:e.checkVisibility({visibilityProperty:true})})),contributions:globalThis.__simulattePluginPlatformV4?.contributions,receipt:globalThis.__simulatteTierRunReceipt,proof:$('profile-world-proof')?.textContent,canvas:$('overlay-canvas')?.getBoundingClientRect(),canvasDataset:{...$('overlay-canvas')?.dataset},renderer:$('overlay-canvas')?.__simulatteRenderReceipt?.(),inspection:$('plugin-inspector')?.textContent,drawer:$('decisions-drawer')?.getBoundingClientRect(),summary:$('experience-summary')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button')].filter(e=>e.checkVisibility({visibilityProperty:true})).map(e=>({id:e.id,text:e.textContent.trim(),disabled:e.disabled,top:e.getBoundingClientRect().top}))};})()`);
const shot=async name=>{const s=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/'+name+'.png',Buffer.from(s.data,'base64'));};
const click=id=>ev(`document.getElementById(${JSON.stringify(id)}).click()`);
const until=async pred=>{const end=Date.now()+30000;while(Date.now()<end){if(await ev(pred))return;await wait(100);}throw Error('timeout '+pred)};
try{report.browser=await c.send('Browser.getVersion');for(const width of [1440,390]){
await c.send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:1000,deviceScaleFactor:1,mobile:width===390});
await c.send('Page.navigate',{url:b.host.baseUrl+'datacenter'});await until(`document.body?.dataset.journeyPhase==='completed'`);
await until(`!document.getElementById('loading-screen').checkVisibility({visibilityProperty:true})`);await ev(`localStorage.clear()`);
const row={width,steps:[]};report.cases.push(row);row.steps.push({name:'autostart-completed',state:await snap()});await shot('gpu-'+width+'-initial');
await click('replay-button');await until(`document.body.dataset.journeyPhase==='running'`);await click('pause-button');await wait(200);row.steps.push({name:'paused',state:await snap()});
await click('decisions-button');await ev(`(()=>{const e=document.querySelector('[data-plugin-control=\"coolantFlowLpm\"]');for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;})()`);await wait(200);row.steps.push({name:'advanced-paused',state:await snap()});await shot('gpu-'+width+'-advanced');
const ctl=await ev(`[...document.querySelectorAll('[data-plugin-control]')].map(e=>({id:e.dataset.pluginControl,type:e.type}))`);console.log(JSON.stringify({width,ctl}));
await ev(`(()=>{const e=document.querySelector('[data-plugin-control="coolantFlowLpm"]');e.value=e.value==='20'?'30':'20';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(1500);row.steps.push({name:'coolant-20',state:await snap()});
await click('decisions-close');await click('start-button');await until(`document.body.dataset.journeyPhase==='completed'`);row.steps.push({name:'intervention-completed',state:await snap()});await shot('gpu-'+width+'-intervention');
await click('replay-button');await until(`document.body.dataset.journeyPhase==='completed'`);row.steps.push({name:'replay',state:await snap()});
await c.send('Page.reload',{});await until(`document.body?.dataset.journeyPhase==='completed'`);row.steps.push({name:'reload',state:await snap()});
await click('camera-reset');await wait(150);row.steps.push({name:'camera-reset',state:await snap()});
}
report.requests=b.host.requests;
}catch(e){report.failure=e.stack;}finally{await fs.writeFile(out+'/gpu-browser.json',JSON.stringify(report,null,2));await b.close();}
console.log(JSON.stringify({cases:report.cases.map(r=>({width:r.width,steps:r.steps.map(s=>({name:s.name,phase:s.state.phase,time:s.state.time}))})),failure:report.failure,errors:report.errors.length},null,2));
