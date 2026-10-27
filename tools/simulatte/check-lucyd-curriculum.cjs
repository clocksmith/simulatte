#!/usr/bin/env node
'use strict';
// Owning contracts: Lucyd CATSCAN and study-contract.js. Never writes private content.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'public/data/system-diagram'),read=name=>JSON.parse(fs.readFileSync(path.join(base,name)));
const C=read('config.json'),D=require('../../public/simulatte/system-diagram/diagram.js'),P=require('../../public/simulatte/system-diagram/problem-model.js'),Study=require('../../public/simulatte/system-diagram/study-contract.js'),L=require('../../public/simulatte/system-diagram/class-library.js').loadSync(base),E=require('../../public/simulatte/system-diagram/engine.js'),K=require('../../public/simulatte/system-diagram/kernels-all.js'),Crypto=require('../../public/simulatte/system-diagram/private-crypto.js');
const deps={library:L,config:C,kernels:K},hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function check({privatePassword=process.env.LUCYD_PASSWORD,coordinator=false,coordinatorFinals=false}={}){
 const report={schema:'simulatte.lucydCurriculumCheck.v1',publicHash:hash(fs.readFileSync(path.join(base,'problems.json'))),privateCiphertextHash:hash(fs.readFileSync(path.join(base,'private-collection.enc.json'))),layers:'Authoring and deterministic synthetic execution; not human comprehension or production qualification',coordinatorScope:coordinator?'all-stages':coordinatorFinals?'final-architecture-per-approach':'not-run',cases:[],failures:[]};
 const collections=[['public',read('problems.json')]];let session;
 try{if(privatePassword){session=await Crypto.unlock(read('private-collection.enc.json'),privatePassword);collections.push(['private',session.value]);}
  for(const [scope,raw]of collections){const data=P.validateCollection(raw,L,C),summary={scope,problems:data.problems.length,approaches:0,stages:0,design:0,preludes:0,executed:0,checks:0,checkpointContinuations:0,coordinatorReplays:0};report.cases.push(summary);
   for(const [problemIndex,p]of data.problems.entries())for(const [solutionIndex,s]of p.solutions.entries()){summary.approaches++;if(s.prelude)summary.preludes++;for(const [stageIndex,stage]of s.stages.entries()){summary.stages++;if(stage.kind==='design'){summary.design++;continue;}
    try{const compiled=D.compile(stage.diagram,L,C),a=E.initialize(compiled,deps),b=E.initialize(compiled,deps);E.advance(compiled,a,compiled.horizonSec,deps);E.advance(compiled,b,compiled.horizonSec/2,deps);const continuation=JSON.parse(JSON.stringify(b));E.advance(compiled,continuation,compiled.horizonSec,deps);const view=E.observe(compiled,a,deps);if(view.error)throw Error('Engine error');if(JSON.stringify(a)!==JSON.stringify(continuation))throw Error('Checkpoint continuation mismatch');summary.checkpointContinuations++;
     for(const expected of stage.checks){const result=Study.evaluate(expected,view);if(result.status!=='passed')throw Error('Authored observation failed: '+expected.label);}summary.checks+=stage.checks.length;
     if(coordinator||(coordinatorFinals&&stageIndex===s.stages.length-1)){const runner=await require('../../public/simulatte/system-diagram/runner.js').create({diagram:stage.diagram,...deps});try{runner.advanceTo(runner.horizon);if((await runner.verify()).status!=='match')throw Error('Coordinator replay mismatch');summary.coordinatorReplays++;}finally{await runner.dispose();}}
     summary.executed++;
    }catch(error){report.failures.push({scope,problemIndex,solutionIndex,stageIndex,...(scope==='public'?{problemId:p.id,solutionId:s.id,stageId:stage.id,error:error.message}:{error:'Private stage verification failed; inspect locally without publishing contents'})});}
   }}
  }
 }finally{session?.lock();}
 return report;
}
if(require.main===module){check({coordinator:process.argv.includes('--coordinator'),coordinatorFinals:process.argv.includes('--replay-finals')}).then(report=>{const flag=process.argv.indexOf('--output');if(flag>=0){const target=path.resolve(process.argv[flag+1]);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={check};
