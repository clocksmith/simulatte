(async function (root) {
  "use strict";
  const program = root.SimulatteFieldExperimentProgram,
    world = root.SimulatteWorldSpec,
    drawing = root.SimulatteFieldExperimentDrawing;
  const el = (id) => document.getElementById(id);
  let running = false,
    pair = null,
    spec = null,
    config = null,
    model = null,
    frame = null,
    selected = null,
    yaw = 0.65,
    disposed = false,
    raf = 0,
    appliedThrough = -1,
    lastUi = 0,
    lastSpecHash = null;
  const listeners = new AbortController(),
    on = (node, type, fn) =>
      node.addEventListener(type, fn, { signal: listeners.signal });
  function fail(error) {
    running = false;
    el("status").textContent = error.message;
    el("pause").textContent = "Resume";
    root.__fieldExperimentError = error.message;
  }
  function rows(node, values) {
    node.replaceChildren(
      ...values.map(([label, value]) => {
        const item = document.createElement("div"),
          term = document.createElement("dt"),
          detail = document.createElement("dd");
        term.textContent = label;
        detail.textContent = value;
        item.append(term, detail);
        return item;
      }),
    );
  }
  function render() {
    frame = drawing.draw(el("scene"), config, pair.intervention, selected, yaw);
    drawing.draw(el("baseline"), config, pair.baseline, null, yaw);
    if (performance.now() - lastUi < 100 && running) return;
    lastUi = performance.now();
    const baseline = model.metrics(pair.baseline, spec.params.model),
      current = model.metrics(pair.intervention, spec.params.model);
    rows(
      el("measures"),
      config.measures.map((row) => [
        row.label,
        `${Number(current[row.id]).toFixed(3)} ${row.unit} · baseline ${Number(baseline[row.id]).toFixed(3)}`,
      ]),
    );
    rows(
      el("checks"),
      Object.entries(current)
        .filter(([id]) => /Residual|limitedFluxes/.test(id))
        .map(([id, value]) => [id, Number(value).toExponential(3)]),
    );
    el("clock").textContent =
      `${pair.intervention.time.toFixed(4)} ${config.timeUnit}`;
    el("selection").textContent = selected?.id || "Select a region";
    el("condition").textContent = drawing.inspect(
      config,
      pair.intervention,
      selected,
    );
    el("pause").textContent = running ? "Pause" : "Resume";
    if (lastSpecHash !== spec.contentHash) {
      el("spec").value = world.serializeWorldSpec(spec);
      lastSpecHash = spec.contentHash;
    }
    root.__fieldExperimentState = {
      id: config.id,
      step: pair.intervention.step,
      specHash: spec.contentHash,
      actions: spec.params.actions.length,
      baseline,
      current,
      running,
    };
  }
  function replay(target = pair.intervention.step) {
    pair = program.execute(spec, config, model, target);
    render();
  }
  function action(description) {
    try {
      if (!selected) throw Error("Select an object first");
      if (pair.intervention.step >= config.durationSteps)
        throw Error("Restart this completed run to try another intervention.");
      const input = {
        kind: description.kind,
        x: selected.worldX,
        y: selected.worldY,
        atStep: pair.intervention.step,
      };
      for (const key of ["orientation", "temperature"])
        if (Object.hasOwn(description, key)) input[key] = description[key];
      if (description.kind === "rotate")
        input.grainId = pair.intervention.grain[selected.index];
      program.validateAction(input, config);
      const next = model.apply(pair.intervention, input, spec.params.model);
      spec = program.append(spec, input, config, model);
      pair.intervention = next;
      appliedThrough = pair.intervention.step;
      lastUi = 0;
      el("consequence").textContent =
        `${description.label} at ${pair.intervention.time.toFixed(4)} ${config.timeUnit}. The baseline keeps the same original inputs and no interventions.`;
      render();
    } catch (error) {
      fail(error);
    }
  }
  function tick() {
    if (disposed) return;
    try {
      if (running) {
        const speed = Number(el("speed").value);
        for (let i = 0; i < config.stepsPerFrame * speed; i++) {
          if (pair.intervention.step >= config.durationSteps) {
            running = false;
            el("status").textContent =
              "Run complete. Compare the result, replay, or restart.";
            break;
          }
          const at = pair.intervention.step;
          for (const action of spec.params.actions)
            if (action.atStep === at && appliedThrough < at)
              pair.intervention = model.apply(
                pair.intervention,
                action,
                spec.params.model,
              );
          appliedThrough = at;
          pair = {
            baseline: model.step(pair.baseline, spec.params.model),
            intervention: model.step(pair.intervention, spec.params.model),
          };
        }
      }
      render();
    } catch (error) {
      fail(error);
    }
    raf = requestAnimationFrame(tick);
  }
  try {
    const route = root.SimulattePublicRoutes.forPath(location.pathname),
      id =
        route?.experimentId ||
        new URLSearchParams(location.search).get("experiment");
    if (
      !id ||
      !["living-tissue", "river-formation", "crystal-foundry"].includes(id)
    )
      throw Error("Choose a field experiment from the simulation catalog");
    const response = await fetch(`../../data/field-experiments/${id}.json`);
    if (!response.ok) throw Error("Experiment configuration unavailable");
    config = await response.json();
    program.validateConfig(config);
    for (const source of config.modelSources) {
      const sourceUrl = new URL(source.path, document.baseURI);
      sourceUrl.searchParams.set("v", source.sha256);
      const sourceResponse = await fetch(sourceUrl);
      if (!sourceResponse.ok)
        throw Error("Experiment model source unavailable");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await sourceResponse.arrayBuffer(),
      );
      const hash = Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== source.sha256)
        throw Error("Experiment model source identity mismatch");
    }
    model = root[config.model];
    if (!model) throw Error("Experiment numerical model unavailable");
    spec = program.validate(program.create(config), config, model);
    pair = program.execute(spec, config, model, 0);
    appliedThrough = -1;
    document.title = `${config.name} · Simulatte`;
    el("title").textContent = config.name;
    el("question").textContent = config.question;
    el("boundary").textContent = config.boundary;
    for (const source of config.sources) {
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.label;
      link.rel = "noopener";
      el("sources").append(link, document.createElement("br"));
    }
    for (const description of config.actions) {
      const button = document.createElement("button");
      button.textContent = description.label;
      button.dataset.action = description.kind;
      on(button, "click", () => action(description));
      el("actions").append(button);
    }
    on(el("pause"), "click", () => {
      running = !running;
      render();
    });
    on(el("restart"), "click", () => {
      spec = program.create(config);
      pair = program.execute(spec, config, model, 0);
      appliedThrough = -1;
      selected = null;
      el("consequence").textContent =
        "Original inputs restored in both branches.";
      running = true;
      render();
    });
    on(el("replay"), "click", () => {
      const target = pair.intervention.step;
      running = false;
      const expected = world.contentHash(pair);
      replay(target);
      appliedThrough = target;
      el("status").textContent =
        world.contentHash(pair) === expected
          ? "Replay verified: the same inputs and actions reproduce both states."
          : "Replay mismatch";
    });
    on(el("export"), "click", () => {
      const record = {
        schema: "simulatte.fieldExperimentExport.v1",
        worldSpec: spec,
        receipt: program.receipt(spec, config, model, pair),
      };
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(record)], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = `${config.id}-run.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
    on(el("import"), "change", async () => {
      try {
        const file = el("import").files[0];
        if (!file || file.size > 2000000)
          throw Error("Import requires a JSON run smaller than 2 MB");
        const record = JSON.parse(await file.text());
        if (record.schema !== "simulatte.fieldExperimentExport.v1")
          throw Error("Unsupported run export");
        const imported = program.validate(record.worldSpec, config, model);
        const restored = program.execute(
          imported,
          config,
          model,
          record.receipt.step,
        );
        if (
          record.receipt.worldSpecHash !== imported.contentHash ||
          record.receipt.stateHash !== world.contentHash(restored)
        )
          throw Error("Imported run identity mismatch");
        running = false;
        spec = imported;
        pair = restored;
        appliedThrough = pair.intervention.step;
        el("status").textContent = "Imported run verified.";
        render();
      } catch (error) {
        fail(error);
      }
    });
    let pointer = null;
    on(el("scene"), "pointerdown", (event) => {
      pointer = { x: event.offsetX, y: event.offsetY, yaw, moved: false };
      el("scene").setPointerCapture(event.pointerId);
    });
    on(el("scene"), "pointermove", (event) => {
      if (!pointer || config.view !== "terrain") return;
      const delta = event.offsetX - pointer.x;
      if (Math.abs(delta) > 8) {
        pointer.moved = true;
        yaw = pointer.yaw + delta * 0.01;
        render();
      }
    });
    on(el("scene"), "pointerup", (event) => {
      if (pointer && !pointer.moved)
        selected = drawing.pick(frame, event.offsetX, event.offsetY);
      pointer = null;
      render();
    });
    on(el("scene"), "keydown", (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      const index = Math.max(
        0,
        frame.hits.findIndex((row) => row.id === selected?.id),
      );
      const direction = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      selected =
        frame.hits[(index + direction + frame.hits.length) % frame.hits.length];
      render();
    });
    on(el("theme"), "click", () => {
      root.SimulatteTheme.cyclePreference();
      render();
    });
    root.addEventListener(
      "pagehide",
      () => {
        disposed = true;
        cancelAnimationFrame(raf);
        listeners.abort();
      },
      { once: true },
    );
    root.__fieldExperimentSnapshot = () => ({
      ...root.__fieldExperimentState,
      stateHash: world.contentHash(pair),
      worldSpec: spec,
      receipt: program.receipt(spec, config, model, pair),
    });
    render();
    selected = frame.hits[Math.floor(frame.hits.length / 2)];
    running = true;
    raf = requestAnimationFrame(tick);
  } catch (error) {
    fail(error);
  }
})(globalThis);
