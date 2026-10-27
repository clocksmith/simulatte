'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const C=require('../../../public/simulatte/system-diagram/deployment/compiler.js'),{dependencies,main}=require('../cli.cjs');
const deps=dependencies(),registry=require('../../../public/simulatte/system-diagram/deployment/registry.json');
const diagram=require('../../../public/data/system-diagram/examples/amazon-flash-sale.json');
function settings(doc=diagram){const result=structuredClone(require('../../../public/simulatte/system-diagram/deployment/configuration.template.json')),plan=C.inspect({diagram:doc,...deps,registry});result.images={application:'registry.example/lucyd-inventory@sha256:'+'a'.repeat(64),postgres:'registry.example/postgres@sha256:'+'b'.repeat(64)};result.bindings=Object.fromEntries(plan.nodes.map(n=>[n.bindingKey,n.implementations[0]]));return result;}
test('nested inventory is compiled read-only with explicit bindings and no simulated-resource conversion',async()=>{
 const before=JSON.stringify(diagram),config=settings(),bundle=await C.compile({diagram,...deps,registry,settings:config,selection:{problemId:'amazon-flash-sale',solutionId:'reference',stageId:'complete'}});
 assert.equal(JSON.stringify(diagram),before);assert.equal(bundle.qualification.cloudDeployed,false);assert.equal(bundle.qualification.simulationCalibrated,false);
 assert.equal(bundle.bindingPlan.length,5);assert.ok(bundle.bindingPlan.some(n=>n.bindingKey==='subsystem-1/inventory'));
 const api=bundle.objects.find(o=>o.kind==='Deployment'&&o.metadata.name.endsWith('-api'));assert.deepEqual(api.spec.template.spec.containers[0].resources,config.resources.api);assert.equal(api.spec.replicas,config.replicas.api);
 assert.ok(bundle.objects.some(o=>o.kind==='StatefulSet'&&o.spec.volumeClaimTemplates.length===1));assert.ok(!bundle.objects.some(o=>o.kind==='Secret'||o.kind==='Ingress'));
 assert.ok(!JSON.stringify(bundle.objects).includes('serviceMs'));assert.equal(bundle.source.sha256,await C.sha(diagram));
 const again=await C.compile({diagram,...deps,registry,settings:config,selection:bundle.selection});assert.deepEqual(again,bundle);
});
test('unsupported topology, mismatched registry, mutable images and secret values refuse before export',async()=>{
 const bad=structuredClone(diagram);bad.nodes.push({...structuredClone(bad.nodes[0]),id:'unsupported-db',classId:'database',params:{}});assert.throws(()=>C.inspect({diagram:bad,...deps,registry:{...registry,libraryVersion:'wrong'}}),/registry/);
 const unbound=C.inspect({diagram:bad,...deps,registry});assert.equal(unbound.supported,false);assert.ok(unbound.unsupported.length);
 const missing=settings();delete missing.bindings[Object.keys(missing.bindings)[0]];await assert.rejects(C.compile({diagram,...deps,registry,settings:missing}),/choose a declared implementation/);
 const mutable=settings();mutable.images.application='registry.example/app:latest';await assert.rejects(C.compile({diagram,...deps,registry,settings:mutable}),/immutable/);
 const secret=settings();secret.apiTokenSecret.value='not-a-reference';await assert.rejects(C.compile({diagram,...deps,registry,settings:secret}),/unsupported configuration field/);
 const unknown=settings();unknown.resources.api.requests.cpu='inferred';await assert.rejects(C.compile({diagram,...deps,registry,settings:unknown}),/explicit millicore/);
});
test('CLI inspect produces an immutable source-bound plan and refuses output reuse',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'lucyd-deploy-test-')),out=path.join(parent,'plan');try{const input=path.join(parent,'diagram.json');fs.writeFileSync(input,JSON.stringify(diagram));const result=await main(['inspect','--input',input,'--out',out]);assert.equal(result.supported,true);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'plan.json'))).sourceSha256,await C.sha(diagram));await assert.rejects(main(['inspect','--input',input,'--out',out]),/already exists/);}finally{fs.rmSync(parent,{recursive:true});}
});

test('changed public contracts and unresolved authoring concepts refuse rather than invent an implementation',async()=>{
 await assert.rejects(C.verifySources(registry,async()=>new TextEncoder().encode('different source')),/source contract changed/);
 let called=false;assert.throws(()=>C.inspect({diagram,...deps,registry,documentApi:{...deps.documentApi,executable(){called=true;throw Error('Unrefined responsibility: choose an executable binding');}}}),/Unrefined responsibility/);assert.equal(called,true);
});
