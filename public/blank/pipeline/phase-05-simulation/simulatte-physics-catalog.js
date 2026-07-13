(function attachSimulattePhysicsCatalog(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-physics-catalog-dependencies.js');
    require('./simulatte-physics-catalog-constants.js');
    require('./simulatte-physics-catalog-templates.js');
    require('./simulatte-physics-catalog-primitive-data.js');
    require('./simulatte-physics-catalog-materials.js');
    require('./simulatte-physics-catalog-graph-data.js');
    require('./simulatte-physics-catalog-examples.js');
    require('./simulatte-physics-catalog-graph-helpers.js');
  }
  const scope = root.__SimulattePhysicsCatalogRefactorScope = root.__SimulattePhysicsCatalogRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    BASE_CATALOG_ITEMS,
    COMPILER_INPUT_PLANE,
    CONSERVATION_RULES,
    CONTROL_LIBRARY,
    COMPONENT_LIBRARY,
    COMPOSITION_LIBRARY,
    CONTEXTUAL_READOUT_RULES,
    DEFAULT_PARAMS,
    EXAMPLE_INTENTS,
    FIELD_GRID,
    GEOMETRY_OVERRIDES,
    GEOMETRY_PROFILES,
    INTERACTION_RULES,
    LAYERED_PRIMITIVES,
    LAYER_INDEX,
    LAYER_STACK,
    MATERIAL_PRIMITIVE_LIBRARY,
    MATERIAL_PROFILES,
    MATERIAL_PROPERTY_DEFAULTS,
    MATERIAL_PROPERTY_SCHEMA,
    MATH_PRIMITIVE_LIBRARY,
    OPERATOR_MATCHES,
    OPERATOR_REGISTRY,
    PARAM_UNIT_SCHEMA,
    PHYSICAL_PRIMITIVES,
    PHYSICS_PRIMITIVE_LIBRARY,
    PORT_PROFILES,
    PROCEDURAL_VISUAL_BASE,
    HANDWRITTEN_EXAMPLE_PROMPTS,
    SEMANTIC_VISUAL_ATLAS,
    PRIMITIVE_LIBRARY,
    RECIPE_SLOT_LIBRARY,
    SCENE_LAYOUTS,
    SCENE_LIBRARY,
    SEMANTIC_STOPWORDS,
    TAU,
    TEMPLATE_LIBRARY,
    TEMPORAL_GRAMMAR,
    TOKEN_SYNONYMS,
    buildIntentVector,
    clamp,
    clamp01,
    classifyPromptLayer,
    compileGraphIR,
    conservationForPrimitives,
    contractForPrimitive,
    contractSummaryForPrimitives,
    controlsByKey,
    controlsForSpec,
    explicitPrimitiveScore,
    geometryForPrimitive,
    graphEdgesForNodes,
    graphNodeForPrimitive,
    ACTION_VISUAL_SLOT_TARGETS,
    visualSlotTargetsForAction,
    hashNoise,
    isRetrievablePrimitive,
    labelize,
    layerForId,
    layoutForPrimitives,
    lowerLayerFor,
    meaningfulTokens,
    materialPropertiesForId,
    matchingInteractionRules,
    normalizeControl,
    normalizeObjects,
    normalizeParams,
    operatorsForPrimitives,
    portsForPrimitive,
    primitiveById,
    primitiveTokenSet,
    primitiveText,
    rankPhysicalPrimitives,
    readoutsForPrimitives,
    recipeSlotsForId,
    shortestAngle,
    slugify,
    stateForPrimitive,
    templateById,
    temporalEventsForPrimitives,
    toCatalogItem,
    uniqueCatalogItems,
    uniqueList,
    unitsForParams,
    validateGraphIR,
    validateLayerAdjacency,
    vectorScore,
    withPrimitiveDependencies,
    wrapAngle,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulattePhysicsCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
