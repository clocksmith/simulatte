'use strict';
importScripts('./city-paths.js?v=city-controls-v7','./traffic-motion.js?v=city-controls-v7','./reflection-model.js?v=city-controls-v7');
self.onmessage=({data})=>{
  try {
    const scene=self.MotorcycleReflection.create(data.map,data.config);
    self.postMessage({scene},scene.sources.map(source=>source.motion.states.buffer));
  } catch(error) { self.postMessage({error:error.message}); }
};
