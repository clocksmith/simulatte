(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramProfile = api;
})(globalThis, function () {
  'use strict';
  const CAPABILITIES = Object.freeze(['node-authoring', 'typed-task-links', 'shared-gpu-clusters', 'capacity-latency', 'seeded-replay', 'checkpoint-restore', 'causal-request-inspection', 'drag-drop-canvas', 'class-instance-authoring', 'synthetic-dataflows']);
  const FIELDS = Object.freeze(['schema', 'id', 'version', 'name', 'route', 'entry', 'model', 'documentSchemaPath', 'defaultSeed', 'defaultPreset', 'capabilities', 'limitations']);
  function validate(profile, { route, model }) {
    if (!profile || typeof profile !== 'object' || Object.keys(profile).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(profile, key))) throw Error('Missing or undeclared System Diagram profile fields');
    if (profile.schema !== 'simulatte.systemDiagramProfile.v2' || !route || profile.id !== route.profile || profile.route !== route.path || profile.entry !== route.entry || profile.name !== route.displayName || profile.model !== model) throw Error('System Diagram profile does not match its declared World route/model');
    if (!/^\d+\.\d+\.\d+$/.test(profile.version) || profile.documentSchemaPath !== '/data/distributed-repair/system-diagram.schema.json' || !Number.isInteger(profile.defaultSeed) || profile.defaultSeed < 0 || profile.defaultSeed > 4294967295 || !['pipeline', 'collection', 'blank'].includes(profile.defaultPreset)) throw Error('Invalid System Diagram profile configuration');
    if (!Array.isArray(profile.capabilities) || !profile.capabilities.length || new Set(profile.capabilities).size !== profile.capabilities.length || profile.capabilities.some(value => !CAPABILITIES.includes(value)) || typeof profile.limitations !== 'string' || !profile.limitations.trim()) throw Error('Unsupported or unbounded System Diagram profile claims');
    return structuredClone(profile);
  }
  return Object.freeze({ CAPABILITIES, validate });
});
