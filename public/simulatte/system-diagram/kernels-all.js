// Node entry that registers every kernel pack; browsers load the same files as classic scripts.
require('./kernels-core.js');
require('./kernels-routing.js');
require('./kernels-storage.js');
require('./kernels-ai.js');
require('./kernels-sources.js');
require('./kernels-pipeline.js');
require('./kernels-replication.js');
require('./kernels-applications.js');
require('./kernels-distribution.js');
require('./kernels-social-graph.js');
require('./kernels-collaboration.js');
require('./kernels-interview.js');
require('./kernels-messaging.js');
require('./kernels-api-practice.js');
module.exports = require('./kernel-registry.js');
