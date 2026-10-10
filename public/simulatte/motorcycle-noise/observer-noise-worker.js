'use strict';
importScripts('./signal.js?v=surfaces-v27','./city-paths.js?v=surfaces-v27','./traffic-motion.js?v=surfaces-v27','./reflection-model.js?v=surfaces-v27','./treatments.js?v=surfaces-v27','./city-sound.js?v=surfaces-v27');
let scene=null;
self.onmessage=({data})=>{
  if(data.type==='init'){scene=data.scene;return;}
  if(data.type!=='sample'||!scene)return;
  try{
    const started=performance.now();
    scene.config=data.config;scene.panel=data.panel;scene.treatments=data.treatments||[];scene.treatmentsEnabled=data.treatmentsEnabled;scene.treatmentMode=data.treatmentMode;
    const sampler=self.MotorcycleCitySound.create(scene,data.time);
    const measurement=sampler.measure(data.observer,true);
    if(data.selectedTreatmentId){
      const selected=scene.treatments.find(row=>row.id===data.selectedTreatmentId);
      if(selected?.kind!=='mist'&&!scene.mistBursts?.length)measurement.matchedComparison=self.MotorcycleCitySound.compareTreatment(scene,data.time,data.observer,data.selectedTreatmentId);
      else measurement.comparisonRefusal='Fictional interactions are excluded from acoustic comparisons.';
    }
    self.postMessage({type:'observer',id:data.id,identity:data.identity,time:data.time,observer:{point:data.observer,...measurement},background:scene.config.background,workerMs:performance.now()-started});
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
