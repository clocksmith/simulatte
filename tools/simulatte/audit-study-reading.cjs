'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.LUCYD_PLAYWRIGHT_MODULE||'@playwright/test');
if(!process.argv.includes('--url'))process.argv.push('--url','http://127.0.0.1:4173/lucyd');
const {boot,problems}=require('./audit-study-workspace.cjs');
const ROOT=path.resolve(__dirname,'../..');
async function main(){const browser=await chromium.launch(),rows=[],flag=process.argv.indexOf('--out'),out=path.resolve(ROOT,flag>=0?process.argv[flag+1]:'artifacts/composable-study/reading.json');
 const record=(name,pass,observed)=>{rows.push({name,pass,observed});console.log(pass?'PASS':'FAIL',name);};
 try{for(const dpr of [1,2]){const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:dpr,colorScheme:dpr===1?'light':'dark'});
 await context.addInitScript(()=>{window.studyDisplayText=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(...args){if(this.canvas.isConnected&&this.canvas.classList.contains('static')){studyDisplayText.push({font:this.font,scale:this.getTransform().a});if(studyDisplayText.length>400)studyDisplayText.shift();}return fill.apply(this,args);};});
 const h=await boot(context,'?problem=L004&approach=push&stage=9'),p=h.page;
 const text=await p.evaluate(()=>({fonts:[...new Set(SimulatteStudyInspector.elements().filter(e=>e.type==='text').map(e=>e.fontFamily))],defaultFont:SimulatteStudyInspector.appState().currentItemFontFamily,draws:studyDisplayText.length,directNunito:studyDisplayText.some(d=>d.font.includes('Nunito')),canvases:[...document.querySelectorAll('canvas.excalidraw__canvas')].map(c=>({ratio:c.width/c.getBoundingClientRect().width,rendering:getComputedStyle(c).imageRendering})),zoom:SimulatteStudyInspector.appState().zoom.value}));
 record(`Nunito at device scale ${dpr}`,text.fonts.every(f=>f===6)&&text.defaultFont===6&&text.directNunito&&text.canvases.every(c=>Math.abs(c.ratio-dpr)<.01&&c.rendering==='auto'),text);
 await h.focusCanvas();await h.key(process.platform==='darwin'?'Meta+-':'Control+-');await p.waitForTimeout(150);
 const fractional=await p.evaluate(()=>({zoom:SimulatteStudyInspector.appState().zoom.value,draws:studyDisplayText.slice(-40),dpr:devicePixelRatio}));
 record(`Direct text at fractional zoom and scale ${dpr}`,fractional.zoom<1&&fractional.draws.some(d=>d.font.includes('Nunito')&&Math.abs(d.scale-fractional.dpr*fractional.zoom)<.01),fractional);
 await p.click('.sw-trigger');await p.waitForTimeout(200);
 const contrast=await p.evaluate(()=>{function rgb(s){return (s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);}function luminance(c){const n=c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*n[0]+.7152*n[1]+.0722*n[2];}function background(e){while(e){const c=getComputedStyle(e).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;e=e.parentElement;}return 'rgb(255,255,255)';}return {width:document.querySelector('.sw-sidebar').getBoundingClientRect().width,theme:document.documentElement.dataset.theme,items:[...document.querySelectorAll('.sw-sidebar .sidebar-tab-trigger,.sw-sidebar .sw-section h3,.sw-sidebar .sw-muted,.sw-sidebar .sw-evidence,.sw-sidebar .sw-note')].filter(e=>e.getClientRects().length).map(e=>{const fg=getComputedStyle(e).color,bg=background(e),a=luminance(rgb(fg)),b=luminance(rgb(bg));return {text:e.textContent.slice(0,42),fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};})};});
 record(`Study contrast in ${contrast.theme}`,contrast.width>=440&&contrast.width<=500&&contrast.items.every(c=>c.ratio>=4.5),contrast);
 await p.screenshot({path:out.replace('.json',`-${dpr}.png`)});await h.closeSidebar();
 const guide=await p.evaluate(()=>{const guide=document.querySelector('.sw-guide-wrap'),box=guide.getBoundingClientRect(),s=SimulatteStudyInspector.workspace(),sol=s.document.solutions.find(x=>x.id===s.view.solutionId);return {steps:guide.querySelectorAll('.sw-guide-stages button').length,expected:sol.stages.length,current:guide.querySelector('[aria-current="step"]')?.getAttribute('aria-label'),explanation:guide.textContent.includes(sol.stages[s.view.stageIndex].reason),centered:Math.abs(box.x+box.width/2-innerWidth/2)<2,inside:box.x>=0&&box.right<=innerWidth};});
 record(`Centered sequence guide at scale ${dpr}`,guide.steps===guide.expected&&guide.explanation&&guide.centered&&guide.inside,guide);
 await p.click('.sw-guide-stages button[aria-label^="Stage 2:"]');await p.waitForFunction(()=>SimulatteStudyInspector.workspace().view.stageIndex===1);record(`Sequence stage selection ${dpr}`,(await h.workspace()).view.stageIndex===1);
 await p.click('.sw-mode-toggle');record(`Study mode can be hidden ${dpr}`,await p.locator('.sw-guide-wrap').count()===0);
 await p.click('.sw-mode-toggle');record(`Study mode restores its guide ${dpr}`,await p.locator('.sw-guide-wrap').count()===1);
 if(dpr===1){
  await h.focusCanvas();await h.key('PageDown');await h.key('PageDown');await p.waitForTimeout(500);const before=(await h.workspace()).view.stageIndex;
  await p.selectOption('select[aria-label="Problem"]','L003');await p.waitForFunction(()=>SimulatteStudyInspector.workspace().document.problem.referenceId==='L003');
  await p.selectOption('select[aria-label="Problem"]','L004');await p.waitForFunction(()=>SimulatteStudyInspector.workspace().document.problem.referenceId==='L004');
  record('Returning to a saved problem starts at stage one',before>0&&(await h.workspace()).view.stageIndex===0,{before,after:(await h.workspace()).view.stageIndex});
  await h.focusCanvas();await h.key('PageDown');await p.selectOption('select[aria-label="Approach"]','inbox');await p.waitForFunction(()=>SimulatteStudyInspector.workspace().view.solutionId==='inbox');
  record('Changing approach starts at stage one',(await h.workspace()).view.stageIndex===0);
  await h.focusCanvas();await h.key('PageDown');await p.selectOption('select[aria-label="Approach"]','push');await p.waitForFunction(()=>SimulatteStudyInspector.workspace().view.solutionId==='push');record('Returning to an approach starts at stage one',(await h.workspace()).view.stageIndex===0);
 }
 await context.close();}
 const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const mobile=await boot(phone,'?problem=L004&approach=push&stage=3'),mp=mobile.page;
 const geometry=await mp.evaluate(()=>{const r=document.querySelector('.sw-guide-wrap').getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,steps:document.querySelectorAll('.sw-guide-stages button').length};});
 record('Phone sequence guide stays within the viewport',geometry.left>=0&&geometry.right<=geometry.width&&geometry.bottom<=geometry.height&&geometry.steps===9,geometry);
 await mp.locator('.sw-guide-stages button[aria-label^="Stage 2:"]').tap();await mp.waitForFunction(()=>SimulatteStudyInspector.workspace().view.stageIndex===1);record('Phone stage chips navigate',(await mobile.workspace()).view.stageIndex===1);
 await mp.tap('.main-menu-trigger');await mp.getByText('Study notes and stages',{exact:true}).click();await mp.waitForSelector('.sw-sidebar');
 const sidebar=await mp.evaluate(()=>{const r=document.querySelector('.sw-sidebar').getBoundingClientRect(),guide=document.querySelector('.sw-guide-wrap');return {left:r.left,right:r.right,width:innerWidth,guideHidden:getComputedStyle(guide).display==='none'};});
 record('Phone Notes stays in view without a competing guide',sidebar.left>=0&&sidebar.right<=sidebar.width&&sidebar.guideHidden,sidebar);await phone.close();
 const report={schema:'simulatte.studyReadingAudit.v1',url:process.argv[process.argv.indexOf('--url')+1],scope:'Chromium DPR1/light and DPR2/dark, real display text draws, computed text contrast and actual selection controls',passed:rows.every(r=>r.pass)&&!problems.length,rows,pageProblems:problems};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:rows.length,errors:problems,out}));if(!report.passed)process.exitCode=1;
 }finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
