// Node entry that registers every kernel pack; browsers load the same files as classic scripts.
require('./kernels-core.js');
require('./kernels-routing.js');
require('./kernels-storage.js');
require('./kernels-ai.js');
require('./kernels-sources.js');
module.exports = require('./kernel-registry.js');
