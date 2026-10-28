'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {library,sorted}=require('./study-solution-author.cjs');
const {validateProblem}=require('./study-contract.cjs');
const {schema}=require('./study-schema.cjs');
const ROOT=path.resolve(__dirname,'../..');
const OUTPUT=path.join(ROOT,'public/data/system-diagram/composable-solutions');
const authors=['client-state','routing','platform','delivery','priority','notifications'];
function build(){
 const problems=authors.flatMap(name=>Object.values(require('./study-content-'+name+'.cjs')).map(fn=>fn()));
 const canonical=JSON.parse(fs.readFileSync(path.join(ROOT,'public/data/system-diagram/problems.json'),'utf8'));
 const originals=new Map(canonical.problems.map(p=>[p.referenceId,p]));
 const files=new Map(),receipts=[];
 const seen=new Set();
 const add=(name,value)=>{const bytes=JSON.stringify(sorted(value),null,2)+'\n';files.set(name,bytes);return crypto.createHash('sha256').update(bytes).digest('hex');};
 const componentHash=add('components.json',library),schemaHash=add('problem.schema.json',schema);
 for(const p of problems){
  if(seen.has(p.problem.referenceId))throw Error('Duplicate study problem '+p.problem.referenceId);seen.add(p.problem.referenceId);
  if(!originals.has(p.problem.referenceId))throw Error('Unregistered Lucyd problem '+p.problem.referenceId);
  const receipt=validateProblem(p,library),filename=p.problem.referenceId.toLowerCase()+'.json';
  const source=originals.get(p.problem.referenceId);
  receipts.push({...receipt,problemId:source.id,path:filename,sha256:add(filename,p)});
 }
 add('manifest.json',{schema:'simulatte.studyCatalogue.v1',version:1,executionKind:'conceptual-design',componentLibrary:{path:'components.json',sha256:componentHash},problemSchema:{path:'problem.schema.json',sha256:schemaHash},problems:receipts.sort((a,b)=>a.referenceId.localeCompare(b.referenceId))});
 return {files,receipts};
}
function main(){
 const check=process.argv.includes('--check'),{files,receipts}=build();
 if(!check)fs.mkdirSync(OUTPUT,{recursive:true});
 for(const [name,bytes]of files){const file=path.join(OUTPUT,name);if(check){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==bytes)throw Error('Generated study artifact is stale: '+file);}else fs.writeFileSync(file,bytes);}
 console.log(JSON.stringify({mode:check?'verified':'generated',problems:receipts.length,solutions:receipts.reduce((n,r)=>n+r.solutions,0),stages:receipts.reduce((n,r)=>n+r.stages,0),directory:path.relative(ROOT,OUTPUT)}));
}
if(require.main===module)main();
module.exports={build,OUTPUT};
