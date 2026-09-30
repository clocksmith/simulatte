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

test('measurements retain previews, but changed scenarios invalidate pending and completed previews', async () => {
  const previous = global.SimulatteDeclarativeUiHost;
  let callbacks, rendered, release, generation = 1;
  global.SimulatteDeclarativeUiHost = { createObjectInspector(options) {
    callbacks = options;
    return { element: {}, render(value) { rendered = value; }, dispose() {} };
  } };
  const contribution = weight => ({ pluginId: 'sun-walker', state: { scenarioId: 'walk' },
    controls: { controls: [{ id: 'directSunWeight', value: weight }] },
    presentation: { layers: [{ id: 'walker', kind: 'point', label: 'Walker' }] },
    inspections: [{ targetIds: ['walker'], fields: [{ id: 'time', label: 'Time', value: 12 }] }],
  });
  const inspector = api.create({ host: {}, canvas: { addEventListener() {} },
    getSession: () => ({ snapshot: () => ({ generation }), invoke: () => new Promise(resolve => { release = resolve; }) }),
  });
  try {
    inspector.update(contribution(5)); inspector.select('walker');
    const stale = callbacks.onAction('preview');
    inspector.update(contribution(0));
    release(contribution(0));
    await assert.rejects(stale, { name: 'AbortError' });
    const pending = callbacks.onAction('preview');
    release(contribution(5)); await pending;
    inspector.update(contribution(0));
    assert.ok(rendered.fields.some(row => row.id === 'preview-solution'), 'measurement updates keep the comparison');
    generation++;
    inspector.update(contribution(0));
    assert.equal(rendered.fields.some(row => row.id === 'preview-solution'), false, 'replay with identical controls still invalidates a prior preview');
    assert.equal(rendered.selectedId, 'walker');
  } finally { inspector.dispose(); global.SimulatteDeclarativeUiHost = previous; }
});
