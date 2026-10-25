(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  // Educational, finite application records. Identity is authored simulation input, not login.
  // All transport, service, failure and replay behavior belongs to the existing engine ctx.
  const MS = 1000, BYTES_PER_KB = 1000, TEXT_LIMIT = 2048, AUDIT_LIMIT = 256;
  const encoder = new TextEncoder();
  const STATION = Object.freeze({ concurrency: 'concurrency', queueCapacity: 'queueCapacity' });
  const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/;
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (map, key) => Object.hasOwn(map, key) ? map[key] : null;
  const isId = value => typeof value === 'string' && ID.test(value);
  const recordView = (detail, records) => ({ detail, records: clone(records) });
  const isText = value => typeof value === 'string' && value.length <= TEXT_LIMIT;
  const fields = job => job.msg.fields.application;
  // Network kb is decimal kilobytes (kb * 8 Kbit). Count the actual UTF-8 application
  // JSON body, including inherited request fields, but not engine-only trace metadata.
  const bodyKb = body => encoder.encode(JSON.stringify(body)).byteLength / BYTES_PER_KB;
  function respond(ctx, job, value, error = null) {
    const body = { ...job.msg.fields, applicationResult: clone(value) };
    ctx.reply(job, { ok: error === null, ...(error === null ? {} : { err: error }), ptype: 'json', kb: bodyKb(body), fields: body });
  }
  const reply = (ctx, job, value) => respond(ctx, job, value);
  function deny(ctx, job, reason, err = 'invalid') { ctx.count('refusals'); ctx.log('application-refused', reason); respond(ctx, job, { reason }, err); }
  function audit(ctx, event) { ctx.k.audit.push({ atSec: ctx.t, ...clone(event) }); if (ctx.k.audit.length > AUDIT_LIMIT) ctx.k.audit.shift(); }
  function command(job) {
    const c = fields(job);
    return c && typeof c === 'object' && !Array.isArray(c) && isId(c.commandId) && isId(c.userId) && typeof c.action === 'string' ? c : null;
  }
  function service(ctx, job) { if (ctx.p.errorRate > 0 && ctx.rand() < ctx.p.errorRate) { deny(ctx, job, 'Injected application service failure', 'error'); return; } ctx.admit(job); }
  function topology(node, compiled, ports) {
    for (const [port, kernels] of Object.entries(ports)) {
      const edges = compiled.edges.filter(e => e.from === node.id && e.fromPort === port);
      if (edges.length !== 1) throw Error(`${node.id}.${port} requires exactly one linked application peer`);
      const edge = edges[0], peer = compiled.nodes.find(n => n.id === edge.to);
      if (edge.params.mode !== 'sync' || !kernels.includes(peer.kernel)) throw Error(`${node.id}.${port} requires a synchronous ${kernels.join('|')} link`);
    }
  }
  function call(ctx, job, port, c, slot) {
    const edge = ctx.edges(port)[0];
    if (!edge) { deny(ctx, job, `Missing ${port} peer`, 'unavailable'); return false; }
    const body = { ...job.msg.fields, application: clone(c) };
    ctx.call(job, edge.id, { ptype: 'json', kb: bodyKb(body), fields: body }, { timeoutMs: ctx.p.callTimeoutMs, retries: ctx.p.retries, backoffMs: ctx.p.retryBackoffMs, slot });
    return true;
  }
  function failRoute(ctx, job, result) { delete ctx.k.routes[job.id]; respond(ctx, job, result.msg?.fields.applicationResult || { reason: 'Application dependency failed' }, result.err || 'error'); }
  function clearRoutes(ctx, fault, active) { if (fault.type === 'crash' && active) ctx.k.routes = {}; }
  function chatTrace() {
    const base = { userId: 'alice', conversationId: 'conversation-a' };
    const send = { ...base, action: 'send', commandId: 'prompt-one', messageId: 'message-one', content: 'Explain durable chat.' };
    return [send, { ...base, action: 'history', commandId: 'history-during-stream' }, clone(send),
      { ...base, action: 'history', commandId: 'reconnect-history' },
      { ...base, action: 'history', commandId: 'denied-history', userId: 'bob' },
      { ...base, action: 'send', commandId: 'prompt-two', messageId: 'message-two', content: 'Why keep messages?' },
      { userId: 'bob', conversationId: 'conversation-b', action: 'send', commandId: 'prompt-three', messageId: 'message-three', content: 'Hello from another tenant.' },
      { ...base, action: 'history', commandId: 'final-history' }];
  }
  function workspaceTrace() {
    const base = { userId: 'alice', workspaceId: 'workspace-a', projectId: 'project-a' };
    const create = { ...base, action: 'createTask', commandId: 'create-one', taskId: 'task-new', title: 'Review release' };
    return [create,
      { ...base, userId: 'ben', action: 'readTask', commandId: 'read-before-revoke', taskId: 'task-new' },
      { ...base, userId: 'ben', action: 'updateTask', commandId: 'edit-before-revoke', taskId: 'task-new', status: 'complete' },
      { ...base, action: 'revoke', commandId: 'revoke-ben', targetUserId: 'ben' },
      { ...base, userId: 'ben', action: 'readTask', commandId: 'read-after-revoke', taskId: 'task-new' },
      { ...base, action: 'grant', commandId: 'grant-viewer', targetUserId: 'ben', role: 'viewer' },
      { ...base, userId: 'ben', action: 'updateTask', commandId: 'viewer-edit', taskId: 'task-new', status: 'open' },
      { ...base, action: 'grant', commandId: 'grant-editor', targetUserId: 'ben', role: 'editor' },
      { ...base, userId: 'ben', action: 'updateTask', commandId: 'editor-edit', taskId: 'task-new', status: 'complete' },
      { ...base, userId: 'bob', action: 'readTask', commandId: 'other-tenant', taskId: 'task-new' },
      clone(create),
      { ...base, userId: 'ben', action: 'readTask', commandId: 'foreign-task', taskId: 'task-b' },
      { ...base, userId: 'ben', action: 'readProject', commandId: 'private-project', projectId: 'project-private' },
      { ...base, action: 'listProjects', commandId: 'list-projects' }];
  }
  registry.register({ id: 'applicationClient', station: null, immutableParams: ['scenario'],
    validateTopology(node, compiled) {
      topology(node, compiled, { out: node.params.scenario === 'chat' ? ['chatApplication'] : ['workspaceApplication'] });
      if (node.params.scenario === 'chat') {
        const outgoing = compiled.edges.find(e => e.from === node.id && e.fromPort === 'out');
        const chunks = compiled.edges.find(e => e.from === outgoing.to && e.fromPort === 'chunks');
        if (!chunks || chunks.to !== node.id) throw Error(`${node.id} requires chat chunks to return to the requesting client`);
      }
    },
    init: ctx => ({ script: ctx.p.scenario === 'chat' ? chatTrace() : workspaceTrace(), generated: 0, completed: 0, failed: 0, outstanding: {}, results: [], chunks: [], chunkKeys: {}, epoch: 0 }),
    start: ctx => ctx.wake(ctx.p.startSec, { epoch: 0 }),
    onWake(ctx, wake) {
      const k = ctx.k;
      if (wake.epoch !== k.epoch || ctx.fault.down || k.generated >= k.script.length) return;
      const c = clone(k.script[k.generated++]);
      const body = { application: c, synthetic: true };
      const msg = ctx.message({ ptype: 'json', kb: bodyKb(body), key: c.conversationId || c.workspaceId, op: 'write', fields: body });
      ctx.beginRequest(msg); const job = ctx.newJob(msg); k.outstanding[job.id] = c;
      call(ctx, job, 'out', c, 'application');
      if (k.generated < k.script.length) ctx.wake(ctx.p.intervalMs / MS, { epoch: k.epoch });
    },
    onRequest(ctx, job) {
      const c = fields(job), key = c && JSON.stringify([c.conversationId, c.messageId, c.cursor]);
      if (!c || c.action !== 'chunk' || !isId(c.conversationId) || !isId(c.messageId) || !Number.isInteger(c.cursor) || c.cursor < 0 || !isText(c.content)) { deny(ctx, job, 'Malformed stream chunk'); return; }
      if (!own(ctx.k.chunkKeys, key)) {
        if (ctx.k.chunks.length >= ctx.p.maxRecords) { deny(ctx, job, 'Client chunk capacity exhausted', 'rejected'); return; }
        ctx.k.chunkKeys[key] = c.content; ctx.k.chunks.push({ atSec: ctx.t, ...clone(c) }); ctx.log('chat-chunk', `${c.messageId} chunk at ${c.cursor}: ${c.content}`);
      } else if (ctx.k.chunkKeys[key] !== c.content) { deny(ctx, job, 'Stream cursor conflicts with an already delivered chunk'); return; } else ctx.count('duplicate chunks');
      reply(ctx, job, { received: true });
    },
    onResult(ctx, job, slot, result) {
      const c = own(ctx.k.outstanding, job.id); if (!c) return;
      delete ctx.k.outstanding[job.id]; ctx.k[result.ok ? 'completed' : 'failed']++;
      ctx.k.results.push({ atSec: ctx.t, command: clone(c), ok: result.ok, error: result.err || null, value: clone(result.msg?.fields.applicationResult || null) });
      ctx.endRequest(job.msg, { ok: result.ok, err: result.err }); ctx.reply(job, { ok: result.ok, err: result.err });
    },
    onFault(ctx, fault, active) {
      if (fault.type !== 'crash') return;
      ctx.k.epoch++;
      if (active) { ctx.k.failed += Object.keys(ctx.k.outstanding).length; ctx.k.outstanding = {}; }
      else if (!ctx.fault.down && ctx.k.generated < ctx.k.script.length) ctx.wake(ctx.p.intervalMs / MS, { epoch: ctx.k.epoch });
    },
    observe: ctx => recordView({ generated: ctx.k.generated, completed: ctx.k.completed, failed: ctx.k.failed, chunks: ctx.k.chunks.length, model: 'Authored identities and finite application commands; no real login or API calls' }, { script: ctx.k.script, results: ctx.k.results, chunks: ctx.k.chunks })
  });

  // Conversation writes persist actual content and fixed message identity, not just byte counts.
  registry.register({ id: 'conversationStore', station: STATION, onRequest: service,
    init: () => ({ users: [{ id: 'alice', tenantId: 'tenant-a' }, { id: 'bob', tenantId: 'tenant-b' }],
      conversations: [{ id: 'conversation-a', tenantId: 'tenant-a', ownerId: 'alice' }, { id: 'conversation-b', tenantId: 'tenant-b', ownerId: 'bob' }], messages: [], audit: [], writes: 0, duplicates: 0 }),
    onServed(ctx, job) {
      const c = command(job), k = ctx.k;
      const user = c && k.users.find(u => u.id === c.userId), conversation = c && k.conversations.find(row => row.id === c.conversationId);
      const allowed = Boolean(user && conversation && user.tenantId === conversation.tenantId && conversation.ownerId === user.id);
      audit(ctx, { action: c?.action || 'invalid', userId: c?.userId || null, conversationId: c?.conversationId || null, allowed });
      if (!allowed) { deny(ctx, job, 'Conversation access denied'); return; }
      if (c.action === 'check') { reply(ctx, job, { allowed, conversation: clone(conversation) }); return; }
      if (c.action === 'history') { reply(ctx, job, { conversationId: conversation.id, messages: k.messages.filter(m => m.conversationId === conversation.id).map(clone) }); return; }
      if (c.action !== 'append' || !isId(c.messageId) || !['user', 'assistant'].includes(c.role) || !isText(c.content) || !c.content.length) { deny(ctx, job, 'Malformed conversation write'); return; }
      const recordId = `${c.role}:${c.messageId}`;
      const old = k.messages.find(m => m.conversationId === conversation.id && m.id === recordId);
      const prompt = k.messages.find(m => m.conversationId === conversation.id && m.role === 'user' && m.messageId === c.messageId);
      if (c.role === 'assistant' && !prompt) { deny(ctx, job, 'Assistant write requires its committed user prompt'); return; }
      if (old) {
        if (old.role !== c.role || old.content !== c.content || old.authorId !== (c.role === 'user' ? user.id : 'synthetic-assistant')) { deny(ctx, job, 'Message identity conflicts with committed content'); return; }
        k.duplicates++; reply(ctx, job, { duplicate: true, message: old }); return;
      }
      if (k.messages.length >= ctx.p.maxRecords) { deny(ctx, job, 'Conversation record capacity exhausted', 'rejected'); return; }
      const message = { id: recordId, messageId: c.messageId, replyToMessageId: c.role === 'assistant' ? c.messageId : null, conversationId: conversation.id, tenantId: conversation.tenantId, authorId: c.role === 'user' ? user.id : 'synthetic-assistant', role: c.role, content: c.content, sequence: k.messages.filter(m => m.conversationId === conversation.id).length + 1, committedAtSec: ctx.t };
      k.messages.push(message); k.writes++; ctx.effect(`${conversation.id}:${message.id}`, { idempotent: true }); reply(ctx, job, { duplicate: false, message });
    },
    observe: ctx => recordView({ messages: ctx.k.messages.length, writes: ctx.k.writes, duplicates: ctx.k.duplicates, durability: 'Simulation state survives node crash and JSON checkpoints; no external database' }, { users: ctx.k.users, conversations: ctx.k.conversations, messages: ctx.k.messages, audit: ctx.k.audit })
  });

  registry.register({ id: 'syntheticStream', station: STATION, immutableParams: ['chunkCharacters'],
    init: () => ({ chunks: 0, audit: [] }),
    onRequest(ctx, job) {
      const c = command(job);
      if (!c || c.action !== 'generate' || !isText(c.content) || c.content.length > 512 || !Number.isInteger(c.historyCount) || c.historyCount < 0 || c.historyCount > 10000 || !Number.isInteger(c.cursor) || c.cursor < 0 || c.cursor > TEXT_LIMIT) { deny(ctx, job, 'Malformed synthetic generation request'); return; }
      ctx.admit(job, ctx.p.chunkDelayMs * ctx.fault.slowFactor);
    },
    onServed(ctx, job) {
      const c = fields(job);
      if (ctx.p.failAfterChunks > 0 && c.cursor >= ctx.p.failAfterChunks * ctx.p.chunkCharacters) { deny(ctx, job, 'Injected synthetic generation failure', 'error'); return; }
      const text = `Synthetic reply: ${c.content} Prior messages: ${c.historyCount}.`;
      if (c.cursor > text.length) { deny(ctx, job, 'Stream cursor exceeds generated content'); return; }
      const content = text.slice(c.cursor, c.cursor + ctx.p.chunkCharacters), nextCursor = c.cursor + content.length;
      ctx.k.chunks++; audit(ctx, { messageId: c.messageId, cursor: c.cursor, content });
      reply(ctx, job, { content, cursor: c.cursor, nextCursor, done: nextCursor === text.length });
    },
    observe: ctx => recordView({ chunks: ctx.k.chunks, model: 'Deterministic synthetic text, not model inference or provider performance' }, { generatedChunks: ctx.k.audit })
  });

  function chatNext(ctx, job, slot, value) {
    const r = ctx.k.routes[job.id], c = r.command;
    if (slot === 'check') { call(ctx, job, 'store', { ...c, action: 'history' }, 'history'); return; }
    if (slot === 'history') {
      if (c.action === 'history') { delete ctx.k.routes[job.id]; reply(ctx, job, value); return; }
      const prompt = value.messages.find(m => m.id === `user:${c.messageId}`), assistant = value.messages.find(m => m.id === `assistant:${c.messageId}`);
      if (prompt && (prompt.role !== 'user' || prompt.messageId !== c.messageId || prompt.content !== c.content)) { delete ctx.k.routes[job.id]; deny(ctx, job, 'Prompt identity conflicts with stored content'); return; }
      if (assistant) {
        delete ctx.k.routes[job.id];
        if (!prompt || assistant.role !== 'assistant' || assistant.messageId !== c.messageId || assistant.replyToMessageId !== prompt.messageId) { deny(ctx, job, 'Assistant identity is not bound to its committed prompt'); return; }
        reply(ctx, job, { duplicate: true, message: assistant }); return;
      }
      // Original sequence fixes the generation context across crash recovery and duplicate retries.
      r.historyCount = prompt ? prompt.sequence - 1 : value.messages.length;
      call(ctx, job, 'store', { ...c, action: 'append', role: 'user' }, 'prompt'); return;
    }
    if (slot === 'prompt' || slot === 'chunkDelivered') {
      if (slot === 'prompt') r.historyCount = value.message.sequence - 1;
      if (r.done) { call(ctx, job, 'store', { ...c, action: 'append', messageId: c.messageId, role: 'assistant', content: r.content }, 'assistant'); return; }
      call(ctx, job, 'generate', { ...c, action: 'generate', cursor: r.cursor, historyCount: r.historyCount }, 'generated'); return;
    }
    if (slot === 'generated') {
      if (!value || value.cursor !== r.cursor || !isText(value.content) || !value.content.length || value.nextCursor !== r.cursor + value.content.length || typeof value.done !== 'boolean' || r.content.length + value.content.length > TEXT_LIMIT) { delete ctx.k.routes[job.id]; deny(ctx, job, 'Invalid or non-progressing stream cursor'); return; }
      r.content += value.content; r.cursor = value.nextCursor; r.done = value.done; ctx.k.chunks++;
      call(ctx, job, 'chunks', { ...c, action: 'chunk', messageId: `assistant:${c.messageId}`, cursor: value.cursor, content: value.content }, 'chunkDelivered'); return;
    }
    if (slot === 'assistant') { ctx.k.completed++; delete ctx.k.routes[job.id]; reply(ctx, job, value); }
  }
  registry.register({ id: 'chatApplication', station: null,
    validateTopology: (node, compiled) => topology(node, compiled, { store: ['conversationStore'], generate: ['syntheticStream'], chunks: ['applicationClient'] }),
    init: () => ({ routes: {}, completed: 0, chunks: 0 }),
    onRequest(ctx, job) {
      const c = command(job);
      if (!c || !['send', 'history'].includes(c.action) || !isId(c.conversationId) || (c.action === 'send' && (!isId(c.messageId) || c.messageId.length > 80 || !isText(c.content) || !c.content.length || c.content.length > 512))) { deny(ctx, job, 'Malformed chat command'); return; }
      if (Object.keys(ctx.k.routes).length >= ctx.p.maxOutstanding) { deny(ctx, job, 'Chat in-flight capacity exhausted', 'rejected'); return; }
      ctx.k.routes[job.id] = { command: clone(c), content: '', cursor: 0, done: false, historyCount: 0 };
      call(ctx, job, 'store', { ...c, action: 'check' }, 'check');
    },
    onResult(ctx, job, slot, result) { if (!own(ctx.k.routes, job.id)) return; if (!result.ok) failRoute(ctx, job, result); else chatNext(ctx, job, slot, result.msg.fields.applicationResult); },
    onFault: clearRoutes,
    observe: ctx => recordView({ pending: Object.keys(ctx.k.routes).length, completed: ctx.k.completed, chunks: ctx.k.chunks }, { pending: Object.values(ctx.k.routes) })
  });

  function workspaceSeed() {
    return { users: [{ id: 'alice', tenantId: 'tenant-a' }, { id: 'ben', tenantId: 'tenant-a' }, { id: 'bob', tenantId: 'tenant-b' }],
      workspaces: [{ id: 'workspace-a', tenantId: 'tenant-a', ownerId: 'alice', version: 1 }, { id: 'workspace-b', tenantId: 'tenant-b', ownerId: 'bob', version: 1 }],
      memberships: [{ workspaceId: 'workspace-a', userId: 'alice', role: 'owner' }, { workspaceId: 'workspace-a', userId: 'ben', role: 'editor' }, { workspaceId: 'workspace-b', userId: 'bob', role: 'owner' }],
      projects: [{ id: 'project-a', workspaceId: 'workspace-a', title: 'Launch', visibility: 'workspace', memberIds: ['alice', 'ben'] }, { id: 'project-private', workspaceId: 'workspace-a', title: 'Private planning', visibility: 'private', memberIds: ['alice'] }, { id: 'project-b', workspaceId: 'workspace-b', title: 'Other tenant', visibility: 'workspace', memberIds: ['bob'] }],
      tasks: [{ id: 'task-b', projectId: 'project-b', workspaceId: 'workspace-b', title: 'Other tenant task', status: 'open', createdBy: 'bob' }], mutations: {}, audit: [], staleRejected: 0, staleAllowed: 0, duplicates: 0 };
  }
  function workspaceScope(k, c) {
    const user = k.users.find(u => u.id === c.userId), workspace = k.workspaces.find(w => w.id === c.workspaceId);
    const project = k.projects.find(p => p.id === c.projectId), task = k.tasks.find(t => t.id === c.taskId);
    if (!user || !workspace || user.tenantId !== workspace.tenantId) return { reason: 'User and workspace tenant mismatch' };
    if (c.action !== 'listProjects' && (!project || project.workspaceId !== workspace.id)) return { reason: 'Project does not belong to requested workspace' };
    if (['readTask', 'updateTask'].includes(c.action) && (!task || task.workspaceId !== workspace.id || task.projectId !== project.id)) return { reason: 'Task does not belong to requested project and workspace' };
    return { user, workspace, project, task };
  }
  function permits(k, c, role, scope) {
    if (scope.reason || !['owner', 'editor', 'viewer'].includes(role)) return false;
    if (scope.project?.visibility === 'private' && !scope.project.memberIds.includes(c.userId)) return false;
    if (['grant', 'revoke'].includes(c.action)) return role === 'owner';
    if (['createTask', 'updateTask'].includes(c.action)) return role === 'owner' || role === 'editor';
    return ['readTask', 'readProject', 'listProjects'].includes(c.action);
  }
  const permissionKey = c => JSON.stringify([c.userId, c.workspaceId, c.projectId || null, c.taskId || null, c.action]);
  function decision(k, c) {
    const scope = workspaceScope(k, c), role = k.memberships.find(m => m.workspaceId === c.workspaceId && m.userId === c.userId)?.role || 'none';
    return { key: permissionKey(c), allowed: permits(k, c, role, scope), role, version: scope.workspace?.version || 0, reason: scope.reason || 'Workspace and project role policy' };
  }
  function workspaceCommand(c) {
    return c && isId(c.workspaceId) && ['readTask', 'readProject', 'listProjects', 'createTask', 'updateTask', 'grant', 'revoke'].includes(c.action)
      && (c.action === 'listProjects' || isId(c.projectId))
      && (!['readTask', 'createTask', 'updateTask'].includes(c.action) || isId(c.taskId))
      && (c.action !== 'createTask' || (isText(c.title) && c.title.length > 0 && c.title.length <= 256))
      && (c.action !== 'updateTask' || ['open', 'complete'].includes(c.status))
      && (!['grant', 'revoke'].includes(c.action) || isId(c.targetUserId))
      && (c.action !== 'grant' || ['viewer', 'editor'].includes(c.role));
  }
  registry.register({ id: 'workspaceStore', station: STATION, onRequest: service,
    init: workspaceSeed,
    onServed(ctx, job) {
      const request = command(job), c = request?.action === 'authorize' ? request.command : request;
      if (!c || !isId(c.commandId) || !isId(c.userId) || !workspaceCommand(c)) { deny(ctx, job, 'Malformed workspace command'); return; }
      const k = ctx.k, current = decision(k, c), scope = workspaceScope(k, c);
      if (request.action === 'authorize') { audit(ctx, { action: 'authorize', commandId: c.commandId, ...current }); reply(ctx, job, current); return; }
      const supplied = request.authorization;
      // Tenant, object ownership and private-project boundaries never trust a cached grant.
      const stale = supplied && supplied.version !== scope.workspace?.version;
      const authorization = ctx.p.authorizationMode === 'current' ? current : supplied;
      const allowed = !scope.reason && authorization && authorization.key === permissionKey(c) && authorization.allowed === true && permits(k, c, authorization.role, scope);
      if (!allowed) { if (stale) k.staleRejected++; audit(ctx, { action: c.action, commandId: c.commandId, allowed: false, stale: Boolean(stale) }); deny(ctx, job, scope.reason || 'Workspace permission denied'); return; }
      if (stale && !current.allowed) k.staleAllowed++;
      audit(ctx, { action: c.action, commandId: c.commandId, allowed: true, stale: Boolean(stale), authorizationMode: ctx.p.authorizationMode });
      if (c.action === 'readTask') { reply(ctx, job, { task: scope.task }); return; }
      if (c.action === 'readProject') { reply(ctx, job, { project: scope.project, tasks: k.tasks.filter(t => t.projectId === scope.project.id) }); return; }
      if (c.action === 'listProjects') { reply(ctx, job, { projects: k.projects.filter(p => p.workspaceId === c.workspaceId && (p.visibility === 'workspace' || p.memberIds.includes(c.userId))) }); return; }
      const mutationKey = JSON.stringify([c.workspaceId, c.commandId]), clean = clone(c); delete clean.authorization;
      const fingerprint = JSON.stringify(Object.keys(clean).sort().map(key => [key, clean[key]])), prior = own(k.mutations, mutationKey);
      if (prior) { if (prior.fingerprint !== fingerprint) { deny(ctx, job, 'Command identity conflicts with committed mutation'); return; } k.duplicates++; reply(ctx, job, { ...prior.value, duplicate: true }); return; }
      if (Object.keys(k.mutations).length >= ctx.p.maxRecords || (c.action === 'createTask' && k.tasks.length >= ctx.p.maxRecords)) { deny(ctx, job, 'Workspace record capacity exhausted', 'rejected'); return; }
      let value;
      if (c.action === 'createTask') {
        if (k.tasks.some(t => t.id === c.taskId)) { deny(ctx, job, 'Task identity already exists'); return; }
        const task = { id: c.taskId, workspaceId: c.workspaceId, projectId: c.projectId, title: c.title, status: 'open', createdBy: c.userId };
        k.tasks.push(task); value = { task: clone(task) };
      } else if (c.action === 'updateTask') { scope.task.status = c.status; value = { task: clone(scope.task) }; }
      else {
        const target = k.users.find(u => u.id === c.targetUserId);
        if (!target || target.tenantId !== scope.workspace.tenantId || scope.workspace.ownerId === target.id) { deny(ctx, job, 'Membership target must be a non-owner in the same tenant'); return; }
        k.memberships = k.memberships.filter(m => !(m.workspaceId === c.workspaceId && m.userId === c.targetUserId));
        if (c.action === 'grant') k.memberships.push({ workspaceId: c.workspaceId, userId: c.targetUserId, role: c.role });
        scope.workspace.version++; value = { workspaceId: c.workspaceId, userId: c.targetUserId, role: c.action === 'grant' ? c.role : 'none', version: scope.workspace.version };
      }
      k.mutations[mutationKey] = { fingerprint, value: clone(value) }; ctx.effect(mutationKey, { idempotent: true }); reply(ctx, job, value);
    },
    observe: ctx => recordView({ tasks: ctx.k.tasks.length, memberships: ctx.k.memberships.length, 'stale grants rejected': ctx.k.staleRejected, 'unsafe stale grants used': ctx.k.staleAllowed, duplicates: ctx.k.duplicates, model: ctx.p.authorizationMode === 'current' ? 'Authoritative simulation role checks on every operation' : 'Intentionally unsafe stale-grant experiment; never production authorization' }, { users: ctx.k.users, workspaces: ctx.k.workspaces, memberships: ctx.k.memberships, projects: ctx.k.projects, tasks: ctx.k.tasks, audit: ctx.k.audit })
  });

  registry.register({ id: 'permissionCache', station: null,
    validateTopology: (node, compiled) => topology(node, compiled, { store: ['workspaceStore'] }),
    init: () => ({ entries: {}, routes: {}, hits: 0, misses: 0 }),
    onRequest(ctx, job) {
      const c = command(job);
      if (!workspaceCommand(c)) { deny(ctx, job, 'Malformed permission request'); return; }
      const key = permissionKey(c), cached = own(ctx.k.entries, key);
      if (cached && cached.expiresAtSec > ctx.t) { ctx.k.hits++; reply(ctx, job, cached.decision); return; }
      if (Object.keys(ctx.k.routes).length >= ctx.p.maxOutstanding) { deny(ctx, job, 'Permission in-flight capacity exhausted', 'rejected'); return; }
      ctx.k.misses++; ctx.k.routes[job.id] = key;
      call(ctx, job, 'store', { ...c, action: 'authorize', command: clone(c) }, 'authorization');
    },
    onResult(ctx, job, slot, result) {
      const key = own(ctx.k.routes, job.id); if (!key) return; delete ctx.k.routes[job.id];
      if (!result.ok) { failRoute(ctx, job, result); return; }
      const value = result.msg.fields.applicationResult;
      if (ctx.p.ttlMs > 0) {
        if (!own(ctx.k.entries, key) && Object.keys(ctx.k.entries).length >= ctx.p.maxRecords) delete ctx.k.entries[Object.keys(ctx.k.entries)[0]];
        ctx.k.entries[key] = { expiresAtSec: ctx.t + ctx.p.ttlMs / MS, decision: clone(value) };
      }
      reply(ctx, job, value);
    },
    onFault(ctx, fault, active) { if (fault.type === 'crash' && active) { ctx.k.routes = {}; ctx.k.entries = {}; } },
    observe: ctx => recordView({ hits: ctx.k.hits, misses: ctx.k.misses, entries: Object.keys(ctx.k.entries).length }, { cachedDecisions: Object.values(ctx.k.entries) })
  });
  registry.register({ id: 'workspaceApplication', station: null,
    validateTopology(node, compiled) {
      topology(node, compiled, { permissions: ['permissionCache'], store: ['workspaceStore'] });
      const direct = compiled.edges.find(e => e.from === node.id && e.fromPort === 'store');
      const cache = compiled.edges.find(e => e.from === node.id && e.fromPort === 'permissions');
      const backing = compiled.edges.find(e => e.from === cache.to && e.fromPort === 'store');
      if (!backing || backing.to !== direct.to) throw Error(`${node.id} permissions and operations must use the same workspace store`);
    },
    init: () => ({ routes: {}, allowed: 0, denied: 0 }),
    onRequest(ctx, job) {
      const c = command(job);
      if (!workspaceCommand(c)) { deny(ctx, job, 'Malformed workspace request'); return; }
      if (Object.keys(ctx.k.routes).length >= ctx.p.maxOutstanding) { deny(ctx, job, 'Workspace in-flight capacity exhausted', 'rejected'); return; }
      ctx.k.routes[job.id] = clone(c); call(ctx, job, 'permissions', c, 'permission');
    },
    onResult(ctx, job, slot, result) {
      const c = own(ctx.k.routes, job.id); if (!c) return;
      if (!result.ok) { ctx.k.denied++; failRoute(ctx, job, result); return; }
      const value = result.msg.fields.applicationResult;
      if (slot === 'permission') {
        if (!value.allowed) { ctx.k.denied++; delete ctx.k.routes[job.id]; deny(ctx, job, value.reason || 'Permission denied'); return; }
        call(ctx, job, 'store', { ...c, authorization: value }, 'operation'); return;
      }
      ctx.k.allowed++; delete ctx.k.routes[job.id]; reply(ctx, job, value);
    },
    onFault: clearRoutes,
    observe: ctx => recordView({ allowed: ctx.k.allowed, denied: ctx.k.denied, pending: Object.keys(ctx.k.routes).length }, { pending: Object.values(ctx.k.routes) })
  });
});
