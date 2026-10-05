import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const arg=(name,fallback='')=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const out=path.resolve(root,arg('--out','artifacts/sunwalker/20261005'));
await fs.mkdir(out,{recursive:true});
const report={observedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes:{},runs:[]};
for(const file of ['public/simulatte/app/webgpu-renderer.js','public/simulatte/app/plugin-actor-motion.js','public/simulatte/app/plugin-presentation.js','public/simulatte/app/camera-controller.js','public/simulatte/app/sun-walker-controls.js','public/shared/plugins/sun-walker/plugin.json','public/world-tiers.css'])
  report.sourceHashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');

try {
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const browser=await openBrowserAudit({publicRoot:path.join(root,'public'),url:arg('--url'),viewport,webgpu:true});
    const {client}=browser;
    const run={viewport,url:new URL('/sunwalker',browser.host.baseUrl).href,checks:[],screenshots:[]};report.runs.push(run);
    const evaluate=async expression=>{
      const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
      return result.result.value;
    };
    const wait=async expression=>{const start=Date.now();while(!(await evaluate(expression))){if(Date.now()-start>60000)throw new Error(`Timed out: ${expression}`);await new Promise(r=>setTimeout(r,100));}};
    const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const capture=async name=>{
      const filename=`${viewport.width}-${name}.png`;
      const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await fs.writeFile(path.join(out,filename),Buffer.from(shot.data,'base64'));run.screenshots.push(filename);
    };
    try {
      await client.send('Runtime.enable');await client.send('Page.enable');
      await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
      await client.send('Page.navigate',{url:run.url});
      await wait(`document.querySelector('.sun-walk-controls') && Number(document.querySelector('#autonomy-canvas')?.dataset.frameCount)>25`);
      run.build=await evaluate(`document.querySelector('meta[name="simulatte-build"]').content`);
      run.initial=await evaluate(`({canvas:{...document.querySelector('#autonomy-canvas').dataset},cards:document.querySelector('.sun-walk-routes').innerText,origin:document.querySelector('[name=originPlace]').value,destination:document.querySelector('[name=destinationPlace]').value})`);
      assert.equal(run.initial.canvas.sunShadow,'depth-map');assert.ok(Number(run.initial.canvas.sunShadowCasterVertices)>900000);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);run.checks.push('solar shadows and individual building geometry; no horizontal overflow');
      await capture('overview');
      await click('[data-walk-camera=follow]');
      await wait(`(()=>{const d=document.querySelector('#autonomy-canvas').dataset;const e=d.cameraEye.split(',').map(Number),t=d.cameraTarget.split(',').map(Number);return d.cameraMode==='follow'&&d.cameraTransition==='settled'&&Math.hypot(e[0]-t[0],e[2]-t[2])<0.1})()`);
      await capture('follow');run.checks.push('top-down camera remains over the walker');
      await click('[data-walk-camera=pov]');
      await wait(`(()=>{const d=document.querySelector('#autonomy-canvas').dataset;return d.cameraMode==='pov'&&d.cameraTransition==='settled'&&Number(d.cameraEye.split(',')[1])<2})()`);
      await capture('first-person');run.checks.push('first-person camera at walking eye height');
      await evaluate(`(()=>{const select=document.querySelector('[name=destinationPlace]');select.value='Tompkins Square';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.sun-walk-endpoints').requestSubmit()})()`);
      await wait(`document.querySelector('.sun-walk-controls').getAttribute('aria-busy')==='false' && document.querySelector('[data-route-stats=fastest]').textContent.startsWith('21.0 min')`);
      run.changedCards=await evaluate(`document.querySelector('.sun-walk-routes').innerText`);
      assert.match(run.changedCards,/24% shade/);assert.match(run.changedCards,/22% shade/);
      await click('[data-walk-weight="0"]');await wait(`document.querySelector('[data-walk-weight="0"]').getAttribute('aria-pressed')==='true' && document.querySelector('.sun-walk-controls').getAttribute('aria-busy')==='false'`);
      await click('[data-walk-weight="100"]');await wait(`document.querySelector('[data-walk-weight="100"]').getAttribute('aria-pressed')==='true' && document.querySelector('.sun-walk-controls').getAttribute('aria-busy')==='false'`);
      run.checks.push('changed destination; both route policies run with their own exposure predictions');
      await evaluate(`(()=>{const select=document.querySelector('[name=originPlace]');select.value='Union Square';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.sun-walk-endpoints').requestSubmit()})()`);
      await wait(`document.querySelector('.sun-walk-controls').getAttribute('aria-busy')==='false' && document.querySelector('[data-walk-message]').hidden`);
      run.changedOrigin=await evaluate(`document.querySelector('.sun-walk-routes').innerText`);
      assert.notEqual(run.changedOrigin,run.changedCards);run.checks.push('changed origin recomputes the route');
      await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Pause'&&!e.hidden).click()`);
      await new Promise(r=>setTimeout(r,350));
      const paused=await evaluate(`document.querySelector('.sim-readouts').innerText`);
      await new Promise(r=>setTimeout(r,650));assert.equal(await evaluate(`document.querySelector('.sim-readouts').innerText`),paused);
      await evaluate(`(()=>{const select=document.querySelector('[name=destinationPlace]');select.value=document.querySelector('[name=originPlace]').value;select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.sun-walk-endpoints').requestSubmit()})()`);
      assert.match(await evaluate(`document.querySelector('[data-walk-message]').textContent`),/different starting and ending/);
      assert.equal(await evaluate(`document.querySelector('.sim-readouts').innerText`),paused);run.checks.push('pause freezes the walk; invalid endpoints preserve the accepted walk');
      assert.equal(await evaluate(`globalThis.__simulatteLastFailError?.message||''`),'');
      run.pass=true;console.log(JSON.stringify({viewport,pass:true,checks:run.checks}));
    } catch(error) {run.pass=false;run.error=error.stack;run.failure=await evaluate(`({controls:document.querySelector('.sun-walk-controls')?.innerText,error:globalThis.__simulatteLastFailError?.message||'',phase:document.body.dataset.journeyPhase})`);await capture('failure');throw error;}
    finally {await browser.close();}
  }
} finally {await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');}
