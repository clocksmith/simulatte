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

test('tracked sound maps retain sampled geometry while rejecting zoom and subject changes',()=>{
 const contract=require('../public/simulatte/motorcycle-noise/measurement-contract.js');
 const first=contract.focusKey({x:1,y:2,span:100},{mode:'map',trackId:'bike-1'});
 assert.deepEqual(first,contract.focusKey({x:10,y:20,span:100},{mode:'map',trackId:'bike-1'}));
 assert.notDeepEqual(first,contract.focusKey({x:1,y:2,span:200},{mode:'map',trackId:'bike-1'}));
 assert.notDeepEqual(first,contract.focusKey({x:1,y:2,span:100},{mode:'map',trackId:'bike-2'}));
});
