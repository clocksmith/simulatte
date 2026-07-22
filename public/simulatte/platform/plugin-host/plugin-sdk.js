(function attachPluginSdk(root, factory) {
  const stateApi = typeof module === 'object' && module.exports
    ? require('./plugin-state-host.js')
    : root.SimulattePluginStateHost;
  const api = factory(stateApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginSdk = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginSdkModule(stateApi) {
  const PORT_PERMISSION = Object.freeze({
    capabilities: 'capabilities.invoke.v1',
    clock: 'clock.read.v1',
    events: 'events.propose.v1',
    language: 'language.parse.v1',
    receipts: 'receipts.append.v1',
    routing: 'routing.contribute.v1',
    simulation: 'simulation.run.v1',
    state: 'state.reduce.v1',
    ui: 'ui.inspector.v1',
    worldQuery: 'world.query.v1',
    // SDK v2 simulation-substrate ports. A host port exposing forPlugin(pluginId) is
    // bound per plugin so its identity (e.g. RNG stream seeding) includes the plugin id.
    random: 'random.stream.v1',
    scheduler: 'simulation.schedule.v1',
    compute: 'compute.worker.v1',
    environment: 'environment.read.v1',
    geography: 'geography.project.v1',
  });

  function createPluginSdk({ manifest, datasets, corePorts, stateHost, capabilityInvoke, receiptSink }) {
    const permissions = new Set(manifest.permissions);
    const sdk = {
      schema: 'simulatte.pluginSdk.v1',
      pluginId: manifest.id,
      sdkVersion: 1,
      datasets,
    };
    Object.entries(PORT_PERMISSION).forEach(([name, permission]) => {
      if (!permissions.has(permission)) return;
      if (name === 'state') sdk.state = createStatePort(manifest.id, stateHost);
      else if (name === 'events') sdk.events = Object.freeze({ propose: (event) => stateHost.propose(manifest.id, event) });
      else if (name === 'capabilities') sdk.capabilities = Object.freeze({ invoke: capabilityInvoke });
      else if (name === 'receipts') sdk.receipts = Object.freeze({ ...(corePorts.receipts || {}), append: (receipt) => receiptSink(manifest.id, receipt) });
      else if (corePorts[name] !== undefined) {
        const port = corePorts[name];
        // Per-plugin ports (random, scheduler, compute, environment, geography) expose
        // forPlugin(pluginId); bind them so their identity includes this plugin.
        sdk[name] = (port && typeof port.forPlugin === 'function') ? port.forPlugin(manifest.id) : port;
      }
      else throw sdkError('plugin_sdk_port_missing', `Plugin ${manifest.id} has permission ${permission} but host port ${name} is missing`, { pluginId: manifest.id, permission, port: name });
    });
    return stateApi.deepFreeze(sdk);
  }

  function createStatePort(pluginId, stateHost) {
    return Object.freeze({
      read: () => stateHost.read(pluginId),
      register: (reducer, initialState) => stateHost.register(pluginId, reducer, initialState),
    });
  }

  function sdkError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginSdkError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { PORT_PERMISSION, createPluginSdk };
});
