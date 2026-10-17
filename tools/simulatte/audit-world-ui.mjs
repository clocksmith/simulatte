import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const liveBase=process.env.WORLD_AUDIT_BASE;
const output=root+(liveBase?'artifacts/world-ui-catalog-live':'artifacts/world-ui-catalog');await fs.mkdir(output,{recursive:true});
const report={source:await sourceReceipt(root),baseUrl:liveBase||'local static server',boundary:`${liveBase?'Deployed URL':'Local output'} in Chrome: component behavior and emulated layouts; not physical devices or human comprehension.`,cases:[]};
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const browser=await openBrowserAudit({publicRoot:root+'public',viewport}),c=browser.client;
  const evaluate=async expression=>{const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const key=async key=>{const windowsVirtualKeyCode={ArrowDown:40,End:35,Escape:27,Tab:9,Enter:13}[key];for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode,...(type==='keyDown'&&key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});};
  const row={viewport,checks:[]};report.cases.push(row);
  try{
    await c.send('Page.enable');await c.send('Runtime.enable');
    await c.send('Emulation.setDeviceMetricsOverride',{...viewport,mobile:viewport.width<700,deviceScaleFactor:1});
    await c.send('Page.navigate',{url:(liveBase||browser.host.baseUrl)+'shared/design/world-ui/catalog.html'});
    for(let i=0;i<100&&!await evaluate("document.querySelectorAll('.catalog-theme').length===2");i++)await new Promise(r=>setTimeout(r,50));
    assert.equal(await evaluate("document.querySelectorAll('.catalog-theme').length"),2);
    await evaluate('document.fonts.ready');
    assert.equal(await evaluate("document.fonts.check('500 13px \"Space Grotesk\"')"),true);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    for(const theme of ['light','dark']){
      const prefix=`[data-wui-theme=${theme}].catalog-theme`;
      assert.equal(await evaluate(`(()=>{const nodes=[...document.querySelectorAll('${prefix} .catalog-row button')];return nodes.length===25&&nodes.every(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return r.width>=44&&r.height>=44&&s.borderRadius==='4px'&&s.boxShadow==='none'&&s.backdropFilter==='none'&&s.fontFamily.includes('Space Grotesk')})})()`),true);
      assert.equal(await evaluate(`document.querySelector('${prefix} [aria-label="primary pending"]').disabled`),true);
      assert.equal(await evaluate(`document.querySelector('${prefix} [aria-label="primary error"]').dataset.state`),'error');
      await evaluate(`document.querySelector('${prefix} .wui-menu-trigger').focus()`);await key('ArrowDown');await key('End');
      assert.equal(await evaluate('document.activeElement.textContent'),'Follow');await key('Enter');
      assert.equal(await evaluate(`document.querySelector('${prefix} [aria-checked=true]').textContent`),'Follow');
      assert.equal(await evaluate(`document.activeElement.matches('${prefix} .wui-menu-trigger')`),true);
      await key('ArrowDown');await key('Escape');
      assert.equal(await evaluate(`document.querySelector('${prefix} .wui-menu').open`),false);
      await evaluate(`(()=>{const b=[...document.querySelectorAll('${prefix} button')].find(b=>b.textContent==='Open settings');b.focus();b.click()})()`);
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Close settings');
      await key('Tab');await key('Tab');
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Close settings');
      await key('Escape');assert.equal(await evaluate('document.activeElement.textContent'),'Open settings');
    }
    row.checks.push('Both themes: 25 variant/state combinations, geometry, fonts, menu navigation/selection/Escape/focus return, sheet focus trap/return');
    // Actual asynchronous callbacks exercise behavior beyond the static catalog states.
    assert.equal(await evaluate(`(async()=>{
      const ui=SimulatteWorldUI;let calls=0,finish;
      const b=ui.SimButton({label:'Async fixture',onAction:()=>{calls++;return new Promise(resolve=>finish=resolve)}});document.body.append(b.element);
      b.element.click();b.element.click();if(calls!==1||!b.element.disabled||b.element.getAttribute('aria-busy')!=='true')throw Error('Pending action was not isolated');
      finish();await new Promise(r=>setTimeout(r));if(b.element.disabled)throw Error('Pending never cleared');b.element.remove();
      const error=ui.SimButton({label:'Failure fixture',onAction:async()=>{throw Error('Rejected action')}});document.body.append(error.element);error.element.click();await new Promise(r=>setTimeout(r));
      if(error.element.dataset.state!=='error'||error.element.disabled||error.element.title!=='Rejected action')throw Error('Failure state lost');error.element.remove();
      const host=document.createElement('div');document.body.append(host);let reject;
      const inspector=ui.SimInspector({host,onSelect:()=>{},onAction:()=>new Promise((_,r)=>reject=r)});
      const input=id=>({objects:[{id:'a',label:'A'},{id:'b',label:'B'}],selectedId:id,label:id,fields:[],actions:[{id:'change',label:'Change'},{id:'focus',label:'Focus'}]});
      inspector.render(input('a'));host.querySelector('[data-object-action=change]').click();inspector.render(input('b'));reject(Error('Old selection failed'));await new Promise(r=>setTimeout(r));
      const next=host.querySelector('[data-object-action=change]');if(next.disabled||next.dataset.state==='error'||host.querySelector('.wui-feedback').textContent)throw Error('Old action contaminated new selection');
      if(host.querySelectorAll('[data-variant=primary]').length!==1)throw Error('Multiple primary actions');inspector.dispose();host.remove();return true;
    })()`),true);
    row.checks.push('Async duplicate suppression, pending recovery, rejected action feedback, stale inspector result isolation');
    assert.equal(await evaluate(`(()=>{
      const ui=SimulatteWorldUI,trigger=ui.SimButton({label:'Dialog fixture'}).element;
      const parent=document.createElement('section'),child=document.createElement('dialog');
      const openChild=ui.SimButton({label:'Open child'}).element,closeChild=ui.SimButton({label:'Close child'}).element;
      document.body.append(trigger,parent,child);parent.append(openChild);child.append(closeChild);
      const outer=ui.SimSheet({element:parent,trigger}),inner=ui.SimSheet({element:child,closeButton:closeChild});
      trigger.focus();trigger.click();openChild.focus();child.showModal();
      if(!child.open||document.activeElement!==closeChild)throw Error('Native sheet did not acquire focus');
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      if(child.open||parent.hidden||document.activeElement!==openChild)throw Error('Nested dismissal closed parent or lost focus');
      outer.close();if(document.activeElement!==trigger)throw Error('Outer focus lost');inner.dispose();outer.dispose();trigger.remove();parent.remove();child.remove();
      const menuHost=document.createElement('details'),group=document.createElement('div');group.id='fixture-camera-choices';menuHost.append(group);document.body.append(menuHost);
      const menu=ui.SimMenu({element:menuHost,label:'Camera'}),reset=ui.SimButton({label:'Reset view'}).element;menu.content.append(reset);
      group.replaceChildren(ui.SimButton({label:'Late camera'}).element);
      if(!reset.isConnected||!menu.content.contains(group))throw Error('Late advertisement removed menu utilities');menu.dispose();menuHost.remove();
      const metricHost=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');label.textContent='Distance';value.textContent='12 m';metricHost.append(label,value);document.body.append(metricHost);
      const metric=ui.SimMetric({element:metricHost,labelElement:label,valueElement:value,preserveContent:true});
      metric.update({subject:'Distance',value:12,unit:'m',timeBasis:'At 2 s',freshness:'stale',validity:'modeled',level:'supporting'});
      if(metricHost.lastElementChild!==value||value.textContent!=='12 m'||metricHost.dataset.freshness!=='stale')throw Error('Metric replaced owner value or validity');metricHost.remove();return true;
    })()`),true);
    row.checks.push('Native nested sheet dismissal/focus, late domain menu population preserves utilities, metric owner identity and freshness');

    await evaluate('scrollTo(0,0)');
    const bytes=Buffer.from((await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64');
    const file=`${viewport.width}.png`;await fs.writeFile(output+'/'+file,bytes);row.screenshot={file,sha256:createHash('sha256').update(bytes).digest('hex')};row.pass=true;
  }catch(error){row.pass=false;row.error=error.stack;}
  finally{await browser.close();browser.child.stdout?.destroy();browser.child.stderr?.destroy();await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');}
  console.log(`${viewport.width}: ${row.pass?'PASS':row.error}`);
}
if(report.cases.some(row=>!row.pass))process.exitCode=1;
