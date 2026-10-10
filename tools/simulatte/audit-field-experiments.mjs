import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { openBrowserAudit } from "./browser-session.mjs";
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.join(root, "artifacts/next-experiences");
await fs.mkdir(out, { recursive: true });
const files = execFileSync("rg", ["--files", "public"], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter((file) => /\.(js|json|css|html)$/.test(file));
const sourceHashes = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [
      file,
      createHash("sha256")
        .update(await fs.readFile(path.join(root, file)))
        .digest("hex"),
    ]),
  ),
);
const report = {
  schema: "simulatte.nextExperienceJourneys.v1",
  sourceHashes,
  sourceCommitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  servedBuild: JSON.parse(
    await fs.readFile(path.join(root, "public/version.json"), "utf8"),
  ).build,
  physicalCoverage:
    "Desktop host browser and emulated mobile viewport; no physical-phone or unfamiliar-human qualification.",
  routes: [],
};
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  const browser = await openBrowserAudit({
      publicRoot: path.join(root, "public"),
      viewport,
      webgpu: true,
    }),
    { client, host } = browser;
  const evaluate = async (expression) => {
    const value = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (value.exceptionDetails)
      throw Error(
        value.exceptionDetails.exception?.description ||
          value.exceptionDetails.text,
      );
    return value.result.value;
  };
  const wait = async (expression, timeout = 60000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error("Timed out: " + expression);
  };
  const click = async (selector) => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`,
    );
    if (
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).tagName==='BUTTON'`,
      )
    ) {
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).focus()`,
      );
      await client.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r",
      });
      await client.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      return;
    }
    const rect = await evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
    for (const type of ["mousePressed", "mouseReleased"])
      await client.send("Input.dispatchMouseEvent", {
        type,
        button: "left",
        clickCount: 1,
        ...rect,
      });
  };
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: viewport.width < 500,
    });
    for (const id of ["living-tissue", "river-formation", "crystal-foundry"]) {
      const row = { id, viewport, status: "running" };
      report.routes.push(row);
      try {
        await client.send("Page.navigate", { url: host.baseUrl + id });
        await wait(
          `globalThis.__fieldExperimentState?.id==='${id}' && globalThis.__fieldExperimentState.step>=8 || globalThis.__fieldExperimentError`,
        );
        assert.equal(
          await evaluate("globalThis.__fieldExperimentError||null"),
          null,
        );
        await click("#pause");
        await wait("!__fieldExperimentState.running");
        const before = await evaluate("__fieldExperimentSnapshot()");
        await click("#scene");
        await click("#actions button");
        const changed = await wait(
          "__fieldExperimentState.actions===1 && __fieldExperimentSnapshot()",
        );
        assert.equal(changed.step, before.step);
        assert.notEqual(changed.stateHash, before.stateHash);
        assert.deepEqual(changed.baseline, before.baseline);
        await click("#pause");
        await wait(`__fieldExperimentState.step>${before.step + 16}`);
        await click("#pause");
        await wait("!__fieldExperimentState.running");
        const expected = await evaluate("__fieldExperimentSnapshot()");
        await click("#replay");
        await wait(
          `document.getElementById('status').textContent.startsWith('Replay verified')`,
        );
        assert.equal(
          (await evaluate("__fieldExperimentSnapshot()")).stateHash,
          expected.stateHash,
        );
        await client.send("Browser.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: out,
          eventsEnabled: true,
        });
        const filename = path.join(out, id + "-run.json");
        await fs.rm(filename, { force: true });
        await click("#export");
        let record = null;
        for (let i = 0; i < 100; i++) {
          try {
            record = JSON.parse(await fs.readFile(filename, "utf8"));
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        assert.ok(record);
        assert.equal(record.receipt.stateHash, expected.stateHash);
        await click("#restart");
        await wait("__fieldExperimentState.actions===0");
        const document = await client.send("DOM.getDocument");
        const node = await client.send("DOM.querySelector", {
          nodeId: document.root.nodeId,
          selector: "#import",
        });
        await client.send("DOM.setFileInputFiles", {
          nodeId: node.nodeId,
          files: [filename],
        });
        await wait(
          `document.getElementById('status').textContent==='Imported run verified.'`,
        );
        assert.equal(
          (await evaluate("__fieldExperimentSnapshot()")).stateHash,
          expected.stateHash,
        );
        assert.equal(
          await evaluate("document.documentElement.scrollWidth<=innerWidth"),
          true,
        );
        row.result = expected;
        await evaluate("window.scrollTo(0,0)");
        const shot = await client.send("Page.captureScreenshot", {
          format: "png",
        });
        row.screenshot = `${id}-${viewport.width}.png`;
        await fs.writeFile(
          path.join(out, row.screenshot),
          Buffer.from(shot.data, "base64"),
        );
        row.status = "passed";
        console.log("PASS", id, viewport.width);
      } catch (error) {
        row.status = "failed";
        row.error = error.stack;
        console.log("FAIL", id, viewport.width, error.message);
      }
    }
    for (const route of ["interstellar", "solar-system/asteroid-defense-v1"]) {
      const row = { id: route, viewport, status: "running" };
      report.routes.push(row);
      try {
        await client.send("Page.navigate", { url: host.baseUrl + route });
        await wait(
          `globalThis.SimulatteActiveSession?.snapshot().id==='${route === "interstellar" ? "interstellar-relay-network-v1" : "asteroid-defense-v1"}' && globalThis.SimulatteActiveSession?.snapshot().execution==='running'||globalThis.__simulatteLastFailError`,
        );
        await click("#pause-button");
        await wait(`SimulatteActiveSession.snapshot().execution==='paused'`);
        const pluginId =
          route === "interstellar"
            ? "interstellar-relay-network"
            : "asteroid-defense";
        const selected = await evaluate(
          `__simulattePluginPlatformV4.contributions.find(row=>row.pluginId==='${pluginId}').objects.find(row=>row.actions.some(a=>a.id==='${route === "interstellar" ? "reply" : "observe"}')).id`,
        );
        await evaluate(
          `(()=>{const select=document.querySelector('[aria-label="Inspect object"]');select.value=${JSON.stringify(selected)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
        await click(
          `[data-object-action="${route === "interstellar" ? "reply" : "observe"}"]`,
        );
        await wait(`SimulatteActiveSession.snapshot().execution==='running'`);
        await wait(
          route === "interstellar"
            ? `__simulattePluginPlatformV4.contributions.find(row=>row.pluginId==='${pluginId}').controls.controls.some(row=>row.id==='messageMode'&&row.value==='request-reply')`
            : `__simulattePluginPlatformV4.contributions.find(row=>row.pluginId==='${pluginId}').state.measures.some(row=>row.kind==='observation-count'&&row.value===5)`,
        );
        await wait(
          `SimulatteActiveSession.snapshot().execution==='complete'`,
          90000,
        );
        if (pluginId === "asteroid-defense") {
          assert.equal(
            await evaluate(
              "__simulattePluginPlatformV4.contributions.find(row=>row.pluginId==='asteroid-defense').presentation.layers.some(row=>row.id==='synthetic-truth-revealed')",
            ),
            false,
          );
          await click('[data-object-action="commit"]');
          await wait("SimulatteActiveSession.snapshot().execution==='running'");
          await wait(
            "SimulatteActiveSession.snapshot().execution==='complete'",
            90000,
          );
          assert.equal(
            await evaluate(
              "__simulattePluginPlatformV4.contributions.find(row=>row.pluginId==='asteroid-defense').presentation.layers.some(row=>row.id==='synthetic-truth-revealed')",
            ),
            true,
          );
        }
        row.contribution = await evaluate(
          `__simulattePluginPlatformV4.contributions.find(row=>row.pluginId==='${pluginId}')`,
        );
        row.receipt = await evaluate("__simulatteTierRunReceipt");
        assert.ok(row.receipt);
        assert.equal(
          await evaluate("document.documentElement.scrollWidth<=innerWidth"),
          true,
        );
        await evaluate("window.scrollTo(0,0)");
        const shot = await client.send("Page.captureScreenshot", {
          format: "png",
        });
        row.screenshot = `${pluginId}-${viewport.width}.png`;
        await fs.writeFile(
          path.join(out, row.screenshot),
          Buffer.from(shot.data, "base64"),
        );
        row.status = "passed";
        console.log("PASS", route, viewport.width);
      } catch (error) {
        row.status = "failed";
        row.error = error.stack;
        console.log("FAIL", route, viewport.width, error.message);
      }
    }
  } finally {
    await browser.close();
  }
}
const changedSources = [];
for (const [file, expected] of Object.entries(sourceHashes)) {
  const actual = createHash("sha256")
    .update(await fs.readFile(path.join(root, file)))
    .digest("hex");
  if (actual !== expected) changedSources.push(file);
}
report.sourceFreeze = { passed: changedSources.length === 0, changedSources };
await fs.writeFile(
  path.join(out, "browser.json"),
  JSON.stringify(report, null, 2) + "\n",
);
if (
  !report.sourceFreeze.passed ||
  report.routes.some((row) => row.status !== "passed")
)
  process.exitCode = 1;
