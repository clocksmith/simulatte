#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CdpClient } from './simulatte/browser-harness.mjs';
import { createStaticSiteServer } from './simulatte/static-site-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'blank-world-spec-editor');

function parseArgs(argv) {
  const options = {
    chromePath: process.env.CHROME_PATH || '',
    outDir: DEFAULT_OUT,
    prompt: 'a red ball beside a qzxwplk',
    url: '',
    viewport: { width: 1440, height: 1000 },
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inlineValue] = argv[index].split('=');
    const value = () => inlineValue ?? argv[++index];
    if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--prompt') options.prompt = String(value() || '');
    else if (key === '--url') options.url = new URL(value()).toString();
    else if (key === '--viewport') options.viewport = parseViewport(value());
    else if (key === '--help') {
      console.log('usage: node tools/audit-world-spec-editor.mjs [--viewport WIDTHxHEIGHT] [--prompt TEXT] [--out DIR] [--chrome PATH] [--url URL]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.prompt.trim()) throw new Error('WorldSpec editor audit requires a nonempty prompt');
  return options;
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value || ''));
  if (!match) throw new Error(`Expected viewport WIDTHxHEIGHT, received ${value || 'missing'}`);
  const viewport = { width: Number(match[1]), height: Number(match[2]) };
  if (viewport.width < 320 || viewport.height < 480) {
    throw new Error(`Expected viewport at least 320x480, received ${value}`);
  }
  return viewport;
}

function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  for (const command of ['google-chrome', 'chromium', 'chromium-browser']) {
    if (spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0) return command;
  }
  throw new Error('WorldSpec editor audit requires Chrome or Chromium. Pass --chrome PATH.');
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForDevtools(port, child) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((row) => row.type === 'page' && row.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {
      // Chrome has not opened the debugging port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chrome DevTools did not become ready on port ${port}`);
}

async function stopChrome(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception && result.exceptionDetails.exception.description ||
      result.exceptionDetails.text;
    throw new Error(detail || 'Browser evaluation failed');
  }
  return result.result && result.result.value;
}

