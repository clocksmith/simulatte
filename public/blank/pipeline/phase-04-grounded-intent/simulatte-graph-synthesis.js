(function attachSimulatteGraphSynthesisEntry(root) {
  if (typeof module === 'object' && module.exports) {
    module.exports = require('./simulatte-graph-synthesis-helpers.js');
    return;
  }
  if (!root.SimulatteGraphSynthesis) {
    throw new Error('SimulatteGraphSynthesis entry requires the synthesis controller');
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
