(function attachPluginContracts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginContractsModule() {
  const SDK_VERSION = 1;
  const PERMISSIONS = Object.freeze([
    'capabilities.invoke.v1', 'clock.read.v1', 'events.propose.v1', 'language.parse.v1', 'receipts.append.v1',
    'routing.contribute.v1', 'simulation.run.v1', 'state.reduce.v1', 'ui.inspector.v1', 'world.query.v1',
  ]);
  const EXTENSION_POINTS = Object.freeze(['request', 'route', 'event', 'settlement', 'ui']);
  const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const INTEGRITY_PATTERN = /^sha384-[a-f0-9]{96}$/;

  function validateManifest(value) {
    assertObject(value, 'plugin_manifest_invalid', 'Plugin manifest expected an object');
    assertExactKeys(value, ['schema', 'id', 'version', 'sdkVersion', 'entry', 'resources', 'permissions', 'datasets', 'provides', 'consumes', 'extensionPoints', 'receiptSchemas', 'configSchema', 'defaultConfig'], `Plugin manifest ${value.id || 'missing'}`);
    equal(value.schema, 'simulatte.pluginManifest.v1', 'plugin_manifest_schema_invalid', 'Plugin manifest schema');
    if (!ID_PATTERN.test(value.id || '')) fail('plugin_manifest_id_invalid', `Plugin manifest ID ${value.id || 'missing'} is invalid`, { id: value.id || null });
    if (!/^\d+\.\d+\.\d+$/.test(value.version || '')) fail('plugin_manifest_version_invalid', `Plugin ${value.id} version is invalid`, { version: value.version });
    equal(value.sdkVersion, SDK_VERSION, 'plugin_sdk_version_unsupported', `Plugin ${value.id} SDK version`);
    assertObject(value.entry, 'plugin_entry_invalid', `Plugin ${value.id} entry expected an object`);
    assertExactKeys(value.entry, ['path', 'integrity', 'globalFactory'], `Plugin ${value.id} entry`);
    text(value.entry.path, 'plugin_entry_path_invalid', `Plugin ${value.id} entry path`);
    text(value.entry.globalFactory, 'plugin_entry_factory_invalid', `Plugin ${value.id} global factory`);
    if (!INTEGRITY_PATTERN.test(value.entry.integrity || '')) fail('plugin_entry_integrity_invalid', `Plugin ${value.id} entry integrity is invalid`, { integrity: value.entry.integrity || null });
    if (!Array.isArray(value.resources)) fail('plugin_resources_invalid', `Plugin ${value.id} resources expected an array`, null);
    const resourcePaths = new Set();
    value.resources.forEach((resource) => {
      assertExactKeys(resource, ['path', 'integrity'], `Plugin ${value.id} resource`);
      text(resource.path, 'plugin_resource_path_invalid', `Plugin ${value.id} resource path`);
      if (!INTEGRITY_PATTERN.test(resource.integrity || '')) fail('plugin_resource_integrity_invalid', `Plugin ${value.id} resource ${resource.path} integrity is invalid`, { integrity: resource.integrity || null });
      if (resourcePaths.has(resource.path)) fail('plugin_resource_duplicate', `Plugin ${value.id} duplicates resource ${resource.path}`, { pluginId: value.id, path: resource.path });
      resourcePaths.add(resource.path);
    });
    if (!resourcePaths.has(value.configSchema) || !resourcePaths.has(value.defaultConfig)) fail('plugin_config_resource_missing', `Plugin ${value.id} must identity-lock its config schema and default config`, { pluginId: value.id });
    validateUniqueText(value.permissions, `Plugin ${value.id} permissions`);
    value.permissions.forEach((permission) => { if (!PERMISSIONS.includes(permission)) fail('plugin_permission_unknown', `Plugin ${value.id} requests unknown permission ${permission}`, { pluginId: value.id, permission }); });
    validateDeclarations(value.datasets, `Plugin ${value.id} datasets`);
    validateUniqueText(value.provides, `Plugin ${value.id} provides`);
    validateDeclarations(value.consumes, `Plugin ${value.id} consumes`);
    validateUniqueText(value.extensionPoints, `Plugin ${value.id} extension points`);
    value.extensionPoints.forEach((point) => { if (!EXTENSION_POINTS.includes(point)) fail('plugin_extension_unknown', `Plugin ${value.id} declares unknown extension point ${point}`, { pluginId: value.id, point }); });
    validateUniqueText(value.receiptSchemas, `Plugin ${value.id} receipt schemas`);
    text(value.configSchema, 'plugin_config_schema_invalid', `Plugin ${value.id} config schema`);
    text(value.defaultConfig, 'plugin_default_config_invalid', `Plugin ${value.id} default config`);
    return value;
  }

  function validateProfile(value) {
    assertObject(value, 'application_profile_invalid', 'Application profile expected an object');
    assertExactKeys(value, ['schema', 'id', 'plugins', 'routeObjective'], `Application profile ${value.id || 'missing'}`);
    equal(value.schema, 'simulatte.applicationProfile.v1', 'application_profile_schema_invalid', 'Application profile schema');
    text(value.id, 'application_profile_id_invalid', 'Application profile ID');
    if (!Array.isArray(value.plugins)) fail('application_profile_plugins_invalid', `Profile ${value.id} plugins expected an array`, null);
    const ids = new Set();
    value.plugins.forEach((row, index) => {
      assertObject(row, 'application_profile_plugin_invalid', `Profile ${value.id} plugin ${index} expected an object`);
      assertExactKeys(row, ['id', 'configId'], `Profile ${value.id} plugin ${index}`);
      text(row.id, 'application_profile_plugin_id_invalid', `Profile ${value.id} plugin ${index} ID`);
      text(row.configId, 'application_profile_config_id_invalid', `Profile ${value.id} plugin ${row.id} config ID`);
      if (ids.has(row.id)) fail('application_profile_plugin_duplicate', `Profile ${value.id} duplicates plugin ${row.id}`, { pluginId: row.id });
      ids.add(row.id);
    });
    assertObject(value.routeObjective, 'application_profile_objective_invalid', `Profile ${value.id} route objective expected an object`);
    Object.entries(value.routeObjective).forEach(([key, weight]) => {
      if (!Number.isFinite(weight) || weight < 0) fail('application_profile_weight_invalid', `Profile ${value.id} route weight ${key} expected a non-negative number`, { key, weight });
    });
    return value;
  }

  function validatePluginInstance(pluginId, value) {
    assertObject(value, 'plugin_instance_invalid', `Plugin ${pluginId} activation expected an instance`);
    if (value.id !== pluginId) fail('plugin_instance_id_mismatch', `Plugin ${pluginId} activated as ${value.id || 'missing'}`, { expected: pluginId, actual: value.id || null });
    ['contributeRequest', 'createRouteContributor', 'settle', 'view', 'dispose', 'reduce', 'handleAction'].forEach((method) => {
      if (value[method] !== undefined && typeof value[method] !== 'function') fail('plugin_instance_method_invalid', `Plugin ${pluginId}.${method} expected a function`, { pluginId, method });
    });
    if (value.capabilities !== undefined && (!value.capabilities || typeof value.capabilities !== 'object' || Array.isArray(value.capabilities))) fail('plugin_instance_capabilities_invalid', `Plugin ${pluginId}.capabilities expected an object`, { pluginId });
    return value;
  }

  function validateRequestContribution(pluginId, value) {
    assertObject(value, 'plugin_request_contribution_invalid', `Plugin ${pluginId} request contribution expected an object`);
    assertAllowedKeys(
      value,
      ['recognized', 'obligations', 'unresolved', 'executableSourceText', 'missionPatch'],
      ['recognized', 'obligations', 'unresolved'],
      `Plugin ${pluginId} request contribution`
    );
    if (typeof value.recognized !== 'boolean') fail('plugin_request_recognized_invalid', `Plugin ${pluginId} recognized expected a boolean`, { pluginId });
    if (!Array.isArray(value.obligations)) fail('plugin_request_obligations_invalid', `Plugin ${pluginId} obligations expected an array`, { pluginId });
    value.obligations.forEach((obligation, index) => {
      assertExactKeys(obligation, ['id', 'kind', 'required'], `Plugin ${pluginId} obligation ${index}`);
      text(obligation.id, 'plugin_obligation_id_invalid', `Plugin ${pluginId} obligation ${index} ID`);
      text(obligation.kind, 'plugin_obligation_kind_invalid', `Plugin ${pluginId} obligation ${obligation.id} kind`);
      if (typeof obligation.required !== 'boolean') fail('plugin_obligation_required_invalid', `Plugin ${pluginId} obligation ${obligation.id} required expected a boolean`, { pluginId, obligationId: obligation.id });
    });
    if (!Array.isArray(value.unresolved) || value.unresolved.some((row) => typeof row !== 'string' || !row)) fail('plugin_request_unresolved_invalid', `Plugin ${pluginId} unresolved expected non-empty strings`, { pluginId });
    if (value.executableSourceText !== undefined) text(value.executableSourceText, 'plugin_executable_source_invalid', `Plugin ${pluginId} executable source`);
    if (value.missionPatch !== undefined) validateMissionPatch(pluginId, value.missionPatch);
    return value;
  }

  function validateMissionPatch(pluginId, value) {
    assertExactKeys(value, ['routeOverride'], `Plugin ${pluginId} mission patch`);
    const route = value.routeOverride;
    assertObject(route, 'plugin_route_override_invalid', `Plugin ${pluginId} route override expected an object`);
    assertAllowedKeys(route, ['segmentIds', 'environmentFieldId', 'selectionId', 'objective', 'algorithm'], ['segmentIds', 'selectionId', 'objective', 'algorithm'], `Plugin ${pluginId} route override`);
    if (!Array.isArray(route.segmentIds) || !route.segmentIds.length || route.segmentIds.some((id) => typeof id !== 'string' || !id)) fail('plugin_route_segments_invalid', `Plugin ${pluginId} route override expected segment IDs`, { pluginId });
    if (new Set(route.segmentIds).size !== route.segmentIds.length) fail('plugin_route_segments_duplicate', `Plugin ${pluginId} route override repeats segment IDs`, { pluginId, segmentIds: route.segmentIds });
    ['selectionId', 'algorithm'].forEach((key) => text(route[key], 'plugin_route_override_text_invalid', `Plugin ${pluginId} route override ${key}`));
    if (route.environmentFieldId !== undefined) text(route.environmentFieldId, 'plugin_route_override_environment_invalid', `Plugin ${pluginId} route override environment field ID`);
    if (!Number.isFinite(route.objective)) fail('plugin_route_override_objective_invalid', `Plugin ${pluginId} route override objective expected a finite number`, { pluginId, objective: route.objective });
  }

  function validateUiContribution(pluginId, value) {
    if (value === null) return null;
    assertObject(value, 'plugin_ui_invalid', `Plugin ${pluginId} UI expected an object`);
    assertAllowedKeys(value, ['slot', 'title', 'rows', 'fields', 'actions'], ['slot', 'title', 'rows', 'actions'], `Plugin ${pluginId} UI`);
    if (value.slot !== 'inspector') fail('plugin_ui_slot_invalid', `Plugin ${pluginId} UI slot must be inspector`, { slot: value.slot });
    text(value.title, 'plugin_ui_title_invalid', `Plugin ${pluginId} UI title`);
    if (!Array.isArray(value.rows) || !Array.isArray(value.actions)) fail('plugin_ui_rows_invalid', `Plugin ${pluginId} UI expected rows and actions`, null);
    value.rows.forEach((row) => { assertExactKeys(row, ['label', 'value'], `Plugin ${pluginId} UI row`); text(row.label, 'plugin_ui_label_invalid', `Plugin ${pluginId} UI row label`); text(String(row.value), 'plugin_ui_value_invalid', `Plugin ${pluginId} UI row value`); });
    const fields = value.fields || [];
    if (!Array.isArray(fields)) fail('plugin_ui_fields_invalid', `Plugin ${pluginId} UI fields expected an array`, null);
    fields.forEach((row) => {
      assertAllowedKeys(row, ['id', 'label', 'type', 'value', 'options'], ['id', 'label', 'type', 'value'], `Plugin ${pluginId} UI field`);
      text(row.id, 'plugin_ui_field_id_invalid', `Plugin ${pluginId} UI field ID`);
      text(row.label, 'plugin_ui_field_label_invalid', `Plugin ${pluginId} UI field label`);
      if (!['text', 'date', 'select', 'number'].includes(row.type)) fail('plugin_ui_field_type_invalid', `Plugin ${pluginId} UI field ${row.id} has unsupported type ${row.type}`, { pluginId, fieldId: row.id, type: row.type });
      if (row.type === 'select') {
        if (!Array.isArray(row.options) || !row.options.length) fail('plugin_ui_field_options_invalid', `Plugin ${pluginId} select ${row.id} expected options`, { pluginId, fieldId: row.id });
        row.options.forEach((option) => { assertExactKeys(option, ['value', 'label'], `Plugin ${pluginId} select option`); text(String(option.value), 'plugin_ui_field_option_invalid', `Plugin ${pluginId} select option value`); text(option.label, 'plugin_ui_field_option_invalid', `Plugin ${pluginId} select option label`); });
      } else if (row.options !== undefined) fail('plugin_ui_field_options_unexpected', `Plugin ${pluginId} field ${row.id} cannot declare options`, { pluginId, fieldId: row.id });
    });
    value.actions.forEach((row) => { assertExactKeys(row, ['id', 'label'], `Plugin ${pluginId} UI action`); text(row.id, 'plugin_ui_action_id_invalid', `Plugin ${pluginId} UI action ID`); text(row.label, 'plugin_ui_action_label_invalid', `Plugin ${pluginId} UI action label`); });
    return value;
  }

  function validateDeclarations(rows, label) {
    if (!Array.isArray(rows)) fail('plugin_declarations_invalid', `${label} expected an array`, null);
    const ids = new Set();
    rows.forEach((row) => {
      assertObject(row, 'plugin_declaration_invalid', `${label} entry expected an object`);
      const expectedKeys = row.reference ? ['id', 'required', 'reference'] : ['id', 'required'];
      assertExactKeys(row, expectedKeys, `${label} entry`);
      text(row.id, 'plugin_declaration_id_invalid', `${label} entry ID`);
      if (typeof row.required !== 'boolean') fail('plugin_declaration_required_invalid', `${label} ${row.id} required expected a boolean`, null);
      if (row.reference) {
        assertExactKeys(row.reference, ['id', 'path', 'sha256', 'schemaId'], `${label} ${row.id} reference`);
        if (row.reference.id !== row.id) fail('plugin_dataset_reference_id_mismatch', `${label} ${row.id} reference ID is ${row.reference.id || 'missing'}`, { id: row.id, referenceId: row.reference.id || null });
        ['path', 'sha256', 'schemaId'].forEach((field) => text(row.reference[field], 'plugin_dataset_reference_invalid', `${label} ${row.id} reference ${field}`));
      }
      if (ids.has(row.id)) fail('plugin_declaration_duplicate', `${label} duplicates ${row.id}`, { id: row.id });
      ids.add(row.id);
    });
  }

  function validateUniqueText(rows, label) {
    if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'string' || !row) || new Set(rows).size !== rows.length) fail('plugin_text_list_invalid', `${label} expected unique non-empty strings`, null);
  }

  function assertExactKeys(value, keys, label) {
    assertObject(value, 'plugin_contract_object_invalid', `${label} expected an object`);
    const expected = [...keys].sort();
    const actual = Object.keys(value).sort();
    if (expected.join('|') !== actual.join('|')) fail('plugin_contract_keys_invalid', `${label} expected keys ${expected.join(', ')}, received ${actual.join(', ')}`, { expected, actual });
  }

  function assertAllowedKeys(value, allowedKeys, requiredKeys, label) {
    assertObject(value, 'plugin_contract_object_invalid', `${label} expected an object`);
    const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
    const missing = requiredKeys.filter((key) => !Object.hasOwn(value, key));
    if (unexpected.length || missing.length) fail('plugin_contract_keys_invalid', `${label} has missing or unexpected keys`, { allowed: [...allowedKeys].sort(), required: [...requiredKeys].sort(), unexpected: unexpected.sort(), missing: missing.sort() });
  }

  function assertObject(value, code, message) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, null);
  }

  function equal(actual, expected, code, label) {
    if (actual !== expected) fail(code, `${label} expected ${expected}, received ${actual ?? 'missing'}`, { expected, actual: actual ?? null });
  }

  function text(value, code, label) {
    if (typeof value !== 'string' || !value) fail(code, `${label} expected non-empty text`, { value: value ?? null });
  }

  function fail(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginContractError';
    error.code = code;
    error.evidence = evidence;
    throw error;
  }

  return { EXTENSION_POINTS, PERMISSIONS, SDK_VERSION, validateManifest, validateProfile, validatePluginInstance, validateRequestContribution, validateUiContribution };
});
