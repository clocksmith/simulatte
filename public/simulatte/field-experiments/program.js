(function (root, factory) {
  const world =
    typeof module === "object" && module.exports
      ? require("../../shared/contracts/world-spec.js")
      : root.SimulatteWorldSpec;
  const api = factory(world);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SimulatteFieldExperimentProgram = api;
})(globalThis, function (world) {
  function validateConfig(config) {
    const keys = [
      "schema",
      "version",
      "seed",
      "stepsPerFrame",
      "durationSteps",
      "modelTolerance",
      "id",
      "name",
      "question",
      "model",
      "modelId",
      "modelPath",
      "view",
      "timeUnit",
      "params",
      "actions",
      "measures",
      "sources",
      "boundary",
      "modelSources",
    ];
    if (
      !config ||
      keys.some((key) => !Object.hasOwn(config, key)) ||
      Object.keys(config).some((key) => !keys.includes(key)) ||
      config.schema !== "simulatte.fieldExperiment.v1"
    )
      throw Error("field_configuration_contract_invalid");
    for (const key of ["seed", "stepsPerFrame", "durationSteps"])
      if (!Number.isInteger(config[key]) || config[key] < 1)
        throw Error("field_configuration_integer_invalid: " + key);
    if (
      config.durationSteps > 20000 ||
      config.stepsPerFrame > 32 ||
      !(config.modelTolerance > 0) ||
      !Array.isArray(config.actions) ||
      !config.actions.length ||
      !Array.isArray(config.modelSources) ||
      !config.modelSources.length
    )
      throw Error("field_configuration_bounds_invalid");
    for (const source of config.modelSources)
      if (
        !/^[a-f0-9]{64}$/.test(source.sha256) ||
        !source.path.startsWith("../../shared/core/simulation/")
      )
        throw Error("field_model_source_invalid");
  }
  function create(config) {
    validateConfig(config);
    return world.finalizeWorldSpec({
      id: config.id,
      templateId: config.id,
      kind: "field-experiment",
      name: config.name,
      description: config.question,
      modules: [
        {
          id: config.modelId,
          backend: "fixed-step-cpu",
          version: config.version,
        },
      ],
      objects: [{ id: "experiment", kind: config.view }],
      controls: config.actions.map((a) => ({
        id: a.kind,
        parameterPath: "/params/actions",
      })),
      params: { model: structuredClone(config.params), actions: [] },
      source: {
        schema: "simulatte.worldSpecSource.v1",
        prompt: config.question,
        compilerConfig: {
          adapter: config.modelId,
          sourceReferences: config.sources,
        },
      },
      authorship: {
        schema: "simulatte.worldSpecAuthoring.v2",
        revision: 0,
        sources: [
          {
            id: "source:experiment",
            authority: "governedPack",
            label: config.boundary,
          },
        ],
        fieldProvenance: [
          {
            path: "/",
            authority: "governedPack",
            sourceId: "source:experiment",
          },
        ],
        patches: [],
        reconciliations: [],
      },
      determinism: {
        schema: "simulatte.worldSpecDeterminism.v1",
        requiredClasses: ["simulation-reproducible", "replay-identified"],
        seed: config.seed,
        simulationTolerance: config.modelTolerance,
        pixelPolicy: null,
      },
      dependencies: {
        schema: "simulatte.worldSpecDependencies.v1",
        governedPacks: [],
        plugins: [],
        assets: structuredClone(config.modelSources),
      },
      safety: {
        schema: "simulatte.worldSpecSafety.v1",
        rules: [],
        status: "not-declared",
      },
      unsupportedRequirements: [
        { id: "empirical-calibration", reason: config.boundary },
      ],
      unresolvedAmbiguities: [],
    });
  }
  function validate(spec, config, model) {
    world.validateWorldSpec(spec);
    const reference = create(config);
    for (const key of [
      "id",
      "templateId",
      "kind",
      "modules",
      "objects",
      "controls",
      "dependencies",
      "safety",
      "unsupportedRequirements",
      "unresolvedAmbiguities",
      "source",
      "determinism",
    ])
      if (
        world.canonicalJson(spec[key]) !== world.canonicalJson(reference[key])
      )
        throw Error("field_experiment_contract_mismatch: " + key);
    if (
      Object.keys(spec).some(
        (k) => spec[k] !== undefined && !Object.hasOwn(reference, k),
      )
    )
      throw Error("field_experiment_field_unsupported");
    if (
      Object.keys(spec.params).sort().join(",") !== "actions,model" ||
      world.canonicalJson(spec.params.model) !==
        world.canonicalJson(config.params)
    )
      throw Error("field_experiment_parameters_mismatch");
    model.validate(spec.params.model);
    if (!Array.isArray(spec.params.actions) || spec.params.actions.length > 256)
      throw Error("field_experiment_actions_invalid");
    let prior = 0;
    for (const action of spec.params.actions) {
      validateAction(action, config);
      if (action.atStep < prior)
        throw Error("field_experiment_action_order_invalid");
      prior = action.atStep;
    }
    return spec;
  }
  function validateAction(action, config) {
    const allowed = config.actions.find((a) => a.kind === action.kind);
    const keys = [
      "kind",
      "x",
      "y",
      "atStep",
      "orientation",
      "temperature",
      "grainId",
    ];
    if (
      !allowed ||
      Object.keys(action).some((k) => !keys.includes(k)) ||
      !Number.isInteger(action.atStep) ||
      action.atStep < 0 ||
      action.atStep > config.durationSteps ||
      ![action.x, action.y].every(
        (v) =>
          Number.isFinite(v) &&
          v >= 0 &&
          v <= config.params.size * config.params.spacing,
      )
    )
      throw Error("field_experiment_action_invalid");
    if (
      action.kind === "seed" &&
      (!Number.isFinite(action.orientation) ||
        action.orientation !== allowed.orientation)
    )
      throw Error("field_experiment_seed_invalid");
    if (action.kind === "thermal" && action.temperature !== allowed.temperature)
      throw Error("field_experiment_boundary_invalid");
    if (
      action.kind === "rotate" &&
      (!Number.isInteger(action.grainId) ||
        action.grainId < 0 ||
        action.grainId > 256)
    )
      throw Error("field_experiment_grain_invalid");
  }
  function append(spec, action, config, model) {
    validateAction(action, config);
    const draft = JSON.parse(world.serializeWorldSpec(spec));
    draft.params.actions.push(structuredClone(action));
    return validate(
      world.prepareUserEdit(spec, draft, {
        rationale: "Selected-object perturbation",
      }),
      config,
      model,
    );
  }
  function execute(spec, config, model, steps) {
    validate(spec, config, model);
    if (!Number.isInteger(steps) || steps < 0 || steps > config.durationSteps)
      throw Error("field_experiment_step_invalid");
    let baseline = model.initial(spec.params.model, spec.determinism.seed),
      intervention = structuredClone(baseline);
    let cursor = 0;
    for (let i = 0; i <= steps; i++) {
      while (
        cursor < spec.params.actions.length &&
        spec.params.actions[cursor].atStep === i
      )
        intervention = model.apply(
          intervention,
          spec.params.actions[cursor++],
          spec.params.model,
        );
      if (i < steps) {
        baseline = model.step(baseline, spec.params.model);
        intervention = model.step(intervention, spec.params.model);
      }
    }
    return { baseline, intervention };
  }
  function receipt(spec, config, model, pair) {
    return {
      schema: "simulatte.fieldExperimentRun.v1",
      worldSpecHash: spec.contentHash,
      modelId: config.modelId,
      modelVersion: config.version,
      step: pair.intervention.step,
      stateHash: world.contentHash(pair),
      baseline: model.metrics(pair.baseline, spec.params.model),
      intervention: model.metrics(pair.intervention, spec.params.model),
      evidence: {
        numericalChecks: "see independent reference tests",
        calibration: "not-performed",
        humanComprehension: "pending",
      },
    };
  }
  return Object.freeze({
    create,
    validate,
    validateAction,
    append,
    execute,
    receipt,
    validateConfig,
  });
});