function editorProbeExpression(prompt) {
  return String.raw`(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (label, read, timeoutMs = 20000) => {
      const started = performance.now();
      let value;
      while (!(value = read())) {
        if (performance.now() - started > timeoutMs) throw new Error('Timed out waiting for ' + label);
        await delay(40);
      }
      return value;
    };
    if (window.SimulatteStartPhysicsLab && !window.SimulattePhysicsLab?._browserLab) {
      window.SimulatteStartPhysicsLab();
    }
    const lab = await waitFor('Create lab', () => window.SimulattePhysicsLab?._browserLab);
    const prompt = ${JSON.stringify(prompt)};
    const promptInput = document.getElementById('build-prompt');
    const runButton = document.getElementById('build-lab');
    const canvas = document.getElementById('physics-canvas');
    if (!promptInput || !runButton || !canvas) throw new Error('Create controls are incomplete');
    promptInput.value = prompt;
    promptInput.dispatchEvent(new Event('input', { bubbles: true }));
    runButton.click();
    const compiled = await waitFor('compiled WorldSpec', () => {
      const spec = lab.getSpec();
      return spec?.schema === 'simulatte.worldSpec.v1' &&
        spec.source?.prompt === prompt && spec.phaseArtifacts?.phase6 ? spec : null;
    });
    await waitFor('initial Phase 7 frame', () => Number(canvas.dataset.renderCount || 0) > 0);
    await waitFor('initial critical proof failure', () => {
      const failures = JSON.parse(canvas.dataset.sceneProofRequiredFailures || '[]');
      return canvas.dataset.sceneProofVerdict === 'fail' &&
        failures.some((row) => /qzxwplk/i.test(JSON.stringify(row)));
    });
    const failedSpec = lab.getSpec();
    const initialRequiredFailures = JSON.parse(canvas.dataset.sceneProofRequiredFailures || '[]');
    const before = {
      contentHash: failedSpec.contentHash,
      revision: failedSpec.authorship.revision,
      renderCount: Number(canvas.dataset.renderCount || 0),
      renderInputSerial: Number(canvas.dataset.renderInputSerial || 0),
      sceneProofVerdict: canvas.dataset.sceneProofVerdict || '',
      requiredFailures: initialRequiredFailures,
    };
    const advanced = document.getElementById('prompt-more-menu');
    const editorPanel = document.getElementById('world-spec-editor-panel');
    const editor = document.getElementById('world-spec-editor');
    const rationale = document.getElementById('world-spec-edit-rationale');
    const applyButton = document.getElementById('apply-world-spec');
    const replayButton = document.getElementById('replay-world-spec');
    const status = document.getElementById('world-spec-editor-status');
    if (!advanced || !editorPanel || !editor || !rationale || !applyButton || !replayButton || !status) {
      throw new Error('WorldSpec editor surface is incomplete');
    }
    advanced.open = true;
    editorPanel.open = true;
    await waitFor('serialized WorldSpec editor value', () => editor.value && JSON.parse(editor.value));
    const draft = JSON.parse(editor.value);
    const unsupportedNode = draft.universeGraph.nodes.find((node) => /qzxwplk/i.test(node.label || ''));
    if (!unsupportedNode) throw new Error('Audit prompt did not compile the unsupported qzxwplk node');
    draft.universeGraph.nodes = draft.universeGraph.nodes
      .filter((node) => node.id !== unsupportedNode.id);
    draft.universeGraph.edges = draft.universeGraph.edges
      .filter((edge) => edge.from !== unsupportedNode.id && edge.to !== unsupportedNode.id);
    const nodeIndex = draft.universeGraph.nodes.findIndex((node) => (
      node.sourceLabel === 'ball' || /^balls?$/i.test(node.label || '')
    ));
    if (nodeIndex < 0) throw new Error('Audit prompt did not compile a ball node');
    const color = (draft.universeGraph.nodes[nodeIndex].properties || [])
      .find((row) => row.kind === 'color');
    if (!color) throw new Error('Audit prompt did not compile a ball color property');
    const originalColor = color.value;
    color.value = '#00aa44';
    draft.safety = {
      schema: 'simulatte.worldSpecSafety.v1',
      status: 'declared',
      rules: [{
        schema: 'simulatte.worldSpecSafetyRule.v1',
        id: 'safety:elapsed-time-bound',
        description: 'Keep the proof trajectory within one simulated second',
        statePath: '/t',
        operator: 'between',
        minimum: 0,
        maximum: 1,
        expected: null,
        tolerance: 1e-12,
        severity: 'block',
      }],
    };
    editor.value = JSON.stringify(draft, null, 2);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    rationale.value = 'Refuse qzxwplk, make the ball green, and bind a fixed-step safety gate';
    if (applyButton.disabled) throw new Error('WorldSpec apply control stayed disabled after an edit');
    applyButton.click();
    const edited = await waitFor('edited WorldSpec replay', () => {
      const spec = lab.getSpec();
      return spec?.authorship?.revision === before.revision + 1 && spec.contentHash !== before.contentHash
        ? spec : null;
    });
    await waitFor('edited Phase 7 frame', () => (
      Number(canvas.dataset.renderInputSerial || 0) > before.renderInputSerial &&
      Number(canvas.dataset.renderCount || 0) > before.renderCount
    ));
    const acceptedNode = edited.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.nodes[nodeIndex];
    const visualNode = edited.phaseArtifacts.phase6.artifact.visualCompile.visualIR.entities
      .find((node) => /ball/i.test(node.label || ''));
    const packetNode = edited.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket.entities
      .find((node) => /ball/i.test(node.label || ''));
    const collider = packetNode?.collider?.bounds || [];
    if (collider.length !== 4) throw new Error('Edited ball has no interaction collider');
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + (collider[0] + collider[2] * 0.5) * rect.width;
    const clientY = rect.top + (collider[1] + collider[3] * 0.5) * rect.height;
    const originalSetPointerCapture = canvas.setPointerCapture;
    const originalReleasePointerCapture = canvas.releasePointerCapture;
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 7, button: 0, buttons: 1, clientX, clientY,
    }));
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId: 7, button: 0, buttons: 0, clientX, clientY,
    }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, code: 'ArrowRight', key: 'ArrowRight',
    }));
    try {
      await waitFor('interaction state proof', () => {
        const statuses = JSON.parse(canvas.dataset.worldProofClassStatuses || '{}');
        return statuses.interaction === 'pass';
      });
    } catch (error) {
      throw new Error(error.message + '; scene=' + (canvas.dataset.sceneProofVerdict || '') +
        '; sceneFailures=' + (canvas.dataset.sceneProofRequiredFailures || '[]') +
        '; world=' + (canvas.dataset.worldProofVerdict || '') +
        '; classes=' + (canvas.dataset.worldProofClassStatuses || '{}'));
    }
    canvas.setPointerCapture = originalSetPointerCapture;
    canvas.releasePointerCapture = originalReleasePointerCapture;
    await waitFor('independent compiler determinism proof', () => (
      canvas.dataset.compilerDeterminismStatus === 'pass' &&
      canvas.dataset.compilerDeterminismInputHash &&
      canvas.dataset.compilerDeterminismBaselineHash ===
        canvas.dataset.compilerDeterminismRecompiledHash
    ));
    await waitFor('bound intent proof', () => (
      canvas.dataset.intentProofStatus === 'pass' &&
      canvas.dataset.intentProofRequirementHash &&
      canvas.dataset.intentProofSettlementHash &&
      Number(canvas.dataset.intentProofLostCount || 0) === 0
    ));
    await waitFor('bound semantic provenance proof', () => (
      canvas.dataset.semanticProofStatus === 'pass' &&
      canvas.dataset.semanticProofLedgerHash &&
      canvas.dataset.semanticProofGraphHash &&
      Number(canvas.dataset.semanticProofBindingCount || 0) > 0 &&
      Number(canvas.dataset.semanticProofMissingCount || 0) === 0
    ));
    await waitFor('fixed-step simulation reproducibility proof', () => (
      canvas.dataset.simulationReproducibilityStatus === 'pass' &&
      canvas.dataset.simulationReproducibilityBaselineHash &&
      canvas.dataset.simulationReproducibilityBaselineHash ===
        canvas.dataset.simulationReproducibilityReplayHash
    ));
    await waitFor('reproducible safety-gate proof', () => (
      canvas.dataset.safetyProofStatus === 'pass' &&
      canvas.dataset.safetyProofDecision === 'allow' &&
      canvas.dataset.safetyProofRulesHash &&
      canvas.dataset.safetyProofBaselineHash === canvas.dataset.safetyProofReplayHash
    ));
    await waitFor('enabled exact replay control', () => replayButton.disabled === false);
    const replayInputSerial = Number(canvas.dataset.renderInputSerial || 0);
    replayButton.click();
    try {
      await waitFor('bound WorldProof replay', () => (
        Number(canvas.dataset.renderInputSerial || 0) > replayInputSerial &&
        canvas.dataset.worldProofVerdict === 'pass'
      ));
    } catch (error) {
      throw new Error(error.message + '; verdict=' + (canvas.dataset.worldProofVerdict || '') +
        '; classes=' + (canvas.dataset.worldProofClassStatuses || '{}') +
        '; failures=' + (canvas.dataset.worldProofCriticalFailures || '[]') +
        '; inputSerial=' + (canvas.dataset.renderInputSerial || '0'));
    }
    const propertyObligations = edited.phaseArtifacts.phase6.artifact.visualCompile.compositionLedger.obligations
      .filter((row) => row.constraintKind === 'property' && row.targetNodeId === acceptedNode.id);
    const patch = edited.authorship.patches.find((row) => (
      row.revision === edited.authorship.revision && /\/properties\/\d+\/value$/.test(row.targetPath)
    ));
    const semanticPropertyBinding = edited.phaseArtifacts.phase4.artifact.semanticProvenance.bindings
      .find((row) => row.kind === 'property' && row.targetPath === patch?.targetPath.replace(/\/value$/, ''));
    const geometryProgram = packetNode?.geometry?.program || {};
    const geometryParts = geometryProgram.parts || [];
    const greenParts = geometryParts.filter((part) => part.fill === '#00aa44');
    const controls = Array.from(document.querySelectorAll('#world-spec-editor-panel button'));
    const viewportFits = controls.every((control) => {
      const rect = control.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1;
    });
    const dock = document.querySelector('.prompt-dock');
    dock.scrollTop = Math.max(0, editorPanel.offsetTop - 18);
    await delay(120);
    return {
      schema: 'simulatte.worldSpecEditorBrowserAudit.v1',
      viewport: { width: innerWidth, height: innerHeight },
      prompt,
      initialSceneProofVerdict: before.sceneProofVerdict,
      initialRequiredFailures: before.requiredFailures,
      originalColor,
      editedColor: acceptedNode.properties.find((row) => row.kind === 'color')?.value || '',
      visualColor: visualNode?.properties?.find((row) => row.kind === 'color')?.value || '',
      greenGeometryPartCount: greenParts.length,
      constructionTopologyId: geometryProgram.constructionGraph?.topologyId || '',
      constructionTopologyTargetFit: geometryProgram.constructionReceipt?.topologyTargetFit === true,
      constructionPartIds: geometryParts.map((part) => part.id),
      propertyObligationIds: propertyObligations.map((row) => row.id),
      propertyObligationValues: propertyObligations.map((row) => row.expectedValue),
      propertyObligationStatuses: propertyObligations.map((row) => row.status),
      propertyObligationAuthorities: propertyObligations.map((row) => row.authorship?.authority || ''),
      patchAuthority: patch?.authority || '',
      propertyPatchId: patch?.id || '',
      patchAffectedObligationIds: patch?.affectedObligationIds || [],
      semanticPropertyAuthority: semanticPropertyBinding?.authority || '',
      semanticPropertyPatchIds: semanticPropertyBinding?.patchIds || [],
      before,
      after: {
        contentHash: edited.contentHash,
        revision: edited.authorship.revision,
        renderCount: Number(canvas.dataset.renderCount || 0),
        renderInputSerial: Number(canvas.dataset.renderInputSerial || 0),
      },
      editorStatus: status.dataset.state,
      sceneVisible: canvas.dataset.sceneVisible,
      renderer: canvas.dataset.renderer,
      rendererStatus: canvas.dataset.rendererStatus,
      sceneProofVerdict: canvas.dataset.sceneProofVerdict || '',
      sceneProofRequiredFailures: JSON.parse(canvas.dataset.sceneProofRequiredFailures || '[]'),
      worldProofVerdict: canvas.dataset.worldProofVerdict || '',
      worldProofContentHash: canvas.dataset.worldProofContentHash || '',
      worldProofWorldSpecHash: canvas.dataset.worldProofWorldSpecHash || '',
      worldProofCriticalFailures: JSON.parse(canvas.dataset.worldProofCriticalFailures || '[]'),
      worldProofClassStatuses: JSON.parse(canvas.dataset.worldProofClassStatuses || '{}'),
      intentProofStatus: canvas.dataset.intentProofStatus || '',
      intentProofRequirementHash: canvas.dataset.intentProofRequirementHash || '',
      intentProofSettlementHash: canvas.dataset.intentProofSettlementHash || '',
      intentProofAcceptedCount: Number(canvas.dataset.intentProofAcceptedCount || 0),
      intentProofRefusalCount: Number(canvas.dataset.intentProofRefusalCount || 0),
      intentProofUnresolvedCount: Number(canvas.dataset.intentProofUnresolvedCount || 0),
      intentProofLostCount: Number(canvas.dataset.intentProofLostCount || 0),
      semanticProofStatus: canvas.dataset.semanticProofStatus || '',
      semanticProofLedgerHash: canvas.dataset.semanticProofLedgerHash || '',
      semanticProofGraphHash: canvas.dataset.semanticProofGraphHash || '',
      semanticProofBindingCount: Number(canvas.dataset.semanticProofBindingCount || 0),
      semanticProofProvenCount: Number(canvas.dataset.semanticProofProvenCount || 0),
      semanticProofMissingCount: Number(canvas.dataset.semanticProofMissingCount || 0),
      compilerDeterminismStatus: canvas.dataset.compilerDeterminismStatus || '',
      compilerDeterminismInputHash: canvas.dataset.compilerDeterminismInputHash || '',
      compilerDeterminismBaselineHash: canvas.dataset.compilerDeterminismBaselineHash || '',
      compilerDeterminismRecompiledHash: canvas.dataset.compilerDeterminismRecompiledHash || '',
      compilerDeterminismLane: canvas.dataset.compilerDeterminismLane || '',
      simulationReproducibilityStatus: canvas.dataset.simulationReproducibilityStatus || '',
      simulationReproducibilityBaselineHash:
        canvas.dataset.simulationReproducibilityBaselineHash || '',
      simulationReproducibilityReplayHash:
        canvas.dataset.simulationReproducibilityReplayHash || '',
      simulationReproducibilityMaxDelta:
        Number(canvas.dataset.simulationReproducibilityMaxDelta || 0),
      interactionProofStatus: canvas.dataset.interactionProofStatus || '',
      interactionProofContentHash: canvas.dataset.interactionProofContentHash || '',
      interactionProofProgramHash: canvas.dataset.interactionProofProgramHash || '',
      interactionProofTransitionHash: canvas.dataset.interactionProofTransitionHash || '',
      interactionProofProvenTransitionCount:
        Number(canvas.dataset.interactionProofProvenTransitionCount || 0),
      interactionProofInvalidTransitionCount:
        Number(canvas.dataset.interactionProofInvalidTransitionCount || 0),
      interactionProofChangedChannelCount:
        Number(canvas.dataset.interactionProofChangedChannelCount || 0),
      safetyProofStatus: canvas.dataset.safetyProofStatus || '',
      safetyProofDecision: canvas.dataset.safetyProofDecision || '',
      safetyProofRulesHash: canvas.dataset.safetyProofRulesHash || '',
      safetyProofBaselineHash: canvas.dataset.safetyProofBaselineHash || '',
      safetyProofReplayHash: canvas.dataset.safetyProofReplayHash || '',
      documentFitsViewport: document.documentElement.scrollWidth <= innerWidth + 1,
      controlsFitViewport: viewportFits,
    };
  })()`;
}

