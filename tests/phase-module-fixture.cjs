const registry = require('../public/blank/app/runtime/phase-module-registry.js');

function phaseFamily(id) {
  return registry.family(id);
}

module.exports = {
  phaseFamily,
};
