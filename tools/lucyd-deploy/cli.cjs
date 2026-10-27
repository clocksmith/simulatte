#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),compiler=require(path.join(root,'public/simulatte/system-diagram/deployment/compiler.js'));
function dependencies(){return {documentApi:require(path.join(root,'public/simulatte/system-diagram/diagram.js')),library:require(path.join(root,'public/simulatte/system-diagram/class-library.js')).loadSync(path.join(root,'public/data/system-diagram')),config:require(path.join(root,'public/data/system-diagram/config.json'))};}
async function main(argv=process.argv.slice(2)){
 const [command,...rest]=argv;if(!['inspect','compile'].includes(command))throw Error('Usage: node cli.cjs inspect|compile --input diagram-or-collection.json [--problem id --solution id --stage id] [--config deployment.json] --out NEW_DIRECTORY');
 const args={};for(let i=0;i<rest.length;i+=2){if(!['--input','--problem','--solution','--stage','--config','--out'].includes(rest[i])||!rest[i+1])throw Error('Unsupported or incomplete argument');args[rest[i].slice(2)]=rest[i+1];}if(!args.input||!args.out)throw Error('--input and --out are required');
 const inputPath=path.resolve(args.input),output=path.resolve(args.out);if(fs.existsSync(output))throw Error('Output already exists; choose a new directory to preserve prior artifacts');
 require('./sync-registry.cjs').update({check:true});
 const deps=dependencies(),input=JSON.parse(fs.readFileSync(inputPath)),selection=args.problem?{problemId:args.problem,solutionId:args.solution,stageId:args.stage}:null;
 const problemApi=input.schema==='simulatte.lucydProblems.v2'?require(path.join(root,'public/simulatte/system-diagram/problem-model.js')):null;
 const diagram=compiler.selectDiagram(input,selection,problemApi,deps.library,deps.config),registry=require(path.join(root,'public/simulatte/system-diagram/deployment/registry.json'));
 const options={diagram,...deps,registry,selection};let result;
 if(command==='inspect'){const plan=compiler.inspect(options);result={schema:plan.schema,supported:plan.supported,unsupported:plan.unsupported,nodes:plan.nodes.map(({nodeId,bindingKey,kernel,implementations})=>({nodeId,bindingKey,kernel,implementations})),sourceSha256:await compiler.sha(plan.diagram),registrySha256:await compiler.sha(registry),requiredConfigSchema:compiler.SCHEMA,assumptions:plan.assumptions};}
 else{if(!args.config)throw Error('Compilation requires --config with explicit images, resources, secrets and bindings');options.settings=JSON.parse(fs.readFileSync(args.config));result=await compiler.compile(options);}
 // Write only after every validation succeeds; a failed compile creates no partial bundle.
 fs.mkdirSync(output,{recursive:false,mode:0o700});fs.writeFileSync(path.join(output,command==='inspect'?'plan.json':'bundle.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 if(command==='compile')fs.writeFileSync(path.join(output,'kubernetes.json'),JSON.stringify({apiVersion:'v1',kind:'List',items:result.objects},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({command,output,supported:result.supported,sourceSha256:result.sourceSha256||result.source.sha256,cloudDeployed:false}));return result;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});module.exports={main,dependencies};
