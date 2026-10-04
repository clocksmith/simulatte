'use strict';
importScripts('./signal.js?v=object-inspection-v24','./city-paths.js?v=object-inspection-v24','./traffic-motion.js?v=object-inspection-v24','./reflection-model.js?v=object-inspection-v24','./treatments.js?v=object-inspection-v24','./city-sound.js?v=object-inspection-v24');
let scene=null;
self.onmessage=({data})=>{
  if(data.type==='init'){scene=data.scene;return;}
  if(data.type!=='sample'||!scene)return;
  try{
    const started=performance.now();
    scene.config=data.config;scene.panel=data.panel;scene.treatments=data.treatments||[];scene.treatmentsEnabled=data.treatmentsEnabled;scene.treatmentMode=data.treatmentMode;
    const sampler=self.MotorcycleCitySound.create(scene,data.time);
    const measurement=sampler.measure(data.observer,true);
    self.postMessage({type:'observer',id:data.id,identity:data.identity,time:data.time,observer:{point:data.observer,...measurement},background:scene.config.background,workerMs:performance.now()-started});
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
