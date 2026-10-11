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
    lastUi = 0,
    lastSpecHash = null,
    previewAction = null,
    showSignal = true,
    lastAction = null,
    scheduler = null,
    replayEnd = null,
    cameraBounds = null, cameraMode = "overview";
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
    if(config.view === "cells" && selected?.id !== "region") {
      const cell=pair.intervention.cells.find(c=>c.id===selected?.id);
      if(cell) selected={...selected,worldX:cell.x,worldY:cell.y};
    }
    const bounds=config.view === "cells" ? drawing.cellBounds([pair.intervention,pair.baseline]) : null;
    const region=config.view === "cells" && selected ? model.actionRegion(pair.intervention,{kind:previewAction?.kind || "remove",x:selected.worldX,y:selected.worldY}) : null;
    const viewBounds=cameraBounds || bounds;
    const options={bounds:viewBounds,top:cameraMode==="top",signal:showSignal,preview:region?{kind:previewAction?.kind || "remove",...region}:null};
    frame = drawing.draw(el("scene"), config, pair.intervention, selected, yaw, options);
    drawing.draw(el("baseline"), config, pair.baseline, null, yaw, {bounds:viewBounds,top:cameraMode==="top",signal:showSignal});
    el("focus-selection").disabled=!selected;
    for(const button of el("camera-views").querySelectorAll("button")) {
      const checked=button.dataset.view===cameraMode;button.setAttribute("aria-checked",String(checked));button.tabIndex=checked?0:-1;
    }
    for(const button of el("actions").querySelectorAll("button")) {
      const kind=button.dataset.action;
      const target=config.view === "cells" && selected ? model.actionRegion(pair.intervention,{kind,x:selected.worldX,y:selected.worldY}) : null;
      button.disabled=!selected || pair.intervention.step>=config.durationSteps || (target && (!target.available || (kind === "remove" && !target.affectedIds.length)));
    }
    el("preview-description").textContent=region ? options.preview.kind==='remove'?`${region.affectedIds.length} cells in the dashed patch; the source stays intact.`:options.preview.kind==='boundary'?'Dashed line: the new growth boundary.':'Dashed circle: the signaling source’s new position.' : '';

    if (performance.now() - lastUi < 100 && running) return;
    lastUi = performance.now();
    const baseline = model.metrics(pair.baseline, spec.params.model),
      current = model.metrics(pair.intervention, spec.params.model);
    rows(
      el("measures"),
      config.measures.map((row) => [
        row.label,
        `${Number(current[row.id]).toLocaleString(undefined,{maximumFractionDigits:row.unit===row.id?0:2})} ${row.unit} · baseline ${Number(baseline[row.id]).toLocaleString(undefined,{maximumFractionDigits:2})} · ${current[row.id]-baseline[row.id]>0?"+":""}${Number(current[row.id]-baseline[row.id]).toFixed(row.unit===row.id?0:2)} difference`,
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
    el("selection").textContent = selected?.id === "region" ? "Selected region" : selected?.id || "Select a region";
    if(lastAction) el("consequence").textContent=`${lastAction}. ${current.cells !== undefined ? `${current.cells-baseline.cells} cells and ${(current.area-baseline.area).toFixed(2)} model area versus the untouched branch at the same time.` : "The baseline keeps the original inputs."}`;
    el("condition").textContent = drawing.inspect(
      config,
      pair.intervention,
      selected,
    );
    const complete = pair.intervention.step >= (replayEnd ?? config.durationSteps);
    el("pause").textContent = complete ? "Replay" : running ? "Pause" : "Resume";
    el("playback-rate").textContent = `${(config.stepsPerSecond * spec.params.model.step * Number(el("speed").value)).toFixed(2)} ${config.timeUnit} / real second`;
    el("playback-health").textContent = scheduler?.snapshot().slowerPlayback ? "Slower playback: computing every fixed step." : "";
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
      complete,
      selectedId: selected?.id || null,
      camera: { yaw, bounds:viewBounds, mode:cameraMode },
      showSignal,
      playback: scheduler?.snapshot(),
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
      lastUi = 0;
      lastAction = `${description.label} at ${pair.intervention.time.toFixed(2)} ${config.timeUnit}`;
      render();
    } catch (error) {
      el("status").textContent=error.message;
    }
  }
  function advanceStep() {
    if (pair.intervention.step >= (replayEnd ?? config.durationSteps)) {
      running = false;
      el("status").textContent = "Run complete. Compare the result, replay, or restart.";
      return false;
    }
    pair = program.advance(pair,spec,model);
    return true;
  }
  function beginReplay() {
    replayEnd = pair.intervention.step || config.durationSteps;
    pair = program.execute(spec, config, model, 0);
    scheduler.reset(); running = true; lastUi = 0;
    el("status").textContent = "Replaying recorded actions from the beginning.";
    render();
  }
  function restart() {
    if(config.view==="cells"&&!cameraBounds)cameraBounds=drawing.cellBounds([pair.intervention,pair.baseline]);
    spec = program.create(config); replayEnd = null;
    pair = program.execute(spec, config, model, 0);
    scheduler.reset(); selected = null; lastAction = null; lastUi = 0;
    el("consequence").textContent = "Original inputs restored in both branches.";
    render();
  }
  function tick(now) {
    if (disposed) return;
    try {
      scheduler.frame(now, { running, speed: Number(el("speed").value), visible: !document.hidden, advance: advanceStep });
      render();
    } catch (error) { fail(error); }
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
    scheduler = root.SimulatteSimulationClock.createFixedStepScheduler({ stepsPerSecond: config.stepsPerSecond, maxStepsPerFrame: 64 });
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
    document.title = `${config.name} · Simulatte`;
    el("title").textContent = config.name;
    el("question").textContent = config.question;
    el("boundary").textContent = config.boundary;
    el("signal").closest("label").hidden=config.view!=="cells";
    el("camera-views").hidden=config.view!=="terrain";
    el("legend").hidden=config.view!=="cells";
    document.body.dataset.experiment=config.id;
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
      for(const type of ["pointerenter","focus"]) on(button,type,()=>{previewAction=description;lastUi=0;render();});
      el("actions").append(button);
    }
    on(el("pause"), "click", () => {
      if (pair.intervention.step >= (replayEnd ?? config.durationSteps)) { beginReplay(); return; }
      running = !running; scheduler.rebase(); lastUi = 0; render();
    });
    on(el("restart"), "click", restart);
    on(el("replay"), "click", beginReplay);
    on(el("verify-replay"), "click", () => {
      const expected = world.contentHash(pair);
      const candidate = program.execute(spec, config, model, pair.intervention.step);
      el("status").textContent = world.contentHash(candidate) === expected
        ? "Replay verified: the same inputs and actions reproduce both states." : "Replay mismatch";
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
        running = false; scheduler.reset(); replayEnd = null;
        spec = imported;
        pair = restored;
          el("status").textContent = "Imported run verified.";
        render();
      } catch (error) {
        fail(error);
      }
    });
    on(el("reset-view"), "click", () => { yaw=0.65; cameraBounds=null; cameraMode="overview"; lastUi=0; render(); });
    on(el("focus-selection"), "click", () => {
      if(!selected)return;
      const span=config.view==="cells"?12:config.params.size*config.params.spacing/2;
      cameraBounds={origin:[selected.worldX-span/2,selected.worldY-span/2],span};lastUi=0;render();
    });
    for(const button of el("camera-views").querySelectorAll("button")) on(button,"click",()=>{
      cameraMode=button.dataset.view;lastUi=0;render();
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
      pointer = null; lastUi=0;
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
    on(el("signal"),"change",()=>{showSignal=el("signal").checked;lastUi=0;render();});
    on(el("theme"), "click", () => {
      root.SimulatteTheme.cyclePreference();
      render();
    });
    on(document,"visibilitychange",()=>scheduler.rebase());
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
    previewAction=config.actions[0];
    render();
    running = true;
    raf = requestAnimationFrame(tick);
  } catch (error) {
    fail(error);
  }
})(globalThis);
