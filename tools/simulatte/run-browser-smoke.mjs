#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuditHost, openBrowserAudit, findChrome, stopChild, removeTemporaryDirectory } from './browser-session.mjs';
import { CdpClient } from './browser-harness.mjs';

import { pluginFeatureExpression, profileProgramRoundTripExpression, actorViewExpression } from './browser-profile-probes.mjs';
import { browserJourneyExpression, consentFlowExpression } from './browser-journey-probe.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'autonomy-browser-smoke');

function parseArgs(argv) {
  const options = { outDir: DEFAULT_OUT, checkOnly: false, chromePath: process.env.CHROME_PATH || '', url: '', viewport: { width: 1440, height: 1000 } };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--url') options.url = parseUrl(value());
    else if (key === '--viewport') options.viewport = parseViewport(value());
    else if (key === '--check') options.checkOnly = true;
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/run-browser-smoke.mjs [--check] [--out DIR] [--chrome PATH] [--url HTTP_URL] [--viewport WIDTHxHEIGHT]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function parseUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Autonomy browser URL expected HTTP or HTTPS, received ${url.protocol}`);
  }
  return url.toString();
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value || ''));
  if (!match) throw new Error(`Autonomy browser viewport expected WIDTHxHEIGHT, received ${value || 'missing'}`);
  const viewport = { width: Number(match[1]), height: Number(match[2]) };
  if (viewport.width < 320 || viewport.height < 480) {
    throw new Error(`Autonomy browser viewport expected at least 320x480, received ${value}`);
  }
  return viewport;
}

function semanticCameraExpectation(decision) {
  if (!decision || typeof decision.source !== 'string' || typeof decision.mode !== 'string') return null;
  const sourceIntentId = decision.intentId?.startsWith(`${decision.source}:`)
    ? decision.intentId.slice(decision.source.length + 1)
    : null;
  const aggregateFocusId = sourceIntentId ? `plugin:${decision.source}:${sourceIntentId}` : null;
  const subjectFocusId = decision.targetIds?.[0] ? `plugin:${decision.source}:${decision.targetIds[0]}` : null;
  if (['overview', 'compare'].includes(decision.mode)) {
    return aggregateFocusId ? { mode: decision.mode, focusId: aggregateFocusId } : null;
  }
  if (['follow', 'pov'].includes(decision.mode)) {
    return subjectFocusId ? { mode: 'follow', focusId: subjectFocusId } : null;
  }
  return null;
}

const createStaticServer = () => createAuditHost({ publicRoot: PUBLIC });

async function runBrowserSmoke(options) {
  if (typeof WebSocket !== 'function') throw new Error('Autonomy browser smoke requires a Node runtime with WebSocket support');
  const pathSegments = new URL(options.url || 'http://localhost/city').pathname.split('/').filter(Boolean);
  const expectedProfileId = (pathSegments[0] === 'city' ? pathSegments[1] : null) || defaultCityProfileId();
  const expectedProfile = profileDefinition(expectedProfileId);
  const expectedProfileIds = cityProfileIds();
  const expectedPluginIds = new Set(expectedProfile.plugins.map((row) => row.id));
  const configuredRunMode = expectedProfile.camera?.runMode || 'follow';
  const expectedRunCameraMode = configuredRunMode === 'bird' ? 'overview' : configuredRunMode;
  const browser = await openBrowserAudit({ ...options, publicRoot: PUBLIC, webgpu: true });
  const { client, host: staticHost } = browser;
  const targetUrl = options.url || new URL('city', staticHost.baseUrl).toString();
  try {
    const errors = [];
    const failedResponses = [];
    client.on('Runtime.exceptionThrown', (params) => errors.push({
      kind: 'exception',
      text: params.exceptionDetails.exception && params.exceptionDetails.exception.description || params.exceptionDetails.text,
    }));
    client.on('Log.entryAdded', (params) => {
      if (params.entry.level === 'error') errors.push({ kind: 'log', text: params.entry.text });
    });
    client.on('Runtime.consoleAPICalled', (params) => {
      const values = params.args.map((row) => row.value).filter((row) => row !== undefined);
      if (values[0] === 'SIMULATTE_BROWSER_PHASE') {
        console.log(`SIMULATTE-BROWSER phase=${values[1]}`);
        if (process.env.SIMULATTE_DEBUG_PAUSE === '1' && values[1] === 'scenario_shuffle_dispatched') {
          setTimeout(() => client.send('Debugger.pause').catch(() => {}), 3000);
        }
      }
    });
    client.on('Debugger.paused', (params) => {
      const frames = params.callFrames.slice(0, 12).map((frame) => (
        `${frame.functionName || '<anonymous>'} ${frame.url}:${frame.location.lineNumber + 1}`
      ));
      console.log(`SIMULATTE-BROWSER paused=${frames.join(' <- ')}`);
      void client.send('Debugger.resume');
    });
    client.on('Network.responseReceived', (params) => {
      if (params.response.status >= 400) failedResponses.push({ url: params.response.url, status: params.response.status });
    });
    await Promise.all([
      client.send('Runtime.enable'),
      client.send('Page.enable'),
      client.send('Log.enable'),
      client.send('Network.enable'),
      ...(process.env.SIMULATTE_DEBUG_PAUSE === '1' ? [client.send('Debugger.enable')] : []),
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
    const consentEvaluation = await client.send('Runtime.evaluate', {
      expression: consentFlowExpression(),
      awaitPromise: true,
      returnByValue: true,
    });
    if (consentEvaluation.exceptionDetails) throw new Error(consentEvaluation.exceptionDetails.exception && consentEvaluation.exceptionDetails.exception.description || consentEvaluation.exceptionDetails.text);
    const consentView = consentEvaluation.result.value;
    console.log('SIMULATTE-BROWSER phase=consent-complete');
    await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const started = performance.now();
        const canvas = document.getElementById('autonomy-canvas');
        const expectation = () => {
          const decision = globalThis.__simulattePluginPlatformV4?.view?.state?.decision;
          if (!decision || decision.source === 'core-fallback') return null;
          const sourceIntentId = decision.intentId?.startsWith(decision.source + ':')
            ? decision.intentId.slice(decision.source.length + 1)
            : null;
          if (!sourceIntentId || !['overview', 'compare'].includes(decision.mode)) return null;
          return {
            mode: decision.mode,
            focusId: 'plugin:' + decision.source + ':' + sourceIntentId,
          };
        };
        while (
          document.body.dataset.journeyPhase === 'loading'
          || !expectation()
          || canvas.dataset.cameraTransition !== 'settled'
          || canvas.dataset.cameraMode !== expectation().mode
          || canvas.dataset.cameraFocus !== expectation().focusId
        ) {
          if (performance.now() - started > 5000) throw new Error('initial experience view did not settle');
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await new Promise((resolve) => setTimeout(resolve, 360));
      })()`,
      awaitPromise: true,
    });
    console.log('SIMULATTE-BROWSER phase=initial-view-settled');
    const initialExperienceScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    console.log('SIMULATTE-BROWSER phase=journey-probe-started');
    const evaluated = await client.send('Runtime.evaluate', {
      expression: browserJourneyExpression(expectedRunCameraMode, expectedProfile.interaction?.mode === 'playback'),
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description || evaluated.exceptionDetails.text);
    const browserVersion = await client.send('Browser.getVersion');
    const overviewScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await client.send('Runtime.evaluate', { expression: `document.getElementById('application-profile-trigger').click()` });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const profileSelectScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await client.send('Runtime.evaluate', { expression: `document.querySelector('#application-profile-options [aria-selected="true"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))` });
    const decisionViewEvaluation = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const button = document.getElementById('decisions-button');
        const drawer = document.getElementById('decisions-drawer');
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 320));
        const value = {
          open: drawer.classList.contains('is-open'),
          hidden: drawer.getAttribute('aria-hidden'),
          expanded: button.getAttribute('aria-expanded'),
          summary: document.getElementById('decision-title').textContent.trim(),
        };
        document.getElementById('decisions-close').click();
        return value;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (decisionViewEvaluation.exceptionDetails) throw new Error(decisionViewEvaluation.exceptionDetails.exception && decisionViewEvaluation.exceptionDetails.exception.description || decisionViewEvaluation.exceptionDetails.text);
    const decisionView = decisionViewEvaluation.result.value;
    await client.send('Runtime.evaluate', { expression: `document.getElementById('decisions-button').click()` });
    await new Promise((resolve) => setTimeout(resolve, 320));
    const decisionScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await client.send('Runtime.evaluate', { expression: `document.getElementById('decisions-close').click()` });
    const actorViewEvaluation = await client.send('Runtime.evaluate', {
      expression: actorViewExpression(),
      awaitPromise: true,
      returnByValue: true,
    });
    if (actorViewEvaluation.exceptionDetails) throw new Error(actorViewEvaluation.exceptionDetails.exception && actorViewEvaluation.exceptionDetails.exception.description || actorViewEvaluation.exceptionDetails.text);
    const actorView = actorViewEvaluation.result.value;
    const actorScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const expectsP2pDelivery = expectedPluginIds.has('p2p-delivery');
    const expectsSunWalker = expectedPluginIds.has('sun-walker');
    const expectsCableTrader = expectedPluginIds.has('cable-trader');
    const featureViewEvaluation = await client.send('Runtime.evaluate', {
      expression: pluginFeatureExpression({ expectsP2pDelivery, expectsSunWalker, expectsCableTrader }),
      awaitPromise: true,
      returnByValue: true,
    });
    if (featureViewEvaluation.exceptionDetails) throw new Error(featureViewEvaluation.exceptionDetails.exception && featureViewEvaluation.exceptionDetails.exception.description || featureViewEvaluation.exceptionDetails.text);
    const featureView = featureViewEvaluation.result.value;
    const profileProgramEvaluation = await client.send('Runtime.evaluate', {
      expression: profileProgramRoundTripExpression(expectedProfile.seeds || []),
      awaitPromise: true,
      returnByValue: true,
    });
    if (profileProgramEvaluation.exceptionDetails) throw new Error(profileProgramEvaluation.exceptionDetails.exception && profileProgramEvaluation.exceptionDetails.exception.description || profileProgramEvaluation.exceptionDetails.text);
    const profileProgram = profileProgramEvaluation.result.value;
    const result = evaluated.result.value;
    const visualGeometryPass = visualGeometryExpectation(result);
    const p2pDeliveryPass = expectsP2pDelivery
      ? featureView.cooperation.visible
        && featureView.cooperation.title === 'Cooperative delivery'
        && featureView.cooperation.match.length > 0
        && featureView.cooperation.compensation.includes('$')
        && featureView.gpuParity.pass
        && featureView.gpuParity.candidateCount === 3
        && featureView.gpuParity.maximumAbsoluteError <= featureView.gpuParity.tolerance
      : !featureView.cooperation.visible && featureView.gpuParity === null;
    const sunWalkerPass = expectsSunWalker
      ? featureView.shade.visible
        && featureView.shade.routeAlgorithms.includes('arrival_time_building_occlusion_v2')
        && featureView.shade.routeAlgorithms.includes('bounded_alternative_route_selection_v2')
        && featureView.shade.selected === 'Shade-selected route'
        && featureView.shade.actorCount === 1
        && featureView.shade.exposureSeconds > 0
        && ['overview', 'follow', 'pov', 'compare', 'free', 'top'].includes(featureView.shade.viewMode)
      : !featureView.shade.visible;
    const featurePass = p2pDeliveryPass
      && sunWalkerPass
      && (expectsCableTrader
        ? featureView.cableTrader.visible
          && featureView.cableTrader.peopleResidences.includes('256 people')
          && featureView.cableTrader.peopleResidences.includes('256 unique homes')
          && featureView.cableTrader.globalSupply.includes('cables offered')
          && featureView.cableTrader.globalDemand.includes('cables requested')
          && featureView.cableTrader.pseudoYearTotal.includes('reused')
          && featureView.cableTrader.residencePointCount === 256
          && featureView.cableTrader.hubLayerCount === 4
          && featureView.cableTrader.travelerLayerCount >= 1
          && featureView.cableTrader.markerCount >= 256
          && featureView.cableTrader.pathCount >= 1
          && featureView.cableTrader.labelCount > 0
        : !featureView.cableTrader.visible);
    const isPluginPlayback = expectedProfile.interaction?.mode === 'playback';
    const localNavigation = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(targetUrl).hostname);
    const performancePass = result.smoothness.rafFrameCount >= 120
      && result.smoothness.frameIntervalMs.p95 <= 20
      && result.smoothness.over33msRatio <= 0.01
      && (isPluginPlayback
        ? result.smoothness.longTaskCount <= 3
          && result.smoothness.longestTaskMs <= 500
        : result.smoothness.longTaskCount === 0);
    const initialViewExpectation = semanticCameraExpectation(result.camera.initial.decision);
    const initialViewPass = Boolean(
      initialViewExpectation
      && expectedPluginIds.has(result.camera.initial.decision.source)
      && result.camera.initial.mode === initialViewExpectation.mode
      && result.camera.initial.focus === initialViewExpectation.focusId
    );
    const autonomyProofPassed = isPluginPlayback
      ? result.pluginPlayback?.schema === 'simulatte.pluginPlaybackRunReceipt.v1'
        && result.pluginPlayback.settlements?.every((row) => row.obligationResults.every((obligation) => obligation.status === 'settled'))
      : result.retrievalRows > 0
        && result.rerankRows > 0
        && result.occurrenceRows > 0
        && result.rerankerProof.includes('MRR')
        && result.rerankerProof.includes('→')
        && result.retrievalLaneLabel.startsWith('Lexical + typed rules')
        && result.gateRows === 7
        && result.traceRows > 0
        && result.selectedRows === 1
        && result.editInvalidatedController;
    const pass = result.state === 'completed'
      && result.rendererBackend === 'webgpu'
      && result.actorMeshSchema === 'simulatte.autonomyActorMesh.v1'
      && ['pedestrian', 'bicycle', 'scooter', 'car']
        .every((kind) => result.actorMeshKinds.split(',').includes(kind))
      && result.materialModel === 'metallic_roughness_vertex_v1'
      // Plugin-owned playback worlds may intentionally provide their own
      // modeled actors and do not promise the core autonomy ambient-traffic
      // fixture. Core journeys still require the canonical 13-actor proof.
      && (isPluginPlayback || result.ambientActorCount === 13)
      && (isPluginPlayback || result.ambientActorKinds === 'pedestrian,bicycle,scooter,car')
      && result.rendererFrames > 0
      && performancePass
      && visualGeometryPass
      && autonomyProofPassed
      && result.runtimeLog.eventCount >= 8
      && result.runtimeLog.requiredEventsPresent
      && result.runtimeLog.manifestMissionExampleCount >= 4
      && result.runtimeLog.manifestCacheMode === 'no-cache'
      && (isPluginPlayback || result.runtimeLog.embeddingExecuted === false)
      && (isPluginPlayback || result.runtimeLog.neuralRerankerExecuted === false)
      && result.runtimeLog.failureCount === 0
      && result.missionLockedDuringRun
      && result.shuffle.changed
      && result.shuffle.startLabel.length > 0
      && (result.shuffle.interactionMode === 'prompt' ? result.shuffle.startLabel === 'Start' : result.shuffle.seedChanged)
      && result.urlState.scenarioChanged
      && result.urlState.hasTypedParameters
      && result.copy.removedLabelsAbsent
      && (
        result.copy.createLink.href === (localNavigation ? './blank/' : 'https://create.simulatte.world/')
        && result.copy.createLink.label === 'Prompt'
        && result.copy.createLink.insideProductNavigation
      )
      && result.copy.experienceDocLink.label === 'Experience docs'
      && result.copy.experienceDocLink.visible
      && result.copy.experienceDocLink.matchesActiveProfile
      && result.copy.experienceDocLink.target === '_blank'
      && result.copy.experienceDocLink.rel.includes('noopener')
      && result.copy.experienceDocLink.rel.includes('noreferrer')
      && result.copy.experienceDocLink.withinViewport
      && result.copy.experienceDocLink.insideMissionDock
      && !result.copy.experienceDocLink.overlapsMissionContent
      && consentView.disclosed.title === 'Enable local Qwen embedding?'
      && consentView.disclosed.embedding === '533 MB'
      && consentView.disclosed.rerankerRowAbsent
      && consentView.disclosed.total === '533 MB for the embedding model'
      && consentView.disclosed.use === 'Simulatte uses Qwen embeddings only when deterministic place matching refuses.'
      && consentView.grantRemembered
      && consentView.revoked
      && consentView.finalEnabled === false
      && result.initialLayout.allWithinViewport
      && result.initialLayout.primaryControlsVisible
      && result.applicationProfile.enabled
      && result.applicationProfile.selectedId === expectedProfileId
      && result.applicationProfile.optionIds.length === expectedProfileIds.length
      && result.applicationProfile.optionIds.every((id, index) => id === expectedProfileIds[index])
      && result.applicationProfile.custom.enabled
      && result.applicationProfile.custom.opened
      && result.applicationProfile.custom.groupLabels.length === 0
      && result.applicationProfile.custom.optionCount === expectedProfileIds.length
      && result.applicationProfile.custom.selectedLabel.length > 0
      && result.applicationProfile.custom.escapeClosed
      && decisionView.open
      && decisionView.hidden === 'false'
      && decisionView.expanded === 'true'
      && decisionView.summary.length > 0
      && result.camera.startedInConfiguredMode
      && result.camera.configuredRunMode === expectedRunCameraMode
      && initialViewPass
      && result.camera.experiences.focusControlAbsent
      && result.camera.experiences.available.length >= 1
      && result.camera.experiences.selected === result.camera.initial.mode
      && (expectedRunCameraMode === 'follow'
        ? result.camera.minimap.visible && result.camera.minimap.frameCount > 0 && result.camera.minimap.projection === 'orthographic_top_north_up'
        : !result.camera.minimap.visible)
      && result.camera.modeProbes.every((row) => row.began && row.noSnap && row.progressed && row.settled && row.moved)
      && result.camera.panWorked
      && result.camera.orbitWorked
      && result.camera.zoomWorked
      && result.camera.followZoomWorked
      && (isPluginPlayback || result.distance === '1524 m')
      && result.runtime === 'Complete'
      && (isPluginPlayback || (
        actorView.mode === 'follow'
        && actorView.transition === 'settled'
        && actorView.followDistance <= 5.01
        && actorView.dynamicVertexCount > 1000
        && actorView.minimapVisible
        && actorView.minimapFrameCount > 0
      ))
      && featurePass
      && profileProgram.pass
      && result.scrollY === 0
      && !result.hasHorizontalOverflow
      && errors.length === 0
      && failedResponses.length === 0;
    const diagnostics = Object.freeze({
      performance: performancePass,
      profileScope: result.applicationProfile.selectedId === expectedProfileId
        && result.applicationProfile.optionIds.length === expectedProfileIds.length
        && result.applicationProfile.optionIds.every((id, index) => id === expectedProfileIds[index])
        && result.applicationProfile.custom.optionCount === expectedProfileIds.length,
      visualRuntime: result.state === 'completed'
        && result.rendererBackend === 'webgpu'
        && result.rendererFrames > 0
        && visualGeometryPass,
      evidence: result.runtimeLog.requiredEventsPresent
        && result.runtimeLog.failureCount === 0
        && (isPluginPlayback
          ? result.pluginPlayback?.settlements?.every((row) => row.obligationResults.every((obligation) => obligation.status === 'settled'))
          : result.traceRows > 0 && result.selectedRows === 1),
      layout: result.initialLayout.allWithinViewport
        && result.initialLayout.primaryControlsVisible
        && !result.hasHorizontalOverflow
        && result.copy.experienceDocLink.withinViewport
        && result.copy.experienceDocLink.insideMissionDock
        && !result.copy.experienceDocLink.overlapsMissionContent,
      camera: result.camera.startedInConfiguredMode
        && result.camera.experiences.focusControlAbsent
        && result.camera.experiences.available.length >= 1
        && result.camera.modeProbes.every((row) => row.began && row.noSnap && row.progressed && row.settled && row.moved)
        && result.camera.experiences.selected === result.camera.initial.mode,
      initialView: initialViewPass,
      plugins: featurePass,
      profileProgram: profileProgram.pass,
      browserErrors: errors.length === 0 && failedResponses.length === 0,
    });
    const failedDiagnostics = Object.entries(diagnostics).filter(([, passed]) => !passed).map(([id]) => id);
    const report = {
      schema: 'simulatte.autonomyBrowserSmoke.v13',
      pass,
      targetUrl,
      viewport: options.viewport,
      browser: { product: browserVersion.product, protocolVersion: browserVersion.protocolVersion, userAgent: browserVersion.userAgent },
      result,
      consentView,
      decisionView,
      actorView,
      featureView,
      profileProgram,
      errors,
      failedResponses,
      diagnostics,
      failedDiagnostics,
      requests: staticHost ? staticHost.requests : [],
      claimBoundary: 'This smoke proves the checked-in static browser journey executed in the named browser. It does not establish physical-world autonomy.',
    };
    if (!options.checkOnly) {
      fs.mkdirSync(options.outDir, { recursive: true });
      fs.writeFileSync(path.join(options.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
      fs.writeFileSync(path.join(options.outDir, 'experience-initial.png'), Buffer.from(initialExperienceScreenshot.data, 'base64'));
      fs.writeFileSync(path.join(options.outDir, 'journey.png'), Buffer.from(overviewScreenshot.data, 'base64'));
      fs.writeFileSync(path.join(options.outDir, 'application-profile-select.png'), Buffer.from(profileSelectScreenshot.data, 'base64'));
      fs.writeFileSync(path.join(options.outDir, 'decisions.png'), Buffer.from(decisionScreenshot.data, 'base64'));
      fs.writeFileSync(path.join(options.outDir, 'actor-follow.png'), Buffer.from(actorScreenshot.data, 'base64'));
    }
    return report;
  } finally {
    await browser.close();
  }
}

