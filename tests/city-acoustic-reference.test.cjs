const test = require('node:test');
const assert = require('node:assert/strict');
global.MotorcycleSignal = require('../public/simulatte/motorcycle-noise/signal.js');
for (const file of ['traffic-motion','city-paths','reflection-model','acoustic-field','city-sound']) require(`../public/simulatte/motorcycle-noise/${file}.js`);
const M = global.MotorcycleReflection, S = global.MotorcycleSignal;
const control = require('../public/simulatte/motorcycle-noise/control.js');
const near = (a,b,e=1e-8) => assert.ok(Math.abs(a-b)<e, `${a} differs from ${b}`);
function fixture(distance=10, wall=false) {
  const source={id:'engine',kind:'car',cylinders:4,rpm:2400,speed:0,phase:0,db:90,static:{x:0,y:0,z:1}};
  const receiver={x:distance,y:0,z:1};
  return {config:{...M.defaults,background:-120,surface:'none'}, sources:[source],receiver,reference:receiver,observers:[],panel:{x:0,y:20,z:1},
    buildings:wall?[{id:'wall',heightM:10,footprint:[{x:-100,y:5},{x:100,y:5},{x:100,y:6},{x:-100,y:6}]}]:[]};
}
test('current city paths obey independent travel-time and image-source geometry',()=>{
  const scene=fixture(10,true), paths=M.fieldPaths(scene.sources[0],scene.receiver,1,scene);
  const direct=paths.find(p=>p.kind==='direct'), reflection=paths.find(p=>p.kind==='facade-reflection');
  near(direct.length,10);near(1-direct.emissionTime,10/M.soundSpeed(scene.config));
  near(reflection.length,Math.sqrt(200));near(reflection.bounce.x,5);near(reflection.bounce.y,5);
  near(reflection.gain,.55/Math.sqrt(200));
});
test('live estimate and detailed waveform agree over stationary direct and reflected evaluation cases',()=>{
  for (const distance of [4,10,23]) for (const wall of [false,true]) for(const start of [2,2.12345]) {
    const scene=fixture(distance,wall), rate=8000;
    const waveform=global.MotorcycleAcousticField.create(scene,start,rate,rate).receive(scene.receiver).primary;
    const detailed=S.measure(waveform,rate).laeq;
    const live=global.MotorcycleCitySound.create(scene,start+.5).measure(scene.receiver).total;
    near(live,detailed,.3);
  }
});
test('current city waveform converges as moving-source geometry steps shrink',()=>{
 const scene=fixture(60),source=scene.sources[0];delete source.static;
 Object.assign(source,{speed:12,offset:0,route:{length:500,segments:[{x:0,y:0,tx:500,ty:0,ux:1,uy:0,start:0,length:500}]}});
 scene.receiver.y=3;
 const waves=[320,160,80,40,20].map(geometryStepSamples=>global.MotorcycleAcousticField.create(scene,2,8000,8000,{geometryStepSamples}).receive(scene.receiver).primary);
 const errors=waves.slice(0,-1).map(w=>Math.sqrt(S.energy(Float64Array.from(w,(v,i)=>v-waves[4][i]))/S.energy(waves[4])));
 assert.ok(errors.every((e,i)=>i===0||e<errors[i-1]/3));assert.ok(errors.at(-1)<.00001);
 const c=M.soundSpeed(scene.config),time=2,path=M.fieldPaths(source,{x:60,y:0,z:.7},time,scene)[0];
 near(path.emissionTime,(time-60/c)/(1-12/c),1e-6);
});
test('causal controller learns an unknown cancelling filter from delayed broadband observations',()=>{
  let seed=17;const wave=Float64Array.from({length:16000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed/2**32-.5)*.2;});
  const incident=Float64Array.from(wave,(_,i)=>i>=12?.7*wave[i-12]:0);
  const p={seed:19,sampleRate:8000,sensorNoisePa:0,sensorClipPa:8,latencyMs:0,controllerTaps:32,speakerLimitPa:2,controllerStep:.1};
  const result=control.causal(wave,incident,[{delay:2,gain:.5}],p);
  assert.ok(result.command.slice(0,12).every(x=>x===0));
  assert.ok(S.energy(result.residual.slice(-4000))/S.energy(incident.slice(-4000))<1e-5);
  // The incident is independently constructed; no opposing pressure is supplied.
  assert.ok(result.command.some(x=>x!==0));assert.equal(result.clipped,0);
});
module.exports={fixture};
test('facade identity survives input ordering and missing heights never become fabricated barriers',()=>{
 const a={id:'a',heightM:1,footprint:[{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}]},b={...a,id:'b',heightM:null};
 const first=global.MotorcycleCityPaths.create([a,b]),second=global.MotorcycleCityPaths.create([b,a]);
 assert.deepEqual(first.walls.map(w=>w.id),second.walls.map(w=>w.id));
 assert.deepEqual(first.coverage.missingHeightIds,['b']);
 assert.equal(first.hits({x:-1,y:2,z:2},{x:5,y:2,z:2}).length,0);
 assert.throws(()=>global.MotorcycleCityPaths.create([a,a]),/identity/);
});
