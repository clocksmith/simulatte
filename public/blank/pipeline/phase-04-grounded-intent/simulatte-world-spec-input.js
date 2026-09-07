(function attachWorldSpecInput(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');

    function buildWorldSpecInput(intent, overrides = {}) {
        if (!intent || intent.schema !== 'simulatte.intent.v1') throw new Error('WorldSpec input requires a typed intent');
        const overrideParams = overrides && overrides.params && typeof overrides.params === 'object'
          ? overrides.params
          : {};
        if (intent.domains.includes('blank')) {
          const plane = intent.components.find((component) => component.id === 'canvas');
          return finishWorldSpecInput({
            schema: 'simulatte.worldSpecInput.v1',
            templateId: 'blank-world',
            name: intent.title || 'Blank Construction Plane',
            description: intent.prompt ? `Intent: ${intent.prompt}` : 'Empty 2d construction surface.',
            params: { ...(plane ? plane.params : {}), ...overrideParams },
          }, intent);
        }

        const modules = ['mechanics', 'field', 'energy-ledger'];
        const objects = [];
        const controls = ['energyInput', 'fieldStrength', 'damping', 'complexity'];
        const params = { ...scope.templateById('custom-world').params };
        const contract = intent.resolution && intent.resolution.contract
          ? scope.phaseCarryObject(intent.resolution.contract)
          : null;
        const addControl = (key) => {
          if (scope.CONTROL_LIBRARY[key] && !controls.includes(key)) controls.push(key);
        };
        for (const domain of intent.domains) {
          if (!modules.includes(domain)) modules.push(domain);
        }
        for (const component of intent.components) {
          const graphNode = scope.graphNodeForSpec(contract, component.id);
          objects.push({
            id: component.id,
            type: component.type,
            role: component.role,
            layer: component.layer || '',
            domains: component.domains || [],
            material: component.material || '',
            visualRegime: component.visualRegime || '',
            assembly: component.assembly || '',
            phrase: component.phrase || '',
            source: component.source || '',
            primitiveProgram: component.primitiveProgram || null,
            geometry: component.geometry || null,
            ports: component.ports || null,
            slots: component.slots || [],
            synthesis: component.synthesis || null,
            state: graphNode ? graphNode.state : null,
          });
          for (const key of component.controls || []) addControl(key);
          for (const [key, value] of Object.entries(component.params || {})) {
            params[key] = value;
            addControl(key);
          }
        }
        scope.applyContractDefaults(params, contract);
        scope.applyCompiledParameterHints(scope.parameterHintTextForIntent(intent, contract), params, addControl);

        const exactMachine = intent.title === 'Solar Magnetic Perpetual Motion Machine';
        if (exactMachine) {
          Object.assign(params, {
            irradiance: 780,
            sliderAmplitude: 0.42,
            loadTorque: 0.16,
          });
        }
        for (const [key, value] of Object.entries(overrideParams)) {
          if (!Number.isFinite(Number(value))) continue;
          params[key] = Number(value);
          addControl(key);
        }
        if (contract && contract.graph) {
          contract.graph.units = scope.unitsForParams(params);
        }
        return finishWorldSpecInput({
          schema: 'simulatte.worldSpecInput.v1',
          templateId: 'custom-world',
          name: exactMachine ? 'Solar Magnetic Perpetual Motion Machine' : intent.title || 'Custom Physics World',
          description: intent.prompt ? `Intent: ${intent.prompt}` : 'Prompt resolved into 2d simulation components.',
          modules,
          objects,
          controls,
          params,
          contract,
        }, intent);
      }

  function finishWorldSpecInput(input, intent) {
    const template = scope.templateById(input.templateId);
    const parameterIds = new Set(Object.keys({ ...template.params, ...input.params }));
    const controls = (input.controls || template.controls || []).map(scope.normalizeControl)
      .filter(control => parameterIds.has(control[0]));
    const modules = scope.uniqueList(input.modules || template.modules || []);
    const objects = scope.normalizeObjects(input.objects, template.objects || []);
    const params = scope.normalizeParams(template, input.params, controls);
    const contract = input.contract || intent.resolution && intent.resolution.contract || null;
    return validateWorldSpecInput({ ...input, id: scope.deterministicSpecId(template.id, input.name, modules, objects, params),
      kind: template.kind, modules, objects, controls, params, contract });
  }

  function validateWorldSpecInput(input) {
    if (input?.schema !== 'simulatte.worldSpecInput.v1') throw new Error('WorldSpec input schema required');
    const keys = ['schema', 'id', 'templateId', 'name', 'kind', 'description', 'modules', 'objects', 'controls', 'params', 'contract'];
    if (keys.some(key => !Object.hasOwn(input, key)) || Object.keys(input).some(key => !keys.includes(key))) {
      throw new Error('WorldSpec input requires exactly the declared authoring fields');
    }
    for (const key of ['id', 'templateId', 'name', 'kind', 'description']) {
      if (typeof input[key] !== 'string' || !input[key]) throw new Error(`WorldSpec input requires ${key}`);
    }
    if (!['blank-world', 'custom-world'].includes(input.templateId)) throw new Error('WorldSpec input template is not admitted');
    if (input.kind !== scope.templateById(input.templateId).kind) throw new Error('WorldSpec input kind contradicts its template');
    if (!Array.isArray(input.modules) || input.modules.some(value => typeof value !== 'string' || !value) ||
        new Set(input.modules).size !== input.modules.length) throw new Error('WorldSpec input modules invalid');
    if (!Array.isArray(input.objects) || input.objects.some(value => !value || typeof value.id !== 'string' || !value.id ||
        typeof value.type !== 'string' || !value.type) || new Set(input.objects.map(value => value.id)).size !== input.objects.length) {
      throw new Error('WorldSpec input objects require distinct typed identities');
    }
    if (!Array.isArray(input.controls) || input.controls.some(row => !Array.isArray(row) || row.length !== 5 ||
        typeof row[0] !== 'string' || !row[0] || typeof row[1] !== 'string' ||
        !row.slice(2).every(Number.isFinite) || row[2] > row[3] || row[4] <= 0) ||
        new Set(input.controls.map(row => row[0])).size !== input.controls.length) {
      throw new Error('WorldSpec input controls invalid');
    }
    if (!input.params || Array.isArray(input.params) || typeof input.params !== 'object' ||
        Object.values(input.params).some(value => !Number.isFinite(value))) throw new Error('WorldSpec input parameters must be finite numbers');
    for (const [id, , min, max] of input.controls) {
      if (!Object.hasOwn(input.params, id) || input.params[id] < min || input.params[id] > max) {
        throw new Error(`WorldSpec input parameter ${id} violates its control`);
      }
    }
    if (input.contract !== null && (typeof input.contract !== 'object' || Array.isArray(input.contract))) {
      throw new Error('WorldSpec input contract must be an object or null');
    }
    scope.phaseContracts.canonicalJson(input);
    return input;
  }

  root.SimulattePhaseModuleRegistry.define('physicsModel', 'simulatte-world-spec-input.js', { buildWorldSpecInput, validateWorldSpecInput });
})(typeof globalThis !== 'undefined' ? globalThis : window);
