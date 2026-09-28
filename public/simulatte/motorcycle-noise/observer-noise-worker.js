'use strict';
importScripts('./signal.js','./city-paths.js?v=mist-camera-v20','./traffic-motion.js?v=mist-camera-v20','./reflection-model.js?v=mist-camera-v20','./treatments.js?v=mist-camera-v20','./city-sound.js?v=mist-camera-v20');
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
