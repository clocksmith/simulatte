'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {build,OUTPUT}=require('./build-study-solutions.cjs');
const {sorted}=require('./study-solution-author.cjs');
const ROOT=path.resolve(__dirname,'../..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function runTests(cwd,files){
 const result=spawnSync(process.execPath,['--test',...files],{cwd,encoding:'utf8',timeout:30000});
 if(result.error||result.status!==0)throw Error('Focused tests failed: '+(result.error||result.stderr||result.stdout));
 const count=name=>{const value=result.stdout.match(new RegExp('^# '+name+' (\\d+)$','m'));if(!value)throw Error('Missing TAP '+name+' receipt');return Number(value[1]);};
 return {tests:count('tests'),passed:count('pass'),failed:count('fail'),outputSha256:hash(result.stdout),command:['node','--test',...files].join(' ')};
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
 const contractTests=runTests(ROOT,['tests/composable-study.test.cjs']);
 const report={schema:'simulatte.composableStudyAudit.v1',implementationStatus:'conceptual designs; running simulation catalogue unchanged',componentCounting:'Includes subsystem boundaries and their internal component identities; excludes edges and notes.',secondBatch:rows,checks:{contractTests,browserAppearance:'not checked by this tool',deployment:'not performed by this tool'}};
 const priorityFlag=process.argv.indexOf('--priority-archive');
 if(priorityFlag>=0){
  if(!process.argv[priorityFlag+1])throw Error('Missing archive directory');
  const archive=fs.realpathSync(process.argv[priorityFlag+1]);
  const names=fs.readdirSync(path.join(archive,'solutions')).filter(n=>n.endsWith('.mjs')).sort();
  const tests=fs.readdirSync(path.join(archive,'reference')).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'reference/'+n);
  report.priorityBatch={status:'preserved; conversion to the shared contract pending',archive,sourceHashes:names.map(name=>({path:'solutions/'+name,sha256:hash(fs.readFileSync(path.join(archive,'solutions',name)))})),referenceTests:{...runTests(archive,tests),scope:'small mechanism reference implementations; not distributed systems qualification'}};
 }
 const consumerFlag=process.argv.indexOf('--consumer');
 if(consumerFlag>=0){
  if(!process.argv[consumerFlag+1])throw Error('Missing consumer path');
  const consumerPath=path.resolve(ROOT,process.argv[consumerFlag+1]),consumer=require(consumerPath);
  for(const r of receipts)consumer.parse(files.get(r.path));
  report.checks.interfaceParser={path:path.relative(ROOT,consumerPath),sha256:hash(fs.readFileSync(consumerPath)),acceptedDocuments:receipts.length,scope:'data parsing only; not browser interaction'};
 }
 const out=path.join(ROOT,'artifacts/composable-study/audit.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(sorted(report),null,2)+'\n');console.log(path.relative(ROOT,out));
}
if(require.main===module)main();
