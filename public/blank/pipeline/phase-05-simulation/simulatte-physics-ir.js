(function attachSimulattePhysicsIREntry(root) {
  if (typeof module === 'object' && module.exports) {
    module.exports = require('./simulatte-physics-ir-builder.js');
    return;
  }
  if (!root.SimulattePhysicsIR) {
    throw new Error('SimulattePhysicsIR entry requires the PhysicsIR builder');
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
