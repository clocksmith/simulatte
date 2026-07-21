(function attachPluginCapabilityGraph(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCapabilityGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginCapabilityGraphModule() {
  function resolveCapabilityGraph(manifests) {
    const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
    const providers = new Map();
    manifests.forEach((manifest) => manifest.provides.forEach((capabilityId) => {
      if (providers.has(capabilityId)) throw graphError('plugin_capability_provider_duplicate', `Capability ${capabilityId} has providers ${providers.get(capabilityId)} and ${manifest.id}`, { capabilityId });
      providers.set(capabilityId, manifest.id);
    }));
    const dependencies = new Map(manifests.map((manifest) => [manifest.id, new Set()]));
    const disabledOptional = [];
    manifests.forEach((manifest) => manifest.consumes.forEach((declaration) => {
      const providerId = providers.get(declaration.id);
      if (!providerId) {
        if (declaration.required) throw graphError('plugin_capability_required_missing', `Plugin ${manifest.id} requires missing capability ${declaration.id}`, { pluginId: manifest.id, capabilityId: declaration.id });
        disabledOptional.push(Object.freeze({ pluginId: manifest.id, capabilityId: declaration.id, reason: 'provider_missing' }));
        return;
      }
      if (providerId === manifest.id) throw graphError('plugin_capability_self_dependency', `Plugin ${manifest.id} consumes its own capability ${declaration.id}`, { pluginId: manifest.id, capabilityId: declaration.id });
      dependencies.get(manifest.id).add(providerId);
    }));
    const order = topologicalOrder(byId, dependencies);
    return Object.freeze({
      order: Object.freeze(order),
      providers,
      dependencies,
      disabledOptional: Object.freeze(disabledOptional.sort(compareDisabled)),
    });
  }

  function topologicalOrder(byId, dependencies) {
    const permanent = new Set();
    const temporary = new Set();
    const result = [];
    function visit(id, path) {
      if (permanent.has(id)) return;
      if (temporary.has(id)) throw graphError('plugin_capability_cycle', `Plugin capability cycle: ${[...path, id].join(' -> ')}`, { path: [...path, id] });
      temporary.add(id);
      [...dependencies.get(id)].sort().forEach((dependencyId) => visit(dependencyId, [...path, id]));
      temporary.delete(id);
      permanent.add(id);
      result.push(id);
    }
    [...byId.keys()].sort().forEach((id) => visit(id, []));
    return result;
  }

  function compareDisabled(left, right) {
    return left.pluginId.localeCompare(right.pluginId) || left.capabilityId.localeCompare(right.capabilityId);
  }

  function graphError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginCapabilityError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { resolveCapabilityGraph };
});
