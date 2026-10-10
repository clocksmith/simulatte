const test=require('node:test');
const assert=require('node:assert/strict');
const api=require('../public/simulatte/app/object-interaction.js');
test('live capability comes from action contracts, independently of plugin names and momentary availability',()=>{
  assert.equal(api.supportsLiveActions({pluginId:'new-domain',objects:[{actions:[{execution:'continue',available:false}]}]}),true);
  assert.equal(api.supportsLiveActions({pluginId:'gpu-supercluster',objects:[{actions:[{execution:'restart'}]}]}),false);
  assert.equal(api.supportsLiveActions(null),false);
});
test('selection uses segment distance rather than only endpoints',()=>{
  assert.equal(api.distanceToObject({x:50,y:3},[{x:0,y:0},{x:100,y:0}]),3);
  assert.equal(api.distanceToObject({x:50,y:3},[null]),Infinity);
});
test('only explicitly declared objects are selectable; polygons select their interiors',()=>{
  const layer={id:'region',kind:'area'}, shadow={id:'shadow',kind:'area'};
  const object={id:'region',hit:{shape:'polygon',radiusPx:2,priority:50},actions:[]};
  const contribution={objects:[object],presentation:{layers:[layer,shadow]}};
  assert.deepEqual(api.objectsFor(contribution).map(row=>row.id),['region']);
  const points=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  assert.equal(api.hitObjects({x:50,y:50},[{id:'region',points},{id:'shadow',points}],[object])[0].id,'region');
  assert.equal(api.hitObjects({x:130,y:50},[{id:'region',points}],[object]).length,0);
});
test('rack surface and walker priority beat overlapping explanatory paths without moving the camera',()=>{
  const objects=[{id:'rack',hit:{shape:'bounds',radiusPx:0,priority:90}},{id:'path',hit:{shape:'path',radiusPx:24,priority:20}}];
  const projected=[{id:'rack',points:[{x:50,y:50}],bounds:[{x:30,y:10},{x:70,y:10},{x:70,y:90},{x:30,y:90}]},
    {id:'path',points:[{x:0,y:50},{x:100,y:50}]}];
  assert.equal(api.hitObjects({x:65,y:40},projected,objects)[0].id,'rack');
});
test('host dispatches plugin-declared actions and preserves an identified visual preview',async()=>{
  const previous=global.SimulatteDeclarativeUiHost;let callbacks,rendered,generation=1,release;
  global.SimulatteDeclarativeUiHost={createObjectInspector(options){callbacks=options;return{element:{},render(value){rendered=value;},dispose(){}};}};
  const action={id:'preview',execution:'preview',available:true,command:'domain.preview',values:{weight:2}};
  const contribution={pluginId:'any-plugin',state:{},controls:{controls:[{id:'weight',value:1}]},
    objects:[{id:'walker',label:'Walker',description:'Description',hit:{shape:'point',radiusPx:12,priority:90},actions:[action]}],
    presentation:{layers:[{id:'walker',kind:'actor'}]},inspections:[]};
  const preview={id:'candidate-1',controls:{weight:2},objects:[{id:'alternative',label:'Alternative',description:'Prepared',hit:{shape:'path',radiusPx:8,priority:30},actions:[]}],
    presentation:{layers:[{id:'alternative',kind:'path'}]},inspections:[]};
  const inspector=api.create({host:{},canvas:{addEventListener(){}},getSession:()=>({snapshot:()=>({generation}),invoke:(id,input)=>{
    assert.equal(id,'object-preview');assert.equal(input.targetId,'walker');return new Promise(resolve=>{release=resolve;});}})});
  try{
    inspector.update(contribution);inspector.select('walker');const work=callbacks.onAction('preview');release(preview);await work;
    assert.equal(inspector.preview().id,'candidate-1');assert.equal(rendered.selectedId,'alternative');
    inspector.update(contribution);assert.equal(inspector.preview().id,'candidate-1');
    generation++;inspector.update(contribution);assert.equal(inspector.preview(),null);
  }finally{inspector.dispose();global.SimulatteDeclarativeUiHost=previous;}
});


test('overlapping object surfaces prefer the nearer declared depth',()=>{
  const points=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  const hit={shape:'polygon',radiusPx:0,priority:90};
  const picks=api.hitObjects({x:50,y:50},[{id:'back',points,depth:10},{id:'front',points,depth:2}],[{id:'back',hit},{id:'front',hit}]);
  assert.deepEqual(picks.map(row=>row.id),['front','back']);
});


test('a touch opens the inspector only after its compatibility click; dragging does not select', async()=>{
  const previous=global.SimulatteDeclarativeUiHost,events={},commands=[];
  global.SimulatteDeclarativeUiHost={createObjectInspector(){return{element:{},render(){},dispose(){}};}};
  const object={id:'star',label:'Star',description:'Endpoint',hit:{shape:'point',radiusPx:12,priority:90},actions:[]};
  const canvas={style:{},getBoundingClientRect:()=>({left:0,top:0}),addEventListener:(type,fn)=>events[type]=fn};
  const inspector=api.create({host:{},canvas,getSession:()=>({snapshot:()=>({generation:0}),invoke:async(id,value)=>commands.push([id,value])}),projectObjects:()=>[{id:'star',points:[{x:100,y:100}]}]});
  try{
    inspector.update({pluginId:'fixture',controls:{controls:[]},presentation:{layers:[{id:'star'}]},objects:[object],inspections:[]});
    events.pointerdown({clientX:100,clientY:100});events.pointerup({clientX:100,clientY:100});
    assert.deepEqual(commands,[],'Opening during pointerup can put Close under the following touch click');
    events.click();assert.deepEqual(commands,[['select-object','star']]);
    events.pointerdown({clientX:100,clientY:100});events.pointerup({clientX:130,clientY:100});events.click();
    assert.equal(commands.length,1);
  }finally{inspector.dispose();global.SimulatteDeclarativeUiHost=previous;}
});

test('opening rack action is discoverable before the session exists and closing stays closed',()=>{
 const previous=global.SimulatteDeclarativeUiHost;let rendered;
 global.SimulatteDeclarativeUiHost={createObjectInspector(){return{element:{},render(value){rendered=value;},dispose(){}};}};
 const contribution={pluginId:'gpu-supercluster',controls:{controls:[]},objects:[{id:'rack:a',label:'Rack a',description:'Training',actions:[]}],presentation:{layers:[{id:'rack:a'}]},inspections:[]};
 const inspector=api.create({host:{},canvas:{addEventListener(){}},getSession:()=>null});
 try{inspector.update(contribution);assert.equal(rendered.selectedId,'rack:a');inspector.select(null);inspector.update(contribution);assert.equal(rendered.selectedId,null);}
 finally{inspector.dispose();global.SimulatteDeclarativeUiHost=previous;}
});
