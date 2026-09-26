import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const registry=require('../../public/simulatte/app/world-runtime-script-manifest.js');
const selected=process.argv.includes('--profile')?process.argv[process.argv.indexOf('--profile')+1]:null;
if(selected&&!registry.profilePlugins[selected])throw Error('Unknown profile: '+selected);
const out=root+'artifacts/model-accuracy/'+(selected?'catalog-'+selected:'catalog');await fs.mkdir(out,{recursive:true});
const report={sources:await sourceReceipt(root),cases:[],errors:[]};
const b=await openBrowserAudit({publicRoot:root+'public',viewport:{width:1440,height:1000},
  webgpu:true,args:['--no-sandbox','--disable-dev-shm-usage']}),c=b.client;
await c.send('Page.enable');await c.send('Runtime.enable');
c.on('Runtime.exceptionThrown',event=>report.errors.push(event.exceptionDetails));
const ev=async expression=>{const result=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const snap=()=>ev(`(()=>{const $=id=>document.getElementById(id),v=e=>!!e?.checkVisibility({visibilityProperty:true});return {
  phase:document.body?.dataset.journeyPhase,profile:$('application-profile')?.value,
  run:globalThis.__simulatteTierRunState,progress:Number($('playback-timeline')?.value),
  advanced:$('decisions-button')?.getAttribute('aria-expanded'),scenarioVisible:v($('scenario-select')),
  scenarioInAdvanced:!!$('decisions-drawer')?.contains($('scenario-select')),pauseVisible:v($('pause-button')),
  error:globalThis.__simulatteLastFailError?.message,overflow:(document.documentElement?.scrollWidth||0)>innerWidth,
  measures:globalThis.__simulattePluginPlatformV4?.contributions.map(c=>({pluginId:c.pluginId,state:c.state})),
  focused:document.activeElement?.id,heapBytes:performance.memory?.usedJSHeapSize};})()`);
async function until(predicate){const end=Date.now()+90000;let state;do{state=await snap();if(state.error||state.phase==='failed')throw Error(state.error||'Failed');if(predicate(state))return state;await delay(150);}while(Date.now()<end);throw Error('Opening state timed out: '+JSON.stringify(state));}
try{
  report.browser=await c.send('Browser.getVersion');
  for(const id of Object.keys(registry.profilePlugins).filter(id=>!selected||id===selected)){
    const profile=JSON.parse(await fs.readFile(root+`public/data/application-profiles/${id}.json`));
    for(const [width,height] of [[1440,1000],[390,844]]){
      const row={profile:id,width,height};report.cases.push(row);
      try{
        await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
        await c.send('Page.navigate',{url:b.host.baseUrl+`${profile.tier||'city'}/${id}`});
        row.opening=await until(s=>s.profile===id&&['running','completed'].includes(s.phase));
        assert.equal(row.opening.advanced,'false');assert.equal(row.opening.scenarioVisible,false);
        assert.equal(row.opening.scenarioInAdvanced,true);assert.equal(row.opening.overflow,false);
        if(row.opening.pauseVisible){
          await ev(`document.getElementById('pause-button').click()`);row.paused=await until(s=>s.phase==='paused'||s.phase==='completed');
          if(row.paused.phase==='paused'){
            await delay(350);assert.equal((await snap()).progress,row.paused.progress);
            await ev(`document.getElementById('camera-reset').click()`);assert.equal((await snap()).progress,row.paused.progress);
            await ev(`document.getElementById('resume-button').click()`);
            row.advanced=await until(s=>s.progress>row.paused.progress||s.phase==='completed');
          }
        }
        const shot=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+`/${id}-${width}.png`,Buffer.from(shot.data,'base64'));
        row.pass=true;
      }catch(error){row.failure=error.stack;}
      console.log(JSON.stringify({profile:id,width,pass:row.pass,failure:row.failure}));
      await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));
    }
  }
}finally{await b.close();await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));}
if(report.errors.length||report.cases.some(row=>!row.pass))process.exitCode=1;
