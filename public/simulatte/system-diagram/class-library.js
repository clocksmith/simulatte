(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramLibrary = api;
})(globalThis, function () {
  'use strict';
  const LIBRARY_SCHEMA = 'simulatte.systemDiagramClassLibrary.v1';
  const PACK_SCHEMA = 'simulatte.systemDiagramClassPack.v1';
  const PARAM_TYPES = Object.freeze(['number', 'integer', 'boolean', 'enum']);
  const PARAM_GROUPS = Object.freeze(['basic', 'advanced']);
  const FAULT_TARGETS = Object.freeze(['node', 'edge', 'group']);
  const ID = /^[a-z][a-z0-9-]{0,47}$/;
  const KERNEL_ID = /^[a-z][A-Za-z0-9]{0,47}$/;
  const PARAM_ID = /^[a-z][A-Za-z0-9]{0,47}$/;

  class ContractError extends Error {
    constructor(contract, path, expected, received) {
      super(`${contract} ${path}: expected ${expected}, received ${describe(received)}`);
      this.name = 'SimulatteSystemDiagramContractError';
      this.contract = contract; this.path = path; this.expected = expected; this.received = received;
    }
  }
  function describe(value) {
    if (value === undefined) return 'undefined';
    try { const text = JSON.stringify(value); return text.length > 80 ? `${text.slice(0, 77)}...` : text; } catch { return String(value); }
  }
  const fail = (contract, path, expected, received) => { throw new ContractError(contract, path, expected, received); };
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  function exactKeys(contract, path, value, required, optional = []) {
    if (!isRecord(value)) fail(contract, path, 'object', value);
    for (const key of required) if (!Object.hasOwn(value, key)) fail(contract, `${path}.${key}`, 'required field', undefined);
    for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) fail(contract, `${path}.${key}`, 'declared field', key);
  }
  function text(contract, path, value, max = 400) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(contract, path, `non-empty string up to ${max} characters`, value);
    return value;
  }

  function validateParamSpec(path, spec) {
    const C = 'class-library';
    exactKeys(C, path, spec, ['type', 'label', 'default', 'group'], ['unit', 'min', 'max', 'options', 'help']);
    if (!PARAM_TYPES.includes(spec.type)) fail(C, `${path}.type`, PARAM_TYPES.join('|'), spec.type);
    if (!PARAM_GROUPS.includes(spec.group)) fail(C, `${path}.group`, PARAM_GROUPS.join('|'), spec.group);
    text(C, `${path}.label`, spec.label, 80);
    if (spec.type === 'enum') {
      if (!Array.isArray(spec.options) || !spec.options.length || new Set(spec.options).size !== spec.options.length || spec.options.some(o => typeof o !== 'string' || !o)) fail(C, `${path}.options`, 'unique non-empty strings', spec.options);
    } else if (Object.hasOwn(spec, 'options')) fail(C, `${path}.options`, 'options only on enum parameters', spec.options);
    if (spec.type === 'number' || spec.type === 'integer') {
      if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max) || spec.min > spec.max) fail(C, `${path}.min/max`, 'finite min <= max', [spec.min, spec.max]);
    } else if (Object.hasOwn(spec, 'min') || Object.hasOwn(spec, 'max')) fail(C, `${path}.min/max`, 'ranges only on numeric parameters', [spec.min, spec.max]);
    checkParamValue(C, `${path}.default`, spec, spec.default);
    return Object.freeze({ ...spec, ...(spec.options ? { options: Object.freeze([...spec.options]) } : {}) });
  }

  function checkParamValue(contract, path, spec, value) {
    switch (spec.type) {
      case 'boolean': if (typeof value !== 'boolean') fail(contract, path, 'boolean', value); break;
      case 'enum': if (!spec.options.includes(value)) fail(contract, path, `one of ${spec.options.join('|')}`, value); break;
      case 'integer': if (!Number.isInteger(value) || value < spec.min || value > spec.max) fail(contract, path, `integer in [${spec.min}, ${spec.max}]`, value); break;
      case 'number': if (!Number.isFinite(value) || value < spec.min || value > spec.max) fail(contract, path, `number in [${spec.min}, ${spec.max}]`, value); break;
      default: fail(contract, path, 'known parameter type', spec.type);
    }
    return value;
  }

  function validateParamMap(path, value) {
    if (!isRecord(value)) fail('class-library', path, 'object of parameter specs', value);
    const out = {};
    for (const [key, spec] of Object.entries(value)) {
      if (!PARAM_ID.test(key)) fail('class-library', `${path}.${key}`, 'camelCase parameter id', key);
      out[key] = validateParamSpec(`${path}.${key}`, spec);
    }
    return out;
  }

  function validatePayloadRef(path, ref, payloadIds, kernelParams, allowed) {
    if (allowed.includes(ref)) return;
    if (payloadIds.has(ref)) return;
    if (ref.startsWith('param:')) {
      const spec = kernelParams[ref.slice(6)];
      if (spec?.type === 'enum' && spec.options.every(o => payloadIds.has(o) || o === 'inherit')) return;
    }
    fail('class-library', path, `payload id, ${allowed.join('/')} or param:<payload enum>`, ref);
  }

  function build(manifest, packs) {
    const C = 'class-library';
    exactKeys(C, 'manifest', manifest, ['schema', 'version', 'payloadTypes', 'categories', 'paramSets', 'edgeParams', 'faultTypes', 'errorCodes', 'packs']);
    if (manifest.schema !== LIBRARY_SCHEMA) fail(C, 'manifest.schema', LIBRARY_SCHEMA, manifest.schema);
    if (!Array.isArray(packs) || packs.length !== manifest.packs.length) fail(C, 'packs', `${manifest.packs.length} loaded packs`, packs?.length);
    const payloadTypes = manifest.payloadTypes.map((row, i) => { exactKeys(C, `payloadTypes[${i}]`, row, ['id', 'label']); if (!ID.test(row.id)) fail(C, `payloadTypes[${i}].id`, 'kebab id', row.id); return Object.freeze({ ...row }); });
    const payloadIds = new Set(payloadTypes.map(row => row.id));
    if (payloadIds.size !== payloadTypes.length) fail(C, 'payloadTypes', 'unique ids', [...payloadIds]);
    const categories = manifest.categories.map((row, i) => { exactKeys(C, `categories[${i}]`, row, ['id', 'label']); if (!ID.test(row.id)) fail(C, `categories[${i}].id`, 'kebab id', row.id); return Object.freeze({ ...row }); });
    const categoryIds = new Set(categories.map(row => row.id));
    const paramSets = {};
    for (const [name, set] of Object.entries(manifest.paramSets)) paramSets[name] = validateParamMap(`paramSets.${name}`, set);
    const edgeParams = Object.freeze(validateParamMap('edgeParams', manifest.edgeParams));
    if (!Array.isArray(manifest.errorCodes) || !manifest.errorCodes.length) fail(C, 'errorCodes', 'non-empty array', manifest.errorCodes);
    const faultTypes = manifest.faultTypes.map((row, i) => {
      exactKeys(C, `faultTypes[${i}]`, row, ['id', 'label', 'targets', 'params'], ['kernels']);
      if (!PARAM_ID.test(row.id)) fail(C, `faultTypes[${i}].id`, 'camelCase id', row.id);
      if (!Array.isArray(row.targets) || !row.targets.length || row.targets.some(t => !FAULT_TARGETS.includes(t))) fail(C, `faultTypes[${i}].targets`, FAULT_TARGETS.join('|'), row.targets);
      return Object.freeze({ ...row, targets: Object.freeze([...row.targets]), params: Object.freeze(validateParamMap(`faultTypes[${i}].params`, row.params)), ...(row.kernels ? { kernels: Object.freeze([...row.kernels]) } : {}) });
    });
    const faultById = new Map(faultTypes.map(f => [f.id, f]));
    if (faultById.size !== faultTypes.length) fail(C, 'faultTypes', 'unique ids', faultTypes.map(f => f.id));

    const kernels = {}, classes = {}, classOrder = [], packIds = [];
    packs.forEach((pack, p) => {
      const at = `packs[${p}]`;
      exactKeys(C, at, pack, ['schema', 'id', 'version', 'kernels', 'classes']);
      if (pack.schema !== PACK_SCHEMA) fail(C, `${at}.schema`, PACK_SCHEMA, pack.schema);
      if (packIds.includes(pack.id)) fail(C, `${at}.id`, 'unique pack id', pack.id);
      packIds.push(pack.id);
      pack.kernels.forEach((kernel, k) => {
        const path = `${at}.kernels[${k}]`;
        exactKeys(C, path, kernel, ['id', 'label', 'description', 'paramSets', 'params', 'ports', 'faults']);
        if (!KERNEL_ID.test(kernel.id) || kernels[kernel.id]) fail(C, `${path}.id`, 'unique camelCase kernel id', kernel.id);
        const params = {};
        for (const name of kernel.paramSets) { if (!paramSets[name]) fail(C, `${path}.paramSets`, 'declared parameter set', name); Object.assign(params, paramSets[name]); }
        for (const [key, spec] of Object.entries(validateParamMap(`${path}.params`, kernel.params))) {
          if (params[key]) fail(C, `${path}.params.${key}`, 'parameter not already supplied by a parameter set', key);
          params[key] = spec;
        }
        const portIds = new Set();
        const ports = kernel.ports.map((port, i) => {
          const pp = `${path}.ports[${i}]`;
          exactKeys(C, pp, port, ['id', 'direction', 'label', 'multiple', 'required'], ['accepts', 'emits']);
          if (!PARAM_ID.test(port.id) || portIds.has(port.id)) fail(C, `${pp}.id`, 'unique camelCase port id', port.id);
          portIds.add(port.id);
          if (port.direction === 'in') {
            if (!Array.isArray(port.accepts) || !port.accepts.length || Object.hasOwn(port, 'emits')) fail(C, pp, 'in port with accepts and no emits', port);
            port.accepts.forEach((ref, r) => validatePayloadRef(`${pp}.accepts[${r}]`, ref, payloadIds, params, ['any']));
          } else if (port.direction === 'out') {
            if (!Array.isArray(port.emits) || !port.emits.length || Object.hasOwn(port, 'accepts')) fail(C, pp, 'out port with emits and no accepts', port);
            port.emits.forEach((ref, r) => validatePayloadRef(`${pp}.emits[${r}]`, ref, payloadIds, params, ['inherit']));
          } else fail(C, `${pp}.direction`, 'in|out', port.direction);
          if (typeof port.multiple !== 'boolean' || typeof port.required !== 'boolean') fail(C, pp, 'boolean multiple and required', port);
          return Object.freeze({ ...port, ...(port.accepts ? { accepts: Object.freeze([...port.accepts]) } : { emits: Object.freeze([...port.emits]) }) });
        });
        kernel.faults.forEach((id, i) => {
          const fault = faultById.get(id);
          if (!fault || !fault.targets.includes('node') || (fault.kernels && !fault.kernels.includes(kernel.id))) fail(C, `${path}.faults[${i}]`, 'node fault applicable to this kernel', id);
        });
        kernels[kernel.id] = Object.freeze({ id: kernel.id, packId: pack.id, label: text(C, `${path}.label`, kernel.label, 80), description: text(C, `${path}.description`, kernel.description, 600), params: Object.freeze(params), ports: Object.freeze(ports), faults: Object.freeze([...kernel.faults]) });
      });
    });
    packs.forEach((pack, p) => pack.classes.forEach((klass, c) => {
      const path = `packs[${p}].classes[${c}]`;
      exactKeys(C, path, klass, ['id', 'label', 'category', 'kernel', 'glyph', 'description', 'defaults']);
      if (!ID.test(klass.id) || classes[klass.id]) fail(C, `${path}.id`, 'unique kebab class id', klass.id);
      const kernel = kernels[klass.kernel];
      if (!kernel) fail(C, `${path}.kernel`, 'declared kernel', klass.kernel);
      if (!categoryIds.has(klass.category)) fail(C, `${path}.category`, 'declared category', klass.category);
      if (!ID.test(klass.glyph)) fail(C, `${path}.glyph`, 'kebab glyph id', klass.glyph);
      if (!isRecord(klass.defaults)) fail(C, `${path}.defaults`, 'object', klass.defaults);
      for (const [key, value] of Object.entries(klass.defaults)) {
        if (!kernel.params[key]) fail(C, `${path}.defaults.${key}`, `parameter of kernel ${kernel.id}`, key);
        checkParamValue(C, `${path}.defaults.${key}`, kernel.params[key], value);
      }
      classes[klass.id] = Object.freeze({ id: klass.id, packId: pack.id, builtin: true, label: text(C, `${path}.label`, klass.label, 80), category: klass.category, kernel: klass.kernel, glyph: klass.glyph, description: text(C, `${path}.description`, klass.description, 600), defaults: Object.freeze({ ...klass.defaults }) });
      classOrder.push(klass.id);
    }));
    return Object.freeze({
      schema: LIBRARY_SCHEMA, version: manifest.version, packIds: Object.freeze(packIds),
      payloadTypes: Object.freeze(payloadTypes), categories: Object.freeze(categories), edgeParams, errorCodes: Object.freeze([...manifest.errorCodes]),
      faultTypes: Object.freeze(faultTypes), kernels: Object.freeze(kernels), classes: Object.freeze(classes), classOrder: Object.freeze(classOrder),
    });
  }

  async function load(manifestPath, fetchJson) {
    const manifest = await fetchJson(manifestPath);
    const base = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);
    const packs = await Promise.all(manifest.packs.map(path => fetchJson(base + path)));
    return build(manifest, packs);
  }

  function loadSync(directory) {
    const fs = require('node:fs'), path = require('node:path');
    const read = file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    const manifest = read('class-library.json');
    return build(manifest, manifest.packs.map(read));
  }

  return Object.freeze({ LIBRARY_SCHEMA, PACK_SCHEMA, ContractError, build, load, loadSync, checkParamValue, isRecord, exactKeys });
});
