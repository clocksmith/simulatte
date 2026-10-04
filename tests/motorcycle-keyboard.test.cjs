const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Enter selects the centered scene target once and disposal removes the keyboard handler',()=>{
 const canvas=new EventTarget();Object.assign(canvas,{style:{},parentElement:{},getBoundingClientRect:()=>({width:800,height:600})});
 const controls=new Map(['map-zoom-in','map-zoom-out'].map(id=>[id,new EventTarget()]));
 const picks=[],taps=[],hit={hit:true,pickedMesh:{metadata:{treatmentId:'one'}}};
 const sandbox={window:{},AbortController,document:{querySelectorAll:()=>[],getElementById:id=>controls.get(id)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/simulatte/motorcycle-noise/map-gestures.js'),'utf8'),sandbox);
 const owner=sandbox.window.MotorcycleMapGestures.create({B:{},scene:{pick:(x,y)=>{picks.push([x,y]);return hit;}},canvas,getCamera:()=>({}),onTap:pick=>taps.push(pick)});
 const enter=repeat=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key:'Enter',repeat});canvas.dispatchEvent(event);};
 enter(false);enter(true);assert.deepEqual(picks,[[400,300]]);assert.deepEqual(taps,[hit]);
 owner.dispose();enter(false);assert.equal(taps.length,1);
});
