'use strict';
importScripts('./signal.js','./city-paths.js?v=mobile-audio-v1','./traffic-motion.js?v=mobile-audio-v1','./reflection-model.js?v=mobile-audio-v1','./treatments.js?v=mobile-audio-v1','./city-sound.js?v=mobile-audio-v1');
let scene=null;
self.onmessage=({data})=>{
  if(data.type==='init'){scene=data.scene;return;}
  if(data.type!=='sample'||!scene)return;
  try{
    scene.config=data.config;scene.panel=data.panel;scene.treatments=data.treatments||[];scene.treatmentsEnabled=data.treatmentsEnabled;
    const sampler=self.MotorcycleCitySound.create(scene,data.time);
    self.postMessage({type:'observer',id:data.id,time:data.time,observer:{point:data.observer,...sampler.measure(data.observer,true)},background:scene.config.background});
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
