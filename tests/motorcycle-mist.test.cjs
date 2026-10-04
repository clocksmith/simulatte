const test=require('node:test'),assert=require('node:assert/strict');
for(const name of ['traffic-motion','city-paths','reflection-model','treatments'])require('../public/simulatte/motorcycle-noise/'+name+'.js');
const M=global.MotorcycleReflection,T=global.MotorcycleTrafficMotion;
const geometry={hits:()=>[],occupied:()=>false};
function traffic(stalls=[]){return [50,35,20].map((offset,i)=>({id:'motorcycle-'+(i+1),kind:'motorcycle',cylinders:2,speed:8,rpm:2400,phase:0,db:110,offset,stalls:i?[]:stalls,route:{segments:[{x:0,y:0,tx:2000,ty:0,ux:1,uy:0,length:2000}],length:2000}}));}
test('fictional stall brakes traffic, silences its engine, preserves the past, and restarts deterministically',()=>{
 const baseline=T.prepare(traffic(),geometry),a=T.prepare(traffic([{start:8,end:16}]),geometry),b=T.prepare(traffic([{start:8,end:16}]),geometry);
 for(let t=0;t<7.9;t+=.1)assert.deepEqual(M.position(a[0],t),M.position(baseline[0],t));
 for(let t=11;t<16;t+=.2){const p=M.position(a[0],t);assert.equal(p.speed,0);assert.equal(p.rpm,0);assert.equal(p.stalled,true);assert.equal(M.pressure(a[0],t),0);assert.equal(M.sourceLevel(a[0],t),-120);}
 assert.ok(M.position(a[0],18).speed>0);assert.ok(M.position(a[0],18).rpm>0);
 for(let t=0;t<25;t+=.1)for(let i=1;i<a.length;i++)assert.ok(M.position(a[i-1],t).x-M.position(a[i],t).x>=3,'following traffic keeps a gap');
 for(let i=0;i<a.length;i++)assert.deepEqual(a[i].motion.states,b[i].motion.states);
});
test('spray admission rejects missing targets, duplicate cycles and the end of the pass',()=>{
 const scene={sources:T.prepare(traffic(),geometry),treatments:[],mistBursts:[]};
 const spray=global.MotorcycleTreatments.planSpray(scene,5,{sourceId:'motorcycle-1'});
 assert.equal(spray.contact,7);assert.equal(spray.restart,17);scene.mistBursts.push(spray);
 assert.throws(()=>global.MotorcycleTreatments.planSpray(scene,6,{sourceId:'motorcycle-1'}),/already/);
 assert.throws(()=>global.MotorcycleTreatments.planSpray(scene,179,{sourceId:'motorcycle-2'}),/Replay/);
 assert.throws(()=>global.MotorcycleTreatments.planSpray(scene,5,{sourceId:'absent'}),/Select/);
});

test('treatment edits validate atomically, preserve traffic, and supply reversible state',()=>{
 const api=global.MotorcycleTreatments,scene={sources:traffic(),acousticContext:geometry,treatments:[],treatmentMode:'untreated',treatmentsEnabled:false};
 const sources=scene.sources;
 assert.throws(()=>api.edit(scene,{action:'add',kind:'mist',point:{x:1,y:2,z:1.7}}),/Enable/);
 assert.deepEqual(scene.treatments,[]);
 const added=api.edit(scene,{action:'add',kind:'directional',point:{x:1,y:2,z:1.7}});
 assert.equal(scene.treatmentsEnabled,true);assert.equal(scene.sources,sources);
 const before=JSON.stringify(scene.treatments);
 assert.throws(()=>api.edit(scene,{action:'frequency',id:added.id,value:1000}),/125, 500, or 2000/);
 assert.equal(JSON.stringify(scene.treatments),before);
 const tuned=api.edit(scene,{action:'frequency',id:added.id,value:2000});assert.equal(scene.treatments[0].frequency,2000);
 Object.assign(scene,tuned.before);assert.equal(scene.treatments[0].frequency,500);
 const removed=api.edit(scene,{action:'remove',id:added.id});assert.equal(scene.treatments.length,0);
 Object.assign(scene,removed.before);assert.equal(scene.treatments[0].id,added.id);
 Object.assign(scene,added.before);assert.equal(scene.treatmentsEnabled,false);assert.equal(scene.treatments.length,0);assert.equal(scene.sources,sources);
 assert.throws(()=>api.edit(scene,{action:'add',kind:'directional',point:{x:NaN,y:2,z:1.7}}),/sidewalk/);
});
