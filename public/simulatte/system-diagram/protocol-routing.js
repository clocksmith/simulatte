(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramProtocolRouting = api;
})(globalThis, function () {
  'use strict';
  // A route is compatible only when every possible forwarding branch executes the same
  // acknowledged protocol. Graph reachability alone does not prove reply semantics.
  const RELAYS = Object.freeze({
    service: ['calls'], loadBalancer: ['backends'], rateLimiter: ['out'],
    circuitBreaker: ['protected', 'fallback'], retry: ['target'],
    fallback: ['primary', 'fallback'], cache: ['origin']
  });
  const MULTI = new Set(['loadBalancer', 'circuitBreaker', 'fallback']);
  const outgoing = (node, compiled, port) => compiled.edges.filter(e => e.from === node.id && e.fromPort === port);
  // Generic byte caches do not store application records or know tenant/auth/cache identities.
  // Conservatively bypass all semantic fields rather than pretending a byte-size hit is a record.
  const hasProtocol = msg => Object.keys(msg?.fields || {}).some(key => key !== 'synthetic');

  function passThrough(ctx, job, result, extraFields) {
    const msg = result.msg || {}, out = { ok: result.ok, fields: { ...(msg.fields || {}), ...(extraFields || {}) } };
    if (!result.ok) out.err = result.err || 'error';
    if (Number.isFinite(msg.kb)) out.kb = msg.kb;
    if (extraFields && msg.fields?.application) out.kb = new TextEncoder().encode(JSON.stringify(out.fields)).byteLength / 1000;
    if (msg.ptype) out.ptype = msg.ptype;
    if (Number.isFinite(msg.tokens)) out.tokens = msg.tokens;
    return ctx.reply(job, out);
  }
  function resolveEdgeTargets(edge, compiled, options = {}) {
    const nodes = new Map(compiled.nodes.map(n => [n.id, n])), targets = new Map(), verified = new Set();
    const kernels = options.kernels, targetPort = options.targetPort;
    const label = options.label || `${edge.from}.${edge.fromPort}`;
    const expected = kernels?.length ? kernels.join('|') : 'protocol terminal';
    const reject = reason => { throw Error(`${label} requires a synchronous ${expected} route: ${reason}`); };
    function visit(link, visiting) {
      if (link.params.mode !== 'sync') reject(`${link.id} must use acknowledged sync links, not enqueue/async acknowledgement`);
      if (link.params.probability !== 1 || link.params.callsPerRequest !== 1) reject(`${link.id} must execute exactly once with probability 1`);
      if (link.params.op !== 'inherit') reject(`${link.id} must inherit the request operation`);
      const node = nodes.get(link.to);
      if (!node) reject(`missing endpoint ${link.to}`);
      if (visiting.has(node.id)) reject(`routing cycle at ${node.id}`);
      if (kernels?.includes(node.kernel) || (!kernels && !RELAYS[node.kernel])) {
        if (targetPort && link.toPort !== targetPort) reject(`${node.id} must receive on ${targetPort}, not ${link.toPort}`);
        if (options.targetIds && !options.targetIds.includes(node.id)) reject(`unexpected endpoint ${node.id}`);
        targets.set(node.id, node); return;
      }
      const ports = RELAYS[node.kernel];
      if (!ports) reject(`${node.id} (${node.kernel}) does not relay this reply protocol`);
      if (link.toPort !== 'in') reject(`${node.id} relay must receive on in`);
      // Memoize only completed tails. Incoming-edge checks and active-path cycle detection
      // remain above this shortcut, including when a later branch converges on this relay.
      if (verified.has(node.id)) return;
      if (node.kernel === 'service' && node.params.outputPayload !== 'inherit') reject(`${node.id} gateway must inherit its payload`);
      const next = ports.flatMap(port => outgoing(node, compiled, port));
      if (!next.length || (!MULTI.has(node.kernel) && next.length !== 1)) reject(`${node.id} needs ${MULTI.has(node.kernel) ? 'at least one' : 'exactly one'} executable downstream route`);
      if (node.kernel === 'circuitBreaker' && outgoing(node, compiled, 'protected').length !== 1) reject(`${node.id} needs one protected route`);
      if (node.kernel === 'fallback' && ports.some(port => outgoing(node, compiled, port).length !== 1)) reject(`${node.id} needs one primary and one fallback route`);
      const path = new Set(visiting); path.add(node.id);
      for (const e of next) visit(e, path);
      verified.add(node.id);
    }
    visit(edge, new Set());
    return [...targets.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  function resolveTargets(node, compiled, port, options = {}) {
    const edges = outgoing(node, compiled, port), min = options.min ?? 1, max = options.max ?? 1;
    if (edges.length < min || edges.length > max) throw Error(`${node.id}.${port} requires ${min === max ? `exactly ${min}` : `${min}..${max}`} linked application peer routes`);
    const targets = new Map();
    for (const edge of edges) for (const target of resolveEdgeTargets(edge, compiled, { ...options, label: `${node.id}.${port}` })) targets.set(target.id, target);
    const result = [...targets.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (options.singleTarget && result.length !== 1) throw Error(`${node.id}.${port} requires one authoritative protocol endpoint, not independent stores`);
    return result;
  }
  return Object.freeze({ resolveTargets, resolveEdgeTargets, passThrough, hasProtocol });
});
