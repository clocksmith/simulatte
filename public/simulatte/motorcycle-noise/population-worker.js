'use strict';
importScripts('./city-paths.js?v=mobile-audio-v1','./traffic-motion.js?v=mobile-audio-v1','./reflection-model.js?v=mobile-audio-v1');
self.onmessage=({data})=>{
  try {
    const scene=self.MotorcycleReflection.create(data.map,data.config);
    self.postMessage({scene},scene.sources.map(source=>source.motion.states.buffer));
  } catch(error) { self.postMessage({error:error.message}); }
};
