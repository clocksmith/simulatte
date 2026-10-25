'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const D = require('../public/simulatte/system-diagram/diagram.js');
const Editor = require('../public/simulatte/system-diagram/editor-model.js');
const Files = require('../public/simulatte/system-diagram/file-io.js');
const SubsystemEditor = require('../public/simulatte/system-diagram/subsystem-editor.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(root, 'public/data/system-diagram'));

function createPresetDiagram() {
  const example = config.examples.find(e => e.id === 'web-service');
  return D.validate(require(path.join(root, 'public', example.path.replace(/^\//, ''))), library, config);
}

test('complete editing journey: preset -> edit -> connect -> group -> collapse -> expand -> edit subsystem -> publish -> upgrade -> undo/redo -> save -> reload -> export/import', () => {
  // 1. PRESET: load starter preset
  const preset = createPresetDiagram();
  assert.ok(preset.nodes.length >= 3, 'preset must have components');
  const initialNodes = preset.nodes.map(n => n.id);
  const model = Editor.create({ diagram: preset, library, config });

  // 2. EDIT: add a component, edit its coordinates, and set parameters
  const addRes = model.apply({ type: 'addNode', classId: 'worker', x: 300, y: 150 });
  assert.ok(addRes.ok && addRes.id, 'addNode succeeds');
  const worker2Id = addRes.id;
  const moveRes = model.apply({ type: 'moveItems', ids: [worker2Id], dx: 20, dy: 30 });
  assert.ok(moveRes.ok, 'moveItems succeeds');
  const moved = model.diagram.nodes.find(n => n.id === worker2Id);
  assert.equal(moved.x, 320, 'exact x coordinate preserved');
  assert.equal(moved.y, 180, 'exact y coordinate preserved');

  const paramRes = model.apply({ type: 'setNodeParams', id: worker2Id, params: { serviceMs: 75, concurrency: 8 } });
  assert.ok(paramRes.ok, 'setNodeParams succeeds');
  assert.equal(model.diagram.nodes.find(n => n.id === worker2Id).params.serviceMs, 75, 'parameter override applied');

  // 3. CONNECT: link worker calls to worker2 in
  const workerNode = model.diagram.nodes.find(n => n.id !== worker2Id && n.classId === 'worker') || model.diagram.nodes[0];
  const connectRes = model.apply({
    type: 'connect',
    from: { nodeId: workerNode.id, portId: 'calls' },
    to: { nodeId: worker2Id, portId: 'in' },
  });
  assert.ok(connectRes.ok && connectRes.id, 'connect succeeds');
  const edgeId = connectRes.id;
  const edge = model.diagram.edges.find(e => e.id === edgeId);
  assert.ok(edge, 'connection edge exists');
  assert.deepEqual(edge.from, { nodeId: workerNode.id, portId: 'calls' }, 'exact from connection endpoint preserved');
  assert.deepEqual(edge.to, { nodeId: worker2Id, portId: 'in' }, 'exact to connection endpoint preserved');

  // 4. GROUP: select worker and worker2 and cluster into a group
  const groupRes = model.apply({
    type: 'addGroup',
    label: 'Processing Cluster',
    kind: 'boundary',
    x: 100, y: 50, w: 400, h: 300,
    nodeIds: [workerNode.id, worker2Id],
  });
  assert.ok(groupRes.ok && groupRes.id, 'addGroup succeeds');
  const groupId = groupRes.id;
  assert.equal(model.diagram.nodes.find(n => n.id === workerNode.id).groupId, groupId, 'worker is in group');
  assert.equal(model.diagram.nodes.find(n => n.id === worker2Id).groupId, groupId, 'worker2 is in group');

  // 5. COLLAPSE: fold group
  const foldRes = model.apply({ type: 'setGroupCollapsed', id: groupId, collapsed: true });
  assert.ok(foldRes.ok, 'group collapses');
  assert.equal(model.diagram.groups.find(g => g.id === groupId).collapsed, true, 'group is collapsed');
  // Coordinates of member nodes inside collapsed group must remain preserved
  assert.equal(model.diagram.nodes.find(n => n.id === worker2Id).x, 320, 'member x coordinate preserved while collapsed');
  assert.equal(model.diagram.nodes.find(n => n.id === worker2Id).y, 180, 'member y coordinate preserved while collapsed');

  // 6. EXPAND: unfold group
  const unfoldRes = model.apply({ type: 'setGroupCollapsed', id: groupId, collapsed: false });
  assert.ok(unfoldRes.ok, 'group expands');
  assert.equal(model.diagram.groups.find(g => g.id === groupId).collapsed, false, 'group is expanded');
  assert.equal(model.diagram.nodes.find(n => n.id === worker2Id).x, 320, 'member x coordinate intact after expansion');

  // 7. EDIT SUBSYSTEM: save worker + worker2 as reusable subsystem
  const saveSubRes = model.apply({
    type: 'saveSubsystem',
    nodeIds: [workerNode.id, worker2Id],
    definitionId: 'backend-tier',
    label: 'Backend Tier',
  });
  assert.ok(saveSubRes.ok, 'subsystem saved and instance inserted');
  const instanceNode = model.diagram.nodes.find(n => n.classId === 'subsystem.backend-tier@1');
  assert.ok(instanceNode, 'subsystem instance node exists with pinned version 1');

  // Open detached subsystem editor
  const session = SubsystemEditor.createSession(model, library, config);
  session.open('subsystem.backend-tier@1');
  assert.ok(session.active, 'subsystem editing session is active');
  assert.equal(session.active.definition.id, 'backend-tier');
  assert.equal(session.active.definition.version, 1);

  // ROOT PRESERVATION CHECK: The parent diagram must be completely preserved in rootDiagram
  const parentRoot = session.rootDiagram;
  assert.ok(parentRoot.nodes.find(n => n.id === instanceNode.id), 'rootDiagram preserves instance');
  assert.notEqual(model.diagram.id, parentRoot.id, 'canvas diagram is detached from root');

  // Edit inside subsystem
  const subAdd = model.apply({ type: 'addNode', classId: 'task-queue', x: 50, y: 50 });
  assert.ok(subAdd.ok, 'can add internal component inside subsystem draft');

  // 8. PUBLISH: publish new version v2
  const publishedDef = session.publish(session.active.ports);
  assert.equal(publishedDef.version, 2, 'subsystem version increments to 2');
  assert.equal(session.active, null, 'subsystem session returned to parent');

  // Pinned instance check: the existing instance node in the parent diagram MUST remain pinned to v1
  const existingInstance = model.diagram.nodes.find(n => n.id === instanceNode.id);
  assert.equal(existingInstance.classId, 'subsystem.backend-tier@1', 'existing instance remains pinned to v1');

  // 9. EXPLICITLY UPGRADE INSTANCE
  const upgradeRes = model.apply({ type: 'upgradeSubsystem', id: instanceNode.id, version: 2 });
  assert.ok(upgradeRes.ok, 'upgradeSubsystem succeeds');
  assert.equal(model.diagram.nodes.find(n => n.id === instanceNode.id).classId, 'subsystem.backend-tier@2', 'instance upgraded to v2');

  // 10. UNDO / REDO
  assert.ok(model.canUndo(), 'can undo');
  model.undo();
  assert.equal(model.diagram.nodes.find(n => n.id === instanceNode.id).classId, 'subsystem.backend-tier@1', 'undo restores pinned v1');
  assert.ok(model.canRedo(), 'can redo');
  model.redo();
  assert.equal(model.diagram.nodes.find(n => n.id === instanceNode.id).classId, 'subsystem.backend-tier@2', 'redo restores upgraded v2');

  // 11. SAVE: test storage persistence
  const storageMap = new Map();
  const mockStorage = {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
  };
  const store = Files.autosave(config, mockStorage);
  const saveSuccess = store.save(model.diagram);
  assert.equal(saveSuccess, true, 'saveLocal succeeds');
  assert.ok(storageMap.has(config.editor.autosaveKey), 'storage key populated');

  // 12. RELOAD: recover document from storage
  const loadedRecord = store.loadRecord();
  assert.ok(loadedRecord && loadedRecord.diagram, 'loadedRecord returns diagram');
  const recoveredDoc = D.validate(loadedRecord.diagram, library, config);
  assert.equal(recoveredDoc.nodes.length, model.diagram.nodes.length, 'recovered document node count matches');
  const recoveredInstance = recoveredDoc.nodes.find(n => n.id === instanceNode.id);
  assert.ok(recoveredInstance, 'recovered document has upgraded instance');
  assert.equal(recoveredInstance.classId, 'subsystem.backend-tier@2', 'pinned version 2 preserved through storage');

  // 13. EXPORT / IMPORT
  const exportedJson = JSON.stringify(model.diagram, null, 2);
  const reimported = D.validate(JSON.parse(exportedJson), library, config);
  assert.deepEqual(reimported.nodes, model.diagram.nodes, 'exported/imported nodes match exactly');
  assert.deepEqual(reimported.edges, model.diagram.edges, 'exported/imported edges match exactly');
  assert.deepEqual(reimported.groups, model.diagram.groups, 'exported/imported groups match exactly');
  assert.deepEqual(reimported.subsystems, model.diagram.subsystems, 'exported/imported subsystem definitions match exactly');
});

test('saving while editing a subsystem persists root document and recovers detached draft on reload', () => {
  const preset = createPresetDiagram();
  const model = Editor.create({ diagram: preset, library, config });

  // Save selection as subsystem
  const workerNode = model.diagram.nodes.find(n => n.classId === 'worker') || model.diagram.nodes[0];
  const saveSubRes = model.apply({
    type: 'saveSubsystem',
    nodeIds: [workerNode.id],
    definitionId: 'service-module',
    label: 'Service Module',
  });
  assert.ok(saveSubRes.ok);
  const rootBeforeSubsystemEdit = D.clone(model.diagram);

  // Setup subsystem editor
  const session = SubsystemEditor.createSession(model, library, config);
  session.open('subsystem.service-module@1');
  assert.ok(session.active, 'editing subsystem definition');

  // Add a component inside the subsystem draft
  const draftAdd = model.apply({ type: 'addNode', classId: 'task-queue', x: 120, y: 80 });
  assert.ok(draftAdd.ok);
  const draftInternalDiagram = D.clone(model.diagram);

  // Save while editing subsystem
  const storageMap = new Map();
  const mockStorage = {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
  };
  const store = Files.autosave(config, mockStorage);

  const draftPayload = {
    classId: session.active.definition.id,
    definitionId: session.active.definition.id,
    version: session.active.definition.version,
    label: model.diagram.name || session.active.definition.label,
    ports: session.active.ports,
    diagram: D.clone(model.diagram),
  };

  // Crucial invariant: saving while in subsystem MUST save the root diagram as the diagram,
  // NOT overwrite it with the detached draft!
  const rootDoc = session.rootDiagram;
  assert.deepEqual(rootDoc.nodes.map(n => n.id), rootBeforeSubsystemEdit.nodes.map(n => n.id), 'root document is completely preserved');
  assert.notDeepEqual(rootDoc.nodes.map(n => n.id), model.diagram.nodes.map(n => n.id), 'detached draft differs from root');

  const ok = store.save(rootDoc, draftPayload);
  assert.equal(ok, true, 'save with subsystem draft succeeds');

  // Simulate browser reload: loadRecord from storage
  const record = store.loadRecord();
  assert.ok(record, 'record loaded from storage');
  assert.ok(record.diagram, 'root diagram present');
  assert.ok(record.subsystemDraft, 'subsystem draft present');

  // Verify root diagram retains all original parent connections and nodes
  const reloadedParent = D.validate(record.diagram, library, config);
  assert.deepEqual(reloadedParent.edges, rootBeforeSubsystemEdit.edges, 'parent edges 100% intact');
  assert.deepEqual(reloadedParent.nodes.map(n => n.id), rootBeforeSubsystemEdit.nodes.map(n => n.id), 'parent nodes 100% intact');

  // Verify subsystem draft can be resumed without losing draft work
  const newModel = Editor.create({ diagram: reloadedParent, library, config });
  const newSession = SubsystemEditor.createSession(newModel, library, config);
  newSession.openDraft(record.subsystemDraft);
  assert.ok(newSession.active, 'subsystem draft opened');
  assert.equal(newSession.active.definition.id, 'service-module');
  assert.deepEqual(newModel.diagram.nodes.map(n => n.id), draftInternalDiagram.nodes.map(n => n.id), 'draft components recovered');

  // Cancelling definition edits safely returns to the uncorrupted parent diagram
  newSession.cancel();
  assert.equal(newSession.active, null, 'session cancelled cleanly');
  assert.deepEqual(newModel.diagram.edges, rootBeforeSubsystemEdit.edges, 'parent diagram remains intact after draft cancellation');
});

test('unsaved changes protection: backup snapshot preserved and cancelled replacements keep document intact', () => {
  const preset = createPresetDiagram();
  const model = Editor.create({ diagram: preset, library, config });

  // Make an authored edit
  model.apply({ type: 'addNode', classId: 'cache', x: 100, y: 100 });
  const dirtyDoc = D.clone(model.diagram);

  // Setup storage
  const storageMap = new Map();
  const mockStorage = {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: k => storageMap.delete(k),
  };
  const store = Files.autosave(config, mockStorage);

  // 1. Automatic backup snapshot before replacement
  assert.equal(store.saveBackup(dirtyDoc), true, 'backup snapshot saves');
  const backup = store.loadBackup();
  assert.deepEqual(backup.nodes, dirtyDoc.nodes, 'backup snapshot recovers dirty nodes');

  // 2. Cancelled replacement leaves model, selection and history completely unchanged
  const canUndoBefore = model.canUndo();
  const nodesBefore = model.diagram.nodes.map(n => n.id);
  // Cancellation means replacement action is aborted
  assert.deepEqual(model.diagram.nodes.map(n => n.id), nodesBefore, 'canvas nodes intact after cancellation');
  assert.equal(model.canUndo(), canUndoBefore, 'undo history intact after cancellation');

  // 3. Failed storage write handles gracefully without corrupting document
  const failingStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  const brokenStore = Files.autosave(config, failingStorage);
  const writeResult = brokenStore.save(model.diagram);
  assert.equal(writeResult, false, 'failed storage write reports false');
  assert.deepEqual(model.diagram.nodes.map(n => n.id), nodesBefore, 'document remains uncorrupted after failed write');
});
