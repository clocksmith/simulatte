/* eslint-disable no-restricted-globals */
self.onmessage = function onmessage(event) {
  const { scenario, runs = 100 } = event.data;
  if (!scenario) {
    self.postMessage({ type: 'error', message: 'Scenario missing' });
    return;
  }

  for (let i = 0; i < runs; i += 1) {
    // Stub payload demonstrates streaming Monte Carlo statistics.
    self.postMessage({
      type: 'run-progress',
      completed: i + 1,
      runs,
      sample: {
        founderOwnership: Math.random(),
        exitValue: Math.random() * 1_000_000_000
      }
    });
  }

  self.postMessage({ type: 'complete' });
};
