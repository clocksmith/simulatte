(function attachPluginContracts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginContractsModule() {
  const SDK_VERSION = 1;
  // SDK v2 is additive: it unlocks the simulation-substrate ports (random streams,
  // scheduler, compute, environment, geography) plus geospatial presentation. v1
  // manifests remain valid and see none of the new ports.
  const SUPPORTED_SDK_VERSIONS = Object.freeze([1, 2]);
  const PERMISSIONS = Object.freeze([
    'capabilities.invoke.v1', 'clock.read.v1', 'events.propose.v1', 'language.parse.v1', 'receipts.append.v1',
    'routing.contribute.v1', 'simulation.run.v1', 'state.reduce.v1', 'ui.inspector.v1', 'world.query.v1',
    // SDK v2 simulation-substrate ports.
    'random.stream.v1', 'simulation.schedule.v1', 'compute.worker.v1', 'environment.read.v1',
    'geography.project.v1', 'ui.geospatial.v1', 'tier.query.v1',
  ]);
  const EXTENSION_POINTS = Object.freeze(['request', 'route', 'event', 'settlement', 'ui', 'presentation']);
  const UI_SLOTS = Object.freeze(['inspector', 'map', 'hud']);
  const PRESENTATION_TONES = Object.freeze(['cyan', 'green', 'amber', 'red', 'magenta', 'violet', 'blue', 'shade', 'muted']);
  const ACTOR_KINDS = Object.freeze(['pedestrian', 'bicycle', 'scooter', 'car']);
  const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const INTEGRITY_PATTERN = /^sha384-[a-f0-9]{96}$/;

  function validateManifest(value) {
    assertObject(value, 'plugin_manifest_invalid', 'Plugin manifest expected an object');
    assertExactKeys(value, ['schema', 'id', 'version', 'sdkVersion', 'entry', 'resources', 'permissions', 'datasets', 'provides', 'consumes', 'extensionPoints', 'receiptSchemas', 'configSchema', 'defaultConfig'], `Plugin manifest ${value.id || 'missing'}`);
    if (!['simulatte.pluginManifest.v1', 'simulatte.pluginManifest.v2'].includes(value.schema)) fail('plugin_manifest_schema_invalid', `Plugin manifest schema ${value.schema || 'missing'} is invalid`, null);
    if (!ID_PATTERN.test(value.id || '')) fail('plugin_manifest_id_invalid', `Plugin manifest ID ${value.id || 'missing'} is invalid`, { id: value.id || null });
    if (!/^\d+\.\d+\.\d+$/.test(value.version || '')) fail('plugin_manifest_version_invalid', `Plugin ${value.id} version is invalid`, { version: value.version });
    if (!SUPPORTED_SDK_VERSIONS.includes(value.sdkVersion)) fail('plugin_sdk_version_unsupported', `Plugin ${value.id} SDK version ${value.sdkVersion ?? 'missing'} is unsupported`, { supported: SUPPORTED_SDK_VERSIONS, sdkVersion: value.sdkVersion ?? null });
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
    const isV2 = value.schema === 'simulatte.applicationProfile.v2';
    const isV3 = value.schema === 'simulatte.applicationProfile.v3';
    const isSeeded = isV2 || isV3;
    const allowedKeys = isSeeded
      ? ['schema', 'id', 'plugins', 'routeObjective', 'camera', 'interaction', 'defaultSeedId', 'seeds']
      : ['schema', 'id', 'plugins', 'routeObjective', 'defaultMissionText', 'missionExamples', 'camera'];
    const requiredKeys = isSeeded
      ? ['schema', 'id', 'plugins', 'routeObjective', 'interaction', 'defaultSeedId', 'seeds']
      : ['schema', 'id', 'plugins', 'routeObjective'];
    assertAllowedKeys(value, allowedKeys, requiredKeys, `Application profile ${value.id || 'missing'}`);
    if (!['simulatte.applicationProfile.v1', 'simulatte.applicationProfile.v2', 'simulatte.applicationProfile.v3'].includes(value.schema)) fail('application_profile_schema_invalid', `Application profile schema ${value.schema || 'missing'} is unsupported`, null);
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
    if (!isV2 && value.defaultMissionText !== undefined) text(value.defaultMissionText, 'application_profile_mission_invalid', `Profile ${value.id} default mission`);
    if (!isV2 && value.missionExamples !== undefined) {
      if (!Array.isArray(value.missionExamples) || value.missionExamples.length < 2 || new Set(value.missionExamples).size !== value.missionExamples.length) fail('application_profile_examples_invalid', `Profile ${value.id} mission examples expected at least two unique rows`, null);
      value.missionExamples.forEach((row) => text(row, 'application_profile_example_invalid', `Profile ${value.id} mission example`));
      if (value.defaultMissionText !== undefined && !value.missionExamples.includes(value.defaultMissionText)) fail('application_profile_default_example_missing', `Profile ${value.id} examples must include its default mission`, null);
    }
    if (isV3) validateProfileScenarioInteraction(value);
    else if (isV2) validateProfileInteraction(value);
    if (value.camera !== undefined) {
      assertAllowedKeys(value.camera, ['initialMode', 'runMode', 'pluginId', 'targetId'], ['initialMode', 'runMode'], `Profile ${value.id} camera`);
      if (!['follow', 'bird', 'top'].includes(value.camera.initialMode) || !['follow', 'bird', 'top'].includes(value.camera.runMode)) fail('application_profile_camera_mode_invalid', `Profile ${value.id} camera modes are invalid`, value.camera);
      if ((value.camera.pluginId === undefined) !== (value.camera.targetId === undefined)) fail('application_profile_camera_target_invalid', `Profile ${value.id} camera expected pluginId and targetId together`, value.camera);
      if (value.camera.pluginId !== undefined) {
        text(value.camera.pluginId, 'application_profile_camera_target_invalid', `Profile ${value.id} camera plugin`);
        text(value.camera.targetId, 'application_profile_camera_target_invalid', `Profile ${value.id} camera target`);
        if (!value.plugins.some((row) => row.id === value.camera.pluginId)) fail('application_profile_camera_plugin_inactive', `Profile ${value.id} camera targets inactive plugin ${value.camera.pluginId}`, value.camera);
      }
    }
    return value;
  }

  function validatePluginInstance(pluginId, value) {
    assertObject(value, 'plugin_instance_invalid', `Plugin ${pluginId} activation expected an instance`);
    if (value.id !== pluginId) fail('plugin_instance_id_mismatch', `Plugin ${pluginId} activated as ${value.id || 'missing'}`, { expected: pluginId, actual: value.id || null });
    ['contributeRequest', 'createRouteContributor', 'settle', 'view', 'present', 'dispose', 'reduce', 'handleAction', 'setScenario'].forEach((method) => {
      if (value[method] !== undefined && typeof value[method] !== 'function') fail('plugin_instance_method_invalid', `Plugin ${pluginId}.${method} expected a function`, { pluginId, method });
    });
    if (value.capabilities !== undefined && (!value.capabilities || typeof value.capabilities !== 'object' || Array.isArray(value.capabilities))) fail('plugin_instance_capabilities_invalid', `Plugin ${pluginId}.capabilities expected an object`, { pluginId });
    return value;
  }

  function validateProfileInteraction(value) {
    assertObject(value.interaction, 'application_profile_interaction_invalid', `Profile ${value.id} interaction expected an object`);
    assertExactKeys(value.interaction, ['mode', 'startLabel', 'shuffleLabel'], `Profile ${value.id} interaction`);
    if (!['explorer', 'form', 'playback', 'request', 'route'].includes(value.interaction.mode)) fail('application_profile_interaction_mode_invalid', `Profile ${value.id} interaction mode is invalid`, value.interaction);
    text(value.interaction.startLabel, 'application_profile_interaction_label_invalid', `Profile ${value.id} start label`);
    text(value.interaction.shuffleLabel, 'application_profile_interaction_label_invalid', `Profile ${value.id} shuffle label`);
    if (!Array.isArray(value.seeds) || value.seeds.length < 2) fail('application_profile_seeds_invalid', `Profile ${value.id} expected at least two seeds`, null);
    const ids = new Set();
    const seeds = new Set();
    value.seeds.forEach((row, index) => {
      assertObject(row, 'application_profile_seed_invalid', `Profile ${value.id} seed ${index} expected an object`);
      assertExactKeys(row, ['id', 'label', 'description', 'seed', 'missionText'], `Profile ${value.id} seed ${index}`);
      ['id', 'label', 'description', 'seed', 'missionText'].forEach((key) => text(row[key], 'application_profile_seed_invalid', `Profile ${value.id} seed ${index} ${key}`));
      if (ids.has(row.id) || seeds.has(row.seed)) fail('application_profile_seed_duplicate', `Profile ${value.id} seed IDs and values must be unique`, { id: row.id, seed: row.seed });
      ids.add(row.id); seeds.add(row.seed);
    });
    text(value.defaultSeedId, 'application_profile_default_seed_invalid', `Profile ${value.id} default seed`);
    if (!ids.has(value.defaultSeedId)) fail('application_profile_default_seed_missing', `Profile ${value.id} default seed is not declared`, { defaultSeedId: value.defaultSeedId });
  }

  function validateProfileScenarioInteraction(value) {
    assertObject(value.interaction, 'application_profile_interaction_invalid', `Profile ${value.id} interaction expected an object`);
    if (!['scenario', 'simulation'].includes(value.interaction.mode)) fail('application_profile_interaction_mode_invalid', `Profile ${value.id} interaction mode is invalid`, value.interaction);
    text(value.interaction.startLabel, 'application_profile_interaction_label_invalid', `Profile ${value.id} start label`);
    text(value.interaction.shuffleLabel, 'application_profile_interaction_label_invalid', `Profile ${value.id} shuffle label`);
    if (value.interaction.simulationOwnerPluginId !== undefined) {
      text(value.interaction.simulationOwnerPluginId, 'application_profile_interaction_owner_invalid', `Profile ${value.id} simulation owner`);
      if (!value.plugins.some((row) => row.id === value.interaction.simulationOwnerPluginId)) fail('application_profile_interaction_owner_inactive', `Profile ${value.id} simulation owner ${value.interaction.simulationOwnerPluginId} is not an active plugin`, { owner: value.interaction.simulationOwnerPluginId });
    }
    if (!Array.isArray(value.seeds) || value.seeds.length < 1) fail('application_profile_seeds_invalid', `Profile ${value.id} expected at least one seed`, null);
    const ids = new Set();
    const seeds = new Set();
    value.seeds.forEach((row, index) => {
      assertObject(row, 'application_profile_seed_invalid', `Profile ${value.id} seed ${index} expected an object`);
      ['id', 'label', 'description', 'seed'].forEach((key) => text(row[key], 'application_profile_seed_invalid', `Profile ${value.id} seed ${index} ${key}`));
      if (ids.has(row.id) || seeds.has(row.seed)) fail('application_profile_seed_duplicate', `Profile ${value.id} seed IDs and values must be unique`, { id: row.id, seed: row.seed });
      ids.add(row.id); seeds.add(row.seed);
    });
    text(value.defaultSeedId, 'application_profile_default_seed_invalid', `Profile ${value.id} default seed`);
    if (!ids.has(value.defaultSeedId)) fail('application_profile_default_seed_missing', `Profile ${value.id} default seed is not declared`, { defaultSeedId: value.defaultSeedId });
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
    if (!UI_SLOTS.includes(value.slot)) fail('plugin_ui_slot_invalid', `Plugin ${pluginId} UI slot expected ${UI_SLOTS.join(', ')}`, { slot: value.slot });
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
    value.actions.forEach((row) => {
      assertAllowedKeys(row, ['id', 'label', 'command'], ['id', 'label'], `Plugin ${pluginId} UI action`);
      text(row.id, 'plugin_ui_action_id_invalid', `Plugin ${pluginId} UI action ID`);
      text(row.label, 'plugin_ui_action_label_invalid', `Plugin ${pluginId} UI action label`);
      if (row.command !== undefined) validateUiCommand(pluginId, row.command);
    });
    return value;
  }

  function validateUiCommand(pluginId, value) {
    assertExactKeys(value, ['kind', 'targetId'], `Plugin ${pluginId} UI command`);
    equal(value.kind, 'camera.focus', 'plugin_ui_command_kind_invalid', `Plugin ${pluginId} UI command kind`);
    text(value.targetId, 'plugin_ui_command_target_invalid', `Plugin ${pluginId} UI command target`);
  }

  function validatePresentationContribution(pluginId, value) {
    assertObject(value, 'plugin_presentation_invalid', `Plugin ${pluginId} presentation expected an object`);
    if (value.schema === 'simulatte.pluginPresentation.v1') {
      assertExactKeys(value, ['schema', 'markers', 'paths', 'actors', 'cameraTargets'], `Plugin ${pluginId} presentation`);
    } else if (value.schema === 'simulatte.pluginPresentation.v2') {
      assertExactKeys(value, ['schema', 'markers', 'paths', 'actors', 'areas', 'sun', 'cameraTargets'], `Plugin ${pluginId} presentation`);
      boundedRows(value.areas, 384, `Plugin ${pluginId} areas`).forEach((row) => {
        assertExactKeys(row, ['id', 'label', 'points', 'tone', 'heightM', 'intensity'], `Plugin ${pluginId} area`);
        validateIdentityAndTone(pluginId, row, 'area');
        if (!Array.isArray(row.points) || row.points.length < 3 || row.points.length > 128) fail('plugin_area_points_invalid', `Plugin ${pluginId} area ${row.id} expected 3..128 points`, { count: row.points?.length ?? null });
        row.points.forEach((point) => {
          assertExactKeys(point, ['x', 'y'], `Plugin ${pluginId} area ${row.id} point`);
          finiteRange(point.x, -10000000, 10000000, 'plugin_area_point_invalid', `Plugin ${pluginId} area ${row.id} point x`);
          finiteRange(point.y, -10000000, 10000000, 'plugin_area_point_invalid', `Plugin ${pluginId} area ${row.id} point y`);
        });
        finiteRange(row.heightM, 0, 20, 'plugin_area_height_invalid', `Plugin ${pluginId} area ${row.id} height`);
        finiteRange(row.intensity, 0, 2, 'plugin_area_intensity_invalid', `Plugin ${pluginId} area ${row.id} intensity`);
      });
      assertObject(value.sun, 'plugin_sun_invalid', `Plugin ${pluginId} sun expected an object`);
      assertExactKeys(value.sun, ['id', 'label', 'azimuthDegrees', 'elevationDegrees', 'anchorSegmentIds', 'distanceM', 'radiusM', 'intensity'], `Plugin ${pluginId} sun`);
      text(value.sun.id, 'plugin_sun_id_invalid', `Plugin ${pluginId} sun ID`);
      text(value.sun.label, 'plugin_sun_label_invalid', `Plugin ${pluginId} sun label`);
      finiteRange(value.sun.azimuthDegrees, 0, 360, 'plugin_sun_azimuth_invalid', `Plugin ${pluginId} sun azimuth`);
      finiteRange(value.sun.elevationDegrees, -5, 90, 'plugin_sun_elevation_invalid', `Plugin ${pluginId} sun elevation`);
      boundedIds(value.sun.anchorSegmentIds, 4096, `Plugin ${pluginId} sun anchor segments`);
      finiteRange(value.sun.distanceM, 50, 2000, 'plugin_sun_distance_invalid', `Plugin ${pluginId} sun distance`);
      finiteRange(value.sun.radiusM, 1, 100, 'plugin_sun_radius_invalid', `Plugin ${pluginId} sun radius`);
      finiteRange(value.sun.intensity, 0, 2, 'plugin_sun_intensity_invalid', `Plugin ${pluginId} sun intensity`);
    } else if (value.schema === 'simulatte.pluginPresentation.v3') {
      // Geospatial presentation. Geo primitives carry WGS84 longitude/latitude and are
      // projected by the host geography port against the active world, so a plugin can
      // present national geography without minting fake world node IDs. The world-node
      // primitives (markers/paths/actors) remain available and empty-by-default.
      assertExactKeys(value, ['schema', 'markers', 'paths', 'actors', 'geoMarkers', 'geoPaths', 'geoAreas', 'choropleths', 'geoCameraTargets', 'cameraTargets'], `Plugin ${pluginId} presentation`);
      boundedRows(value.geoMarkers, 1024, `Plugin ${pluginId} geo markers`).forEach((row) => {
        assertExactKeys(row, ['id', 'label', 'longitude', 'latitude', 'tone', 'heightM', 'radiusM', 'intensity'], `Plugin ${pluginId} geo marker`);
        validateIdentityAndTone(pluginId, row, 'geo_marker');
        validateLngLat(pluginId, row, 'geo marker');
        finiteRange(row.heightM, 0, 400, 'plugin_geo_marker_height_invalid', `Plugin ${pluginId} geo marker height`);
        finiteRange(row.radiusM, 0.2, 40000, 'plugin_geo_marker_radius_invalid', `Plugin ${pluginId} geo marker radius`);
        finiteRange(row.intensity, 0, 2, 'plugin_geo_marker_intensity_invalid', `Plugin ${pluginId} geo marker intensity`);
      });
      boundedRows(value.geoPaths, 512, `Plugin ${pluginId} geo paths`).forEach((row) => {
        assertExactKeys(row, ['id', 'label', 'coordinates', 'tone', 'widthM', 'intensity'], `Plugin ${pluginId} geo path`);
        validateIdentityAndTone(pluginId, row, 'geo_path');
        validateCoordinateRing(pluginId, row.coordinates, 2, 4096, `Plugin ${pluginId} geo path ${row.id}`);
        finiteRange(row.widthM, 0.2, 40000, 'plugin_geo_path_width_invalid', `Plugin ${pluginId} geo path width`);
        finiteRange(row.intensity, 0, 2, 'plugin_geo_path_intensity_invalid', `Plugin ${pluginId} geo path intensity`);
      });
      boundedRows(value.geoAreas, 1024, `Plugin ${pluginId} geo areas`).forEach((row) => {
        assertExactKeys(row, ['id', 'label', 'ring', 'tone', 'heightM', 'intensity'], `Plugin ${pluginId} geo area`);
        validateIdentityAndTone(pluginId, row, 'geo_area');
        validateCoordinateRing(pluginId, row.ring, 3, 512, `Plugin ${pluginId} geo area ${row.id}`);
        finiteRange(row.heightM, 0, 400, 'plugin_geo_area_height_invalid', `Plugin ${pluginId} geo area height`);
        finiteRange(row.intensity, 0, 2, 'plugin_geo_area_intensity_invalid', `Plugin ${pluginId} geo area intensity`);
      });
      boundedRows(value.choropleths, 1024, `Plugin ${pluginId} choropleths`).forEach((row) => {
        assertExactKeys(row, ['id', 'label', 'ring', 'value', 'tone', 'intensity'], `Plugin ${pluginId} choropleth`);
        validateIdentityAndTone(pluginId, row, 'choropleth');
        validateCoordinateRing(pluginId, row.ring, 3, 512, `Plugin ${pluginId} choropleth ${row.id}`);
        if (!Number.isFinite(row.value)) fail('plugin_choropleth_value_invalid', `Plugin ${pluginId} choropleth ${row.id} value expected a finite number`, { value: row.value });
        finiteRange(row.intensity, 0, 2, 'plugin_choropleth_intensity_invalid', `Plugin ${pluginId} choropleth intensity`);
      });
      boundedRows(value.geoCameraTargets, 32, `Plugin ${pluginId} geo camera targets`).forEach((row) => {
        assertExactKeys(row, ['id', 'label', 'longitude', 'latitude', 'distanceM'], `Plugin ${pluginId} geo camera target`);
        text(row.id, 'plugin_geo_camera_target_id_invalid', `Plugin ${pluginId} geo camera target ID`);
        text(row.label, 'plugin_geo_camera_target_label_invalid', `Plugin ${pluginId} geo camera target label`);
        validateLngLat(pluginId, row, 'geo camera target');
        finiteRange(row.distanceM, 80, 5000000, 'plugin_geo_camera_target_distance_invalid', `Plugin ${pluginId} geo camera target distance`);
      });
    } else {
      fail('plugin_presentation_schema_invalid', `Plugin ${pluginId} presentation schema is unsupported`, { schema: value.schema || null });
    }
    boundedRows(value.markers, 128, `Plugin ${pluginId} markers`).forEach((row) => {
      assertExactKeys(row, ['id', 'label', 'nodeId', 'tone', 'heightM', 'radiusM', 'intensity'], `Plugin ${pluginId} marker`);
      validateIdentityAndTone(pluginId, row, 'marker');
      text(row.nodeId, 'plugin_marker_node_invalid', `Plugin ${pluginId} marker node`);
      finiteRange(row.heightM, 0.2, 240, 'plugin_marker_height_invalid', `Plugin ${pluginId} marker height`);
      finiteRange(row.radiusM, 0.2, 40, 'plugin_marker_radius_invalid', `Plugin ${pluginId} marker radius`);
      finiteRange(row.intensity, 0, 2, 'plugin_marker_intensity_invalid', `Plugin ${pluginId} marker intensity`);
    });
    boundedRows(value.paths, 64, `Plugin ${pluginId} paths`).forEach((row) => {
      assertExactKeys(row, ['id', 'label', 'segmentIds', 'tone', 'widthM', 'intensity'], `Plugin ${pluginId} path`);
      validateIdentityAndTone(pluginId, row, 'path');
      boundedIds(row.segmentIds, 4096, `Plugin ${pluginId} path ${row.id} segments`);
      finiteRange(row.widthM, 0.2, 24, 'plugin_path_width_invalid', `Plugin ${pluginId} path width`);
      finiteRange(row.intensity, 0, 2, 'plugin_path_intensity_invalid', `Plugin ${pluginId} path intensity`);
    });
    boundedRows(value.actors, 64, `Plugin ${pluginId} actors`).forEach((row) => {
      assertExactKeys(row, ['id', 'label', 'kind', 'segmentIds', 'tone', 'speedMps', 'phaseOffsetM', 'isSelected'], `Plugin ${pluginId} actor`);
      validateIdentityAndTone(pluginId, row, 'actor');
      if (!ACTOR_KINDS.includes(row.kind)) fail('plugin_actor_kind_invalid', `Plugin ${pluginId} actor ${row.id} kind is invalid`, { kind: row.kind });
      boundedIds(row.segmentIds, 4096, `Plugin ${pluginId} actor ${row.id} segments`);
      finiteRange(row.speedMps, 0.1, 30, 'plugin_actor_speed_invalid', `Plugin ${pluginId} actor speed`);
      finiteRange(row.phaseOffsetM, 0, 100000, 'plugin_actor_phase_invalid', `Plugin ${pluginId} actor phase`);
      if (typeof row.isSelected !== 'boolean') fail('plugin_actor_selection_invalid', `Plugin ${pluginId} actor ${row.id} selection expected boolean`, null);
    });
    boundedRows(value.cameraTargets, 32, `Plugin ${pluginId} camera targets`).forEach((row) => {
      assertExactKeys(row, ['id', 'label', 'nodeIds', 'segmentIds', 'distanceM'], `Plugin ${pluginId} camera target`);
      text(row.id, 'plugin_camera_target_id_invalid', `Plugin ${pluginId} camera target ID`);
      text(row.label, 'plugin_camera_target_label_invalid', `Plugin ${pluginId} camera target label`);
      boundedIds(row.nodeIds, 128, `Plugin ${pluginId} camera target ${row.id} nodes`, true);
      boundedIds(row.segmentIds, 4096, `Plugin ${pluginId} camera target ${row.id} segments`, true);
      if (!row.nodeIds.length && !row.segmentIds.length) fail('plugin_camera_target_empty', `Plugin ${pluginId} camera target ${row.id} has no anchors`, null);
      finiteRange(row.distanceM, 80, 9000, 'plugin_camera_target_distance_invalid', `Plugin ${pluginId} camera target distance`);
    });
    return value;
  }

  function validateIdentityAndTone(pluginId, row, kind) {
    text(row.id, `plugin_${kind}_id_invalid`, `Plugin ${pluginId} ${kind} ID`);
    text(row.label, `plugin_${kind}_label_invalid`, `Plugin ${pluginId} ${kind} label`);
    if (!PRESENTATION_TONES.includes(row.tone)) fail(`plugin_${kind}_tone_invalid`, `Plugin ${pluginId} ${kind} ${row.id} tone is invalid`, { tone: row.tone });
  }

  function validateLngLat(pluginId, row, label) {
    finiteRange(row.longitude, -180, 180, 'plugin_geo_longitude_invalid', `Plugin ${pluginId} ${label} longitude`);
    finiteRange(row.latitude, -90, 90, 'plugin_geo_latitude_invalid', `Plugin ${pluginId} ${label} latitude`);
  }

  function validateCoordinateRing(pluginId, coordinates, minimum, maximum, label) {
    if (!Array.isArray(coordinates) || coordinates.length < minimum || coordinates.length > maximum) {
      fail('plugin_geo_ring_invalid', `${label} expected ${minimum}..${maximum} coordinates`, { count: coordinates?.length ?? null });
    }
    coordinates.forEach((point) => {
      assertExactKeys(point, ['longitude', 'latitude'], `${label} coordinate`);
      finiteRange(point.longitude, -180, 180, 'plugin_geo_longitude_invalid', `${label} coordinate longitude`);
      finiteRange(point.latitude, -90, 90, 'plugin_geo_latitude_invalid', `${label} coordinate latitude`);
    });
  }

  function boundedRows(rows, maximum, label) {
    if (!Array.isArray(rows) || rows.length > maximum) fail('plugin_presentation_rows_invalid', `${label} expected at most ${maximum} rows`, { count: rows?.length ?? null });
    return rows;
  }

  function boundedIds(rows, maximum, label, allowEmpty = false) {
    if (!Array.isArray(rows) || (!allowEmpty && !rows.length) || rows.length > maximum || rows.some((row) => typeof row !== 'string' || !row) || new Set(rows).size !== rows.length) {
      fail('plugin_presentation_ids_invalid', `${label} expected unique IDs within 0..${maximum}`, { count: rows?.length ?? null });
    }
  }

  function finiteRange(value, minimum, maximum, code, label) {
    if (!Number.isFinite(value) || value < minimum || value > maximum) fail(code, `${label} expected ${minimum}..${maximum}`, { value });
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

  return { EXTENSION_POINTS, PERMISSIONS, SDK_VERSION, SUPPORTED_SDK_VERSIONS, validateManifest, validatePresentationContribution, validateProfile, validatePluginInstance, validateRequestContribution, validateUiContribution };
});
