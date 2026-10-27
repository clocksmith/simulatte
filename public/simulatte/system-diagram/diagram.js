(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./class-library.js') : root.SimulatteSystemDiagramLibrary, node ? require('./subsystems.js') : root.SimulatteSystemDiagramSubsystems);
  if (node) module.exports = api; else root.SimulatteSystemDiagramDocument = api;
})(globalThis, function (libraryApi, S) {
  'use strict';
  const SCHEMA = 'simulatte.systemDiagram.v4';
  const DESIGN_SCHEMA = 'simulatte.systemDiagram.v5';
  const modern = schema => [SCHEMA, DESIGN_SCHEMA].includes(schema);
  const isConcept = classId => typeof classId === 'string' && classId.startsWith('concept.');
  const GROUP_SCHEMA = 'simulatte.systemDiagram.v3';
  let helpers;
  const ANNOTATED_SCHEMA = 'simulatte.systemDiagram.v2';
  const LEGACY_SCHEMA = 'simulatte.systemDiagram.v1';
  const COMPILED_SCHEMA = 'simulatte.systemDiagramCompiled.v1';
  const C = 'system-diagram';
  const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
  const USER_CLASS_ID = /^user\.[a-z0-9][a-z0-9-]{0,47}$/;
  const GROUP_KINDS = Object.freeze(['zone', 'region', 'boundary', 'resource']);
  const FAILURE_DOMAIN_KINDS = Object.freeze(['zone', 'region']);
  const COORD = 1e6;
  const { ContractError, checkParamValue, isRecord, exactKeys } = libraryApi;
  const fail = (path, expected, received) => { throw new ContractError(C, path, expected, received); };
  const clone = value => JSON.parse(JSON.stringify(value));

  function label(path, value, max) {
    if (typeof value !== 'string' || value.length > max) fail(path, `string up to ${max} characters`, value);
    return value;
  }
  function coord(path, value) { if (!Number.isFinite(value) || Math.abs(value) > COORD) fail(path, `finite coordinate within ${COORD}`, value); return value; }
  function size(path, value) { if (!Number.isFinite(value) || value <= 0 || value > COORD) fail(path, 'positive size', value); return value; }
  function id(path, value, seen) {
    if (typeof value !== 'string' || !NODE_ID.test(value)) fail(path, 'identifier [A-Za-z][A-Za-z0-9_-]{0,63}', value);
    if (seen.has(value)) fail(path, 'identifier unique across nodes, edges, groups, notes and faults', value);
    seen.add(value); return value;
  }

  function emptyDiagram(config, name = 'Untitled system') {
    return { schema: SCHEMA, id: 'diagram', name, description: '', seed: 1, run: { horizonSec: 120 }, classes: [], nodes: [], edges: [], groups: [], notes: [], faults: [], view: { x: 0, y: 0, zoom: 1 } };
  }

  // User classes resolve through their extends chain to one built-in class, which names the kernel.
  function classTable(doc, library) {
    const table = new Map(Object.entries(library.classes));
    for (const klass of doc.classes || []) table.set(klass.id, klass);
    return table;
  }

  function resolveClass(classId, doc, library, config) {
    if (isConcept(classId)) {
      const concept=(doc.concepts||[]).find(c=>'concept.'+c.id===classId);
      if(!concept)fail(`class ${classId}`,'declared conceptual responsibility',classId);
      if(!concept.binding)return {id:classId,label:concept.label,category:'application',glyph:'service',description:concept.responsibility,builtin:false,builtinId:null,kernel:null,chain:[classId],defaults:{},sources:{},ports:concept.ports.map(p=>({id:p.id,label:p.id,direction:p.direction,multiple:true,required:false,...(p.direction==='in'?{accepts:[p.payloadType]}:{emits:[p.payloadType==='any'?'inherit':p.payloadType]})})),unbound:true};
      if(isConcept(concept.binding.classId))fail(`class ${classId}.binding`,'concrete class or pinned subsystem',concept.binding.classId);
      const bound=resolveClass(concept.binding.classId,doc,library,config),ports=bound.ports||library.kernels[bound.kernel].ports;
      const renamed=concept.ports.map(p=>{const target=ports.find(port=>port.id===concept.binding.ports[p.id]);if(!target||target.direction!==p.direction)fail(`concept ${concept.id}.${p.id}`,'binding preserving port direction',concept.binding.ports[p.id]);const types=target.accepts||emittedPayloads(target,bound.defaults);if(p.payloadType!=='any'&&!types.includes('any')&&!types.includes('inherit')&&!types.includes(p.payloadType))fail(`concept ${concept.id}.${p.id}`,'binding preserving payload contract',p.payloadType);return {...target,id:p.id,label:p.id};});
      return {...bound,id:classId,label:concept.label,description:concept.responsibility,ports:renamed,concept:true};
    }
    if (S.isComposite(classId)) return S.resolveClass(classId, doc, library, config, helpers);
    const table = classTable(doc, library), chain = [], seen = new Set();
    const maxDepth = config?.bounds?.maxClassDepth ?? 8;
    let current = table.get(classId);
    if (!current) fail(`class ${classId}`, 'built-in or user class', classId);
    while (current) {
      if (seen.has(current.id)) fail(`class ${classId}.extends`, 'acyclic class derivation', [...seen]);
      seen.add(current.id); chain.push(current);
      if (chain.length > maxDepth + 1) fail(`class ${classId}.extends`, `derivation depth <= ${maxDepth}`, chain.length);
      if (current.builtin) break;
      const parent = table.get(current.extends);
      if (!parent) fail(`class ${current.id}.extends`, 'existing parent class', current.extends);
      current = parent;
    }
    const builtin = chain.at(-1), kernel = library.kernels[builtin.kernel];
    const defaults = {}, sources = {};
    for (const [key, spec] of Object.entries(kernel.params)) { defaults[key] = spec.default; sources[key] = 'kernel'; }
    for (const klass of [...chain].reverse()) for (const [key, value] of Object.entries(klass.defaults)) { defaults[key] = value; sources[key] = klass.id; }
    const leaf = chain[0];
    return { id: leaf.id, label: leaf.label, category: leaf.category || builtin.category, glyph: leaf.glyph || builtin.glyph, description: leaf.description || builtin.description, builtin: Boolean(leaf.builtin), builtinId: builtin.id, kernel: kernel.id, chain: chain.map(k => k.id), defaults, sources };
  }

  function resolveNodeParams(node, doc, library, config) {
    const klass = resolveClass(node.classId, doc, library, config);
    const values = { ...klass.defaults }, sources = { ...klass.sources };
    for (const [key, value] of Object.entries(node.params || {})) { values[key] = value; sources[key] = 'instance'; }
    return { klass, values, sources };
  }

  function resolveEdgeParams(edge, library) {
    const values = {}, sources = {};
    for (const [key, spec] of Object.entries(library.edgeParams)) { values[key] = spec.default; sources[key] = 'default'; }
    for (const [key, value] of Object.entries(edge.params || {})) { values[key] = value; sources[key] = 'edge'; }
    return { values, sources };
  }

  function portSpec(library, kernelId, portId) { return library.kernels[kernelId]?.ports.find(p => p.id === portId) || null; }

  function emittedPayloads(port, params) {
    return port.emits.flatMap(ref => ref.startsWith('param:') ? [params[ref.slice(6)]] : [ref]);
  }

  function validateParams(path, params, specs) {
    if (!isRecord(params)) fail(path, 'object of parameter overrides', params);
    const out = {};
    for (const [key, value] of Object.entries(params)) {
      if (!specs[key]) fail(`${path}.${key}`, 'declared parameter', key);
      out[key] = checkParamValue(C, `${path}.${key}`, specs[key], value);
    }
    return out;
  }

  function validate(input, library, config, internal = false) {
    const b = config.bounds;
    exactKeys(C, 'diagram', input, ['schema', 'id', 'name', 'seed', 'run', 'classes', 'nodes', 'edges', 'groups', 'notes', 'faults', 'view'], ['description', ...(modern(input?.schema) ? ['subsystems'] : []), ...(input?.schema === DESIGN_SCHEMA ? ['intent','concepts'] : [])]);
    if (![DESIGN_SCHEMA, SCHEMA, GROUP_SCHEMA, ANNOTATED_SCHEMA, LEGACY_SCHEMA].includes(input.schema)) fail('diagram.schema', `${SCHEMA}, ${ANNOTATED_SCHEMA} or ${LEGACY_SCHEMA}`, input.schema);
    const doc = clone(input);
    if (doc.schema === DESIGN_SCHEMA) {
      if(Object.hasOwn(doc,'intent')){exactKeys(C,'diagram.intent',doc.intent,['outcome','users','constraints','success']);for(const [key,value]of Object.entries(doc.intent))label('diagram.intent.'+key,value,b.maxNoteLength);}
      if(!Array.isArray(doc.concepts)||doc.concepts.length>b.maxNodes)fail('diagram.concepts','bounded conceptual responsibilities',doc.concepts);
      const conceptIds=new Set();
      for(const c of doc.concepts){exactKeys(C,'concept',c,['id','label','responsibility','ports'],['binding']);if(!NODE_ID.test(c.id)||conceptIds.has(c.id))fail('concept.id','unique identifier',c.id);conceptIds.add(c.id);label('concept.label',c.label,b.maxLabelLength);label('concept.responsibility',c.responsibility,b.maxNoteLength);if(!Array.isArray(c.ports)||c.ports.length>b.maxEdges)fail('concept.ports','bounded external contracts',c.ports);const ports=new Set();for(const p of c.ports){exactKeys(C,'concept.port',p,['id','direction','payloadType']);if(!NODE_ID.test(p.id)||ports.has(p.id)||!['in','out'].includes(p.direction)||!['any',...library.payloadTypes.map(t=>t.id)].includes(p.payloadType))fail('concept.port','unique directed payload contract',p);ports.add(p.id);}if(c.binding){exactKeys(C,'concept.binding',c.binding,['classId','ports']);exactKeys(C,'concept.binding.ports',c.binding.ports,[...ports]);if(new Set(Object.values(c.binding.ports)).size!==ports.size)fail('concept.binding.ports','one distinct target per external contract',c.binding.ports);}}
    }
    if (!internal) S.validateDefinitions(doc, library, config, helpers);
    if (typeof doc.id !== 'string' || !NODE_ID.test(doc.id)) fail('diagram.id', 'identifier', doc.id);
    label('diagram.name', doc.name, b.maxLabelLength);
    if (Object.hasOwn(doc, 'description')) label('diagram.description', doc.description, b.maxNoteLength);
    if (!Number.isInteger(doc.seed) || doc.seed < 0 || doc.seed > 4294967295) fail('diagram.seed', 'uint32 integer', doc.seed);
    exactKeys(C, 'diagram.run', doc.run, ['horizonSec']);
    if (!Number.isFinite(doc.run.horizonSec) || doc.run.horizonSec <= 0 || doc.run.horizonSec > b.maxHorizonSec) fail('diagram.run.horizonSec', `seconds in (0, ${b.maxHorizonSec}]`, doc.run.horizonSec);
    exactKeys(C, 'diagram.view', doc.view, ['x', 'y', 'zoom']);
    coord('diagram.view.x', doc.view.x); coord('diagram.view.y', doc.view.y);
    const minZoom = config.editor.fitMinZoom || config.editor.minZoom;
    if (!Number.isFinite(doc.view.zoom) || doc.view.zoom < minZoom || doc.view.zoom > config.editor.maxZoom) fail('diagram.view.zoom', `zoom in [${minZoom}, ${config.editor.maxZoom}]`, doc.view.zoom);
    for (const [key, max] of [['classes', b.maxUserClasses], ['nodes', b.maxNodes], ['edges', b.maxEdges], ['groups', b.maxGroups], ['notes', b.maxNotes], ['faults', b.maxFaults]]) {
      if (!Array.isArray(doc[key]) || doc[key].length > max) fail(`diagram.${key}`, `array of at most ${max}`, Array.isArray(doc[key]) ? doc[key].length : doc[key]);
    }
    const classIds = new Set();
    doc.classes.forEach((klass, i) => {
      const path = `diagram.classes[${i}]`;
      exactKeys(C, path, klass, ['id', 'label', 'extends', 'defaults'], ['category', 'glyph', 'description']);
      if (!USER_CLASS_ID.test(klass.id) || classIds.has(klass.id) || library.classes[klass.id]) fail(`${path}.id`, 'unique user class id user.<kebab>', klass.id);
      classIds.add(klass.id);
      if (!klass.label.trim()) fail(`${path}.label`, 'non-empty label', klass.label);
      label(`${path}.label`, klass.label, b.maxLabelLength);
      if (Object.hasOwn(klass, 'category') && !library.categories.some(c => c.id === klass.category)) fail(`${path}.category`, 'declared category', klass.category);
      if (Object.hasOwn(klass, 'glyph') && !/^[a-z][a-z0-9-]{0,47}$/.test(klass.glyph)) fail(`${path}.glyph`, 'kebab glyph id', klass.glyph);
      if (Object.hasOwn(klass, 'description')) label(`${path}.description`, klass.description, b.maxNoteLength);
    });
    doc.classes.forEach((klass, i) => {
      const resolved = resolveClass(klass.id, doc, library, config);
      doc.classes[i].defaults = validateParams(`diagram.classes[${i}].defaults`, klass.defaults, library.kernels[resolved.kernel].params);
    });
    const seen = new Set(), nodes = new Map(), groups = new Map();
    doc.groups.forEach((group, i) => {
      const path = `diagram.groups[${i}]`;
      exactKeys(C, path, group, ['id', 'label', 'kind', 'x', 'y', 'w', 'h'], [...(group.kind === 'resource' ? ['capacity'] : []), ...([DESIGN_SCHEMA, SCHEMA, GROUP_SCHEMA].includes(doc.schema) ? ['collapsed'] : [])]);
      if (Object.hasOwn(group, 'collapsed') && typeof group.collapsed !== 'boolean') fail(`${path}.collapsed`, 'boolean presentation state', group.collapsed);
      if (group.kind === 'resource' && (!Number.isInteger(group.capacity) || group.capacity < 1 || group.capacity > 64)) fail(`${path}.capacity`, 'shared resource capacity integer in [1, 64]', group.capacity);
      id(`${path}.id`, group.id, seen); label(`${path}.label`, group.label, b.maxLabelLength);
      if (!GROUP_KINDS.includes(group.kind)) fail(`${path}.kind`, GROUP_KINDS.join('|'), group.kind);
      coord(`${path}.x`, group.x); coord(`${path}.y`, group.y); size(`${path}.w`, group.w); size(`${path}.h`, group.h);
      groups.set(group.id, group);
    });
    doc.nodes.forEach((n, i) => {
      const path = `diagram.nodes[${i}]`;
      exactKeys(C, path, n, ['id', 'classId', 'label', 'x', 'y', 'params'], ['groupId', ...(modern(doc.schema) ? ['overrides'] : [])]);
      id(`${path}.id`, n.id, seen); label(`${path}.label`, n.label, b.maxLabelLength);
      coord(`${path}.x`, n.x); coord(`${path}.y`, n.y);
      const klass = resolveClass(n.classId, doc, library, config);
      doc.nodes[i].params = validateParams(`${path}.params`, n.params, klass.kernel === 'subsystem' || klass.unbound ? {} : library.kernels[klass.kernel].params);
      if (klass.kernel === 'subsystem') S.validateOverrides(isConcept(n.classId)?{...n,classId:doc.concepts.find(c=>'concept.'+c.id===n.classId).binding.classId}:n, doc, library, config, helpers);
      else if (Object.hasOwn(n, 'overrides')) fail(`${path}.overrides`, 'overrides only on subsystem instances', n.overrides);
      if (Object.hasOwn(n, 'groupId') && n.groupId !== null && !groups.has(n.groupId)) fail(`${path}.groupId`, 'existing group or null', n.groupId);
      nodes.set(n.id, { node: n, kernel: klass.kernel, ports: klass.ports || library.kernels[klass.kernel].ports });
    });
    const portUse = new Map(), pairs = new Set();
    doc.edges.forEach((edge, i) => {
      const path = `diagram.edges[${i}]`;
      exactKeys(C, path, edge, ['id', 'from', 'to', 'params'], doc.schema !== LEGACY_SCHEMA ? ['label'] : []);
      if (Object.hasOwn(edge, 'label')) label(`${path}.label`, edge.label, b.maxLabelLength);
      id(`${path}.id`, edge.id, seen);
      exactKeys(C, `${path}.from`, edge.from, ['nodeId', 'portId']); exactKeys(C, `${path}.to`, edge.to, ['nodeId', 'portId']);
      const from = nodes.get(edge.from.nodeId), to = nodes.get(edge.to.nodeId);
      if (!from) fail(`${path}.from.nodeId`, 'existing node', edge.from.nodeId);
      if (!to) fail(`${path}.to.nodeId`, 'existing node', edge.to.nodeId);
      if (edge.from.nodeId === edge.to.nodeId) fail(path, 'edge between two different nodes', edge.from.nodeId);
      const out = from.ports.find(p => p.id === edge.from.portId), inp = to.ports.find(p => p.id === edge.to.portId);
      if (out?.direction !== 'out') fail(`${path}.from.portId`, `out port of ${from.kernel}`, edge.from.portId);
      if (inp?.direction !== 'in') fail(`${path}.to.portId`, `in port of ${to.kernel}`, edge.to.portId);
      const pair = `${edge.from.nodeId}.${edge.from.portId}>${edge.to.nodeId}.${edge.to.portId}`;
      if (pairs.has(pair)) fail(path, 'no duplicate edge between the same ports', pair);
      pairs.add(pair);
      for (const [end, port] of [[edge.from, out], [edge.to, inp]]) {
        const key = `${end.nodeId}.${end.portId}`, count = (portUse.get(key) || 0) + 1;
        if (count > 1 && !port.multiple) fail(path, `port ${key} accepts a single edge`, count);
        portUse.set(key, count);
      }
      doc.edges[i].params = validateParams(`${path}.params`, edge.params, library.edgeParams);
    });
    doc.notes.forEach((note, i) => {
      const path = `diagram.notes[${i}]`;
      exactKeys(C, path, note, ['id', 'text', 'x', 'y'], ['w']);
      id(`${path}.id`, note.id, seen); label(`${path}.text`, note.text, b.maxNoteLength);
      coord(`${path}.x`, note.x); coord(`${path}.y`, note.y);
      if (Object.hasOwn(note, 'w')) size(`${path}.w`, note.w);
    });
    const edgeIds = new Set(doc.edges.map(e => e.id));
    doc.faults.forEach((fault, i) => {
      const path = `diagram.faults[${i}]`;
      exactKeys(C, path, fault, ['id', 'atSec', 'untilSec', 'target', 'type', 'params']);
      id(`${path}.id`, fault.id, seen);
      exactKeys(C, `${path}.target`, fault.target, ['kind', 'id']);
      const type = library.faultTypes.find(f => f.id === fault.type);
      if (!type || !type.targets.includes(fault.target.kind)) fail(`${path}.type`, `fault type for ${fault.target.kind}`, fault.type);
      if (fault.target.kind === 'node') {
        const target = nodes.get(fault.target.id);
        if (!target) fail(`${path}.target.id`, 'existing node', fault.target.id);
        if (target.kernel === 'subsystem') fail(`${path}.target.id`, 'primitive node target; author internal subsystem faults in the definition', fault.target.id);
        if (!library.kernels[target.kernel]?.faults.includes(fault.type)) fail(`${path}.type`, `fault supported by ${target.kernel}`, fault.type);
      } else if (fault.target.kind === 'edge') { if (!edgeIds.has(fault.target.id)) fail(`${path}.target.id`, 'existing edge', fault.target.id); }
      else if (fault.target.kind === 'group') {
        const group = groups.get(fault.target.id);
        if (!group || !FAILURE_DOMAIN_KINDS.includes(group.kind)) fail(`${path}.target.id`, 'existing zone or region group', fault.target.id);
      } else fail(`${path}.target.kind`, 'node|edge|group', fault.target.kind);
      if (!Number.isFinite(fault.atSec) || fault.atSec < 0 || fault.atSec > doc.run.horizonSec) fail(`${path}.atSec`, `seconds in [0, ${doc.run.horizonSec}]`, fault.atSec);
      if (fault.untilSec !== null && (!Number.isFinite(fault.untilSec) || fault.untilSec <= fault.atSec)) fail(`${path}.untilSec`, 'null or seconds after atSec', fault.untilSec);
      doc.faults[i].params = validateParams(`${path}.params`, fault.params, type.params);
    });
    if (!internal && doc.schema !== DESIGN_SCHEMA && (doc.subsystems?.length || doc.nodes.some(n => S.isComposite(n.classId)))) validate(S.lower(doc, library, config, helpers), library, config, true);
    return doc;
  }

  function portsForNode(node, doc, library, config) {
    const klass = resolveClass(node.classId, doc, library, config);
    return klass.ports || library.kernels[klass.kernel].ports;
  }

  // Warnings describe drawable but suspicious diagrams; errors are thrown by validate().
  function issues(doc, library, config) {
    if (doc.nodes.some(n => S.isComposite(n.classId))) return issues(S.lower(doc, library, config, helpers), library, config);
    const warnings = [];
    const used = new Map();
    for (const edge of doc.edges) for (const end of [edge.from, edge.to]) used.set(`${end.nodeId}.${end.portId}`, true);
    const byId = new Map(doc.nodes.map(n => [n.id, n]));
    for (const n of doc.nodes) {
      const { klass, values } = resolveNodeParams(n, doc, library, config);
      if(klass.unbound)warnings.push({kind:'unbound-component',nodeId:n.id,message:`${n.label || n.id}: conceptual responsibility is not bound to executable behavior`});
      for (const port of (klass.ports || library.kernels[klass.kernel].ports)) if (port.required && !used.has(`${n.id}.${port.id}`)) warnings.push({ kind: 'unconnected-port', nodeId: n.id, portId: port.id, message: `${n.label || n.id}: ${port.label} is not connected` });
      void values;
    }
    for (const edge of doc.edges) {
      const from = byId.get(edge.from.nodeId), to = byId.get(edge.to.nodeId);
      const fromRes = resolveNodeParams(from, doc, library, config), toKernel = resolveClass(to.classId, doc, library, config).kernel;
      const out = portsForNode(from,doc,library,config).find(p=>p.id===edge.from.portId), inp = portsForNode(to,doc,library,config).find(p=>p.id===edge.to.portId);
      const emitted = emittedPayloads(out, fromRes.values);
      if (!inp.accepts.includes('any') && !emitted.includes('inherit') && !emitted.some(p => inp.accepts.includes(p))) warnings.push({ kind: 'payload-mismatch', edgeId: edge.id, message: `${from.label || from.id} sends ${emitted.join('/')} but ${to.label || to.id} expects ${inp.accepts.join('/')}` });
    }
    return warnings;
  }

  function canConnect(doc, library, config, from, to) {
    const trial = clone(doc);
    trial.edges.push({ id: newId(trial, 'edge'), from, to, params: {} });
    try { validate(trial, library, config); } catch (error) { return { ok: false, reason: error.message }; }
    const warning = issues(trial, library, config).find(w => w.kind === 'payload-mismatch' && w.edgeId === trial.edges.at(-1).id);
    return { ok: true, warning: warning?.message || null };
  }

  function newId(doc, prefix) {
    const taken = new Set([...doc.nodes, ...doc.edges, ...doc.groups, ...doc.notes, ...doc.faults].map(item => item.id));
    for (let i = 1; ; i++) if (!taken.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
  }

  function newClassId(doc, library, base) {
    const slug = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'class';
    const taken = new Set([...doc.classes.map(c => c.id), ...Object.keys(library.classes)]);
    for (let i = 1; ; i++) { const candidate = `user.${slug}${i === 1 ? '' : `-${i}`}`; if (!taken.has(candidate)) return candidate; }
  }

  // Deriving moves an instance's overrides into a new user class and re-points the instance at it.
  function deriveClass(input, nodeId, { label: name, id: requested } = {}, library, config) {
    const doc = clone(input), n = doc.nodes.find(item => item.id === nodeId);
    if (!n) fail('deriveClass.nodeId', 'existing node', nodeId);
    const parent = resolveClass(n.classId, doc, library, config);
    if(isConcept(n.classId))throw Error('Refine the responsibility through its explicit contract instead of deriving a class');
    const classId = requested || newClassId(doc, library, name || `${parent.label} custom`);
    doc.classes.push({ id: classId, label: name || `${parent.label} (custom)`, extends: n.classId, defaults: { ...n.params } });
    n.classId = classId; n.params = {};
    return { diagram: validate(doc, library, config), classId };
  }

  // Changing class keeps overrides that remain valid parameters of the new kernel.
  function changeClass(input, nodeId, classId, library, config) {
    const doc = clone(input), n = doc.nodes.find(item => item.id === nodeId);
    if (!n) fail('changeClass.nodeId', 'existing node', nodeId);
    if(isConcept(n.classId))throw Error('Use Refine responsibility to preserve its external contract');
    const kernel = library.kernels[resolveClass(classId, doc, library, config).kernel];
    const kept = {}, dropped = [];
    for (const [key, value] of Object.entries(n.params)) {
      try { if (!kernel.params[key]) throw Error('undeclared'); kept[key] = checkParamValue(C, key, kernel.params[key], value); } catch { dropped.push(key); }
    }
    n.classId = classId; n.params = kept;
    const validPorts = new Set(kernel.ports.map(p => p.id));
    const removedEdges = doc.edges.filter(e => (e.from.nodeId === nodeId && !validPorts.has(e.from.portId)) || (e.to.nodeId === nodeId && !validPorts.has(e.to.portId))).map(e => e.id);
    doc.edges = doc.edges.filter(e => !removedEdges.includes(e.id));
    doc.faults = doc.faults.filter(f => !(f.target.kind === 'node' && f.target.id === nodeId && !kernel.faults.includes(f.type)) && !(f.target.kind === 'edge' && removedEdges.includes(f.target.id)));
    return { diagram: validate(doc, library, config), dropped, removedEdges };
  }

  function compile(input, library, config) {
    const authored = executable(input, library, config);
    const doc = S.lower(authored, library, config, helpers);
    const outByNode = new Map(), inByNode = new Map();
    const edges = doc.edges.map(edge => ({ id: edge.id, from: edge.from.nodeId, fromPort: edge.from.portId, to: edge.to.nodeId, toPort: edge.to.portId, params: resolveEdgeParams(edge, library).values }));
    for (const edge of edges) {
      const out = outByNode.get(edge.from) || {}; (out[edge.fromPort] ||= []).push(edge); outByNode.set(edge.from, out);
      const inp = inByNode.get(edge.to) || {}; (inp[edge.toPort] ||= []).push(edge.id); inByNode.set(edge.to, inp);
    }
    const byOrder = (a, b) => a.params.order - b.params.order || a.id.localeCompare(b.id);
    const nodes = doc.nodes.map(n => {
      const { klass, values } = resolveNodeParams(n, doc, library, config);
      const kernel = library.kernels[klass.kernel];
      const out = {}, inp = {};
      for (const port of kernel.ports) {
        if (port.direction === 'out') out[port.id] = (outByNode.get(n.id)?.[port.id] || []).sort(byOrder).map(edge => edge.id);
        else inp[port.id] = [...(inByNode.get(n.id)?.[port.id] || [])].sort();
      }
      return { id: n.id, label: n.label || klass.label, classId: klass.id, kernel: klass.kernel, params: values, groupId: n.groupId ?? null, out, in: inp };
    });
    const groups = doc.groups.map(group => ({ id: group.id, kind: group.kind, label: group.label, ...(group.kind === 'resource' ? { capacity: group.capacity } : {}), nodeIds: doc.nodes.filter(n => n.groupId === group.id).map(n => n.id) }));
    const faults = doc.faults.map(f => ({ id: f.id, atSec: f.atSec, untilSec: f.untilSec, target: { ...f.target }, type: f.type, params: { ...Object.fromEntries(Object.entries(library.faultTypes.find(t => t.id === f.type).params).map(([k, s]) => [k, s.default])), ...f.params } }))
      .sort((a, b) => a.atSec - b.atSec || a.id.localeCompare(b.id));
    return deepFreeze({ schema: COMPILED_SCHEMA, diagramId: doc.id, name: doc.name, seed: doc.seed, horizonSec: doc.run.horizonSec, libraryVersion: library.version, nodes, edges, groups, faults, ...(doc.composition ? { composition: doc.composition } : {}) });
  }

  // v5 authoring retains conceptual identity and external contracts. Only fully bound graphs lower to v4.
  function executable(input,library,config){
    const doc=validate(input,library,config);if(doc.schema!==DESIGN_SCHEMA)return doc;
    const unbound=doc.nodes.filter(n=>isConcept(n.classId)&&!(doc.concepts.find(c=>'concept.'+c.id===n.classId)?.binding));
    if(unbound.length)throw Error('Unbound responsibilities cannot simulate or deploy: '+unbound.map(n=>n.label||n.id).join(', '));
    for(const node of doc.nodes){if(!isConcept(node.classId))continue;const concept=doc.concepts.find(c=>'concept.'+c.id===node.classId);for(const edge of doc.edges)for(const side of ['from','to'])if(edge[side].nodeId===node.id)edge[side].portId=concept.binding.ports[edge[side].portId];node.classId=concept.binding.classId;}
    doc.schema=SCHEMA;delete doc.concepts;delete doc.intent;return validate(doc,library,config);
  }
  function addConcept(input,options,library,config){
    const doc=validate(input,library,config),nodeId=options.id||newId(doc,'responsibility');doc.schema=DESIGN_SCHEMA;doc.concepts||=[];
    const classId=options.conceptId||nodeId;if(doc.concepts.some(c=>c.id===classId))throw Error('Concept ID already exists');
    doc.concepts.push({id:classId,label:options.label||'Responsibility',responsibility:options.responsibility||'',ports:clone(options.ports||[{id:'in',direction:'in',payloadType:'any'},{id:'out',direction:'out',payloadType:'any'}])});
    doc.nodes.push({id:nodeId,classId:'concept.'+classId,label:options.label||'Responsibility',x:options.x,y:options.y,params:{}});
    return {diagram:validate(doc,library,config),id:nodeId};
  }
  function refineConcept(input,nodeId,binding,library,config){
    const doc=validate(input,library,config),node=doc.nodes.find(n=>n.id===nodeId),concept=doc.concepts?.find(c=>'concept.'+c.id===node?.classId);
    if(!concept)throw Error('Select a conceptual responsibility');concept.binding=clone(binding);return validate(doc,library,config);
  }

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
    return value;
  }

  helpers = { DESIGN_SCHEMA, validate, resolveClass, resolveNodeParams, portsForNode, validateParams, clone, newId, fail, label };
  const subsystems = Object.freeze(Object.fromEntries(['capture', 'insert', 'publish', 'upgrade', 'lower'].map(name => [name, (...args) => S[name](...args, helpers)]).concat([['definition', S.definition], ['isComposite', S.isComposite]])));
  return Object.freeze({ DESIGN_SCHEMA, isConcept, executable, addConcept, refineConcept, subsystems, portsForNode, GROUP_SCHEMA, SCHEMA, ANNOTATED_SCHEMA, LEGACY_SCHEMA, COMPILED_SCHEMA, GROUP_KINDS, FAILURE_DOMAIN_KINDS, emptyDiagram, validate, issues, compile, resolveClass, resolveNodeParams, resolveEdgeParams, portSpec, emittedPayloads, canConnect, newId, newClassId, deriveClass, changeClass, clone });
});
