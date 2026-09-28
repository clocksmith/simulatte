'use strict';
importScripts('./city-paths.js?v=mist-camera-v20','./traffic-motion.js?v=mist-camera-v20','./reflection-model.js?v=mist-camera-v20');
self.onmessage=({data})=>{
  try {
    const scene=self.MotorcycleReflection.create(data.map,data.config,data.mistBursts||[]);
    self.postMessage({scene},scene.sources.map(source=>source.motion.states.buffer));
  } catch(error) { self.postMessage({error:error.message}); }
};
