(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  const STATION = Object.freeze({ concurrency: 'concurrency', queueCapacity: 'queueCapacity' });
  function calls(ctx, job, edges, patch = {}, opts = {}) {
    job.data.aiCalls = { remaining: edges.length, error: null, patch };
    if (!edges.length) { ctx.reply(job, { ok: true, ...patch }); return; }
    for (let i = 0; i < edges.length; i++) { ctx.call(job, edges[i], patch, { timeoutMs: ctx.p.callTimeoutMs || 30000, retries: ctx.p.retries || 0, backoffMs: ctx.p.retryBackoffMs || 0, multiplier: ctx.p.backoffMultiplier || 2, jitter: ctx.p.retryJitter || false, slot: `ai-${i}`, ...opts }); if (ctx.edge(edges[i]).params.mode === 'async' || opts.async) callResult(ctx, job, `ai-${i}`, { ok: true }); }
  }
  function callResult(ctx, job, slot, result) {
    const data = job.data.aiCalls; if (!data) return;
    if (!result.ok) data.error ||= result.err || 'error';
    if (--data.remaining === 0) ctx.reply(job, data.error ? { ok: false, err: data.error } : { ok: true, ...data.patch });
  }
  function pumpBatch(ctx, flush = false) {
    const k = ctx.k;
    k.wait = k.wait.filter(id => { const job = ctx.getJob(id); return job && job.status !== 'finished'; });
    while (k.wait.length && k.running < ctx.p.workers && (flush || k.wait.length >= ctx.p.maxBatch)) {
      const ids = k.wait.splice(0, ctx.p.maxBatch), leader = ctx.getJob(ids[0]); if (!leader) continue;
      leader.data.batchIds = ids; k.running++; k.batches++; k.items += ids.length;
      ctx.count('batches', 1); ctx.count('batchItems', ids.length);
      const ms = (ctx.p.batchBaseMs + ctx.p.perItemMs * ids.length) * ctx.fault.slowFactor;
      if (ctx.admit(leader, ms)) ctx.wake(ms / 1000 + 1e-9, { kind: 'batch-monitor', leaderId: leader.id, generation: k.generation });
      else { leader.data.batchReleased = true; k.running--; for (const id of ids.slice(1)) { const job = ctx.getJob(id); if (job) ctx.reply(job, { ok: false, err: 'rejected' }); } }
    }
    if (k.wait.length && k.running < ctx.p.workers && !k.timer) { k.timer = true; ctx.wake(Math.max(ctx.p.batchWindowMs / 1000, 1e-6), { kind: 'batch', generation: k.generation }); }
  }
  registry.register({ id: 'batchWorker', station: { concurrency: 'workers', queueCapacity: 'queueCapacity' },
    init: () => ({ wait: [], running: 0, batches: 0, items: 0, timer: false, generation: 0 }),
    onRequest(ctx, job) {
      if (ctx.k.wait.length >= ctx.p.queueCapacity + ctx.p.maxBatch * Math.max(0, ctx.p.workers - ctx.k.running)) { ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      if (!ctx.hold(job)) return; ctx.k.wait.push(job.id); pumpBatch(ctx);
    },
    onWake(ctx, p) { if (p.kind === 'batch-monitor' && p.generation === ctx.k.generation) { const leader = ctx.getJob(p.leaderId); if (leader && !leader.data.batchReleased) { if (leader.status === 'finished') { leader.data.batchReleased = true; ctx.k.running--; for (const id of leader.data.batchIds) { const job = ctx.getJob(id); if (job && job.status !== 'finished') ctx.reply(job, { ok: false, err: 'error' }); } pumpBatch(ctx, true); } else ctx.wake(1, p); } } if (p.kind === 'batch' && p.generation === ctx.k.generation) { ctx.k.timer = false; pumpBatch(ctx, true); } },
    onServed(ctx, leader) {
      const ids = leader.data.batchIds; leader.data.batchReleased = true; ctx.release(leader); ctx.k.running--;
      for (const id of ids) { const job = ctx.getJob(id); if (job) { ctx.release(job); calls(ctx, job, ctx.edges('calls'), { kb: ctx.p.responseKb }); } }
      pumpBatch(ctx, ctx.k.timer === false);
    },
    onResult: callResult,
    onFault(ctx, fault, active) { if (['crash', 'outage'].includes(fault.type) && active) { ctx.k.generation++; ctx.k.timer = false; ctx.k.running = 0; for (const id of ctx.k.wait) { const job = ctx.getJob(id); if (job) ctx.reply(job, { ok: false, err: 'down' }); } ctx.k.wait = []; } },
    observe: ctx => ({ detail: { waiting: ctx.k.wait.length, activeBatches: ctx.k.running, batches: ctx.k.batches, meanBatch: ctx.k.batches ? ctx.k.items / ctx.k.batches : 0, model: 'windowed synthetic batch service' } })
  });
  registry.register({ id: 'llm', station: { concurrency: 'maxBatch', queueCapacity: 'queueCapacity' },
    init: () => ({ accepted: 0, generatedTokens: 0, quotaMinute: -1, quotaTokens: 0 }),
    onRequest(ctx, job) {
      const input = Math.max(0, job.msg.tokens || 0), output = Math.max(1, Math.round(ctx.p.outputTokensMean));
      if (input + output > ctx.p.contextWindow) { ctx.reply(job, { ok: false, err: 'invalid' }); return; }
      const minute = Math.floor(ctx.t / 60); if (ctx.k.quotaMinute !== minute) { ctx.k.quotaMinute = minute; ctx.k.quotaTokens = 0; }
      if (ctx.p.tokensPerMinute && ctx.k.quotaTokens + input + output > ctx.p.tokensPerMinute) { ctx.reply(job, { ok: false, err: 'rate-limited' }); return; }
      const active = Math.min(ctx.p.maxBatch, ctx.jobs().filter(j => j.data.llm).length + 1);
      job.data.llm = { output, round: 0 };
      const ms = (ctx.p.ttftMs + input * ctx.p.prefillMsPer1kTokens / 1000 + output * ctx.p.decodeMsPerToken * (1 + (active - 1) * ctx.p.batchSlowdown)) * ctx.fault.slowFactor;
      if (ctx.admit(job, ms)) { ctx.k.accepted++; ctx.k.quotaTokens += input + output; ctx.cost(input / 1000 * ctx.p.costPer1kInput + output / 1000 * ctx.p.costPer1kOutput); }
    },
    onServed(ctx, job) {
      const data = job.data.llm;
      if (data.round < ctx.p.toolRounds) {
        const edges = ctx.edges('tools'); if (edges.some(id => ctx.edge(id).params.mode === 'async')) { ctx.reply(job, { ok: false, err: 'invalid' }); return; } if (!edges.length) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
        data.round++; data.toolsLeft = edges.length; data.toolError = null;
        for (const edge of edges) ctx.call(job, edge, { ptype: 'json', tokens: data.output }, { timeoutMs: ctx.p.toolTimeoutMs, retries: 0, slot: `tool-${data.round}` });
        return;
      }
      ctx.k.generatedTokens += data.output; ctx.count('generatedTokens', data.output);
      ctx.reply(job, { ok: true, ptype: ctx.p.structuredOutput ? 'json' : 'text', tokens: data.output, kb: data.output * 4 / 1024, fields: { ...job.msg.fields, synthetic: true, invalid: ctx.p.structuredOutput && ctx.rand() < ctx.p.schemaFailureRate } });
    },
    onResult(ctx, job, slot, result) {
      const data = job.data.llm; if (!result.ok) data.toolError ||= result.err;
      if (--data.toolsLeft) return;
      if (data.toolError) { ctx.reply(job, { ok: false, err: data.toolError }); return; }
      ctx.release(job); ctx.admit(job, (ctx.p.ttftMs + data.output * ctx.p.decodeMsPerToken) * ctx.fault.slowFactor);
    },
    observe: ctx => ({ detail: { generatedTokens: ctx.k.generatedTokens, reservedMinuteTokens: ctx.k.quotaTokens, model: 'synthetic admission-time sequence slowdown; no real inference or dynamic KV cache' } })
  });
  registry.register({ id: 'retriever', station: STATION,
    onRequest: (ctx, job) => ctx.admit(job, ctx.p.serviceMs * ctx.fault.slowFactor),
    onServed(ctx, job) { job.data.rag = { step: 0 }; ragNext(ctx, job); },
    onResult(ctx, job, slot, result) { if (!result.ok) { ctx.reply(job, { ok: false, err: result.err }); return; } job.data.rag.last = result.msg; job.data.rag.step++; ragNext(ctx, job); },
    observe: () => ({ detail: { model: 'typed synthetic embed/search/rerank/generate calls; no retrieval-quality claim' } })
  });
  function ragNext(ctx, job) {
    const steps = ['embed', 'search', 'rerank', 'generate'], data = job.data.rag;
    if (data.step >= steps.length) { const msg = data.last || job.msg; ctx.reply(job, { ok: true, ptype: msg.ptype, tokens: msg.tokens, kb: msg.kb, fields: { ...msg.fields, synthetic: true } }); return; }
    const port = steps[data.step], edges = ctx.edges(port);
    if (!edges.length) { if (port === 'rerank') { data.step++; ragNext(ctx, job); } else ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
    const patch = port === 'embed' ? { ptype: 'text' } : port === 'search' ? { ptype: 'embedding', fields: { candidates: ctx.p.topK } } : port === 'rerank' ? { ptype: 'json', fields: { candidates: ctx.p.topK } } : { ptype: 'text', tokens: (job.msg.tokens || 0) + ctx.p.promptTokens + ctx.p.topK * ctx.p.chunkTokens };
    if (ctx.edge(edges[0]).params.mode === 'async') { ctx.reply(job, { ok: false, err: 'invalid' }); return; }
    ctx.call(job, edges[0], patch, { timeoutMs: ctx.p.callTimeoutMs, retries: ctx.p.retries, backoffMs: ctx.p.retryBackoffMs, slot: port });
  }
  registry.register({ id: 'structuredResponse', station: STATION,
    onRequest: (ctx, job) => ctx.admit(job, ctx.p.validateMs * ctx.fault.slowFactor),
    onServed(ctx, job) { job.data.repairs = 0; const edge = ctx.edges('generate')[0]; if (edge && ctx.edge(edge).params.mode === 'async') { ctx.reply(job, { ok: false, err: 'invalid' }); return; } if (edge) ctx.call(job, edge, { ptype: 'text' }, { timeoutMs: ctx.p.callTimeoutMs, retries: 0, slot: 'generate' }); else validateResponse(ctx, job, { ...job.msg, fields: { ...job.msg.fields, invalid: Boolean(job.msg.fields?.invalid) || ctx.rand() < ctx.p.parseFailureRate } }); },
    onResult(ctx, job, slot, result) { if (!result.ok) ctx.reply(job, { ok: false, err: result.err }); else validateResponse(ctx, job, result.msg); },
    observe: () => ({ detail: { model: 'declared schema-validity flag and synthetic repair, not JSON parsing or semantic extraction' } })
  });
  function validateResponse(ctx, job, msg) {
    if (msg.fields?.invalid) {
      const edge = ctx.edges('generate')[0];
      if (edge && job.data.repairs < ctx.p.maxRepairs) { job.data.repairs++; ctx.count('repairs', 1); ctx.call(job, edge, { ptype: 'text', fields: { ...job.msg.fields, repair: job.data.repairs } }, { timeoutMs: ctx.p.callTimeoutMs, retries: 0, slot: 'repair' }); }
      else ctx.reply(job, { ok: false, err: 'invalid' });
    } else ctx.reply(job, { ok: true, ptype: 'json', kb: ctx.p.responseKb, fields: { ...msg.fields, invalid: false, synthetic: true } });
  }
});
