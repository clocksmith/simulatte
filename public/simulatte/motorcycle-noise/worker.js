importScripts('../../shared/contracts/world-spec-authorship.js', '../../shared/contracts/world-spec.js',
  'scene.js', 'signal.js', 'propagation.js', 'control.js', 'sensing.js', 'simulation.js');
self.onmessage = ({ data }) => {
  try {
    const output = MotorcycleSimulation.run(data.spec, progress => self.postMessage({ type: 'progress', ...progress }));
    self.postMessage({ type: 'result', output }, [output.baseline.buffer, output.residual.buffer,
      output.originalPlate.pixels.buffer, output.degradedPlate.pixels.buffer]);
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
