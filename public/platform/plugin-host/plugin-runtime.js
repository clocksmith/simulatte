(function attachPluginRuntime(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-contracts.js')
    : root.SimulattePluginContracts;
  const graphApi = typeof module === 'object' && module.exports
    ? require('./capability-graph.js')
    : root.SimulattePluginCapabilityGraph;
  const stateApi = typeof module === 'object' && module.exports
    ? require('./plugin-state-host.js')
    : root.SimulattePluginStateHost;
  const sdkApi = typeof module === 'object' && module.exports
    ? require('./plugin-sdk.js')
    : root.SimulattePluginSdk;
  const api = factory(contracts, graphApi, stateApi, sdkApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginRuntimeModule(contracts, graphApi, stateApi, sdkApi) {
  async function createPluginRuntime({ registry, profile, dataCatalog, artifactStore = null, registryBaseUrl = null, corePorts = {} }) {
    contracts.validateProfile(profile);
    if (!registry || typeof registry.entry !== 'function') throw runtimeError('plugin_registry_invalid', 'Plugin runtime expected a registry entry function', null);
    if (!dataCatalog || typeof dataCatalog.createView !== 'function') throw runtimeError('plugin_catalog_invalid', 'Plugin runtime expected an immutable data catalog', null);
    const selectedRows = profile.plugins.map((selection) => {
      const row = registry.entry(selection.id);
      if (!row) throw runtimeError('plugin_registry_entry_missing', `Profile ${profile.id} selects unknown plugin ${selection.id}`, { pluginId: selection.id });
      contracts.validateManifest(row.manifest);
      const config = row.configs?.[selection.configId];
      if (!config) throw runtimeError('plugin_config_missing', `Plugin ${selection.id} has no config ${selection.configId}`, { pluginId: selection.id, configId: selection.configId });
      if (!row.factory || typeof row.factory.activate !== 'function') throw runtimeError('plugin_factory_invalid', `Plugin ${selection.id} expected an activate function`, { pluginId: selection.id });
      return Object.freeze({ selection, manifest: row.manifest, config, factory: row.factory });
    });
    const graph = graphApi.resolveCapabilityGraph(selectedRows.map((row) => row.manifest));
    const rowsById = new Map(selectedRows.map((row) => [row.manifest.id, row]));
    const instances = new Map();
    const receipts = [];
    const stateHost = stateApi.createPluginStateHost(graph.order);
    const sourceReceipts = await verifyEntries(selectedRows, artifactStore, registryBaseUrl);

    function appendReceipt(pluginId, receipt) {
      const manifest = rowsById.get(pluginId)?.manifest;
      if (!manifest || !receipt || !manifest.receiptSchemas.includes(receipt.schema)) {
        throw runtimeError('plugin_receipt_schema_undeclared', `Plugin ${pluginId} emitted undeclared receipt ${receipt?.schema || 'missing'}`, { pluginId, schema: receipt?.schema || null });
      }
      const envelope = stateApi.freezeClone({
        schema: 'simulatte.pluginReceiptEnvelope.v1',
        sequence: receipts.length,
        pluginId,
        pluginVersion: manifest.version,
        receipt,
      });
      receipts.push(envelope);
      return envelope;
    }

    function invokeCapability(consumerId, capabilityId, input) {
      const consumer = rowsById.get(consumerId).manifest;
      const declaration = consumer.consumes.find((row) => row.id === capabilityId);
      if (!declaration) throw runtimeError('plugin_capability_undeclared', `Plugin ${consumerId} did not declare capability ${capabilityId}`, { pluginId: consumerId, capabilityId });
      const providerId = graph.providers.get(capabilityId);
      if (!providerId) {
        if (!declaration.required) return Object.freeze({ enabled: false, reason: 'provider_missing', capabilityId });
        throw runtimeError('plugin_capability_required_missing', `Plugin ${consumerId} requires missing capability ${capabilityId}`, { pluginId: consumerId, capabilityId });
      }
      const capability = instances.get(providerId)?.capabilities?.[capabilityId];
      if (typeof capability !== 'function') throw runtimeError('plugin_capability_implementation_missing', `Provider ${providerId} did not implement ${capabilityId}`, { providerId, capabilityId });
      return capability(stateApi.freezeClone(input));
    }

    for (const pluginId of graph.order) {
      const row = rowsById.get(pluginId);
      const datasets = dataCatalog.createView(row.manifest.datasets);
      const sdk = sdkApi.createPluginSdk({
        manifest: row.manifest,
        datasets,
        corePorts,
        stateHost,
        capabilityInvoke: (capabilityId, input) => invokeCapability(pluginId, capabilityId, input),
        receiptSink: appendReceipt,
      });
      const instance = await row.factory.activate({ sdk, config: stateApi.freezeClone(row.config), profile: stateApi.freezeClone(profile) });
      contracts.validatePluginInstance(pluginId, instance);
      instances.set(pluginId, instance);
    }

    graph.disabledOptional.forEach((row) => receipts.push(stateApi.freezeClone({
      schema: 'simulatte.pluginReceiptEnvelope.v1',
      sequence: receipts.length,
      pluginId: row.pluginId,
      pluginVersion: rowsById.get(row.pluginId).manifest.version,
      receipt: { schema: 'simulatte.pluginCapabilityDisabledReceipt.v1', ...row },
    })));

    async function contributeRequest(context) {
      const output = [];
      for (const pluginId of graph.order) {
        const instance = instances.get(pluginId);
        if (typeof instance.contributeRequest !== 'function') continue;
        const contribution = await instance.contributeRequest(stateApi.freezeClone(context));
        if (contribution) output.push(stateApi.freezeClone({ pluginId, ...contribution }));
      }
      return Object.freeze(output);
    }

    function routeContributors(context) {
      return Object.freeze(graph.order.flatMap((pluginId) => {
        const instance = instances.get(pluginId);
        if (typeof instance.createRouteContributor !== 'function') return [];
        const contributor = instance.createRouteContributor(stateApi.freezeClone(context));
        if (!contributor) return [];
        if (typeof contributor.id !== 'string' || !contributor.id || typeof contributor.evaluateSegment !== 'function') {
          throw runtimeError('plugin_route_contributor_invalid', `Plugin ${pluginId} route contributor expected id and evaluateSegment`, { pluginId });
        }
        return [Object.freeze({ pluginId, ...contributor })];
      }));
    }

    async function settle(context) {
      const output = [];
      for (const pluginId of graph.order) {
        const instance = instances.get(pluginId);
        if (typeof instance.settle !== 'function') continue;
        const contribution = await instance.settle(stateApi.freezeClone(context));
        if (contribution) output.push(stateApi.freezeClone({ pluginId, ...contribution }));
      }
      return Object.freeze(output);
    }

    function views(context) {
      return Object.freeze(graph.order.flatMap((pluginId) => {
        const instance = instances.get(pluginId);
        if (typeof instance.view !== 'function') return [];
        const view = instance.view(stateApi.freezeClone(context));
        contracts.validateUiContribution(pluginId, view);
        return view ? [stateApi.freezeClone({ pluginId, view })] : [];
      }));
    }

    async function dispatchAction(pluginId, actionId, context = {}) {
      const instance = instances.get(pluginId);
      if (!instance) throw runtimeError('plugin_action_plugin_missing', `Action targets inactive plugin ${pluginId}`, { pluginId, actionId });
      if (typeof instance.handleAction !== 'function') throw runtimeError('plugin_action_unsupported', `Plugin ${pluginId} does not handle actions`, { pluginId, actionId });
      return instance.handleAction(actionId, stateApi.freezeClone(context));
    }

    function invoke(capabilityId, input) {
      const providerId = graph.providers.get(capabilityId);
      if (!providerId) throw runtimeError('plugin_capability_provider_missing', `No active plugin provides ${capabilityId}`, { capabilityId });
      const capability = instances.get(providerId)?.capabilities?.[capabilityId];
      if (typeof capability !== 'function') throw runtimeError('plugin_capability_implementation_missing', `Provider ${providerId} did not implement ${capabilityId}`, { providerId, capabilityId });
      return capability(stateApi.freezeClone(input));
    }

    async function dispose() {
      for (const pluginId of [...graph.order].reverse()) {
        const instance = instances.get(pluginId);
        if (typeof instance.dispose === 'function') await instance.dispose();
      }
      instances.clear();
    }

    function runtimeReceipt() {
      return stateApi.freezeClone({
        schema: 'simulatte.pluginRuntimeReceipt.v1',
        profileId: profile.id,
        sdkVersion: 1,
        activationOrder: graph.order,
        sourceReceipts,
        disabledOptionalCapabilities: graph.disabledOptional,
        pluginReceipts: receipts,
        events: stateHost.trace(),
      });
    }

    return Object.freeze({ contributeRequest, routeContributors, settle, views, dispatchAction, invoke, dispose, runtimeReceipt, activePluginIds: graph.order });
  }

  async function verifyEntries(rows, artifactStore, baseUrl) {
    if (!artifactStore || !baseUrl) return Object.freeze([]);
    const receipts = [];
    for (const row of rows) {
      const pluginBaseUrl = new URL(`./plugins/${row.manifest.id}/`, baseUrl).toString();
      const loaded = await artifactStore.resolveText({ id: row.manifest.id, ...row.manifest.entry }, { baseUrl: pluginBaseUrl, key: `plugin:${row.manifest.id}` });
      receipts.push(Object.freeze({ pluginId: row.manifest.id, integrity: loaded.integrity, url: loaded.url }));
    }
    return Object.freeze(receipts);
  }

  function runtimeError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginRuntimeError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createPluginRuntime };
});
