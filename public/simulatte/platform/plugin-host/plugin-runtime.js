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
  const pluginPaths = typeof module === 'object' && module.exports
    ? require('./plugin-asset-paths.js')
    : root.SimulattePluginAssetPaths;
  const pluginAssetPaths = pluginPaths || createDefaultPluginAssetPaths();
  const api = factory(contracts, graphApi, stateApi, sdkApi, pluginAssetPaths);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginRuntimeModule(contracts, graphApi, stateApi, sdkApi, pluginPaths) {
  async function createPluginRuntime({ registry, profile, scenario = null, dataCatalog, artifactStore = null, registryBaseUrl = null, corePorts = {} }) {
    const effectiveRegistryBaseUrl = registryBaseUrl || pluginPaths.sharedRootUrl(documentBase());
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
    const sourceReceipts = await verifyEntries(selectedRows, artifactStore, effectiveRegistryBaseUrl);

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
      const instance = await row.factory.activate({ sdk, config: stateApi.freezeClone(row.config), profile: stateApi.freezeClone(profile), scenario: stateApi.freezeClone(scenario) });
      contracts.validatePluginInstance(pluginId, instance, row.manifest);
      validateDeclaredExtensions(row.manifest, instance);
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
        if (contribution) {
          contracts.validateRequestContribution(pluginId, contribution);
          output.push(stateApi.freezeClone({ pluginId, ...contribution }));
        }
      }
      const obligationIds = output.flatMap((row) => row.obligations.map((obligation) => obligation.id));
      if (new Set(obligationIds).size !== obligationIds.length) throw runtimeError('plugin_obligation_id_duplicate', 'Plugin request contributions contain duplicate obligation IDs', { obligationIds });
      return Object.freeze(output);
    }

    function routeContributors(context) {
      const contributors = graph.order.flatMap((pluginId) => {
        const instance = instances.get(pluginId);
        if (typeof instance.createRouteContributor !== 'function') return [];
        const contributor = instance.createRouteContributor(stateApi.freezeClone(context));
        if (!contributor) return [];
        if (typeof contributor.id !== 'string' || !contributor.id || typeof contributor.evaluateSegment !== 'function') {
          throw runtimeError('plugin_route_contributor_invalid', `Plugin ${pluginId} route contributor expected id and evaluateSegment`, { pluginId });
        }
        return [Object.freeze({ pluginId, ...contributor })];
      });
      const ids = contributors.map((row) => row.id);
      if (new Set(ids).size !== ids.length) throw runtimeError('plugin_route_contributor_duplicate', 'Route contributor IDs must be unique', { contributorIds: ids });
      return Object.freeze(contributors);
    }

    async function settle(context) {
      const output = [];
      for (const pluginId of graph.order) {
        const instance = instances.get(pluginId);
        if (typeof instance.settle !== 'function') continue;
        const contribution = await instance.settle(stateApi.freezeClone(context));
        if (contribution) { contracts.validateSettlementContribution(pluginId, contribution); output.push(stateApi.freezeClone({ pluginId, ...contribution })); }
      }
      return Object.freeze(output);
    }

    function views(context) {
      return Object.freeze(graph.order.flatMap((pluginId) => {
        const instance = instances.get(pluginId);
        if (typeof instance.view !== 'function') return [];
        const contribution = instance.view(stateApi.freezeClone(context));
        const views = contribution === null ? [] : Array.isArray(contribution) ? contribution : [contribution];
        views.forEach((view) => contracts.validateUiContribution(pluginId, view));
        return views.map((view) => stateApi.freezeClone({ pluginId, view }));
      }));
    }

    function presentations(context) {
      return Object.freeze(graph.order.flatMap((pluginId) => {
        const instance = instances.get(pluginId);
        if (typeof instance.present !== 'function') return [];
        const presentation = instance.present(stateApi.freezeClone(context));
        if (presentation === null) return [];
        contracts.validatePresentationContribution(pluginId, presentation);
        if (presentation.schema === 'simulatte.pluginPresentation.v3' && !rowsById.get(pluginId).manifest.permissions.includes('ui.geospatial.v1')) {
          throw runtimeError('plugin_presentation_geospatial_undeclared', `Plugin ${pluginId} emitted geospatial presentation without ui.geospatial.v1`, { pluginId });
        }
        return [stateApi.freezeClone({ pluginId, presentation })];
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

    async function setScenario(nextScenario) {
      scenario = stateApi.freezeClone(nextScenario);
      for (const pluginId of graph.order) {
        const instance = instances.get(pluginId);
        if (typeof instance.setScenario === 'function') await instance.setScenario(scenario);
      }
      return scenario;
    }

    function runtimeReceipt() {
      return stateApi.freezeClone({
        schema: 'simulatte.pluginRuntimeReceipt.v1',
        profileId: profile.id,
        scenario,
        sdkVersion: Math.max(1, ...[...rowsById.values()].map((row) => row.manifest.sdkVersion)),
        activationOrder: graph.order,
        sourceReceipts,
        disabledOptionalCapabilities: graph.disabledOptional,
        pluginReceipts: receipts,
        events: stateHost.trace(),
      });
    }

    return Object.freeze({ contributeRequest, routeContributors, settle, views, presentations, dispatchAction, invoke, setScenario, dispose, runtimeReceipt, activePluginIds: graph.order });
  }

  async function verifyEntries(rows, artifactStore, baseUrl) {
    if (!artifactStore || !baseUrl) return Object.freeze([]);
    // Fetch + verify every plugin entry and resource concurrently. Serially awaiting
    // each file made plugin loading scale with the sum of network round-trips, which
    // dominated boot on slower connections; the receipts keep their declaration order.
    const tasks = [];
    for (const row of rows) {
      const pluginBaseUrl = pluginPaths.pluginBaseUrl(baseUrl, row.manifest.id);
      tasks.push(artifactStore
        .resolveText({ id: row.manifest.id, ...row.manifest.entry }, { baseUrl: pluginBaseUrl, key: `plugin:${row.manifest.id}` })
        .then((loaded) => ({ pluginId: row.manifest.id, integrity: loaded.integrity, url: loaded.url })));
      for (const resource of row.manifest.resources) {
        tasks.push(artifactStore
          .resolveText({ id: `${row.manifest.id}:${resource.path}`, ...resource }, { baseUrl: pluginBaseUrl, key: `plugin:${row.manifest.id}:${resource.path}` })
          .then((verified) => ({ pluginId: row.manifest.id, path: resource.path, integrity: verified.integrity, url: verified.url })));
      }
    }
    const receipts = (await Promise.all(tasks)).map((receipt) => Object.freeze(receipt));
    return Object.freeze(receipts);
  }


  function validateDeclaredExtensions(manifest, instance) {
    const declarations = new Set(manifest.extensionPoints);
    const methods = { request: 'contributeRequest', route: 'createRouteContributor', settlement: 'settle', ui: 'view', event: 'reduce', presentation: 'present' };
    Object.entries(methods).forEach(([extension, method]) => {
      if (typeof instance[method] === 'function' && !declarations.has(extension)) throw runtimeError('plugin_extension_undeclared', `Plugin ${manifest.id} implements ${method} without declaring ${extension}`, { pluginId: manifest.id, extension, method });
    });
  }

  function runtimeError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginRuntimeError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  function createDefaultPluginAssetPaths() {
    const FALLBACK_BASE = 'https://simulatte.world/';
    const sharedSegment = './shared/';

    function sharedRootUrl(documentBaseUrl = documentBase()) {
      try {
        return new URL(sharedSegment, documentBaseUrl).toString();
      } catch (_error) {
        return new URL(sharedSegment, FALLBACK_BASE).toString();
      }
    }

    function pluginBaseUrl(sharedRoot, pluginId) {
      const rootUrl = String(sharedRoot || '');
      const base = rootUrl.endsWith('/') ? rootUrl : `${rootUrl}/`;
      return new URL(`plugins/${pluginId}/`, base).toString();
    }

    function pluginBaseFromDocument(documentBaseUrl, pluginId) {
      return pluginBaseUrl(sharedRootUrl(documentBaseUrl), pluginId);
    }

    return Object.freeze({ sharedRootUrl, pluginBaseUrl, pluginBaseFromDocument });
  }

  function documentBase() {
    if (typeof document === 'undefined' || !document.baseURI) return 'https://simulatte.world/';
    return document.baseURI;
  }

  return { createPluginRuntime };
});
