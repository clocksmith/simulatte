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
  const v4Contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const v4Adapters = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-v4-adapters.js')
    : root.SimulattePluginV4Adapters;
  const timelineApi = typeof module === 'object' && module.exports
    ? require('../runtime/simulation-timeline.js')
    : root.SimulatteSimulationTimeline;
  const provenanceApi = typeof module === 'object' && module.exports
    ? require('../runtime/provenance-registry.js')
    : root.SimulatteProvenanceRegistry;
  const v4Builder = typeof module === 'object' && module.exports
    ? require('../../../shared/core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const pluginAssetPaths = pluginPaths || createDefaultPluginAssetPaths();
  const api = factory(contracts, graphApi, stateApi, sdkApi, pluginAssetPaths, v4Contracts, v4Adapters, timelineApi, provenanceApi, v4Builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginRuntimeModule(
  contracts,
  graphApi,
  stateApi,
  sdkApi,
  pluginPaths,
  v4Contracts,
  v4Adapters,
  timelineApi,
  provenanceApi,
  v4Builder
) {
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
    scenario = stateApi.freezeClone(scenario);
    let scenarioQueue = Promise.resolve();
    let lifecycle = 'active';
    let disposalPromise = null;
    let platformCache = null;
    let timelineCache = null;
    const validatedContributions = new WeakSet();

    function assertActive() {
      if (lifecycle === 'active') return;
      throw runtimeError('plugin_runtime_disposed', 'Plugin runtime is no longer active', { lifecycle });
    }

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
      return freezeCapabilityResult(capability(stateApi.freezeClone(input)));
    }

    try {
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
    } catch (error) {
      try {
        await disposeInstances();
      } catch (cleanupError) {
        if (error && typeof error === 'object') error.cleanupError = cleanupError;
      }
      throw error;
    }

    graph.disabledOptional.forEach((row) => receipts.push(stateApi.freezeClone({
      schema: 'simulatte.pluginReceiptEnvelope.v1',
      sequence: receipts.length,
      pluginId: row.pluginId,
      pluginVersion: rowsById.get(row.pluginId).manifest.version,
      receipt: { schema: 'simulatte.pluginCapabilityDisabledReceipt.v1', ...row },
    })));

    async function contributeRequest(context) {
      assertActive();
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
      assertActive();
      const contributors = graph.order.flatMap((pluginId) => {
        const instance = instances.get(pluginId);
        if (typeof instance.createRouteContributor !== 'function') return [];
        const contributor = instance.createRouteContributor(stateApi.freezeClone(context));
        if (!contributor) return [];
        if (typeof contributor.id !== 'string' || !contributor.id || typeof contributor.evaluateSegment !== 'function') {
          throw runtimeError('plugin_route_contributor_invalid', `Plugin ${pluginId} route contributor expected id and evaluateSegment`, { pluginId });
        }
        if (contributor.costDimensionIds !== undefined && (
          !Array.isArray(contributor.costDimensionIds)
          || !contributor.costDimensionIds.length
          || contributor.costDimensionIds.some((id) => typeof id !== 'string' || !id.trim())
        )) {
          throw runtimeError('plugin_route_contributor_dimensions_invalid', `Plugin ${pluginId} route contributor expected non-empty cost dimension IDs`, { pluginId });
        }
        if (contributor.canRejectSegments !== undefined && typeof contributor.canRejectSegments !== 'boolean') {
          throw runtimeError('plugin_route_contributor_rejection_contract_invalid', `Plugin ${pluginId} route contributor expected a boolean rejection contract`, { pluginId });
        }
        return [Object.freeze({ pluginId, ...contributor })];
      });
      const ids = contributors.map((row) => row.id);
      if (new Set(ids).size !== ids.length) throw runtimeError('plugin_route_contributor_duplicate', 'Route contributor IDs must be unique', { contributorIds: ids });
      return Object.freeze(contributors);
    }

    async function settle(context) {
      assertActive();
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
      assertActive();
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
      assertActive();
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

    function contributionsV4(context) {
      assertActive();
      return collectContributionsV4(context).contributions;
    }

    function collectContributionsV4(context) {
      const legacyEvents = stateHost.trace();
      const sources = [];
      const contributions = graph.order.flatMap((pluginId) => {
        const instance = instances.get(pluginId);
        if (typeof instance.contributeV4 === 'function') {
          const contribution = instance.contributeV4(stateApi.freezeClone(context));
          if (contribution === null) return [];
          if (contribution.schema === 'simulatte.pluginContribution.v4') {
            if (!validatedContributions.has(contribution)) {
              v4Contracts.validateContribution(contribution, `Plugin ${pluginId} v4 contribution`);
              validatedContributions.add(contribution);
            }
            sources.push(Object.freeze({ pluginId, source: 'native-v4' }));
            return [v4Builder?.isBuiltContribution?.(contribution)
              ? contribution
              : stateApi.freezeClone(contribution)];
          }
        }
        if (typeof instance.present !== 'function') return [];
        const presentation = instance.present(stateApi.freezeClone(context));
        if (presentation === null) return [];
        const viewContribution = typeof instance.view === 'function'
          ? instance.view(stateApi.freezeClone(context))
          : [];
        const contribution = v4Adapters.normalizeContribution({
          pluginId,
          presentation,
          views: viewContribution === null ? [] : viewContribution,
          events: legacyEvents.filter((event) => event.pluginId === pluginId),
        });
        sources.push(Object.freeze({ pluginId, source: 'legacy-adapter' }));
        return [contribution];
      });
      return Object.freeze({
        contributions: Object.freeze(contributions),
        sources: Object.freeze(sources),
      });
    }

    function platformV4(context) {
      assertActive();
      const revision = stateHost.currentRevision();
      const scenarioId = context?.scenario?.id || scenario?.id || null;
      const scenarioSeed = context?.scenario?.seed || scenario?.seed || null;
      const compositionSize = Number(context?.compositionSize || 0);
      if (platformCache
        && platformCache.revision === revision
        && platformCache.scenarioId === scenarioId
        && platformCache.scenarioSeed === scenarioSeed
        && platformCache.compositionSize === compositionSize) {
        return platformCache.value;
      }
      const collectStartedAt = performance.now();
      const collected = collectContributionsV4(context);
      const contributions = collected.contributions;
      // Native V4 plugins return immutable, identity-stable contributions for a
      // given snapshot. State revisions can still advance for playback/control
      // events that do not change that contribution. Rebuilding the provenance
      // registry, receipts, and timeline in that case is pure duplicate work and
      // was the largest remaining main-thread cost in the Atlas terminal path.
      // Legacy adapters remain revision-sensitive because their normalized event
      // stream is derived from the state trace.
      const nativeOnly = collected.sources.every((row) => row.source === 'native-v4');
      if (nativeOnly && platformCache
        && platformCache.scenarioId === scenarioId
        && platformCache.scenarioSeed === scenarioSeed
        && platformCache.compositionSize === compositionSize
        && sameContributionIdentities(platformCache.contributions, contributions)) {
        return platformCache.value;
      }
      const workCpuMs = {
        collect: 0,
        registry: 0,
        contributionReceipts: 0,
        timeline: 0,
        assembly: 0,
      };
      workCpuMs.collect = performance.now() - collectStartedAt;
      const registryStartedAt = performance.now();
      const registry = provenanceApi.createProvenanceRegistry();
      contributions.forEach((contribution) => {
        contribution.provenanceRecords.forEach(registry.register);
        bindContributionProvenance(registry, contribution);
      });
      workCpuMs.registry = performance.now() - registryStartedAt;
      const nativePluginIds = new Set(collected.sources
        .filter((row) => row.source === 'native-v4')
        .map((row) => row.pluginId));
      const receiptStartedAt = performance.now();
      const provenanceReceipts = contributions
        .filter((contribution) => nativePluginIds.has(contribution.pluginId))
        .map((contribution) => provenanceApi.createContributionProvenanceReceipt(contribution, { validated: true }));
      const provenanceCoverage = provenanceApi.createPlatformProvenanceReceipt(provenanceReceipts, { validated: true });
      workCpuMs.contributionReceipts = performance.now() - receiptStartedAt;
      const timelineStartedAt = performance.now();
      const timelineId = `${profile.id}:${scenario?.id || 'default'}`;
      const timelineContributions = contributions;
      const timeline = timelineCache
        && sameContributionIdentities(timelineCache.contributions, timelineContributions)
        ? aliasTimeline(timelineCache.timeline, timelineId)
        : timelineApi.createTimeline({
          id: timelineId,
          events: contributions.flatMap((contribution) => contribution.events),
        });
      if (!timelineCache || !sameContributionIdentities(timelineCache.contributions, timelineContributions)) {
        timelineCache = { contributions: timelineContributions, timeline };
      }
      workCpuMs.timeline = performance.now() - timelineStartedAt;
      const assemblyStartedAt = performance.now();
      const valueBody = {
        schema: 'simulatte.pluginPlatform.v4',
        contributions,
        contributionSources: collected.sources,
        provenanceReceipts,
        provenanceCoverage,
        timeline,
        provenance: registry,
        receipt: stateApi.deepFreeze({
          schema: 'simulatte.pluginPlatformReceipt.v4',
          profileId: profile.id,
          pluginIds: contributions.map((contribution) => contribution.pluginId),
          contributionSources: collected.sources,
          provenanceReceipts,
          provenanceCoverage,
          timeline: timeline.receipt(),
          provenance: registry.receipt(),
        }),
      };
      workCpuMs.assembly = performance.now() - assemblyStartedAt;
      const value = Object.freeze({
        ...valueBody,
        workCpuMs: Object.freeze(Object.fromEntries(Object.entries(workCpuMs).map(([key, value]) => [key, Number(value)]))),
      });
      platformCache = { revision, scenarioId, scenarioSeed, compositionSize, contributions, value };
      return value;
    }

    async function dispatchAction(pluginId, actionId, context = {}) {
      assertActive();
      const instance = instances.get(pluginId);
      if (!instance) throw runtimeError('plugin_action_plugin_missing', `Action targets inactive plugin ${pluginId}`, { pluginId, actionId });
      if (typeof instance.handleAction !== 'function') throw runtimeError('plugin_action_unsupported', `Plugin ${pluginId} does not handle actions`, { pluginId, actionId });
      return stateApi.freezeClone(await instance.handleAction(actionId, stateApi.freezeClone(context)));
    }

    function invoke(capabilityId, input) {
      assertActive();
      const providerId = graph.providers.get(capabilityId);
      if (!providerId) throw runtimeError('plugin_capability_provider_missing', `No active plugin provides ${capabilityId}`, { capabilityId });
      const capability = instances.get(providerId)?.capabilities?.[capabilityId];
      if (typeof capability !== 'function') throw runtimeError('plugin_capability_implementation_missing', `Provider ${providerId} did not implement ${capabilityId}`, { providerId, capabilityId });
      return freezeCapabilityResult(capability(stateApi.freezeClone(input)));
    }

    async function dispose() {
      if (disposalPromise) return disposalPromise;
      lifecycle = 'disposing';
      disposalPromise = scenarioQueue
        .then(() => disposeInstances())
        .finally(() => { lifecycle = 'disposed'; });
      return disposalPromise;
    }

    async function disposeInstances() {
      const failures = [];
      for (const pluginId of [...graph.order].reverse()) {
        const instance = instances.get(pluginId);
        if (typeof instance?.dispose !== 'function') continue;
        try {
          await instance.dispose();
        } catch (error) {
          failures.push({ message: error?.message || String(error), pluginId });
        }
      }
      instances.clear();
      if (failures.length) {
        throw runtimeError('plugin_runtime_dispose_failed', 'One or more plugin instances failed to dispose', { failures });
      }
    }

    function setScenario(nextScenario) {
      if (lifecycle !== 'active') return Promise.reject(runtimeError('plugin_runtime_disposed', 'Plugin runtime is no longer active', { lifecycle }));
      const pending = scenarioQueue.then(() => applyScenario(nextScenario));
      scenarioQueue = pending.catch(() => {});
      return pending;
    }

    async function applyScenario(nextScenario) {
      const previousScenario = scenario;
      const candidateScenario = stateApi.freezeClone(nextScenario);
      const updatedInstances = [];
      try {
        for (const pluginId of graph.order) {
          const instance = instances.get(pluginId);
          if (typeof instance?.setScenario !== 'function') continue;
          updatedInstances.push(instance);
          await instance.setScenario(candidateScenario);
        }
      } catch (error) {
        const rollbackFailures = [];
        for (const instance of updatedInstances.reverse()) {
          try {
            await instance.setScenario(previousScenario);
          } catch (rollbackError) {
            rollbackFailures.push({ message: rollbackError?.message || String(rollbackError) });
          }
        }
        if (rollbackFailures.length && error && typeof error === 'object') error.rollbackFailures = rollbackFailures;
        throw error;
      }
      scenario = candidateScenario;
      platformCache = null;
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

    function freezeCapabilityResult(value) {
      if (value && typeof value.then === 'function') {
        return value.then((result) => stateApi.freezeClone(result));
      }
      return stateApi.freezeClone(value);
    }

    return Object.freeze({
      contributeRequest,
      contributionsV4,
      dispatchAction,
      dispose,
      invoke,
      platformV4,
      presentations,
      routeContributors,
      runtimeReceipt,
      setScenario,
      settle,
      views,
      activePluginIds: graph.order,
    });
  }

  function bindContributionProvenance(registry, contribution) {
    contribution.presentation.layers.forEach((row) => registry.bind(`${contribution.pluginId}:layer:${row.id}`, row.provenance.evidenceRefs));
    contribution.events.forEach((row) => registry.bind(`${contribution.pluginId}:event:${row.id}`, row.provenance.evidenceRefs));
    if (contribution.state) registry.bind(`${contribution.pluginId}:state:${contribution.state.id}`, contribution.state.provenance.evidenceRefs);
    contribution.controls.controls.forEach((row) => registry.bind(`${contribution.pluginId}:control:${row.id}`, row.provenance.evidenceRefs));
    contribution.inspections.forEach((inspection) => inspection.fields.forEach((field) => {
      registry.bind(`${contribution.pluginId}:inspection:${inspection.id}:${field.id}`, field.provenance.evidenceRefs);
    }));
  }

  function sameContributionIdentities(previous, next) {
    if (!Array.isArray(previous) || previous.length !== next.length) return false;
    for (let index = 0; index < next.length; index += 1) {
      if (previous[index] !== next[index]) return false;
    }
    return true;
  }

  function aliasTimeline(timeline, id) {
    const baseReceipt = timeline.receipt();
    return Object.freeze({
      ...timeline,
      receipt: () => Object.freeze({ ...baseReceipt, id }),
    });
  }

  async function verifyEntries(rows, artifactStore, baseUrl) {
    if (!artifactStore || !baseUrl) return Object.freeze([]);
    // Fetch + verify every plugin entry and resource concurrently. Serially awaiting
    // each file made plugin loading scale with the sum of network round-trips, which
    // dominated boot on slower connections; the receipts keep their declaration order.
    const tasks = [];
    for (const row of rows) {
      const pluginBaseUrl = pluginPaths.pluginBaseUrl(baseUrl, row.manifest.id);
      // Plugin .js load as <script> tags carrying a Subresource Integrity hash, so the
      // browser refuses to execute any tampered module (fail-closed: the global never
      // registers and activation fails). We therefore trust the declared integrity here
      // instead of re-fetching the same bytes, which halved plugin boot round-trips and
      // lets /shared plugin .js be cached immutably. Non-.js resources are not script
      // tags, so they are still fetched and hashed.
      tasks.push(Promise.resolve({ pluginId: row.manifest.id, integrity: row.manifest.entry.integrity, url: new URL(row.manifest.entry.path, pluginBaseUrl).toString() }));
      for (const resource of row.manifest.resources) {
        if (resource.path.endsWith('.js')) {
          tasks.push(Promise.resolve({ pluginId: row.manifest.id, path: resource.path, integrity: resource.integrity, url: new URL(resource.path, pluginBaseUrl).toString() }));
          continue;
        }
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
