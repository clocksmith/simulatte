const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const sessionApi = require('../public/shared/contracts/simulation-session.js');

test('pending data revision cannot change the displayed run identity or playback duration', async () => {
  const nodes = new Map(), frames = new Map(), jobs = [];
  let frameId = 0, nextProgram, now = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', dataset: {}, hidden: false, listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; }, querySelector() { return this; } });
    return nodes.get(id);
  };
  const context = { structuredClone, document: { getElementById: node }, AbortController, performance: { now: () => now },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); }, addEventListener() {},
    SimulatteInputSource: { decode: async () => ({ kind: 'worldSpec', source: {}, spec: nextProgram }) },
    SimulatteDataWorldSpec: { FIELDS: [], validate: value => value },
    SimulatteWorldSpec: { serializeWorldSpec: JSON.stringify, parseWorldSpec: JSON.parse },
    SimulatteDataRun: { create: () => ({ run: program => new Promise(resolve => jobs.push({ program, resolve })), cancel() {}, dispose() {} }), compare: () => ({ sameProgram: true, sameOutput: true }) },
    SimulattePointSceneView: { bounds: () => ({}), create: () => ({ render() {}, dispose() {} }) },
    SimulatteProgramEditor: { createDraft: () => ({ setValue() {}, isDirty: () => false }), setStatus() {} },
    SimulatteDataTable: { render() {} }, SimulatteSimulationSession: sessionApi,
    SimulatteSimulationSessionStatus: { create: () => ({ render() {}, dispose() {} }) },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/simulatte/app/data-workbench.js'), 'utf8'), context);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const api = context.SimulatteDataWorkbench;
  assert.equal(api.session.snapshot().visibleStatus, 'Waiting for input');
  nextProgram = { name: 'first', params: { duration: 4 }, objects: [], authorship: { revision: 0 } };
  node('data-read').listeners.click(); await settle();
  const output = { frames: Array.from({ length: 41 }, (_, step) => ({ time: step / 10, units: 'm', points: [] })) };
  jobs[0].resolve(output); await settle();
  assert.equal(api.getDisplayedProgram().name, 'first');
  api.getDisplayedProgram().params.duration = 1000;
  assert.equal(api.getDisplayedProgram().params.duration, 4, 'inspection cannot mutate the accepted program');
  nextProgram = { name: 'replacement', params: { duration: 20 }, objects: [], authorship: { revision: 1 } };
  node('data-read').listeners.click(); await settle();
  assert.equal(api.getSpec().name, 'replacement');
  assert.equal(api.getDisplayedProgram().name, 'first');
  assert.equal(api.getResult(), output);
  await api.session.invoke('resume');
  now = 2000;
  const tick = [...frames.values()].at(-1); tick(now);
  assert.equal(node('data-step').value, '20', 'displayed four-second run remains halfway through after two seconds');
  await api.session.invoke('pause');
  const replay = api.session.invoke('replay'); await settle();
  assert.equal(jobs.at(-1).program.name, 'first', 'replay uses the displayed accepted program');
  jobs.at(-1).resolve(output); await replay;
  jobs[1].resolve({ frames: output.frames }); await settle();
  assert.equal(api.getDisplayedProgram().name, 'first', 'superseded revision cannot replace the replay');
  api.dispose();
});
