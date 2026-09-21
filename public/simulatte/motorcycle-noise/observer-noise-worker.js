'use strict';
importScripts('./signal.js','./city-paths.js?v=city-controls-v7','./traffic-motion.js?v=city-controls-v7','./reflection-model.js?v=city-controls-v7','./treatments.js?v=city-controls-v7','./city-sound.js?v=city-controls-v7');
let scene=null;
self.onmessage=({data})=>{
  if(data.type==='init'){scene=data.scene;return;}
  if(data.type!=='sample'||!scene)return;
  try{
    scene.config=data.config;scene.panel=data.panel;scene.treatments=data.treatments||[];scene.treatmentsEnabled=data.treatmentsEnabled;scene.treatmentMode=data.treatmentMode;
    const sampler=self.MotorcycleCitySound.create(scene,data.time);
    self.postMessage({type:'observer',id:data.id,time:data.time,observer:{point:data.observer,...sampler.measure(data.observer,true)},background:scene.config.background});
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
