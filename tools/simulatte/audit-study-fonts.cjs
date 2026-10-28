'use strict';
// Native font selection and exact workspace persistence, with every runtime request kept same-origin.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.LUCYD_PLAYWRIGHT_MODULE || '@playwright/test');
if(!process.argv.includes('--url'))process.argv.push('--url','http://127.0.0.1:4173/lucyd');
const {boot,problems}=require('./audit-study-workspace.cjs');
const ROOT=path.resolve(__dirname,'../..');
async function main(){
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1500,height:1000},acceptDownloads:true}),external=[],rows=[];
 const urlFlag=process.argv.indexOf('--url'),url=urlFlag>=0?process.argv[urlFlag+1]:'http://127.0.0.1:4173/lucyd';
 await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.protocol.startsWith('http')&&u.origin!==new URL(url).origin){external.push(r.url());return route.abort();}return route.continue();});
 try{
  const h=await boot(context,'?problem=L004&approach=push&stage=1'),p=h.page,[x,y]=await h.clearArea();
  await h.focusCanvas();await h.key('t');await p.mouse.click(x+80,y+60);await p.keyboard.type('New font sample: Cafe 123');await h.key('Escape');
  let sample=await p.evaluate(()=>SimulatteStudyInspector.elements().find(e=>e.type==='text'&&e.originalText==='New font sample: Cafe 123'));
  if(!sample)throw Error('Native text tool did not create the font sample');
  await h.select(sample.id);
  const expected=[['font-family-normal',6,'Nunito'],['font-family-code',8,'Comic Shanns'],['font-family-hand-drawn',5,'Excalifont']];
  for(const [button,id,name]of expected){await p.getByTestId(button).click();await p.waitForTimeout(350);const state=await p.evaluate(id=>{const e=SimulatteStudyInspector.elements().find(e=>e.id===id);return {fontFamily:e.fontFamily,text:e.originalText,fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family)};},sample.id);rows.push({name,expected:id,...state,pass:state.fontFamily===id&&state.text===sample.originalText&&state.fonts.includes(name)});}
  await p.getByTestId('font-family-show-fonts').click();await p.getByText('Lilita One',{exact:true}).click();await p.waitForTimeout(400);
  const lilita=await p.evaluate(id=>SimulatteStudyInspector.elements().find(e=>e.id===id),sample.id);rows.push({name:'Lilita One',expected:7,fontFamily:lilita.fontFamily,pass:lilita.fontFamily===7});
  await h.focusCanvas();await h.key('Escape');await p.waitForTimeout(800);
  const legacy=await p.evaluate(()=>[1,2,3].map(fontFamily=>{const element=ExcalidrawLib.restoreElements([{id:'legacy-'+fontFamily,type:'text',text:'Legacy font',originalText:'Legacy font',x:0,y:0,width:100,height:30,fontSize:24,fontFamily,version:1,versionNonce:1,seed:1,angle:0,isDeleted:false,groupIds:[],boundElements:[],updated:1,link:null,locked:false}],null)[0];return {name:'Legacy font '+fontFamily,fontFamily:element.fontFamily,pass:element.fontFamily===fontFamily};}));rows.push(...legacy);
  const saved=await p.evaluate(id=>{const ws=SimulatteStudyInspector.workspace(),serialized=SimulatteStudyWorkspace.serialize(ws),restored=SimulatteStudyWorkspace.parse(serialized).workspace;const find=d=>Object.values(d.overlays).flatMap(stages=>Object.values(stages)).flatMap(o=>o.elements||[]).find(e=>e.id===id);return {source:find(ws),restored:find(restored),equal:JSON.stringify(ws)===JSON.stringify(restored)};},sample.id);
  rows.push({name:'Workspace JSON preserves selected font',fontFamily:saved.restored?.fontFamily,pass:saved.equal&&saved.source?.fontFamily===7&&saved.restored?.fontFamily===7});
  const outFlag=process.argv.indexOf('--out'),out=path.resolve(ROOT,outFlag>=0?process.argv[outFlag+1]:'artifacts/composable-study/modern-fonts.json');fs.mkdirSync(path.dirname(out),{recursive:true});await p.screenshot({path:out.replace('.json','.png')});
  const entryUrl=new URL('/simulatte/system-diagram/study/vendor/modern/index.js',url),entryBytes=await (await p.request.get(entryUrl.href,{headers:{'Cache-Control':'no-cache'}})).body(),entrySha256=crypto.createHash('sha256').update(entryBytes).digest('hex'),localEntrySha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'public/simulatte/system-diagram/study/vendor/modern/index.js'))).digest('hex');
  const report={entryUrl:entryUrl.href,entrySha256,localEntrySha256,schema:'simulatte.studyFontAudit.v1',url,browser:browser.version(),excalidraw:'0.18.1',scope:'Native picker interactions, loaded browser fonts and workspace JSON round-trip. One desktop Chromium, no physical mobile proof.',externalRequests:external,pageProblems:problems,rows,passed:rows.every(r=>r.pass)&&!external.length&&!problems.length&&entrySha256===localEntrySha256};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
 }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
