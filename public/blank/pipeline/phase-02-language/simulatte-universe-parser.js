(function attachSimulatteUniverseParserPhase2Facade(root) {
  if (typeof module === 'object' && module.exports) {
    module.exports = require('../../../language/simulatte-universe-parser.js');
    return;
  }
  if (!root.SimulatteUniverseParser) {
    throw new Error('Phase 2 requires the shared Simulatte universe parser');
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
