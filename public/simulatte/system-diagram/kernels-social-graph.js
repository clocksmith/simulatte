(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  const BYTES_PER_KB = 1000, MAX_USERS = 128, MAX_RELATIONS = MAX_USERS * (MAX_USERS - 1);
  const clone = value => JSON.parse(JSON.stringify(value));
  const relationKey = row => JSON.stringify([row.followerId, row.authorId]);
  const validUser = value => typeof value === 'string' && value.length <= 128 && /^user-\d+$/.test(value);
  const reject = (ctx, job, err = 'invalid') => { ctx.k.rejected++; ctx.reply(job, { ok: false, err }); };
  function reply(ctx, job, value) {
    const social = { ...value, revision: ctx.k.revision, snapshotAt: ctx.t };
    ctx.reply(job, { ok: true, ptype: 'json', kb: ctx.p.responseKb + new TextEncoder().encode(JSON.stringify(social)).length / BYTES_PER_KB, fields: { social } });
  }
  function bootstrap(ctx, job, envelope) {
    const { users, follows } = envelope, k = ctx.k;
    if (!Array.isArray(users) || !users.length || users.length > MAX_USERS || new Set(users).size !== users.length || users.some(user => !validUser(user)) || !Array.isArray(follows) || follows.length > MAX_RELATIONS) { reject(ctx, job); return; }
    const known = new Set(users);
    if (follows.some(row => !row || !known.has(row.followerId) || !known.has(row.authorId) || row.followerId === row.authorId)) { reject(ctx, job); return; }
    const orderedUsers = [...users].sort(), relations = [...new Map(follows.map(row => [relationKey(row), { followerId: row.followerId, authorId: row.authorId }])).values()].sort((a, b) => relationKey(a).localeCompare(relationKey(b)));
    const signature = JSON.stringify([orderedUsers, relations]);
    if (k.bootstrapSignature !== null && k.bootstrapSignature !== signature) { reject(ctx, job); return; }
    if (k.bootstrapSignature !== null) k.duplicates++;
    else {
      if (orderedUsers.length + relations.length > ctx.p.maxRecords) { reject(ctx, job, 'rejected'); return; }
      k.users = orderedUsers; k.follows = relations; k.bootstrapSignature = signature; k.revision++; k.writes++;
    }
    reply(ctx, job, { kind: 'bootstrap', users: k.users.length, follows: k.follows.length });
  }
  registry.register({ id: 'socialGraph', station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: () => ({ users: [], follows: [], bootstrapSignature: null, revision: 0, reads: 0, writes: 0, duplicates: 0, rejected: 0, relationScans: 0 }),
    onRequest(ctx, job) {
      if (ctx.p.errorRate > 0 && ctx.rand() < ctx.p.errorRate) { reject(ctx, job, 'error'); return; }
      ctx.admit(job);
    },
    onServed(ctx, job) {
      const e = job.msg.fields?.social, k = ctx.k;
      if (!e || typeof e.kind !== 'string') { reject(ctx, job); return; }
      if (e.kind === 'bootstrap') { bootstrap(ctx, job, e); return; }
      if (['follow', 'unfollow'].includes(e.kind)) {
        if (!k.users.includes(e.followerId) || !k.users.includes(e.authorId) || e.followerId === e.authorId) { reject(ctx, job); return; }
        const index = k.follows.findIndex(row => row.followerId === e.followerId && row.authorId === e.authorId), adding = e.kind === 'follow';
        if (adding && index < 0) {
          if (k.users.length + k.follows.length >= ctx.p.maxRecords || k.follows.length >= MAX_RELATIONS) { reject(ctx, job, 'rejected'); return; }
          k.follows.push({ followerId: e.followerId, authorId: e.authorId }); k.revision++; k.writes++;
        } else if (!adding && index >= 0) { k.follows.splice(index, 1); k.revision++; k.writes++; }
        else k.duplicates++;
        reply(ctx, job, { kind: e.kind, followerId: e.followerId, authorId: e.authorId, following: adding }); return;
      }
      // Lookup cost and output are bounded by 128 users and 16,256 directed relations.
      if (e.kind === 'recipients' && k.users.includes(e.authorId)) {
        k.reads++; k.relationScans += k.follows.length;
        reply(ctx, job, { kind: 'recipients', authorId: e.authorId, recipients: k.follows.filter(row => row.authorId === e.authorId).map(row => row.followerId).sort() }); return;
      }
      if (e.kind === 'following' && k.users.includes(e.userId)) {
        k.reads++; k.relationScans += k.follows.length;
        reply(ctx, job, { kind: 'following', userId: e.userId, authorIds: k.follows.filter(row => row.followerId === e.userId).map(row => row.authorId).sort() }); return;
      }
      reject(ctx, job);
    },
    observe: ctx => ({
      detail: { Users: ctx.k.users.length, Follows: ctx.k.follows.length, Revision: ctx.k.revision, 'Graph reads': ctx.k.reads, 'Graph writes': ctx.k.writes, 'Duplicate mutations': ctx.k.duplicates, Rejected: ctx.k.rejected, 'Relation rows inspected': ctx.k.relationScans, Model: 'Durable bounded user identities and directed follow relations; lookups require this service and never synthesize recipients' },
      records: { users: ctx.k.users.map(userId => ({ userId })), follows: clone(ctx.k.follows) }
    })
  });
});
