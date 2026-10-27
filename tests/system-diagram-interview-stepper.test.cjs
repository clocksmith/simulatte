const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const docApi = require('../public/simulatte/system-diagram/diagram.js');
const stepperApi = require('../public/simulatte/system-diagram/interview-stepper.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(root, 'public/data/system-diagram'));

test('interview journeys definition exists and conforms to schema', () => {
  const journeysPath = path.join(root, 'public/data/system-diagram/interview-journeys.json');
  assert.ok(fs.existsSync(journeysPath), 'interview-journeys.json must exist');

  const journeys = JSON.parse(fs.readFileSync(journeysPath, 'utf8'));
  assert.equal(journeys.schema, 'simulatte.systemDiagramInterview.v1');
  assert.ok(journeys.scenarios, 'scenarios must be defined');

  const expectedPresets = [
    'web-service',
    'chat-application',
    'rag-assistant',
    'video-distribution',
    'social-feed'
  ];

  for (const presetId of expectedPresets) {
    const scenario = journeys.scenarios[presetId];
    assert.ok(scenario, `scenario ${presetId} must exist`);
    assert.ok(scenario.title, `scenario ${presetId} must have title`);
    assert.ok(scenario.subtitle, `scenario ${presetId} must have subtitle`);
    assert.ok(scenario.targetQps, `scenario ${presetId} must have targetQps`);
    assert.ok(scenario.problemStatement && typeof scenario.problemStatement === 'string' && scenario.problemStatement.length > 20, `scenario ${presetId} must have problemStatement`);
    assert.ok(Array.isArray(scenario.steps) && scenario.steps.length >= 8, `scenario ${presetId} must have at least 8 steps`);
  }
});

test('every scenario step derives a valid, schema-compliant sub-diagram', () => {
  const journeys = JSON.parse(fs.readFileSync(path.join(root, 'public/data/system-diagram/interview-journeys.json'), 'utf8'));

  for (const [presetId, scenario] of Object.entries(journeys.scenarios)) {
    const example = config.examples.find(e => e.id === presetId);
    assert.ok(example, `Example config for ${presetId} must exist`);

    const masterDoc = JSON.parse(fs.readFileSync(path.join(root, 'public', example.path), 'utf8'));
    assert.ok(masterDoc, `Master doc for ${presetId} must load`);

    const validatedMaster = docApi.validate(masterDoc, library, config);
    assert.ok(validatedMaster, `Master document for ${presetId} must pass validation`);

    for (const step of scenario.steps) {
      assert.ok(step.stepNumber >= 1, `stepNumber must be positive in ${presetId}`);
      assert.ok(step.name, `step must have name in ${presetId}`);
      assert.ok(step.stage, `step must have stage in ${presetId}`);
      assert.ok(step.interviewerPrompt, `step must have interviewerPrompt in ${presetId}`);
      assert.ok(step.solution, `step must have solution in ${presetId}`);
      assert.ok(Array.isArray(step.tradeoffs) && step.tradeoffs.length > 0, `step must have tradeoffs in ${presetId}`);
      assert.ok(Array.isArray(step.activeNodes) && step.activeNodes.length > 0, `step must have activeNodes in ${presetId}`);

      // All activeNodes must exist in master document
      const masterNodeIds = new Set(masterDoc.nodes.map(n => n.id));
      for (const nid of step.activeNodes) {
        assert.ok(masterNodeIds.has(nid), `Active node ${nid} in step ${step.stepNumber} must exist in master ${presetId}`);
      }

      // Highlighted nodes must be a subset of activeNodes
      if (step.highlightNodes) {
        const activeNodeSet = new Set(step.activeNodes);
        for (const hid of step.highlightNodes) {
          assert.ok(activeNodeSet.has(hid), `Highlight node ${hid} in step ${step.stepNumber} must be in activeNodes`);
        }
      }

      // buildStepDocument must produce a valid document
      const stepDoc = stepperApi.buildStepDocument(masterDoc, step, library, config);
      assert.ok(stepDoc, `Derived step doc must exist for ${presetId} step ${step.stepNumber}`);
      assert.equal(stepDoc.schema,step.kind==='design'?docApi.DESIGN_SCHEMA:masterDoc.schema);
      if(step.diagram)assert.deepEqual(stepDoc,step.diagram);
      assert.equal(stepDoc.nodes.length, step.activeNodes.length);
      assert.ok(stepDoc.name.length <= 80, `Step doc name must be <= 80 chars (got ${stepDoc.name.length})`);

      // All edges must only connect nodes that are active in this step
      const stepNodeIds = new Set(stepDoc.nodes.map(n => n.id));
      for (const edge of stepDoc.edges) {
        assert.ok(stepNodeIds.has(edge.from.nodeId), `Edge from node ${edge.from.nodeId} must be in step nodes`);
        assert.ok(stepNodeIds.has(edge.to.nodeId), `Edge to node ${edge.to.nodeId} must be in step nodes`);
      }

      // All faults must only target active nodes
      for (const fault of stepDoc.faults) {
        if (fault.target.kind === 'node') {
          assert.ok(stepNodeIds.has(fault.target.id), `Fault target ${fault.target.id} must be in step nodes`);
        }
      }
    }
  }
});

test('real interview problems have explicit source classifications and safe links', () => {
  const data = require('../public/data/system-diagram/interview-problems.json');
  const valid = stepperApi.validateProblems(data);
  assert.ok(valid.problems.some(p => p.sourceKind === 'company-published'));
  assert.ok(valid.problems.some(p => p.sourceKind === 'candidate-reported'));
  const duplicate = structuredClone(data); duplicate.problems.push(duplicate.problems[0]);
  assert.throws(() => stepperApi.validateProblems(duplicate), /unique IDs/);
  const unsafe = structuredClone(data); unsafe.sources.cockroach.url = 'javascript:alert(1)';
  assert.throws(() => stepperApi.validateProblems(unsafe), /source provenance/);
  const mislabeled = structuredClone(data); mislabeled.problems[0].sourceKind = 'candidate-reported';
  assert.throws(() => stepperApi.validateProblems(mislabeled), /source provenance/);
});

test('interview stages preserve user architecture and keep independent stage edits', () => {
  const model = require('../public/simulatte/system-diagram/editor-model.js').create({diagram: docApi.emptyDiagram(config), library, config});
  const progress = stepperApi.createProgress(model, config);
  progress.select('pagination');
  const initial = model.apply({type: 'addNode', classId: library.classOrder[0], x: 120, y: 160});
  assert.equal(initial.ok, true);
  const first = structuredClone(model.diagram);
  progress.move(1);
  assert.deepEqual(model.diagram, first, 'Next must not fill in a preset architecture');
  model.apply({type: 'addNode', classId: library.classOrder[1], x: 420, y: 160});
  const second = structuredClone(model.diagram);
  progress.move(0); assert.deepEqual(model.diagram, first);
  progress.move(1); assert.deepEqual(model.diagram, second);
  progress.select('chat'); assert.equal(model.diagram.nodes.length, 0);
  progress.select('pagination'); assert.deepEqual(model.diagram, first);
  progress.move(1); assert.deepEqual(model.diagram, second);
  progress.clear(); progress.select('pagination'); assert.equal(model.diagram.nodes.length, 0, 'Lock/reset must erase interview snapshots');
});


test('Databricks preparation remains encrypted and absent from public problem catalogs', () => {
  for (const name of ['interview-problems.json', 'interview-journeys.json']) {
    const publicData = fs.readFileSync(path.join(root, 'public/data/system-diagram', name), 'utf8');
    assert.doesNotMatch(publicData, /databricks/i, 'Owner requires this preparation to stay password-protected');
  }
  const crypto = require('../public/simulatte/system-diagram/private-crypto.js');
  const envelope = JSON.parse(fs.readFileSync(path.join(root, 'public', config.privateCollectionPath), 'utf8'));
  assert.doesNotThrow(() => crypto.validate(envelope));
});
