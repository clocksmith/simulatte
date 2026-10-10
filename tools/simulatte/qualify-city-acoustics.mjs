import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const sourceFiles=['signal','traffic-motion','city-paths','reflection-model','acoustic-field','city-sound','treatments'];
globalThis.MotorcycleSignal=require('../../public/simulatte/motorcycle-noise/signal.js');
for(const file of sourceFiles.slice(1))require(`../../public/simulatte/motorcycle-noise/${file}.js`);
const M=globalThis.MotorcycleReflection,S=globalThis.MotorcycleSignal,rate=8000,rows=[];
function scene(distance,wall,speed){
 const source={id:'engine',kind:'car',cylinders:4,rpm:2400,speed,phase:0,db:90};
 if(!speed)source.static={x:0,y:0,z:1};
 else Object.assign(source,{offset:0,route:{length:500,segments:[{x:0,y:0,tx:500,ty:0,ux:1,uy:0,start:0,length:500}]}});
 const receiver={x:distance,y:speed?3:0,z:1};
 return {config:{...M.defaults,background:-120,surface:'none'},sources:[source],receiver,reference:receiver,observers:[],panel:{x:0,y:20,z:1},
  buildings:wall?[{id:'wall',heightM:10,footprint:[{x:-100,y:5},{x:100,y:5},{x:100,y:6},{x:-100,y:6}]}]:[]};
}
for(const distance of [4,10,23])for(const wall of [false,true])for(const start of [2,2.12345]){
 const world=scene(distance,wall,0),wave=globalThis.MotorcycleAcousticField.create(world,start,rate,rate).receive(world.receiver).primary;
 const detailedDb=S.measure(wave,rate).laeq,liveDb=globalThis.MotorcycleCitySound.create(world,start+.5).measure(world.receiver).total;
 rows.push({kind:'stationary',distance,wall,start,detailedDb,liveDb,errorDb:liveDb-detailedDb,acceptanceDb:.3});
 assert.ok(Math.abs(liveDb-detailedDb)<.3);
}
for(const speed of [1,4,12])for(const wall of [false,true]){
 const world=scene(60,wall,speed),start=2,duration=1;
 const wave=globalThis.MotorcycleAcousticField.create(world,start,rate*duration,rate).receive(world.receiver).primary;
 const detailedDb=S.measure(wave,rate).laeq;
 // Compare identical one-second intervals, rather than a midpoint observation
 // against a time-integrated waveform from a moving source.
 const powers=Array.from({length:100},(_,i)=>10**(globalThis.MotorcycleCitySound.create(world,start+(i+.5)/100).measure(world.receiver).total/10));
 const liveIntervalDb=10*Math.log10(powers.reduce((sum,value)=>sum+value,0)/powers.length);
 rows.push({kind:'moving',speed,wall,start,duration,detailedDb,liveIntervalDb,errorDb:liveIntervalDb-detailedDb});
}
const output=path.join(root,'artifacts/motorcycle-acoustic-qualification.json');
const report={schema:'simulatte.cityAcousticQualification.v1',sources:sourceFiles.map(file=>({file:`public/simulatte/motorcycle-noise/${file}.js`,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,`public/simulatte/motorcycle-noise/${file}.js`))).digest('hex')})),rows,
 limits:{stationaryAbsoluteErrorDb:.3},scope:'Synthetic stationary direct/image-source scenes and matched-interval moving sources within the live near-path range. Moving errors are measured diagnostics. No empirical calibration, distant-path bound or guaranteed treatment benefit.'};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:path.relative(root,output),maximumStationaryErrorDb:Math.max(...rows.filter(row=>row.kind==='stationary').map(row=>Math.abs(row.errorDb))),moving:rows.filter(row=>row.kind==='moving')}));
