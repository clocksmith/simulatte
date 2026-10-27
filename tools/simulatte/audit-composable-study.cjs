'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {build,OUTPUT}=require('./build-study-solutions.cjs');
const {sorted}=require('./study-solution-author.cjs');
const ROOT=path.resolve(__dirname,'../..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function runTests(cwd,files,label){
 const result=spawnSync(process.execPath,['--test',...files],{cwd,encoding:'utf8',timeout:30000});
 if(result.error||result.status!==0)throw Error('Focused tests failed: '+(result.error||result.stderr||result.stdout));
 const count=name=>{const value=result.stdout.match(new RegExp('^# '+name+' (\\d+)$','m'));if(!value)throw Error('Missing TAP '+name+' receipt');return Number(value[1]);};
 const outputPath='artifacts/composable-study/'+label+'.tap';fs.mkdirSync(path.dirname(path.join(ROOT,outputPath)),{recursive:true});fs.writeFileSync(path.join(ROOT,outputPath),result.stdout);
 return {tests:count('tests'),passed:count('pass'),failed:count('fail'),outputPath,outputSha256:hash(result.stdout),command:['node','--test',...files].join(' ')};
}
function main(){
 const {files,receipts}=build();
 for(const [name,bytes]of files)if(fs.readFileSync(path.join(OUTPUT,name),'utf8')!==bytes)throw Error('Stale generated artifact '+name);
 const rows=receipts.map(r=>{
  const p=JSON.parse(files.get(r.path));
  return {referenceId:r.referenceId,sha256:r.sha256,solutions:p.solutions.map(s=>{
   const operations={};for(const t of s.stages)for(const op of t.operations)operations[op.op]=(operations[op.op]||0)+1;
   return {id:s.id,stages:s.stages.length,componentInstancesByStage:s.stages.map(t=>t.graph.nodes.length),operations,acceptanceCases:s.acceptanceCases.length,acceptanceEvidence:'authored scenarios; no implementation execution claimed'};
  })};
 });
 const contractTests=runTests(ROOT,['tests/composable-study.test.cjs','tests/composable-priority.test.cjs'],'contract-tests');
 const referenceFiles=fs.readdirSync(path.join(__dirname,'study-reference')).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'tools/simulatte/study-reference/'+n);
 const referenceTests=runTests(ROOT,referenceFiles,'reference-tests');
 const report={schema:'simulatte.composableStudyAudit.v2',implementationStatus:'conceptual designs; running simulation catalogue unchanged',componentCounting:'Includes subsystem boundaries and their internal component identities; excludes edges and notes.',problems:rows,priorityBatch:{status:'converted into the shared v2 contract',problemIds:['L004','L003','L009','L011','L013'],authoringSource:'tools/simulatte/priority-study-source',referenceTests:{...referenceTests,scope:'bounded mechanism reference implementations; not distributed systems or latency qualification'}},checks:{contractTests,browserAppearance:'not checked by this tool',deployment:'not performed by this tool'}};
 const sourcePaths=fs.readdirSync(__dirname).filter(n=>/^(study-|convert-priority-study|build-study-solutions|audit-composable-study).*\.cjs$/.test(n)).map(n=>'tools/simulatte/'+n);
 for(const folder of ['priority-study-source','study-reference'])for(const name of fs.readdirSync(path.join(__dirname,folder)))if(/\.(cjs|mjs)$/.test(name))sourcePaths.push('tools/simulatte/'+folder+'/'+name);
 for(const name of ['composable-study.test.cjs','composable-priority.test.cjs'])sourcePaths.push('tests/'+name);
 report.sourceHashes=sourcePaths.sort().map(name=>({path:name,sha256:hash(fs.readFileSync(path.join(ROOT,name)))}));
 const priorityFlag=process.argv.indexOf('--priority-archive');
 if(priorityFlag>=0){
  if(!process.argv[priorityFlag+1])throw Error('Missing archive directory');
  const archive=fs.realpathSync(process.argv[priorityFlag+1]);
  const names=fs.readdirSync(path.join(archive,'solutions')).filter(n=>n.endsWith('.mjs')).sort();
  const tests=fs.readdirSync(path.join(archive,'reference')).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'reference/'+n);
  report.priorityIntake={status:'historical intake preserved independently of the integrated authoring sources',archive,sourceHashes:names.map(name=>({path:'solutions/'+name,sha256:hash(fs.readFileSync(path.join(archive,'solutions',name)))})),referenceTests:{...runTests(archive,tests,'historical-intake-tests'),scope:'historical intake model tests; not qualification of the converted diagrams'}};
 }
 const consumerFlag=process.argv.indexOf('--consumer');
 if(consumerFlag>=0){
  if(!process.argv[consumerFlag+1])throw Error('Missing consumer path');
  const consumerPath=path.resolve(ROOT,process.argv[consumerFlag+1]),consumer=require(consumerPath);
  for(const r of receipts)consumer.parse(files.get(r.path));
  report.checks.interfaceParser={path:path.relative(ROOT,consumerPath),sha256:hash(fs.readFileSync(consumerPath)),acceptedDocuments:receipts.length,scope:'data parsing only; not browser interaction'};
 }
 const workspaceFlag=process.argv.indexOf('--workspace');
 if(workspaceFlag>=0){
  if(!process.argv[workspaceFlag+1])throw Error('Missing workspace adapter path');
  const modulePath=path.resolve(ROOT,process.argv[workspaceFlag+1]),workspace=require(modulePath);
  for(const r of receipts){
   const p=JSON.parse(files.get(r.path)),original=structuredClone(p),solution=p.solutions[0];
   let state=workspace.create(p,{notes:'Unicode notes: λ\n  keep whitespace\r\n',extension:{preserve:true}});
   const overlay=x=>({patches:{'study:probe':{x,y:43,text:'  edit\nλ'}},removed:[],elements:[],files:{}});
   state=workspace.withOverlay(state,solution.id,solution.stages[0].id,overlay(12),()=>false);
   state=workspace.withOverlay(state,solution.id,solution.stages[1].id,overlay(91),()=>false);
   const restored=workspace.parse(workspace.serialize(state)).workspace;
   assert.deepEqual(restored,state);assert.deepEqual(restored.document,original);assert.deepEqual(p,original);
   assert.equal(workspace.overlayFor(restored,solution.id,solution.stages[0].id).patches['study:probe'].x,12);
   assert.equal(workspace.overlayFor(restored,solution.id,solution.stages[1].id).patches['study:probe'].x,91);
   assert.equal(workspace.overlayFor(restored,p.solutions[1].id,p.solutions[1].stages[0].id),null);
  }
  report.checks.workspaceAdapter={path:path.relative(ROOT,modulePath),sha256:hash(fs.readFileSync(modulePath)),roundTrippedDocuments:receipts.length,scope:'pure data adapter: independent overlays, authored metadata and Unicode notes; not browser gestures or download controls'};
 }
 const out=path.join(ROOT,'artifacts/composable-study/audit.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(sorted(report),null,2)+'\n');console.log(path.relative(ROOT,out));
}
if(require.main===module)main();
