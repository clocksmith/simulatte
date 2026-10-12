import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CdpClient } from './browser-harness.mjs';
import { createStaticSiteServer } from './static-site-server.mjs';
import { auditSolarShade } from './audit-solar-shade.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nativeGpu=process.env.SIMULATTE_SOLAR_NATIVE_GPU==='1';
const OUT = process.env.SIMULATTE_SOLAR_AUDIT_OUT ? path.resolve(process.env.SIMULATTE_SOLAR_AUDIT_OUT) : path.join(ROOT, 'artifacts/solar-drive');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'simulatte-solar-chrome-'));
const displayRoot = path.join(ROOT, 'artifacts/solar-drive/browser-deps/root');
const displayBinary = process.env.SIMULATTE_XVFB || (await fs.access('/usr/bin/Xvfb').then(() => '/usr/bin/Xvfb', () => path.join(displayRoot, 'usr/bin/Xvfb')));
const virtualDisplay = spawn(displayBinary, ['-displayfd', '3', '-screen', '0', '1600x1200x24', '-nolisten', 'tcp', '-ac', '-noreset'], {
  env: { ...process.env, LD_LIBRARY_PATH: path.join(displayRoot, 'usr/lib/x86_64-linux-gnu') + ':' + (process.env.LD_LIBRARY_PATH || '') },
  stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
});
let displayLog = '';
virtualDisplay.stderr.on('data', (data) => { displayLog += data.toString(); });
const displayId = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { virtualDisplay.kill('SIGTERM'); reject(new Error('Virtual display startup timed out: ' + displayLog)); }, 15000);
  virtualDisplay.once('error', (error) => { clearTimeout(timer); reject(error); });
  virtualDisplay.once('exit', (code) => { clearTimeout(timer); reject(new Error('Virtual display exited: ' + code + ' ' + displayLog)); });
  virtualDisplay.stdio[3].once('data', (data) => { clearTimeout(timer); resolve(':' + data.toString().trim()); });
});
const server = createStaticSiteServer({ publicRoot: path.join(ROOT, 'public') });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const url = process.env.SIMULATTE_SOLAR_ORIGIN || `http://127.0.0.1:${server.address().port}/simulatte/solar-drive/`;
const sourceFiles=['tools/simulatte/audit-solar-shade.mjs','public/shared/render/atmospheric-sky.js','public/simulatte/motorcycle-noise/vendor/earcut.js','public/shared/core/simulation/solar-drive.js','public/shared/plugins/sun-walker/sun-exposure.js',
  'public/shared/contracts/world-spec.js','public/shared/contracts/world-spec-authorship.js','public/shared/design/control-components.js','public/shared/design/components.css',
  'public/simulatte/app/camera-fit.js','public/simulatte/platform/runtime/simulation-clock.js',
  'public/data/solar-drive/union-square-route-v1.json','public/data/solar-drive/published-ride-reference-v1.json',
  ...['program.js','geometry.js','shaders.js','scene.js','route.js','route-scene.js','renderer.js','app.js','index.html','solar-drive.css'].map(f=>`public/simulatte/solar-drive/${f}`)];
