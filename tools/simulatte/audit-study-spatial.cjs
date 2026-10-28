'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Layout=require('../../public/simulatte/system-diagram/study/spatial-layout.js');
const Routing=require('../../public/simulatte/system-diagram/study/spatial-routing.js');
const Check=require('../../public/simulatte/system-diagram/study/spatial-check.js');
const ROOT=path.resolve(__dirname,'../..'),DATA=path.join(ROOT,'public/data/system-diagram/composable-solutions');
async function audit(documents){const rows=[];for(const doc of documents){await Layout.prepare(doc);for(const solution of doc.solutions){for(const [i,stage]of solution.stages.entries()){
 const variants=[[],...stage.graph.nodes.filter(n=>n.subsystemId).map(n=>[n.id])];
 for(const collapsed of variants){const start=performance.now();try{const view=Layout.shapes(doc,solution,stage.graph,{collapsed}),routes=Routing.route(doc,stage.graph,view),result=Check.check(stage.graph,view,routes);rows.push({problem:doc.problem.referenceId,solution:solution.id,stage:i+1,collapsed,...result,geometrySha256:crypto.createHash('sha256').update(JSON.stringify({shapes:[...view.shapes],routes})).digest('hex'),durationMs:Math.round(performance.now()-start)});}catch(e){rows.push({problem:doc.problem.referenceId,solution:solution.id,stage:i+1,collapsed,ok:false,errors:[{kind:'construction',message:e.message}]});}}
}console.log(doc.problem.referenceId,solution.id,rows.filter(r=>!r.ok).length+' failures');}}
 return {schema:'simulatte.studySpatialAudit.v1',layer:'generated geometry, not browser pixels',policySha256:crypto.createHash('sha256').update(JSON.stringify(Layout.policy)).digest('hex'),stageCount:documents.reduce((n,d)=>n+d.solutions.reduce((n,s)=>n+s.stages.length,0),0),variants:rows.length,ok:rows.every(r=>r.ok),rows};}
function inputHashes(){
 const names=['public/data/system-diagram/spatial-policy.json','public/data/system-diagram/study-font-metrics.json',...['spatial-layout.js','spatial-routing.js','spatial-check.js','spatial-text.js','scene.js','vendor/elk/versions.json'].map(n=>'public/simulatte/system-diagram/study/'+n),...fs.readdirSync(DATA).filter(n=>n.endsWith('.json')).map(n=>'public/data/system-diagram/composable-solutions/'+n)];
 return names.sort().map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,name))).digest('hex')}));
}
async function main(){const out=path.join(ROOT,'artifacts/composable-study/spatial-audit.json');
 if(process.argv.includes('--check')){const receipt=JSON.parse(fs.readFileSync(out,'utf8'));if(!receipt.ok||JSON.stringify(receipt.inputHashes)!==JSON.stringify(inputHashes()))throw Error('Spatial proof is stale or failed; run node tools/simulatte/audit-study-spatial.cjs');console.log('Spatial proof is current: '+receipt.stageCount+' stages, '+receipt.variants+' views');return;}
 const manifest=require(path.join(DATA,'manifest.json')),docs=manifest.problems.map(p=>require(path.join(DATA,p.path))),report=await audit(docs);report.inputHashes=inputHashes();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,stages:report.stageCount,variants:report.variants,failed:report.rows.filter(r=>!r.ok).length,out}));if(!report.ok)process.exitCode=1;}

if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={audit,inputHashes};
