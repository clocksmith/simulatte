import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './simulatte/browser-session.mjs';
import { setupPage, evaluate, captureCleanCanvasScreenshot, inspectPhaseRail } from './visual-audit-page.mjs';
import { waitForCondition } from './audit-runtime-wait.mjs';
import { runPrompt } from './visual-audit-run.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'activity-program');
const prompts = [
  'a person walking while holding a cup in the left hand',
  'a person sits on a chair, holds a phone in the left hand, and drinks from a cup with the right hand',
];
await fs.mkdir(out, { recursive: true });
const rows = [];
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const directory = path.join(out, `${viewport.width}x${viewport.height}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.rm(path.join(directory, 'failure.json'), { force: true });
  const browser = await openBrowserAudit({ publicRoot: path.join(root, 'public'), viewport, webgpu: true });
  try {
    await setupPage(browser.client, `${browser.host.baseUrl}blank/?auditNoInitial=1`, viewport.width, viewport.height, 30000, 'local');
    for (let i = 0; i < prompts.length; i++) {
      const result = await runPrompt(browser.client, { kind: 'activity-development', prompt: prompts[i] }, i, directory,
        { timeoutMs: 30000, frameDelayMs: 5000, intentMode: 'local', exactReplay: false });
      await evaluate(browser.client, `(() => { document.getElementById('physics-canvas').dataset.auditFreezeFrame = 'false'; window.SimulattePhysicsLab._browserLab.resume?.(); return true; })()`);
      await waitForCondition('complete activity sequence', () => evaluate(browser.client, `(() => {
        const lab = window.SimulattePhysicsLab._browserLab, spec = lab.getSpec(), state = lab.getState();
        return { ok: state.activity.time >= Math.max(...spec.activityProgram.actions.map(action => action.endSeconds)) - 1e-8, time: state.activity.time };
      })()`), 60000);
      await waitForCondition('complete sequence pixel proof', () => evaluate(browser.client, `(() => {
        const canvas = document.getElementById('physics-canvas');
        return { ok: canvas.dataset.sceneProofVerdict === 'pass', verdict: canvas.dataset.sceneProofVerdict,
          failures: canvas.dataset.sceneProofRequiredFailures };
      })()`), 15000);
      const rail = await inspectPhaseRail(browser.client);
      assert.equal(rail.buttonCount, 8);
      assert.equal(rail.visible, true);
      assert.ok(rail.left >= 0 && rail.top >= 0 && rail.right <= viewport.width && rail.bottom <= viewport.height,
        `phase controls overflow: ${JSON.stringify(rail)}`);
      const shot = await captureCleanCanvasScreenshot(browser.client);
      await fs.writeFile(path.join(directory, `${i + 1}-complete.png`), Buffer.from(shot.data, 'base64'));
      const evidence = await waitForCondition('accepted activity evidence snapshot', () => evaluate(browser.client, `(() => {
        const lab = window.SimulattePhysicsLab._browserLab;
        const spec = lab.getSpec(), state = lab.getState();
        const canvas = document.getElementById('physics-canvas');
        if (canvas.dataset.sceneProofVerdict !== 'pass' || canvas.dataset.sceneProofFinal !== 'true') {
          return { ok: false, verdict: canvas.dataset.sceneProofVerdict, final: canvas.dataset.sceneProofFinal,
            time: state.activity.time, frame: state.solverState?.frame, failures: canvas.dataset.sceneProofRequiredFailures };
        }
        const proof = window.SimulattePhysicsModel.proveActivitySequence(spec.activityProgram, state.activity);
        return { ok: canvas.dataset.sceneProofVerdict === 'pass' && canvas.dataset.sceneProofFinal === 'true',
          prompt: spec.source.prompt, worldSpecHash: spec.contentHash, programHash: spec.activityProgram.contentHash,
          proof, stateTime: state.activity.time, phase8: canvas.dataset.phase8Output,
          sceneProof: { verdict: canvas.dataset.sceneProofVerdict, failures: JSON.parse(canvas.dataset.sceneProofRequiredFailures || '[]'), error: canvas.dataset.sceneProofError },
          activityBinding: spec.renderProgram.sceneRenderPacket.activityBindings,
          activityVisual: JSON.parse(canvas.dataset.phase7InteractionVisual || 'null'),
          visualProof: JSON.parse(canvas.dataset.phase7VisualObligationProof || '[]'),
          phaseSchemas: Object.values(spec.phaseArtifacts).map(phase => phase.schema),
          viewportFits: document.documentElement.scrollWidth <= innerWidth,
          spec, state };
      })()`), 15000);
      assert.equal(evidence.ok, true);
      await fs.writeFile(path.join(directory, `${i + 1}-execution.json`), JSON.stringify(evidence));
      const { spec, state, ...summary } = evidence;
      rows.push({ viewport, ...summary, screenshot: result.screenshot, screenshotHash: result.screenshotHash });
      await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ schema: 'simulatte.activityBrowserAudit.v1', rows }, null, 2));
      assert.equal(evidence.prompt, prompts[i]);
      assert.equal(evidence.proof.pass, true, JSON.stringify(evidence.proof));
      assert.equal(evidence.proof.coverage.forcesValidated, true);
      if (i === 1) {
        assert.equal(evidence.proof.coverage.liquidTransferValidated, true);
        assert.ok(evidence.proof.metrics.consumedMassKg > 0);
        assert.equal(evidence.proof.metrics.spilledMassKg, 0);
        assert.equal(evidence.activityBinding.bindings.filter(binding => binding.kind === 'liquid-cell').length, 16);
      }
      assert.equal(evidence.phase8, 'simulatte.phase8.output.v2');
      assert.equal(evidence.viewportFits, true);
      assert.equal(evidence.sceneProof.verdict, 'pass');
      await evaluate(browser.client, `(() => { document.getElementById('reset-lab').click();
        document.getElementById('pause-lab').click(); return true; })()`);
      const pausedTime = await evaluate(browser.client, `window.SimulattePhysicsLab._browserLab.getState().activity.time`);
      await evaluate(browser.client, `new Promise(resolve => setTimeout(resolve, 300))`);
      assert.equal(await evaluate(browser.client, `window.SimulattePhysicsLab._browserLab.getState().activity.time`), pausedTime);
      assert.ok(pausedTime < 0.5);
      await evaluate(browser.client, `(() => { document.getElementById('pause-lab').click(); return true; })()`);
      await waitForCondition('replayed activity midpoint', () => evaluate(browser.client, `({ ok: window.SimulattePhysicsLab._browserLab.getState().activity.time >= 2 })`), 60000);
      const middle = await captureCleanCanvasScreenshot(browser.client);
      await fs.writeFile(path.join(directory, `${i + 1}-midpoint.png`), Buffer.from(middle.data, 'base64'));
      await waitForCondition('replayed activity completion', () => evaluate(browser.client, `({ ok: window.SimulattePhysicsLab._browserLab.getState().activity.time >= 4 - 1e-8 })`), 60000);
      const replay = await evaluate(browser.client, `(() => {
        const api = window.SimulattePhysicsLab, state = api._browserLab.getState(), spec = api._browserLab.getSpec();
        const imported = api.deserializeSpec(api.serializeSpec(spec, { retainPhaseSources: true }));
        return { actors: state.activity.actors, objects: state.activity.objects,
          importedProgramHash: imported.activityProgram.contentHash, importedWorldHash: imported.contentHash };
      })()`);
      assert.deepEqual(replay.actors, state.activity.actors); assert.deepEqual(replay.objects, state.activity.objects);
      assert.equal(replay.importedProgramHash, evidence.programHash); assert.equal(replay.importedWorldHash, evidence.worldSpecHash);
      rows.at(-1).lifecycle = { pause: true, restart: true, replay: true, browserSerializationRoundtrip: true };
      await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ schema: 'simulatte.activityBrowserAudit.v1', rows }, null, 2));
      console.log(JSON.stringify({ viewport, prompt: prompts[i], activityProof: evidence.proof.status,
        screenshot: result.screenshot, phase8: evidence.phase8 }));
    }
  } catch (error) {
    const diagnostics = await evaluate(browser.client, `(() => ({ canvas: { ...document.getElementById('physics-canvas')?.dataset },
      prompt: window.SimulattePhysicsLab?._browserLab?.getSpec()?.source?.prompt }))()`).catch(() => null);
    await fs.writeFile(path.join(directory, 'failure.json'), JSON.stringify({ error: error.message, diagnostics }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
