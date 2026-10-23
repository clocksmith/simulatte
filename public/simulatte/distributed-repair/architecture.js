(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteRepairArchitecture = api;
})(globalThis, function () {
  'use strict';
  const TYPES = Object.freeze(['source', 'cpu', 'gpu', 'store']);
  const PAIRS = Object.freeze(['source:cpu', 'source:gpu', 'cpu:cpu', 'cpu:gpu', 'gpu:cpu', 'gpu:gpu', 'cpu:store', 'gpu:store']);
  function initial() { return { schema: 'simulatte.workloadArchitecture.v1', revision: 1, nextId: 10,
    nodes: [{ id: 'source-1', type: 'source', capacity: 1, clusterId: null }, { id: 'cpu-2', type: 'cpu', capacity: 1, clusterId: null },
      { id: 'gpu-3', type: 'gpu', capacity: 1, clusterId: 'cluster-5' }, { id: 'store-4', type: 'store', capacity: 1, clusterId: null }],
    clusters: [{ id: 'cluster-5', capacity: 1 }],
    links: [{ id: 'link-6', from: 'source-1', to: 'cpu-2', capacity: 100, latency: 0 }, { id: 'link-7', from: 'cpu-2', to: 'gpu-3', capacity: 100, latency: 0 }, { id: 'link-8', from: 'gpu-3', to: 'store-4', capacity: 100, latency: 0 }] }; }
  function validate(a) {
    if (!a || a.schema !== 'simulatte.workloadArchitecture.v1') throw Error('Unsupported architecture schema');
    exact(a, ['schema', 'revision', 'nextId', 'nodes', 'clusters', 'links']);
    if (!Number.isInteger(a.revision) || a.revision < 1 || !Number.isInteger(a.nextId) || a.nextId < 1) throw Error('Invalid architecture revision or ID counter');
    if (!Array.isArray(a.nodes) || a.nodes.length > 32 || !Array.isArray(a.links) || a.links.length > 128 || !Array.isArray(a.clusters) || a.clusters.length > 16) throw Error('Architecture exceeds bounded node/link/cluster limits');
    const ids = new Set();
    for (const item of [...a.nodes, ...a.clusters, ...a.links]) {
      if (!/^[a-z]+-\d+$/.test(item.id) || ids.has(item.id)) throw Error('Stable IDs must be unique'); ids.add(item.id);
      if (Number(item.id.split('-').at(-1)) >= a.nextId) throw Error('ID counter must exceed all allocated IDs');
      if (!Number.isFinite(item.capacity) || item.capacity <= 0 || item.capacity > 10000) throw Error('Capacity must be in (0, 10000]');
    }
    for (const cluster of a.clusters) exact(cluster, ['id', 'capacity']);
    for (const node of a.nodes) {
      exact(node, ['id', 'type', 'capacity', 'clusterId']);
      if (['source', 'store'].includes(node.type) && node.capacity !== 1) throw Error('Source/store capacities are fixed; only CPU/GPU resource capacity is modeled');
      if (!TYPES.includes(node.type)) throw Error('Unsupported node type');
      if (node.clusterId !== null && (node.type !== 'gpu' || !a.clusters.some(c => c.id === node.clusterId))) throw Error('Clusters group GPUs under a shared compute budget only');
    }
    if (a.nodes.filter(n => n.type === 'source').length !== 1 || a.nodes.filter(n => n.type === 'store').length !== 1) throw Error('This experiment requires exactly one source and one result store');
    const pairs = new Set();
    for (const link of a.links) {
      exact(link, ['id', 'from', 'to', 'capacity', 'latency']);
      const from = a.nodes.find(n => n.id === link.from), to = a.nodes.find(n => n.id === link.to);
      if (!from || !to || !PAIRS.includes(`${from.type}:${to.type}`)) throw Error(`Invalid connection ${link.id}: supported links carry tasks between source/compute stages and commit to a store`);
      if (!Number.isFinite(link.latency) || link.latency < 0 || link.latency > 60) throw Error('Latency must be 0–60 seconds');
      const pair = `${link.from}:${link.to}`; if (pairs.has(pair)) throw Error('Duplicate connection'); pairs.add(pair);
    }
    const routes = paths(a);
    if (!routes.length) throw Error('Connect a complete source → compute stages → store path');
    for (const node of a.nodes) if (!routes.some(path => path.nodeIds.includes(node.id))) throw Error(`Disconnected node ${node.id}: connect it or remove it before accepting`);
    return a;
  }
  function exact(value, fields) { if (Object.keys(value).length !== fields.length || fields.some(k => !Object.hasOwn(value, k))) throw Error('Undeclared or missing architecture fields'); }
  function paths(a) {
    let visits = 0;
    const routes = [], sources = a.nodes.filter(n => n.type === 'source');
    function visit(node, nodeIds, linkIds) {
      if (++visits > 4096) throw Error('Architecture path search exceeds 4096 visits');
      if (nodeIds.includes(node.id)) throw Error('Cyclic task routing is unsupported; retries belong to delivery policy');
      const ids = [...nodeIds, node.id];
      if (node.type === 'store') { routes.push({ nodeIds: ids, linkIds }); if (routes.length > 128) throw Error('More than 128 execution paths; simplify this bounded architecture'); return; }
      for (const link of a.links.filter(l => l.from === node.id)) {
        const target = a.nodes.find(n => n.id === link.to); if (target) visit(target, ids, [...linkIds, link.id]);
      }
    }
    for (const source of sources) visit(source, [], []);
    return routes.sort((a, b) => a.nodeIds.join(':').localeCompare(b.nodeIds.join(':')));
  }
  function addNode(a, type) { if (!TYPES.includes(type)) throw Error('Unsupported node type'); const id = `${type}-${a.nextId++}`; a.nodes.push({ id, type, capacity: 1, clusterId: null }); return id; }
  function remove(a, id) { a.nodes = a.nodes.filter(n => n.id !== id); a.links = a.links.filter(l => l.id !== id && l.from !== id && l.to !== id); a.clusters = a.clusters.filter(c => c.id !== id); a.nodes.forEach(n => { if (n.clusterId === id) n.clusterId = null; }); }
  function connect(a, from, to, capacity, latency) {
    const f = a.nodes.find(n => n.id === from), t = a.nodes.find(n => n.id === to);
    if (!f || !t || !PAIRS.includes(`${f.type}:${t.type}`)) throw Error('Invalid connection: use source → compute, compute → compute, or compute → store');
    if (a.links.some(l => l.from === from && l.to === to)) throw Error('Connection already exists');
    if (!(capacity > 0) || !Number.isFinite(capacity) || !Number.isFinite(latency) || latency < 0) throw Error('Positive link capacity and nonnegative latency required');
    const id = `link-${a.nextId++}`; a.links.push({ id, from, to, capacity, latency }); return id;
  }
  function group(a, ids, capacity) {
    if (!ids.length || ids.some(id => a.nodes.find(n => n.id === id)?.type !== 'gpu') || !(capacity > 0) || !Number.isFinite(capacity)) throw Error('Select GPUs and a positive shared compute budget');
    const id = `cluster-${a.nextId++}`; a.clusters.push({ id, capacity }); a.nodes.forEach(n => { if (ids.includes(n.id)) n.clusterId = id; }); return id;
  }
  function identity(a) { let h = 2166136261; for (const ch of JSON.stringify(validate(a))) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`; }
  return Object.freeze({ identity, TYPES, initial, validate, paths, addNode, remove, connect, group });
});