function assertReceipt(receipt) {
  const expected = [
    [receipt.originalColor === '#ef3340', `expected original red property, received ${receipt.originalColor}`],
    [receipt.initialSceneProofVerdict === 'fail', 'initial unsupported requirement did not produce a critical proof failure'],
    [receipt.initialRequiredFailures.some((row) => /qzxwplk/i.test(JSON.stringify(row))), 'initial proof failure did not identify qzxwplk'],
    [receipt.editedColor === '#00aa44', `Phase 4 retained ${receipt.editedColor || 'no color'}`],
    [receipt.visualColor === '#00aa44', `Phase 6 retained ${receipt.visualColor || 'no color'}`],
    [receipt.greenGeometryPartCount > 0, 'scene packet has no green geometry parts'],
    [receipt.constructionTopologyId === 'spherical-body', `expected spherical-body topology, received ${receipt.constructionTopologyId || 'missing'}`],
    [receipt.constructionTopologyTargetFit, 'spherical construction was not bound to the ball identity'],
    [receipt.constructionPartIds.includes('sphere-body'), 'spherical construction omitted its sphere body'],
    [receipt.constructionPartIds.includes('specular-highlight'), 'spherical construction omitted its highlight'],
    [!receipt.constructionPartIds.includes('spin-axis'), 'ball construction exposed its abstract spin axis as visible geometry'],
    [!receipt.constructionPartIds.some((id) => /neck|string|soundhole|bridge/.test(id)), 'ball construction retained instrument parts'],
    [receipt.propertyObligationValues.length === 1 && receipt.propertyObligationValues[0] === '#00aa44', 'Phase 6 proof retained a stale property obligation'],
    [receipt.propertyObligationStatuses[0] === 'preserved', 'edited property obligation was not preserved'],
    [receipt.propertyObligationAuthorities[0] === 'userOverride', 'edited property obligation lost user authority'],
    [receipt.patchAuthority === 'userOverride', 'edit patch lost user authority'],
    [receipt.patchAffectedObligationIds.includes('visual:prompt-property-ball-color-#ef3340'), 'edit patch did not identify the superseded prompt obligation'],
    [receipt.after.renderInputSerial > receipt.before.renderInputSerial, 'Phase 7 did not accept a new render input'],
    [receipt.after.renderCount > receipt.before.renderCount, 'Phase 7 did not render the edited world'],
    [receipt.editorStatus !== 'error', 'editor reported an error'],
    [receipt.sceneVisible === 'true', 'edited scene is not visible'],
    [receipt.renderer === 'webgpu', `expected WebGPU renderer, received ${receipt.renderer || 'missing'}`],
    [receipt.sceneProofVerdict === 'pass', `Phase 8 returned ${receipt.sceneProofVerdict || 'no verdict'}`],
    [receipt.sceneProofRequiredFailures.length === 0, 'Phase 8 retained required failures after the edit'],
    [receipt.worldProofVerdict === 'pass', `expected complete WorldProof after replay, received ${receipt.worldProofVerdict || 'missing'}`],
    [receipt.worldProofContentHash.startsWith('fnv1a32:'), 'WorldProof is not content addressed'],
    [receipt.worldProofWorldSpecHash === receipt.after.contentHash, 'WorldProof is not bound to the edited WorldSpec hash'],
    [receipt.intentProofStatus === 'pass', 'typed intent proof did not pass'],
    [receipt.intentProofRequirementHash.startsWith('fnv1a32:'), 'intent proof does not bind Phase 2 requirements'],
    [receipt.intentProofSettlementHash.startsWith('fnv1a32:'), 'intent proof does not bind Phase 4 settlement'],
    [receipt.intentProofAcceptedCount === 2, `expected two accepted intent requirements, received ${receipt.intentProofAcceptedCount}`],
    [receipt.intentProofRefusalCount === 2, `expected two explicit intent refusals, received ${receipt.intentProofRefusalCount}`],
    [receipt.intentProofUnresolvedCount === 0, 'intent proof retained unresolved requirements'],
    [receipt.intentProofLostCount === 0, 'intent proof lost a critical requirement'],
    [receipt.worldProofClassStatuses.intent === 'pass', 'WorldProof did not bind typed intent evidence'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'intent'), 'WorldProof retained a critical intent failure'],
    [receipt.semanticProofStatus === 'pass', 'typed semantic provenance proof did not pass'],
    [receipt.semanticProofLedgerHash.startsWith('fnv1a32:'), 'semantic proof does not bind the Phase 4 provenance ledger'],
    [receipt.semanticProofGraphHash.startsWith('fnv1a32:'), 'semantic proof does not bind the accepted graph projection'],
    [receipt.semanticProofBindingCount > 0, 'semantic proof contains no accepted fact bindings'],
    [receipt.semanticProofProvenCount === receipt.semanticProofBindingCount, 'semantic proof did not prove every accepted fact'],
    [receipt.semanticProofMissingCount === 0, 'semantic proof retained missing provenance'],
    [receipt.semanticPropertyAuthority === 'userOverride', 'edited semantic property did not bind user authority'],
    [receipt.semanticPropertyPatchIds.includes(receipt.propertyPatchId), 'edited semantic property has no patch provenance'],
    [receipt.worldProofClassStatuses.semantic === 'pass', 'WorldProof did not bind typed semantic evidence'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'semantic'), 'WorldProof retained a critical semantic failure'],
    [receipt.compilerDeterminismStatus === 'pass', 'independent compiler determinism did not pass'],
    [receipt.compilerDeterminismInputHash.startsWith('fnv1a32:'), 'compiler proof does not bind declared inputs'],
    [receipt.compilerDeterminismBaselineHash === receipt.before.contentHash, 'compiler proof baseline does not match the pre-edit WorldSpec'],
    [receipt.compilerDeterminismRecompiledHash === receipt.before.contentHash, 'independent compilation did not reproduce the pre-edit WorldSpec'],
    [receipt.compilerDeterminismLane === 'pipeline-worker', `expected pipeline-worker compiler proof, received ${receipt.compilerDeterminismLane || 'missing'}`],
    [receipt.simulationReproducibilityStatus === 'pass', 'fixed-step simulation reproducibility did not pass'],
    [receipt.simulationReproducibilityBaselineHash.startsWith('fnv1a32:'), 'simulation proof does not bind the baseline state'],
    [receipt.simulationReproducibilityReplayHash === receipt.simulationReproducibilityBaselineHash, 'independent simulation execution produced a different state hash'],
    [receipt.simulationReproducibilityMaxDelta <= 1e-9, 'simulation replay exceeded the declared tolerance'],
    [receipt.safetyProofStatus === 'pass', 'declared safety gates did not pass'],
    [receipt.safetyProofDecision === 'allow', `expected allowing safety decision, received ${receipt.safetyProofDecision || 'missing'}`],
    [receipt.safetyProofRulesHash.startsWith('fnv1a32:'), 'safety proof does not bind the declared rules'],
    [receipt.safetyProofBaselineHash.startsWith('fnv1a32:'), 'safety proof does not bind a decision trace'],
    [receipt.safetyProofReplayHash === receipt.safetyProofBaselineHash, 'independent safety-gate decisions diverged'],
    [receipt.worldProofClassStatuses.simulation === 'pass', 'WorldProof did not bind live solver execution evidence'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'simulation'), 'WorldProof retained a simulation failure after live solver execution'],
    [receipt.interactionProofStatus === 'pass', 'typed interaction transition proof did not pass'],
    [receipt.interactionProofContentHash.startsWith('fnv1a32:'), 'interaction proof is not content addressed'],
    [receipt.interactionProofProgramHash.startsWith('fnv1a32:'), 'interaction proof does not bind the authored InteractionIR'],
    [receipt.interactionProofTransitionHash.startsWith('fnv1a32:'), 'interaction proof does not bind before and after state'],
    [receipt.interactionProofProvenTransitionCount > 0, 'interaction proof contains no proven transition'],
    [receipt.interactionProofInvalidTransitionCount === 0, 'interaction proof retained an invalid transition'],
    [receipt.interactionProofChangedChannelCount > 0, 'interaction proof retained no changed simulation channel'],
    [receipt.worldProofClassStatuses.interaction === 'pass', 'WorldProof did not bind an executed control transition'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'interaction'), 'WorldProof retained an interaction failure after the control changed state'],
    [receipt.worldProofClassStatuses.safety === 'pass', 'WorldProof did not bind reproducible safety-gate evidence'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'safety'), 'WorldProof retained a safety failure after an allowing gate decision'],
    [receipt.worldProofClassStatuses.replay === 'pass', 'WorldProof did not bind the independent replay comparison'],
    [!receipt.worldProofCriticalFailures.some((row) => row.class === 'replay'), 'WorldProof retained a replay failure after identical outcomes'],
    [receipt.documentFitsViewport, 'document overflows the viewport horizontally'],
    [receipt.controlsFitViewport, 'editor controls overflow the viewport horizontally'],
  ];
  const failures = expected.filter(([passes]) => !passes).map(([, message]) => message);
  if (failures.length) throw new Error(`WorldSpec editor browser audit failed: ${failures.join('; ')}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chromePath = findChrome(options.chromePath);
  const staticServer = options.url ? null : createStaticSiteServer({ publicRoot: PUBLIC });
  if (staticServer) {
    await new Promise((resolve, reject) => staticServer.listen(0, '127.0.0.1', resolve).once('error', reject));
  }
  const targetUrl = options.url || `http://127.0.0.1:${staticServer.address().port}/blank/?auditNoInitial=1`;
  const debugPort = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-world-spec-editor-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--enable-unsafe-webgpu',
    ...(process.platform === 'linux' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'] : []),
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${options.viewport.width},${options.viewport.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let client = null;
  try {
    const page = await waitForDevtools(debugPort, chrome);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    const errors = [];
    client.on('Runtime.exceptionThrown', (params) => errors.push(
      params.exceptionDetails.exception?.description || params.exceptionDetails.text || 'browser exception'
    ));
    await Promise.all([
      client.send('Runtime.enable'),
      client.send('Page.enable'),
      client.send('Log.enable'),
      client.send('Network.enable'),
    ]);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewport.width,
      height: options.viewport.height,
      deviceScaleFactor: 1,
      mobile: options.viewport.width < 600,
    });
    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: targetUrl });
    await loaded;
    const receipt = await evaluate(client, editorProbeExpression(options.prompt));
    if (errors.length) throw new Error(`Browser exceptions: ${errors.join(' | ')}`);
    assertReceipt(receipt);
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
    });
    fs.mkdirSync(options.outDir, { recursive: true });
    const screenshotPath = path.join(options.outDir, `${options.viewport.width}x${options.viewport.height}.png`);
    const screenshotBytes = Buffer.from(screenshot.data, 'base64');
    fs.writeFileSync(screenshotPath, screenshotBytes);
    const report = {
      ...receipt,
      screenshot: path.relative(ROOT, screenshotPath),
      screenshotSha256: crypto.createHash('sha256').update(screenshotBytes).digest('hex'),
    };
    const reportPath = path.join(options.outDir, `${options.viewport.width}x${options.viewport.height}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, report: reportPath, screenshot: screenshotPath, receipt }, null, 2));
  } finally {
    await client?.close();
    await stopChrome(chrome);
    if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
