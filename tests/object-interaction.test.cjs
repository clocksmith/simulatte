const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../public/simulatte/app/object-interaction.js');
test('selection uses segment distance rather than only endpoints',()=>{
  assert.equal(api.distanceToObject({x:50,y:3},[{x:0,y:0},{x:100,y:0}]),3);
  assert.equal(api.distanceToObject({x:50,y:3},[null]),Infinity);
});
test('subsea failure and restoration preserve every unrelated accepted control',()=>{
  const contribution={pluginId:'subsea-network-global',controls:{controls:[
    {id:'failedResourceIds',value:['cable-a'],options:[{value:'cable-a'},{value:'landing:port'}]},
    {id:'allocationPolicyId',value:'proportional-fair'},
  ]}};
  const restored=api.actionFor(contribution,'corridor:cable-a');
  assert.deepEqual(restored.values,{failedResourceIds:[],allocationPolicyId:'proportional-fair'});
  const failed=api.actionFor(contribution,'landing:port');
  assert.deepEqual(failed.values.failedResourceIds,['cable-a','landing:port']);
  assert.deepEqual(contribution.controls.controls[0].value,['cable-a']);
});
test('route previews change the model objective without mutating accepted controls',()=>{
  const contribution={pluginId:'sun-walker',controls:{controls:[{id:'directSunWeight',value:5},{id:'walkingSpeedMps',value:1.2}]}};
  assert.deepEqual(api.actionFor(contribution,'sun-walker-actor').values,{directSunWeight:0,walkingSpeedMps:1.2});
  assert.equal(contribution.controls.controls[0].value,5);
});