const browser = spawn(process.env.SIMULATTE_BROWSER || '/usr/bin/google-chrome', [
  '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-webgpu', '--use-angle=vulkan', '--enable-features=Vulkan',
  ...(nativeGpu?[]:['--enable-unsafe-swiftshader','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader']), '--disable-vulkan-surface',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { env: { ...process.env, DISPLAY: displayId }, stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '', client;
browser.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(-20000); });
const receipt = { schema: 'simulatte.solarDriveBrowserAudit.v1', route: '/simulatte/solar-drive/', status: 'running',
  backendPolicy: `Headed Chrome on an isolated Xvfb display, ${nativeGpu?'native GPU required':'explicit SwiftShader WebGPU'}; screenshots must pass pixel checks. Not performance evidence.`,
  humanVisualReview: 'pending', captures: [], checks: [], sourceHashes: {} };
receipt.origin=url;receipt.deployedFiles=[];
async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function waitFor(expression, budgetMs = 60000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const result = await evaluate(expression);
    if (result) return result;
    const failure=await evaluate('document.body?.dataset.runtimeError');
    if(failure)throw new Error('Solar runtime failed: '+failure);
    await delay(150);
  }
  throw new Error(`Browser condition timed out: ${expression}`);
}
async function capture(name, width, height) {
  await waitFor('SimulatteSolarDrive.isViewSettled()');
  const before = await evaluate('SimulatteSolarDrive.getReceipt().evidence.renderer.completedFrames');
  await waitFor('SimulatteSolarDrive.getReceipt().evidence.renderer.completedFrames > ' + (before + 1));
  const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const bytes = Buffer.from(result.data, 'base64'), file = path.join(OUT, `${name}.png`);
  await fs.writeFile(file, bytes);
  const pixels = await evaluate(`(async () => {
    const source = document.getElementById('scene');
    const bounds = source.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= innerHeight) return { visible: false };
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = new Image(); image.src = 'data:image/png;base64,${result.data}'; await image.decode();
    context.drawImage(image, bounds.left, bounds.top + 100, bounds.width, Math.max(1, bounds.height - 160), 0, 0, 96, 64);
    const bytes = context.getImageData(0, 0, 96, 64).data;
    let opaque = 0, dark = 0, bright = 0, sum = 0, squares = 0; const colors = new Set();
    for (let i = 0; i < bytes.length; i += 4) {
      if (bytes[i + 3] > 250) opaque++;
      const light = (bytes[i] + bytes[i + 1] + bytes[i + 2]) / 3;
      sum += light; squares += light * light; colors.add((bytes[i] >> 4) * 256 + (bytes[i + 1] >> 4) * 16 + (bytes[i + 2] >> 4));
      if (bytes[i + 3] > 250 && light < 150) dark++;
      if (bytes[i + 3] > 250 && light > 190) bright++;
    }
    return { visible: true, opaqueFraction: opaque / 6144, darkFraction: dark / 6144, brightFraction: bright / 6144, luminanceStd: Math.sqrt(Math.max(0,squares / 6144 - (sum / 6144) ** 2)), colorBins: colors.size };
  })()`);
  check(!pixels.visible || pixels.opaqueFraction > 0.98 && pixels.darkFraction > 0.015 && pixels.luminanceStd > 12 && pixels.colorBins > 25,
    `${name}: canvas pixel evidence failed: ${JSON.stringify(pixels)}`);
  const state = await evaluate('SimulatteSolarDrive.getReceipt()');
  receipt.captures.push({ name, path: path.relative(ROOT, file), sha256: sha(bytes), viewport: { width, height }, pixels, run: state });
}
try {
  await fs.mkdir(OUT, { recursive: true });
  for(const file of sourceFiles){const expected=await fs.readFile(path.join(ROOT,file));receipt.sourceHashes[file]=sha(expected);
    if(process.env.SIMULATTE_SOLAR_ORIGIN && file.startsWith('public/')){const target=new URL(file.replace(/^public\//,''),new URL('../../',url)),response=await fetch(target);
      check(response.ok,`Solar hosted asset failed: ${target}`);const bytes=Buffer.from(await response.arrayBuffer());
      check(sha(bytes)===sha(expected),`Solar hosted bytes differ: ${target}`);receipt.deployedFiles.push({url:target.href,sha256:sha(bytes),bytes:bytes.length});}
  }
  const deadline = Date.now() + 30000;
  while (!stderr.includes('DevTools listening on') && Date.now() < deadline && browser.exitCode === null) await delay(100);
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
  check(endpoint, `Chrome did not expose CDP: ${stderr}`);
  const address = new URL(endpoint);
  const tabs = await (await fetch(`http://${address.host}/json/list`)).json();
  const tab = tabs.find((t) => t.type === 'page'); check(tab, 'Chrome page target missing');
  client = new CdpClient(tab.webSocketDebuggerUrl, { timeoutMs: 60000 });
  await client.connect(); await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Log.enable');
  for (const [name, width, height] of [['desktop', 1440, 1080], ['mobile', 390, 844]]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
    await client.send('Page.navigate', { url });
    await waitFor(`(() => { if (document.body?.dataset.runtimeError) throw new Error(document.body.dataset.runtimeError); return !!globalThis.SimulatteSolarDrive && SimulatteSolarDrive.getReceipt().evidence.renderer?.completedFrames >= 2; })()`);
    if(nativeGpu)check(await evaluate('SimulatteSolarDrive.getReceipt().evidence.renderer.adapter.isFallbackAdapter===false'),'Native Solar GPU qualification cannot use fallback software');
    check(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${name}: horizontal overflow`);
    check(await evaluate('Number(document.getElementById("scene").dataset.instanceCount) > 300'), `${name}: assembly missing`);
    check(await evaluate('SimulatteSolarDrive.snapshot().mode==="ride" && SimulatteSolarDrive.snapshot().viewState.targetExplode===0 && !SimulatteSolarDrive.snapshot().viewState.cutaway && SimulatteSolarDrive.getSpec().params.route==="identified" && !SimulatteSolarDrive.getSpec().params.flywheel'),`${name}: assembled route opening missing`);
    await evaluate('SimulatteSolarDrive.runSteps(1200)');
    check(await evaluate('Math.abs(SimulatteSolarDrive.getState().residualJ) < 0.001'), `${name}: energy ledger failed`);
    const frames = await evaluate('SimulatteSolarDrive.getReceipt().evidence.renderer.completedFrames');
    await waitFor(`SimulatteSolarDrive.getReceipt().evidence.renderer.completedFrames > ${frames + 1}`);
    await capture(`${name}-ride`, width, height);
    check(await evaluate('(()=>{const before=SimulatteSolarDrive.exportData(),hash=before.run.stateHash;SimulatteSolarDrive.setMode("inspect");const after=SimulatteSolarDrive.exportData();return after.run.stateHash===hash&&after.worldSpec.contentHash===before.worldSpec.contentHash;})()'),`${name}: Inspect changed execution`);
    await capture(`${name}-exploded`,width,height);
    check(await evaluate('(()=>{const before=SimulatteSolarDrive.getReceipt().stateHash;SimulatteSolarDrive.setMode("ride");return SimulatteSolarDrive.getReceipt().stateHash===before;})()'),`${name}: Ride changed execution`);
    check(await evaluate('(()=>{const before=SimulatteSolarDrive.getState();document.getElementById("shade-panel").click();return SimulatteSolarDrive.getState().timeS===before.timeS&&SimulatteSolarDrive.getState().batteryJ===before.batteryJ&&SimulatteSolarDrive.snapshot().actions.length===1;})()'),`${name}: panel action restarted the ride`);
    await evaluate('SimulatteSolarDrive.runSteps(300)');
    await capture(`${name}-panel-cover`,width,height);
    check(await evaluate('SimulatteSolarDrive.getState().batteryJ < SimulatteSolarDrive.getMatchedState().state.batteryJ'),`${name}: panel shade did not increase battery use`);
    check((await evaluate('SimulatteSolarDrive.verifyReplay()')).status==='pass',`${name}: action replay failed`);
    check(await evaluate('(()=>{const data=SimulatteSolarDrive.exportData();SimulatteSolarDrive.importSpec(JSON.stringify(data));SimulatteSolarDrive.runSteps(data.run.step);return SimulatteSolarDrive.getReceipt().stateHash===data.run.stateHash&&SimulatteSolarDrive.getSpec().contentHash===data.worldSpec.contentHash;})()'),`${name}: action export/reimport diverged`);
    check(await evaluate('(()=>{const before=SimulatteSolarDrive.getReceipt().stateHash,copy=SimulatteSolarDrive.exportData();copy.actions[0].changes={batterySoc:1};try{SimulatteSolarDrive.importSpec(JSON.stringify(copy));return false;}catch(error){return SimulatteSolarDrive.getReceipt().stateHash===before;}})()'),`${name}: rejected import changed accepted state`);
    await evaluate('SimulatteSolarDrive.setParameters({shade:0});SimulatteSolarDrive.runSteps(1200)');
    const replay = await evaluate('SimulatteSolarDrive.verifyReplay()'); check(replay.status === 'pass', `${name}: replay failed`);
    const sun = await evaluate('SimulatteSolarDrive.getState().flows.pvW');
    const revision=await evaluate('SimulatteSolarDrive.getSpec().authorship.revision');
    await evaluate('document.getElementById("shade").value = "0.9"; document.getElementById("shade").dispatchEvent(new Event("change", { bubbles: true })); SimulatteSolarDrive.runSteps(1200)');
    check(await evaluate(`SimulatteSolarDrive.getState().flows.pvW < ${sun * 0.2} && SimulatteSolarDrive.getSpec().params.shade===0.9 && SimulatteSolarDrive.getSpec().authorship.revision === ${revision+1}`), `${name}: shade edit had no effect`);
    check(await evaluate('(() => { const data = SimulatteSolarDrive.exportData(); SimulatteSolarDrive.importSpec(JSON.stringify(data)); return data.worldSpec.contentHash === SimulatteSolarDrive.getSpec().contentHash && SimulatteSolarDrive.getState().step === 0; })()'), `${name}: export/import failed`);
    await evaluate('SimulatteSolarDrive.setParameters({shade: 0}); document.getElementById("assembled").click(); SimulatteSolarDrive.runSteps(1200)');
    await delay(1200);
    await capture(`${name}-assembled`, width, height);
    if (name === 'desktop') {
      await evaluate('SimulatteSolarDrive.setMode("inspect"); SimulatteSolarDrive.setParameters({flywheel:true});document.getElementById("exploded").click(); document.getElementById("fields").click(); document.querySelector(".component-row[data-component=flywheel]").click()');
      await delay(1300); await capture('flywheel-detail', width, height);
      for (const vehicle of ['scooter', 'car']) {
        await evaluate(`document.querySelector('[data-vehicle="${vehicle}"]').click(); SimulatteSolarDrive.runSteps(1200)`);
        await delay(1200); await capture(`${vehicle}-exploded`, width, height);
      }
      const comparison = await evaluate('SimulatteSolarDrive.compare()');
      check(await evaluate('(() => { const p = SimulatteSolarDrive.getSpec(); const s = SimulatteSolarDrive.getState(); p.params.targetKph = -100; s.ledger.incidentJ = -1; return SimulatteSolarDrive.getSpec().params.targetKph >= 0 && SimulatteSolarDrive.getState().ledger.incidentJ >= 0; })()'), 'Exposed state must be detached');
      check(comparison.hybrid.distanceM > 0 && comparison.batteryOnly.distanceM > 0, 'Matched comparison failed');
      receipt.comparison = comparison;
    } else {
      await evaluate('document.querySelector(".inspector").scrollIntoView()');
      await capture('mobile-controls', width, height);
    }
    receipt.panelPixels??=[];
    receipt.panelPixels.push(await auditSolarShade({evaluate,client,out:OUT,width,height,requireNative:nativeGpu}));
    receipt.checks.push({ viewport: name, gpu: 'completed', energyBalance: 'pass', replay: 'pass', shadeEdit: 'pass', exportReimport: 'pass', overflow: 'none' });
  }
  const exceptions = client.diagnostics().filter((e) => e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded' && e.params.entry?.level === 'error');
  check(exceptions.length === 0, JSON.stringify(exceptions));
  for(const file of sourceFiles)check(sha(await fs.readFile(path.join(ROOT,file)))===receipt.sourceHashes[file],`Solar source changed during audit: ${file}`);
  receipt.status = 'pass';
  process.stdout.write(`Solar drive: desktop/mobile WebGPU, controls, replay, export/reimport, and energy balance passed. ${receipt.captures.length} screenshots in ${OUT}.\n`);
} catch (error) {
  receipt.status = 'fail'; receipt.error = error.stack || String(error); receipt.browserLog = stderr;
  process.stderr.write(`${receipt.error}\n`); process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(OUT, 'browser-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  await client?.close(); browser.kill('SIGTERM'); virtualDisplay.kill('SIGTERM'); server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
