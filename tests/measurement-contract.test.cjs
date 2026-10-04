const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/simulatte/motorcycle-noise/measurement-contract.js');
test('measurement publication requires scenario, observer, configuration and sample time identity',()=>{
 const point={x:1,y:2,z:3},config={surface:'none'},expected=M.capture(2,3,4,point,config);
 assert.equal(M.accepts({...expected},expected,point,config),true);
 for(const field of ['scenarioId','requestId','time','observationKey','configurationKey'])assert.equal(M.accepts({...expected,[field]:'stale'},expected,point,config),false);
 assert.equal(M.accepts(expected,expected,{...point,x:4},config),false);
 assert.equal(M.accepts(expected,expected,point,{surface:'retro'}),false);
 assert.throws(()=>M.capture(1,2,NaN,point,config));assert.throws(()=>M.capture(1,2,3,{x:Infinity},config));
});
test('a moving tracked microphone retains identity until its subject or mode changes',()=>{
 const first={mode:'rider',trackId:'m1',x:0,y:0,z:1},config={};
 const expected=M.capture(1,1,2,M.observerKey(first),config);
 assert.equal(M.accepts(expected,expected,M.observerKey({...first,x:10}),config),true);
 assert.equal(M.accepts(expected,expected,M.observerKey({...first,trackId:'m2'}),config),false);
 assert.equal(M.accepts(expected,expected,M.observerKey({...first,mode:'map'}),config),false);
});
test('displayed measurements distinguish matching values from changed observer and treatment drafts',()=>{
 const point={x:1,y:2,z:3},config=[{background:40},[{id:'column',enabled:true}]];
 const identity=M.capture(1,1,2,point,config);
 assert.equal(M.matches(identity,{...point},structuredClone(config)),true);
 assert.equal(M.matches(identity,{...point,x:5},config),false);
 config[1][0].enabled=false;
 assert.equal(M.matches(identity,point,config),false);
 assert.equal(M.matches(null,point,config),false);
});

test('tracked sound maps retain sampled geometry while rejecting zoom and subject changes',()=>{
 const contract=require('../public/simulatte/motorcycle-noise/measurement-contract.js');
 const first=contract.focusKey({x:1,y:2,span:100},{mode:'map',trackId:'bike-1'});
 assert.deepEqual(first,contract.focusKey({x:10,y:20,span:100},{mode:'map',trackId:'bike-1'}));
 assert.notDeepEqual(first,contract.focusKey({x:1,y:2,span:200},{mode:'map',trackId:'bike-1'}));
 assert.notDeepEqual(first,contract.focusKey({x:1,y:2,span:100},{mode:'map',trackId:'bike-2'}));
});

test('sound history uses simulation timestamps and breaks at observer, configuration, or scenario boundaries',()=>{
 const sample=(time,observation={x:1,y:2,z:1.7},config={speaker:false},scenario=1)=>({time,identity:M.capture(scenario,Math.floor(time*10)+1,time,observation,config),observer:{total:60,point:observation}});
 let rows=M.appendHistory([],sample(1));rows=M.appendHistory(rows,sample(3));
 assert.deepEqual(rows.map(r=>[r.time,r.breakBefore]),[[1,true],[3,false]]);
 assert.equal(M.appendHistory(rows,sample(3)).length,2,'Repeated paused samples do not invent duration');
 rows=M.appendHistory(rows,sample(4,{x:20,y:2,z:1.7}));assert.equal(rows.at(-1).breakBefore,true);
 rows=M.appendHistory(rows,sample(5,{x:20,y:2,z:1.7},{speaker:true}));assert.equal(rows.at(-1).breakBefore,true);
 rows=M.appendHistory(rows,sample(6,{x:20,y:2,z:1.7},{speaker:true},2));assert.equal(rows.at(-1).breakBefore,true);
 assert.equal(M.appendHistory(rows,sample(0)).length,1,'Seek/replay does not connect to the preceding pass');
});

test('received sound descriptors bind position, height, units and instantaneous simulation time',()=>{
 const rows=M.describe({time:7.25,background:20,observer:{total:63,traffic:62.99,point:{x:10,y:20,z:1.7,mode:'sidewalk'}}});
 assert.deepEqual(rows.map(row=>row.value),[63,62.99,20]);
 for(const row of rows){
  assert.equal(row.unit,'dBA');assert.equal(row.measurement.timeBasis,'instant');
  assert.deepEqual(row.measurement.interval,{start:7.25,end:7.25,unit:'seconds'});
  assert.match(row.measurement.subject,/1.7 m high/);assert.match(row.measurement.definition,/does not measure accumulated exposure/);
 }
});
