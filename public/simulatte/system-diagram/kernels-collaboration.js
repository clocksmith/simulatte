(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry, node ? require('./protocol-routing.js') : root.SimulatteSystemDiagramProtocolRouting);
  if (node) module.exports = registry;
})(globalThis, function (registry, routing) {
  'use strict';
  // Bounded educational records, never live agents, private reasoning, or a vendor's backend.
  const MS = 1000, BYTES_PER_KB = 1000, MAX_USERS = 128, MAX_DEPENDENCIES = 32;
  const STATION = Object.freeze({ concurrency: 'concurrency', queueCapacity: 'queueCapacity' });
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (map, key) => Object.hasOwn(map, key) ? map[key] : null;
  const keyOf = (...parts) => JSON.stringify(parts);
  const options = (ctx, slot) => ({ timeoutMs: ctx.p.callTimeoutMs, retries: ctx.p.retries, backoffMs: ctx.p.retryBackoffMs, slot });
  const down = (ctx, fault, active) => ['crash', 'outage'].includes(fault.type) && active && ctx.fault.down;
  const reject = (ctx, job, err = 'invalid') => ctx.reply(job, { ok: false, err });
  function admit(ctx, job) {
    if (ctx.p.errorRate > 0 && ctx.rand() < ctx.p.errorRate) return reject(ctx, job, 'error');
    return ctx.admit(job);
  }
  function bounded(ctx, size) { if (size < ctx.p.maxRecords) return true; ctx.count('record capacity rejections'); return false; }
  function syncPort(node, compiled, port, kernel, targetPort) {
    const edges = compiled.edges.filter(e => e.from === node.id && e.fromPort === port);
    if (kernel && port !== 'next') return routing.resolveTargets(node, compiled, port, { kernels: [kernel], targetPort, min: 0, max: port === 'status' || port === 'graph' ? 1 : 64, singleTarget: port === 'graph' && edges.length > 0 });
    const nodes = new Map(compiled.nodes.map(n => [n.id, n]));
    for (const e of edges) {
      if (e.params.mode !== 'sync') throw Error(`${node.id}.${port} requires acknowledged sync links`);
      if (kernel && (nodes.get(e.to)?.kernel !== kernel || e.toPort !== targetPort)) throw Error(`${node.id}.${port} requires ${kernel}.${targetPort}`);
    }
  }

  function taskTopology(node, compiled) {
    syncPort(node, compiled, 'next', 'agentTask', 'in'); syncPort(node, compiled, 'tools'); syncPort(node, compiled, 'status', 'taskJournal', 'in');
    const deps = compiled.edges.filter(e => e.to === node.id && e.toPort === 'in' && e.fromPort === 'next');
    if (deps.length > MAX_DEPENDENCIES || new Set(deps.map(e => e.from)).size !== deps.length) throw Error(`${node.id}: task dependencies must be distinct and bounded at ${MAX_DEPENDENCIES}`);
    const seen = new Set(), visiting = new Set();
    const visit = id => { if (visiting.has(id)) throw Error(`${node.id}: task dependency cycle`); if (seen.has(id)) return; visiting.add(id); for (const e of compiled.edges.filter(e => e.from === id && e.fromPort === 'next')) visit(e.to); visiting.delete(id); seen.add(id); };
    visit(node.id);
  }
  function sendStatus(ctx, event) {
    if (ctx.fault.down || event.delivered || event.sending || event.attempts >= ctx.p.statusAttempts) return;
    const edge = ctx.edges('status')[0]; if (!edge) return;
    event.sending = true; event.attempts++;
    ctx.call(null, edge.id, event.msg, { timeoutMs: ctx.p.callTimeoutMs, retries: 0, slot: { kind: 'status', id: event.id, epoch: ctx.k.epoch } });
  }
  function status(ctx, row, state, step) {
    row.status = state; row.step = step; row.updatedAt = ctx.t;
    if (ctx.k.events.length >= ctx.p.maxEvents) { ctx.count('status capacity losses'); return; }
    const seq = ++ctx.k.sequence, id = `${ctx.nodeId}:${seq}`;
    const record = { id, sequence: seq, workflowId: row.workflowId, taskId: ctx.nodeId, task: ctx.node.label, state, step, attempt: row.executions, t: ctx.t };
    const event = { id, record, msg: ctx.derive(row.msg, { ptype: 'event', idem: id, fields: { taskStatus: record } }), sending: false, delivered: false, attempts: 0 };
    ctx.k.events.push(event); sendStatus(ctx, event); ctx.log('task-status', `${record.task}: ${state} (${step})`);
  }
  function taskReply(ctx, row, ok, err = 'error') {
    row.active = false; row.complete = ok;
    status(ctx, row, ok ? 'complete' : 'failed', ok ? 'dependencies and output acknowledged' : err);
    for (const id of row.waiters.splice(0)) { const job = ctx.job(id); if (job) ctx.reply(job, { ok, ...(ok ? {} : { err }), fields: { workflowId: row.workflowId, taskId: ctx.nodeId, committed: row.committed } }); }
  }
  function nextTasks(ctx, row) {
    row.pending = 0; row.error = null;
    const edges = ctx.edges('next');
    for (const edge of edges) {
      row.pending++;
      ctx.call(ctx.job(row.waiters[0]), edge.id, { ptype: 'task', idem: keyOf(row.workflowId, edge.to), fields: { ...row.msg.fields, workflowId: row.workflowId, predecessor: ctx.nodeId } }, options(ctx, { kind: 'next', workflowId: row.workflowId, epoch: ctx.k.epoch }));
    }
    if (!row.pending) taskReply(ctx, row, true); else status(ctx, row, 'waiting', 'downstream task join');
  }
  function taskCommit(ctx, row) {
    const result = ctx.effect(keyOf(row.workflowId, ctx.nodeId), { idempotent: true });
    if (result.suppressed) ctx.k.reconciled++; else ctx.k.commits++;
    row.committed = true; row.committedAt ??= ctx.t;
    status(ctx, row, 'waiting', result.suppressed ? 'reconciled existing effect' : 'effect committed; acknowledgement pending');
    ctx.wake(ctx.p.ackDelayMs / MS, { kind: 'ack', workflowId: row.workflowId, epoch: ctx.k.epoch });
  }
  function taskTools(ctx, row) {
    const edges = ctx.edges('tools');
    if (row.toolIndex >= edges.length) { taskCommit(ctx, row); return; }
    const edge = edges[row.toolIndex]; status(ctx, row, 'waiting', `tool ${edge.to}`);
    ctx.call(ctx.job(row.waiters[0]), edge.id, { idem: keyOf(row.workflowId, ctx.nodeId, edge.id), op: 'write' }, { ...options(ctx, { kind: 'tool', workflowId: row.workflowId, epoch: ctx.k.epoch }), retries: 0 });
  }
  function startTask(ctx, row) {
    if (row.active) return;
    if (row.executions >= ctx.p.maxAttempts) { taskReply(ctx, row, false, 'unavailable'); return; }
    row.active = true; row.executions++; row.toolIndex = 0;
    if (row.executions > 1) status(ctx, row, 'retry', 'resume durable task identity');
    if (row.committed) { taskCommit(ctx, row); return; }
    const job = row.waiters.map(id => ctx.job(id)).find(Boolean); if (!job) { row.active = false; return; }
    row.workerJob = job.id; ctx.wake(ctx.p.callTimeoutMs / MS, { kind: 'workerWatch', workflowId: row.workflowId, epoch: ctx.k.epoch }); status(ctx, row, 'queued', 'waiting for worker slot');
    if (!ctx.admit(job)) { row.waiters = row.waiters.filter(id => id !== job.id); taskReply(ctx, row, false, 'rejected'); }
  }
  registry.register({ id: 'agentTask', station: STATION, validateTopology: taskTopology,
    init: () => ({ rows: {}, events: [], sequence: 0, epoch: 0, commits: 0, reconciled: 0 }),
    onRequest(ctx, job) {
      const workflowId = job.msg.fields?.workflowId || job.msg.trace, key = keyOf(workflowId);
      let row = own(ctx.k.rows, key);
      if (!row) {
        if (!bounded(ctx, Object.keys(ctx.k.rows).length)) { reject(ctx, job, 'rejected'); return; }
        row = ctx.k.rows[key] = { workflowId, taskId: ctx.nodeId, msg: clone(job.msg), arrivals: [], waiters: [], executions: 0, committed: false, complete: false, active: false, status: 'queued', step: 'accepted', updatedAt: ctx.t };
        status(ctx, row, 'queued', 'task accepted');
      }
      if (row.complete) { const effect = ctx.effect(keyOf(workflowId, ctx.nodeId), { idempotent: true }); if (effect.suppressed) ctx.k.reconciled++; status(ctx, row, 'complete', 'reconciled completed task'); ctx.reply(job, { ok: true, fields: { workflowId, taskId: ctx.nodeId, duplicate: true } }); return; }
      if (row.active && row.workerJob && !ctx.job(row.workerJob)) { row.active = false; row.waiters = row.waiters.filter(id => ctx.job(id)); status(ctx, row, 'retry', 'worker attempt ended before task completion'); }
      row.waiters.push(job.id);
      const from = job.from ? ctx.edge(job.from.edgeId) : null;
      if (from && !row.arrivals.includes(from.from)) row.arrivals.push(from.from);
      const deps = ctx.node.in.in.map(id => ctx.edge(id)).filter(e => e.fromPort === 'next').map(e => e.from);
      if (!deps.every(id => row.arrivals.includes(id))) {
        if (!row.active) {
          if (row.waiters.length === 1) { row.waitGeneration = (row.waitGeneration || 0) + 1; ctx.wake(ctx.p.callTimeoutMs / MS, { kind: 'joinTimeout', workflowId, epoch: ctx.k.epoch, generation: row.waitGeneration }); }
          status(ctx, row, 'waiting', `join ${row.arrivals.filter(id => deps.includes(id)).length}/${deps.length} dependencies`);
        }
        return;
      }
      startTask(ctx, row);
    },
    onServed(ctx, job) {
      ctx.release(job); const row = own(ctx.k.rows, keyOf(job.msg.fields?.workflowId || job.msg.trace)); if (!row || !row.active) return;
      status(ctx, row, 'running', 'worker executing authored task'); if (ctx.p.errorRate > 0 && ctx.rand() < ctx.p.errorRate) { taskReply(ctx, row, false, 'error'); return; } taskTools(ctx, row);
    },
    onResult(ctx, job, slot, result) {
      if (!slot || slot.epoch !== ctx.k.epoch) return;
      if (slot.kind === 'status') {
        const event = ctx.k.events.find(e => e.id === slot.id); if (!event) return; event.sending = false; event.delivered = result.ok;
        if (!result.ok && event.attempts < ctx.p.statusAttempts) ctx.wake(ctx.p.retryBackoffMs / MS, { kind: 'status', id: event.id, epoch: ctx.k.epoch });
        return;
      }
      const row = own(ctx.k.rows, keyOf(slot.workflowId)); if (!row || !row.active) return;
      if (slot.kind === 'tool') {
        if (result.ok) { row.toolIndex++; status(ctx, row, 'running', 'tool result received'); taskTools(ctx, row); }
        else if (row.executions < ctx.p.maxAttempts) { row.executions++; status(ctx, row, 'retry', `tool failed: ${result.err}`); ctx.wake(ctx.p.retryBackoffMs / MS, { kind: 'tool', workflowId: row.workflowId, epoch: ctx.k.epoch }); }
        else taskReply(ctx, row, false, result.err || 'error');
      } else if (slot.kind === 'next') { row.pending--; if (!result.ok) row.error ||= result.err || 'error'; if (!row.pending) taskReply(ctx, row, !row.error, row.error); }
    },
    onWake(ctx, wake) {
      if (wake.epoch !== ctx.k.epoch) return;
      if (wake.kind === 'status') { const event = ctx.k.events.find(e => e.id === wake.id); if (event) sendStatus(ctx, event); return; }
      const row = own(ctx.k.rows, keyOf(wake.workflowId)); if (!row) return;
      if (wake.kind === 'joinTimeout') { if (wake.generation === row.waitGeneration && !row.active && !row.complete && row.waiters.length) taskReply(ctx, row, false, 'timeout'); return; }
      if (!row.active) return;
      if (wake.kind === 'workerWatch') { if (!ctx.job(row.workerJob)) taskReply(ctx, row, false, 'error'); else ctx.wake(ctx.p.callTimeoutMs / MS, wake); return; }
      if (wake.kind === 'ack') nextTasks(ctx, row); else if (wake.kind === 'tool') taskTools(ctx, row);
    },
    onFault(ctx, fault, active) {
      if (down(ctx, fault, active)) {
        ctx.k.epoch++;
        for (const row of Object.values(ctx.k.rows)) if (!row.complete) { row.active = false; row.waiters = []; row.status = 'retry'; row.step = row.committed ? 'worker crashed after effect; awaiting reconciliation' : 'worker crashed; awaiting redelivery'; row.updatedAt = ctx.t; status(ctx, row, 'retry', row.step); }
        for (const event of ctx.k.events) event.sending = false;
      } else if (!active && !ctx.fault.down) for (const event of ctx.k.events) sendStatus(ctx, event);
    },
    observe(ctx) {
      const rows = Object.values(ctx.k.rows);
      return { detail: { Tasks: rows.length, Complete: rows.filter(r => r.complete).length, 'Committed effects': ctx.k.commits, Reconciled: ctx.k.reconciled, 'Status pending': ctx.k.events.filter(e => !e.delivered).length, Model: 'Named authored task DAG; status events only, not model reasoning' }, records: { tasks: rows.map(r => ({ workflowId: r.workflowId, taskId: r.taskId, task: ctx.node.label, state: r.status, step: r.step, attempts: r.executions, committed: r.committed, updatedAt: r.updatedAt })), events: ctx.k.events.map(e => ({ ...e.record, delivered: e.delivered })) } };
    }
  });
  registry.register({ id: 'taskJournal', station: STATION,
    init: () => ({ events: [], seen: {}, latest: {}, duplicates: 0 }), onRequest: admit,
    onServed(ctx, job) {
      const record = job.msg.fields?.taskStatus;
      if (!record || typeof record.id !== 'string' || typeof record.workflowId !== 'string' || !Number.isInteger(record.sequence) || !['queued', 'running', 'waiting', 'retry', 'complete', 'failed'].includes(record.state)) { reject(ctx, job); return; }
      const id = keyOf(record.taskId, record.id), task = keyOf(record.workflowId, record.taskId);
      if (own(ctx.k.seen, id)) ctx.k.duplicates++;
      else {
        if (!bounded(ctx, ctx.k.events.length)) { reject(ctx, job, 'rejected'); return; }
        ctx.k.seen[id] = true; ctx.k.events.push({ ...clone(record), receivedAt: ctx.t });
        if (!own(ctx.k.latest, task) || ctx.k.latest[task].sequence < record.sequence) ctx.k.latest[task] = clone(record);
      }
      ctx.reply(job, { ok: true });
    },
    observe: ctx => ({ detail: { 'Durable events': ctx.k.events.length, 'Task projections': Object.keys(ctx.k.latest).length, 'Duplicate status deliveries': ctx.k.duplicates, Model: 'Durable append-only status journal and latest dashboard projection' }, records: { events: clone(ctx.k.events), tasks: clone(Object.values(ctx.k.latest)) } })
  });

  function socialEnvelope(job) { return job.msg.fields?.social; }
  function socialReply(ctx, job, value) {
    // Expected IDs are diagnostic oracle metadata, not modeled user-visible bytes.
    const wire = { ...value }; delete wire.expected; delete wire.snapshotAt;
    const kb = ctx.p.responseKb + new TextEncoder().encode(JSON.stringify(wire)).length / BYTES_PER_KB;
    ctx.reply(job, { ok: true, ptype: 'json', kb, fields: { social: value } });
  }
  function socialMessage(ctx, envelope) { return ctx.message({ ptype: 'json', kb: ctx.p.payloadKb, op: envelope.kind === 'feed' ? 'read' : 'write', fields: { social: envelope, synthetic: true } }); }
  function emitSocial(ctx, envelope, port, slot) {
    const msg = socialMessage(ctx, envelope); ctx.beginRequest(msg); const job = ctx.newJob(msg), edge = ctx.edges(port)[0];
    if (!ctx.job(job.id)) { ctx.k.failed++; return; }
    if (!edge) { ctx.k.failed++; ctx.endRequest(msg, { ok: false, err: 'unavailable' }); reject(ctx, job, 'unavailable'); return; }
    ctx.k.outstanding++; ctx.call(job, edge.id, {}, options(ctx, slot));
  }
  function population(p) {
    const users = Array.from({ length: p.userCount }, (_, i) => `user-${i}`), follows = [];
    for (let i = 1; i < users.length; i++) {
      if (i <= p.celebrityFollowers) follows.push({ followerId: users[i], authorId: users[0] });
      for (let j = 1; j <= Math.min(p.followsPerUser, users.length - 2); j++) {
        const authorId = users[1 + ((i - 1 + j) % (users.length - 1))];
        if (authorId !== users[i]) follows.push({ followerId: users[i], authorId });
      }
    }
    return { kind: 'bootstrap', users, follows };
  }
  registry.register({ id: 'socialSource', station: null,
    immutableParams: ['userCount', 'followsPerUser', 'celebrityFollowers'],
    validateTopology(node, compiled) { syncPort(node, compiled, 'write', 'socialStore', 'in'); syncPort(node, compiled, 'read', 'socialFeed', 'in'); if (node.params.celebrityFollowers >= node.params.userCount) throw Error(`${node.id}: celebrity followers must be less than user count`); },
    init: () => ({ bootstrapped: false, posts: 0, reads: 0, completed: 0, failed: 0, outstanding: 0, epoch: 0, followIndex: 0 }),
    start(ctx) { ctx.wake(ctx.p.startSec, { kind: 'bootstrap', epoch: ctx.k.epoch }); },
    onWake(ctx, wake) {
      if (wake.epoch !== ctx.k.epoch) return;
      if (wake.kind === 'bootstrap') { emitSocial(ctx, { ...population(ctx.p), follows: [] }, 'write', { kind: 'bootstrap' }); return; }
      if (!ctx.k.bootstrapped) return;
      if (ctx.k.outstanding >= ctx.p.maxOutstanding) { ctx.wake(ctx.p.retryBackoffMs / MS, wake); return; }
      if (wake.kind === 'post' && ctx.k.posts < ctx.p.postCount) {
        const i = ctx.k.posts++, authorId = i % ctx.p.celebrityEvery === 0 ? 'user-0' : `user-${1 + (i % (ctx.p.userCount - 1))}`;
        emitSocial(ctx, { kind: 'post', post: { id: `${ctx.nodeId}:post-${i + 1}`, authorId, text: `Synthetic post ${i + 1}`, createdAt: ctx.t } }, 'write', { kind: 'post' });
        if (ctx.k.posts < ctx.p.postCount) ctx.wake(ctx.p.postIntervalMs / MS, { kind: 'post', epoch: ctx.k.epoch });
      }
      if (wake.kind === 'read' && ctx.k.reads < ctx.p.readCount) {
        const i = ctx.k.reads++; emitSocial(ctx, { kind: 'feed', userId: `user-${1 + (i % (ctx.p.userCount - 1))}` }, 'read', { kind: 'read' });
        if (ctx.k.reads < ctx.p.readCount) ctx.wake(ctx.p.readIntervalMs / MS, { kind: 'read', epoch: ctx.k.epoch });
      }
    },
    onResult(ctx, job, slot, result) {
      ctx.k.outstanding--; ctx.k[result.ok ? 'completed' : 'failed']++; ctx.endRequest(job.msg, { ok: result.ok, ...(result.ok ? {} : { err: result.err || 'error' }) }); ctx.reply(job, { ok: result.ok, ...(result.ok ? {} : { err: result.err || 'error' }), fields: result.msg?.fields || {} });
      if (['bootstrap', 'follow'].includes(slot.kind) && result.ok) {
        const follows = population(ctx.p).follows; if (slot.kind === 'follow') ctx.k.followIndex++;
        if (ctx.k.followIndex < follows.length) { const follow = follows[ctx.k.followIndex]; emitSocial(ctx, { kind: 'follow', ...follow }, 'write', { kind: 'follow' }); }
        else { ctx.k.bootstrapped = true; ctx.wake(0, { kind: 'post', epoch: ctx.k.epoch }); ctx.wake(ctx.p.readStartMs / MS, { kind: 'read', epoch: ctx.k.epoch }); }
      }
    },
    onFault(ctx, fault, active) {
      if (down(ctx, fault, active)) { ctx.k.epoch++; ctx.k.failed += ctx.k.outstanding; ctx.k.outstanding = 0; }
      else if (!active && !ctx.fault.down) { if (!ctx.k.bootstrapped) ctx.wake(0, { kind: 'bootstrap', epoch: ctx.k.epoch }); else { ctx.wake(0, { kind: 'post', epoch: ctx.k.epoch }); ctx.wake(0, { kind: 'read', epoch: ctx.k.epoch }); } }
    },
    observe: ctx => ({ detail: { Users: ctx.p.userCount, Posts: ctx.k.posts, 'Feed reads': ctx.k.reads, Completed: ctx.k.completed, Failed: ctx.k.failed, 'Outstanding requests': ctx.k.outstanding, Model: 'Finite synthetic users, explicit follows and authored posts' } })
  });
  function validPost(post) { return post && typeof post.id === 'string' && post.id.length <= 128 && typeof post.authorId === 'string' && typeof post.text === 'string' && post.text.length <= 280 && Number.isFinite(post.createdAt); }
  function postOrder(a, b) { return b.createdAt - a.createdAt || a.id.localeCompare(b.id); }
  function storeSend(ctx, row, job) {
    if (row.enqueued || !row.recipients.length || row.mode === 'pull') { socialReply(ctx, job, { postId: row.post.id, committed: true, mode: row.mode }); return; }
    const edge = ctx.edges('fanout')[0]; if (!edge) { reject(ctx, job, 'unavailable'); return; }
    ctx.call(job, edge.id, { ptype: 'json', fields: { social: { kind: 'fanout', post: row.post, recipients: row.recipients } } }, options(ctx, { postId: row.post.id }));
  }
  function storeGraphCall(ctx, job, social, kind) {
    const edge = ctx.edges('graph')[0];
    if (!edge) { ctx.k.graphFailures++; reject(ctx, job, 'unavailable'); return; }
    ctx.k.graphRequests++;
    ctx.call(job, edge.id, { ptype: 'json', op: ['recipients', 'following'].includes(social.kind) ? 'read' : 'write', fields: { social } }, options(ctx, { kind }));
  }
  function storeRead(ctx, job, authorIds, graph) {
    const k = ctx.k, authors = new Set(authorIds), rows = Object.values(k.posts).filter(r => authors.has(r.post.authorId)), posts = rows.filter(r => r.mode === 'pull').map(r => clone(r.post)).sort(postOrder);
    k.oracleChecks += Object.keys(k.posts).length; k.pullScans += posts.length;
    k.readJobs[job.id] = { posts, expected: rows.map(r => r.post.id).sort(), snapshotAt: ctx.t, ...(graph ? { graphRevision: graph.revision, graphSnapshotAt: graph.snapshotAt } : {}) };
    ctx.wake(ctx.p.callTimeoutMs / MS, { kind: 'readCleanup', jobId: job.id });
    const ms = ctx.serviceMs(ctx.p.serviceMs + ctx.p.perPostReadMs * posts.length, ctx.p.serviceDist, ctx.p.serviceCv);
    if (!ctx.admit(job, ms)) delete k.readJobs[job.id];
  }
  function storePost(ctx, job, post, recipients, graph) {
    const k = ctx.k; let row = own(k.posts, keyOf(post.id));
    if (row) { if (JSON.stringify(row.post) !== JSON.stringify(post)) { reject(ctx, job); return; } k.duplicates++; ctx.effect(keyOf('post', post.id), { idempotent: true }); }
    else {
      if (!bounded(ctx, Object.keys(k.posts).length)) { reject(ctx, job, 'rejected'); return; }
      const mode = ctx.p.fanoutMode === 'hybrid' ? (recipients.length >= ctx.p.highFollowerThreshold ? 'pull' : 'push') : ctx.p.fanoutMode;
      row = k.posts[keyOf(post.id)] = { post: clone(post), recipients: [...recipients], mode, enqueued: false, ...(graph ? { graphRevision: graph.revision, graphSnapshotAt: graph.snapshotAt } : {}) };
      ctx.effect(keyOf('post', post.id), { idempotent: true });
    }
    storeSend(ctx, row, job);
  }
  function validGraphList(ids, excluded) {
    return Array.isArray(ids) && ids.length <= MAX_USERS && new Set(ids).size === ids.length && ids.every(id => typeof id === 'string' && id.length <= 128 && /^user-\d+$/.test(id) && id !== excluded);
  }
  function storeGraphResult(ctx, job, slot, result) {
    const value = result.msg?.fields?.social, e = socialEnvelope(job);
    const fail = err => { ctx.k.graphFailures++; reject(ctx, job, err); };
    if (!result.ok) { fail(result.err || 'error'); return; }
    if (!value || !Number.isInteger(value.revision) || value.revision < 1 || !Number.isFinite(value.snapshotAt) || value.snapshotAt < 0 || value.snapshotAt > ctx.t) { fail('invalid'); return; }
    if (slot.kind === 'graphMutation') {
      const valid = value.kind === e.kind && (e.kind === 'bootstrap'
        ? Number.isInteger(value.users) && value.users === e.users?.length && Number.isInteger(value.follows) && value.follows >= 0 && value.follows < MAX_USERS * MAX_USERS
        : value.followerId === e.followerId && value.authorId === e.authorId && value.following === (e.kind === 'follow'));
      if (!valid) { fail('invalid'); return; } socialReply(ctx, job, clone(value)); return;
    }
    if (slot.kind === 'graphPost' && value.kind === 'recipients' && value.authorId === e.post.authorId && validGraphList(value.recipients, e.post.authorId)) { storePost(ctx, job, e.post, value.recipients, value); return; }
    if (slot.kind === 'graphRead' && value.kind === 'following' && value.userId === e.userId && validGraphList(value.authorIds, e.userId)) { storeRead(ctx, job, value.authorIds, value); return; }
    fail('invalid');
  }
  registry.register({ id: 'socialStore', station: STATION,
    immutableParams: ['fanoutMode', 'highFollowerThreshold', 'graphMode'],
    validateTopology(node, compiled) {
      if (node.params.graphMode === 'external' && !node.out.graph.length) throw Error(`${node.id}.graph requires a connected external socialGraph.in authority; legacy bundled state is disabled`);
      syncPort(node, compiled, 'fanout'); syncPort(node, compiled, 'graph', 'socialGraph', 'in');
    },
    init(ctx) {
      const graphBacked = ctx.p.graphMode === 'external' || ctx.edges('graph').length > 0;
      return { graphBacked, posts: {}, readJobs: {}, duplicates: 0, reads: 0, pullScans: 0, oracleChecks: 0, graphRequests: 0, graphFailures: 0, ...(graphBacked ? {} : { users: [], follows: [], bootstrapSignature: null }) };
    },
    onRequest(ctx, job) {
      const e = socialEnvelope(job), k = ctx.k;
      if (e?.kind !== 'feed' || (!k.graphBacked && !k.users.includes(e.userId))) { admit(ctx, job); return; }
      if (ctx.p.errorRate > 0 && ctx.rand() < ctx.p.errorRate) { reject(ctx, job, 'error'); return; }
      if (k.graphBacked) { storeGraphCall(ctx, job, { kind: 'following', userId: e.userId }, 'graphRead'); return; }
      storeRead(ctx, job, k.follows.filter(f => f.followerId === e.userId).map(f => f.authorId));
    },
    onServed(ctx, job) {
      ctx.release(job); const e = socialEnvelope(job), k = ctx.k;
      if (!e) { reject(ctx, job); return; }
      if (k.graphBacked && ['bootstrap', 'follow', 'unfollow'].includes(e.kind)) { storeGraphCall(ctx, job, e, 'graphMutation'); return; }
      if (e.kind === 'bootstrap') {
        if (!Array.isArray(e.users) || !e.users.length || e.users.length > MAX_USERS || new Set(e.users).size !== e.users.length || e.users.some(u => typeof u !== 'string' || !/^user-\d+$/.test(u)) || !Array.isArray(e.follows) || e.follows.length > MAX_USERS * MAX_USERS || e.follows.some(f => !e.users.includes(f.followerId) || !e.users.includes(f.authorId) || f.followerId === f.authorId)) { reject(ctx, job); return; }
        const signature = JSON.stringify([e.users, e.follows]); if (k.bootstrapSignature && k.bootstrapSignature !== signature) { reject(ctx, job); return; }
        if (k.bootstrapSignature) { socialReply(ctx, job, { users: k.users.length, follows: k.follows.length }); return; }
        k.users = [...e.users]; k.follows = [...new Map(e.follows.map(f => [keyOf(f.followerId, f.authorId), clone(f)])).values()]; k.bootstrapSignature = signature;
        socialReply(ctx, job, { users: k.users.length, follows: k.follows.length }); return;
      }
      if (['follow', 'unfollow'].includes(e.kind)) {
        if (!k.users.includes(e.followerId) || !k.users.includes(e.authorId) || e.followerId === e.authorId) { reject(ctx, job); return; }
        const index = k.follows.findIndex(f => f.followerId === e.followerId && f.authorId === e.authorId);
        if (e.kind === 'follow' && index < 0) k.follows.push({ followerId: e.followerId, authorId: e.authorId });
        if (e.kind === 'unfollow' && index >= 0) k.follows.splice(index, 1);
        socialReply(ctx, job, { followerId: e.followerId, authorId: e.authorId, following: e.kind === 'follow' }); return;
      }
      if (e.kind === 'post') {
        const post = e.post;
        if (!validPost(post) || (!k.graphBacked && !k.users.includes(post.authorId))) { reject(ctx, job); return; }
        if (k.graphBacked) { storeGraphCall(ctx, job, { kind: 'recipients', authorId: post.authorId }, 'graphPost'); return; }
        storePost(ctx, job, post, k.follows.filter(f => f.authorId === post.authorId).map(f => f.followerId).sort()); return;
      }
      if (e.kind === 'feed' && (k.graphBacked || k.users.includes(e.userId))) {
        k.reads++; const snapshot = own(k.readJobs, job.id); delete k.readJobs[job.id];
        if (!snapshot) { reject(ctx, job); return; } socialReply(ctx, job, snapshot); return;
      }
      reject(ctx, job);
    },
    onWake(ctx, wake) { if (wake.kind !== 'readCleanup' || !own(ctx.k.readJobs, wake.jobId)) return; if (!ctx.job(wake.jobId)) delete ctx.k.readJobs[wake.jobId]; else ctx.wake(ctx.p.callTimeoutMs / MS, wake); },
    onFault(ctx, fault, active) { if (down(ctx, fault, active)) ctx.k.readJobs = {}; },
    onResult(ctx, job, slot, result) {
      if (['graphMutation', 'graphPost', 'graphRead'].includes(slot.kind)) { storeGraphResult(ctx, job, slot, result); return; }
      const row = own(ctx.k.posts, keyOf(slot.postId)); if (!row) { reject(ctx, job); return; }
      if (result.ok) { row.enqueued = true; socialReply(ctx, job, { postId: row.post.id, committed: true, mode: row.mode }); } else reject(ctx, job, result.err || 'error');
    },
    observe(ctx) {
      const k = ctx.k, rows = Object.values(k.posts), graph = k.graphBacked;
      return { detail: { ...(graph ? { 'Graph authority': 'Separate users and follows service', 'Graph requests': k.graphRequests, 'Graph failures': k.graphFailures } : { Users: k.users.length, Follows: k.follows.length, 'Graph authority': 'Legacy bundled graph' }), Posts: rows.length, 'Push posts': rows.filter(r => r.mode === 'push').length, 'Pull posts': rows.filter(r => r.mode === 'pull').length, 'Duplicate posts': k.duplicates, 'Pulled post rows': k.pullScans, 'Oracle post checks': k.oracleChecks, 'Fanout pending': rows.filter(r => r.mode === 'push' && r.recipients.length && !r.enqueued).length }, records: { ...(graph ? {} : { users: k.users.map(userId => ({ userId })), follows: clone(k.follows) }), posts: rows.map(r => ({ ...clone(r.post), mode: r.mode, followers: r.recipients.length, enqueued: r.enqueued, ...(graph ? { graphRevision: r.graphRevision, graphSnapshotAt: r.graphSnapshotAt } : {}) })) } };
    }
  });
  function fanoutPump(ctx, job, row) {
    const edge = ctx.edges('timeline')[0]; if (!edge) { reject(ctx, job, 'unavailable'); delete ctx.k.jobs[job.id]; return; }
    while (!row.error && row.pending < ctx.p.batchSize && row.index < row.recipients.length) {
      const userId = row.recipients[row.index++]; row.pending++;
      ctx.call(job, edge.id, { ptype: 'json', idem: keyOf(userId, row.post.id), fields: { social: { kind: 'timeline', userId, post: row.post } } }, options(ctx, { userId }));
    }
    if (!row.pending && (row.error || row.index >= row.recipients.length)) { ctx.k[row.error ? 'failed' : 'completed']++; delete ctx.k.jobs[job.id]; ctx.reply(job, { ok: !row.error, ...(row.error ? { err: row.error } : {}), fields: { social: { postId: row.post.id, recipients: row.index } } }); }
  }
  registry.register({ id: 'socialFanout', station: STATION,
    validateTopology(node, compiled) { syncPort(node, compiled, 'timeline', 'socialTimeline', 'in'); },
    init: () => ({ jobs: {}, completed: 0, failed: 0, deliveries: 0 }), onRequest: admit,
    onServed(ctx, job) {
      const e = socialEnvelope(job);
      if (!e || e.kind !== 'fanout' || !validPost(e.post) || !Array.isArray(e.recipients) || e.recipients.length > MAX_USERS || e.recipients.some(id => typeof id !== 'string') || new Set(e.recipients).size !== e.recipients.length) { reject(ctx, job); return; }
      const row = ctx.k.jobs[job.id] = { post: clone(e.post), recipients: [...e.recipients], index: 0, pending: 0, error: null }; fanoutPump(ctx, job, row);
    },
    onResult(ctx, job, slot, result) { const row = own(ctx.k.jobs, job.id); if (!row) return; row.pending--; if (!result.ok) row.error ||= result.err || 'error'; else ctx.k.deliveries++; fanoutPump(ctx, job, row); },
    onFault(ctx, fault, active) { if (down(ctx, fault, active)) { ctx.k.failed += Object.keys(ctx.k.jobs).length; ctx.k.jobs = {}; } },
    observe: ctx => ({ detail: { 'Completed fanouts': ctx.k.completed, 'Failed fanouts': ctx.k.failed, 'Acknowledged recipient deliveries': ctx.k.deliveries, 'Active fanouts': Object.keys(ctx.k.jobs).length, Model: 'Bounded per-recipient writes; queue redelivery may repeat attempts, not timeline effects' }, records: { fanouts: clone(Object.values(ctx.k.jobs)) } })
  });
  registry.register({ id: 'socialTimeline', station: STATION,
    init: () => ({ entries: {}, duplicates: 0, reads: 0, writes: 0 }), onRequest: admit,
    onServed(ctx, job) {
      const e = socialEnvelope(job); if (!e || typeof e.userId !== 'string') { reject(ctx, job); return; }
      if (e.kind === 'feed') { ctx.k.reads++; socialReply(ctx, job, { posts: Object.values(ctx.k.entries).filter(r => r.userId === e.userId).map(r => clone(r.post)).sort(postOrder) }); return; }
      if (e.kind !== 'timeline' || !validPost(e.post)) { reject(ctx, job); return; }
      const id = keyOf(e.userId, e.post.id), old = own(ctx.k.entries, id);
      if (old) { if (JSON.stringify(old.post) !== JSON.stringify(e.post)) { reject(ctx, job); return; } ctx.k.duplicates++; ctx.effect(id, { idempotent: true }); }
      else { if (!bounded(ctx, Object.keys(ctx.k.entries).length)) { reject(ctx, job, 'rejected'); return; } ctx.k.entries[id] = { userId: e.userId, post: clone(e.post), deliveredAt: ctx.t }; ctx.k.writes++; ctx.effect(id, { idempotent: true }); ctx.latency('Fanout lag', Math.max(0, ctx.t - e.post.createdAt) * MS); }
      socialReply(ctx, job, { postId: e.post.id, userId: e.userId, duplicate: Boolean(old) });
    },
    observe: ctx => ({ detail: { 'Timeline entries': Object.keys(ctx.k.entries).length, 'Unique recipient writes': ctx.k.writes, 'Duplicate recipient attempts': ctx.k.duplicates, Reads: ctx.k.reads }, records: { entries: Object.values(ctx.k.entries).map(r => ({ userId: r.userId, postId: r.post.id, authorId: r.post.authorId, createdAt: r.post.createdAt, deliveredAt: r.deliveredAt })) } })
  });
  registry.register({ id: 'socialFeed', station: STATION,
    validateTopology(node, compiled) { syncPort(node, compiled, 'posts', 'socialStore', 'in'); syncPort(node, compiled, 'timeline', 'socialTimeline', 'in'); },
    init: () => ({ jobs: {}, reads: [], stale: 0, missing: 0 }), onRequest: admit,
    onServed(ctx, job) {
      ctx.release(job); const e = socialEnvelope(job); if (!e || e.kind !== 'feed' || typeof e.userId !== 'string') { reject(ctx, job); return; }
      if (!bounded(ctx, ctx.k.reads.length + Object.keys(ctx.k.jobs).length)) { reject(ctx, job, 'rejected'); return; }
      const row = ctx.k.jobs[job.id] = { userId: e.userId, pending: 0, error: null, expected: [], posts: [], snapshotAt: null };
      for (const port of ['posts', 'timeline']) { const edge = ctx.edges(port)[0]; if (!edge) { row.error = 'unavailable'; continue; } row.pending++; ctx.call(job, edge.id, {}, options(ctx, port)); }
      if (!row.pending) { delete ctx.k.jobs[job.id]; reject(ctx, job, row.error); }
    },
    onResult(ctx, job, slot, result) {
      const row = own(ctx.k.jobs, job.id); if (!row) return; row.pending--;
      if (!result.ok) row.error ||= result.err || 'error';
      else { const e = result.msg?.fields?.social; if (!e || !Array.isArray(e.posts)) row.error = 'invalid'; else { row.posts.push(...e.posts); if (slot === 'posts') { row.expected = e.expected; row.snapshotAt = e.snapshotAt; } } }
      if (row.pending) return;
      delete ctx.k.jobs[job.id]; if (row.error) { reject(ctx, job, row.error); return; }
      const expected = new Set(row.expected), posts = [...new Map(row.posts.filter(p => expected.has(p.id)).map(p => [p.id, p])).values()].sort(postOrder), visible = new Set(posts.map(p => p.id)), missing = row.expected.filter(id => !visible.has(id));
      const record = { requestId: job.msg.trace, userId: row.userId, t: ctx.t, snapshotAt: row.snapshotAt, postIds: posts.map(p => p.id), expectedPostIds: row.expected, missingPostIds: missing, stale: missing.length > 0 };
      ctx.k.reads.push(record); if (record.stale) ctx.k.stale++; ctx.k.missing += missing.length;
      socialReply(ctx, job, { posts, stale: record.stale, missingPostIds: missing });
    },
    onFault(ctx, fault, active) { if (down(ctx, fault, active)) ctx.k.jobs = {}; },
    observe: ctx => ({ detail: { 'Feed reads': ctx.k.reads.length, 'Stale feed reads': ctx.k.stale, 'Missing post observations': ctx.k.missing, 'Stale read fraction': ctx.k.reads.length ? ctx.k.stale / ctx.k.reads.length : 0, Model: 'Chronological feed; staleness compares with the post-store read snapshot, not a production consistency guarantee' }, records: { reads: clone(ctx.k.reads) } })
  });
});
