'use strict';
importScripts('./signal.js?v=misters-v25','./city-paths.js?v=misters-v25','./traffic-motion.js?v=misters-v25','./reflection-model.js?v=misters-v25','./treatments.js?v=misters-v25','./city-sound.js?v=misters-v25');
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
