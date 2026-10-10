const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const grid = require("../public/shared/core/simulation/field-grid.js");
const program = require("../public/simulatte/field-experiments/program.js");
const world = require("../public/shared/contracts/world-spec.js");
const cases = [
  ["living-tissue", "tissue-growth"],
  ["river-formation", "river-erosion"],
  ["crystal-foundry", "crystal-solidification"],
].map(([id, file]) => ({
  config: JSON.parse(
    fs.readFileSync(`${__dirname}/../public/data/field-experiments/${id}.json`),
  ),
  model: require(`../public/shared/core/simulation/${file}.js`),
}));
test("zero-flux diffusion conserves total mass and converges to an independent cosine mode", () => {
  const errors = [];
  for (const n of [16, 32, 64]) {
    const dx = 1 / n,
      dt = 0.2 * dx * dx,
      duration = 0.01,
      steps = Math.round(duration / dt),
      actualTime = steps * dt;
    let field = Array.from(
      { length: n * n },
      (_, i) => 1 + 0.2 * Math.cos(Math.PI * ((i % n) + 0.5) * dx),
    );
    const initial = grid.sum(field);
    for (let i = 0; i < steps; i++) field = grid.diffuse(field, n, dx, dt, 1);
    assert.ok(Math.abs(grid.sum(field) - initial) < 1e-8);
    errors.push(
      Math.sqrt(
        field.reduce(
          (sum, v, i) =>
            sum +
            (v -
              (1 +
                0.2 *
                  Math.cos(Math.PI * ((i % n) + 0.5) * dx) *
                  Math.exp(-(Math.PI ** 2) * actualTime))) **
              2,
          0,
        ) / field.length,
      ),
    );
  }
  assert.ok(errors[2] < errors[1] && errors[1] < errors[0]);
});
test("cell growth reproduces the independently integrated Hill-rate area law and daughters conserve area", () => {
  const { config, model } = cases[0],
    p = {
      ...config.params,
      diffusion: 0,
      decay: 0,
      growthMin: 0,
      growthMax: 0.04,
      threshold: 1e-6,
    };
  let s = model.initial(p, 17);
  s.cells = s.cells.filter((c) => !c.producer).slice(0, 1);
  s.cells[0].signal = 1;
  s.cells[0].area = Math.PI;
  const initial = s.cells[0].area;
  for (let i = 0; i < 20; i++) s = model.step(s, p);
  assert.ok(
    Math.abs(
      s.cells.reduce((sum, c) => sum + c.area, 0) -
        initial * Math.exp(0.04 * 10),
    ) < 1e-8,
  );
  for (let i = 0; i < 30; i++) s = model.step(s, p);
  assert.ok(s.divisions > 0);
  assert.ok(new Set(s.cells.map((c) => c.id)).size === s.cells.length);
  assert.ok(s.cells.some((c) => c.parentId));
});
test("water and sediment remain accounted after rainfall, terrain edits and export", () => {
  const { config, model } = cases[1];
  let s = model.initial(config.params, 17);
  s = model.apply(s, { kind: "channel", x: 12, y: 12 }, config.params);
  for (let i = 0; i < 500; i++) s = model.step(s, config.params);
  const metrics = model.metrics(s, config.params);
  assert.ok(Math.abs(metrics.waterResidual) < 1e-8);
  assert.ok(Math.abs(metrics.sedimentResidual) < 1e-8);
  assert.ok(s.water.every((v) => v >= 0) && s.sediment.every((v) => v >= 0));
  assert.ok(metrics.sedimentExport > 0);
  const original = model.initial(config.params, 17);
  assert.ok(s.height.some((v, i) => Math.abs(v - original.height[i]) > 1e-4));
});
test("phase-field latent heat conserves enthalpy, with thermal interventions accounted separately", () => {
  const { config, model } = cases[2];
  let s = model.initial(config.params, 17);
  const before = model.metrics(s, config.params);
  s = model.apply(
    s,
    { kind: "thermal", x: 0.8, temperature: -0.75 },
    config.params,
  );
  for (let i = 0; i < 200; i++) s = model.step(s, config.params);
  const after = model.metrics(s, config.params);
  assert.ok(Math.abs(after.enthalpyResidual) < 1e-10);
  assert.ok(after.solidArea > before.solidArea);
  assert.ok(
    s.phase.every((v) => v >= 0 && v <= 1) &&
      s.temperature.every(Number.isFinite),
  );
});
test("phase-field timestep refinement converges for the same geometry and elapsed time", () => {
  const { config, model } = cases[2],
    values = [];
  for (const divisor of [1, 2, 4]) {
    const p = { ...config.params, step: config.params.step / divisor };
    let s = model.initial(p, 17);
    for (let i = 0; i < 100 * divisor; i++) s = model.step(s, p);
    values.push(model.metrics(s, p).solidArea);
  }
  assert.ok(Math.abs(values[2] - values[1]) < Math.abs(values[1] - values[0]));
});
for (const { config, model } of cases)
  test(`${config.id} validates WorldSpec, replay, perturbation baseline and rejects altered model authority`, () => {
    let spec = program.create(config);
    const action = {
      ...config.actions[0],
      x: (config.params.size * config.params.spacing) / 2,
      y: (config.params.size * config.params.spacing) / 2,
      atStep: 12,
    };
    delete action.label;
    spec = program.append(spec, action, config, model);
    const first = program.execute(spec, config, model, 40),
      second = program.execute(
        JSON.parse(world.serializeWorldSpec(spec)),
        config,
        model,
        40,
      );
    assert.deepEqual(first, second);
    assert.notDeepEqual(first.baseline, first.intervention);
    const original = program.execute(program.create(config), config, model, 40);
    assert.deepEqual(first.baseline, original.baseline);
    const edited = structuredClone(spec);
    edited.params.model.step *= 2;
    assert.throws(
      () => program.validate(world.finalizeWorldSpec(edited), config, model),
      /mismatch/,
    );
  });

test("river routing and erosion refine at a common elapsed time", () => {
  const { config, model } = cases[1],
    values = [];
  for (const divisor of [1, 2, 4]) {
    const params = { ...config.params, step: config.params.step / divisor };
    let state = model.initial(params, 17);
    for (let i = 0; i < 100 * divisor; i++) state = model.step(state, params);
    values.push(model.metrics(state, params));
  }
  for (const key of ["terrain", "sediment", "water"]) {
    assert.ok(
      Math.abs(values[2][key] - values[1][key]) <
        Math.abs(values[1][key] - values[0][key]),
    );
    assert.ok(
      Math.abs(values[2][key] - values[1][key]) /
        Math.max(1, Math.abs(values[2][key])) <
        0.002,
    );
  }
});
test("governed model identities and bounded parameters reject incompatible imports", () => {
  const { createHash } = require("node:crypto");
  for (const { config, model } of cases) {
    for (const source of config.modelSources) {
      const file = require("node:path").resolve(
        __dirname,
        "../public/simulatte/field-experiments",
        source.path,
      );
      assert.equal(
        createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
        source.sha256,
      );
    }
    assert.throws(() => model.validate({ ...config.params, size: 8.5 }));
    assert.throws(() => model.validate({ ...config.params, spacing: 0 }));
    assert.throws(() => program.create({ ...config, durationSteps: 20001 }));
    const spec = program.create(config),
      altered = structuredClone(spec);
    altered.dependencies.assets[0].sha256 = "0".repeat(64);
    assert.throws(
      () => program.validate(world.finalizeWorldSpec(altered), config, model),
      /contract_mismatch/,
    );
  }
});
