import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const root=process.cwd()+'/',output=root+'artifacts/standalone-world-ui';await fs.mkdir(output,{recursive:true});
const report={source:await sourceReceipt(root),boundary:'Local standalone legacy entry: shared controls, native dialog and emulated layout only; not model qualification.',cases:[]};
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const b=await openBrowserAudit({publicRoot:root+'public',viewport}),c=b.client,row={viewport};report.cases.push(row);
 const evaluate=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 try{
  await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Emulation.setDeviceMetricsOverride',{...viewport,mobile:viewport.width<700,deviceScaleFactor:1});
  await c.send('Page.navigate',{url:b.host.baseUrl+'simulatte/motorcycle-mitigation/index.html'});
  for(let n=0;n<100&&!await evaluate("Boolean(document.querySelector('[data-wui=sheet]'))");n++)await new Promise(r=>setTimeout(r,100));
  assert.equal(await evaluate("[...document.querySelectorAll('button,input,select,textarea,summary')].filter(e=>e.checkVisibility()&&!e.dataset.wui).length"),0);
  assert.equal(await evaluate("document.querySelectorAll('[data-wui=metric]').length"),4);
  await evaluate("document.getElementById('open-worldspec-btn').focus();document.getElementById('open-worldspec-btn').click()");
  assert.equal(await evaluate("document.getElementById('worldspec-dialog').open"),true);
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate("document.getElementById('worldspec-dialog').open"),false);
  assert.equal(await evaluate("document.activeElement.id"),'open-worldspec-btn');
  row.pass=true;
 }catch(error){row.pass=false;row.error=error.stack;}
 finally{await b.close();b.child.stdout?.destroy();b.child.stderr?.destroy();}
 console.log(viewport.width,row.pass?'PASS':row.error);
}
await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');if(report.cases.some(r=>!r.pass))process.exitCode=1;