function profileDefinition(profileId) {
  const manifest = cityManifest();
  const references = [manifest.applicationProfile, ...(manifest.applicationProfiles || [])];
  const reference = references.find((row) => row.id === profileId);
  if (!reference) throw new Error(`Autonomy browser profile ${profileId} is not declared`);
  const profilePath = path.resolve(PUBLIC, 'data', 'simulatte', reference.path);
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  return profile;
}

function defaultCityProfileId() {
  return cityManifest().applicationProfile.id;
}

function cityProfileIds() {
  const manifest = cityManifest();
  return [manifest.applicationProfile, ...(manifest.applicationProfiles || [])].map((row) => row.id);
}

function cityManifest() {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data', 'simulatte', 'autonomy-manifest.json'), 'utf8'));
}

function visualGeometryExpectation(result) {
  const receipt = result?.rendererReceipt;
  if (receipt?.worldSurfaceOwner === 'plugin') {
    const pluginVertexCount = Number(receipt.pluginStaticVertexCount || 0)
      + Number(receipt.pluginOverlayVertexCount || 0)
      + Number(receipt.pluginShadowVertexCount || 0);
    return Number(receipt.staticVertexCount || 0) === 0
      && Number(receipt.groundOverlayVertexCount || 0) === 0
      && pluginVertexCount > 0;
  }
  return Number(result?.staticVertexCount || 0)
    + Number(receipt?.pluginStaticVertexCount || 0) > 10000;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runBrowserSmoke(options);
  console.log(`AUTONOMY-BROWSER state=${report.result.state} tick=${report.result.tick} trace=${report.result.traceRows} errors=${report.errors.length} failedResponses=${report.failedResponses.length} status=${report.pass ? 'pass' : 'fail'}`);
  console.log(`SIMULATTE-PROFILE-PROGRAM scenario=${report.profileProgram.scenarioId} verdict=${report.profileProgram.verdict} replay=${report.profileProgram.proofClasses.replay} layout=${report.profileProgram.layout.pass ? 'pass' : 'fail'}`);
  if (report.failedDiagnostics.length) console.log(`AUTONOMY-BROWSER failedChecks=${report.failedDiagnostics.join(',')}`);
  if (!report.pass) process.exitCode = 1;
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    () => process.exit(process.exitCode || 0),
    (error) => {
      console.error(error && error.stack || error);
      process.exit(1);
    }
  );
}

export {
  CdpClient,
  actorViewExpression,
  browserJourneyExpression,
  consentFlowExpression,
  createStaticServer,
  findChrome,
  parseUrl,
  parseViewport,
  profileProgramRoundTripExpression,
  removeTemporaryDirectory,
  runBrowserSmoke,
  semanticCameraExpectation,
  stopChild,
  visualGeometryExpectation,
};
