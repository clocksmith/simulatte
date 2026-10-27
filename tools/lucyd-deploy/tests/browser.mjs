import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createStaticSiteHandler} from '../../simulatte/static-site-server.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),output=process.env.LUCYD_DEPLOY_AUDIT_OUT||'/tmp/lucyd-deployment-browser';
const modulePath=process.env.PLAYWRIGHT_MODULE||'/Users/xyz/deco/256one/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(modulePath).href),server=http.createServer(createStaticSiteHandler({publicRoot:path.join(root,'public')}));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),report={schema:'lucyd.deployment-browser-audit.v1',boundary:'Local Chrome desktop/mobile optional deployment UI and explicit export; no cloud resources created',cases:[]};
await fs.mkdir(output,{recursive:true});
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(15000);console.log(JSON.stringify({viewport,phase:'open'}));await page.goto(base+'/system-diagram');await page.waitForSelector('body[data-editor-ready="true"]');
  await page.locator('#workspace-menu > summary').click();await page.locator('#preset').selectOption('amazon-flash-sale');
  await page.waitForFunction(()=>SimulatteSystemDiagramEditor.document().nodes.some(n=>n.id==='subsystem-1'));
  if(!await page.locator('#workspace-menu').evaluate(e=>e.open))await page.locator('#workspace-menu > summary').click();
  const button=page.getByRole('button',{name:'Deployment',exact:true});await button.click();console.log(JSON.stringify({viewport,phase:'panel'}));
  const dialog=page.getByRole('dialog',{name:'Implementation and deployment'}),status=dialog.locator('[data-deployment-status]');
  await page.waitForFunction(()=>document.querySelector('[data-deployment-status]')?.textContent.startsWith('Supported inventory'));
  assert.match(await dialog.locator('pre').textContent(),/subsystem-1\/inventory/);
  await dialog.locator('details > summary').click();const field=dialog.locator('textarea'),settings=JSON.parse(await field.inputValue());
  settings.images={application:'registry.example/test@sha256:'+'a'.repeat(64),postgres:'registry.example/test-postgres@sha256:'+'b'.repeat(64)};
  await field.fill(JSON.stringify(settings,null,2));const waiting=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download Kubernetes bundle'}).click();const download=await waiting,bundle=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  assert.equal(bundle.qualification.cloudDeployed,false);assert.equal(bundle.bindingPlan.length,5);assert.ok(bundle.objects.some(o=>o.kind==='StatefulSet'));
  const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1);assert.ok(bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1);
  await page.screenshot({path:path.join(output,`deployment-${viewport.width}.png`)});
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.evaluate(()=>{document.body.dataset.privateDocument='true';});
  // Private export must refuse before even fetching the registry or reading the diagram.
  const privateRequests=[];page.on('request',r=>{if(/deployment\/(registry|configuration)/.test(r.url()))privateRequests.push(r.url());});
  if(!await page.locator('#workspace-menu').evaluate(e=>e.open))await page.locator('#workspace-menu > summary').click();await button.click();await page.waitForFunction(()=>document.querySelector('[data-deployment-status]')?.textContent.includes('Private designs require encrypted export'));
  assert.equal(await field.inputValue(),'');assert.equal(privateRequests.length,0);await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.evaluate(()=>{document.body.dataset.privateDocument='false';});
  const cleanup=await page.evaluate(async()=>{const {create}=await import('/simulatte/system-diagram/deployment/panel.js');const panel=create({host:document.body,getDiagram:()=>{throw Error('Private diagram was read');},getDependencies:()=>({}),getIsPrivate:()=>true});await panel.open();const dialogs=document.querySelectorAll('.lucyd-deployment').length;panel.dispose();return {before:dialogs,after:document.querySelectorAll('.lucyd-deployment').length};});assert.equal(cleanup.before-cleanup.after,1);
  assert.deepEqual(errors,[]);report.cases.push({viewport,supportedPilot:true,explicitDownload:true,privateRefusal:true,dispose:true,withinViewport:true,errors});await context.close();
 }
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,cases:report.cases.length,passed:true}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
