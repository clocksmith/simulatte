(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  // AI, RAG and data kernels: batchWorker, llm, embedder, vectorIndex, retriever, reranker,
  // chunker, structuredResponse. They use only ctx; kernel state holds job ids (never job
  // objects), randomness comes from the node stream and time from ctx.t, so runs replay exactly.
  // The engine replies 'down' to every job of a crashed node; kernels only drop their records.

  const MS_PER_SEC = 1000;
  const KB_PER_TOKEN = 4 / 1024;          // synthetic text density: 4 bytes per token
  const TOKENS_PER_KB = 1 / KB_PER_TOKEN;  // tokens assumed for payloads that carry only kb
  const BYTES_PER_FLOAT = 4;               // embedding vectors are float32
  const OUTPUT_TOKENS_CV = 0.5;            // lognormal spread of sampled LLM output tokens
  const HIT_KB = 0.25;                     // per-hit id, score and metadata in a search reply
  const DEFAULT_RERANK_CANDIDATES = 10;    // candidates assumed when a request carries none (vector index topK default)
  const STEP_BACKOFF_MULTIPLIER = 2;       // retriever step retries
  const WORK_EPSILON_MS = 1e-6;            // processor-sharing completion tolerance
  const TIME_EPSILON_SEC = 1e-9;           // timer comparison tolerance

  const ms = value => value / MS_PER_SEC;
  const isAsync = edge => edge.params.mode === 'async';
  const tokensOf = msg => (msg && msg.tokens > 0 ? msg.tokens : Math.max(0, Math.round(((msg && msg.kb) || 0) * TOKENS_PER_KB)));
  const fieldsOf = msg => (msg && msg.fields) || {};
  const failed = (ctx, rate) => rate > 0 && ctx.rand() < rate;
  const isCrash = (ctx, fault, active) => fault.type === 'crash' && active && ctx.fault.down;
  const mean = (sum, n) => (n > 0 ? sum / n : 0);
  const round = (value, digits) => Number(value.toFixed(digits));
  const sum = values => values.reduce((a, b) => a + b, 0);
  // Non-station kernels apply the node's error fault themselves; stations get it from the engine.
  const servedError = (ctx, rate) => failed(ctx, rate) || failed(ctx, ctx.fault.errorRate);

  // ---- Per-request downstream calls (calls parameter set), as the core service kernel ----

  function startDownstream(ctx, job, replyPatch) {
    const p = ctx.p, plan = [];
    for (const edge of ctx.edges('calls')) {
      if (edge.params.probability < 1 && ctx.rand() >= edge.params.probability) continue;
      for (let i = 0; i < edge.params.callsPerRequest; i += 1) plan.push({ e: edge.id, a: isAsync(edge) });
    }
    if (!plan.length) { ctx.reply(job, { ok: true, ...replyPatch }); return; }
    if (!p.blockingCalls) ctx.release(job);
    const rec = { plan, i: 0, pending: 0, err: null, parallel: p.callMode === 'parallel', reply: replyPatch };
    ctx.k.calls[job.id] = rec;
    if (!rec.parallel) { nextDownstream(ctx, job, rec); return; }
    plan.forEach((step, i) => { if (issueDownstream(ctx, job, step, i)) rec.pending += 1; });
    if (!rec.pending) finishDownstream(ctx, job, rec);
  }

  function issueDownstream(ctx, job, step, i) {
    const p = ctx.p;
    if (step.a) { ctx.call(job, step.e, {}, { async: true }); return false; }
    return ctx.call(job, step.e, {}, { timeoutMs: p.callTimeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, multiplier: p.backoffMultiplier, jitter: p.retryJitter, slot: i }) !== null;
  }

  function nextDownstream(ctx, job, rec) {
    while (rec.i < rec.plan.length) {
      if (issueDownstream(ctx, job, rec.plan[rec.i], rec.i)) return;
      rec.i += 1;
    }
    finishDownstream(ctx, job, rec);
  }

  function finishDownstream(ctx, job, rec) {
    delete ctx.k.calls[job.id];
    ctx.reply(job, rec.err ? { ok: false, err: rec.err } : { ok: true, ...rec.reply });
  }

  function downstreamResult(ctx, job, result) {
    const rec = ctx.k.calls[job.id];
    if (!rec) return;
    if (!result.ok && !rec.err) rec.err = result.err;
    if (rec.parallel) { rec.pending -= 1; if (!rec.pending) finishDownstream(ctx, job, rec); return; }
    if (!result.ok) { finishDownstream(ctx, job, rec); return; }
    rec.i += 1;
    nextDownstream(ctx, job, rec);
  }

  // ---- Batching shared by batchWorker and embedder ----
  // Requests wait until maxBatch are queued or the oldest has waited batchWindowMs; a free
  // worker then serves up to maxBatch of them as one batch. Waiting slots are queueCapacity plus
  // one forming batch. A slowdown change rescales each batch's remaining time; stale batch and
  // window timers are fenced by generation, and timers from before a crash by epoch.

  function batchState() {
    return { queue: [], batches: {}, nextBatch: 0, busy: 0, windowAt: null, windowGen: 0, epoch: 0, batchesServed: 0, itemsServed: 0, calls: {} };
  }

  function batchArrive(ctx, job, spec) {
    const k = ctx.k, p = ctx.p;
    if (k.queue.length >= p.queueCapacity + p.maxBatch) { ctx.reply(job, { ok: false, err: 'rejected' }); return; }
    k.queue.push({ id: job.id, at: ctx.t });
    batchPump(ctx, spec);
  }

  function batchPump(ctx, spec) {
    const k = ctx.k, p = ctx.p;
    let resourceBlocked = false;
    while (k.busy < p.workers && k.queue.length) {
      const ready = k.queue.length >= p.maxBatch || ctx.t + TIME_EPSILON_SEC >= k.queue[0].at + ms(p.batchWindowMs);
      if (!ready) break;
      const id = `b${k.nextBatch}`;
      if (!ctx.acquireResource(id)) { resourceBlocked = true; break; }
      const ids = k.queue.splice(0, p.maxBatch).map(item => item.id);
      const baseMs = spec.batchMs(ctx, ids.map(id => ctx.job(id)).filter(Boolean)), factor = ctx.fault.slowFactor * ctx.memoryFactor();
      const wallMs = Number.isFinite(factor) ? baseMs * factor : null;
      k.nextBatch += 1;
      k.busy += 1;
      k.batches[id] = { ids, remainingMs: baseMs, lastT: ctx.t, factor: Number.isFinite(factor) ? factor : null, end: wallMs === null ? null : ctx.t + ms(wallMs), gen: 0 };
      if (wallMs !== null) ctx.wake(ms(wallMs), { kind: 'batch', id, gen: 0, epoch: k.epoch });
    }
    const deadline = k.queue.length ? k.queue[0].at + ms(p.batchWindowMs) : null;
    if (!resourceBlocked && deadline !== null && k.busy < p.workers && deadline !== k.windowAt) {
      k.windowAt = deadline;
      k.windowGen += 1;
      ctx.wake(Math.max(0, deadline - ctx.t), { kind: 'window', gen: k.windowGen, epoch: k.epoch });
    }
  }

  function batchWake(ctx, payload, spec) {
    const k = ctx.k;
    if (payload.epoch !== k.epoch) return;
    if (payload.kind === 'window') {
      if (payload.gen !== k.windowGen) return;
      k.windowAt = null;
      batchPump(ctx, spec);
      return;
    }
    const batch = k.batches[payload.id];
    if (payload.kind !== 'batch' || !batch || batch.gen !== payload.gen) return;
    delete k.batches[payload.id];
    k.busy -= 1;
    ctx.releaseResource(payload.id);
    k.batchesServed += 1;
    k.itemsServed += batch.ids.length;
    for (const id of batch.ids) { const job = ctx.job(id); if (job) spec.served(ctx, job); }
    batchPump(ctx, spec);
  }

  function batchRefresh(ctx) {
    const factor = ctx.fault.slowFactor * ctx.memoryFactor(), next = Number.isFinite(factor) ? factor : null;
    for (const id of Object.keys(ctx.k.batches)) {
      const batch = ctx.k.batches[id];
      if (batch.factor !== null) batch.remainingMs = Math.max(0, batch.remainingMs - (ctx.t - batch.lastT) * MS_PER_SEC / batch.factor);
      batch.lastT = ctx.t;
      if (batch.factor === next) continue;
      batch.factor = next; batch.gen++;
      batch.end = next === null ? null : ctx.t + ms(batch.remainingMs * next);
      if (batch.end !== null) ctx.wake(batch.end - ctx.t, { kind: 'batch', id, gen: batch.gen, epoch: ctx.k.epoch });
    }
  }

  function batchFault(ctx, fault, active, spec) {
    const k = ctx.k;
    if (isCrash(ctx, fault, active)) {
      k.epoch += 1;
      k.queue = []; k.batches = {}; k.busy = 0; k.calls = {}; k.windowAt = null;
      return;
    }
    batchRefresh(ctx); batchPump(ctx, spec);
  }

  function batchObserve(ctx, extra) {
    const k = ctx.k;
    return {
      queue: k.queue.length, busy: k.busy, capacity: ctx.p.workers, queueCapacity: ctx.p.queueCapacity,
      detail: { 'busy batches': `${k.busy}/${ctx.p.workers}`, batches: k.batchesServed, 'mean batch': round(mean(k.itemsServed, k.batchesServed), 1), ...extra },
    };
  }

  const BATCH_WORKER = {
    batchMs: (ctx, jobs) => ctx.p.batchBaseMs + ctx.p.perItemMs * jobs.length,
    served(ctx, job) {
      if (servedError(ctx, ctx.p.errorRate)) { ctx.reply(job, { ok: false, err: 'error' }); return; }
      startDownstream(ctx, job, { kb: ctx.p.responseKb });
    },
  };

  registry.register({
    id: 'batchWorker', resourceSlots: true,
    station: null,
    init: () => batchState(),
    onRequest: (ctx, job) => batchArrive(ctx, job, BATCH_WORKER),
    onWake: (ctx, payload) => batchWake(ctx, payload, BATCH_WORKER),
    onResources(ctx) { batchRefresh(ctx); batchPump(ctx, BATCH_WORKER); },
    onResult: (ctx, job, slot, result) => downstreamResult(ctx, job, result),
    onFault: (ctx, fault, active) => batchFault(ctx, fault, active, BATCH_WORKER),
    observe: ctx => batchObserve(ctx, { 'awaiting calls': Object.keys(ctx.k.calls).length }),
  });

  const EMBEDDER = {
    batchMs: (ctx, jobs) => ctx.p.batchBaseMs + ctx.p.perKTokensMs * sum(jobs.map(job => tokensOf(job.msg))) / 1000,
    served(ctx, job) {
      if (servedError(ctx, ctx.p.errorRate)) { ctx.reply(job, { ok: false, err: 'error' }); return; }
      ctx.k.embedded += 1;
      ctx.reply(job, { ok: true, ptype: 'embedding', kb: ctx.p.dims * BYTES_PER_FLOAT / 1024 });
    },
  };

  registry.register({
    id: 'embedder', resourceSlots: true,
    station: null,
    init: () => ({ ...batchState(), embedded: 0 }),
    onRequest: (ctx, job) => batchArrive(ctx, job, EMBEDDER),
    onWake: (ctx, payload) => batchWake(ctx, payload, EMBEDDER),
    onResources(ctx) { batchRefresh(ctx); batchPump(ctx, EMBEDDER); },
    onFault: (ctx, fault, active) => batchFault(ctx, fault, active, EMBEDDER),
    observe: ctx => batchObserve(ctx, { embedded: ctx.k.embedded }),
  });

  // ---- LLM: continuous batching as processor sharing ----
  // A generation's nominal work is ttftMs + prefillMsPer1kTokens * input / 1000 +
  // decodeMsPerToken * output, with output sampled lognormally around outputTokensMean. At most
  // maxBatch sequences are active and all progress at 1 / ((1 + batchSlowdown * (active - 1)) *
  // slowFactor). Whenever the active set or the rate changes, progress is settled at the old rate
  // and the next completion is rescheduled under a new generation; older wakes are ignored.
  // Input above contextWindow fails 'invalid'; each generation takes input + output tokens from
  // a tokensPerMinute bucket (capacity one minute) or fails 'rate-limited'. With tools edges a
  // sequence leaves the batch after each of toolRounds generations, calls every tools edge in
  // parallel, and re-enters ahead of the queue with tool results and its output as extra input.

  function llmState() {
    return { queue: [], active: [], seqs: {}, lastT: 0, rate: 0, gen: 0, epoch: 0, bucket: null, bucketT: 0,
      generated: 0, completed: 0, invalid: 0, rateLimited: 0, overflow: 0, costUsd: 0, toolCalls: 0 };
  }

  function llmRate(ctx) {
    const n = ctx.k.active.length;
    return n ? 1 / ((1 + ctx.p.batchSlowdown * (n - 1)) * ctx.fault.slowFactor * ctx.memoryFactor()) : 0;
  }

  function llmSettle(ctx) {
    const k = ctx.k, workMs = (ctx.t - k.lastT) * MS_PER_SEC * k.rate;
    if (workMs > 0) for (const id of k.active) k.seqs[id].work -= workMs;
    k.lastT = ctx.t;
  }

  function llmSchedule(ctx) {
    const k = ctx.k;
    while (k.active.length < ctx.p.maxBatch && k.queue.length) k.active.push(k.queue.shift());
    k.rate = llmRate(ctx);
    k.gen += 1;
    if (!k.active.length || k.rate <= 0) return;
    const minWork = Math.min(...k.active.map(id => k.seqs[id].work));
    ctx.wake(ms(Math.max(0, minWork) / k.rate), { kind: 'ps', gen: k.gen, epoch: k.epoch });
  }

  function llmTakeQuota(ctx, tokens) {
    const k = ctx.k, quota = ctx.p.tokensPerMinute;
    if (!(quota > 0)) return true;
    const level = k.bucket === null ? quota : Math.min(quota, k.bucket + (ctx.t - k.bucketT) * quota / 60);
    k.bucketT = ctx.t;
    k.bucket = level >= tokens ? level - tokens : level;
    return level >= tokens;
  }

  function llmFail(ctx, seq, job, err) {
    const k = ctx.k;
    delete k.seqs[seq.id];
    if (err === 'rate-limited') k.rateLimited += 1;
    if (err === 'invalid') k.overflow += 1;
    ctx.reply(job, { ok: false, err });
  }

  // Prepares the sequence's next generation; returns false after failing the request.
  function llmPrepare(ctx, seq, job) {
    const p = ctx.p;
    if (seq.input >= p.contextWindow) { llmFail(ctx, seq, job, 'invalid'); return false; }
    const sampled = Math.max(1, Math.round(ctx.lognormal(p.outputTokensMean, OUTPUT_TOKENS_CV)));
    seq.output = Math.max(1, Math.min(sampled, p.contextWindow - seq.input));
    if (!llmTakeQuota(ctx, seq.input + seq.output)) { llmFail(ctx, seq, job, 'rate-limited'); return false; }
    seq.work = p.ttftMs + p.prefillMsPer1kTokens * seq.input / 1000 + p.decodeMsPerToken * seq.output;
    return true;
  }

  function llmEnqueue(ctx, seq, front) {
    llmSettle(ctx);
    if (front) ctx.k.queue.unshift(seq.id); else ctx.k.queue.push(seq.id);
    llmSchedule(ctx);
  }

  function llmGenerated(ctx, seq) {
    const k = ctx.k, p = ctx.p, job = ctx.job(seq.id);
    const usd = seq.input / 1000 * p.costPer1kInput + seq.output / 1000 * p.costPer1kOutput;
    k.costUsd += usd;
    k.generated += seq.output;
    if (usd > 0) ctx.cost(usd);
    if (!job) { delete k.seqs[seq.id]; return; }
    const tools = ctx.edges('tools');
    if (seq.round < p.toolRounds && tools.length) { llmStartTools(ctx, seq, job, tools); return; }
    delete k.seqs[seq.id];
    if (servedError(ctx, p.errorRate)) { ctx.reply(job, { ok: false, err: 'error' }); return; }
    const invalid = p.structuredOutput && failed(ctx, p.schemaFailureRate);
    if (invalid) k.invalid += 1;
    k.completed += 1;
    ctx.reply(job, { ok: true, ptype: p.structuredOutput ? 'json' : 'text', tokens: seq.output, kb: seq.output * KB_PER_TOKEN, fields: { ...fieldsOf(job.msg), invalid } });
  }

  function llmStartTools(ctx, seq, job, tools) {
    seq.pending = 0; seq.toolErr = null; seq.toolTokens = 0;
    const patch = { ptype: 'json', tokens: seq.output, kb: seq.output * KB_PER_TOKEN };
    tools.forEach((edge, i) => {
      ctx.k.toolCalls += 1;
      const callId = ctx.call(job, edge.id, patch, { timeoutMs: ctx.p.toolTimeoutMs, retries: ctx.p.toolRetries, backoffMs: ctx.p.toolRetryBackoffMs, multiplier: STEP_BACKOFF_MULTIPLIER, jitter: false, slot: `tool:${seq.round}:${i}` });
      if (callId !== null) seq.pending += 1;
    });
    if (!seq.pending) llmToolsDone(ctx, seq, job);
  }

  function llmToolsDone(ctx, seq, job) {
    if (seq.toolErr) { llmFail(ctx, seq, job, seq.toolErr); return; }
    seq.input += seq.output + seq.toolTokens;
    seq.round += 1;
    if (llmPrepare(ctx, seq, job)) llmEnqueue(ctx, seq, true);
  }

  registry.register({
    id: 'llm',
    station: null,
    init: () => llmState(),
    onRequest(ctx, job) {
      const k = ctx.k, p = ctx.p;
      if (p.toolRounds > 0 && !ctx.edges('tools').length) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
      if (p.toolRounds > 0 && ctx.edges('tools').some(isAsync)) { ctx.reply(job, { ok: false, err: 'invalid' }); return; }
      if (k.active.length >= p.maxBatch && k.queue.length >= p.queueCapacity) { ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      const seq = { id: job.id, input: tokensOf(job.msg), output: 0, work: 0, round: 0, pending: 0, toolErr: null, toolTokens: 0 };
      k.seqs[job.id] = seq;
      if (llmPrepare(ctx, seq, job)) llmEnqueue(ctx, seq, false);
    },
    onWake(ctx, payload) {
      const k = ctx.k;
      if (payload.kind !== 'ps' || payload.epoch !== k.epoch || payload.gen !== k.gen) return;
      llmSettle(ctx);
      const done = k.active.filter(id => k.seqs[id].work <= WORK_EPSILON_MS);
      k.active = k.active.filter(id => k.seqs[id].work > WORK_EPSILON_MS);
      for (const id of done) llmGenerated(ctx, k.seqs[id]);
      llmSchedule(ctx);
    },
    onResult(ctx, job, slot, result) {
      const seq = ctx.k.seqs[job.id];
      if (!seq || !String(slot).startsWith(`tool:${seq.round}:`)) return;
      seq.pending -= 1;
      if (!result.ok && !seq.toolErr) seq.toolErr = result.err;
      if (result.ok) seq.toolTokens += tokensOf(result.msg);
      if (seq.pending === 0) llmToolsDone(ctx, seq, job);
    },
    onResources(ctx) { llmSettle(ctx); llmSchedule(ctx); },
    onFault(ctx, fault, active) {
      const k = ctx.k;
      llmSettle(ctx);
      if (isCrash(ctx, fault, active)) { k.epoch += 1; k.queue = []; k.active = []; k.seqs = {}; }
      llmSchedule(ctx);
    },
    observe(ctx) {
      const k = ctx.k, p = ctx.p;
      const tokensPerSec = p.decodeMsPerToken > 0 ? k.active.length * llmRate(ctx) * MS_PER_SEC / p.decodeMsPerToken : 0;
      const detail = { 'active sequences': `${k.active.length}/${p.maxBatch}`, 'tokens/s': round(tokensPerSec, 0), 'output tokens': k.generated, cost: `$${k.costUsd.toFixed(4)}` };
      if (p.structuredOutput) detail['invalid outputs'] = k.invalid;
      if (p.tokensPerMinute > 0) detail['rate limited'] = k.rateLimited;
      if (k.overflow) detail['context overflow'] = k.overflow;
      if (p.toolRounds > 0) detail['tool calls'] = k.toolCalls;
      return { queue: k.queue.length, busy: k.active.length, capacity: p.maxBatch, queueCapacity: p.queueCapacity, detail };
    },
  });

  // ---- Vector index ----
  // Reads (op 'read') take queryBaseMs + queryLogMs * log2(max(2, N)) and reply min(topK, N)
  // candidates with recall in fields; writes take upsertMs, commit an effect under the message
  // idempotency key and grow N by msg.fields.vectors (a positive integer) or 1.

  registry.register({
    id: 'vectorIndex',
    station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: ctx => ({ vectors: ctx.p.vectors, queries: 0, upserts: 0, pending: {}, pendingCount: 0, nextPublish: 0, lastPublish: 0, staleQueries: 0 }),
    onRequest(ctx, job) {
      const p = ctx.p;
      const timeMs = job.msg.op === 'write' ? p.upsertMs : p.queryBaseMs + p.queryLogMs * Math.log2(Math.max(2, ctx.k.vectors));
      ctx.admit(job, ctx.serviceMs(timeMs, 'constant', 0));
    },
    onServed(ctx, job) {
      const p = ctx.p, k = ctx.k, fields = fieldsOf(job.msg);
      if (failed(ctx, p.errorRate)) { ctx.reply(job, { ok: false, err: 'error' }); return; }
      if (job.msg.op === 'write') {
        if (p.visibilityDelayMs > 0 && k.pendingCount >= p.maxPendingUpserts) { ctx.reply(job, { ok: false, err: 'rejected' }); return; }
        const added = Number.isInteger(fields.vectors) && fields.vectors > 0 ? fields.vectors : 1;
        ctx.effect(job.msg.idem, { idempotent: false });
        k.upserts += 1;
        if (p.visibilityDelayMs > 0) { const seq = ++k.nextPublish; k.pending[seq] = added; k.pendingCount++; ctx.wake(ms(p.visibilityDelayMs), { kind: 'index-publish', seq }); }
        else { k.vectors += added; k.lastPublish = ctx.t; }
        ctx.reply(job, { ok: true, ptype: 'json', kb: HIT_KB, fields: { ...fields, vectors: added } });
        return;
      }
      k.queries += 1;
      const topK = Math.min(p.topK, k.vectors), indexAgeSec = Math.max(0, ctx.t - k.lastPublish), pending = k.pendingCount;
      const stale = pending > 0 || (p.maxAgeSec > 0 && indexAgeSec > p.maxAgeSec); if (stale) k.staleQueries++;
      ctx.reply(job, { ok: true, ptype: 'json', kb: topK * HIT_KB, fields: { ...fields, candidates: topK, recall: p.recall, stale, indexAgeSec, pendingUpserts: pending } });
    },
    onWake(ctx, payload) { if (payload.kind !== 'index-publish' || !Object.hasOwn(ctx.k.pending, payload.seq)) return; ctx.k.vectors += ctx.k.pending[payload.seq]; delete ctx.k.pending[payload.seq]; ctx.k.pendingCount--; ctx.k.lastPublish = ctx.t; },
    observe: ctx => ({ detail: { vectors: ctx.k.vectors, queries: ctx.k.queries, upserts: ctx.k.upserts, 'pending upserts': ctx.k.pendingCount, 'stale queries': ctx.k.staleQueries, 'last publish s': ctx.k.lastPublish } }),
  });

  // ---- Reranker ----
  // Service mean serviceMs + perCandidateMs * candidates + perKbMs * kb, sampled with
  // serviceDist. Candidates come from msg.fields.candidates, else DEFAULT_RERANK_CANDIDATES.

  function rerankCandidates(msg) {
    const value = fieldsOf(msg).candidates;
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_RERANK_CANDIDATES;
  }

  registry.register({
    id: 'reranker',
    station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: () => ({ reranked: 0, candidates: 0 }),
    onRequest(ctx, job) {
      const p = ctx.p;
      ctx.admit(job, ctx.serviceMs(p.serviceMs + p.perCandidateMs * rerankCandidates(job.msg) + p.perKbMs * (job.msg.kb || 0), p.serviceDist, p.serviceCv));
    },
    onServed(ctx, job) {
      const p = ctx.p, k = ctx.k, candidates = rerankCandidates(job.msg);
      if (failed(ctx, p.errorRate)) { ctx.reply(job, { ok: false, err: 'error' }); return; }
      k.reranked += 1;
      k.candidates += candidates;
      ctx.reply(job, { ok: true, ptype: 'json', kb: p.responseKb, fields: { ...fieldsOf(job.msg), candidates } });
    },
    observe: ctx => ({ detail: { reranked: ctx.k.reranked, 'mean candidates': round(mean(ctx.k.candidates, ctx.k.reranked), 1) } }),
  });

  // ---- RAG orchestrator ----
  // After serviceMs the request walks embed -> search -> rerank (when connected) -> generate,
  // one sync call at a time with callTimeoutMs, retries and retryBackoffMs, holding its worker.
  // The generate request carries promptTokens + topK * chunkTokens + question tokens. The first
  // failed step fails the request with that step's error; the reply is the generator's reply.

  const RAG_STEPS = Object.freeze(['embed', 'search', 'rerank', 'generate']);

  function ragPatch(ctx, rec, msg, step) {
    const p = ctx.p, last = rec.last || {};
    if (step === 'embed') return { ptype: 'text', op: 'read', tokens: tokensOf(msg) };
    if (step === 'search') return { ptype: 'embedding', op: 'read', kb: last.kb || 0, fields: { topK: p.topK } };
    if (step === 'rerank') return { ptype: 'json', op: 'read', kb: last.kb || 0, fields: { candidates: rec.candidates, stale: rec.stale } };
    const tokens = p.promptTokens + rec.candidates * p.chunkTokens + tokensOf(msg);
    return { ptype: 'text', op: 'read', tokens, kb: tokens * KB_PER_TOKEN, fields: { stale: rec.stale, contextCandidates: rec.candidates } };
  }

  function ragNext(ctx, job, rec) {
    const p = ctx.p;
    while (rec.step < RAG_STEPS.length) {
      const step = RAG_STEPS[rec.step], edge = ctx.edges(step)[0];
      rec.at = ctx.t;
      const opts = { timeoutMs: p.callTimeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, multiplier: STEP_BACKOFF_MULTIPLIER, jitter: true, slot: step };
      if (!edge && step === 'rerank') { rec.step++; continue; }
      if (!edge || isAsync(edge)) { delete ctx.k.jobs[job.id]; ctx.reply(job, { ok: false, err: edge ? 'invalid' : 'unavailable' }); return; }
      if (ctx.call(job, edge.id, ragPatch(ctx, rec, job.msg, step), opts) !== null) return;
      delete ctx.k.jobs[job.id]; ctx.reply(job, { ok: false, err: 'unavailable' }); return;
    }
    delete ctx.k.jobs[job.id];
    const last = rec.last || {};
    ctx.k.answered += 1;
    ctx.reply(job, { ok: true, ptype: last.ptype || 'text', tokens: last.tokens || 0, kb: last.kb || 0, fields: last.fields || {} });
  }

  registry.register({
    id: 'retriever',
    station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: () => ({ jobs: {}, steps: Object.fromEntries(RAG_STEPS.map(s => [s, { n: 0, sumMs: 0, failed: 0 }])), answered: 0 }),
    onRequest: (ctx, job) => { ctx.admit(job, ctx.serviceMs(ctx.p.serviceMs, 'constant', 0)); },
    onServed(ctx, job) {
      const rec = { step: 0, at: ctx.t, last: null, candidates: 0, stale: false };
      ctx.k.jobs[job.id] = rec;
      ragNext(ctx, job, rec);
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k, rec = k.jobs[job.id];
      if (!rec || RAG_STEPS[rec.step] !== slot) return;
      const stats = k.steps[slot];
      stats.n += 1;
      stats.sumMs += result.latencyMs;
      if (!result.ok) {
        stats.failed += 1;
        delete k.jobs[job.id];
        ctx.reply(job, { ok: false, err: result.err });
        return;
      }
      const msg = result.msg || {};
      if (slot === 'search') { rec.candidates = Math.max(0, Number.isFinite(fieldsOf(msg).candidates) ? fieldsOf(msg).candidates : 0); rec.stale = fieldsOf(msg).stale === true;
        if (rec.stale && ctx.p.rejectStaleResults) { delete k.jobs[job.id]; ctx.reply(job, { ok: false, err: 'unavailable' }); return; } }
      rec.last = { ptype: msg.ptype, kb: msg.kb, tokens: msg.tokens, fields: fieldsOf(msg), candidates: fieldsOf(msg).candidates };
      rec.step += 1;
      ragNext(ctx, job, rec);
    },
    onFault(ctx, fault, active) { if (isCrash(ctx, fault, active)) ctx.k.jobs = {}; },
    observe(ctx) {
      const k = ctx.k, detail = {};
      for (const step of RAG_STEPS) {
        const stats = k.steps[step];
        if (stats.n) detail[`${step} ms`] = round(mean(stats.sumMs, stats.n), 1);
        if (stats.failed) detail[`${step} failed`] = stats.failed;
      }
      detail.answered = k.answered;
      detail['in progress'] = Object.keys(k.jobs).length;
      return { detail };
    },
  });

  // ---- Document chunker ----
  // Parse time serviceMs + perKbMs * kb. tokens = msg.tokens, else kb * tokensPerKb; chunks =
  // min(maxChunks, ceil(tokens / max(1, chunkTokens - overlapTokens))), at least one. Every chunk
  // is a text write (idempotency key '<idem>:chunk-<i>') on every 'chunks' edge in call order.
  // Sync edges are awaited with the worker released; async edges fire and forget. Any failed
  // sync chunk fails the document with that chunk's error.

  function chunkPlan(ctx, msg) {
    const p = ctx.p;
    const tokens = msg.tokens > 0 ? msg.tokens : Math.round((msg.kb || 0) * p.tokensPerKb);
    const stride = Math.max(1, p.chunkTokens - p.overlapTokens);
    return { tokens, stride, n: Math.max(1, Math.min(p.maxChunks, Math.ceil(tokens / stride))) };
  }

  function chunkerReply(ctx, job, chunks) {
    ctx.reply(job, { ok: true, ptype: 'json', kb: chunks * HIT_KB, fields: { ...fieldsOf(job.msg), chunks } });
  }

  registry.register({
    id: 'chunker',
    station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: () => ({ jobs: {}, documents: 0, chunks: 0, failedDocuments: 0 }),
    onRequest(ctx, job) { ctx.admit(job, ctx.serviceMs(ctx.p.serviceMs + ctx.p.perKbMs * (job.msg.kb || 0), 'constant', 0)); },
    onServed(ctx, job) {
      const p = ctx.p, k = ctx.k, plan = chunkPlan(ctx, job.msg);
      const rec = { pending: 0, err: null, chunks: plan.n };
      k.jobs[job.id] = rec;
      for (const edge of ctx.edges('chunks')) {
        for (let i = 0; i < plan.n; i += 1) {
          const tokens = Math.max(1, Math.min(p.chunkTokens, plan.tokens - i * plan.stride));
          const patch = { ptype: 'text', op: 'write', tokens, kb: tokens / p.tokensPerKb, idem: `${job.msg.idem}:chunk-${i}`, fields: { chunk: i, chunks: plan.n } };
          if (ctx.call(job, edge.id, patch, { timeoutMs: p.callTimeoutMs, retries: 0, slot: i }) !== null) rec.pending += 1;
        }
      }
      k.documents += 1;
      k.chunks += plan.n;
      if (!rec.pending) { delete k.jobs[job.id]; chunkerReply(ctx, job, plan.n); return; }
      ctx.release(job);
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k, rec = k.jobs[job.id];
      if (!rec) return;
      rec.pending -= 1;
      if (!result.ok && !rec.err) rec.err = result.err;
      if (rec.pending > 0) return;
      delete k.jobs[job.id];
      if (rec.err) { k.failedDocuments += 1; ctx.reply(job, { ok: false, err: rec.err }); return; }
      chunkerReply(ctx, job, rec.chunks);
    },
    onFault(ctx, fault, active) { if (isCrash(ctx, fault, active)) ctx.k.jobs = {}; },
    observe(ctx) {
      const k = ctx.k;
      return { detail: { documents: k.documents, chunks: k.chunks, 'chunks/doc': round(mean(k.chunks, k.documents), 1), 'awaiting chunks': Object.keys(k.jobs).length, 'failed documents': k.failedDocuments } };
    },
  });

  // ---- Structured response ----
  // With a generator: call it (callTimeoutMs, no retries), validate for validateMs, and while the
  // reply has fields.invalid call again with the bad output appended (a repair) up to maxRepairs
  // times; still invalid -> 'invalid'. Without a generator: validate the input for validateMs
  // and fail with 'invalid' at parseFailureRate. Valid replies are json of responseKb.

  function structuredCall(ctx, job, rec) {
    const tokens = tokensOf(job.msg) + rec.lastTokens;
    const patch = { ptype: 'text', op: 'read', tokens, kb: tokens * KB_PER_TOKEN, fields: { repair: rec.repairs } };
    return ctx.call(job, ctx.edges('generate')[0].id, patch, { timeoutMs: ctx.p.callTimeoutMs, retries: 0, slot: rec.repairs }) !== null;
  }

  function structuredFinish(ctx, job, invalid, repairs) {
    const k = ctx.k;
    if (invalid) { k.invalid += 1; ctx.reply(job, { ok: false, err: 'invalid' }); return; }
    k.valid += 1;
    ctx.reply(job, { ok: true, ptype: 'json', kb: ctx.p.responseKb, fields: { ...fieldsOf(job.msg), invalid: false, repairs } });
  }

  registry.register({
    id: 'structuredResponse',
    station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: () => ({ jobs: {}, repairs: 0, invalid: 0, valid: 0, epoch: 0 }),
    onRequest(ctx, job) { ctx.admit(job, ctx.edges('generate').length ? 0 : ctx.serviceMs(ctx.p.validateMs, 'constant', 0)); },
    onServed(ctx, job) {
      if (!ctx.edges('generate').length) { structuredFinish(ctx, job, fieldsOf(job.msg).invalid === true || failed(ctx, ctx.p.parseFailureRate), 0); return; }
      if (isAsync(ctx.edges('generate')[0])) { ctx.reply(job, { ok: false, err: 'invalid' }); return; }
      const rec = { repairs: 0, lastTokens: 0, invalid: false };
      ctx.k.jobs[job.id] = rec;
      if (!structuredCall(ctx, job, rec)) { delete ctx.k.jobs[job.id]; ctx.reply(job, { ok: false, err: 'unavailable' }); }
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k, rec = k.jobs[job.id];
      if (!rec || slot !== rec.repairs) return;
      if (!result.ok) { delete k.jobs[job.id]; ctx.reply(job, { ok: false, err: result.err }); return; }
      rec.invalid = fieldsOf(result.msg).invalid === true;
      rec.lastTokens = tokensOf(result.msg);
      ctx.wake(ms(ctx.serviceMs(ctx.p.validateMs, 'constant', 0)), { kind: 'validate', jobId: job.id, repairs: rec.repairs, epoch: k.epoch });
    },
    onWake(ctx, payload) {
      const k = ctx.k, rec = k.jobs[payload.jobId], job = ctx.job(payload.jobId);
      if (payload.kind !== 'validate' || payload.epoch !== k.epoch || !rec || rec.repairs !== payload.repairs) return;
      if (!job) { delete k.jobs[payload.jobId]; return; }
      if (rec.invalid && rec.repairs < ctx.p.maxRepairs) {
        rec.repairs += 1;
        k.repairs += 1;
        structuredCall(ctx, job, rec);
        return;
      }
      delete k.jobs[payload.jobId];
      structuredFinish(ctx, job, rec.invalid, rec.repairs);
    },
    onFault(ctx, fault, active) { if (isCrash(ctx, fault, active)) { ctx.k.jobs = {}; ctx.k.epoch += 1; } },
    observe: ctx => ({ detail: { valid: ctx.k.valid, repairs: ctx.k.repairs, invalid: ctx.k.invalid, 'in progress': Object.keys(ctx.k.jobs).length } }),
  });
});
