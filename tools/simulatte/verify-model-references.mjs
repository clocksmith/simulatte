import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url),root=new URL('../../',import.meta.url);
const load=path=>require(fileURLToPath(new URL(path,root)));
const digest=path=>crypto.createHash('sha256').update(fs.readFileSync(new URL(path,root))).digest('hex');
const near=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected} within ${tolerance}`);

export function verifyReferences(){
  const sourcePaths=['public/shared/plugins/gpu-supercluster/cluster-topology.js','public/shared/plugins/gpu-supercluster/collective-solver.js','public/shared/plugins/gpu-supercluster/thermal-model.js',
    'public/shared/plugins/gpu-supercluster/workload.js','public/shared/plugins/cable-trader/circulation-simulation.js',
    'public/shared/plugins/orbital-transfer-planner/ephemeris.js','public/shared/plugins/orbital-transfer-planner/n-body-verifier.js','public/simulatte/motorcycle-noise/city-sound.js',
    'public/simulatte/motorcycle-noise/acoustic-field.js','public/simulatte/motorcycle-noise/reflection-model.js','public/simulatte/motorcycle-noise/city-paths.js',
    'public/simulatte/motorcycle-noise/signal.js','public/simulatte/motorcycle-noise/traffic-motion.js',
    'public/shared/plugins/cable-trader/default-config.json','public/data/orbital-transfer-planner/gm-constants-de440-v1.json',
    'public/data/orbital-transfer-planner/jpl-horizons-heliocentric-vectors-v1.json'];
  const report={schema:'simulatte.independentReferences.v1',sources:Object.fromEntries(sourcePaths.map(p=>[p,digest(p)])),
    calibration:{datasetId:'none',caseIds:[],fittedParameters:[],status:'No empirical calibration performed'},
    evaluation:{datasetId:'analytical-and-pinned-jpl-evaluation-v1',role:'evaluation-only',cases:[]},
    uncertainty:{kind:'unquantified-model-discrepancy',note:'Numerical convergence is measured separately from empirical prediction uncertainty.'},
    references:[
      'https://www.nist.gov/publications/summary-industrial-verification-validation-and-uncertainty-quantification-procedures',
      'https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md',
      'https://www.mpi-forum.org/docs/mpi-2.1/mpi21-report-bw/node85.htm',
      'https://openstax.org/books/physics/pages/11-2-heat-specific-heat-and-heat-transfer',
      'https://ssd.jpl.nasa.gov/horizons/manual.html',
    ]};
  const cases=report.evaluation.cases;
  const collective=load('public/shared/plugins/gpu-supercluster/collective-solver.js');
  for(const bandwidthGbps of [8,4,2]){
    const topology={gpus:Array.from({length:4},(_,i)=>({id:`g${i}`})),links:Array.from({length:4},(_,i)=>({id:`l${i}`,sourceGpuId:`g${i}`,targetGpuId:`g${(i+1)%4}`,bandwidthGbps,latencySeconds:0}))};
    const result=collective.planCollective({topology,groups:[topology.gpus.map(g=>g.id)],bytes:1000,algorithm:'ring-allreduce'});
    const expectedMs=1500/(bandwidthGbps*1e9/8)*1000;
    near(result.durationMs,expectedMs,1e-12);
    cases.push({id:`network-ring-${bandwidthGbps}`,reference:'six rounds of 250 bytes per directional link',actualMs:result.durationMs,expectedMs,errorMs:result.durationMs-expectedMs});
  }
  const thermal=load('public/shared/plugins/gpu-supercluster/thermal-model.js');
  for(const flow of [60,120,240]){
    const result=thermal.solveThermals({totalGpus:8,racksCount:1,gpuTdpW:100,activeMfuFraction:1,coolantFlowLpm:flow,coolantInletTempC:20});
    const expectedDeltaK=800/(flow/60*4184);
    near(result.coolantDeltaTC,expectedDeltaK,.005);
    cases.push({id:`thermal-flow-${flow}`,reference:'Qdot = mass flow * specific heat * temperature rise',powerW:800,specificHeatJPerKgK:4184,
      flowKgPerSecond:flow/60,actualDeltaK:result.coolantDeltaTC,expectedDeltaK,errorK:result.coolantDeltaTC-expectedDeltaK,
      limit:'Steady water-loop balance; thermal resistance, clock policy and facility efficiency are not calibrated.'});
  }
  const circulation=load('public/shared/plugins/cable-trader/circulation-simulation.js');
  const config=structuredClone(load('public/shared/plugins/cable-trader/default-config.json'));config.simulation.peopleCount=64;
  const network={schema:'simulatte.plugin.cableTraderNetwork.v1',worldId:'independent-ledger',
    hubs:Array.from({length:4},(_,i)=>({id:`h${i}`,nodeId:`n${i}`,position:{x:i*100,y:0}})),
    residences:Array.from({length:64},(_,i)=>({id:`r${i}`,nodeId:`n${i+4}`,position:{x:i*10,y:20},preferredHubId:`h${i%4}`}))};
  const circulationResult=circulation.simulateCirculation(config,network),inventory=new Map();
  for(const hub of network.hubs)for(const cable of config.simulation.selectedCableTypeIds)inventory.set(`${hub.id}:${cable}`,config.simulation.initialInventoryPerHubCable);
  let journeys=0;
  for(const snapshot of circulationResult.snapshots){
    for(const journey of snapshot.journeys){
      const key=`${journey.hubId}:${journey.cableTypeId}`;
      assert.ok(inventory.has(key));inventory.set(key,inventory.get(key)+(journey.action==='dropoff'?1:-1));journeys++;
    }
    for(const hub of snapshot.hubBoards)for(const cable of hub.cables)assert.equal(cable.inventory,inventory.get(`${hub.id}:${cable.id}`));
  }
  cases.push({id:'inventory-365-day-ledger',reference:'Independent inventory reconstructed from individual dropoff/pickup records, not model balance.pass',days:365,journeys,errorItems:0});

  const verifier=load('public/shared/plugins/orbital-transfer-planner/n-body-verifier.js'),gm=load('public/data/orbital-transfer-planner/gm-constants-de440-v1.json');
  const ephemeris=load('public/data/orbital-transfer-planner/jpl-horizons-heliocentric-vectors-v1.json');
  const mu=gm.bodies.sun.gmAuD2,period=2*Math.PI/Math.sqrt(mu),errors=[];
  for(const divisions of [16,32,64]){
    const result=verifier.propagate({initialPositionAu:[1,0,0],initialVelocityAuD:[0,Math.sqrt(mu),0],startDay:0,durationDays:period,
      stepDays:period/divisions,ephemerisDataset:ephemeris,gmData:gm,perturbingBodyIds:[]});
    const errorAu=Math.hypot(result.positionAu[0]-1,result.positionAu[1],result.positionAu[2]);errors.push(errorAu);
    const radius=Math.hypot(...result.positionAu),speed2=result.velocityAuD.reduce((n,v)=>n+v*v,0);
    cases.push({id:`orbital-circle-${divisions}`,reference:'Closed-form circular Kepler orbit after one period',stepDays:period/divisions,errorAu,relativeEnergyError:Math.abs((speed2/2-mu/radius+mu/2)/(mu/2))});
  }
  assert.ok(errors[0]/errors[1]>12&&errors[1]/errors[2]>12);
  const earth=ephemeris.bodies.earth.vectors;
  for(const includeMoon of [false,true])for(const stepDays of [1,.5,.25]){
    const first=earth[0],last=earth[30];
    const result=verifier.propagate({initialPositionAu:first.positionAu,initialVelocityAuD:first.velocityAuD,startDay:first.day,durationDays:last.day-first.day,
      stepDays,ephemerisDataset:ephemeris,gmData:gm,perturbingBodyIds:Object.keys(gm.bodies).filter(k=>!(includeMoon?['sun','earth']:['sun','earth','moon']).includes(k)&&ephemeris.bodies[k])});
    cases.push({id:`jpl-earth-30-day-${includeMoon?"moon":"no-moon"}-${stepDays}`,referenceDataset:ephemeris.id,referenceSha256:digest('public/data/orbital-transfer-planner/jpl-horizons-heliocentric-vectors-v1.json'),
      role:'published-ephemeris-holdout-not-field-observation',includeMoon,stepDays,errorKm:Math.hypot(...result.positionAu.map((v,i)=>v-last.positionAu[i]))*149597870.7,
      acceptance:'Report discrepancy; no field-accuracy threshold or fitted parameter is inferred.'});
  }

  const finiteBodyGm=structuredClone(gm);
  // Heliocentric motion of Earth has central parameter GM_sun + GM_earth.
  // The production spacecraft verifier remains massless. This comparison
  // supplies the published finite-body term, not a fitted correction.
  finiteBodyGm.bodies.sun.gmAuD2+=gm.bodies.earth.gmAuD2;
  for(const stepDays of [1,.5,.25]){
    const first=earth[0],last=earth[30];
    const result=verifier.propagate({initialPositionAu:first.positionAu,initialVelocityAuD:first.velocityAuD,startDay:first.day,durationDays:last.day-first.day,
      stepDays,ephemerisDataset:ephemeris,gmData:finiteBodyGm,perturbingBodyIds:Object.keys(gm.bodies).filter(k=>!['sun','earth'].includes(k)&&ephemeris.bodies[k])});
    cases.push({id:`jpl-earth-finite-mass-30-day-${stepDays}`,referenceDataset:ephemeris.id,role:'published-ephemeris-evaluation',
      centralParameter:'GM_sun + GM_earth',interpolation:'cubic_hermite_state_vector_v1',stepDays,
      errorKm:Math.hypot(...result.positionAu.map((v,i)=>v-last.positionAu[i]))*149597870.7,
      acceptance:'Reported Newtonian model discrepancy, not flight-path certification or an empirical uncertainty interval.'});
  }

  globalThis.MotorcycleSignal=load('public/simulatte/motorcycle-noise/signal.js');
  for(const file of ['traffic-motion','city-paths','reflection-model','acoustic-field','city-sound'])load(`public/simulatte/motorcycle-noise/${file}.js`);
  const M=globalThis.MotorcycleReflection,S=globalThis.MotorcycleSignal;
  for(const distance of [4,10,23])for(const reflected of [false,true]){
    const receiver={x:distance,y:0,z:1},scene={config:{...M.defaults,background:-120,surface:'none'},sources:[{id:'engine',kind:'car',cylinders:4,rpm:2400,speed:0,phase:0,db:90,static:{x:0,y:0,z:1}}],
      receiver,reference:receiver,observers:[],panel:{x:0,y:20,z:1},buildings:reflected?[{id:'wall',heightM:10,footprint:[{x:-100,y:5},{x:100,y:5},{x:100,y:6},{x:-100,y:6}]}]:[]};
    const wave=globalThis.MotorcycleAcousticField.create(scene,2,8000,8000).receive(receiver).primary;
    const detailed=S.measure(wave,8000).laeq,live=globalThis.MotorcycleCitySound.create(scene,2.5).measure(receiver).total;
    near(live,detailed,.3);
    cases.push({id:`acoustic-${distance}-${reflected?'wall':'direct'}`,role:'cross-model-agreement-not-physical-validation',liveDbA:live,detailedDbA:detailed,errorDb:live-detailed});
  }
  for(const speed of [3,9,18])for(const reflected of [false,true]){
    const receiver={x:60,y:3,z:1};
    const source={id:'moving-engine',kind:'car',cylinders:4,rpm:2400,speed,offset:0,phase:0,db:90,
      route:{length:500,segments:[{x:0,y:0,tx:500,ty:0,ux:1,uy:0,start:0,length:500}]}};
    const scene={config:{...M.defaults,background:-120,surface:'none'},sources:[source],receiver,reference:receiver,observers:[],panel:{x:0,y:20,z:1},
      buildings:reflected?[{id:'wall',heightM:10,footprint:[{x:-100,y:5},{x:100,y:5},{x:100,y:6},{x:-100,y:6}]}]:[]};
    const detailed=S.measure(globalThis.MotorcycleAcousticField.create(scene,2,8000,8000).receive(receiver).primary,8000).laeq;
    // Compare equal one-second energy windows, not an instantaneous dB sample
    // against a moving waveform's integrated exposure.
    const livePower=Array.from({length:100},(_,i)=>10**(globalThis.MotorcycleCitySound.create(scene,2+(i+.5)/100).measure(receiver).total/10));
    const live=10*Math.log10(livePower.reduce((sum,p)=>sum+p,0)/livePower.length);
    assert.ok(Number.isFinite(live)&&Number.isFinite(detailed));
    cases.push({id:`acoustic-moving-${speed}-${reflected?'wall':'direct'}`,speedMps:speed,windowSeconds:[2,3],
      role:'cross-model-discrepancy-not-physical-validation',liveDbA:live,detailedDbA:detailed,errorDb:live-detailed,
      limitation:'Live spectra are locally stationary; the detailed solver includes retarded moving emission and filter history. No moving-source accuracy threshold is asserted.'});
  }
  report.pass=true;return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const result=verifyReferences();
  fs.writeFileSync(new URL('../../artifacts/model-accuracy/references.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({pass:result.pass,cases:result.evaluation.cases.length}));
}
