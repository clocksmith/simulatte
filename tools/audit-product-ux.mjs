import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createAuditHost, launchBrowser } from './simulatte/browser-session.mjs';
import { prepareAuditOutput } from './audit-output.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv.find(arg => arg.startsWith('--out='))?.slice(6)
  || `artifacts/product-ux/${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outDir = path.resolve(ROOT, output);
await prepareAuditOutput(outDir, ['simulatte.productUx.v1']);
const files = ['public/index.html', 'public/world-tiers.css', 'public/blank/index.html', 'public/blank/styles.css',
  'public/blank/app/create-experience.js', 'public/blank/app/prompt/prompt-controller-lab-controller.js',
  'public/shared/design/product-navigation.js', 'public/shared/design/tokens.css',
  'public/shared/design/themes/world.css', 'public/shared/design/workbench.css'];
const identify = () => Promise.all(files.map(async file => ({ file, sha256: createHash('sha256').update(await fs.readFile(path.join(ROOT, file))).digest('hex') })));
const report = { schema: 'simulatte.productUx.v1', recordedAt: new Date().toISOString(),
  scope: 'Local browser UI, navigation and one Create compilation per viewport; not simulation or model qualification',
  sources: await identify(), cases: [], pass: false };
const host = await createAuditHost({ publicRoot: path.join(ROOT, 'public') });
try {
  for (const config of [{ width: 1440, height: 1000, theme: 'light' }, { width: 390, height: 844, theme: 'light' },
    { width: 320, height: 740, theme: 'light' }, { width: 1440, height: 1000, theme: 'dark' }]) {
    const row = { ...config, pass: false, errors: [], resources: [], screenshots: [] };
    report.cases.push(row);
    let browser;
    try {
      browser = await launchBrowser({ viewport: { width: config.width, height: config.height }, webgpu: true });
      const { client } = browser;
      row.browser = (await client.send('Browser.getVersion')).product;
      client.on('Runtime.exceptionThrown', event => row.errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
      client.on('Network.responseReceived', ({ response }) => {
        if (response.status >= 400 && response.url.startsWith(host.baseUrl)) row.resources.push({ url: response.url, status: response.status });
      });
      await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable');
      await client.send('Emulation.setDeviceMetricsOverride', { width: config.width, height: config.height, deviceScaleFactor: 1, mobile: config.width < 600 });
      await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: config.theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      const evaluate = async (fn, arg) => {
        const value = await client.send('Runtime.evaluate', { expression: `(${fn.toString()})(${JSON.stringify(arg) ?? ''})`, awaitPromise: true, returnByValue: true });
        if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
        return value.result.value;
      };
      const navigate = async url => { const loaded = client.once('Page.loadEventFired'); await client.send('Page.navigate', { url }); await loaded; await evaluate(() => document.fonts.ready.then(() => true)); };
      const screenshot = async name => {
        const capture = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const bytes = Buffer.from(capture.data, 'base64');
        const file = `${config.width}-${config.theme}-${name}.png`;
        await fs.writeFile(path.join(outDir, file), bytes);
        row.screenshots.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
      };
      await navigate(host.baseUrl);
      row.world = await evaluate(() => ({ simulations: document.querySelectorAll('.hex-satellite').length,
        createHref: document.querySelector('#hex-center-create').href,
        overflow: document.documentElement.scrollWidth > innerWidth,
        theme: document.documentElement.dataset.theme }));
      if (row.world.simulations !== 6 || row.world.overflow || row.world.theme !== config.theme
        || row.world.createHref !== new URL('blank/', host.baseUrl).href) throw new Error('World navigation or layout failed');
      row.worldTargets = await evaluate(checkReachable, ['.landing-data-link', '.home-create-action', '#hex-center-create', '.hex-satellite']);
      await evaluate(() => { document.querySelector('#world-tiers-landing-page').scrollTop = 0; });
      await screenshot('world');
      await evaluate(async () => {
        document.querySelector('.landing-data-link').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        if (document.querySelector('#data-page').hidden) throw new Error('Data entry did not open');
        document.querySelector('#data-sample').click();
      });
      row.data = await evaluate(waitForData);
      if (row.data.overflow) throw new Error('Data page overflows the viewport');
      row.dataTargets = await evaluate(checkReachable, ['#data-page .sim-product-nav a', '#data-read', '#data-sample']);
      await evaluate(() => { document.querySelector('#world-tiers-landing-page').scrollTop = 0; });
      await screenshot('data');
      await navigate(new URL('blank/', host.baseUrl).href);
      row.initial = await evaluate(waitForCreate);
      if (!row.initial.runDisabled || row.initial.toolsOpen || row.initial.overflow) throw new Error('Create initial controls or layout failed');
      row.createTargets = await evaluate(checkReachable, ['#prompt-dock-toggle', '#build-prompt', '[data-create-prompt]', '#shuffle-prompt']);
      await evaluate(() => { scrollTo(0, 0); document.querySelector('#create-editor').scrollTop = 0; });
      await screenshot('create-empty');
      await evaluate(() => {
        document.querySelector('[data-create-prompt="a red ball"]').click();
        if (document.activeElement.id !== 'build-prompt' || document.querySelector('#build-lab').disabled) throw new Error('Example does not prepare an editable prompt');
        document.querySelector('#build-prompt').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      });
      row.run = await evaluate(waitForRun);
      row.resultTargets = await evaluate(checkReachable, ['#pause-lab', '#reset-lab', '#export-lab']);
      await screenshot('create-result');
      row.controls = await evaluate(checkResultControls);
      await screenshot('create-tools');
      await evaluate(() => {
        document.querySelector('#create-tools').open = false;
        document.querySelector('#prompt-dock-toggle').click();
        if (!document.querySelector('#create-editor').hidden) throw new Error('Focus view did not hide the editor');
        scrollTo(0, 0);
      });
      await screenshot('create-focus');
      await evaluate(() => {
        document.querySelector('#prompt-dock-toggle').click();
        if (document.activeElement.id !== 'build-prompt') throw new Error('Restoring the editor lost keyboard focus');
      });
      row.pass = !row.errors.length && !row.resources.length;
    } catch (error) { row.errors.push(error.message); }
    finally { await browser?.close(); console.log(JSON.stringify({ width: row.width, theme: row.theme, pass: row.pass, errors: row.errors })); }
  }
} finally { await host.close(); }
report.sourcesUnchanged = JSON.stringify(report.sources) === JSON.stringify(await identify());
report.pass = report.sourcesUnchanged && report.cases.every(row => row.pass);
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pass: report.pass, report: path.join(outDir, 'report.json'), cases: report.cases.map(({width, theme, pass, errors}) => ({width, theme, pass, errors})) }));
if (!report.pass) process.exitCode = 1;

async function waitForData() {
  const deadline = performance.now() + 10000;
  while (document.querySelector('#data-prepare-panel').hidden) {
    if (performance.now() > deadline) throw new Error('Data example did not reach preparation');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return { prepared: true, overflow: document.documentElement.scrollWidth > innerWidth };
}
async function waitForCreate() {
  const deadline = performance.now() + 20000;
  while (!window.SimulattePhysicsLab?._browserLab || document.querySelector('#intent-runtime').dataset.state !== 'ready') {
    if (performance.now() > deadline) throw new Error('Create did not become ready');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return { runDisabled: document.querySelector('#build-lab').disabled, toolsOpen: document.querySelector('#create-tools').open,
    overflow: document.documentElement.scrollWidth > innerWidth };
}
async function waitForRun() {
  const deadline = performance.now() + 30000;
  const lab = window.SimulattePhysicsLab._browserLab;
  while (lab.getSpec()?.source?.prompt !== 'a red ball' || lab.getPipelineRun()?.status !== 'completed'
    || Number(document.querySelector('#physics-canvas').dataset.renderCount || 0) < 1) {
    if (performance.now() > deadline) throw new Error('Create did not complete and render');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { prompt: lab.getSpec().source.prompt, status: lab.getPipelineRun().status, worldSpecContentHash: lab.getPipelineRun().worldSpecContentHash,
    visible: document.querySelector('#physics-canvas').dataset.sceneVisible, viewportScroll: scrollY };
}
async function checkResultControls() {
  const lab = window.SimulattePhysicsLab._browserLab;
  const pause = document.querySelector('#pause-lab');
  pause.click();
  const pausedTime = lab.getState().t;
  await new Promise(resolve => setTimeout(resolve, 120));
  if (lab.getState().t !== pausedTime || pause.textContent !== 'Resume' || pause.getAttribute('aria-pressed') !== 'true') throw new Error('Pause did not stop simulation time');
  pause.click();
  await new Promise(resolve => setTimeout(resolve, 120));
  if (lab.getState().t <= pausedTime) throw new Error('Resume did not advance simulation time');
  pause.click();
  document.querySelector('#reset-lab').click();
  if (pause.textContent !== 'Pause' || pause.getAttribute('aria-pressed') !== 'false') throw new Error('Restart did not restore running controls');
  let exported;
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = blob => { exported = blob; return createObjectURL.call(URL, blob); };
  try { document.querySelector('#export-lab').click(); } finally { URL.createObjectURL = createObjectURL; }
  if (!exported) throw new Error('Export did not produce a file');
  const program = JSON.parse(await exported.text());
  if (program.schema !== 'simulatte.worldSpec.v1') throw new Error('Export is not the executable simulation');
  document.querySelector('#create-tools').open = true;
  document.querySelector('#world-spec-editor-panel > summary').click();
  const editorDeadline = performance.now() + 3000;
  while (!document.querySelector('#world-spec-editor').value.includes('simulatte.worldSpec.v1')) {
    if (performance.now() > editorDeadline) throw new Error('Simulation editor did not show the program');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  document.querySelector('#world-spec-editor-panel').open = false;
  document.querySelector('#world-proof-panel > summary').click();
  if (!document.querySelector('#world-proof-panel').open) throw new Error('Validation disclosure did not open');
  document.querySelector('#world-proof-panel').open = false;
  document.querySelector('#create-editor').scrollTop = 0;
  scrollTo(0, 0);
  return { pause: true, resume: true, restart: true, exportSchema: program.schema, editor: true, validation: true };
}

async function checkReachable(selectors) {
  const controls = [];
  for (const selector of selectors) for (const node of document.querySelectorAll(selector)) {
    node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(resolve));
    const rect = node.getBoundingClientRect();
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const reachable = rect.width > 0 && rect.height >= 40 && target && (target === node || node.contains(target));
    if (!reachable) throw new Error(`Control is obscured or too small: ${selector}: ${node.textContent.trim()}`);
    controls.push({ selector, name: node.getAttribute('aria-label') || node.textContent.trim(), width: rect.width, height: rect.height });
  }
  return controls;
}
